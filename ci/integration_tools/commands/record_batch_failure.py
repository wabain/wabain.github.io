"""Label the pull requests in a merge queue batch whose build failed

PRs in a failed batch of several are labeled with "merge-isolate" to be retried
alone. A PR which fails alone is labeled "merge-blocked" and will not be rerun
until the label is removed.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

from ..gh_state import add_comment, evaluate_pull_request_state
from ..merge_queue.queue_state import (
    LABEL_MERGE_BLOCKED,
    LABEL_MERGE_ISOLATE,
    LABEL_MERGE_PENDING,
    QUEUE_BASE_REF,
    Batch,
    set_label,
)
from ..output import emit_summary, print_info_multi


def init_parser(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--batch-file",
        type=Path,
        required=True,
        help="JSON file describing the batch, as produced by stage-batch",
    )
    parser.add_argument("--run-url", required=True, help="URL describing this run")
    parser.add_argument("--dry-run", action="store_true")


@dataclass(kw_only=True)
class FailureParams:
    batch_file: Path
    run_url: str
    dry_run: bool


def run_command(**kwargs) -> None:
    params = FailureParams(**kwargs)
    batch = Batch.from_json(params.batch_file.read_text())

    if len(batch.prs) > 1:
        for entry in batch.prs:
            pr_eval = evaluate_pull_request_state(entry.number)
            set_label(
                entry.number,
                LABEL_MERGE_ISOLATE,
                present=True,
                current=pr_eval.merge_isolate_label_present,
                dry_run=params.dry_run,
            )

        emit_summary("Batch", batch.describe(), "failed; its pull requests will be retried alone")
        return

    [entry] = batch.prs
    pr_eval = evaluate_pull_request_state(entry.number)

    for label, present, current in [
        (LABEL_MERGE_BLOCKED, True, pr_eval.merge_blocked_label_present),
        (LABEL_MERGE_ISOLATE, False, pr_eval.merge_isolate_label_present),
        (LABEL_MERGE_PENDING, False, pr_eval.merge_pending_label_present),
    ]:
        set_label(entry.number, label, present=present, current=current, dry_run=params.dry_run)

    body = (
        f"The merge queue [failed to build] this pull request merged alone onto "
        f"`{QUEUE_BASE_REF}` at {batch.base_sha}. Remove the `{LABEL_MERGE_BLOCKED}` label "
        f"to retry.\n\n[failed to build]: {params.run_url}"
    )

    if params.dry_run:
        print_info_multi("comment [dry-run]", f"PR {entry.number}", body)
    else:
        add_comment(entry.number, body)

    emit_summary(f"Pull request #{entry.number} failed alone and is now blocked")
