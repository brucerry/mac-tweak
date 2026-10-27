#!/bin/bash
set -eo pipefail
REPO_ROOT=$(cd -- "$(dirname -- "$0")" && pwd -P)
case "${1:-}" in
    ''|gui|--gui)
        if test "$#" -gt 0; then shift; fi
        test -x /usr/bin/osascript || { printf 'The graphical chooser requires macOS.\n' >&2; exit 1; }
        case "${1:-}" in
            --self-test|--smoke*) exec /usr/bin/osascript -l JavaScript "$REPO_ROOT/src/gui/main.js" "$REPO_ROOT" "$@" ;;
        esac
        exec /bin/bash "$REPO_ROOT/src/app/launch.sh" "$REPO_ROOT" "$@"
        ;;
    --terminal)
        shift
        exec /bin/bash "$REPO_ROOT/src/cli.sh" terminal "$@"
        ;;
    *) exec /bin/bash "$REPO_ROOT/src/cli.sh" "$@" ;;
esac
