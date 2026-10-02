"""
Shared steps for deploying a validated commit to GitHub Pages
"""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
import json
import os
from pathlib import Path
import shlex

from ..gh_state import REPO, PullRequestEvaluation, get_github_api
from ..output import emit_error, emit_warning, log_group, print_info_line, print_info_multi
from ..utils import run, temporary_worktree

REPO_ROOT = Path(__file__).parent.parent.parent.parent


@dataclass(kw_only=True)
class DeploySite:
    remote: str
    run_url: str
    deploy_dir: Path
    deploy_revision_info: Path
    dry_run: bool


def fetch_deploy_branch(remote: str) -> None:
    # TODO: avoid full-depth fetch here; see prepare_deploy_commit
    run(
        [
            "git",
            "fetch",
            "--no-tags",
            "--",
            remote,
            f"+refs/heads/master:refs/remotes/{remote}/master",
        ]
    )


@log_group("Prepare deploy")
def prepare_deploy_commit(
    site: DeploySite, push_sha: str, source_description: str | None, trigger: str
) -> tuple[str, str]:
    """Create the deploy commit on a local master branch and tag it.

    Return the deploy number and tag name.
    """
    # Get the number of commits there will be on the deploy branch; this will give us a
    # monotonically increasing deploy number (up to history rewrites and deploy branch changes).
    #
    # Note that we do a non-shallow fetch of master in fetch_deploy_branch to ensure this works.
    deploy_number = str(
        len(run(["git", "rev-list", f"refs/remotes/{site.remote}/master"]).splitlines()) + 1
    )

    deploy_description = (
        deploy_number
        if source_description is None
        else f"{deploy_number} from {source_description}"
    )

    with temporary_worktree(
        f"refs/remotes/{site.remote}/master", args=["--no-checkout", "-B", "master"]
    ) as worktree_dir:
        run(["rsync", "-a", f"{site.deploy_dir}/", f"{worktree_dir}/"])

        (Path(worktree_dir) / ".nojekyll").touch()

        worktree_args = [
            f"--git-dir={worktree_dir}/.git",
            f"--work-tree={worktree_dir}",
        ]

        base_args = [
            *worktree_args,
            "-c",
            f"core.excludesfile={REPO_ROOT}/.deploy-gitignore",
        ]

        deploy_tag = f"deploy/master/{deploy_number}-{push_sha}"

        run(
            [
                "git",
                *base_args,
                "add",
                "--",
                worktree_dir,
            ]
        )

        run(
            [
                "git",
                *base_args,
                "commit",
                "--allow-empty",
                "-m",
                f"Deploy to GitHub Pages [{deploy_description}]",
                "-m",
                "Source commit for this deployment:",
                "-m",
                run(["git", "show", "--no-patch", "--format=fuller", push_sha]),
            ]
        )

        run(
            [
                "git",
                *worktree_args,
                "tag",
                "-a",
                deploy_tag,
                "master",
                "-m",
                f"Deploy {deploy_description} triggered by {trigger}",
                "-m",
                site.run_url,
            ]
        )

    return deploy_number, deploy_tag


def approve_pull_request(
    pr_number: int, pr_eval: PullRequestEvaluation, run_url: str, dry_run: bool
) -> None:
    token = os.getenv("GH_BOT_TOKEN")

    if token is None:
        raise ValueError("GH_BOT_TOKEN environment variable not provided")

    review_params = json.dumps(
        {
            "commit_id": pr_eval.head_sha,
            "event": "APPROVE",
            "body": (
                "Approving [automatically] based on the following criteria:\n\n"
                f"```json\n{json.dumps(pr_eval.pr_eligibility, indent=4)}\n```\n\n"
                f"[automatically]: {run_url}"
            ),
        }
    )

    url = f"/repos/{REPO}/pulls/{pr_number}/reviews"

    if dry_run:
        print_info_multi("post [dry-run]", url, review_params)
    else:
        get_github_api(url, method="POST", token=token, data=review_params.encode())


@contextmanager
def sentry_deploy(site: DeploySite, push_sha: str, release_version: str, deploy_number: str):
    prepare_sentry_deploy(site, release_version=release_version)
    yield
    finalize_sentry_deploy(
        site, release_version=release_version, push_sha=push_sha, deploy_number=deploy_number
    )


@log_group("Initialize sentry release")
def prepare_sentry_deploy(site: DeploySite, release_version: str) -> None:
    run_sentry(
        site,
        [
            "releases",
            "new",
            release_version,
            "--url",
            site.run_url,
        ],
    )

    run_sentry(
        site,
        [
            "sourcemaps",
            "upload",
            f"--release={release_version}",
            "--url-prefix",
            "/home-assets",
            str(site.deploy_dir / "home-assets"),
        ],
    )


@log_group("Finalize sentry release and deploy")
def finalize_sentry_deploy(
    site: DeploySite, release_version: str, push_sha: str, deploy_number: str
) -> None:
    run_sentry(
        site,
        [
            "releases",
            "set-commits",
            release_version,
            "--commit",
            f"{REPO}@{push_sha}",
        ],
    )

    run_sentry(site, ["releases", "finalize", release_version])

    run_sentry(
        site,
        [
            "releases",
            "deploys",
            release_version,
            "new",
            "--name",
            deploy_number,
            "--env",
            "production",
            "--url",
            site.run_url,
        ],
    )


def run_sentry(site: DeploySite, args: list[str]) -> None:
    if site.dry_run:
        print_info_line("run [dry-run]", "sentry-cli", *(shlex.quote(s) for s in args))
    else:
        run(["sentry-cli", *args])


def get_release_version(site: DeploySite) -> str:
    return run(
        [
            "jq",
            "--raw-output",
            "-f",
            str(REPO_ROOT / "ci/release-name.jq"),
            str(site.deploy_revision_info),
        ]
    ).removesuffix("\n")


def has_consistent_release_version(site: DeploySite, release_version: str) -> bool:
    src = site.deploy_dir / ".test-meta.json"
    try:
        test_meta = json.loads(src.read_text())
    except Exception as e:
        e.add_note(f"failed to load test metadata from {src}")
        raise

    match test_meta:
        case {"release_version": str(built_version)}:
            pass

        case _:
            emit_error("Unexpected .test-meta.json content:", json.dumps(test_meta))
            return False

    consistent = built_version == release_version

    if not consistent:
        emit_warning(f"Unexpected release version from run")
        emit_warning(f"Expected {built_version!r}")
        emit_warning(f"Run has  {release_version!r}")

    return consistent
