# Merge queue

Pull requests labelled `automerge` are merged in batches by
[`merge-queue.yml`](../.github/workflows/merge-queue.yml), which builds the
combined result once and then pushes it to `develop` and deploys it.

GitHub's own merge queue isn't available for repositories owned by a user
account, and the deploy has to be pushed atomically alongside `develop` anyway.

## Flow

Each run of `merge-queue.yml`:

1. Stages a batch (`bin/ci-tools stage-batch`). Starting from `develop`, it
   merges a sequence of ready pull requests onto a branch, skipping any that
   conflict. The result is force-pushed to `refs/ci-tools/merge-queue/staging`.
2. Builds the batch by calling `validate.yml` with the batch commit.
3. Lands the batch (`bin/ci-tools land-batch`). It re-evaluates every pull
   request in the batch. If any is no longer eligible to merge, the batch is
   abandoned and nothing is pushed. Otherwise a single atomic push updates
   `develop`, deletes the PR branches, and pushes the deploy commit to `master`
   with its tag. Each updated ref is guarded by a `--force-with-lease` argument.
4. On a build failure, the failure is recorded in the batch's pull requests
   (`bin/ci-tools record-batch-failure`).

A pull request is _ready_ when it:

- is open, not a draft, and targets `develop`
- has the `automerge` label
- is authored or approved by the repository owner
- has a successful `Build and test` pull request run for its current head
  commit
- does not have the `merge-blocked` label

PR build records expire, so an old pull request may need to be rebuilt (for
example by asking dependabot to rebase it) before it becomes ready.

## Labels

Labels are the only state that persists between runs. Every run re-derives its
batch from the open pull requests and their labels.

- `automerge`: opts a pull request in. Not updated by CI.
- `merge-pending`: informational. Set while a pull request is eligible to merge
  and its build is passing or in progress. Updated but not consumed by CI.
- `merge-isolate`: set on every pull request in a failed multi-PR batch. While
  any ready pull request has it, the queue builds only the single
  lowest-numbered such PR, alone, and builds no regular batch. This retries the
  PRs of a failed batch one at a time.
- `merge-blocked`: set, with a comment, when a pull request fails to build
  alone. It supersedes `merge-isolate`. Blocked pull requests are excluded until
  someone removes the label, after which they're batched normally again.

No labels are added if merging fails due to a cancelled build, a failed push
(for instance because `develop` moved), or a pull request changing before
landing; the next run retries.

Apart from the label rules above, there's no way to request that particular pull
requests get built as a batch; we need requests to run `merge-queue.yml` to be
interchangeable in order for the mutual exclusion rules to work.

## Triggering and mutual exclusion

The `merge-queue.yml` workflow runs on a `workflow_dispatch` trigger and on an
hourly schedule as a fallback. Its concurrency group allows only one active run.
GitHub keeps at most one more run pending and cancels it if a newer one is
queued. Since every run plans from scratch, dropping a pending run loses
nothing.

The [`merge-queue-trigger.yml`](../.github/workflows/merge-queue-trigger.yml)
workflow handles the pull request events that can make a pull request ready. It
evaluates that pull request, and dispatches the queue if it's ready. For some
events the `merge-queue-trigger.yml` workflow is read from the pull request
branch, so its token may have read-only access to repository contents.

The queue also dispatches itself after landing a batch or recording a failure,
since there may be more ready pull requests. An abandoned batch doesn't dispatch
a follow-up, since nothing changed; its pull requests are picked up by the
trigger or the schedule. As a backstop, follow-up runs carry a `chain_depth`
input, and a run at `MERGE_QUEUE_MAX_CHAIN_DEPTH` (10) dispatches no further
follow-up, leaving a warning instead. Runs from the trigger or schedule start at
depth 0.

## Staging ref

The staging and build jobs run separately, so the batch commits need to be on
the remote for the build to check them out. They're pushed to
`refs/ci-tools/merge-queue/staging` (outside `refs/heads/`, so they don't show
up as a branch). The ref is overwritten by each run.

## Dry run

While `MERGE_QUEUE_DRY_RUN` is `"true"` (set in both workflows), batches are
staged and built as normal, but nothing is pushed to `develop` or `master`, no
labels are changed, no comments or approvals are posted, and the queue doesn't
dispatch itself.
