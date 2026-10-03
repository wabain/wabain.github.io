from __future__ import annotations

import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock

from ...gh_state import BuildState, PullRequestEvaluation
from ..queue_state import (
    Batch,
    BatchEntry,
    QueueCandidate,
    build_merge_chain,
    partition_ready,
    resolve_head,
)


def make_candidate(
    number: int,
    *,
    eligible: bool = True,
    build_state: BuildState = "success",
    isolate: bool = False,
    blocked: bool = False,
    base_ref: str = "develop",
) -> QueueCandidate:
    pr_eval = PullRequestEvaluation(
        raw="{}",
        head_ref=f"branch-{number}",
        head_sha=f"{number:040x}",
        base_ref=base_ref,
        merge_sha=None,
        pr_is_open=True,
        merge_pending_label_present=False,
        merge_isolate_label_present=isolate,
        merge_blocked_label_present=blocked,
        pr_is_eligible=eligible,
        pr_may_be_eligible=eligible,
        pr_is_eligible_up_to_mergeability=eligible,
        pr_eligibility={},
    )
    return QueueCandidate(number=number, pr_eval=pr_eval, build_state=build_state)


def numbers(candidates: list[QueueCandidate]) -> list[int]:
    return [c.number for c in candidates]


class PartitionReadyTest(unittest.TestCase):
    def test_orders_by_number(self) -> None:
        isolated, regular = partition_ready([make_candidate(3), make_candidate(1)])
        self.assertEqual(numbers(isolated), [])
        self.assertEqual(numbers(regular), [1, 3])

    def test_excludes_unready(self) -> None:
        isolated, regular = partition_ready(
            [
                make_candidate(1, eligible=False),
                make_candidate(2, build_state="pending"),
                make_candidate(3, build_state="failure"),
                make_candidate(4, build_state="missing"),
                make_candidate(5, blocked=True),
                make_candidate(6, base_ref="other"),
                make_candidate(7),
            ]
        )
        self.assertEqual(numbers(isolated), [])
        self.assertEqual(numbers(regular), [7])

    def test_separates_isolated(self) -> None:
        isolated, regular = partition_ready(
            [
                make_candidate(4, isolate=True),
                make_candidate(1),
                make_candidate(2, isolate=True),
                make_candidate(3, isolate=True, blocked=True),
            ]
        )
        self.assertEqual(numbers(isolated), [2, 4])
        self.assertEqual(numbers(regular), [1])


class QueueCandidateTest(unittest.TestCase):
    def test_pending(self) -> None:
        self.assertTrue(make_candidate(1, build_state="pending").pending)
        self.assertTrue(make_candidate(1).pending)
        self.assertFalse(make_candidate(1, build_state="failure").pending)
        self.assertFalse(make_candidate(1, blocked=True).pending)


class BatchJsonTest(unittest.TestCase):
    def test_round_trip(self) -> None:
        batch = Batch(
            base_ref="develop",
            base_sha="a" * 40,
            tip_sha="b" * 40,
            isolated=False,
            prs=[BatchEntry(number=1, head_ref="x", head_sha="c" * 40)],
        )
        self.assertNotIn("\n", batch.to_json())
        self.assertEqual(Batch.from_json(batch.to_json()), batch)


