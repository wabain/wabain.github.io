#!/bin/bash

#
# Invoked from a GitHub Action on a cron schedule to poll for whether an
# automergeable PR exists for which merge should now be triggered
#
# Expected variables: as used by bin/ci-update-pr-label.sh and bin/ci-rerun-pr-workflow.sh
#

set -euo pipefail

page=1
per_page=25
candidates='[]'

while true; do
    url="$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/pulls?state=open&per_page=$per_page&page=$page"

    echo "::group ::Page $page"

    run_page="$(
        curl --silent --show-error --fail \
            -H "Authorization: token $GH_TOKEN" \
            -H 'Accept: application/vnd.github.v3+json' \
            "$url"
    )"

    # Drop verbose fields which don't add anything meaningful
    echo "$run_page" | jq -C 'del(.[]["head", "base"].repo)'

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

echo "Candidates: $(echo "$candidates" | jq -C 'del(.[]["head", "base"].repo)')"

rerun_triggered=0

while IFS= read -r candidate; do
    pr_number="(echo "$candidate" | jq -r .number)"
    pr_eval="$(PR_NUMBER="$pr_number" bin/ci-evaluate-pr.sh)"

    if [[ "$(echo "$pr_eval" | jq '.pr_is_eligible')" != "true" ]]; then
        echo "PR $pr_number is no longer eligible for automerge"
        bin/ci-update-pr-label.sh "$pr_number" del merge-pending
        continue
    fi

    if [ $rerun_triggered -eq 0 ]; then
        echo "Retriggering execution for PR $pr_number"
        bin/ci-rerun-pr-workflow.sh "$pr_number" "$pr"

        rerun_triggered=1
    fi
done <<< "$(echo "$candidates" | jq -c '.[]')"
