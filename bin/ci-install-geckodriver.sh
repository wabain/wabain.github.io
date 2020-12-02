#!/bin/bash

set -euo pipefail

json="$(curl -H "Authorization: token $GH_TOKEN" -s https://api.github.com/repos/mozilla/geckodriver/releases/latest)"
echo "Latest geckodriver release..."

echo
echo "$json"
url="$(echo "$json" | jq -er '
    .assets | [
        .[] |
        select(.content_type == "application/x-gzip") |
        .browser_download_url |
        select(contains("linux64"))
    ] | first
')"

echo
echo "Downloading from URL $url"

mkdir -p ~/download
curl -L --retry 3 -o ~/download/geckodriver.tgz "$url"
tar -xzf ~/download/geckodriver.tgz -C "$USER_INSTALL_DIR" geckodriver

echo "Installed geckodriver binary in $USER_INSTALL_DIR"
builtin hash -l geckodriver
echo "geckodriver: $(which geckodriver)"
