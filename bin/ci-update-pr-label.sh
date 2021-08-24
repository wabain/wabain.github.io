#!/bin/bash

set -euo pipefail

# Usage: bin/ci-update-pr-label.sh pr_number (add|del) label
#
#   bin/ci-update-pr-label.sh 100 add some-label
#   bin/ci-update-pr-label.sh 101 del some-label
#
# Expected variables: GH_BOT_TOKEN, repository-level variables GITHUB_*

pr_number="${1:-}"
action="${2:-}"
label="${3:-}"

case "$#:$action" in
3:add)
    echo >&2 "Setting $label label"

    params="$(LABEL="$label" jq --null-input --raw-output '{ labels: [env.LABEL] }')"
    url="$(
        PR="$pr_number" jq --null-input --raw-output \
            '"\(env.GITHUB_API_URL)/repos/\(env.GITHUB_REPOSITORY)" + @uri "/issues/\(env.PR)/labels"'
    )"

    echo "POST to $url with $params"

    curl --silent --show-error --fail -XPOST \
        -H "Authorization: token $GH_BOT_TOKEN" \
        -H 'Accept: application/vnd.github.v3+json' \
        "$url" -d "$params"

    echo >& "Setting $label label: complete"
    ;;

3:del)
    echo >&2 "Clearing $label label"

    url="$(
        PR="$pr_number" LABEL="$label" jq --null-input --raw-output \
            '"\(env.GITHUB_API_URL)/repos/\(env.GITHUB_REPOSITORY)" + @uri "/issues/\(env.PR)/labels/\(env.LABEL)"'
    )"

    echo "DELETE from $url"

    curl --silent --show-error --fail -XDELETE \
        -H "Authorization: token $GH_BOT_TOKEN" \
        -H 'Accept: application/vnd.github.v3+json' \
        "$url"

    echo >&2 "Clearing $label label: complete"
    ;;

*)
    echo >&2 "Usage: $0 pr_number (add|del) label"
    exit 1
esac
