source "$HOME/.config/mac-tweak/env.zsh"
if [[ -o interactive ]]; then
    for _mac_tweak_part in prompt aliases colors; do
        if [[ -f "$HOME/.config/mac-tweak/$_mac_tweak_part.zsh" ]]; then
            source "$HOME/.config/mac-tweak/$_mac_tweak_part.zsh"
        fi
    done
    unset _mac_tweak_part
fi
