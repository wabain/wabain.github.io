"""Deploy a previously validated commit"""

from __future__ import annotations

import argparse
from contextlib import contextmanager
from dataclasses import dataclass
import dataclasses
from datetime import datetime
import json
import os
from pathlib import Path
import shlex
import sys
from typing import Any, Literal

from .. import merge_prep
from ..gh_state import (
    REPO,
    PullRequestEvaluation,
    add_label,
    evaluate_pull_request_state,
    get_github_api,
    remove_label,
)
from ..utils import (
    enter_log_group,
    log_group,
    print_info_line,
    print_info_multi,
    run,
    temporary_worktree,
    validate_branch_ref,
)


REPO_ROOT = Path(__file__).parent.parent.parent.parent


def init_parser(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--remote", default="origin")
    parser.add_argument("--base-ref", required=True)
    parser.add_argument("--head-ref", required=True)
    parser.add_argument("--effective-event", required=True, choices=["pull_request", "push"])
    parser.add_argument("--pr-number", type=int)
    parser.add_argument("--run-url", required=True, help="URL describing this run")
    parser.add_argument("--deploy-dir", help="Directory containing the site content", type=Path)
    parser.add_argument(
        "--deploy-revision-info", help="File describing the revision to be deployed", type=Path
    )
    parser.add_argument(
        "--outputs-file", help="File where step output should be written", type=Path
    )
    parser.add_argument("--dry-run", action="store_true")


@dataclass(kw_only=True)
class DeployParams:
    remote: str
    head_ref: str
    base_ref: str
    effective_event: Literal["pull_request", "push"]
    pr_number: int | None
    run_url: str
    deploy_dir: Path | None
    deploy_revision_info: Path | None
    outputs_file: Path | None
    dry_run: bool

    def allows_pages_deploy(self) -> bool:
        return (
            self.deploy_dir is not None
            and self.deploy_revision_info is not None
            and self.base_ref == "develop"
        )

    def record_output(self, name: str, value: str) -> None:
        assert "\n" not in name, repr(name)
        assert "\n" not in value, repr(value)

        print_info_line("output", f"{name}={value}")

        if self.outputs_file is None:
            return

        with open(self.outputs_file, "a", encoding="utf8") as f:
            f.write(f"{name}={value}\n")


def run_command(**kwargs) -> None:
    params = DeployParams(**kwargs)

    validate_branch_ref(params.head_ref)
    validate_branch_ref(params.base_ref)

    push_ref: str

    match params:
        case DeployParams(
            pr_number=pr_number,
            remote=remote,
            base_ref=base_ref,
            head_ref=head_ref,
        ):
            pass

    match params.effective_event:
        case "pull_request":
            if pr_number is None:
                raise ValueError("--pr-number is required when effective event is pull_request")

        case "push":
            if pr_number is not None:
                raise ValueError("--pr-number is not allowed when effective event is push")

            if head_ref != base_ref:
                raise ValueError(
                    f"head ref and base ref for push deploys should match: got {head_ref} and {base_ref}"
                )

            if not params.allows_pages_deploy():
                print("nothing to do for push to", params.base_ref, file=sys.stderr)
                return

    print_info_line("allows-pages-deploy", json.dumps(params.allows_pages_deploy()))

    release_version = None
    if params.allows_pages_deploy():
        release_version = get_release_version(params)

        print_info_line("release", release_version)

        if not has_consistent_release_version(params, release_version=release_version):
            params.record_output("stale", "true")
            return

    match params.effective_event:
        case "pull_request":
            assert pr_number is not None  # Checked above

            pr_eval = evaluate_pull_request_state(pr_number)
            params.record_output("pr_eval", json.dumps(json.loads(pr_eval.raw)))

            if pr_eval.pr_may_be_eligible != pr_eval.merge_pending_label_present:
                update_pull_request_merge_pending_label(params, pr_eval.pr_may_be_eligible)

            if not pr_eval.pr_is_eligible:
                print(
                    "Pull request", pr_number, "is not currently eligible to merge", file=sys.stderr
                )
                return

            fetch_deploy_refs(params)

            merge_ref = merge_prep.pull_request_merge_ref(pr_number)
            run(["git", "fetch", "--no-tags", "--", remote, f"+{merge_ref}:{merge_ref}"])

            current_revs = RevisionInfo(
                base_ref=base_ref,
                base_sha=resolve_commit(f"refs/remotes/{remote}/{base_ref}"),
                head_ref=head_ref,
                head_sha=resolve_commit(f"refs/remotes/{remote}/{head_ref}"),
                merge_sha=resolve_commit(merge_ref),
            )

            stale = not pull_request_revisions_up_to_date(
                params, pr_eval=pr_eval, current=current_revs
            )
            params.record_output("stale", json.dumps(stale))

            if stale:
                return

            with enter_log_group("Prepare merge commit"):
                push_ref = f'merge.{pr_number}.{head_ref.replace("/", "-")}.{datetime.utcnow().strftime("%Y-%m-%d-%H-%M-%S")}'

                with temporary_worktree(merge_ref, args=["-b", push_ref]) as worktree_dir:
                    merge_prep.set_pull_request_merge_commit_message(
                        pr_number,
                        pr_eval,
                        global_git_args=[
                            f"--git-dir={worktree_dir}/.git",
                            f"--work-tree={worktree_dir}",
                        ],
                    )

                push_sha = resolve_commit(push_ref)

        case "push":
            push_ref = head_ref
            push_sha = resolve_commit(push_ref)

            stale = not push_deploy_revisions_up_to_date(
                params, RevisionInfo(head_ref=head_ref, head_sha=push_sha, base_ref=head_ref)
            )
            params.record_output("stale", json.dumps(stale))

            if stale:
                return

            match find_prior_deploy(params, push_sha=push_sha):
                case (commit, tag):
                    print(f"Source commit already deployed via {commit} ({tag})", file=sys.stderr)
                    return
                case other:
                    assert other is None, repr(other)

            fetch_deploy_refs(params)

        case _:
            raise ValueError(f"unexpected effective event {params.effective_event!r}")

    deploy_number = deploy_tag = None
    if params.allows_pages_deploy():
        deploy_number, deploy_tag = prepare_deploy_commit(params, push_sha=push_sha)
    elif base_ref == "develop":
        print(f"::warning::Event targeting {base_ref} is not deployable: {params}", file=sys.stderr)

    with sentry_deploy(
        params, push_sha=push_sha, release_version=release_version, deploy_number=deploy_number
    ):
        if (
            params.effective_event == "pull_request"
            and not pr_eval.pr_eligibility["approver_is_collaborator"]
        ):
            approve_pull_request(params, pr_eval)

        push_args = ["--atomic", remote]

        if params.dry_run:
            push_args.insert(0, "--dry-run")

        if params.effective_event == "pull_request":
            push_args.extend(
                [
                    f"{push_sha}:refs/heads/{base_ref}",
                    f":refs/heads/{head_ref}",
                    f"--force-with-lease=refs/heads/{head_ref}:{pr_eval.head_sha}",
                ]
            )
        else:
            push_args.extend(
                [
                    f"{push_sha}:refs/heads/{head_ref}",
                    f"--force-with-lease=refs/heads/{head_ref}:{push_sha}",
                ]
            )

        if params.allows_pages_deploy():
            assert deploy_tag is not None

            push_args.extend(
                [
                    "master:master",
                    f"refs/tags/{deploy_tag}:refs/tags/{deploy_tag}",
                ]
            )

        run(["git", "push", *push_args])


def update_pull_request_merge_pending_label(params: DeployParams, pending: bool) -> None:
    assert params.pr_number is not None, params

    if params.dry_run:
        action = "post [dry-run]" if pending else "delete [dry-run]"
        print_info_multi(action, "PR", params.pr_number, "label", "merge-pending")
        return

    if pending:
        add_label(params.pr_number, "merge-pending")
    else:
        remove_label(params.pr_number, "merge-pending")


def fetch_deploy_refs(params: DeployParams) -> None:
    remote = params.remote

    if params.allows_pages_deploy():
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

    if params.effective_event == "pull_request":
        head_ref, base_ref = params.head_ref, params.base_ref

        # Base ref
        run(
            [
                "git",
                "fetch",
                "--no-tags",
                "--depth=1",
                "--",
                remote,
                f"+refs/heads/{base_ref}:refs/remotes/{remote}/{base_ref}",
            ]
        )

        # Head ref
        run(
            [
                "git",
                "fetch",
                "--no-tags",
                f"--shallow-exclude=refs/heads/{base_ref}",
                "--",
                remote,
                f"+refs/heads/{head_ref}:refs/remotes/{remote}/{head_ref}",
            ]
        )

        run(
            [
                "git",
                "fetch",
                "--no-tags",
                "--deepen=1",
                "--",
                remote,
                f"+refs/heads/{head_ref}:refs/remotes/{remote}/{head_ref}",
            ]
        )


def resolve_commit(rev: str) -> str:
    return run(
        ["git", "rev-parse", "--verify", "--end-of-options", rev + "^{commit}"]
    ).removesuffix("\n")


def find_prior_deploy(params: DeployParams, push_sha: str) -> tuple[str, str] | None:
    for line in run(
        ["git", "ls-remote", "--tags", params.remote, f"deploy/master/*-{push_sha}^{{}}"]
    ).splitlines():
        match line.split("\t", maxsplit=1):
            case [commit, tag] if commit == push_sha:
                return commit, tag.removeprefix("refs/tags/")

    return None


@dataclass(kw_only=True)
class RevisionInfo:
    head_ref: str
    head_sha: str
    base_ref: str
    base_sha: str | None = dataclasses.field(default=None)
    merge_sha: str | None = dataclasses.field(default=None)

    def as_dict(self) -> dict[str, str | None]:
        d = dataclasses.asdict(self)
        if self.base_sha is None:
            del d["base_sha"]
        return d


def pull_request_revisions_up_to_date(
    params: DeployParams,
    pr_eval: PullRequestEvaluation,
    current: RevisionInfo,
) -> bool:
    assert params.effective_event == "pull_request", params

    sources = [
        ("current", current.as_dict()),
        ("evaluated", revision_info_from_pr_eval(pr_eval).as_dict()),
    ]

    if params.deploy_revision_info is not None:
        sources.append(("built", load_deploy_revision_info(params.deploy_revision_info).as_dict()))

    return are_revisions_consistent(sources)


def push_deploy_revisions_up_to_date(params: DeployParams, current: RevisionInfo) -> bool:
    assert params.effective_event == "push", params
    assert params.deploy_revision_info is not None, params

    return are_revisions_consistent(
        [
            ("current", current.as_dict()),
            ("built", load_deploy_revision_info(params.deploy_revision_info).as_dict()),
        ]
    )


def are_revisions_consistent(revs: list[tuple[str, dict[str, Any]]]) -> bool:
    consistent = True

    for key in RevisionInfo.__dataclass_fields__.keys():
        match [(src_name, src[key]) for src_name, src in revs if key in src]:
            case [(_, first), *rest] as items:
                if any(first != other for _, other in rest):
                    print_info_line(
                        "stale",
                        key,
                        "changed:",
                        *(f"{src_name} {value!r}" for src_name, value in items),
                    )
                    consistent = False

            case []:
                pass

            case other:
                raise RuntimeError(f"unreachable: {other!r}")

    return consistent


def revision_info_from_pr_eval(pr_eval: PullRequestEvaluation) -> RevisionInfo:
    return RevisionInfo(
        head_ref=pr_eval.head_ref,
        head_sha=pr_eval.head_sha,
        base_ref=pr_eval.base_ref,
        merge_sha=pr_eval.merge_sha,
    )


def load_deploy_revision_info(src: Path) -> RevisionInfo:
    try:
        info = json.loads(src.read_text())
    except Exception as e:
        e.add_note(f"failed to load revision info from {src}")
        raise

    match info:
        case {
            "head_ref": str(head_ref),
            "head_sha": str(head_sha),
            "base_ref": str(base_ref),
            "base_ref_sha": str(base_sha),
            "sha": str(merge_sha),
            "tree": str(),
        }:
            return RevisionInfo(
                head_ref=head_ref,
                head_sha=head_sha,
                base_ref=base_ref,
                base_sha=base_sha,
                merge_sha=merge_sha,
            )

        case {
            "ref": str(ref),
            "sha": str(sha),
            "tree": str(),
            **other,
        } if not {
            "head_ref",
            "head_sha",
            "base_ref",
            "base_ref_sha",
        }.intersection(other):
            return RevisionInfo(head_ref=ref, head_sha=sha, base_ref=ref)

        case _:
            raise ValueError(f"unexpected deploy revision content: {json.dumps(info, indent=2)}")


@log_group("Prepare deploy")
def prepare_deploy_commit(params: DeployParams, push_sha: str) -> tuple[str, str]:
    assert params.deploy_dir is not None
    assert params.deploy_revision_info is not None

    # Get the number of commits there will be on the deploy branch; this will give us a
    # monotonically increasing deploy number (up to history rewrites and deploy branch changes).
    #
    # Note that we do a non-shallow fetch of master in fetch_deploy_refs to ensure this works.
    deploy_number = str(
        len(run(["git", "rev-list", f"refs/remotes/{params.remote}/master"]).splitlines()) + 1
    )

    deploy_description = (
        deploy_number
        if params.pr_number is None
        else f"{deploy_number} from PR #{params.pr_number}"
    )

    with temporary_worktree(
        f"refs/remotes/{params.remote}/master", args=["--no-checkout", "-B", "master"]
    ) as worktree_dir:
        run(["rsync", "-a", f"{params.deploy_dir}/", f"{worktree_dir}/"])

        (Path(worktree_dir) / ".nojekyll").touch()

        worktree_args = [
            f"--git-dir={worktree_dir}/.git",
            f"--work-tree={worktree_dir}",
        ]

        deploy_tag = f"deploy/master/{deploy_number}-{push_sha}"

        run(
            [
                "git",
                *worktree_args,
                "-c",
                f"core.excludesfile={REPO_ROOT}/.deploy-gitignore",
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
                f'Deploy {deploy_description} triggered by {params.effective_event.replace("_", " ")}',
                "-m",
                params.run_url,
            ]
        )

    return deploy_number, deploy_tag


def approve_pull_request(params: DeployParams, pr_eval: PullRequestEvaluation) -> None:
    assert params.effective_event == "pull_request", params
    assert pr_eval.pr_is_eligible, pr_eval

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
                f"[automatically]: {params.run_url}"
            ),
        }
    )

    url = f"/repos/{REPO}/pulls/{params.pr_number}/reviews"

    if params.dry_run:
        print_info_multi("post [dry-run]", url, review_params)
    else:
        get_github_api(url, method="POST", token=token, data=review_params.encode())


