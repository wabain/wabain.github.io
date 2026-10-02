from __future__ import annotations

import contextlib
from pathlib import Path
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
    out = _run(args, env=env, capture_output=capture_output, check=True)
    return out.stdout or ""


def run_status(args: list[str], *, env=None) -> int:
    out = _run(args, env=env, capture_output=False, check=False)
    return out.returncode


def _run(
    args: list[str], *, env=None, capture_output: bool, check: bool
) -> subprocess.CompletedProcess[str]:
    print_info_line("run", *(shlex.quote(s) for s in args))
    out = subprocess.run(args, check=check, encoding="utf8", capture_output=capture_output, env=env)
    if out.stderr is not None:
        for line in out.stderr.splitlines():
            print_info_line("stderr:", line, header_style=AnsiStyle.DimWhite)
    return out


def record_output(outputs_file: Path | None, name: str, value: str) -> None:
    """Record a step output variable by appending it to the given outputs file.

    If `outputs_file` is `None`, this just prints the variable. Neither `name`
    nor `value` may contain newlines.
    """
    assert "\n" not in name, repr(name)
    assert "\n" not in value, repr(value)

    print_info_line("output", f"{name}={value}")

    if outputs_file is None:
        return

    with open(outputs_file, "a", encoding="utf8") as f:
        f.write(f"{name}={value}\n")
