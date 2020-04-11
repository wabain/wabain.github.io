#!/bin/bash

set -euo pipefail

out="$(bundle platform --ruby | jq -R -r 'capture("\\b(?<v>[\\d.]+)(p.*)?\\b").v')"
if [ -z "$out" ]; then
    exit 1
fi

echo "$out"
