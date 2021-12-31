#!/bin/bash

#
# Invoked from a GitHub Action on a cron schedule to poll for whether an
# automergeable PR exists for which merge should now be triggered
#
# Expected variables: as used by bin/ci-update-pr-label.sh
#

set -euo pipefail

page=1
per_page=25
candidates='[]'

while true; do
    # Search open PRs, oldest first
    params="state=open&sort=created&direction=asc&per_page=$per_page&page=$page"
    url="$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/pulls?$params"

    echo "::group ::Page $page"

    run_page="$(
        curl --silent --show-error --fail \
            -H "Authorization: token $GH_TOKEN" \
            -H 'Accept: application/vnd.github.v3+json' \
            "$url"
    )"

    # Drop verbose fields which don't add anything meaningful
    echo "$run_page" | jq -C 'del(.[]["head", "base"].repo) | del(.[].body)'

    echo "::endgroup::"

    candidates="$(
        echo "$run_page" | \
        jq --argjson candidates "$candidates" \
            '$candidates + [.[] | select(.labels[].name == "merge-pending")]'
    )"

    maybe_more="$(
        echo "$run_page" | jq --argjson per_page "$per_page" 'length == $per_page'
    )"

    if [[ "$maybe_more" == 'false' ]]; then
        break
    fi

    page=$(( $page + 1 ))
done

echo "::group ::Located candidates"

echo "Candidates: $(echo "$candidates" | jq -C 'del(.[]["head", "base"].repo) | del(.[].body)')"
echo

echo "::endgroup::"

candidate_selected=0

while IFS= read -r candidate; do
    if [ -z "$candidate" ]; then
        continue
    fi

    pr_number="$(echo "$candidate" | jq -r .number)"
    pr_eval="$(PR_NUMBER="$pr_number" bin/ci-evaluate-pr.sh)"

    echo "Eligibility for PR $pr_number: $(echo "$pr_eval" | jq -C)"

    if [[ "$(echo "$pr_eval" | jq '.pr_may_be_eligible')" != "true" ]]; then
        echo "PR $pr_number is no longer eligible for automerge"
        bin/ci-update-pr-label.sh "$pr_number" del merge-pending
        continue
    fi

    if [[ "$(echo "$pr_eval" | jq '.pr_is_eligible')" != "true" ]]; then
        echo "PR $pr_number is not eligible for automerge until mergeability is reevaluated"
        continue
    fi

    if [ $candidate_selected -eq 0 ]; then
        echo "Select re-execution for PR $pr_number"
        echo "::set-output name=pr_number::$pr_number"
        echo "::set-output name=pr_eval::$pr_eval"

        candidate_selected=1
    fi
done <<< "$(echo "$candidates" | jq -c '.[]')"
