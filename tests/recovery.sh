#!/bin/bash
set -eo pipefail
printf '# original\n' > "$CASE_HOME/.zshrc"
printf 'unrelated\n' > "$CASE_HOME/keep"
run_setup apply --with aliases --yes > "$TEST_ROOT/recovery-apply.log"
setup_run=$(find "$CASE_HOME/.local/state/mac-tweak/runs" -mindepth 1 -maxdepth 1 -type d)
startup_backup=$(awk -F '|' -v target="$CASE_HOME/.zshrc" '$1 == "backup" && $2 == target { print $3 }' "$setup_run/events.txt")
test -n "$startup_backup" && cp -p "$startup_backup" "$CASE_HOME/.zshrc"
test "$(cat "$CASE_HOME/.zshrc")" = '# original'
mkdir -p "$CASE_HOME/.local/opt/mac-tweak/node/old/bin" "$CASE_HOME/.local/opt/mac-tweak/node/new"
printf '#!/bin/sh\necho 24.22.0\n' > "$CASE_HOME/.local/opt/mac-tweak/node/old/bin/node"
chmod +x "$CASE_HOME/.local/opt/mac-tweak/node/old/bin/node"
tool_pointer="$CASE_HOME/.local/opt/mac-tweak/node/current"
previous_release="$CASE_HOME/.local/opt/mac-tweak/node/old"
ln -s "$CASE_HOME/.local/opt/mac-tweak/node/new" "$tool_pointer"
test ! -e "$tool_pointer.recovery" && test ! -L "$tool_pointer.recovery" && ln -s "$previous_release" "$tool_pointer.recovery" && /bin/mv -fh "$tool_pointer.recovery" "$tool_pointer"
pointer_record=$(printf '%s' "$tool_pointer" | shasum -a 256 | awk '{print $1}')
printf 'link:%s\n' "$previous_release" > "$CASE_HOME/.local/state/mac-tweak/ownership/$pointer_record"
test "$("$tool_pointer/bin/node" --version)" = 24.22.0
test "$(cat "$CASE_HOME/keep")" = unrelated
rm -rf "$CASE_HOME/.local" "$CASE_HOME/.config"
rm "$CASE_HOME/.zshrc" "$CASE_HOME/keep"
printf 'PASS: documented file and previous-pointer recovery preserves unrelated files\n'
