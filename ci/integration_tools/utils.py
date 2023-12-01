from __future__ import annotations

import contextlib
import shlex
import subprocess
import tempfile
from typing import Generator, Iterable

from .output import AnsiStyle, print_info_line


def validate_branch_ref(branch: str) -> None:
    run(["git", "check-ref-format", "--branch", branch])


def resolve_commit(rev: str) -> str:
    return run(
        ["git", "rev-parse", "--verify", "--end-of-options", rev + "^{commit}"]
    ).removesuffix("\n")


@contextlib.contextmanager
def temporary_worktree(rev: str, args: Iterable[str] = ()) -> Generator[str, None, None]:
    with tempfile.TemporaryDirectory(prefix="worktree.") as tempdir:
        run(["git", "worktree", "add", *args, "--", tempdir, rev])
        try:
            yield tempdir
        finally:
            run(["git", "worktree", "remove", "-f", tempdir])


def run(args: list[str], *, env=None, capture_output: bool = True) -> str:
    print_info_line("run", *(shlex.quote(s) for s in args))
    out = subprocess.run(args, check=True, encoding="utf8", capture_output=capture_output, env=env)
    if out.stderr is not None:
        for line in out.stderr.splitlines():
            print_info_line("stderr:", line, header_style=AnsiStyle.DimWhite)
    return out.stdout or ""
