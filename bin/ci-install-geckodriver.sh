#!/bin/bash

set -euo pipefail

json="$(curl -H "Authorization: token $GH_TOKEN" -s https://api.github.com/repos/mozilla/geckodriver/releases/latest)"
echo "Latest geckodriver release..."

echo
echo "$json"
# Match on the asset name rather than the content type, which has changed
# between releases (application/gzip, application/x-gzip, application/x-gtar)
url="$(echo "$json" | jq -er '
    [
        .assets[] |
        select(.name | endswith("-linux64.tar.gz")) |
        .browser_download_url
    ] |
    if length == 1 then
        first
    else
        error("Expected one linux64 tarball, found \(length): \(.)")
    end
')"

echo
echo "Downloading from URL $url"

mkdir -p ~/download
curl -L --retry 3 -o ~/download/geckodriver.tgz "$url"
tar -xzf ~/download/geckodriver.tgz -C "$USER_INSTALL_DIR" geckodriver

echo "Installed geckodriver binary in $USER_INSTALL_DIR"
builtin hash -l geckodriver
echo "geckodriver: $(which geckodriver)"
