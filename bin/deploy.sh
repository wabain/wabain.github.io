#!/bin/bash

## Adapted from https://gist.github.com/domenic/ec8b0fc8ab45f39403dd and
## https://github.com/marionettejs/marionettejs.com/blob/da632860fd0e9b4437d8230d0bf3fc369164db2c/travis-runner.sh ##

set -e # exit with nonzero exit code if anything fails

echo "Content to be deployed is:"
tree -ah content

# Deploy only if we push to the develop branch
if [ "$TRAVIS_BRANCH" != "develop" ] || [ "$TRAVIS_PULL_REQUEST" = "true" ]
then
    echo "Not deploying (branch: $TRAVIS_BRANCH, pull request: $TRAVIS_PULL_REQUEST)"
    exit 0
fi

# Fail this step if a previous step failed
if [ "$TRAVIS_TEST_RESULT" -ne 0 ]
then
    echo "Not deploying; prior build steps were not successful"
    exit 1
fi

cd content
git init

# The first and only commit to this new Git repo contains all the
# files present with the commit message "Deploy to GitHub Pages".
git add .
git commit -m "Deploy to GitHub Pages"

# Redirect output to /dev/null to hide any sensitive credential data that
# might otherwise be exposed.
git push --force --quiet "https://${GH_TOKEN}@${GH_REF}" master:master > /dev/null 2>&1
