#!/bin/bash
set -eo pipefail
run_setup apply --with aliases --yes > "$TEST_ROOT/first.log"
run_count=$(find "$CASE_HOME/.local/state/mac-tweak/runs" -mindepth 1 -maxdepth 1 -type d | wc -l)
original_hash=$(shasum -a 256 "$CASE_HOME/.zshrc")
original_time=$(stat -f '%m' "$CASE_HOME/.zshrc")
second=$(run_setup apply --with aliases --yes)
assert_contains "$second" 'Nothing to change.'
test "$(find "$CASE_HOME/.local/state/mac-tweak/runs" -mindepth 1 -maxdepth 1 -type d | wc -l)" = "$run_count"
test "$(shasum -a 256 "$CASE_HOME/.zshrc")" = "$original_hash"
test "$(stat -f '%m' "$CASE_HOME/.zshrc")" = "$original_time"
test "$(grep -c '# >>> mac-tweak >>>' "$CASE_HOME/.zshrc")" = 1
rm -rf "$CASE_HOME/.config" "$CASE_HOME/.local"
rm "$CASE_HOME/.zshrc"
cat > "$TEST_ROOT/fakebin/mv" <<'EOF'
#!/bin/bash
for target in "$@"; do
    case "$target" in */mac-tweak/env.zsh) echo 'simulated later activation failure' >&2; exit 70 ;; esac
done
exec /bin/mv "$@"
EOF
chmod +x "$TEST_ROOT/fakebin/mv"
if env HOME="$CASE_HOME" PATH="$TEST_ROOT/fakebin:/usr/bin:/bin:/usr/sbin:/sbin" /bin/bash "$TEST_REPO/tweak.sh" apply --with aliases --yes > "$TEST_ROOT/partial.log" 2>&1; then exit 1; fi
output=$(cat "$TEST_ROOT/partial.log")
assert_contains "$output" 'DONE [aliases]'
assert_contains "$output" 'FAILED [shell-integration]'
assert_contains "$output" 'UNATTEMPTED [shell-integration]'
assert_contains "$output" 'Run failed; completed actions remain in place.'
test -f "$CASE_HOME/.config/mac-tweak/aliases.zsh"
test ! -e "$CASE_HOME/.config/mac-tweak/env.zsh"
test ! -e "$CASE_HOME/.zshrc"
rm "$TEST_ROOT/fakebin/mv"
rm -rf "$CASE_HOME/.config" "$CASE_HOME/.local"
printf 'PASS: no-op repeat runs and accurate stop-on-failure results\n'
