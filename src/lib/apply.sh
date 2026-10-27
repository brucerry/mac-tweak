apply_cleanup() {
    if test "${LOCK_HELD:-0}" = 1; then
        rm -f "$STATE/lock/pid"
        rmdir "$STATE/lock" 2>/dev/null || true
    fi
}
apply_interrupted() {
    trap '' INT TERM
    printf 'Run interrupted by %s; completed actions remain in place.\n' "$1" >&2
    if test -n "${RUN:-}" && test -d "$RUN"; then
        record_event interrupted "${ACTIVE_ACTION:-initializing}" "$1" || true
        printf 'Run records and recovery information: %s\n' "$RUN" >&2
    fi
    exit "$2"
}
observations_match() {
    local i
    for ((i=0; i<${#OBS_PATHS[@]}; i++)); do
        test "$(file_hash "${OBS_PATHS[$i]}")" = "${OBS_VALUES[$i]}" || {
            printf 'Target changed after preview: %s; review a fresh plan.\n' "${OBS_PATHS[$i]}" >&2; return 1;
        }
    done
    for ((i=0; i<${#FILE_PATHS[@]}; i++)); do inspect_target "${FILE_PATHS[$i]}" || return 1; done
    inspect_target "$STATE/.inspection" || return 1
    preferences_observations_match
}
write_owner() {
    local target="$1" value="$2" record temp
    record=$(owner_path "$target")
    temp=$(mktemp "$STATE/ownership/.record.XXXXXX") || return 1
    printf '%s\n' "$value" > "$temp" && mv -f "$temp" "$record"
}
record_event() { printf '%s|%s|%s\n' "$1" "$2" "${3:-}" >> "$RUN/events.txt"; }
ensure_directory() {
    local cursor="$1" missing=() i
    while test ! -d "$cursor"; do missing[${#missing[@]}]="$cursor"; cursor=${cursor%/*}; done
    for ((i=${#missing[@]}-1; i>=0; i--)); do
        mkdir "${missing[$i]}" || return 1
        record_event directory "${missing[$i]}" || return 1
    done
}
apply_file() {
    local i="$1" target="${FILE_PATHS[$1]}" temporary value mode="${FILE_MODES[$1]}"
    inspect_target "$target" || return 1
    ensure_directory "$(dirname "$target")" || return 1
    if test -f "$target"; then
        cp -p "$target" "$RUN/backups/$i" || return 1
        record_event backup "$target" "$RUN/backups/$i" || return 1
    else
        record_event create "$target" || return 1
    fi
    temporary=$(mktemp "$(dirname "$target")/.mac-tweak.XXXXXX") || return 1
    if test -f "$target"; then chmod "$(stat -f '%Lp' "$target")" "$temporary" || return 1; fi
    printf '%s' "${FILE_CONTENTS[$i]}" > "$temporary" || return 1
    if ! validate_file_content "$mode" "${FILE_CONTENTS[$i]}"; then rm -f "$temporary"; return 1; fi
    if ! mv -f "$temporary" "$target"; then rm -f "$temporary"; return 1; fi
    if test "$mode" = startup; then value=$(startup_block "$target" | hash_text); else value=$(hash_file "$target"); fi
    write_owner "$target" "$value" || return 1
    record_event changed "$target" "$(hash_file "$target")"
}
commands_work() {
    local id="$1" payload="$2" version="$3" command actual
    for command in $(release_field "$id" 11 | tr ',' ' '); do
        test -x "$payload/bin/$command" || { printf 'Missing executable: %s\n' "$payload/bin/$command" >&2; return 1; }
        actual=$(PATH="$payload/bin:$PATH" command_version "$payload/bin/$command") || return 1
        if test "$command" = "$id"; then test "$actual" = "$version" || { printf 'Unexpected staged %s version: %s\n' "$id" "$actual" >&2; return 1; }; fi
    done
}
activate_link() {
    local target="$1" destination="$2" previous temporary repairing=0
    inspect_target "$(dirname "$target")/.parent-check" || return 1
    ensure_directory "$(dirname "$target")" || return 1
    if test "${REPAIR_MODE:-0}" = 1 && repair_link_index "$target" "$destination" >/dev/null; then
        repair_link_permitted "$target" "$destination" || return 1
        repairing=1
    fi
    if test -e "$target" || test -L "$target"; then
        if test "$repairing" = 1; then
            record_event replaced-command "$target" "$destination" || return 1
        else
            test -L "$target" || { printf 'Unmanaged target: %s\n' "$target" >&2; return 1; }
            previous="link:$(readlink "$target")"
            test "$(owned_value "$target" || true)" = "$previous" || { printf 'Edited or unmanaged link: %s\n' "$target" >&2; return 1; }
            record_event previous-link "$target" "${previous#link:}" || return 1
        fi
    else
        record_event create-link "$target" || return 1
    fi
    temporary=$(mktemp -d "$(dirname "$target")/.mac-tweak-link.XXXXXX") || return 1
    ln -s "$destination" "$temporary/link" || return 1
    # BSD mv -h replaces a destination symlink instead of following its directory.
    if ! mv -fh "$temporary/link" "$target"; then rmdir "$temporary"; return 1; fi
    rmdir "$temporary" || return 1
    write_owner "$target" "link:$destination"
}
activate_tool() {
    local id="$1" payload="$2" version="$3" base="$HOME/.local/opt/${STORAGE_ID:-mac-tweak}/$1" staged command
    commands_work "$id" "$payload" "$version" || return 1
    inspect_target "$base/.parent-check" || return 1
    ensure_directory "$base" || return 1
    test ! -e "$base/$version" && test ! -L "$base/$version" || { printf 'Version directory already exists: %s\n' "$base/$version" >&2; return 1; }
    staged=$(mktemp -d "$base/.release.XXXXXX") || return 1
    cp -R "$payload/." "$staged" || return 1
    commands_work "$id" "$staged" "$version" || return 1
    mv "$staged" "$base/$version" || return 1
    record_event create-release "$base/$version" "$version" || return 1
    activate_link "$base/current" "$base/$version" || return 1
    for command in $(release_field "$id" 11 | tr ',' ' '); do
        activate_link "$HOME/.local/bin/$command" "$base/current/bin/$command" || return 1
    done
    record_event tool "$id" "$version"
}
apply_selection() {
    plan_build || return 1
    confirm_current_plan
}
confirm_current_plan() {
    if test "$(repair_change_count)" = 0 && test "${#TOOL_IDS[@]}" = 0; then printf 'Nothing to change.\n'; return 0; fi
    if test "$YES" != 1; then
        test -t 0 || die 'Noninteractive application requires explicit --yes approval.'
        local answer
        printf 'Apply this plan? [y/N] '
        IFS= read -r answer || answer=n
        case "$answer" in y|Y|yes) ;; *) printf 'Cancelled; no changes.\n'; return 0 ;; esac
    fi
    apply_reviewed_plan
}
review_session() {
    test "$YES" = 0 || die 'A graphical review cannot use --yes.'
    local kind=REVIEW approval_kind=apply
    if test "${REPAIR_MODE:-0}" = 1; then kind=REPAIR; approval_kind=repair; fi
    if ! plan_build; then printf '__MAC_TWEAK_%s_BLOCKED__\n' "$kind"; return 1; fi
    local token="$$-$RANDOM-$RANDOM" approval
    printf '__MAC_TWEAK_%s_READY__|%s|%s|%s\n' "$kind" "$token" "$(repair_change_count)" "${#TOOL_IDS[@]}"
    IFS= read -r approval || approval=cancel
    if test "$approval" = cancel; then printf 'Cancelled; no changes.\n'; return 0; fi
    test "$approval" = "$approval_kind:$token" || die 'Review approval does not match this session.'
    apply_reviewed_plan
}
apply_reviewed_plan() {
    if test "$(repair_change_count)" = 0 && test "${#TOOL_IDS[@]}" = 0; then printf 'Nothing to change.\n'; return 0; fi
    observations_match || return 1
    umask 077
    mkdir -p "$STATE" || return 1
    mkdir "$STATE/lock" 2>/dev/null || die "Another application holds $STATE/lock; inspect it before retrying."
    LOCK_HELD=1
    trap 'apply_cleanup' EXIT
    trap 'apply_interrupted INT 130' INT
    trap 'apply_interrupted TERM 143' TERM
    printf '%s\n' "$$" > "$STATE/lock/pid" || return 1
    observations_match || return 1
    RUN="$STATE/runs/$PLAN_ID"
    mkdir -p "$STATE/runs" "$STATE/ownership" || return 1
    mkdir "$RUN" "$RUN/backups" "$RUN/stage" || return 1
    printf 'Selection:%s\nCatalog: %s\n' "$RESOLVED" "$(cat "$CATALOG" "$SETUP_ROOT/catalog/releases.txt" | hash_text)" > "$RUN/summary.txt" || return 1
    local i failed=0 id
    if ! helpers_stage; then
        printf 'FAILED [helpers] build or self-check failed before configuration changes.\n' >&2
        record_event failed helper-staging || true; return 1
    fi
    observations_match || return 1
    for ((i=0; i<${#FILE_PATHS[@]}; i++)); do
        if test "$failed" = 1; then printf 'UNATTEMPTED [%s] %s\n' "${FILE_COMPONENTS[$i]}" "${FILE_PATHS[$i]}"; continue; fi
        ACTIVE_ACTION="${FILE_PATHS[$i]}"
        if apply_file "$i"; then
            printf 'DONE [%s] %s\n' "${FILE_COMPONENTS[$i]}" "${FILE_PATHS[$i]}"
        else
            printf 'FAILED [%s] %s\n' "${FILE_COMPONENTS[$i]}" "${FILE_PATHS[$i]}" >&2; failed=1
            record_event failed "${FILE_PATHS[$i]}" || true
        fi
    done
    for id in "${TOOL_IDS[@]}"; do
        if test "$failed" = 1; then printf 'UNATTEMPTED [%s]\n' "$id"; continue; fi
        ACTIVE_ACTION="$id"
        module_load "$id"
        if component_apply; then printf 'DONE [%s]\n' "$id"
        else printf 'FAILED [%s]\n' "$id" >&2; record_event failed "$id" || true; failed=1; fi
    done
    for id in "${REPAIR_FIX_IDS[@]}"; do
        if test "$failed" = 1; then printf 'UNATTEMPTED [%s] command-link repair\n' "$id"; continue; fi
        ACTIVE_ACTION="$id"
        if repair_existing_tool_links "$id"; then printf 'DONE [%s] command links repaired\n' "$id"
        else printf 'FAILED [%s] command-link repair\n' "$id" >&2; record_event failed "$id" || true; failed=1; fi
    done
    if test "${PREF_COUNT:-0}" -gt 0 && test "$failed" = 0; then
        if ! preferences_snapshot; then
            printf 'FAILED [system-preferences] could not preserve current preference originals; no preference writes started.\n' >&2
            record_event failed system-preferences-backup || true
            failed=1
        fi
    fi
    for ((i=0; i<${PREF_COUNT:-0}; i++)); do
        id="${PREF_COMPONENTS[$i]}"
        if test "$failed" = 1; then printf 'UNATTEMPTED [%s] %s\n' "$id" "${PREF_SETTING_IDS[$i]}"; continue; fi
        ACTIVE_ACTION="${PREF_SETTING_IDS[$i]}"
        if preferences_apply "$i"; then printf 'DONE [%s] %s\n' "$id" "${PREF_SETTING_IDS[$i]}"
        else
            printf 'FAILED [%s] %s; inspect preference records for saved or uncertain outcomes.\n' "$id" "${PREF_SETTING_IDS[$i]}" >&2
            record_event failed "${PREF_SETTING_IDS[$i]}" || true
            failed=1
        fi
    done
    if test "$failed" = 0; then
        if ! helpers_apply; then printf 'FAILED [helpers] activation failed; inspect helper recovery records.\n' >&2; record_event failed helpers || true; failed=1; fi
    fi
    printf 'Run records and recovery information: %s\n' "$RUN"
    if test "$failed" = 1; then printf 'Run failed; completed actions remain in place. See docs/recovery.md.\n' >&2
    else record_event completed run || return 1; printf 'Application complete. Open a new terminal and run verify for the same selection.\n'; fi
    return "$failed"
}
