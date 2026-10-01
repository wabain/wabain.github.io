#!/bin/bash

set -euo pipefail

#
# Run actionlint on the repository's workflows, along with the shellcheck
# integration bundled in its Docker image. Arguments are passed to actionlint.
#

IMAGE=rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667

repo_root="$(cd "$(dirname "$0")/.." && pwd)"

exec docker run --rm -v "$repo_root:/repo" --workdir /repo "$IMAGE" "$@"
