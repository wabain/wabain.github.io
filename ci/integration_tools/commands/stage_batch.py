"""Build the next merge queue batch and push it to the staging ref

The repository must contain the revision that --workflow-sha names, and the
history of the queue base ref back to where the pull request branches forked
from it. This command fetches the base ref and pull request branches from the
remote.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from enum import Enum
from pathlib import Path

from ..gh_state import list_open_pull_requests
from ..merge_queue.queue_state import (
    LABEL_MERGE_MANUALLY,
    QUEUE_BASE_REF,
    STAGING_REF,
    VALIDATE_WORKFLOW_PATH,
    Batch,
    BatchEntry,
    QueueCandidate,
    build_merge_chain,
    evaluate_candidate,
    is_queue_relevant,
    partition_ready,
    paths_differ,
    resolve_head,
    set_label,
    sync_merge_pending_label,
)
from ..output import emit_summary, emit_warning, enter_log_group
from ..utils import record_output, resolve_commit, run, run_status, temporary_worktree


def init_parser(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--remote", default="origin")
    parser.add_argument("--staging-ref", default=STAGING_REF)
    parser.add_argument(
        "--workflow-sha",
        required=True,
        help="Revision the running workflow was read from, which the batch build uses",
    )
    parser.add_argument("--max-size", type=int, default=10, help="Maximum PRs in a batch")
    parser.add_argument(
        "--batch-file",
        type=Path,
        help="File where batch JSON should be written",
    )
    parser.add_argument(
        "--outputs-file", help="File where step output should be written", type=Path
    )
    parser.add_argument(
        "--dry-run",
        nargs="?",
        type=parse_effects,
        const=frozenset(Effect),
        default=frozenset(),
        metavar="EFFECTS",
        help=(
            "Skip the given remote effects, a comma-separated list of "
            f"{', '.join(e.value for e in Effect)} (default: all)"
        ),
    )


class Effect(Enum):
    """Remote effects which can be skipped with --dry-run"""

    PR_LABELS = "pr-labels"
    STAGING_REF = "staging-ref"


def parse_effects(value: str) -> frozenset[Effect]:
    try:
        return frozenset(Effect(name) for name in value.split(","))
    except ValueError as exc:
        raise argparse.ArgumentTypeError(str(exc)) from exc


@dataclass(kw_only=True)
class StageParams:
    remote: str
    staging_ref: str
    workflow_sha: str
    max_size: int
    batch_file: Path | None
    outputs_file: Path | None
    dry_run: frozenset[Effect]


def run_command(**kwargs) -> None:
    params = StageParams(**kwargs)
    dry_run_labels = Effect.PR_LABELS in params.dry_run

    with enter_log_group("Evaluate pull requests"):
        candidates = [
            evaluate_candidate(pull["number"])
            for pull in list_open_pull_requests()
            if is_queue_relevant(pull)
        ]

    run(
        [
            "git",
            "fetch",
            "--no-tags",
            "--",
            params.remote,
            f"+refs/heads/{QUEUE_BASE_REF}:refs/remotes/{params.remote}/{QUEUE_BASE_REF}",
        ]
    )
    base_sha = resolve_commit(f"refs/remotes/{params.remote}/{QUEUE_BASE_REF}")

    if paths_differ([params.workflow_sha, base_sha], [VALIDATE_WORKFLOW_PATH]):
        # A follow-up run picks up the current copy of the validate workflow.
        # Labels are left for that run to update, so return before updating them.
        emit_warning(
            f"{VALIDATE_WORKFLOW_PATH} changed on {QUEUE_BASE_REF} since this run was queued;"
            " requeueing"
        )
        record_output(params.outputs_file, "has_batch", "false")
        record_output(params.outputs_file, "stale", "true")
        emit_summary(f"Requeued: {VALIDATE_WORKFLOW_PATH} changed on {QUEUE_BASE_REF}")
        return

    isolated, regular = partition_ready(candidates)
    batch = (
        build_batch(params, base_sha, isolated=isolated, regular=regular)
        if isolated or regular
        else None
    )

    if batch is not None:
        push_args = ["--force", params.remote, f"{params.staging_ref}:{params.staging_ref}"]
        if Effect.STAGING_REF in params.dry_run:
            push_args.insert(0, "--dry-run")

        run(["git", "push", *push_args])

        if params.batch_file is not None:
            params.batch_file.write_text(batch.to_json())

        record_output(params.outputs_file, "batch", batch.to_json())

    record_output(params.outputs_file, "has_batch", "true" if batch is not None else "false")
    record_output(params.outputs_file, "stale", "false")

    # Update labels only once the batch is staged, so that a failure staging
    # it doesn't leave merge-pending labels with no run to clear them
    with enter_log_group("Update labels"):
        for candidate in candidates:
            sync_merge_pending_label(candidate, dry_run=dry_run_labels)
            sync_merge_manually_label(candidate, dry_run=dry_run_labels)

    if batch is not None:
        emit_summary(
            f"Staged {'isolated ' if batch.isolated else ''}batch {batch.describe()}",
            f"at {batch.tip_sha} on {batch.base_ref} {batch.base_sha}",
        )
    elif isolated or regular:
        emit_summary("No ready pull requests could be merged")
    else:
        emit_summary("No pull requests are ready to merge")


def sync_merge_manually_label(candidate: QueueCandidate, *, dry_run: bool) -> None:
    if candidate.changes_validate_workflow is None:
        return

    set_label(
        candidate.number,
        LABEL_MERGE_MANUALLY,
        present=candidate.pr_is_merge_eligible and candidate.changes_validate_workflow,
        current=candidate.pr_eval.merge_manually_label_present,
        dry_run=dry_run,
    )


def build_batch(
    params: StageParams,
    base_sha: str,
    isolated: list[QueueCandidate],
    regular: list[QueueCandidate],
) -> Batch | None:
    with temporary_worktree(base_sha, args=["--detach"]) as worktree_dir:
        git_args = ["-C", worktree_dir]

        # Isolated PRs are tried alone, before any regular batch
        for group, max_size, is_isolated in [
            (isolated, 1, True),
            (regular, params.max_size, False),
        ]:
            entries = fetch_entries(params, group, base_sha)

            with enter_log_group(f"Merge {'isolated ' if is_isolated else ''}candidates"):
                merged, skipped = build_merge_chain(entries, max_size, git_args)

            for entry in skipped:
                # Entries are merged in PR number order
                preceding = [f"#{m.number}" for m in merged if m.number < entry.number]
                onto = " + ".join([QUEUE_BASE_REF, *preceding])
                emit_warning(f"Skipped #{entry.number}: conflicts when merged onto {onto}")

            if merged:
                tip_sha = resolve_head(git_args)

                # Keep the batch reachable once the worktree is removed
                run(["git", "update-ref", params.staging_ref, tip_sha])

                return Batch(
                    base_ref=QUEUE_BASE_REF,
                    base_sha=base_sha,
                    tip_sha=tip_sha,
                    isolated=is_isolated,
                    prs=merged,
                )

    return None


def fetch_entries(
    params: StageParams, candidates: list[QueueCandidate], base_sha: str
) -> list[BatchEntry]:
    """Fetch the candidates' branches, dropping any which moved, have already landed or
    change the validate workflow

    Record whether each candidate that isn't dropped earlier changes the validate workflow.
    """
    entries = []

    for candidate in candidates:
        entry = BatchEntry.for_candidate(candidate)
        remote_ref = f"refs/remotes/{params.remote}/{entry.head_ref}"

        run(
            [
                "git",
                "fetch",
                "--no-tags",
                "--",
                params.remote,
                f"+refs/heads/{entry.head_ref}:{remote_ref}",
            ]
        )

        if (sha := resolve_commit(remote_ref)) != entry.head_sha:
            emit_warning(f"Skipped #{entry.number}: head moved from {entry.head_sha} to {sha}")
            continue

        # A landed pull request stays open until GitHub marks it merged or its
        # branch is deleted, either of which can lag behind the push
        if run_status(["git", "merge-base", "--is-ancestor", entry.head_sha, base_sha]) == 0:
            emit_warning(f"Skipped #{entry.number}: head is already in {QUEUE_BASE_REF}")
            continue

        # Compare against the merge base so a branch which forked before
        # the base changed the workflow doesn't count as changing it
        candidate.changes_validate_workflow = paths_differ(
            f"{base_sha}...{entry.head_sha}", [VALIDATE_WORKFLOW_PATH]
        )
        if candidate.changes_validate_workflow:
            emit_warning(
                f"Skipped #{entry.number}: changes {VALIDATE_WORKFLOW_PATH}"
                " and needs to be merged manually"
            )
            continue

        entries.append(entry)

    return entries
