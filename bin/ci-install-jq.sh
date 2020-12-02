#!/bin/bash

set -euo pipefail

#
# Install the version of jq needed for CI scripts.
#
# Requires environment variables:
#
# - USER_INSTALL_DIR: directory in which to install the binary
#

URL=https://github.com/stedolan/jq/releases/download/jq-1.6/jq-linux64
HASH=af986793a515d500ab2d35f8d2aecd656e764504b789b66d7e1a0b727a124c44

mkdir -p ~/download
curl -o ~/download/jq -L --retry 3 "$URL"

actual_hash="$(sha256sum ~/download/jq | cut -f1 -d' ')"
if [[ "$actual_hash" != "$HASH" ]]; then
    echo >&2 "Invalid SHA256 checksum for jq (from $URL)"
    echo >&2 "Expected: $HASH"
    echo >&2 "Found:    $actual_hash"

    exit 1
fi

chmod +x ~/download/jq
mv ~/download/jq "$USER_INSTALL_DIR"/jq

echo "Installed jq binary in $USER_INSTALL_DIR"
builtin hash -l jq
echo "jq: $(which jq)"
jq --version
