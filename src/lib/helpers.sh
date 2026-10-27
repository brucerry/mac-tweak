# Helpers are built from reviewed repository source. No input hooks run in tests.
helpers_reset() { HELPER_IDS=() HELPER_NAMES=() HELPER_HASHES=() HELPER_PATHS=() HELPER_STAGED=() HELPER_TREES=(); }
helper_name() { case "$1" in gestures) printf DockMinimizer ;; closing) printf QuitOnRed ;; windowskeys) printf WindowsKeys ;; *) return 1 ;; esac; }
helper_source() { case "$1" in gestures) printf dockminimizer ;; closing) printf quitonred ;; windowskeys) printf windowskeys ;; *) return 1 ;; esac; }
helper_tree_hash() {
    if test ! -d "$1"; then printf absent; return 0; fi
    /usr/bin/find "$1" -type f -exec /usr/bin/shasum -a 256 {} \; | LC_ALL=C sort | hash_text
}
helper_plan() {
    local id="$1" name source path binary fingerprint file content label agent login index existing=0 sources
    name=$(helper_name "$id") source=$(helper_source "$id")
    path="$HOME/Applications/$name.app" binary="$HOME/Applications/$name.app/Contents/MacOS/$name"
    observe "$SETUP_ROOT/behaviors/metadata.js"
    sources=("$SETUP_ROOT/behaviors/$source/"*.swift)
    case "$id" in gestures|closing) sources=("$SETUP_ROOT/behaviors/shared/InteractionSafety.swift" "${sources[@]}") ;; esac
    for file in "${sources[@]}"; do observe "$file"; done
    fingerprint=$(cat "${sources[@]}" "$SETUP_ROOT/behaviors/metadata.js" | hash_text)
    if ! inspect_target "$binary" || ! inspect_target "$path/Contents/Info.plist" || ! inspect_target "$path/Contents/Resources/source.sha256"; then block "$id: helper application path is unsafe"; return 0; fi
    observe "$binary"; observe "$path/Contents/Info.plist"; observe "$(owner_path "$path/Contents/Info.plist")"; observe "$path/Contents/Resources/source.sha256"; observe "$(owner_path "$binary")"
    if test -d "$path"; then
        existing=1
        if test -n "$(find "$path" -type l -print -quit)"; then block "$id: helper application contains symlinks; preserve it manually first"; return 0; fi
    fi
    if test -f "$path/Contents/Resources/source.sha256" && test "$(cat "$path/Contents/Resources/source.sha256")" = "$fingerprint" &&
       test -x "$binary" && test "$(owned_value "$binary" || true)" = "$(hash_file "$binary")" && test "$(owned_value "$path/Contents/Info.plist" || true)" = "$(hash_file "$path/Contents/Info.plist")"; then
        printf 'SATISFIED [%s] helper source and owned executable match; running state and Accessibility are checked separately.\n' "$id"
    else
        if test "$existing" = 1 && test "${REPAIR_MODE:-0}" != 1; then
            block "$id: existing helper will be preserved before rebuilding; use the recommended repair review"; return 0
        fi
        xcrun --find swiftc >/dev/null 2>&1 || { block "$id: install Apple Command Line Tools, then review again"; return 0; }
        index=${#HELPER_IDS[@]}; HELPER_IDS[$index]="$id" HELPER_NAMES[$index]="$name" HELPER_PATHS[$index]="$path" HELPER_HASHES[$index]="$fingerprint" HELPER_TREES[$index]="$(helper_tree_hash "$path")"
        printf 'HELPER_CHANGE [%s] Build %s from reviewed source; preserve any previous app. Quit an old running instance after a rebuild, then start explicitly after Apply.\n' "$id" "$name"
        printf 'REFRESH [%s] Open the installed helper in ~/Applications after Apply; choose startup in Preferences. Approve Accessibility for window gestures/closing.\n' "$id"
    fi
    login=$(preferences_bridge helper-login "$PREF_PLAN" "$id") || { block "$id: cannot resolve login choice"; return 0; }
    case "$login" in true|false) ;; *) block "$id: invalid login choice"; return 0 ;; esac
    label="org.macossetup.$id" agent="$HOME/Library/LaunchAgents/org.macossetup.$id.plist"
    # Reuse the installed legacy agent, never add a second login job for it.
    if test -f "$HOME/Library/LaunchAgents/local.bruce.$name.plist"; then
        label="local.bruce.$name" agent="$HOME/Library/LaunchAgents/local.bruce.$name.plist"
    fi
    content=$(/usr/bin/osascript -l JavaScript "$SETUP_ROOT/behaviors/metadata.js" agent "$label" "$path" "$login") || return 1
    add_file "$id" "$agent" "$content" plist
}
helpers_stage() {
    local i id source destination name sources
    for ((i=0; i<${#HELPER_IDS[@]}; i++)); do
        id="${HELPER_IDS[$i]}" name="${HELPER_NAMES[$i]}" source=$(helper_source "$id") destination="$RUN/stage/$name.app"
        mkdir -p "$destination/Contents/MacOS" "$destination/Contents/Resources" || return 1
        /usr/bin/osascript -l JavaScript "$SETUP_ROOT/behaviors/metadata.js" info "$name" "local.bruce.$name" > "$destination/Contents/Info.plist" || return 1
        sources=("$SETUP_ROOT/behaviors/$source/"*.swift)
        case "$id" in gestures|closing) sources=("$SETUP_ROOT/behaviors/shared/InteractionSafety.swift" "${sources[@]}") ;; esac
        xcrun swiftc "${sources[@]}" -o "$destination/Contents/MacOS/$name" -framework Cocoa -framework ApplicationServices -framework IOKit || return 1
        "$destination/Contents/MacOS/$name" --self-test || return 1
        printf '%s\n' "${HELPER_HASHES[$i]}" > "$destination/Contents/Resources/source.sha256" || return 1
        /usr/bin/codesign --force --sign - "$destination" || return 1
        HELPER_STAGED[$i]="$destination"
        record_event helper-staged "$id" "$destination" || return 1
    done
}
helpers_apply() {
    local i path backup binary
    for ((i=0; i<${#HELPER_IDS[@]}; i++)); do
        path="${HELPER_PATHS[$i]}" binary="${HELPER_PATHS[$i]}/Contents/MacOS/${HELPER_NAMES[$i]}"
        inspect_target "$binary" || return 1
        test "$(helper_tree_hash "$path")" = "${HELPER_TREES[$i]}" || { printf 'Helper changed after review: %s\n' "$path" >&2; return 1; }
        ensure_directory "$HOME/Applications" || return 1
        if test -d "$path"; then
            backup="$RUN/backups/${HELPER_NAMES[$i]}.app"
            mv "$path" "$backup" || return 1
            record_event helper-backup "$path" "$backup" || return 1
        fi
        mv "${HELPER_STAGED[$i]}" "$path" || return 1
        record_event helper-installed "$path" "$(hash_file "$binary")" || return 1
        write_owner "$binary" "$(hash_file "$binary")" || return 1
        write_owner "$path/Contents/Info.plist" "$(hash_file "$path/Contents/Info.plist")" || return 1
        printf 'DONE [%s] helper installed. Open ~/Applications/%s.app; running state and Accessibility are not verified.\n' "${HELPER_IDS[$i]}" "${HELPER_NAMES[$i]}"
    done
}