@contextmanager
def sentry_deploy(
    params: DeployParams, push_sha: str, release_version: str | None, deploy_number: str | None
):
    if not params.allows_pages_deploy():
        assert release_version is None, f"{release_version!r}, params"
        assert deploy_number is None, f"{deploy_number!r}, params"

        yield
        return

    assert release_version is not None, params
    assert deploy_number is not None, params

    prepare_sentry_deploy(params, push_sha=push_sha, release_version=release_version)
    yield
    finalize_sentry_deploy(params, release_version=release_version, deploy_number=deploy_number)


@log_group("Initialize sentry release")
def prepare_sentry_deploy(params: DeployParams, push_sha: str, release_version: str) -> None:
    assert params.deploy_dir is not None, params

    run_sentry(
        params,
        [
            "releases",
            "new",
            release_version,
            "--url",
            params.run_url,
        ],
    )

    run_sentry(
        params,
        [
            "releases",
            "set-commits",
            release_version,
            "--commit",
            f"wabain/wabain.github.io@{push_sha}",
        ],
    )

    run_sentry(
        params,
        [
            "releases",
            "files",
            release_version,
            "upload-sourcemaps",
            "--ignore",
            f"{REPO_ROOT}/.deploy-gitignore",
            "--url-prefix",
            "/home-assets",
            str(params.deploy_dir / "home-assets"),
        ],
    )


