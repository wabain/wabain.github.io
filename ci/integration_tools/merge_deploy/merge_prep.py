from __future__ import annotations

import itertools
import os
import subprocess
from tempfile import NamedTemporaryFile
from typing import Sequence

from ..gh_state import PullRequestEvaluation
from ..utils import run, run_status


def pull_request_merge_ref(pr_number: int) -> str:
    raise NotImplementedError("todo: remove")
    return f"refs/pull/{pr_number}/merge"


def create_merge_commit(
    head_ref: str,
    message: str,
    global_git_args: Sequence[str] = (),
    recover: bool = True,
) -> None:
    try:
        with NamedTemporaryFile(mode="wt+", prefix="merge-message.", suffix=".txt") as message_file:
            message_file.write(message)
            message_file.flush()

            run(
                [
                    "git",
                    *global_git_args,
                    "merge",
                    "--no-ff",
                    "--commit",
                    "-F",
                    message_file.name,
                    head_ref,
                ],
                capture_output=False,
            )

    except subprocess.CalledProcessError as exc:
        exc.add_note(f"failed to create merge commit for {head_ref}")

        if recover and (
            run_status(
                ["git", *global_git_args, "rev-parse", "--verify", "--quiet", "MERGE_HEAD"],
            )
            != 1
        ):
            run(["git", *global_git_args, "merge", "--abort"], capture_output=False)
            exc.add_note("aborted merge in progress")

        raise


def rewrite_pull_request_merge_commit_message(
    pr_number: int,
    pr_eval: PullRequestEvaluation,
    global_git_args: Sequence[str] = (),
) -> None:
    head_data = run(
        ["git", *global_git_args, "show", "--format=%H %cD", "--no-patch", "HEAD"]
    ).removesuffix("\n")

    match head_data.split(" ", maxsplit=1):
        case [sha, existing_date] if sha == pr_eval.merge_sha:
            pass

        case [sha, _]:
            raise ValueError(
                f"unexpected HEAD commit: expected to be at merge SHA for PR {pr_number} ({pr_eval.merge_sha}) but got {sha}"
            )

        case _:
            raise ValueError(f"unexpected HEAD data: {head_data!r}")

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
