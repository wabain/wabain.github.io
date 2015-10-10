#!/bin/bash

## Adapted from https://gist.github.com/domenic/ec8b0fc8ab45f39403dd ##

set -e # exit with nonzero exit code if anything fails

# clear and re-create the out directory
rm -rf dist || exit 0;
mkdir dist;

npm run compile

# go to the out directory and create a *new* Git repo
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
