# Repair privileges exist only inside a separately approved in-memory session.
repair_reset() {
    REPAIR_LINK_PATHS=() REPAIR_LINK_DESTS=() REPAIR_BACKED_UP=() REPAIR_FIX_IDS=()
    REPAIR_LINK_VALUES=() REPAIR_OWNER_VALUES=() REPAIR_PAYLOAD_PATHS=() REPAIR_PAYLOAD_VALUES=()
}
recommend() { printf 'RECOMMEND [%s] %s\n' "$1" "$2"; }
repair_authorize_link() {
    local id="$1" target="$2" destination="$3" i resolved
    test "${REPAIR_MODE:-0}" = 1 || return 1
    case "$target" in "$HOME/.local/bin/"*) ;; *) return 1 ;; esac
    inspect_target "$(dirname "$target")/.repair-check" || return 1
    inspect_target "$(owner_path "$target")" || return 1
    if test -e "$target" && test ! -L "$target" && test ! -f "$target"; then return 1; fi
    for ((i=0; i<${#REPAIR_LINK_PATHS[@]}; i++)); do
        test "${REPAIR_LINK_PATHS[$i]}" != "$target" || return 0
    done
    i=${#REPAIR_LINK_PATHS[@]}
    REPAIR_LINK_PATHS[$i]="$target" REPAIR_LINK_DESTS[$i]="$destination" REPAIR_BACKED_UP[$i]=0
    REPAIR_LINK_VALUES[$i]=$(file_hash "$target")
    REPAIR_OWNER_VALUES[$i]=$(file_hash "$(owner_path "$target")")
    resolved=$(/bin/zsh -f -c 'print -r -- ${1:A}' -- "$target") || return 1
    REPAIR_PAYLOAD_PATHS[$i]="$resolved" REPAIR_PAYLOAD_VALUES[$i]=$(file_hash "$resolved")
    observe_executable "$target"
    observe "$(owner_path "$target")"
    if test -e "$target" || test -L "$target"; then
        recommend "$id" "Preserve and replace $target; its current installation will be kept."
    else recommend "$id" "Restore command link $target."; fi
}
repair_link_fresh() {
    local i="$1" target="${REPAIR_LINK_PATHS[$1]}" resolved
    resolved=$(/bin/zsh -f -c 'print -r -- ${1:A}' -- "$target") || return 1
    test "$(file_hash "$target")" = "${REPAIR_LINK_VALUES[$i]}" &&
        test "$resolved" = "${REPAIR_PAYLOAD_PATHS[$i]}" &&
        test "$(file_hash "$(owner_path "$target")")" = "${REPAIR_OWNER_VALUES[$i]}" &&
        test "$(file_hash "${REPAIR_PAYLOAD_PATHS[$i]}")" = "${REPAIR_PAYLOAD_VALUES[$i]}" || {
            printf 'Target changed after repair preview: %s; review a fresh repair.\n' "$target" >&2; return 1;
        }
}
repair_link_index() {
    local i
    test "${REPAIR_MODE:-0}" = 1 || return 1
    for ((i=0; i<${#REPAIR_LINK_PATHS[@]}; i++)); do
        if test "${REPAIR_LINK_PATHS[$i]}" = "$1" && test "${REPAIR_LINK_DESTS[$i]}" = "$2"; then printf '%s' "$i"; return 0; fi
    done
    return 1
}
repair_backup_tool_links() {
    local id="$1" command target i backup
    test "${REPAIR_MODE:-0}" = 1 || return 0
    for command in $(release_field "$id" 11 | tr ',' ' '); do
        target="$HOME/.local/bin/$command"
        i=$(repair_link_index "$target" "$HOME/.local/opt/${STORAGE_ID:-mac-tweak}/$id/current/bin/$command") || continue
        test "${REPAIR_BACKED_UP[$i]}" != 1 || continue
        repair_link_fresh "$i" || return 1
        if test -e "$target" || test -L "$target"; then
            backup="$RUN/backups/command-$i"
            cp -Pp "$target" "$backup" || return 1
            record_event preserved-command "$target" "$backup" || return 1
            repair_link_fresh "$i" || return 1
        fi
        REPAIR_BACKED_UP[$i]=1
    done
}
repair_link_permitted() {
    local i
    i=$(repair_link_index "$1" "$2") || return 1
    test "${REPAIR_BACKED_UP[$i]}" = 1 && repair_link_fresh "$i"
}
repair_existing_tool_links() {
    local id="$1" command current="$HOME/.local/opt/${STORAGE_ID:-mac-tweak}/$1/current"
    commands_work "$id" "$current" "$(release_field "$id" 2)" || return 1
    repair_backup_tool_links "$id" || return 1
    for command in $(release_field "$id" 11 | tr ',' ' '); do
        activate_link "$HOME/.local/bin/$command" "$current/bin/$command" || return 1
    done
    record_event repaired-links "$id" "$(release_field "$id" 2)"
}
repair_change_count() { printf '%s' "$((${#FILE_PATHS[@]} + ${#REPAIR_FIX_IDS[@]} + ${PREF_COUNT:-0} + ${#HELPER_IDS[@]}))"; }
