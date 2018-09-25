#!/bin/bash

## Adapted from https://gist.github.com/domenic/ec8b0fc8ab45f39403dd and
## https://github.com/marionettejs/marionettejs.com/blob/da632860fd0e9b4437d8230d0bf3fc369164db2c/travis-runner.sh ##

set -e # exit with nonzero exit code if anything fails

echo "Content to be deployed is:"
tree -ah content

# Deploy only if we push to the develop branch
if [ "$TRAVIS_BRANCH" != "develop" ] || [ "$TRAVIS_PULL_REQUEST" != "false" ]
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

cat > ./deploy-commit-msg <<EOF
Deploy to GitHub Pages

Source commit for this deployment:

EOF

git log -n1 --format=fuller >> ./deploy-commit-msg

cd content
git init
git config core.excludesfile "$(pwd)/../.deploy-gitignore"

# Redirect output to /dev/null to hide any sensitive credential data that
# might otherwise be exposed.
git remote add origin "https://${GH_TOKEN}@${GH_REF}" > /dev/null 2>&1

git fetch origin master
git reset origin/master

git add -A .
git commit -F ../deploy-commit-msg

git push origin master > /dev/null 2>&1
