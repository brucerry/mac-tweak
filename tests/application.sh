#!/bin/bash
set -eo pipefail
if run_setup apply --with aliases > "$TEST_ROOT/approval.log" 2>&1; then exit 1; fi
assert_contains "$(cat "$TEST_ROOT/approval.log")" 'requires explicit --yes'
python3 "$TEST_REPO/tests/approval.py" "$TEST_REPO" "$CASE_HOME"
mkdir -p "$CASE_HOME/.local/state/mac-tweak/lock"
if run_setup apply --with aliases --yes > "$TEST_ROOT/lock.log" 2>&1; then exit 1; fi
assert_contains "$(cat "$TEST_ROOT/lock.log")" 'Another application holds'
test ! -e "$CASE_HOME/.config"
rm -rf "$CASE_HOME/.local"
printf 'PASS: explicit approval and concurrent application lock\n'
printf '# original startup without final newline' > "$CASE_HOME/.zshrc"
chmod 640 "$CASE_HOME/.zshrc"
cp -p "$CASE_HOME/.zshrc" "$TEST_ROOT/original-zshrc"
run_setup apply --with aliases --yes > "$TEST_ROOT/apply.log"
run_dir=$(find "$CASE_HOME/.local/state/mac-tweak/runs" -mindepth 1 -maxdepth 1 -type d)
backup=$(awk -F '|' -v target="$CASE_HOME/.zshrc" '$1=="backup" && $2==target {print $3}' "$run_dir/events.txt")
cmp "$backup" "$TEST_ROOT/original-zshrc"
test "$(stat -f '%Lp' "$backup")" = 640
test "$(stat -f '%Lp' "$CASE_HOME/.zshrc")" = 640
test "$(stat -f '%Lp' "$run_dir")" = 700
grep -q "create|$CASE_HOME/.config/mac-tweak/aliases.zsh|" "$run_dir/events.txt"
test -n "$(find "$CASE_HOME/.local/state/mac-tweak/ownership" -type f)"
run_setup verify --with aliases > "$TEST_ROOT/verify.log"
assert_contains "$(cat "$TEST_ROOT/verify.log")" 'PASS [aliases]'
rm -rf "$CASE_HOME/.local" "$CASE_HOME/.config"
cp -p "$TEST_ROOT/original-zshrc" "$CASE_HOME/.zshrc"
cat > "$TEST_ROOT/fakebin/cp" <<'EOF'
#!/bin/sh
echo 'simulated backup failure' >&2
exit 77
EOF
chmod +x "$TEST_ROOT/fakebin/cp"
if env HOME="$CASE_HOME" PATH="$TEST_ROOT/fakebin:/usr/bin:/bin:/usr/sbin:/sbin" /bin/bash "$TEST_REPO/tweak.sh" apply --with aliases --yes > "$TEST_ROOT/backup-failure.log" 2>&1; then exit 1; fi
cmp "$CASE_HOME/.zshrc" "$TEST_ROOT/original-zshrc"
assert_contains "$(cat "$TEST_ROOT/backup-failure.log")" 'FAILED [shell-integration]'
rm "$TEST_ROOT/fakebin/cp"
rm -rf "$CASE_HOME/.local" "$CASE_HOME/.config"
rm "$CASE_HOME/.zshrc"
printf 'PASS: private run records, original-byte/permission backups, and failed-backup preservation\n'
