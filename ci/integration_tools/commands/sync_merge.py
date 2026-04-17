"""Create a merge commit between two remote-ref branches.

Optionally validate that the resulting tree either matches a given ref's, or
that the given ref is a merge between an ancestor of the base ref and the head
ref.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import json
from pathlib import Path
import subprocess
from typing import Literal

from ..merge_deploy import merge_prep

from ..output import emit_error
from ..utils import (
    record_output,
    resolve_commit,
    resolve_tree,
    run,
    run_status,
    validate_branch_ref,
)


def init_parser(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--remote", default="origin")
    parser.add_argument("--base-ref", required=True)
    parser.add_argument("--head-ref", required=True)
    parser.add_argument("-m", "--message", help="Merge commit message", required=True)
    parser.add_argument("--reconcile-tree-from", dest="reconcile_tree")
    parser.add_argument(
        "--outputs-file", help="File where step output should be written", type=Path
    )


@dataclass(kw_only=True)
class SyncParams:
    remote: str
    head_ref: str
    base_ref: str
    reconcile_tree: str | None
    message: str
    outputs_file: Path | None

    def remote_head_ref(self) -> str:
        return f"refs/remotes/{self.remote}/{self.head_ref}"

    def remote_base_ref(self) -> str:
        return f"refs/remotes/{self.remote}/{self.base_ref}"

    def record_output(self, name: str, value: str) -> None:
        record_output(self.outputs_file, name, value)


def run_command(**kwargs) -> None:
    params = SyncParams(**kwargs)

    validate_branch_ref(params.head_ref)
    validate_branch_ref(params.base_ref)

    run(["git", "switch", "--detach", "--discard-changes", params.remote_base_ref()])
    merge_prep.create_merge_commit(params.remote_head_ref(), params.message)

    stale = not reconcile_tree(params)
    params.record_output("stale", json.dumps(stale))


def reconcile_tree(params: SyncParams) -> bool:
    if params.reconcile_tree is None:
        return True

    source_state = run(
        ["git", "show", "--format=%P %T", "--no-patch", params.reconcile_tree]
    ).removesuffix("\n")

    match source_state.split(" ", maxsplit=4):
        case [base_sha, head_sha, tree_sha]:
            pass
        case _:
            raise ValueError(
                f"cannot reconcile parent/tree for {params.reconcile_tree}: {source_state!r}"
            )

    expected_head_sha = resolve_commit(params.remote_head_ref())

    if head_sha != expected_head_sha:
        tree_reconciliation_failed(params.reconcile_tree, "head", expected_head_sha, head_sha)
        return False

    expected_base_sha = resolve_commit(params.remote_base_ref())
    expected_tree_sha = resolve_tree("HEAD")

    if base_sha == expected_base_sha:
        if expected_tree_sha != tree_sha:
            tree_reconciliation_failed(params.reconcile_tree, "tree", expected_tree_sha, tree_sha)
            return False

        return True

    match run_status(["git", "merge-base", "--is-ancestor", base_sha, expected_base_sha]):
        case 0:
            pass

        case 1:
            emit_error(
                f"failed to reconcile repo state with {params.reconcile_tree}: "
                f"base {base_sha} is not an ancestor of expected base {expected_base_sha}"
            )
            return False

        case code:
            raise ValueError(
                f"failed to determine ancestor relationship between {base_sha} "
                f"and {expected_base_sha}: exit code {code}"
            )

    return True


def tree_reconciliation_failed(
    tree_ref: str, element: Literal["base", "head", "tree"], actual_sha: str, reconcile_sha: str
) -> None:
    emit_error(
        f"failed to reconcile repo state with {tree_ref}: "
        f"current {element} {actual_sha} does not match {reconcile_sha}"
    )
