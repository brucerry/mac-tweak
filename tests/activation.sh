#!/bin/bash
set -eo pipefail
(
    HOME="$CASE_HOME"
    . "$TEST_REPO/src/lib/plan.sh"
    . "$TEST_REPO/src/lib/apply.sh"
    SETUP_ROOT="$TEST_REPO/src"
    STATE="$HOME/.local/state/mac-tweak"
    RUN="$STATE/runs/activation-fixture"
    HOST_ARCH=arm64
    mkdir -p "$RUN" "$STATE/ownership" "$TEST_ROOT/payload/bin"
    for command in node npm npx; do
        printf '#!/bin/sh\necho 24.22.0\n' > "$TEST_ROOT/payload/bin/$command"
        chmod +x "$TEST_ROOT/payload/bin/$command"
    done
    activate_tool node "$TEST_ROOT/payload" 24.22.0
    old_pointer=$(readlink "$HOME/.local/opt/mac-tweak/node/current")
    if activate_tool node "$TEST_ROOT/payload" 24.22.1 > "$TEST_ROOT/stage-failure.log" 2>&1; then exit 1; fi
    test "$(readlink "$HOME/.local/opt/mac-tweak/node/current")" = "$old_pointer"
    for command in node npm npx; do printf '#!/bin/sh\necho 24.22.1\n' > "$TEST_ROOT/payload/bin/$command"; done
    activate_tool node "$TEST_ROOT/payload" 24.22.1
    test -d "$old_pointer"
    test "$("$HOME/.local/bin/node" --version)" = 24.22.1
    grep -q "previous-link|$HOME/.local/opt/mac-tweak/node/current|$old_pointer" "$RUN/events.txt"
    test ! -e "$HOME/.local/opt/mac-tweak/node/current/link"
)
rm -rf "$CASE_HOME/.local" "$TEST_ROOT/payload"
printf 'PASS: staged command validation, atomic pointer replacement, and retained previous releases\n'
