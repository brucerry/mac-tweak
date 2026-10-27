CATALOG="$SETUP_ROOT/catalog/components.txt"
catalog_validate() {
    awk -F '|' '
        /^#/ || NF == 0 { next }
        NF != 7 { print "Invalid catalog field count on line " NR > "/dev/stderr"; bad=1; next }
        {
            if ($1 !~ /^[a-z][a-z0-9-]*$/ || seen[$1]++ || $2 !~ /^(tool|shell|preference|profile|guided)$/) bad=1
            for (i=1;i<=NF;i++) if ($i == "") bad=1
            if ($3 != "-") {
                n=split($3,deps,",")
                for(i=1;i<=n;i++) { if (deps[i] !~ /^[a-z][a-z0-9-]*$/) bad=1; needed[deps[i]]=1 }
            }
        }
        END { for (dep in needed) if (!seen[dep]) bad=1; if (bad) exit 1 }
    ' "$CATALOG" || die 'Invalid catalog metadata; inspect catalog/components.txt.'
    releases_validate
}
catalog_ids() { awk -F '|' '!/^#/ && NF {print $1}' "$CATALOG"; }
catalog_has() { awk -F '|' -v id="$1" '$1==id {found=1} END {exit !found}' "$CATALOG"; }
catalog_field() { awk -F '|' -v id="$1" -v col="$2" '$1==id {print $col}' "$CATALOG"; }
catalog_list() {
    local id
    printf 'Components (tools automatically include local-bin-path):\n'
    while IFS= read -r id; do printf '  %-16s %s\n' "$id" "$(catalog_field "$id" 4)"; done < <(catalog_ids)
    printf 'Presets: terminal, terminal-app, development, system, behaviors, display, full\n'
}
catalog_info() {
    catalog_has "$1" || die "Unknown component: $1"
    printf '%s: %s\n' "$1" "$(catalog_field "$1" 4)"
    printf 'Changes: %s\nDependencies: %s\nPrerequisites: %s\nRecovery: %s\n' \
        "$(catalog_field "$1" 5)" "$(catalog_field "$1" 3)" "$(catalog_field "$1" 6)" "$(catalog_field "$1" 7)"
    if test "$(catalog_field "$1" 2)" = preference; then preferences_bridge info "$1"; fi
    if test "$(catalog_field "$1" 2)" = tool; then
        awk -F '|' -v id="$1" '$1==id {
            printf "Release: %s on %s, macOS >=%s; existing >=%s, <%s; commands: %s\n", $2,$5,$6,$3,$4,$11
        }' "$SETUP_ROOT/catalog/releases.txt"
        case "$1" in
            gh) printf 'Manual steps: Use gh auth login separately if you need account access.\n' ;;
            tig) printf 'Manual steps: Install Apple Command Line Tools yourself if preflight requests them.\n' ;;
            *) printf 'Manual steps: Open a new terminal after path integration; configure projects separately.\n' ;;
        esac
    fi
}
module_load() {
    catalog_has "$1" || die "Unknown component: $1"
    local module
    module=$(module_path "$1")
    test -f "$module" || die "Missing module: $1"
    . "$module"
}
module_path() {
    local category=terminal
    case "$(catalog_field "$1" 2)" in tool) category=tools ;; preference) category=preferences ;; profile) category=profiles ;; guided) category=guided ;; esac
    printf '%s/components/%s/%s.sh\n' "$SETUP_ROOT" "$category" "$1"
}
