#!/bin/bash
# Explicit opt-in: downloads and executes trusted pinned upstream code in a new home.
set -eo pipefail
test "${MAC_TWEAK_LIVE_TEST:-0}" = 1 || { echo 'Set MAC_TWEAK_LIVE_TEST=1 to run disposable live-download validation.' >&2; exit 1; }
SMOKE_SOURCE=$(cd "$(dirname "$0")/.." && pwd -P)
SMOKE_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/mac-tweak-live.XXXXXX")
SMOKE_ROOT=$(cd "$SMOKE_ROOT" && pwd -P)
trap 'rm -rf "$SMOKE_ROOT"' EXIT
export MAC_TWEAK_PREFERENCES_TEST=1
export MAC_TWEAK_PREFERENCE_STORE="$SMOKE_ROOT/preference-store.json"
printf '%s\n' '{"version":1,"values":{}}' > "$MAC_TWEAK_PREFERENCE_STORE"
LIVE_HOME="$SMOKE_ROOT/home with spaces"
mkdir "$LIVE_HOME"
SMOKE_REPO="$SMOKE_ROOT/checkout"
mkdir "$SMOKE_REPO"
for part in tweak.sh src; do cp -R "$SMOKE_SOURCE/$part" "$SMOKE_REPO/$part"; done
SMOKE_PATH=/usr/bin:/bin:/usr/sbin:/sbin
SMOKE_SHELL=(/bin/bash)
SMOKE_TRANSLATED=0
if test "${1:-}" = --intel-translated; then
    shift
    test "$(/usr/sbin/sysctl -n hw.optional.arm64)" = 1
    test "$(/usr/bin/arch -x86_64 /bin/bash -c '/usr/sbin/sysctl -n sysctl.proc_translated')" = 1 || {
        echo 'This check needs an Apple Silicon Mac with Rosetta already installed.' >&2; exit 1;
    }
    SMOKE_TRANSLATED=1
    # Production detection must continue choosing native artifacts from Rosetta.
    env HOME="$LIVE_HOME" PATH="$SMOKE_PATH" /usr/bin/arch -x86_64 /bin/bash "$SMOKE_REPO/tweak.sh" plan --preset full > "$SMOKE_ROOT/translated-plan.log"
    grep -q '^Host:.*arm64' "$SMOKE_ROOT/translated-plan.log"
    test -z "$(find "$LIVE_HOME" -mindepth 1 -print)"
    printf 'PASS: production planning from Rosetta selects native Apple Silicon without writes\n'
    # Only this disposable test masks host identity to select Intel recipes.
    # The native compiler cross-builds tig; x86_64 executables run via Rosetta.
    mkdir "$SMOKE_ROOT/intel-host-fixture"
    cat > "$SMOKE_ROOT/intel-host-fixture/sysctl" <<'FIXTURE'
#!/bin/bash
if test "$*" = '-n hw.optional.arm64'; then printf '0\n'; else exec /usr/sbin/sysctl "$@"; fi
FIXTURE
    cat > "$SMOKE_ROOT/intel-host-fixture/uname" <<'FIXTURE'
#!/bin/bash
if test "$*" = -m; then printf 'x86_64\n'; else exec /usr/bin/uname "$@"; fi
FIXTURE
    chmod +x "$SMOKE_ROOT/intel-host-fixture/sysctl"
    chmod +x "$SMOKE_ROOT/intel-host-fixture/uname"
    SMOKE_PATH="$SMOKE_ROOT/intel-host-fixture:$SMOKE_PATH"
