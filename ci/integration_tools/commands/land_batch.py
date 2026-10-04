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
import time
import traceback

from ..gh_state import (
    PullRequestEvaluation,
    evaluate_pull_request_state,
    is_pull_request_merged,
)
from ..merge_deploy import deploy
from ..merge_deploy.revision_info import RevisionInfo
from ..merge_queue.queue_state import (
    LABEL_MERGE_ISOLATE,
    LABEL_MERGE_PENDING,
    QUEUE_BASE_REF,
    STAGING_REF,
    Batch,
    BatchEntry,
    describe_entries,
    is_queueable,
    set_label,
)
from ..output import (
    emit_error_block,
    emit_summary,
    emit_warning,
    emit_warning_block,
    enter_log_group,
    print_info_multi,
)
from ..utils import record_output, resolve_commit, run

# GitHub marks a pull request as merged some time after its head is pushed to
# the base branch
MERGED_WAIT_TIMEOUT_SECS = 15
MERGED_POLL_INTERVAL_SECS = 1


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

    # Check the batch's shape before deploying anything
    merge_shas = batch.merge_commits()

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

    # A failed push raises out of sentry_deploy, so the release isn't finalized
    try:
        with deploy.sentry_deploy(
            site,
            push_sha=batch.tip_sha,
            release_version=release_version,
            deploy_number=deploy_number,
        ):
            push_batch(params, batch, merge_shas, deploy_tag)
    except BatchPushError as exc:
        if exc.landed:
            message = (
                f"Deployment failed partway: {describe_entries(exc.landed)} are"
                f" on {batch.base_ref} but not deployed"
            )
        else:
            message = f"Failed to push batch {batch.describe()}"

        emit_error_block(f"{message}\n\n{exc.stderr}")

        finish_landed(params, exc.landed, evals)
        sys.exit(1)

    emit_summary("Merged batch", batch.describe(), "as", batch.tip_sha)

    finish_landed(params, batch.prs, evals)


def verify_build(batch: Batch, site: deploy.DeploySite) -> None:
    """Check that the build being deployed is of the batch tip"""
    built = RevisionInfo.load_deploy_json(site.deploy_revision_info)
    expected = RevisionInfo(ref=f"refs/heads/{QUEUE_BASE_REF}", sha=batch.tip_sha)

    if built != expected:
        raise ValueError(f"build revision {built} does not match batch: expected {expected}")


class BatchPushError(Exception):
    """A push failed after landing the pull requests in landed, if any"""

    def __init__(self, landed: list[BatchEntry], stderr: str) -> None:
        super().__init__(stderr)
        self.landed = landed
        self.stderr = stderr


def push_batch(params: LandParams, batch: Batch, merge_shas: list[str], deploy_tag: str) -> None:
    """Push the batch's merges to the base branch one at a time, deploying with the last

    GitHub rejects a direct push to a branch which requires pull requests unless
    it merges a single approved pull request, so each merge needs its own push.
    The last push also updates master and the deploy tag, atomically.
    """
    for index, (entry, merge_sha) in enumerate(zip(batch.prs, merge_shas)):
        prior_base_sha = batch.base_sha if index == 0 else merge_shas[index - 1]
        push_args = [
            "--atomic",
            params.remote,
            f"{merge_sha}:refs/heads/{batch.base_ref}",
            f"--force-with-lease=refs/heads/{batch.base_ref}:{prior_base_sha}",
        ]

        # Re-push each unlanded pull request's head branch unchanged so that the
        # push fails if any has moved.
        #
        # NOTE: Due to git quirks the unchanged refs are checked by the client
        # only *before* the other ref updates are applied by the server, but for
        # this use case the race condition that opens up isn't really
        # distinguishable from someone updating a ref right after our push.
        for pending in batch.prs[index:]:
            push_args.extend(
                [
                    f"{pending.head_sha}:refs/heads/{pending.head_ref}",
                    f"--force-with-lease=refs/heads/{pending.head_ref}:{pending.head_sha}",
                ]
            )

        if merge_sha == batch.tip_sha:
            push_args.extend(["master:master", f"refs/tags/{deploy_tag}:refs/tags/{deploy_tag}"])

        if params.dry_run:
            # Later pushes lease on a base branch which a dry run doesn't move
            if index > 0:
                print_info_multi("push [dry-run, not checked]", f"#{entry.number}", *push_args)
                continue

            push_args.insert(0, "--dry-run")

        try:
            run(["git", "push", *push_args])
        except subprocess.CalledProcessError as exc:
            # The remote's reason for rejecting the push is only in its stderr
            stderr = "\n".join(line.rstrip() for line in (exc.stderr or "").splitlines())
            raise BatchPushError(batch.prs[:index], stderr) from exc


def finish_landed(
    params: LandParams, landed: list[BatchEntry], evals: dict[int, PullRequestEvaluation]
) -> None:
    if not landed:
        return

    delete_head_branches(params, landed)
    clear_queue_labels(params, {entry.number: evals[entry.number] for entry in landed})


def delete_head_branches(params: LandParams, landed: list[BatchEntry]) -> None:
    """Delete landed head branches once GitHub has marked their pull requests merged"""
    unmerged = {entry.number for entry in landed}

    if not params.dry_run:
        try:
            unmerged = wait_for_merged(unmerged)
        except Exception as exc:
            emit_warning(
                f"Failed to confirm pull requests are marked merged"
                f" before branch cleanup: {exc}"
            )
            traceback.print_exception(exc, file=sys.stderr)
        else:
            if unmerged:
                unmerged_entries = [entry for entry in landed if entry.number in unmerged]
                emit_warning(
                    f"{describe_entries(unmerged_entries)} are not marked merged;"
                    f" branch cleanup will close them unmerged"
                )

    push_args = [params.remote]

    for entry in landed:
        push_args.extend(
            [
                f":refs/heads/{entry.head_ref}",
                f"--force-with-lease=refs/heads/{entry.head_ref}:{entry.head_sha}",
            ]
        )

    if params.dry_run:
        push_args.insert(0, "--dry-run")

    try:
        run(["git", "push", *push_args])
    except subprocess.CalledProcessError as exc:
        # The pull requests have landed by now, so don't fail the run over their branches
        stderr = "\n".join(line.rstrip() for line in (exc.stderr or "").splitlines())
        emit_warning_block(
            f"Failed to delete some head branches for {describe_entries(landed)}\n\n{stderr}"
        )


def wait_for_merged(pr_numbers: set[int]) -> set[int]:
    """Wait for GitHub to mark pull requests as merged, returning any which aren't"""
    deadline = time.monotonic() + MERGED_WAIT_TIMEOUT_SECS
    pending = set(pr_numbers)

    with enter_log_group("Wait for pull requests to be marked merged"):
        while True:
            pending = {number for number in pending if not is_pull_request_merged(number)}

            if not pending or time.monotonic() >= deadline:
                return pending

            time.sleep(MERGED_POLL_INTERVAL_SECS)


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