@log_group("Finalize sentry release and deploy")
def finalize_sentry_deploy(params: DeployParams, release_version: str, deploy_number: str) -> None:
    run_sentry(params, ["releases", "finalize", release_version])

    run_sentry(
        params,
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
            params.run_url,
        ],
    )


def run_sentry(params: DeployParams, args: list[str]) -> None:
    if params.dry_run:
        print_info_line("run [dry-run]", "sentry-cli", *(shlex.quote(s) for s in args))
    else:
        run(["sentry-cli", *args])


def get_release_version(params: DeployParams) -> str:
    assert params.deploy_dir is not None, params
    assert params.deploy_revision_info is not None, params

    return run(
        [
            "jq",
            "--raw-output",
            "-f",
            str(REPO_ROOT / "ci/release-name.jq"),
            str(params.deploy_revision_info),
        ]
    ).removesuffix("\n")


def has_consistent_release_version(params: DeployParams, release_version: str) -> bool:
    assert params.deploy_dir is not None, params
    assert params.deploy_revision_info is not None, params

    src = params.deploy_dir / ".test-meta.json"
    try:
        test_meta = json.loads(src.read_text())
    except Exception as e:
        e.add_note(f"failed to load test metadata from {src}")
        raise

    match test_meta:
        case {"release_version": str(built_version)}:
            pass

        case _:
            print(
                "::error ::Unexpected .test-meta.json content:",
                json.dumps(test_meta),
                file=sys.stderr,
            )
            return False

    consistent = built_version == release_version

    if not consistent:
        print(f"::warning ::Unexpected release version from run", file=sys.stderr)
        print(f"::warning ::Expected {built_version!r}", file=sys.stderr)
        print(f"::warning ::Run has  {release_version!r}", file=sys.stderr)

    return consistent
