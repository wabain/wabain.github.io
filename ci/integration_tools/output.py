from __future__ import annotations

import contextlib
from enum import Enum
import functools
import os
import sys
from typing import Any, Callable, TypeVar


@contextlib.contextmanager
def enter_log_group(title: str):
    if not is_within_github_action():
        yield
        return

    try:
        if is_within_github_action():
            print(f"::group::{title}", file=sys.stderr)
        else:
            print_info_line("group", title)

        yield
    finally:
        if is_within_github_action():
            print("::endgroup::", file=sys.stderr)
        else:
            print_info_line("endgroup", title)


_T = TypeVar("_T")


def log_group(title: str) -> Callable[[_T], _T]:
    return functools.partial(_run_in_log_group, title)


def _run_in_log_group(title: str, f):
    @functools.wraps(f)
    def run_in_log_group(*args, **kwargs):
        with enter_log_group(title):
            return f(*args, **kwargs)

    return run_in_log_group


class AnsiStyle(Enum):
    BoldRed = "\033[1;31m"
    BoldYellow = "\033[1;33m"
    BoldWhite = "\033[1;37m"
    DimWhite = "\033[2;37m"
    Cyan = "\033[0;36m"
    Reset = "\033[0m"

    def __call__(self, *args: Any) -> str:
        return "".join((self.value, " ".join(str(a) for a in args), AnsiStyle.Reset.value))


def print_info_line(prefix: str, *etc: Any, header_style: AnsiStyle = AnsiStyle.BoldWhite) -> None:
    print(header_style(prefix), *etc, file=sys.stderr)


def print_info_multi(prefix: str, subhead: str, *etc: Any) -> None:
    print(
        AnsiStyle.BoldWhite(prefix),
        *([AnsiStyle.Cyan(subhead)] if subhead else ()),
        file=sys.stderr,
    )

    if etc:
        print(AnsiStyle.DimWhite(*etc), file=sys.stderr)


class MessageType(Enum):
    Notice = "notice"
    Warn = "warning"
    Error = "error"

    def emit(self, *message: Any) -> None:
        is_gh_action = is_within_github_action()
        for line in " ".join(str(a) for a in message).splitlines():
            if is_gh_action:
                print(f"::{self.value}::", line, file=sys.stderr)
            else:
                print_info_line(self.value, line, header_style=self.style)

    @property
    def style(self) -> AnsiStyle:
        match self:
            case MessageType.Warn:
                return AnsiStyle.BoldYellow
            case MessageType.Error:
                return AnsiStyle.BoldRed
            case MessageType.Notice | _:
                return AnsiStyle.BoldWhite


emit_notice = MessageType.Notice.emit
emit_warning = MessageType.Warn.emit
emit_error = MessageType.Error.emit


def emit_summary(*content: Any, title: str | None = None) -> None:
    prefix = f"summary: {title}" if title else "summary"
    rendered = " ".join(str(a) for a in content).removesuffix("\n")

    print_info_line(prefix, rendered)

    if is_within_github_action() and (summary_path := os.getenv("GITHUB_STEP_SUMMARY")) is not None:
        with open(summary_path, mode="a") as f:
            if title:
                f.write(f"## {title}\n")
            f.write(f"{rendered}\n")


def is_within_github_action() -> bool:
    # Double-check for actions mostly just to make the dependency explicit
    return os.getenv("GITHUB_ACTIONS") == "true"
