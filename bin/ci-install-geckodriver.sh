#!/bin/bash

set -euo pipefail

json=$(curl -H "Authorization: token $GH_TOKEN" -s https://api.github.com/repos/mozilla/geckodriver/releases/latest)
echo "Latest geckodriver release..."

echo
echo "$json"
url=$(echo "$json" | jq -r '.assets[].browser_download_url | select(contains("linux64"))')
echo

echo "Downloading from URL $url"
curl -s -L "$url" | tar -xz
chmod +x geckodriver
mv geckodriver "$USER_INSTALL_DIR"
echo "Installed geckodriver binary in $USER_INSTALL_DIR"
