#!/bin/bash

set -euo pipefail

if [ $# -ne 1 ]; then
    echo >&2 "usage: $0 <rev>"
    echo >&2 "e.g. \`$0 8.9.2\`"
    exit 1
fi

rev="$1"
url="https://raw.githubusercontent.com/getsentry/sentry-release-registry/master/packages/npm/%40sentry/browser/$rev.json"

curl -L "$url" |
    jq --arg rev "$rev" --arg via "$url" --arg file bundle.min.js \
        'if .version != $rev then error("expected version \($rev), found \(.version)") else . end |
        {
            version,
            url: "https://browser.sentry-cdn.com/\(.version)/\($file)",
            checksum: "sha384-\(.files[$file].checksums["sha384-base64"])",
            $via,
            docs: "https://docs.sentry.io/platforms/javascript/install/loader/#errors-only-bundle",
            updateScript: "bin/sentry-sdk-refresh.sh $VERSION"
        }'
