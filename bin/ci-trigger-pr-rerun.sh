#!/bin/bash

#
# Invoked from a GitHub Action when a condition is hit which might alter
# auto-merge behavior
#

set -euo pipefail

pr="$(bin/ci-evaluate-pr.sh)"

echo "PR attributes:"
echo "$pr" | jq -C

if [[ "$(echo "$pr" | jq '.pr_is_eligible')" != "true" ]]; then
    echo "PR is currently ineligible for automerge; not triggering rerun"

    if [[ "$(echo "$pr" | jq '.merge_pending_label_present')" == "true" ]]; then
        bin/ci-update-pr-label.sh "$PR_NUMBER" del merge-pending
    fi

    exit
fi

branch_filter="$(echo "$pr" | jq -r '@uri "\(.head_ref)"')"
page=1
per_page=25

while true; do
    url="$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/actions/runs?event=pull_request&branch=$branch_filter&per_page=$per_page&page=$page"

    echo "::group ::Page $page"

    run_page="$(
        curl --silent --show-error --fail \
            -H "Authorization: token $GH_TOKEN" \
            -H 'Accept: application/vnd.github.v3+json' \
            "$url"
    )"

    # Drop verbose fields which don't add anything meaningful (.pull_requests already links them)
    echo "$run_page" | jq -C '.workflow_runs[] |= (del(.repository) | del(.head_repository))'

    echo "::endgroup::"

    search_out="$(
        echo "$run_page" | \
        jq \
            --argjson pr "$pr" \
            --argjson pr_number "$PR_NUMBER" \
            --argjson page "$page" \
            --argjson per_page "$per_page" \
            '
                [
                    .workflow_runs[] |
                    select(
                        # No obvious better way to identify the workflow than
                        # filtering by name
                        .name == "Build and test"
                            and .event == "pull_request"
                            and .head_sha == $pr.head_commit
                    )
                ] as $located |
                ($page * $per_page < .total_count) as $more |
                ([.total_count - $per_page * ($page - 1), $per_page] | min) as $expected_count |
                if (.workflow_runs | length) != $expected_count then
                    error("Expected \($expected_count) elements, got \(.workflow_runs | length)")
                else
                    {
                        located: $located | first,
                        more: $more,
                    }
                end
            '
    )"

    prior_workflow_run="$(echo "$search_out" | jq .located)"

    if [[ "$prior_workflow_run" != 'null' ]]; then
        break
    fi

    if [[ "$(echo "$search_out" | jq .more)" == 'false' ]]; then
        echo "Did not find a prior workflow run matching the PR attributes"
        echo "Not triggering rerun"
        exit
    fi

    page=$(( $page + 1 ))
done

echo "Prior PR test run:"
echo "$prior_workflow_run" | jq -C 'del(.repository) | del(.head_repository)'

prior_workflow_run_status="$(echo "$prior_workflow_run" | jq -r '.status')"

if [[ "$prior_workflow_run_status" != 'completed' ]]; then
    # Not clear if this necessarily means it will converge, but we can't
    # straightforwardly rerun it
    echo "Prior workflow run is not completed; not triggering rerun"

    # Add the merge-pending label as a hint that this PR should be mergeable
    # (contingent on the ongoing run); this should help drive us to a state
    # where we merge it or refute its mergeability
    if [[ "$(echo "$pr" | jq '.merge_pending_label_present')" == "false" ]]; then
        bin/ci-update-pr-label.sh "$PR_NUMBER" add merge-pending
    fi

    exit
fi

if [[ "$(echo "$prior_workflow_run" | jq -r '.conclusion')" != 'success' ]]; then
    echo "Prior workflow run was not successful; not triggering rerun"
    exit
fi

if [[ "$(echo "$pr" | jq '.merge_pending_label_present')" == "false" ]]; then
    bin/ci-update-pr-label.sh "$PR_NUMBER" add merge-pending
fi

dispatch_url="$(echo "$prior_workflow_run" | jq -r '"\(.workflow_url)/dispatches"')"

dispatch_params="$(echo "$pr" | jq '{
    ref: .head_ref,
    inputs: {
        pull_request_number: env.PR_NUMBER,
    }
}')"

echo "Triggering run at $dispatch_url with $dispatch_params"

status_code="$(
    curl --silent -XPOST \
        --output /dev/stderr \
        --write-out "%{http_code}" \
        -H "Authorization: token $GH_WRITE_TOKEN" \
        -H 'Accept: application/vnd.github.v3+json' \
        "$dispatch_url" \
        -d "$dispatch_params"
)"

# Terminate the stderr-printed payload
echo >&2

if [ "$status_code" -ne 204 ]; then
    echo "Unexpected reply code: $status_code"
    exit 22
fi
