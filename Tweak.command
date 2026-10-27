#!/bin/bash
set -eo pipefail
REPO_ROOT=$(cd -- "$(dirname -- "$0")" && pwd -P)
exec /bin/bash "$REPO_ROOT/tweak.sh" "$@"
