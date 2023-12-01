#!/usr/bin/env python3

from __future__ import annotations

import argparse
import subprocess
import sys
import traceback

from . import commands
from .output import AnsiStyle, emit_error, print_info_line


def main():
    parser = argparse.ArgumentParser(prog="ci-tools")

    subparsers = parser.add_subparsers(required=True, dest="cmd")

    subparsers_by_name = {}

    for impl in commands.SUBCOMMAND_IMPLS:
        name = impl.__name__.rsplit(".", maxsplit=1)[-1].replace("_", "-")
        subparsers_by_name[name] = impl

        subparser = subparsers.add_parser(
            name,
            description=impl.__doc__,
            help=impl.__doc__.lstrip().split("\n", maxsplit=1)[0],
        )

        impl.init_parser(subparser)

    args = parser.parse_args()

    try:
        impl = subparsers_by_name[args.cmd]
    except KeyError:
        raise ValueError(f"unhandled command {args.cmd!r}")

    subcmd_args = vars(args).copy()
    del subcmd_args["cmd"]

    try:
        impl.run_command(**subcmd_args)

    except subprocess.CalledProcessError as exc:
        emit_error("fatal: unsuccessful internal command")
        if exc.stderr:
            for line in exc.stderr.splitlines():
                print_info_line("stderr:", line, header_style=AnsiStyle.DimWhite)

        traceback.print_exception(exc, file=sys.stderr)
        sys.exit(1)


main()
