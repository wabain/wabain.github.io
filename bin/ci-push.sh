#!/bin/bash

## Adapted from https://gist.github.com/domenic/ec8b0fc8ab45f39403dd and
## https://github.com/marionettejs/marionettejs.com/blob/da632860fd0e9b4437d8230d0bf3fc369164db2c/travis-runner.sh

set -euo pipefail

BASE_DIR="$PWD"
JEKYLL_BUILD_DIR=_site
DEPLOY_DIR="$BASE_DIR/../deploy"

PUSH_PR_MERGE=false
PUSH_PAGES_DEPLOY=false
PUSH_ARGS=(--follow-tags --atomic origin)

main() {
    # In practice, the build will probably fail much earlier in this case, but
    # there's no point proceeding otherwise
    if [[ "$TRAVIS_SECURE_ENV_VARS" != "true" ]]; then
        echo "No secure env vars available, not attempting CI push"
        exit 0
    fi

    echo "Deployment content is:"
    tree -ah "$JEKYLL_BUILD_DIR"

    create_deploy_tree
    git -c color.ui=always diff origin/master $DEPLOY_TREE

    # Fail this step if a previous step failed
    if [ "$TRAVIS_TEST_RESULT" -ne 0 ]; then
        echo "Not pushing; prior build steps were not successful"
        exit 1
    fi

    evaluate_pr_merge
    evaluate_pages_deploy

    if [[ "$PUSH_PR_MERGE" != "true" && "$PUSH_PAGES_DEPLOY" != "true" ]]; then
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
    echo "(PR merge: $PUSH_PR_MERGE, Pages deploy: $PUSH_PAGES_DEPLOY)"

    git push "${PUSH_ARGS[@]}"
}

# Deploy pull requests only after filtering for eligibility
evaluate_pr_merge() {
    local pr
    local head_ref
    local head_commit
    local merge_commit
    local ci_commit
    local push_commit

    if [[ "$TRAVIS_PULL_REQUEST" == "false" ]]; then
        return
    fi

    curl -s \
        -H "Authorization: token $GH_TOKEN" \
        -H 'Accept: application/vnd.github.v3+json' \
        "https://api.github.com/repos/$TRAVIS_REPO_SLUG/pulls/$TRAVIS_PULL_REQUEST" \
        > /tmp/pr.json

    curl -s \
        -H "Authorization: token $GH_TOKEN" \
        -H 'Accept: application/vnd.github.v3+json' \
        "https://api.github.com/repos/$TRAVIS_REPO_SLUG/pulls/$TRAVIS_PULL_REQUEST/reviews" \
        > /tmp/pr-reviews.json

    pr="$(jq --slurp -f ci/pull-request/pull-request.jq /tmp/pr.json /tmp/pr-reviews.json)"

    echo "PR attributes:"
    echo "$pr" | jq -C

    if [[ "$(echo "$pr" | jq '.pr_is_eligible')" != "true" ]]; then
        echo "Not auto-merging ineligible pull request"
        return
    fi

    head_ref="$(echo "$pr" | jq -r '.head_ref')"
    head_commit="$(echo "$pr" | jq -r '.head_commit')"
    merge_commit="$(echo "$pr" | jq -r '.merge_commit')"

    ci_commit="$(git rev-parse HEAD)"

    if [[ "$ci_commit" != "$merge_commit" ]]; then
        echo "Not auto-merging stale pull request (commit under test: $ci_commit, $head_ref merge: $merge_commit)"
        return
    fi

    git commit --quiet --amend --no-edit \
        -m "Merge pull request #$TRAVIS_PULL_REQUEST from $head_ref"

    push_commit="$(git rev-parse HEAD)"

    PUSH_PR_MERGE=true
    PUSH_ARGS+=(
        "$push_commit:$TRAVIS_BRANCH"
        ":$head_ref"
        "--force-with-lease=$head_ref:$head_commit"
    )

    summarize_push "origin/$TRAVIS_BRANCH" "$push_commit" ""
}

create_deploy_tree() {
    # Travis won't have pulled in the master branch previously, so we need to
    # do it now
    git fetch --quiet origin +refs/heads/master:refs/remotes/origin/master

    # We should be safe checking out master because CI won't run this script
    # with it as the current branch
    git worktree add --quiet --no-checkout $DEPLOY_DIR -B master origin/master

    rsync -a "$JEKYLL_BUILD_DIR/" $DEPLOY_DIR
    touch $DEPLOY_DIR/.nojekyll

    git_deploy_tree add -A .
    DEPLOY_TREE=$(git_deploy_tree write-tree)
}

git_deploy_tree() {
    git \
        --git-dir=$DEPLOY_DIR/.git \
        --work-tree=$DEPLOY_DIR \
        -c core.excludesfile=$BASE_DIR/.deploy-gitignore \
        "$@"
}

evaluate_pages_deploy() {
    local deploy_src
    local deploy_number
    local deploy_description
    local deploy_tag

    # Deploy to GitHub pages only if we're targeting the develop branch
    if [[ "$TRAVIS_BRANCH" != "develop" ]] || [[ "$TRAVIS_PULL_REQUEST" != "false" && "$PUSH_PR_MERGE" == "false" ]]; then
        echo "Not deploying to GitHub Pages (branch: $TRAVIS_BRANCH, pull request: $TRAVIS_PULL_REQUEST)"
        return
    fi

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

    deploy_description="$(describe_deploy "$deploy_number")"

    git_deploy_tree commit --quiet --allow-empty \
        -m "Deploy to GitHub Pages [$deploy_description]" \
        -m "Source commit for this deployment:" \
        -m "$(git show --no-patch --format=fuller "$deploy_src")"

    deploy_tag="deploy/master/$deploy_number-$deploy_src"

    git tag -a "$deploy_tag" master \
        -m "Deploy $deploy_description triggered by ${TRAVIS_EVENT_TYPE/_/ }" \
        -m "$TRAVIS_JOB_WEB_URL"

    PUSH_PAGES_DEPLOY=true
    PUSH_ARGS+=("master:master")

    summarize_push origin/master master "$deploy_tag"

    # If we are not simultaneously pushing a merge commit, re-push our source
    # commit for this deployment. This should be a no-op; if it fails, then it
    # indicates there was a more recent push to the source branch, and the
    # deploy push will also fail.
    #
    # This allows last-commit-wins discipline even in the presence of multiple
    # inflight merges, at the cost of risking a more stale deployment if the
    # deployment of a later commit fails.
    if [[ "$PUSH_PR_MERGE" == "false" ]]; then
        PUSH_ARGS+=(
            "$TRAVIS_BRANCH:$TRAVIS_BRANCH"
            "--force-with-lease=$TRAVIS_BRANCH:$TRAVIS_BRANCH"
        )
    fi
}

describe_deploy() {
    local deploy_number="$1"

    if [[ "$TRAVIS_PULL_REQUEST" != "false" ]]; then
        echo "$deploy_number from PR #$TRAVIS_PULL_REQUEST"
    else
        echo "$deploy_number"
    fi
}

summarize_push() {
    echo "Intending to push to $1"

    # Print the tag first with no commit details
    if [ ! -z "$3" ]; then
        git -c color.ui=always show --no-patch --format= "$3"
        echo
    fi

    git -c color.ui=always log --decorate --graph --summary --stat "$1..$2"
    echo
}

main
