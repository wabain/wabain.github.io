from __future__ import annotations
import contextlib
import functools
import os

import shlex
import subprocess
import sys
import tempfile
from typing import Any, Callable, Generator, Iterable, TypeVar


def validate_branch_ref(branch: str) -> None:
    run(["git", "check-ref-format", "--branch", branch])


@contextlib.contextmanager
def temporary_worktree(rev: str, args: Iterable[str] = ()) -> Generator[str, None, None]:
    with tempfile.TemporaryDirectory(prefix="worktree.") as tempdir:
        run(["git", "worktree", "add", *args, "--", tempdir, rev])
        try:
            yield tempdir
        finally:
            run(["git", "worktree", "remove", "-f", tempdir])


@contextlib.contextmanager
def enter_log_group(title: str):
    # Double-check for actions mostly just to make the dependency explicit
    if os.getenv("GITHUB_ACTIONS") != "true":
        yield
        return

    try:
        print(f"::group::{title}", file=sys.stderr)
        yield
    finally:
        print("::endgroup::", file=sys.stderr)


_T = TypeVar("_T")


def log_group(title: str) -> Callable[[_T], _T]:
    return functools.partial(_run_in_log_group, title)


def _run_in_log_group(title: str, f):
    @functools.wraps(f)
    def run_in_log_group(*args, **kwargs):
        with enter_log_group(title):
            return f(*args, **kwargs)

    return run_in_log_group


def run(args: list[str], *, env=None, capture_output: bool = True) -> str:
    print_info_line("run", *(shlex.quote(s) for s in args))
    out = subprocess.run(args, check=True, encoding="utf8", capture_output=capture_output, env=env)
    if out.stderr is not None:
        for line in out.stderr.splitlines():
            print(f"\033[2;37mstderr:\033[0m", line, file=sys.stderr)
    return out.stdout or ""


def print_info_line(prefix: str, *etc: Any) -> None:
    print(f"\033[1;37m{prefix}\033[0m", *etc, file=sys.stderr)


def print_info_multi(prefix: str, subhead: str, *etc: Any) -> None:
    print(
        f"\033[1;37m{prefix}\033[0m",
        *([f"\033[0;36m{subhead}\033[0m"] if subhead else ()),
        file=sys.stderr,
    )

    if etc:
        first, *rest = etc
        print(f"\033[2;37m{first}", *rest, end="\033[0m\n", file=sys.stderr)
