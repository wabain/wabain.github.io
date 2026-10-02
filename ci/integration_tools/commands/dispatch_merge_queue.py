"""Dispatch a run of the merge queue workflow

Without --chain-depth, dispatches a run as an external trigger. With it,
dispatches a follow-up to a merge queue run at that depth, unless that would
exceed --max-chain-depth. See ci/merge-queue.md.
"""

from __future__ import annotations

import argparse
import json

from ..gh_state import REPO, get_github_api
from ..merge_queue.queue_state import QUEUE_BASE_REF
from ..output import emit_summary, emit_warning

MERGE_QUEUE_WORKFLOW = "merge-queue.yml"


def init_parser(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--chain-depth", type=int, help="Depth of the dispatching run")
    parser.add_argument("--max-chain-depth", type=int)


def run_command(*, chain_depth: int | None, max_chain_depth: int | None) -> None:
    inputs: dict[str, str] = {}

    if chain_depth is not None:
        if max_chain_depth is None:
            raise ValueError("--max-chain-depth is required with --chain-depth")

        next_depth = chain_depth + 1

        if next_depth > max_chain_depth:
            message = f"Not dispatching a follow-up run: reached the chain depth limit ({max_chain_depth})"
            emit_warning(message)
            emit_summary(message)
            return

        inputs["chain_depth"] = str(next_depth)

    get_github_api(
        f"/repos/{REPO}/actions/workflows/{MERGE_QUEUE_WORKFLOW}/dispatches",
        method="POST",
        data=json.dumps({"ref": QUEUE_BASE_REF, "inputs": inputs}).encode(),
    )
