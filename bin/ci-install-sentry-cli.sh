#!/bin/bash

set -euo pipefail

json="$(curl -H "Authorization: token $GH_TOKEN" -s https://api.github.com/repos/getsentry/sentry-cli/releases/latest)"
echo "Latest sentry-cli release..."

echo
echo "$json"
url="$(echo "$json" | jq -er '
    [
        .assets[] |
        select(.name == "sentry-cli-Linux-x86_64") |
        .browser_download_url
    ] | first
')"

echo
echo "Downloading from URL $url"

mkdir -p ~/download
curl -L --retry 3 -o ~/download/sentry-cli "$url"
chmod +x ~/download/sentry-cli
mv ~/download/sentry-cli "$USER_INSTALL_DIR/sentry-cli"

echo "Installed sentry-cli binary in $USER_INSTALL_DIR"
builtin hash -l sentry-cli
echo "sentry-cli: $(which sentry-cli)"
