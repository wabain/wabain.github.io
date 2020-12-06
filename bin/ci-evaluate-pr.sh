#!/bin/bash

# Output PR mergeability evaluation as determined by ci/pull-request.jq
#
# Assumptions
# ===========
#
# This script assumes it is run from repo root and expects exclusive access to
# some scratch files under /tmp.
#
# Inputs
# ======
#
# Expects environment variables GH_TOKEN, PR_NUMBER, GITHUB_*.

set -euo pipefail

curl --silent --show-error --fail \
    -H "Authorization: token $GH_TOKEN" \
    -H 'Accept: application/vnd.github.v3+json' \
    "$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/pulls/$PR_NUMBER" \
    -o /tmp/pr.json

curl --silent --show-error --fail \
    -H "Authorization: token $GH_TOKEN" \
    -H 'Accept: application/vnd.github.v3+json' \
    "$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/pulls/$PR_NUMBER/reviews" \
    -o /tmp/pr-reviews.json

jq --slurp --compact-output -f ci/pull-request/pull-request.jq /tmp/pr.json /tmp/pr-reviews.json
