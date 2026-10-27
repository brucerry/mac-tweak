verify_selection() {
    local id visible failures=0 pending=0 component_pending i integration_pending=0
    if ! plan_build; then return 1; fi
    if test "${#FILE_PATHS[@]}" -gt 0 || test "${#TOOL_IDS[@]}" -gt 0 || test "${PREF_COUNT:-0}" -gt 0 || test "${#HELPER_IDS[@]}" -gt 0; then
        pending=1
    fi
    for id in $RESOLVED; do
        if test "$(catalog_field "$id" 2)" = tool; then
            if contains_id "${TOOL_IDS[*]}" "$id"; then
                printf 'PENDING [%s] tool installation has not been applied.\n' "$id"
                continue
            fi
            visible=$(env HOME="$HOME" /bin/zsh -f -c '[[ ! -f "$HOME/.config/${STORAGE_ID:-mac-tweak}/env.zsh" ]] || source "$HOME/.config/${STORAGE_ID:-mac-tweak}/env.zsh"; command -v -- "$1"' -- "$id") || visible=''
            if test -z "$visible"; then
                printf 'FAIL [%s] installed tool is not visible on the configured shell path.\n' "$id"; failures=1
            else
                printf 'PASS [%s] executable visible at %s\n' "$id" "$visible"
            fi
        elif test "$(catalog_field "$id" 2)" = guided; then
            printf 'MANUAL [%s] Configure and check this item in Preferences → System Settings.\n' "$id"
        elif test "$(catalog_field "$id" 2)" = preference; then
            if contains_id "${PREF_COMPONENTS[*]} ${HELPER_IDS[*]} ${FILE_COMPONENTS[*]}" "$id"; then
                printf 'PENDING [%s] requested preference values have not been saved.\n' "$id"
            else
                printf 'PASS [%s] requested saved preferences match, or Keep current; active process refresh is not verified.\n' "$id"
            fi
        else
            component_pending=0
            for ((i=0; i<${#FILE_COMPONENTS[@]}; i++)); do
                test "${FILE_COMPONENTS[$i]}" != "$id" || component_pending=1
                test "${FILE_COMPONENTS[$i]}" != shell-integration || integration_pending=1
            done
            if test "$component_pending" = 1; then printf 'PENDING [%s] managed configuration has not been applied.\n' "$id"
            else printf 'PASS [%s] managed configuration and syntax\n' "$id"; fi
        fi
    done
    if test "$integration_pending" = 1; then printf 'PENDING [shell-integration] shell loading has not been applied.\n'; fi
    if test "$pending" = 1; then printf 'Verification incomplete: selected setup has pending changes.\n'; fi
    test "$pending" = 0 || failures=1
    return "$failures"
}
