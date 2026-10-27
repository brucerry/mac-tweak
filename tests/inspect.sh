#!/bin/bash
set -eo pipefail
. "$TEST_REPO/src/lib/inspect.sh"
version_ge 24.22.1 24.9.0
if version_ge 13.0 14.0; then exit 1; fi
uname() { if test "$1" = -s; then echo Darwin; else echo x86_64; fi; }
sysctl() { echo 1; }
sw_vers() { echo 27.0.1; }
inspect_host
test "$HOST_ARCH" = arm64
sysctl() { echo 0; }
inspect_host
test "$HOST_ARCH" = x64
sw_vers() { echo 12.7; }
if inspect_host > "$TEST_ROOT/host.log"; then exit 1; fi
grep -q 'macOS 13' "$TEST_ROOT/host.log"
unset -f uname sysctl sw_vers
HOME="$CASE_HOME" safe_home
HOME="$CASE_HOME" inspect_target "$CASE_HOME/.zshrc"
ln -s "$TEST_ROOT" "$CASE_HOME/redirect"
if HOME="$CASE_HOME" inspect_target "$CASE_HOME/redirect/file" > "$TEST_ROOT/target.log"; then exit 1; fi
grep -q 'Symlink conflict' "$TEST_ROOT/target.log"
rm "$CASE_HOME/redirect"
xcode-select() { return 1; }
xcrun() { echo 'unexpected compiler discovery' > "$TEST_ROOT/xcrun-called"; return 1; }
if inspect_tig_prerequisites > "$TEST_ROOT/prereq.log"; then exit 1; fi
test ! -e "$TEST_ROOT/xcrun-called"
grep -q 'xcode-select --install' "$TEST_ROOT/prereq.log"
unset -f xcode-select xcrun
cat > "$TEST_ROOT/version-tool" <<'EOF'
#!/bin/sh
echo 'gh version 2.103.2 (2026-10-23)'
EOF
chmod +x "$TEST_ROOT/version-tool"
test "$(command_version "$TEST_ROOT/version-tool")" = 2.103.2
printf 'PASS: native/translated architecture, OS, paths, prerequisites, and version inspection\n'
