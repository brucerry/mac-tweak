#!/bin/bash
set -eo pipefail
fresh=$(run_setup plan --with node,aliases)
assert_contains "$fresh" 'INSTALL [node] 24.22.1'
assert_contains "$fresh" 'Backup if existing:'
assert_contains "$fresh" '.zshrc (proposed)'
assert_contains "$fresh" 'Plan:'
mkdir -p "$TEST_ROOT/fakebin"
cat > "$TEST_ROOT/fakebin/gh" <<'EOF'
#!/bin/sh
echo 'gh version 2.103.2'
EOF
cat > "$TEST_ROOT/fakebin/curl" <<'EOF'
#!/bin/sh
echo 'unexpected download' >&2
exit 99
EOF
chmod +x "$TEST_ROOT/fakebin/gh" "$TEST_ROOT/fakebin/curl"
existing=$(env HOME="$CASE_HOME" PATH="$TEST_ROOT/fakebin:/usr/bin:/bin:/usr/sbin:/sbin" /bin/bash "$TEST_REPO/tweak.sh" plan --with gh)
assert_contains "$existing" 'SATISFIED [gh] reused external'
printf 'PASS: fresh and externally satisfied plans with versions, differences, and backups\n'
