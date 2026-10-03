"""Merge and deploy a validated merge queue batch

If any pull request in the batch is no longer eligible or has changed since
the batch was staged, nothing is pushed and the `requeue` output is set.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
import subprocess
import sys
import traceback

from ..gh_state import PullRequestEvaluation, evaluate_pull_request_state
from ..merge_deploy import deploy
from ..merge_deploy.revision_info import RevisionInfo
from ..merge_queue.queue_state import (
    LABEL_MERGE_ISOLATE,
    LABEL_MERGE_PENDING,
    QUEUE_BASE_REF,
    STAGING_REF,
    Batch,
    is_queueable,
    set_label,
)
from ..output import emit_error_block, emit_summary, emit_warning, enter_log_group
from ..utils import record_output, resolve_commit, run


def init_parser(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--remote", default="origin")
    parser.add_argument("--staging-ref", default=STAGING_REF)
    parser.add_argument(
        "--batch-file",
        type=Path,
        required=True,
        help="JSON file describing the batch, as produced by stage-batch",
    )
    parser.add_argument("--run-url", required=True, help="URL describing this run")
    parser.add_argument(
        "--deploy-dir", help="Directory containing the site content", type=Path, required=True
    )
    parser.add_argument(
        "--deploy-revision-info",
        help="File describing the revision to be deployed",
        type=Path,
        required=True,
    )
    parser.add_argument(
        "--outputs-file", help="File where step output should be written", type=Path
    )
    parser.add_argument("--dry-run", action="store_true")


@dataclass(kw_only=True)
class LandParams:
    remote: str
    staging_ref: str
    batch_file: Path
    run_url: str
    deploy_dir: Path
    deploy_revision_info: Path
    outputs_file: Path | None
    dry_run: bool


def run_command(**kwargs) -> None:
    params = LandParams(**kwargs)
    remote = params.remote

    batch = Batch.from_json(params.batch_file.read_text())

    site = deploy.DeploySite(
        remote=remote,
        run_url=params.run_url,
        deploy_dir=params.deploy_dir,
        deploy_revision_info=params.deploy_revision_info,
        dry_run=params.dry_run,
    )

    verify_build(batch, site)

    release_version = deploy.get_release_version(site)
    emit_summary("release", release_version)

    if not deploy.has_consistent_release_version(site, release_version=release_version):
        raise ValueError("built release version does not match revision info")

    with enter_log_group("Recheck pull requests"):
        evals = {entry.number: evaluate_pull_request_state(entry.number) for entry in batch.prs}

    stale = [
        entry.number
        for entry in batch.prs
        if not is_queueable(evals[entry.number]) or evals[entry.number].head_sha != entry.head_sha
    ]

    record_output(params.outputs_file, "requeue", "true" if stale else "false")

    if stale:
        emit_summary(
            "Not merging batch",
            batch.describe(),
            "because pull requests changed:",
            ", ".join(f"#{n}" for n in stale),
        )
        return

    # Fetch the batch commits, which are only on the staging ref. Since only one
    # merge queue run is active at a time, nothing else should have moved it; if
    # something did, don't push a batch whose provenance is in doubt.
    run(["git", "fetch", "--no-tags", "--", remote, f"+{params.staging_ref}:{params.staging_ref}"])

    if (staged := resolve_commit(params.staging_ref)) != batch.tip_sha:
        raise ValueError(
            f"{params.staging_ref} is at {staged}, which does not match batch tip {batch.tip_sha}"
        )

    deploy.fetch_deploy_branch(remote)

    for entry in batch.prs:
        pr_eval = evals[entry.number]
        if not pr_eval.pr_eligibility["approver_is_collaborator"]:
            deploy.approve_pull_request(
                entry.number, pr_eval, run_url=params.run_url, dry_run=params.dry_run
            )

    deploy_number, deploy_tag = deploy.prepare_deploy_commit(
        site,
        push_sha=batch.tip_sha,
        source_description=f"PRs {batch.describe()}",
        trigger="merge queue",
    )

    with deploy.sentry_deploy(
        site,
        push_sha=batch.tip_sha,
        release_version=release_version,
        deploy_number=deploy_number,
    ):
        push_args = [
            "--atomic",
            remote,
            f"{batch.tip_sha}:refs/heads/{batch.base_ref}",
            f"--force-with-lease=refs/heads/{batch.base_ref}:{batch.base_sha}",
        ]

        for entry in batch.prs:
            push_args.extend(
                [
                    f":refs/heads/{entry.head_ref}",
                    f"--force-with-lease=refs/heads/{entry.head_ref}:{entry.head_sha}",
                ]
            )

        push_args.extend(["master:master", f"refs/tags/{deploy_tag}:refs/tags/{deploy_tag}"])

        if params.dry_run:
            push_args.insert(0, "--dry-run")

        try:
            run(["git", "push", *push_args])
        except subprocess.CalledProcessError as exc:
            # The remote's reason for rejecting the push is only in its stderr
            stderr = "\n".join(line.rstrip() for line in (exc.stderr or "").splitlines())
            emit_error_block(f"Failed to push batch {batch.describe()}\n\n{stderr}")
            sys.exit(1)

    emit_summary("Merged batch", batch.describe(), "as", batch.tip_sha)

    clear_queue_labels(params, evals)


def verify_build(batch: Batch, site: deploy.DeploySite) -> None:
    """Check that the build being deployed is of the batch tip"""
    built = RevisionInfo.load_deploy_json(site.deploy_revision_info)
    expected = RevisionInfo.for_push(ref=f"refs/heads/{QUEUE_BASE_REF}", sha=batch.tip_sha)

    if built != expected:
        raise ValueError(f"build revision {built} does not match batch: expected {expected}")


def clear_queue_labels(params: LandParams, evals: dict[int, PullRequestEvaluation]) -> None:
    # Labels on merged PRs are cosmetic, so don't fail the run over them
    for number, pr_eval in evals.items():
        for label, current in [
            (LABEL_MERGE_PENDING, pr_eval.merge_pending_label_present),
            (LABEL_MERGE_ISOLATE, pr_eval.merge_isolate_label_present),
        ]:
            try:
                set_label(number, label, present=False, current=current, dry_run=params.dry_run)
            except Exception as exc:
                emit_warning(f"Failed to remove {label} label from #{number}: {exc}")
                traceback.print_exception(exc, file=sys.stderr)
