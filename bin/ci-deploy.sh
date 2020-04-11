#!/bin/bash

## Adapted from https://gist.github.com/domenic/ec8b0fc8ab45f39403dd and
## https://github.com/marionettejs/marionettejs.com/blob/da632860fd0e9b4437d8230d0bf3fc369164db2c/travis-runner.sh

set -euo pipefail

JEKYLL_BUILD_DIR=_site

PUSH_PAGES_DEPLOY=false
PUSH_ARGS=(--follow-tags --atomic origin)

main() {
    echo "Content to be deployed is:"
    tree -ah "$JEKYLL_BUILD_DIR"

    # Deploy only if we push to the develop branch
    if [[ "$TRAVIS_BRANCH" != "develop" || "$TRAVIS_PULL_REQUEST" != "false" ]]; then
        echo "Not deploying (branch: $TRAVIS_BRANCH, pull request: $TRAVIS_PULL_REQUEST)"
        exit 0
    fi

    # Fail this step if a previous step failed
    if [ "$TRAVIS_TEST_RESULT" -ne 0 ]; then
        echo "Not deploying; prior build steps were not successful"
        exit 1
    fi

    evaluate_pages_deploy

    if [[ "$PUSH_PAGES_DEPLOY" != "true" ]]; then
        echo "Nothing to push"
        exit 0
    fi

    if [[ "${CI_DRY_RUN:-}" != "false" ]]; then
        echo "Environment variable CI_DRY_RUN=${CI_DRY_RUN:-}; setting dry-run flag"
        PUSH_ARGS=(--dry-run "${PUSH_ARGS[@]}")
    fi

    # Redirect output to /dev/null to hide any sensitive credential data that
    # might otherwise be exposed.
    git remote set-url --push origin "https://${GH_TOKEN}@${GH_REF}" &> /dev/null

    echo "Attempting push: git push ${PUSH_ARGS[@]}"
    git push "${PUSH_ARGS[@]}"
}

evaluate_pages_deploy() {
    local base_dir
    local deploy_src
    local deploy_number
    local deploy_tag

    # Travis won't have pulled in the master branch previously, so we need to
    # do it now
    git fetch --quiet origin +refs/heads/master:refs/remotes/origin/master

    base_dir="$PWD"
    deploy_src="$(git rev-parse HEAD)"

    # If we are handling a previously pushed commit, bail if we are rebuilding
    # the last deployed commit, as determined using the deploy tags
    if [[ "$TRAVIS_EVENT_TYPE" == "push" || "$TRAVIS_EVENT_TYPE" == "cron" ]]; then
        local has_prior="$(
            git ls-remote --tags origin "deploy/master/*-$deploy_src^{}" |
            jq -R -r --arg prior_deploy "$(git rev-parse origin/master)" '
                capture("^(?<commit>[0-9a-f]+)\trefs/tags/(?<tag>.+)\\^{}$") |
                select(.commit == $prior_deploy) |
                "Source commit already deployed via \(.commit) (\(.tag))"
            '
        )"

        if [ ! -z "$has_prior" ]; then
            echo "$has_prior"
            return
        fi
    fi

    # Get the number of commits there will be on the deploy branch; this will
    # give us a monotonically increasing deploy number (up to history rewrites
    # and deploy branch changes).
    deploy_number="$(git rev-list origin/master | wc -l)"
    deploy_number="$(( $deploy_number+1 ))"

    # We should be safe checking out master because CI won't run this script
    # with it as the current branch
    git worktree add --quiet --no-checkout ../deploy -B master origin/master

    rsync -a "$JEKYLL_BUILD_DIR/" ../deploy

    cd ../deploy

    touch .nojekyll

    git -c core.excludesfile="$base_dir/.deploy-gitignore" add -A .
    git commit --quiet --allow-empty \
        -m "Deploy to GitHub Pages [$deploy_number]" \
        -m "Source commit for this deployment:" \
        -m "$(git show --no-patch --format=fuller "$deploy_src")"

    cd "$base_dir"

    deploy_tag="deploy/master/$deploy_number-$deploy_src"

    git tag -a "$deploy_tag" master \
        -m "Deploy $deploy_number triggered by ${TRAVIS_EVENT_TYPE/_/ }" \
        -m "$TRAVIS_JOB_WEB_URL"

    PUSH_PAGES_DEPLOY=true
    PUSH_ARGS+=("master:master")

    summarize_push origin/master master "$deploy_tag"
}

summarize_push() {
    echo "Intending to push to $1"

    # Print the tag first with no commit details
    git show --no-patch --format= "$3"
    echo

    git log --decorate --graph --summary --stat "$1..$2"
    echo
}

main
