from __future__ import annotations

import itertools
import os
from typing import Sequence

from .gh_state import PullRequestEvaluation
from .utils import run


def pull_request_merge_ref(pr_number: int) -> str:
    return f"refs/pull/{pr_number}/merge"


def set_pull_request_merge_commit_message(
    pr_number: int, pr_eval: PullRequestEvaluation, global_git_args: Sequence[str] = ()
) -> None:
    existing_date = run(
        ["git", *global_git_args, "show", "--format=%cD", "--no-patch", "HEAD"]
    ).removesuffix("\n")

    amend_env = os.environ.copy()
    for role, value_type in itertools.product(["AUTHOR", "COMMITTER"], ["NAME", "EMAIL", "DATE"]):
        key = f"GIT_{role}_{value_type}"
        if key in amend_env:
            del amend_env[key]
    amend_env["GIT_COMMITTER_DATE"] = existing_date

    run(
        [
            "git",
            *global_git_args,
            "commit",
            "--amend",
            "--no-edit",
            "-m",
            f"Merge pull request #{pr_number} from {pr_eval.head_ref}",
        ],
        env=amend_env,
    )
