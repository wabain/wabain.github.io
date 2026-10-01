"""Deploy a validated push to develop"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import json
from pathlib import Path

from ..merge_deploy import deploy, revision_info
from ..merge_deploy.revision_info import RevisionInfo

from ..output import emit_summary, print_info_line
from ..utils import resolve_commit, run, validate_branch_ref


def init_parser(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--remote", default="origin")
    parser.add_argument("--base-ref", required=True)
    parser.add_argument("--head-ref", required=True)
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

    remote, base_ref, head_ref = params.remote, params.base_ref, params.head_ref

    if head_ref != base_ref:
        raise ValueError(
            f"head ref and base ref for push deploys should match: got {head_ref} and {base_ref}"
        )

    if not params.allows_pages_deploy():
        emit_summary("Nothing to do for push to", params.base_ref)
        return

    release_version = deploy.get_release_version(params.site())
    emit_summary("release", release_version)

    if not deploy.has_consistent_release_version(params.site(), release_version=release_version):
        params.record_output("stale", "true")
        return

    push_sha = resolve_commit(head_ref)

    stale = not push_deploy_revisions_up_to_date(
        params, RevisionInfo.for_push(ref=head_ref, sha=push_sha)
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

    deploy.fetch_deploy_branch(remote)

    deploy_number, deploy_tag = deploy.prepare_deploy_commit(
        params.site(), push_sha=push_sha, source_description=None, trigger="push"
    )

    with deploy.sentry_deploy(
        params.site(),
        push_sha=push_sha,
        release_version=release_version,
        deploy_number=deploy_number,
    ):
        push_args = [
            "--atomic",
            remote,
            f"{push_sha}:refs/heads/{head_ref}",
            f"--force-with-lease=refs/heads/{head_ref}:{push_sha}",
            "master:master",
            f"refs/tags/{deploy_tag}:refs/tags/{deploy_tag}",
        ]

        if params.dry_run:
            push_args.insert(0, "--dry-run")

        run(["git", "push", *push_args])

    emit_summary("Successfully handled push")


def find_prior_deploy(params: DeployParams, push_sha: str) -> tuple[str, str] | None:
    for line in run(
        ["git", "ls-remote", "--tags", params.remote, f"deploy/master/*-{push_sha}^{{}}"]
    ).splitlines():
        match line.split("\t", maxsplit=1):
            case [commit, tag] if commit == push_sha:
                return commit, tag.removeprefix("refs/tags/")

    return None


def push_deploy_revisions_up_to_date(params: DeployParams, current: RevisionInfo) -> bool:
    assert params.deploy_revision_info is not None, params

    return revision_info.verify_revision_consistency(
        [
            ("current", current),
            ("built", RevisionInfo.load_deploy_json(params.deploy_revision_info)),
        ]
    )
