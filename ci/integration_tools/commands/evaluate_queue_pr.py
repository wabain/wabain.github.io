"""Check whether a pull request is ready for the merge queue

Updates the merge-pending label and sets the `ready` output.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from ..merge_queue.queue_state import evaluate_candidate, sync_merge_pending_label
from ..output import emit_summary
from ..utils import record_output


def init_parser(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--pr-number", type=int, required=True)
    parser.add_argument(
        "--outputs-file", help="File where step output should be written", type=Path
    )
    parser.add_argument("--dry-run", action="store_true", help="Don't update labels")


def run_command(*, pr_number: int, outputs_file: Path | None, dry_run: bool) -> None:
    candidate = evaluate_candidate(pr_number)
    sync_merge_pending_label(candidate, dry_run=dry_run)

    record_output(outputs_file, "ready", "true" if candidate.ready else "false")
    emit_summary(
        f"Pull request #{pr_number}",
        "is" if candidate.ready else "is not",
        f"ready for the merge queue (build {candidate.build_state})",
    )
