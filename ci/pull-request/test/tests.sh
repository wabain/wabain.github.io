#!/bin/bash

#
# Validate the pull request examination logic
#

set -euo pipefail

cd "$(dirname "$0")/.."

echo >&2 "Running in $(pwd)"
echo >&2

PASSED=0
FAILED=0
ERRORED=0

run-test() {
    local name
    name="$1"
    shift

    printf >&2 "TEST: $name ... "

    local arg_count actual actual_code
    arg_count=$(( $# - 1 ))
    actual_code=0
    actual="$( "${@:1:$arg_count}" )" || actual_code=$?

    if [ $actual_code -ne 0 ]; then
        echo >&2 "COMMAND FAILED: ${@:1:$arg_count} ($actual_code)"
        echo >&2
        ERRORED=$(( $ERRORED + 1 ))
        return
    fi

    local expected expected_code
    expected_code=0
    expected="$(jq -n '$ARGS.positional[0]' --jsonargs "${@: -1}")" || expected_code=$?

    if [ $expected_code -ne 0 ]; then
        echo >&2 "expected value invalid: ${@: -1}"
        echo >&2
        ERRORED=$(( $ERRORED + 1 ))
        return
    fi

    if diff -U10 <(echo "$expected") <(echo "$actual"); then
        echo >&2 "ok"
        PASSED=$(( $PASSED + 1 ))
    else
        echo >&2 "FAILED: $name"
        echo >&2
        FAILED=$(( $FAILED + 1 ))
    fi
}

run-test "First party: Eligible" \
    jq -s -f pull-request.jq test/first-party.pr.json test/none.pr-reviews.json \
    '{
        "head_ref": "ci-statuses",
        "head_commit": "cfed5c2a3dd2e301a29000c511ae3feb0507c381",
        "merge_commit": "5444c4152d815ee49bf240ae6aba9b8b0a0ff288",
        "merge_pending_label_present": false,
        "pr_is_eligible": true,
        "pr_may_be_eligible": true,
        "pr_eligibility": {
            "automerge_label_present": true,
            "author_is_owner": true,
            "approver_is_owner": false,
            "mergeable": true,
            "non_draft": true
        }
    }'

run-test "No automerge label" \
    jq -s -f pull-request.jq \
        <(jq '.labels[] |= select(.name != "automerge")' test/first-party.pr.json) \
        test/none.pr-reviews.json \
    '{
        "head_ref": "ci-statuses",
        "head_commit": "cfed5c2a3dd2e301a29000c511ae3feb0507c381",
        "merge_commit": "5444c4152d815ee49bf240ae6aba9b8b0a0ff288",
        "merge_pending_label_present": false,
        "pr_is_eligible": false,
        "pr_may_be_eligible": false,
        "pr_eligibility": {
            "automerge_label_present": false,
            "author_is_owner": true,
            "approver_is_owner": false,
            "mergeable": true,
            "non_draft": true
        }
    }'

run-test "Not mergeable" \
    jq -s -f pull-request.jq \
        <(jq '.mergeable = false' test/first-party.pr.json) \
        test/none.pr-reviews.json \
    '{
        "head_ref": "ci-statuses",
        "head_commit": "cfed5c2a3dd2e301a29000c511ae3feb0507c381",
        "merge_commit": "5444c4152d815ee49bf240ae6aba9b8b0a0ff288",
        "merge_pending_label_present": false,
        "pr_is_eligible": false,
        "pr_may_be_eligible": false,
        "pr_eligibility": {
            "automerge_label_present": true,
            "author_is_owner": true,
            "approver_is_owner": false,
            "mergeable": false,
            "non_draft": true
        }
    }'

run-test "Null mergeability" \
    jq -s -f pull-request.jq \
        <(jq '.mergeable = null' test/first-party.pr.json) \
        test/none.pr-reviews.json \
    '{
        "head_ref": "ci-statuses",
        "head_commit": "cfed5c2a3dd2e301a29000c511ae3feb0507c381",
        "merge_commit": "5444c4152d815ee49bf240ae6aba9b8b0a0ff288",
        "merge_pending_label_present": false,
        "pr_is_eligible": false,
        "pr_may_be_eligible": true,
        "pr_eligibility": {
            "automerge_label_present": true,
            "author_is_owner": true,
            "approver_is_owner": false,
            "mergeable": null,
            "non_draft": true
        }
    }'

run-test "Draft" \
    jq -s -f pull-request.jq \
        <(jq '.draft = true' test/first-party.pr.json) \
        test/none.pr-reviews.json \
    '{
        "head_ref": "ci-statuses",
        "head_commit": "cfed5c2a3dd2e301a29000c511ae3feb0507c381",
        "merge_commit": "5444c4152d815ee49bf240ae6aba9b8b0a0ff288",
        "merge_pending_label_present": false,
        "pr_is_eligible": false,
        "pr_may_be_eligible": false,
        "pr_eligibility": {
            "automerge_label_present": true,
            "author_is_owner": true,
            "approver_is_owner": false,
            "mergeable": true,
            "non_draft": false
        }
    }'

run-test "Third-party: Approved by owner" \
    jq -s -f pull-request.jq test/third-party.pr.json test/third-party.pr-reviews.json \
    '{
        "head_ref": "dependabot/npm_and_yarn/lodash-4.17.19",
        "head_commit": "9d3b5c3b9d0bc29341e71d1a19100173b5a82edb",
        "merge_commit": "2fd095284174e8574b56a4735a204f030eadf8e6",
        "merge_pending_label_present": false,
        "pr_is_eligible": true,
        "pr_may_be_eligible": true,
        "pr_eligibility": {
            "automerge_label_present": true,
            "author_is_owner": false,
            "approver_is_owner": true,
            "mergeable": true,
            "non_draft": true
        }
    }'

run-test "Third-party: Unapproved" \
    jq -s -f pull-request.jq test/third-party.pr.json test/none.pr-reviews.json \
    '{
        "head_ref": "dependabot/npm_and_yarn/lodash-4.17.19",
        "head_commit": "9d3b5c3b9d0bc29341e71d1a19100173b5a82edb",
        "merge_commit": "2fd095284174e8574b56a4735a204f030eadf8e6",
        "merge_pending_label_present": false,
        "pr_is_eligible": false,
        "pr_may_be_eligible": false,
        "pr_eligibility": {
            "automerge_label_present": true,
            "author_is_owner": false,
            "approver_is_owner": false,
            "mergeable": true,
            "non_draft": true
        }
    }'

run-test "Third-party: Approved by other" \
    jq -s -f pull-request.jq \
        test/third-party.pr.json \
        <(jq '.[].author_association = "NONE"' test/third-party.pr-reviews.json) \
    '{
        "head_ref": "dependabot/npm_and_yarn/lodash-4.17.19",
        "head_commit": "9d3b5c3b9d0bc29341e71d1a19100173b5a82edb",
        "merge_commit": "2fd095284174e8574b56a4735a204f030eadf8e6",
        "merge_pending_label_present": false,
        "pr_is_eligible": false,
        "pr_may_be_eligible": false,
        "pr_eligibility": {
            "automerge_label_present": true,
            "author_is_owner": false,
            "approver_is_owner": false,
            "mergeable": true,
            "non_draft": true
        }
    }'

echo >&2
echo >&2 "Passed: $PASSED, Failed: $FAILED, Errored: $ERRORED"

case "$ERRORED:$FAILED" in
0:0)
    echo >&2 Success
    exit 0
    ;;

0:*)
    exit 1
    ;;

*)
    exit 2
    ;;
esac
