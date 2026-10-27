#!/bin/bash
set -eo pipefail
mkdir -p "$CASE_HOME/.local/bin"
printf '#!/bin/sh\necho old\n' > "$CASE_HOME/.local/bin/gh"
if run_setup plan --with gh > "$TEST_ROOT/conflict.log" 2>&1; then exit 1; fi
assert_contains "$(cat "$TEST_ROOT/conflict.log")" "unmanaged executable conflict $CASE_HOME/.local/bin/gh"
rm "$CASE_HOME/.local/bin/gh"
ln -s "$TEST_ROOT/startup" "$CASE_HOME/.zshrc"
if run_setup plan --with aliases > "$TEST_ROOT/conflict.log" 2>&1; then exit 1; fi
assert_contains "$(cat "$TEST_ROOT/conflict.log")" "Symlink conflict: $CASE_HOME/.zshrc"
rm "$CASE_HOME/.zshrc"
cat > "$TEST_ROOT/fakebin/xcode-select" <<'EOF'
#!/bin/sh
exit 1
EOF
chmod +x "$TEST_ROOT/fakebin/xcode-select"
if env HOME="$CASE_HOME" PATH="$TEST_ROOT/fakebin:/usr/bin:/bin:/usr/sbin:/sbin" /bin/bash "$TEST_REPO/tweak.sh" plan --with tig > "$TEST_ROOT/conflict.log" 2>&1; then exit 1; fi
assert_contains "$(cat "$TEST_ROOT/conflict.log")" 'xcode-select --install'
if env HOME="$CASE_HOME" PATH="$TEST_ROOT/fakebin:/usr/bin:/bin:/usr/sbin:/sbin" /bin/bash "$TEST_REPO/tweak.sh" apply --with node,tig --yes > "$TEST_ROOT/preflight-all.log" 2>&1; then exit 1; fi
test ! -e "$CASE_HOME/.config"
test ! -e "$CASE_HOME/.local/state"
rm "$TEST_ROOT/fakebin/xcode-select"
rmdir "$CASE_HOME/.local/bin" "$CASE_HOME/.local"
printf 'PASS: actionable executable, symlink, and toolchain conflict messages\n'
