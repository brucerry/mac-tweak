hash_text() { shasum -a 256 | awk '{print $1}'; }
hash_file() { shasum -a 256 "$1" | awk '{print $1}'; }
read_text() { local value; value=$(cat "$1"; printf '\001'); printf '%s' "${value%$'\001'}"; }
file_hash() { if test -L "$1"; then printf 'link:%s\n' "$(readlink "$1")"; elif test -f "$1"; then printf 'file:%s:%s\n' "$(hash_file "$1")" "$(stat -f '%Lp:%m:%i' "$1")"; elif test -e "$1"; then printf 'directory\n'; else printf 'absent\n'; fi; }
owner_path() { printf '%s/ownership/%s\n' "$STATE" "$(printf '%s' "$1" | hash_text)"; }
owned_value() { local record; record=$(owner_path "$1"); test -f "$record" && test ! -L "$record" && cat "$record"; }
block() { BLOCKERS[${#BLOCKERS[@]}]="$*"; printf 'BLOCKED: %s\n' "$*"; }
observe() { OBS_PATHS[${#OBS_PATHS[@]}]="$1"; OBS_VALUES[${#OBS_VALUES[@]}]="$(file_hash "$1")"; }
observe_executable() {
    local resolved
    observe "$1"
    resolved=$(/bin/zsh -f -c 'print -r -- ${1:A}' -- "$1") || return 1
    if test "$resolved" != "$1"; then observe "$resolved"; fi
}
markers_valid() {
    test ! -f "$1" && return 0
    awk '
        /# >>> (mac-tweak|macos-setup)/ {if($0!="# >>> mac-tweak >>>" && $0!="# >>> macos-setup >>>" || started++ || ended) bad=1; begin=$0; inside=1; next}
        /# <<< (mac-tweak|macos-setup)/ {expected=begin; sub(/>>>/,"<<<",expected); sub(/>>>$/,"<<<",expected); if($0!=expected || !inside || ended++) bad=1; inside=0}
        END {exit bad || inside || started!=ended}
    ' "$1"
}
startup_block() {
    test -f "$1" || return 0
    awk '$0=="# >>> mac-tweak >>>" || $0=="# >>> macos-setup >>>" {inside=1} inside {print} $0=="# <<< mac-tweak <<<" || $0=="# <<< macos-setup <<<" {inside=0}' "$1"
}
without_block() {
    test -f "$1" || return 0
    local line inside=0 rc
    while true; do
        rc=0; IFS= read -r line || rc=$?
        test "$rc" = 0 || test -n "$line" || break
        if test "$line" = '# >>> mac-tweak >>>' || test "$line" = '# >>> macos-setup >>>'; then inside=1
        elif test "$line" = '# <<< mac-tweak <<<' || test "$line" = '# <<< macos-setup <<<'; then inside=0
        elif test "$inside" = 0; then printf '%s' "$line"; test "$rc" = 0 && printf '\n'; fi
        test "$rc" = 0 || break
    done < "$1"
    return 0
}
integration_content() {
    local target="$1" loader="$2" outside
    outside=$(without_block "$target"; printf '\001'); outside=${outside%$'\001'}
    printf '%s' "$outside"
    case "$outside" in ''|*$'\n') ;; *) printf '\n' ;; esac
    printf '# >>> %s >>>\n' "${STORAGE_ID:-mac-tweak}"
    printf '[[ ! -f "$HOME/.config/%s/%s.zsh" ]] || source "$HOME/.config/%s/%s.zsh"\n' "${STORAGE_ID:-mac-tweak}" "$loader" "${STORAGE_ID:-mac-tweak}" "$loader"
    printf '# <<< %s <<<\n' "${STORAGE_ID:-mac-tweak}"
}
validate_file_content() {
    case "$1" in
        plist) printf '%s' "$2" | /usr/bin/plutil -lint - >/dev/null ;;
        *) /bin/zsh -n <(printf '%s' "$2") ;;
    esac
}
add_file() {
    local component="$1" target="$2" content="$3" mode="$4" existing expected current index ownership_repair=0
    if ! inspect_target "$target"; then block "$component: resolve target $target"; return 0; fi
    if ! inspect_target "$(owner_path "$target")"; then block "$component: invalid ownership record for $target"; return 0; fi
    observe "$target"
    observe "$(owner_path "$target")"
    if test -f "$target"; then
        if test -s "$target" && ! LC_ALL=C grep -Iq '^' "$target"; then block "$component: expected text configuration at $target"; return 0; fi
        existing=$(read_text "$target"; printf '\001'); existing=${existing%$'\001'}
        expected=$(owned_value "$target" || true)
        if test "$mode" = startup; then
            markers_valid "$target" || { block "$component: malformed or duplicate markers in $target"; return 0; }
            current=$(startup_block "$target" | hash_text)
            if test -n "$(startup_block "$target")" && test "$expected" != "$current"; then
                if test "${REPAIR_MODE:-0}" = 1; then ownership_repair=1; recommend "$component" "Back up $target and restore its setup integration block; preserve other text."
                else block "$component: unmanaged or edited integration block in $target"; return 0; fi
            fi
        elif test -z "$expected" || test "$expected" != "$(hash_file "$target")"; then
            if test "${REPAIR_MODE:-0}" = 1; then ownership_repair=1; recommend "$component" "Back up and restore the published configuration at $target."
            else block "$component: unmanaged or edited configuration $target"; return 0; fi
        fi
        if test "$existing" = "$content" && test "$ownership_repair" = 0; then return 0; fi
    fi
    validate_file_content "$mode" "$content" || { block "$component: invalid proposed zsh syntax for $target"; return 0; }
    index=${#FILE_PATHS[@]}
    FILE_PATHS[$index]="$target" FILE_CONTENTS[$index]="$content" FILE_MODES[$index]="$mode" FILE_COMPONENTS[$index]="$component"
    printf 'CHANGE [%s] %s\n' "$component" "$target"
    printf '  Backup if existing: %s/runs/%s/backups/\n' "$STATE" "$PLAN_ID"
    diff -u --label "$target (current)" --label "$target (proposed)" \
        <(if test -f "$target"; then cat "$target"; fi) <(printf '%s' "$content") || test "$?" = 1
}
release_field() { awk -F '|' -v id="$1" -v arch="$HOST_ARCH" -v col="$2" '$1==id && $5==arch {print $col}' "$SETUP_ROOT/catalog/releases.txt"; }
releases_validate() {
    awk -F '|' '
        /^#/ || NF==0 {next}
        {
            if(NF!=12 || seen[$1 SUBSEP $5]++ || $1 !~ /^(node|uv|gh|tig)$/ || $5 !~ /^(arm64|x64)$/) bad=1
            for(i=1;i<=NF;i++) if($i=="") bad=1
            for(i=2;i<=4;i++) if($i !~ /^[0-9]+\.[0-9]+\.[0-9]+$/) bad=1
            if($6 !~ /^[0-9]+\.[0-9]+(\.[0-9]+)?$/ || $7 !~ /^(tar|zip|source)$/ || $8 !~ /^https:\/\//) bad=1
            if(length($9)!=64 || $9 !~ /^[0-9a-f]+$/ || $10 !~ /^[a-zA-Z0-9_+.-]+$/ || $10=="..") bad=1
            if($11 !~ /^[a-z][a-z0-9]*(,[a-z][a-z0-9]*)*$/ || $12 !~ /^(bin|\.)$/) bad=1
        }
        END {if(bad) exit 1}
    ' "$SETUP_ROOT/catalog/releases.txt" || die 'Invalid release metadata or missing checksum in catalog/releases.txt.'
}
inspect_tool() {
    local id="$1" version minimum maximum commands command executable actual base current expected link external_repair=0 needs_links=0
    version=$(release_field "$id" 2); minimum=$(release_field "$id" 3); maximum=$(release_field "$id" 4)
    test -n "$version" || { block "$id: missing release metadata for $HOST_ARCH"; return 0; }
    version_ge "$HOST_OS" "$(release_field "$id" 6)" || { block "$id: release $version needs macOS $(release_field "$id" 6) or later"; return 0; }
    commands=$(release_field "$id" 11)
    base="$HOME/.local/opt/${STORAGE_ID:-mac-tweak}/$id"
    executable=$(command -v "$id" || true)
    current="$base/current"
    if test -e "$current" && test ! -L "$current"; then block "$id: unmanaged current pointer conflict $current"; return 0; fi
    if test -L "$current"; then
        expected=$(owned_value "$current" || true)
        test "$expected" = "link:$(readlink "$current")" || { block "$id: edited or unmanaged pointer $current"; return 0; }
        executable="$current/bin/$id"
    fi
    if test -n "$executable"; then
        actual=$(command_version "$executable" || true)
        if ! test -L "$current"; then
            if test -z "$actual" || ! version_ge "$actual" "$minimum" || version_ge "$actual" "$maximum"; then
                if test "${REPAIR_MODE:-0}" = 1; then
                    external_repair=1
                    recommend "$id" "Install managed $version in place of ${actual:-not working}; keep the external installation at $executable."
                    observe_executable "$executable"
                else block "$id: external installation $executable (${actual:-not working}) does not meet >=$minimum, <$maximum; update through its manager or remove it, then retry"; return 0; fi
            fi
            if test "$external_repair" = 0; then
                for command in ${commands//,/ }; do
                    link=$(command -v "$command" || true)
                    if test -z "$link" || ! command_version "$link" >/dev/null; then
                        if test "${REPAIR_MODE:-0}" = 1; then external_repair=1; recommend "$id" "Install managed $version with its complete command set."; break
                        else block "$id: companion $command is not working"; return 0; fi
                    fi
                    observe_executable "$link"
                done
                if test "$external_repair" = 0; then printf 'SATISFIED [%s] reused external %s (%s)\n' "$id" "$executable" "$actual"; return 0; fi
            fi
        fi
        if test -L "$current" && test "$actual" = "$version"; then
            for command in ${commands//,/ }; do
                link="$HOME/.local/bin/$command"
                test -L "$link" && test "$(owned_value "$link" || true)" = "link:$(readlink "$link")" && \
                    test "$(readlink "$link")" = "$current/bin/$command" && PATH="$current/bin:$PATH" command_version "$link" >/dev/null || {
                    if test "${REPAIR_MODE:-0}" = 1 && repair_authorize_link "$id" "$link" "$current/bin/$command"; then needs_links=1
                    else block "$id: missing or edited managed command $link"; return 0; fi
                }
                observe_executable "$link"
            done
            observe "$current"
            observe_executable "$executable"
            if test "$needs_links" = 1; then
                REPAIR_FIX_IDS[${#REPAIR_FIX_IDS[@]}]="$id"
                recommend "$id" "Restore links to the healthy managed $version release."
                return 0
            fi
            printf 'SATISFIED [%s] managed %s\n' "$id" "$actual"
            return 0
        fi
    fi
    if test "$id" = tig && ! inspect_tig_prerequisites; then block 'tig: resolve build prerequisites before application'; return 0; fi
    for command in curl tar shasum; do command -v "$command" >/dev/null || { block "$id: missing $command"; return 0; }; done
    for command in ${commands//,/ }; do
        link="$HOME/.local/bin/$command"
        inspect_target "${link%/*}/.mac-tweak-parent-check" || { block "$id: invalid command parent"; return 0; }
        if test -e "$link" || test -L "$link"; then
            test -L "$link" && test "$(owned_value "$link" || true)" = "link:$(readlink "$link")" || {
                if ! repair_authorize_link "$id" "$link" "$current/bin/$command"; then block "$id: unmanaged executable conflict $link"; return 0; fi
            }
        fi
        observe_executable "$link"
    done
    inspect_target "$base/.mac-tweak-parent-check" || { block "$id: invalid install parent"; return 0; }
    test ! -e "$base/$version" || { block "$id: install version directory already exists without matching active installation: $base/$version"; return 0; }
    observe "$current"; observe "$base/$version"
    TOOL_IDS[${#TOOL_IDS[@]}]="$id"
    if test -L "$current"; then printf 'CHANGE [%s] managed %s -> %s\n' "$id" "${actual:-unhealthy}" "$version"; fi
    printf 'INSTALL [%s] %s for %s from %s\n' "$id" "$version" "$HOST_ARCH" "$(release_field "$id" 8)"
    printf '  Prerequisites: %s\n' "$(catalog_field "$id" 6)"
}
inspect_shell_component() {
    local id="$1" content before blockers_before
    content=$(read_text "$SETUP_ROOT/terminal/$id.zsh" | sed "s/mac-tweak/${STORAGE_ID:-mac-tweak}/g"; printf '\001'); content=${content%$'\001'}
    before=${#FILE_PATHS[@]}; blockers_before=${#BLOCKERS[@]}
    observe "$SETUP_ROOT/terminal/$id.zsh"
    add_file "$id" "$HOME/.config/${STORAGE_ID:-mac-tweak}/$id.zsh" "$content" owned
    if test "${#FILE_PATHS[@]}" = "$before" && test "${#BLOCKERS[@]}" = "$blockers_before"; then printf 'SATISFIED [%s] configuration unchanged\n' "$id"; fi
}
plan_build() {
    FILE_PATHS=() FILE_CONTENTS=() FILE_MODES=() FILE_COMPONENTS=() TOOL_IDS=() BLOCKERS=() OBS_PATHS=() OBS_VALUES=()
    repair_reset
    helpers_reset
    preferences_reset
    PLAN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
    STATE="$HOME/.local/state/${STORAGE_ID:-mac-tweak}"
    selection_show
    safe_home || { block 'Invalid destination home'; return 1; }
    inspect_host || { block 'Unsupported host'; return 1; }
    inspect_target "$STATE/.inspection" || { block 'Invalid state directory'; return 1; }
    inspect_target "$STATE/ownership/.inspection" || { block 'Invalid ownership directory'; return 1; }
    inspect_target "$STATE/runs/.inspection" || { block 'Invalid run directory'; return 1; }
    observe "$CATALOG"; observe "$SETUP_ROOT/catalog/releases.txt"
    printf 'Host: macOS %s, %s\n' "$HOST_OS" "$HOST_ARCH"
    local id content before index source_file shell_needed=0 path_needed=0
    for source_file in "$SETUP_ROOT"/lib/*.sh; do observe "$source_file"; done
    preferences_prepare
    for id in $RESOLVED; do
        printf '\n%s: %s\n' "$id" "$(catalog_field "$id" 5)"
        observe "$(module_path "$id")"
        module_load "$id"
        component_inspect
        if test "$(catalog_field "$id" 2)" = shell; then
            shell_needed=1
            test "$id" != local-bin-path || path_needed=1
        fi
    done
    if test "$shell_needed" = 1; then
        case "${ZDOTDIR:-$HOME}" in "$HOME"|'') ;; *) block 'Custom ZDOTDIR is unsupported; use the default home-based startup layout or exclude shell/tool components'; return 1 ;; esac
        for id in prompt aliases colors local-bin-path; do
            if ! contains_id "$RESOLVED" "$id" && test -e "$HOME/.config/${STORAGE_ID:-mac-tweak}/$id.zsh" && test -z "$(owned_value "$HOME/.config/${STORAGE_ID:-mac-tweak}/$id.zsh" || true)"; then
                block "shell-integration: unselected unmanaged snippet $HOME/.config/${STORAGE_ID:-mac-tweak}/$id.zsh; move it aside before installing the shared loader"
            fi
        done
        for id in env init; do
            content=$(read_text "$SETUP_ROOT/terminal/$id.zsh" | sed "s/mac-tweak/${STORAGE_ID:-mac-tweak}/g"; printf '\001'); content=${content%$'\001'}
            add_file shell-integration "$HOME/.config/${STORAGE_ID:-mac-tweak}/$id.zsh" "$content" owned
        done
        content=$(integration_content "$HOME/.zshrc" init; printf '\001'); content=${content%$'\001'}
        add_file shell-integration "$HOME/.zshrc" "$content" startup
        if test "$path_needed" = 1; then
            content=$(integration_content "$HOME/.zprofile" env; printf '\001'); content=${content%$'\001'}
            add_file shell-integration "$HOME/.zprofile" "$content" startup
        fi
    fi
    local change_label=configuration
    test "${REPAIR_MODE:-0}" != 1 || change_label=configuration/link
    if test -n "$PREF_SELECTED"; then
        printf '\nPlan: %s %s change(s), %s preference change(s), %s tool installation(s), %s blocker(s).\n' \
            "$((${#FILE_PATHS[@]} + ${#REPAIR_FIX_IDS[@]}))" "$change_label" "$PREF_COUNT" "${#TOOL_IDS[@]}" "${#BLOCKERS[@]}"
    else
        printf '\nPlan: %s %s change(s), %s tool installation(s), %s blocker(s).\n' "$(repair_change_count)" "$change_label" "${#TOOL_IDS[@]}" "${#BLOCKERS[@]}"
    fi
    test "${#BLOCKERS[@]}" = 0
}
