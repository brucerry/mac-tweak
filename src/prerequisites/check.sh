#!/bin/bash
# Read-only readiness checks. Installation is requested separately after consent.
set -eo pipefail
PREREQUISITE_ROOT=$(cd -- "$(dirname -- "$0")/.." && pwd -P)
. "$PREREQUISITE_ROOT/lib/inspect.sh"
test "$#" -gt 0 || exit 2
for prerequisite_component in "$@"; do
    case "$prerequisite_component" in tig|gestures|closing|windowskeys) ;; *) exit 2 ;; esac
done
prerequisite_status=0
for prerequisite_component in "$@"; do
    if test "$prerequisite_component" = tig; then
        inspect_tig_prerequisites || prerequisite_status=1
    else
        inspect_helper_prerequisites "$prerequisite_component" || prerequisite_status=1
    fi
done
exit "$prerequisite_status"
