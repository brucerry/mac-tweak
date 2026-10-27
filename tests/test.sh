#!/bin/bash
set -eo pipefail
TEST_REPO=$(cd "$(dirname "$0")/.." && pwd -P)
TEST_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/mac-tweak-test.XXXXXX")
TEST_ROOT=$(cd "$TEST_ROOT" && pwd -P)
trap 'rm -rf "$TEST_ROOT"' EXIT
export MAC_TWEAK_PREFERENCES_TEST=1
export MAC_TWEAK_TEST_GESTURES_OS=27
export MAC_TWEAK_PREFERENCE_STORE="$TEST_ROOT/preference-store.json"
printf '%s\n' '{"version":1,"values":{}}' > "$MAC_TWEAK_PREFERENCE_STORE"
CASE_HOME="$TEST_ROOT/home"
mkdir "$CASE_HOME"
test "${HOME:-}" != "$CASE_HOME" || exit 1
run_setup() { env HOME="$CASE_HOME" PATH=/usr/bin:/bin:/usr/sbin:/sbin /bin/bash "$TEST_REPO/tweak.sh" "$@"; }
assert_contains() { case "$1" in *"$2"*) ;; *) printf 'Missing: %s\nIn: %s\n' "$2" "$1" >&2; exit 1 ;; esac; }
for check_file in "$TEST_REPO/tweak.sh" "$TEST_REPO/src/cli.sh" "$TEST_REPO"/src/lib/*.sh "$TEST_REPO"/src/components/{tools,terminal,preferences,profiles,guided}/*.sh; do /bin/bash -n "$check_file"; done
if test "${1:-}" = --terminal; then . "$TEST_REPO/tests/terminal.sh"; exit 0; fi
assert_contains "$(run_setup --help)" 'Usage:'
test -z "$(find "$CASE_HOME" -mindepth 1 -print)"
assert_contains "$(run_setup plan --with prompt,aliases)" 'Selection: prompt aliases'
assert_contains "$(run_setup plan --preset terminal --with gh)" 'Selection: prompt aliases colors local-bin-path gh'
printf 'PASS: documented selection examples\n'
printf 'PASS: entry point and isolated home\n'
assert_contains "$(run_setup list)" 'local-bin-path'
assert_contains "$(run_setup info aliases)" "ll='ls -al'"
assert_contains "$(run_setup info node)" 'Recovery:'
test "$(wc -l < "$TEST_REPO/src/presets/full.txt" | tr -d ' ')" = "$(awk -F '|' '!/^#/ && NF && $1!="local-bin-path" {n++} END {print n}' "$TEST_REPO/src/catalog/components.txt")"
cp -R "$TEST_REPO/src" "$TEST_ROOT/src"
cp "$TEST_REPO/tweak.sh" "$TEST_ROOT/tweak.sh"
printf 'node|bad\n' >> "$TEST_ROOT/src/catalog/components.txt"
if env HOME="$CASE_HOME" /bin/bash "$TEST_ROOT/tweak.sh" list > "$TEST_ROOT/invalid.log" 2>&1; then exit 1; fi
assert_contains "$(cat "$TEST_ROOT/invalid.log")" 'Invalid catalog'
printf 'PASS: catalog and metadata validation\n'
selection=$(run_setup plan --preset full --without tig,prompt)
assert_contains "$selection" 'Selection: aliases colors local-bin-path node uv gh'
assert_contains "$(run_setup plan --with gh,node,gh)" 'Selection: local-bin-path gh node'
assert_contains "$(run_setup plan --with gh,node)" 'required by gh, node'
if run_setup plan --with '*' > "$TEST_ROOT/invalid-id.log" 2>&1; then exit 1; fi
assert_contains "$(cat "$TEST_ROOT/invalid-id.log")" 'Invalid component list'
for bad_args in '--with missing' '--preset unknown' '--with gh --without local-bin-path' '--with gh --without gh'; do
    if run_setup plan $bad_args > "$TEST_ROOT/selection.log" 2>&1; then exit 1; fi
done
cp "$TEST_REPO/src/catalog/components.txt" "$TEST_ROOT/src/catalog/components.txt"
sed 's/local-bin-path|shell|-|/local-bin-path|shell|node|/' "$TEST_REPO/src/catalog/components.txt" > "$TEST_ROOT/src/catalog/components.txt"
if env HOME="$CASE_HOME" /bin/bash "$TEST_ROOT/tweak.sh" plan --with node > "$TEST_ROOT/cycle.log" 2>&1; then exit 1; fi
assert_contains "$(cat "$TEST_ROOT/cycle.log")" 'Dependency cycle'
test -z "$(find "$CASE_HOME" -mindepth 1 -print)"
printf 'PASS: selection, exclusions, dependencies, and cycles\n'
if run_setup --terminal < /dev/null > "$TEST_ROOT/no-input.log" 2>&1; then exit 1; fi
assert_contains "$(cat "$TEST_ROOT/no-input.log")" 'Noninteractive'
python3 "$TEST_REPO/tests/interactive.py" "$TEST_REPO" "$CASE_HOME"
test -z "$(find "$CASE_HOME" -mindepth 1 -print)"
. "$TEST_REPO/tests/inspect.sh"
. "$TEST_REPO/tests/plan.sh"
python3 "$TEST_REPO/tests/readonly.py" "$TEST_REPO" "$CASE_HOME" "$TEST_ROOT/fakebin"
. "$TEST_REPO/tests/conflicts.sh"
. "$TEST_REPO/tests/application.sh"
. "$TEST_REPO/tests/activation.sh"
. "$TEST_REPO/tests/reapply.sh"
. "$TEST_REPO/tests/recovery.sh"
python3 "$TEST_REPO/tests/releases.py"
python3 "$TEST_REPO/tests/artifacts.py" "$TEST_REPO" "$TEST_ROOT"
python3 "$TEST_REPO/tests/tools.py" "$TEST_REPO" "$TEST_ROOT"
. "$TEST_REPO/tests/docs.sh"
. "$TEST_REPO/tests/terminal.sh"
python3 "$TEST_REPO/tests/integration.py" "$TEST_REPO" "$TEST_ROOT"
python3 "$TEST_REPO/tests/interruption.py"
python3 "$TEST_REPO/tests/quickstart.py" "$TEST_REPO"
python3 "$TEST_REPO/tests/gui-session.py" "$TEST_REPO"
python3 "$TEST_REPO/tests/launchers.py"
python3 "$TEST_REPO/tests/gui.py"
python3 "$TEST_REPO/tests/verification.py"
python3 "$TEST_REPO/tests/repair.py"
/usr/bin/osascript -l JavaScript "$TEST_REPO/tests/preferences-model.js" "$TEST_REPO"
python3 "$TEST_REPO/tests/preferences.py"
python3 "$TEST_REPO/tests/preferences-races.py"
python3 "$TEST_REPO/tests/preferences-recovery.py"

python3 "$TEST_REPO/tests/helpers.py"
python3 "$TEST_REPO/tests/expanded-preferences.py"
python3 "$TEST_REPO/tests/saved-files.py"
python3 "$TEST_REPO/tests/maintenance.py"
