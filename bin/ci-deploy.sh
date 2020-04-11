#!/bin/bash

## Adapted from https://gist.github.com/domenic/ec8b0fc8ab45f39403dd and
## https://github.com/marionettejs/marionettejs.com/blob/da632860fd0e9b4437d8230d0bf3fc369164db2c/travis-runner.sh

set -euo pipefail

JEKYLL_BUILD_DIR=_site

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

    local base_dir
    local deploy_src

    # Travis won't have pulled in the master branch previously, so we need to
    # do it now
    git fetch --quiet origin +refs/heads/master:refs/remotes/origin/master

    base_dir="$PWD"
    deploy_src="$(git rev-parse HEAD)"

    # We should be safe checking out master because CI won't run this script
    # with it as the current branch
    git worktree add --quiet --no-checkout ../deploy -B master origin/master

    rsync -a "$JEKYLL_BUILD_DIR/" ../deploy

    cd ../deploy

    touch .nojekyll

    git -c core.excludesfile="$base_dir/.deploy-gitignore" add -A .
    git commit --quiet --allow-empty \
        -m "Deploy to GitHub Pages" \
        -m "Source commit for this deployment:" \
        -m "$(git show --no-patch --format=fuller "$deploy_src")"

    cd "$base_dir"

    # Redirect output to /dev/null to hide any sensitive credential data that
    # might otherwise be exposed.
    git remote set-url --push origin "https://${GH_TOKEN}@${GH_REF}" &> /dev/null

    git push origin master:master
}

main
