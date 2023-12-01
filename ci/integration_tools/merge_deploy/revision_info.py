"""
Support for tracking and comparing the refs and SHAs for pull requests and merges
"""

from __future__ import annotations

from dataclasses import dataclass
import dataclasses
import json
from pathlib import Path

from ..gh_state import PullRequestEvaluation
from ..utils import print_info_line


@dataclass(kw_only=True)
class RevisionInfo:
    head_ref: str
    head_sha: str
    base_ref: str
    base_sha: str | None = dataclasses.field(default=None)
    merge_sha: str | None = dataclasses.field(default=None)

    def as_dict(self) -> dict[str, str | None]:
        d = dataclasses.asdict(self)
        if self.base_sha is None:
            del d["base_sha"]
        return d

    @staticmethod
    def for_push(ref: str, sha: str) -> RevisionInfo:
        return RevisionInfo(head_ref=ref, head_sha=sha, base_ref=ref)

    @staticmethod
    def from_pr_eval(pr_eval: PullRequestEvaluation) -> RevisionInfo:
        return RevisionInfo(
            head_ref=pr_eval.head_ref,
            head_sha=pr_eval.head_sha,
            base_ref=pr_eval.base_ref,
            merge_sha=pr_eval.merge_sha,
        )

    @staticmethod
    def load_deploy_json(src: Path) -> RevisionInfo:
        return _load_deploy_revision_info(src)


def verify_revision_consistency(revs: list[tuple[str, RevisionInfo]]) -> bool:
    consistent = True

    rev_dicts = [(name, rev_info.as_dict()) for name, rev_info in revs]

    for key in RevisionInfo.__dataclass_fields__.keys():
        match [(src_name, src[key]) for src_name, src in rev_dicts if key in src]:
            case [(_, first), *rest] as items:
                if any(first != other for _, other in rest):
                    print_info_line(
                        "stale",
                        key,
                        "changed:",
                        *(f"{src_name} {value!r}" for src_name, value in items),
                    )
                    consistent = False

            case []:
                pass

            case other:
                raise RuntimeError(f"unreachable: {other!r}")

    return consistent


def _load_deploy_revision_info(src: Path) -> RevisionInfo:
    try:
        info = json.loads(src.read_text())
    except Exception as e:
        e.add_note(f"failed to load revision info from {src}")
        raise

    match info:
        case {
            "head_ref": str(head_ref),
            "head_sha": str(head_sha),
            "base_ref": str(base_ref),
            "base_ref_sha": str(base_sha),
            "sha": str(merge_sha),
            "tree": str(),
        }:
            return RevisionInfo(
                head_ref=head_ref,
                head_sha=head_sha,
                base_ref=base_ref,
                base_sha=base_sha,
                merge_sha=merge_sha,
            )

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
            return RevisionInfo(head_ref=ref, head_sha=sha, base_ref=ref)

        case _:
            raise ValueError(f"unexpected deploy revision content: {json.dumps(info, indent=2)}")
