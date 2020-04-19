#!/bin/bash

#
# Invoked from a GitHub Action when a condition is hit which might alter
# auto-merge behavior
#

set -euo pipefail

if [ -z "$(echo "$PR_LABELS" | jq -r '.[].name | select(. == "automerge")')" ]; then
    echo "Automerge label is not present; not triggering rerun"
    exit
fi

pr_status="$(
    curl --fail --silent --show-error -L "$STATUSES_URL" |
    jq -r '
        [.[] | select(.context == "continuous-integration/travis-ci/pr")] |
        first |
        select(. != null)
    '
)"

if [ -z "$pr_status" ]; then
    echo "Travis CI PR run not found; not triggering rerun"
    exit
fi

# Hack: derive the restart endpoint from the status URL
restart_url="$(
    echo "$pr_status" |
    jq -r '
        .target_url |
        capture("^https://travis-ci.(?<tld>com|org)/github/(?<repo>[^/]+/[^/]+)/builds/(?<build_id>[^/?]+)/*(\\?.*)?$") |
        @uri "https://api.travis-ci.\(.tld)/build/\(.build_id)/restart"
    '
)"

if [ -z "$restart_url" ]; then
    echo "Did not get expected status target URL format in $pr_status"
    exit 1
fi

echo "Auth token SHA:"
shasum <(printf "$TRAVIS_CI_TOKEN")

echo "Triggering rerun with URL $restart_url"

status_code="$(
    curl --silent -XPOST \
        --output /dev/stderr \
        --write-out "%{http_code}" \
        -H "Content-Type: application/json" \
        -H "Accept: application/json" \
        -H "Travis-API-Version: 3" \
        -H "Authorization: token $TRAVIS_CI_TOKEN" \
        "$restart_url"
)"

# Terminate the stderr-printed payload
echo >&2

if [ -z "$status_code" ] || [ "$status_code" -ge 300 ]; then
    echo "Unexpected reply code: $status_code"
    exit 22
fi
