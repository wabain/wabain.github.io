#!/bin/bash

set -e

cleanup() {
    echo "Stopping Jekyll server..."

    local my_uid=$(id -u $USER)
    local jekyll_pid=$(pgrep -U $my_uid -f jekyll)

    if [ -z "$jekyll_pid" ]; then
        echo "Warning: Could not find Jekyll process"
    else
        echo "PID: $jekyll_pid"
        kill -9 $jekyll_pid
    fi

    echo "==== Jekyll stdout output ===="
    cat .jekyll-out || :
    echo "==== Jekyll stderr output ===="
    cat .jekyll-err || :

    rm -f .jekyll-out .jekyll-err
}

trap 'cleanup' EXIT

: ${JEKYLL_ENV=production}
: ${TEST_BROWSER=firefox}
export JEKYLL_ENV TEST_BROWSER

echo "Starting Jekyll server..."

pnpm run jekyll-serve \
    --skip-initial-build \
    --no-watch \
    --detach \
    > .jekyll-out \
    2> .jekyll-err

pnpm test
