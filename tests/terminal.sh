#!/bin/bash
set -eo pipefail
shell_value() { env HOME="$CASE_HOME" PATH=/usr/bin:/bin:/usr/sbin:/sbin /bin/zsh -fic 'unset CLICOLOR LSCOLORS; source "$HOME/.config/mac-tweak/init.zsh"; eval "$1"' -- "$1"; }
run_setup apply --with prompt --yes > "$TEST_ROOT/prompt.log"
prompt_value=$(shell_value 'print -r -- "$PROMPT"')
for expansion in '%n' '%m' '%~' '%#' '%f%b'; do assert_contains "$prompt_value" "$expansion"; done
test ! -e "$CASE_HOME/.config/mac-tweak/aliases.zsh"
test ! -e "$CASE_HOME/.config/mac-tweak/colors.zsh"
test "$(shell_value 'print -r -- ${+aliases[ll]}:${+CLICOLOR}')" = 0:0
rendered=$(shell_value 'cd "$HOME"; print -P -- "$PROMPT"')
assert_contains "$rendered" "$(id -un)"
assert_contains "$rendered" '~'
rm -rf "$CASE_HOME/.local" "$CASE_HOME/.config"
rm "$CASE_HOME/.zshrc"
run_setup apply --with aliases --yes > "$TEST_ROOT/aliases.log"
assert_contains "$(shell_value 'alias ls; alias ll')" "ll='ls -al'"
assert_contains "$(shell_value 'alias ls')" "ls='ls -G'"
test ! -e "$CASE_HOME/.config/mac-tweak/prompt.zsh"
test ! -e "$CASE_HOME/.config/mac-tweak/colors.zsh"
rm -rf "$CASE_HOME/.local" "$CASE_HOME/.config"
rm "$CASE_HOME/.zshrc"
run_setup apply --with colors --yes > "$TEST_ROOT/colors.log"
test "$(shell_value 'print -r -- "$CLICOLOR:$LSCOLORS"')" = '1:ExGxFxdxCxDxDxabagacadah'
test "$(shell_value 'print -r -- ${+aliases[ll]}')" = 0
rm -rf "$CASE_HOME/.local" "$CASE_HOME/.config"
rm "$CASE_HOME/.zshrc"
printf 'PASS: independent prompt, aliases, colors, identity expansions, and style reset\n'
printf '# keep original bytes without final newline' > "$CASE_HOME/.zshrc"
cp "$CASE_HOME/.zshrc" "$TEST_ROOT/startup-before"
run_setup apply --with prompt --yes > "$TEST_ROOT/integration-first.log"
prompt_hash=$(shasum -a 256 "$CASE_HOME/.config/mac-tweak/prompt.zsh")
printf '\n# later user edit outside managed block' >> "$CASE_HOME/.zshrc"
mkdir "$TEST_ROOT/checkout"
for part in tweak.sh src; do cp -R "$TEST_REPO/$part" "$TEST_ROOT/checkout/$part"; done
env HOME="$CASE_HOME" PATH=/usr/bin:/bin:/usr/sbin:/sbin /bin/bash "$TEST_ROOT/checkout/tweak.sh" apply --with aliases --yes > "$TEST_ROOT/integration-second.log"
mv "$TEST_ROOT/checkout" "$TEST_ROOT/moved-checkout"
test "$(shasum -a 256 "$CASE_HOME/.config/mac-tweak/prompt.zsh")" = "$prompt_hash"
cmp <(head -c "$(wc -c < "$TEST_ROOT/startup-before" | tr -d ' ')" "$CASE_HOME/.zshrc") "$TEST_ROOT/startup-before"
grep -q '# later user edit outside managed block' "$CASE_HOME/.zshrc"
test "$(grep -c '# >>> mac-tweak >>>' "$CASE_HOME/.zshrc")" = 1
assert_contains "$(shell_value 'print -r -- "$PROMPT"; alias ll')" '%n'
assert_contains "$(shell_value 'alias ll')" "ll='ls -al'"
run_setup verify --with prompt,aliases > "$TEST_ROOT/integration-verify.log"
rm -rf "$CASE_HOME/.local" "$CASE_HOME/.config"
rm "$CASE_HOME/.zshrc"
printf 'PASS: preserved outside-block bytes/edits, prior selections, and moved checkout\n'
mkdir -p "$CASE_HOME/.local/bin" "$TEST_ROOT/external-bin"
printf '#!/bin/sh\necho local\n' > "$CASE_HOME/.local/bin/example"
printf '#!/bin/sh\necho external\n' > "$TEST_ROOT/external-bin/other-example"
chmod +x "$CASE_HOME/.local/bin/example" "$TEST_ROOT/external-bin/other-example"
run_setup apply --with local-bin-path --yes > "$TEST_ROOT/path-apply.log"
for shell_mode in -ic -lic -lc; do
    path_result=$(/usr/bin/env -u CLICOLOR -u LSCOLORS HOME="$CASE_HOME" ZDOTDIR="$CASE_HOME" \
        PATH="$TEST_ROOT/external-bin:/usr/bin:/bin:/usr/sbin:/sbin" /bin/zsh "$shell_mode" \
        'command -v example; command -v other-example; found=0; for entry in "${path[@]}"; do [[ "$entry" != "$HOME/.local/bin" ]] || ((++found)); done; print -r -- "count=$found,styling=${+aliases[ll]}:${+CLICOLOR}"')
    assert_contains "$path_result" "$CASE_HOME/.local/bin/example"
    assert_contains "$path_result" "$TEST_ROOT/external-bin/other-example"
    assert_contains "$path_result" 'count=1,styling=0:0'
