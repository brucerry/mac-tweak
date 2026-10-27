contains_id() { case " $1 " in *" $2 "*) return 0 ;; *) return 1 ;; esac; }
add_csv() {
    local raw="$1" item
    test -n "$raw" || die 'Component list must not be empty.'
    case "$raw" in *[!a-z0-9,-]*) die "Invalid component list: $raw" ;; esac
    case "$raw" in ,*|*,|*,,*) die "Invalid component list: $raw" ;; esac
    for item in ${raw//,/ }; do
        catalog_has "$item" || die "Unknown component: $item"
        if test "$2" = include; then REQUESTED="$REQUESTED $item"; else EXCLUDED="$EXCLUDED $item"; fi
    done
}
selection_parse() {
    REQUESTED= EXCLUDED= RESOLVED= YES=0 REPAIR_MODE=0 PREFERENCES_FILE=
    local preset item
    while test "$#" -gt 0; do
        case "$1" in
            --preferences-file)
                test "$#" -ge 2 && test -n "$2" || die '--preferences-file requires a path'
                test -z "$PREFERENCES_FILE" || die '--preferences-file can only be provided once'
                case "$2" in *$'\n'*|*$'\r'*|*$'|'*) die 'Unsupported preference input path' ;; esac
                case "$2" in /*) PREFERENCES_FILE="$2" ;; *) PREFERENCES_FILE="$(pwd -P)/$2" ;; esac
                shift 2 ;;
            --with|--without)
                test "$#" -ge 2 || die "$1 requires a component list"
                if test "$1" = --with; then add_csv "$2" include; else add_csv "$2" exclude; fi
                shift 2 ;;
            --preset)
                test "$#" -ge 2 || die '--preset requires a name'
                case "$2" in terminal|terminal-app|development|system|behaviors|display|full) preset="$2" ;; *) die "Unknown preset: $2" ;; esac
                while IFS= read -r item; do add_csv "$item" include; done < "$SETUP_ROOT/presets/$preset.txt"
                shift 2 ;;
            --yes) YES=1; shift ;;
            *) die "Unknown option: $1" ;;
        esac
    done
    local id
    for id in $REQUESTED; do
        if ! contains_id "$EXCLUDED" "$id"; then resolve_one "$id" ''; fi
    done
    test -n "$RESOLVED" || die 'Choose a nonempty component selection with --with or --preset.'
}
resolve_one() {
    local id="$1" trail="$2" dependencies dep
    contains_id "$EXCLUDED" "$id" && die "Required dependency excluded: $id (needed by $trail)"
    contains_id "$trail" "$id" && die "Dependency cycle: $trail $id"
    contains_id "$RESOLVED" "$id" && return 0
    dependencies=$(catalog_field "$id" 3)
    if test "$dependencies" != -; then
        for dep in ${dependencies//,/ }; do resolve_one "$dep" "$trail $id"; done
    fi
    RESOLVED="$RESOLVED $id"
    return 0
}
selection_show() {
    local id parent dependencies reasons
    printf 'Selection:'
    for id in $RESOLVED; do printf ' %s' "$id"; done
    printf '\n'
    for id in $RESOLVED; do
        if ! contains_id "$REQUESTED" "$id"; then
            reasons=''
            for parent in $RESOLVED; do
                dependencies=$(catalog_field "$parent" 3)
                if contains_id "${dependencies//,/ }" "$id"; then reasons="${reasons:+$reasons, }$parent"; fi
            done
            printf 'Dependency: %s (required by %s)\n' "$id" "$reasons"
        fi
    done
}
interactive_select() {
    test -t 0 || die 'Noninteractive input requires a command and explicit selection.'
    local ids=() id count=0 answer token chosen='' valid_answer='^[a-z0-9, -]+$'
    printf 'Choose parts of this Mac setup:\n'
    while IFS= read -r id; do
        ids[$count]="$id"
        count=$((count + 1))
        printf '  %d) %-16s %s\n' "$count" "$id" "$(catalog_field "$id" 4)"
    done < <(catalog_ids)
    printf 'Presets: terminal, development, system, full. q cancels.\n'
    printf 'Choose numbers or component IDs separated by commas: '
    IFS= read -r answer || return 1
    case "$answer" in
        q|quit|'') return 1 ;;
        terminal|terminal-app|development|system|behaviors|display|full) selection_parse --preset "$answer"; return 0 ;;
    esac
    [[ "$answer" =~ $valid_answer ]] || die 'Use component IDs or numbers separated by commas.'
    for token in ${answer//,/ }; do
        case "$token" in
            *[!0-9]*) id="$token" ;;
            *)
                test "${#token}" -le 2 || die 'Selection number out of range'
                token=$((10#$token))
                test "$token" -ge 1 && test "$token" -le "$count" || die 'Selection number out of range'
                id=${ids[$((token - 1))]} ;;
        esac
        chosen="${chosen:+$chosen,}$id"
    done
    selection_parse --with "$chosen"
}
