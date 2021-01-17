#!/bin/bash

#
# Invoked from a GitHub Action when a condition is hit which might alter
# auto-merge behavior
#
# Expected variables: PR_NUMBER and variables used by bin/ci-update-pr-label.sh
# and bin/ci-rerun-pr-workflow.sh
#

set -euo pipefail

pr="$(bin/ci-evaluate-pr.sh)"

echo "PR attributes:"
echo "$pr" | jq -C

if [[ "$(echo "$pr" | jq '.pr_may_be_eligible')" == "true" ]]; then
    # Add the merge-pending label as a hint that this PR should be mergeable;
    # regardless of what happens below this should help drive us to a state
    # where we merge it or refute its mergeability
    if [[ "$(echo "$pr" | jq '.merge_pending_label_present')" == "false" ]]; then
        bin/ci-update-pr-label.sh "$PR_NUMBER" add merge-pending
    fi
else
    echo "PR is currently ineligible for automerge; not triggering rerun"

    if [[ "$(echo "$pr" | jq '.merge_pending_label_present')" == "true" ]]; then
        bin/ci-update-pr-label.sh "$PR_NUMBER" del merge-pending
    fi

    exit
fi

bin/ci-rerun-pr-workflow.sh "$PR_NUMBER" "$pr"