done
rm -rf "$CASE_HOME/.local" "$CASE_HOME/.config"
rm "$CASE_HOME/.zshrc" "$CASE_HOME/.zprofile"
printf 'PASS: login/interactive path visibility, deduplication, preserved external commands, and independent styling\n'
run_setup apply --with aliases --yes > "$TEST_ROOT/drift-first.log"
printf '# user edit\n' >> "$CASE_HOME/.config/mac-tweak/aliases.zsh"
edited_hash=$(shasum -a 256 "$CASE_HOME/.config/mac-tweak/aliases.zsh")
if run_setup apply --with aliases --yes > "$TEST_ROOT/drift.log" 2>&1; then exit 1; fi
assert_contains "$(cat "$TEST_ROOT/drift.log")" 'unmanaged or edited configuration'
test "$(shasum -a 256 "$CASE_HOME/.config/mac-tweak/aliases.zsh")" = "$edited_hash"
rm -rf "$CASE_HOME/.local" "$CASE_HOME/.config"
rm "$CASE_HOME/.zshrc"
for malformed in incomplete duplicate; do
    printf '# >>> mac-tweak >>>\n' > "$CASE_HOME/.zshrc"
    if test "$malformed" = duplicate; then printf '# <<< mac-tweak <<<\n# >>> mac-tweak >>>\n# <<< mac-tweak <<<\n' >> "$CASE_HOME/.zshrc"; fi
    original=$(shasum -a 256 "$CASE_HOME/.zshrc")
    if run_setup apply --with aliases --yes > "$TEST_ROOT/markers.log" 2>&1; then exit 1; fi
    assert_contains "$(cat "$TEST_ROOT/markers.log")" 'malformed or duplicate markers'
    test "$(shasum -a 256 "$CASE_HOME/.zshrc")" = "$original"
    test ! -e "$CASE_HOME/.local"
done
rm "$CASE_HOME/.zshrc"
printf 'if then\n' > "$TEST_ROOT/moved-checkout/src/terminal/aliases.zsh"
if env HOME="$CASE_HOME" PATH=/usr/bin:/bin:/usr/sbin:/sbin /bin/bash "$TEST_ROOT/moved-checkout/tweak.sh" apply --with aliases --yes > "$TEST_ROOT/syntax.log" 2>&1; then exit 1; fi
assert_contains "$(cat "$TEST_ROOT/syntax.log")" 'invalid proposed zsh syntax'
test ! -e "$CASE_HOME/.config"
test ! -e "$CASE_HOME/.local"
mkdir -p "$CASE_HOME/.config/mac-tweak"
printf '# unrelated unselected prompt\n' > "$CASE_HOME/.config/mac-tweak/prompt.zsh"
if run_setup apply --with aliases --yes > "$TEST_ROOT/unselected.log" 2>&1; then exit 1; fi
assert_contains "$(cat "$TEST_ROOT/unselected.log")" 'unselected unmanaged snippet'
rm -rf "$CASE_HOME/.config"
printf '# preserve symlink destination\n' > "$TEST_ROOT/linked-startup"
ln -s "$TEST_ROOT/linked-startup" "$CASE_HOME/.zshrc"
if run_setup apply --with prompt --yes > "$TEST_ROOT/link.log" 2>&1; then exit 1; fi
test -L "$CASE_HOME/.zshrc"
test "$(cat "$TEST_ROOT/linked-startup")" = '# preserve symlink destination'
rm "$CASE_HOME/.zshrc"
printf 'PASS: managed drift, malformed markers, syntax errors, symlinks, and unselected unmanaged snippets remain unchanged\n'
grep -Fq "ls='ls -G'" "$TEST_REPO/docs/terminal.md"
grep -Fq "ll='ls -al'" "$TEST_REPO/docs/terminal.md"
grep -Fq 'LSCOLORS=ExGxFxdxCxDxDxabagacadah' "$TEST_REPO/docs/terminal.md"
assert_contains "$(run_setup info prompt)" 'Override PROMPT after existing zshrc text'
assert_contains "$(run_setup info colors)" 'CLICOLOR=1'
printf 'PASS: terminal documentation describes tested settings and precedence\n'
