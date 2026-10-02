"""Deploy a previously validated commit"""

from __future__ import annotations

import argparse
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
import json
from pathlib import Path
import sys
from typing import Any, Literal

from ..merge_deploy import deploy, merge_prep, revision_info
from ..merge_deploy.revision_info import RevisionInfo

from ..gh_state import (
    REPO,
    PullRequestEvaluation,
    add_label,
    evaluate_pull_request_state,
    get_github_api,
    remove_label,
)
from ..output import (
    emit_notice,
    emit_summary,
    emit_warning,
    enter_log_group,
    print_info_line,
    print_info_multi,
)
from ..utils import resolve_commit, run, temporary_worktree, validate_branch_ref


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

    def site(self) -> deploy.DeploySite:
        assert self.allows_pages_deploy(), self
        assert self.deploy_dir is not None and self.deploy_revision_info is not None

        return deploy.DeploySite(
            remote=self.remote,
            run_url=self.run_url,
            deploy_dir=self.deploy_dir,
            deploy_revision_info=self.deploy_revision_info,
            dry_run=self.dry_run,
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
                emit_summary("Nothing to do for push to", params.base_ref)
                return

    emit_notice("allows-pages-deploy", json.dumps(params.allows_pages_deploy()))

    release_version = None
    if params.allows_pages_deploy():
        release_version = deploy.get_release_version(params.site())

        emit_summary("release", release_version)

        if not deploy.has_consistent_release_version(
            params.site(), release_version=release_version
        ):
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
                params.record_output("stale", "true")
                emit_summary("Pull request", pr_number, "is not currently eligible to merge")
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
                trigger_pull_request_merge_update(params)
                return

            with enter_log_group("Prepare merge commit"):
                push_ref = f'merge.{pr_number}.{head_ref.replace("/", "-")}.{datetime.utcnow().strftime("%Y-%m-%d-%H-%M-%S")}'

                with temporary_worktree(merge_ref, args=["-b", push_ref]) as worktree_dir:
                    merge_prep.rewrite_pull_request_merge_commit_message(
                        pr_number,
                        pr_eval,
                        global_git_args=[
                            f"--git-dir={worktree_dir}/.git",
                            f"--work-tree={worktree_dir}",
                        ],
                    )

                push_sha = resolve_commit(push_ref)

        case "push":
            push_ref, push_sha = head_ref, resolve_commit(head_ref)

            stale = not push_deploy_revisions_up_to_date(
                params, RevisionInfo.for_push(ref=push_ref, sha=push_sha)
            )
            params.record_output("stale", json.dumps(stale))

            if stale:
                return

            match find_prior_deploy(params, push_sha=push_sha):
                case (commit, tag):
                    emit_summary(
                        f"Source commit for {head_ref} ({push_sha}) already deployed via {commit} ({tag})"
                    )
                    return
                case other:
                    assert other is None, repr(other)

            fetch_deploy_refs(params)

        case _:
            raise ValueError(f"unexpected effective event {params.effective_event!r}")

    deploy_number = deploy_tag = None
    if params.allows_pages_deploy():
        deploy_number, deploy_tag = deploy.prepare_deploy_commit(
            params.site(),
            push_sha=push_sha,
            source_description=None if pr_number is None else f"PR #{pr_number}",
            trigger=params.effective_event.replace("_", " "),
        )
    elif base_ref == "develop":
        emit_warning("Event targeting", base_ref, "is not deployable:", params)

    if (
        params.effective_event == "pull_request"
        and not pr_eval.pr_eligibility["approver_is_collaborator"]
    ):
        assert pr_number is not None, params
        assert pr_eval.pr_is_eligible, pr_eval

        deploy.approve_pull_request(
            pr_number, pr_eval, run_url=params.run_url, dry_run=params.dry_run
        )

    with sentry_deploy(
        params, push_sha=push_sha, release_version=release_version, deploy_number=deploy_number
    ):
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

    emit_summary("Successfully handled push")


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
        deploy.fetch_deploy_branch(remote)

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


def find_prior_deploy(params: DeployParams, push_sha: str) -> tuple[str, str] | None:
    for line in run(
        ["git", "ls-remote", "--tags", params.remote, f"deploy/master/*-{push_sha}^{{}}"]
    ).splitlines():
        match line.split("\t", maxsplit=1):
            case [commit, tag] if commit == push_sha:
                return commit, tag.removeprefix("refs/tags/")

    return None


def pull_request_revisions_up_to_date(
    params: DeployParams,
    pr_eval: PullRequestEvaluation,
    current: RevisionInfo,
) -> bool:
    assert params.effective_event == "pull_request", params

    sources: list[tuple[str, RevisionInfo]] = [
        ("current", current),
        ("evaluated", RevisionInfo.from_pr_eval(pr_eval)),
    ]

    if params.deploy_revision_info is not None:
        sources.append(("built", RevisionInfo.load_deploy_json(params.deploy_revision_info)))

    return revision_info.verify_revision_consistency(sources)


def push_deploy_revisions_up_to_date(params: DeployParams, current: RevisionInfo) -> bool:
    assert params.effective_event == "push", params
    assert params.deploy_revision_info is not None, params

    return revision_info.verify_revision_consistency(
        [
            ("current", current),
            ("built", RevisionInfo.load_deploy_json(params.deploy_revision_info)),
        ]
    )


def trigger_pull_request_merge_update(params: DeployParams) -> None:
    """Trigger an asynchronous merge commit update for the given pull request"""
    assert params.effective_event == "pull_request", params
    assert params.pr_number is not None, params

    url = f"/repos/{REPO}/pulls/{params.pr_number}/update-branch"

    if params.dry_run:
        print_info_multi("put [dry-run]", url)
    else:
        get_github_api(url, method="PUT", data=b"{}")


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

    with deploy.sentry_deploy(
        params.site(),
        push_sha=push_sha,
        release_version=release_version,
        deploy_number=deploy_number,
    ):
        yield
