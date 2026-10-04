"""
Support for tracking and comparing the ref and SHA a deploy build was made from
"""

from __future__ import annotations

from dataclasses import dataclass
import dataclasses
import json
from pathlib import Path

from ..output import print_info_line


@dataclass(kw_only=True)
class RevisionInfo:
    ref: str
    sha: str

    @staticmethod
    def load_deploy_json(src: Path) -> RevisionInfo:
        return _load_deploy_revision_info(src)


def verify_revision_consistency(revs: list[tuple[str, RevisionInfo]]) -> bool:
    consistent = True

    for field in dataclasses.fields(RevisionInfo):
        items = [(src_name, getattr(rev, field.name)) for src_name, rev in revs]
        if len({value for _, value in items}) > 1:
            print_info_line(
                "stale",
                field.name,
                "changed:",
                *(f"{src_name} {value!r}" for src_name, value in items),
            )
            consistent = False

    return consistent


def _load_deploy_revision_info(src: Path) -> RevisionInfo:
    try:
        info = json.loads(src.read_text())
    except Exception as e:
        e.add_note(f"failed to load revision info from {src}")
        raise

    match info:
        case {
            "ref": str(ref),
            "sha": str(sha),
            "tree": str(),
            **other,
        } if not {
            "head_ref",
            "head_sha",
            "base_ref",
            "base_ref_sha",
        }.intersection(other):
            return RevisionInfo(ref=ref, sha=sha)

        case _:
            raise ValueError(f"unexpected deploy revision content: {json.dumps(info, indent=2)}")