fi
if test "$#" = 0; then set -- --preset full; fi
smoke_setup() {
    env HOME="$LIVE_HOME" PATH="$SMOKE_PATH" "${SMOKE_SHELL[@]}" "$SMOKE_REPO/tweak.sh" "$@"
}
smoke_tool() {
    local command="$1"
    shift
    env HOME="$LIVE_HOME" PATH="$LIVE_HOME/.local/bin:$SMOKE_PATH" GH_NO_UPDATE_NOTIFIER=1 UV_NO_CACHE=1 \
        NPM_CONFIG_USERCONFIG=/dev/null NPM_CONFIG_GLOBALCONFIG="$SMOKE_REPO/src/catalog/empty.npmrc" \
        NPM_CONFIG_CACHE="$SMOKE_ROOT/npm-cache" NPM_CONFIG_LOGS_MAX=0 NPM_CONFIG_UPDATE_NOTIFIER=false \
        "$LIVE_HOME/.local/bin/$command" "$@"
}
printf 'Live validation on %s (%s), temporary home %s\n' "$(sw_vers -productVersion)" "$(uname -m)" "$LIVE_HOME"
if test "$SMOKE_TRANSLATED" = 1; then printf 'Coverage: Intel recipes executed under Rosetta; this is not native Intel hardware.\n'; fi
if ! smoke_setup plan "$@" > "$SMOKE_ROOT/initial-plan.log" 2>&1; then
    cat "$SMOKE_ROOT/initial-plan.log" >&2; exit 1
fi
cp "$SMOKE_REPO/src/catalog/releases.txt" "$SMOKE_ROOT/releases-current.txt"
node_selected=0
if grep '^Selection:' "$SMOKE_ROOT/initial-plan.log" | grep -Eq '(^| )node( |$)'; then
    node_selected=1
    python3 "$SMOKE_SOURCE/tests/previous-node.py" "$SMOKE_REPO"
    if ! smoke_setup apply --with node --yes > "$SMOKE_ROOT/previous-node.log" 2>&1; then
        tail -60 "$SMOKE_ROOT/previous-node.log" >&2; exit 1
    fi
    cp "$SMOKE_ROOT/releases-current.txt" "$SMOKE_REPO/src/catalog/releases.txt"
fi
smoke_setup apply "$@" --yes | tee "$SMOKE_ROOT/apply.log"
smoke_setup verify "$@" | tee "$SMOKE_ROOT/verify.log"
if test "$SMOKE_TRANSLATED" = 1; then
    grep -q '^Host:.*x64' "$SMOKE_ROOT/initial-plan.log"
    for tool in node uv uvx gh tig; do
        if test -e "$LIVE_HOME/.local/bin/$tool"; then
            test "$(/usr/bin/lipo -archs "$LIVE_HOME/.local/bin/$tool")" = x86_64
            smoke_tool "$tool" --version
        fi
    done
    if test "$node_selected" = 1; then
        test "$(smoke_tool node -p process.arch)" = x64
        smoke_tool npm --version
        smoke_tool npx --version
    fi
    printf 'PASS: real Intel executable architectures and execution under Rosetta\n'
fi
smoke_setup apply "$@" --yes | tee "$SMOKE_ROOT/reapply.log"
grep -q 'Nothing to change.' "$SMOKE_ROOT/reapply.log"
if test "$node_selected" = 1; then
    tool_pointer="$LIVE_HOME/.local/opt/mac-tweak/node/current"
    latest_release=$(readlink "$tool_pointer")
    previous_release="$LIVE_HOME/.local/opt/mac-tweak/node/24.22.0"
    test -d "$previous_release"
    ln -s "$previous_release" "$tool_pointer.recovery"
    /bin/mv -fh "$tool_pointer.recovery" "$tool_pointer"
    pointer_record=$(printf '%s' "$tool_pointer" | shasum -a 256 | awk '{print $1}')
    printf 'link:%s\n' "$previous_release" > "$LIVE_HOME/.local/state/mac-tweak/ownership/$pointer_record"
    test "$(smoke_tool node --version)" = v24.22.0
    ln -s "$latest_release" "$tool_pointer.recovery"
    /bin/mv -fh "$tool_pointer.recovery" "$tool_pointer"
    printf 'link:%s\n' "$latest_release" > "$LIVE_HOME/.local/state/mac-tweak/ownership/$pointer_record"
    smoke_setup verify "$@" > "$SMOKE_ROOT/recovery-verify.log"
    printf 'PASS: real previous-release recovery and reactivation of the catalog release\n'
fi
printf 'PASS: disposable live application, verification, and no-op reapplication\n'
