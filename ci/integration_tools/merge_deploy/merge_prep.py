from __future__ import annotations

from typing import Sequence

from ..utils import run, run_status


def try_merge_commit(
    head_rev: str,
    message: str,
    global_git_args: Sequence[str] = (),
) -> bool:
    """Merge head_rev into HEAD with a merge commit.

    Return False, leaving HEAD unchanged, if the merge has conflicts.
    """
    status = run_status(
        ["git", *global_git_args, "merge", "--no-ff", "--no-edit", "-m", message, head_rev]
    )

    if status == 0:
        return True

    # A failure which leaves a merge in progress indicates conflicts; anything
    # else is unexpected
    if run_status(["git", *global_git_args, "rev-parse", "--verify", "--quiet", "MERGE_HEAD"]) != 0:
        raise RuntimeError(f"failed to merge {head_rev}: exit code {status}")

    run(["git", *global_git_args, "merge", "--abort"])
    return False
