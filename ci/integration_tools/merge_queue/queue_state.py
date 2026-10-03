"""
Merge queue eligibility and batch selection. See ci/merge-queue.md for an overview.
"""

from __future__ import annotations

from dataclasses import dataclass
import dataclasses
import json
from typing import Any, Iterable, Sequence

from ..gh_state import (
    BuildState,
    PullRequestEvaluation,
    add_label,
    evaluate_pull_request_state,
    get_pull_request_build_state,
    remove_label,
)
from ..merge_deploy import merge_prep
from ..output import print_info_multi
from ..utils import run

QUEUE_BASE_REF = "develop"

# Planned batches are pushed here for the build job to check out. Namespaced
# under ci-tools to stay clear of refs other merge queue tools might use.
STAGING_REF = "refs/ci-tools/merge-queue/staging"

LABEL_AUTOMERGE = "automerge"
LABEL_MERGE_PENDING = "merge-pending"
LABEL_MERGE_ISOLATE = "merge-isolate"
LABEL_MERGE_BLOCKED = "merge-blocked"


@dataclass(kw_only=True)
class QueueCandidate:
    number: int
    pr_eval: PullRequestEvaluation
    build_state: BuildState

    @property
    def pr_is_merge_eligible(self) -> bool:
        """Whether the pull request is eligible for the queue, disregarding its build state"""
        return is_queueable(self.pr_eval)

    @property
    def ready(self) -> bool:
        """Whether the pull request can be included in a batch"""
        return self.pr_is_merge_eligible and self.build_state == "success"

    @property
    def pending(self) -> bool:
        """Whether the pull request should be labelled as pending merge"""
        return self.pr_is_merge_eligible and self.build_state in ("success", "pending")

    @property
    def isolated(self) -> bool:
        return self.pr_eval.merge_isolate_label_present


def is_queueable(pr_eval: PullRequestEvaluation) -> bool:
    return (
        pr_eval.pr_is_open
        and pr_eval.pr_is_eligible_up_to_mergeability
        and not pr_eval.merge_blocked_label_present
        and pr_eval.base_ref == QUEUE_BASE_REF
    )


def evaluate_candidate(pr_number: int) -> QueueCandidate:
    pr_eval = evaluate_pull_request_state(pr_number)
    build_state = get_pull_request_build_state(pr_eval.head_sha)
    return QueueCandidate(number=pr_number, pr_eval=pr_eval, build_state=build_state)


def is_queue_relevant(pull: dict[str, Any]) -> bool:
    """Whether a pull request from the GitHub API listing needs to be evaluated"""
    return any(label["name"] in (LABEL_AUTOMERGE, LABEL_MERGE_PENDING) for label in pull["labels"])


def partition_ready(
    candidates: Iterable[QueueCandidate],
) -> tuple[list[QueueCandidate], list[QueueCandidate]]:
    """Split ready candidates into isolated and regular lists, ordered by PR number"""
    ready = sorted((c for c in candidates if c.ready), key=lambda c: c.number)
    return [c for c in ready if c.isolated], [c for c in ready if not c.isolated]


def set_label(pr_number: int, label: str, *, present: bool, current: bool, dry_run: bool) -> None:
    if present == current:
        return

    if dry_run:
        action = "post [dry-run]" if present else "delete [dry-run]"
        print_info_multi(action, f"PR {pr_number}", "label", label)
    elif present:
        add_label(pr_number, label)
    else:
        remove_label(pr_number, label)


def sync_merge_pending_label(candidate: QueueCandidate, *, dry_run: bool) -> None:
    set_label(
        candidate.number,
        LABEL_MERGE_PENDING,
        present=candidate.pending,
        current=candidate.pr_eval.merge_pending_label_present,
        dry_run=dry_run,
    )


@dataclass(kw_only=True)
class BatchEntry:
    number: int
    head_ref: str
    head_sha: str

    @staticmethod
    def for_candidate(candidate: QueueCandidate) -> BatchEntry:
        return BatchEntry(
            number=candidate.number,
            head_ref=candidate.pr_eval.head_ref,
            head_sha=candidate.pr_eval.head_sha,
        )

    def merge_message(self) -> str:
        return f"Merge pull request #{self.number} from {self.head_ref}"


@dataclass(kw_only=True)
class Batch:
    base_ref: str
    base_sha: str
    tip_sha: str
    isolated: bool
    prs: list[BatchEntry]

    def to_json(self) -> str:
        return json.dumps(dataclasses.asdict(self), separators=(",", ":"))

    @staticmethod
    def from_json(src: str) -> Batch:
        data = json.loads(src)
        prs = [BatchEntry(**entry) for entry in data.pop("prs")]
        return Batch(**data, prs=prs)

    def describe(self) -> str:
        return describe_entries(self.prs)

    def merge_commits(self, global_git_args: Sequence[str] = ()) -> list[str]:
        """Return the merge commit for each pull request, in batch order.

        The batch tip must be a first-parent chain of merges onto the base, one
        for each pull request, as built by build_merge_chain.
        """
        rev_list = run(
            [
                "git",
                *global_git_args,
                "rev-list",
                "--first-parent",
                "--parents",
                f"{self.base_sha}..{self.tip_sha}",
            ]
        )
        commits = [line.split() for line in reversed(rev_list.splitlines())]

        if len(commits) != len(self.prs):
            raise ValueError(
                f"batch tip {self.tip_sha} has {len(commits)} commits on {self.base_sha},"
                f" expected one merge for each of {len(self.prs)} pull requests"
            )

        parent = self.base_sha
        for commit, entry in zip(commits, self.prs):
            if commit[1:] != [parent, entry.head_sha]:
                raise ValueError(
                    f"batch commit {commit[0]} is not a merge of #{entry.number}"
                    f" ({entry.head_sha}) onto {parent}"
                )
            parent = commit[0]

        return [commit[0] for commit in commits]


def describe_entries(entries: Iterable[BatchEntry]) -> str:
    return ", ".join(f"#{entry.number}" for entry in entries)


def build_merge_chain(
    entries: Sequence[BatchEntry],
    max_size: int,
    global_git_args: Sequence[str] = (),
) -> tuple[list[BatchEntry], list[BatchEntry]]:
    """Merge entries into HEAD in order, skipping any which conflict.

    Return the merged and skipped entries. Stop once max_size entries are merged.
    """
    merged: list[BatchEntry] = []
    skipped: list[BatchEntry] = []

    for entry in entries:
        if len(merged) >= max_size:
            break

        if merge_prep.try_merge_commit(entry.head_sha, entry.merge_message(), global_git_args):
            merged.append(entry)
        else:
            skipped.append(entry)

    return merged, skipped


def resolve_head(global_git_args: Sequence[str] = ()) -> str:
    return run(["git", *global_git_args, "rev-parse", "--verify", "HEAD^{commit}"]).removesuffix(
        "\n"
    )
