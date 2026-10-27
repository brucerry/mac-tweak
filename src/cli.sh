#!/bin/bash
# macOS's shipped Bash 3.2 is the runtime baseline.
set -eo pipefail
# A translated terminal can select the x86 slice of system developer-tool shims,
# even when their installed compiler libraries are ARM-only. Run the backend
# natively on Apple Silicon before probing or invoking that toolchain.
if test "$(/usr/sbin/sysctl -n sysctl.proc_translated 2>/dev/null || true)" = 1 &&
   test "$(/usr/sbin/sysctl -n hw.optional.arm64 2>/dev/null || true)" = 1; then
    exec /usr/bin/arch -arm64 /bin/bash "$0" "$@"
fi
SETUP_ROOT=$(cd -- "$(dirname -- "$0")" && pwd -P)
. "$SETUP_ROOT/lib/compat.sh"
. "$SETUP_ROOT/lib/core.sh"
main "$@"
