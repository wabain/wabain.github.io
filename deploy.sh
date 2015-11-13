#!/bin/bash

## Adapted from https://gist.github.com/domenic/ec8b0fc8ab45f39403dd and
## https://github.com/marionettejs/marionettejs.com/blob/da632860fd0e9b4437d8230d0bf3fc369164db2c/travis-runner.sh ##

set -e # exit with nonzero exit code if anything fails

echo "$TRAVIS_BRANCH"

# Deploy only if we push to the develop branch
if [ "$TRAVIS_BRANCH" = "develop" ] && [ "$TRAVIS_PULL_REQUEST" != "true" ]
then
    npm run compile

    # go to the output directory and create a *new* Git repo
    cd dist
    git init

    # The first and only commit to this new Git repo contains all the
    # files present with the commit message "Deploy to GitHub Pages".
    git add .
    git commit -m "Deploy to GitHub Pages"

    # Force push from the current repo's master branch to the remote
    # repo's master branch. (All previous history on the master branch
    # will be lost, since we are overwriting it.) We redirect any output to
    # /dev/null to hide any sensitive credential data that might otherwise be exposed.
    git push --force --quiet "https://${GH_TOKEN}@${GH_REF}" master:master > /dev/null 2>&1
else
    # Don't deploy on other branches, but lint and ensure compiling works
    npm run lint
    npm run compile
fi
