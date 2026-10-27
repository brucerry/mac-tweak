# Keep existing installations in their original roots. No implicit data migration.
STORAGE_ID=mac-tweak
for legacy_root in "$HOME/.config/macos-setup" "$HOME/.local/state/macos-setup" "$HOME/.local/opt/macos-setup"; do
    if test -e "$legacy_root" || test -L "$legacy_root"; then STORAGE_ID=macos-setup; break; fi
done
export STORAGE_ID
