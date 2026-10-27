component_inspect() {
    local name content source destination
    for name in 'Mac Tweak Dark' 'Mac Tweak Light'; do
        source="$SETUP_ROOT/terminal/profiles/$name.terminal"
        observe "$source"
        content=$(read_text "$source"; printf '\001'); content=${content%$'\001'}
        destination="$name"
        if test "${STORAGE_ID:-mac-tweak}" = macos-setup; then destination="${name/Mac Tweak/Mac Setup}"; content="${content//Mac Tweak/Mac Setup}"; fi
        add_file terminalprofile "$HOME/.config/${STORAGE_ID:-mac-tweak}/profiles/$destination.terminal" "$content" plist
    done
    printf 'REFRESH [terminalprofile] Open the selected installed profile through Utilities; choose Default in Terminal Settings to use it for future windows. Shell exit closes its window.\n'
}
