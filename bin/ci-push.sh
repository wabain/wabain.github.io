#!/bin/bash

# Based loosely on https://gist.github.com/domenic/ec8b0fc8ab45f39403dd

set -euo pipefail

# Expected variables: BASE_DIR, GH_BOT_TOKEN, HEAD_REF, BASE_REF,
# EFFECTIVE_EVENT, PR_NUMBER, PR_EVAL, RELEASE_VERSION, GITHUB_*

CHECKOUT_DIR="$PWD"
JEKYLL_BUILD_DIR="$BASE_DIR/site"
REVISIONS_JSON="$BASE_DIR/site.revisions.json"
DEPLOY_DIR="$BASE_DIR/deploy"

RUN_URL="$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"

# Mutable globals
HAS_DEPLOY_TREE=false
DEPLOY_NUMBER=
PUSH_PR_MERGE=false
PUSH_PAGES_DEPLOY=false
PUSH_ARGS=(--follow-tags --atomic origin)

main() {
    start_group "Update refs"
    update_refs
    end_group

    if [ -e "$JEKYLL_BUILD_DIR" ]; then
        start_group "Prepare deploy content"

        echo "Deployment content is:"
        tree -ah "$JEKYLL_BUILD_DIR"

        create_deploy_tree
        git -c color.ui=always diff origin/master $DEPLOY_TREE

        end_group
    fi

    start_group "Check for PR merge"
    evaluate_pr_merge
    end_group

    start_group "Check for Pages deploy"
    evaluate_pages_deploy
    end_group

    if [[ "$PUSH_PR_MERGE" != "true" && "$PUSH_PAGES_DEPLOY" != "true" ]]; then
        echo "Nothing to push"
        exit 0
    fi

    if [[ "${CI_DRY_RUN:-}" != "false" ]]; then
        echo "Environment variable CI_DRY_RUN=${CI_DRY_RUN:-}; setting dry-run flag"
        PUSH_ARGS=(--dry-run "${PUSH_ARGS[@]}")
    fi

    # If the owner approval criterion wasn't met then attach a review to satisfy
    # the branch protection rules
    if [[ "$PUSH_PR_MERGE" == "true" && "$(echo "$PR_EVAL" | jq '.pr_eligibility.approver_is_owner')" == "false" ]]; then
        start_group "Attach review approval to PR"

        local review_params="$(echo "$PR_EVAL" | jq --arg run_url "$RUN_URL" '{
            commit_id: .head_commit,
            event: "APPROVE",
            body: (
                "Approving [automatically] based on the following criteria:\n\n" +
                "```json\n\(.pr_eligibility | tojson)\n```\n\n" +
                "[automatically]: \($run_url)"
            )
        }')"

        echo "Parameters: $review_params"

        if [ -z "$GH_BOT_TOKEN" ]; then
            echo "error: GH_BOT_TOKEN environment variable not provided"
            exit 1
        fi

        local status_code="$(
            curl --silent -XPOST \
                --output /dev/stderr \
                --write-out "%{http_code}" \
                -H "Authorization: token $GH_BOT_TOKEN" \
                -H 'Accept: application/vnd.github.v3+json' \
                "$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/pulls/$PR_NUMBER/reviews" \
                -d "$review_params"
        )"

        # Terminate the stderr-printed payload
        echo >&2

        if [ "$status_code" -ne 200 ]; then
            echo "Failed to create PR review"
            exit 22
        fi

        end_group
    fi

    echo "Attempting push: git push ${PUSH_ARGS[@]}"
    echo "(PR merge: $PUSH_PR_MERGE, Pages deploy: $PUSH_PAGES_DEPLOY)"

    git push "${PUSH_ARGS[@]}"

    if [[ "$PUSH_PAGES_DEPLOY" == "true" ]]; then
        sentry_cli releases deploys "$RELEASE_VERSION" new \
            --name "$DEPLOY_NUMBER" \
            --env production \
            --url "$RUN_URL"
    fi
}

start_group() {
    # Double-check for actions mostly just to make the dependency explicit
    if [[ "${GITHUB_ACTIONS:-}" == true ]]; then
        echo "::group::$1"
    fi
}

end_group() {
    if [[ "${GITHUB_ACTIONS:-}" == true ]]; then
        echo '::endgroup::'
    fi
}

update_refs() {
    # Ensure we have any refs/revs we may be working with available locally

    echo Updating master ref

    # For master we need a non-shallow history

    git fetch --quiet --no-tags origin +refs/heads/master:refs/remotes/origin/master
    if ! git rev-parse master &> /dev/null; then
        git branch --quiet master refs/remotes/origin/master
        echo "Created local master branch"
    fi

    if [ ! -z "$PR_NUMBER" ]; then
        echo "Updating head/base refs $HEAD_REF and $BASE_REF"

        git fetch --quiet --no-tags --depth=1 origin \
            "+refs/heads/$BASE_REF:refs/remotes/origin/$BASE_REF"

        # Trying to specify the parent shas of the base commit as shallow-exclude
        # arguments causes some kind of server-side error, so fetch the head ref
        # excluding the base ref and then deepen it by one.
        git fetch --quiet --no-tags --shallow-exclude="refs/heads/$BASE_REF" origin \
            "+refs/heads/$HEAD_REF:refs/remotes/origin/$HEAD_REF"

        git fetch --quiet --no-tags --deepen=1 origin \
            "+refs/heads/$HEAD_REF:refs/remotes/origin/$HEAD_REF"

        if ! git rev-parse "$HEAD_REF" &> /dev/null; then
            git branch --quiet "$HEAD_REF" "refs/remotes/origin/$HEAD_REF"
            echo "Created shallow local $HEAD_REF branch"
        fi

        if ! git rev-parse "$BASE_REF" &> /dev/null; then
            git branch --quiet "$BASE_REF" "refs/remotes/origin/$BASE_REF"
            echo "Created shallow local $BASE_REF branch"
        fi
    fi
}