class BuildMergeChainTest(unittest.TestCase):
    """Integration tests which build merge chains in a scratch git repo"""

    def setUp(self) -> None:
        tempdir = tempfile.TemporaryDirectory(prefix="merge-chain-test.")
        self.addCleanup(tempdir.cleanup)
        self.repo = Path(tempdir.name)

        env_patch = mock.patch.dict(
            os.environ,
            {
                "GIT_AUTHOR_NAME": "Test",
                "GIT_AUTHOR_EMAIL": "test@example.com",
                "GIT_COMMITTER_NAME": "Test",
                "GIT_COMMITTER_EMAIL": "test@example.com",
                "GIT_CONFIG_GLOBAL": os.devnull,
                "GIT_CONFIG_NOSYSTEM": "1",
            },
        )
        env_patch.start()
        self.addCleanup(env_patch.stop)

        self.git("init", "--quiet", "--initial-branch=develop")
        self.commit_file("a.txt", "base\n")
        self.base = self.head()

    def git(self, *args: str) -> str:
        return subprocess.run(
            ["git", "-C", str(self.repo), *args], check=True, capture_output=True, text=True
        ).stdout.strip()

    def head(self) -> str:
        return self.git("rev-parse", "HEAD")

    def commit_file(self, name: str, content: str) -> None:
        (self.repo / name).write_text(content)
        self.git("add", name)
        self.git("commit", "--quiet", "-m", f"write {name}")

    def make_branch(self, number: int, name: str, content: str) -> BatchEntry:
        self.git("switch", "--quiet", "--detach", self.base)
        self.commit_file(name, content)
        entry = BatchEntry(number=number, head_ref=f"branch-{number}", head_sha=self.head())
        self.git("switch", "--quiet", "--detach", self.base)
        return entry

    def make_batch(self, entries: list[BatchEntry]) -> Batch:
        return Batch(
            base_ref="develop",
            base_sha=self.base,
            tip_sha=self.head(),
            isolated=False,
            prs=entries,
        )

    def test_skips_conflicts(self) -> None:
        pr1 = self.make_branch(1, "b.txt", "one\n")
        pr2 = self.make_branch(2, "b.txt", "two\n")
        pr3 = self.make_branch(3, "c.txt", "three\n")

        merged, skipped = build_merge_chain([pr1, pr2, pr3], 10, ["-C", str(self.repo)])

        self.assertEqual(merged, [pr1, pr3])
        self.assertEqual(skipped, [pr2])
        self.assertEqual(self.git("status", "--porcelain"), "")

        log = self.git("log", "--first-parent", "--format=%s", f"{self.base}..HEAD")
        self.assertEqual(
            log.splitlines(),
            ["Merge pull request #3 from branch-3", "Merge pull request #1 from branch-1"],
        )
        self.assertEqual(self.git("rev-parse", "HEAD^2"), pr3.head_sha)

    def test_max_size(self) -> None:
        pr1 = self.make_branch(1, "b.txt", "one\n")
        pr2 = self.make_branch(2, "b.txt", "two\n")
        pr3 = self.make_branch(3, "c.txt", "three\n")

        merged, skipped = build_merge_chain([pr1, pr2, pr3], 1, ["-C", str(self.repo)])

        self.assertEqual(merged, [pr1])
        self.assertEqual(skipped, [])

    def test_all_conflicting(self) -> None:
        self.commit_file("b.txt", "base change\n")
        tip = self.head()
        pr1 = self.make_branch(1, "b.txt", "one\n")
        self.git("switch", "--quiet", "--detach", tip)

        merged, skipped = build_merge_chain([pr1], 10, ["-C", str(self.repo)])

        self.assertEqual(merged, [])
        self.assertEqual(skipped, [pr1])
        self.assertEqual(resolve_head(["-C", str(self.repo)]), tip)

    def test_merge_commits(self) -> None:
        pr1 = self.make_branch(1, "b.txt", "one\n")
        pr2 = self.make_branch(2, "c.txt", "two\n")
        git_args = ["-C", str(self.repo)]
        build_merge_chain([pr1, pr2], 10, git_args)

        merges = self.make_batch([pr1, pr2]).merge_commits(git_args)

        self.assertEqual(merges, [self.git("rev-parse", "HEAD^"), self.head()])

    def test_merge_commits_rejects_mismatched_batch(self) -> None:
        pr1 = self.make_branch(1, "b.txt", "one\n")
        pr2 = self.make_branch(2, "c.txt", "two\n")
        git_args = ["-C", str(self.repo)]
        build_merge_chain([pr1, pr2], 10, git_args)

        with self.assertRaisesRegex(ValueError, "not a merge of #2"):
            self.make_batch([pr2, pr1]).merge_commits(git_args)

        with self.assertRaisesRegex(ValueError, "expected one merge for each of 1"):
            self.make_batch([pr1]).merge_commits(git_args)
