# Typed preferences are inspected by the built-in JXA bridge, never sourced as shell.
preferences_bridge() { /usr/bin/osascript -l JavaScript "$SETUP_ROOT/preferences/bridge.js" "$SETUP_ROOT" "$@"; }
preferences_reset() { PREF_PLAN= PREF_COUNT=0 PREF_SELECTED= PREF_OUTPUT=; PREF_COMPONENTS=() PREF_SETTING_IDS=(); }
preferences_consume() {
    local text="$1" line marker count encoded extra component id seen=0
    while IFS= read -r line; do
        case "$line" in
            '__PREFERENCES_PLAN__|'*)
                test "$seen" = 0 || return 1
                IFS='|' read -r marker count encoded extra <<< "$line"
                [[ "$count" =~ ^[0-9]{1,3}$ ]] && test "$count" -le 256 && [[ "$encoded" =~ ^[A-Za-z0-9+/]+=*$ ]] && test -z "$extra" || return 1
                PREF_COUNT="$count" PREF_PLAN="$encoded"; seen=1 ;;
            '__PREFERENCES_ACTION__|'*)
                IFS='|' read -r marker component id extra <<< "$line"
                test "$(catalog_field "$component" 2)" = preference && [[ "$id" =~ ^[a-z][a-z0-9-]*$ ]] && test -z "$extra" || return 1
                PREF_COMPONENTS[${#PREF_COMPONENTS[@]}]="$component" PREF_SETTING_IDS[${#PREF_SETTING_IDS[@]}]="$id" ;;
            '__PREFERENCES_COMPONENT__|'*)
                component=${line#*|}
                test "$(catalog_field "$component" 2)" = preference || return 1
                PREF_SELECTED="$PREF_SELECTED $component" ;;
            'PREFERENCE_CHANGE ['*|'SATISFIED ['*|'REFRESH ['*) PREF_OUTPUT="$PREF_OUTPUT$line"$'\n' ;;
            '') ;;
            *) return 1 ;;
        esac
    done <<< "$text"
    test "$seen" = 1 && test "${#PREF_COMPONENTS[@]}" = "$PREF_COUNT"
}
preferences_prepare() {
    local id groups= output source
    for id in $RESOLVED; do
        if test "$(catalog_field "$id" 2)" = preference; then groups="${groups:+$groups,}$id"; fi
    done
    if test -z "$groups"; then
        test -z "${PREFERENCES_FILE:-}" || block 'system-preferences: preference overrides require a selected preference group'
        return 0
    fi
    for source in "$SETUP_ROOT/catalog/preferences.json" "$SETUP_ROOT"/preferences/*.js; do observe "$source"; done
    if test -n "${PREFERENCES_FILE:-}"; then
        test -f "$PREFERENCES_FILE" && test ! -L "$PREFERENCES_FILE" || { block 'system-preferences: preferences-file must be a regular file'; return 0; }
        observe "$PREFERENCES_FILE"
    fi
    if ! output=$(preferences_bridge plan "$groups" "${PREFERENCES_FILE:--}" "$HOST_OS" 2>&1); then
        case "$output" in *'Cannot inspect preference'*|*'Unsupported stored'*|*'Unsupported numeric preference'*) printf 'FAIL [system-preferences] could not inspect the selected stored preference safely.\n' ;; esac
        block "system-preferences: $output"; return 0
    fi
    preferences_consume "$output" || { block 'system-preferences: invalid preference inspection protocol'; return 0; }
}
preferences_inspect() {
    local line
    while IFS= read -r line; do
        case "$line" in "PREFERENCE_CHANGE [$1] "*|"SATISFIED [$1] "*|"REFRESH [$1] "*) printf '%s\n' "$line" ;; esac
    done <<< "$PREF_OUTPUT"
}
preferences_observations_match() {
    test -z "${PREF_PLAN:-}" || preferences_bridge check "$PREF_PLAN" >/dev/null
}
preferences_snapshot() {
    preferences_bridge snapshot "$PREF_PLAN" "$RUN" || return 1
    record_event preference-originals "$RUN/preferences.json" current-user-any-host
}
preferences_apply() {
    local index="$1" id="${PREF_SETTING_IDS[$1]}"
    record_event preference-attempt "$id" "$RUN/preferences-results/$id.json" || return 1
    preferences_bridge apply "$PREF_PLAN" "$index" "$RUN" || return 1
    record_event preference-saved "$id" "$RUN/preferences-results/$id.json"
}
preferences_recover() {
    local run_id= output source
    YES=0 REPAIR_MODE=0 PREFERENCES_FILE= REQUESTED= RESOLVED= EXCLUDED=
    while test "$#" -gt 0; do
        case "$1" in
            --run) test "$#" -ge 2 && test -z "$run_id" || die 'Provide --run once'; run_id="$2"; shift 2 ;;
            --yes) YES=1; shift ;;
            *) die "Unknown recovery option: $1" ;;
        esac
    done
    [[ "$run_id" =~ ^[0-9]{8}T[0-9]{6}Z-[0-9]+$ ]] || die 'A valid --run identifier is required.'
    safe_home && inspect_host || return 1
    STATE="$HOME/.local/state/${STORAGE_ID:-mac-tweak}" PLAN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
    FILE_PATHS=() FILE_CONTENTS=() FILE_MODES=() FILE_COMPONENTS=() TOOL_IDS=() BLOCKERS=() OBS_PATHS=() OBS_VALUES=()
    repair_reset; preferences_reset
    inspect_target "$STATE/.inspection" && inspect_target "$STATE/ownership/.inspection" && inspect_target "$STATE/runs/.inspection" || return 1
    source="$STATE/runs/$run_id"
    inspect_target "$source/preferences.json" || return 1
    observe "$source/preferences.json"
    for output in "$source"/preferences-results/*.json; do
        test -e "$output" || test -L "$output" || continue
        inspect_target "$output" || return 1
        observe "$output"
    done
    for output in "$SETUP_ROOT/catalog/preferences.json" "$CATALOG" "$SETUP_ROOT"/preferences/*.js "$SETUP_ROOT"/lib/*.sh; do observe "$output"; done
    if ! output=$(preferences_bridge recover-plan "$source" "$HOST_OS" 2>&1); then printf '%s\n' "$output" >&2; return 1; fi
    preferences_consume "$output" || die 'Invalid preference recovery protocol.'
    REQUESTED="$PREF_SELECTED" RESOLVED="$PREF_SELECTED"
    selection_show
    printf '%s' "$PREF_OUTPUT"
    printf 'Plan: %s recorded preference value(s) to restore.\n' "$PREF_COUNT"
    confirm_current_plan
}