# Deploy pull requests only after filtering for eligibility
evaluate_pr_merge() {
    local head_ref
    local head_commit
    local push_commit

    if [ -z "$PR_NUMBER" ]; then
        return
    fi

    echo "PR attributes:"
    echo "$PR_EVAL" | jq -C

    if [[ "$(echo "$PR_EVAL" | jq '.pr_is_eligible')" != "true" ]]; then
        echo "Not auto-merging ineligible pull request"
        return
    fi

    head_ref="$(echo "$PR_EVAL" | jq -r '.head_ref')"
    head_commit="$(echo "$PR_EVAL" | jq -r '.head_commit')"

    git checkout "refs/remotes/origin/pull/$PR_NUMBER/merge"

    git commit --quiet --amend --no-edit \
        -m "Merge pull request #$PR_NUMBER from $head_ref"

    push_commit="$(git rev-parse HEAD)"

    PUSH_PR_MERGE=true
    PUSH_ARGS+=(
        "$push_commit:$BASE_REF"
        ":$head_ref"
        "--force-with-lease=$head_ref:$head_commit"
    )

    summarize_push "origin/$BASE_REF" "$push_commit" ""
}

create_deploy_tree() {
    # We should be safe checking out master in a separate worktree because CI
    # won't run this script with it as the current branch
    git worktree add --quiet --no-checkout $DEPLOY_DIR -B master origin/master

    rsync -a "$JEKYLL_BUILD_DIR/" $DEPLOY_DIR
    touch $DEPLOY_DIR/.nojekyll

    git_deploy_tree add -A .
    DEPLOY_TREE=$(git_deploy_tree write-tree)
    HAS_DEPLOY_TREE=true
}

git_deploy_tree() {
    git \
        --git-dir=$DEPLOY_DIR/.git \
        --work-tree=$DEPLOY_DIR \
        -c core.excludesfile=$CHECKOUT_DIR/.deploy-gitignore \
        "$@"
}

evaluate_pages_deploy() {
    local deploy_src_ref
    local deploy_src_sha
    local prior_deploys
    local deploy_description
    local deploy_tag

    # Deploy to GitHub pages only if we're targeting the develop branch
    if [[ "$EFFECTIVE_EVENT" == "pull_request" ]] && [[ "$PUSH_PR_MERGE" == "false" || "$BASE_REF" != develop ]]; then
        echo "Not deploying to GitHub Pages (target branch: $BASE_REF, pull request: $PR_NUMBER)"
        return
    fi

    if [[ "$HAS_DEPLOY_TREE" == false ]]; then
        echo "Not deploying to GitHub Pages: no deploy content available"
        return
    fi

    # If this is a pull request event, we want the head ref; if it's a push the
    # HEAD_REF variable should specify the branch to which the push went. There
    # may be a refs/heads/ we want to strip out.
    deploy_src_ref="$(git rev-parse --abbrev-ref=strict "$HEAD_REF")"
    deploy_src_sha="$(git rev-parse "$HEAD_REF")"

    # Handle scenarios where the build is triggered for a commit already on
    # develop
    if [[ "$EFFECTIVE_EVENT" == "push" || "$EFFECTIVE_EVENT" == "cron" ]]; then
        if [[ "$deploy_src_ref" != develop ]]; then
            echo "Not deploying to GitHub Pages (branch: $deploy_src_ref)"
            return
        fi

        # Bail if we are rebuilding the last deployed commit, as determined
        # using the deploy tags
        local has_prior="$(
            git ls-remote --tags origin "deploy/master/*-$deploy_src_sha^{}" |
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
    #
    # Note that we do a non-shallow fetch of master in update_refs to ensure this works.
    prior_deploys="$(git rev-list origin/master | wc -l)"
    DEPLOY_NUMBER="$(( $prior_deploys+1 ))"

    deploy_description="$(describe_deploy "$DEPLOY_NUMBER")"

    git_deploy_tree commit --quiet --allow-empty \
        -m "Deploy to GitHub Pages [$deploy_description]" \
        -m "Source commit for this deployment:" \
        -m "$(git show --no-patch --format=fuller "$deploy_src_sha")"

    deploy_tag="deploy/master/$DEPLOY_NUMBER-$deploy_src_sha"

    git tag -a "$deploy_tag" master \
        -m "Deploy $deploy_description triggered by ${EFFECTIVE_EVENT/_/ }" \
        -m "$RUN_URL"

    PUSH_PAGES_DEPLOY=true
    PUSH_ARGS+=("master:master")

    summarize_push origin/master master "$deploy_tag"

    sentry_cli releases new --finalize --url "$RUN_URL" "$RELEASE_VERSION"

    sentry_cli releases files "$RELEASE_VERSION" upload-sourcemaps \
        --ignore "$CHECKOUT_DIR/.deploy-gitignore" \
        --url-prefix /home-assets \
        "$DEPLOY_DIR/home-assets"

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
            "$deploy_src_sha:$deploy_src_ref"
            "--force-with-lease=$deploy_src_ref:$deploy_src_sha"
        )
    fi
}

describe_deploy() {
    local deploy_number="$1"

    if [ ! -z "$PR_NUMBER" ]; then
        echo "$deploy_number from PR #$PR_NUMBER"
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

sentry_cli() {
    if [[ "${CI_DRY_RUN:-}" != "false" ]]; then
        echo "[dry-run] sentry-cli $@"
    else
        sentry-cli "$@"
    fi
}

main
