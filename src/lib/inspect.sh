version_ge() {
    awk -v a="${1#v}" -v b="${2#v}" 'BEGIN {
        if (a !~ /^[0-9]+(\.[0-9]+)*$/ || b !~ /^[0-9]+(\.[0-9]+)*$/) exit 1
        split(a,x,"."); split(b,y,".")
        for(i=1;i<=4;i++) {if(x[i]+0>y[i]+0) exit 0; if(x[i]+0<y[i]+0) exit 1} exit 0
    }'
}
inspect_host() {
    test "$(uname -s)" = Darwin || { printf 'Only macOS hosts are supported.\n'; return 1; }
    HOST_OS=$(sw_vers -productVersion) || return 1
    HOST_ARCH=$(uname -m)
    if test "$(sysctl -n hw.optional.arm64 2>/dev/null || true)" = 1; then HOST_ARCH=arm64; fi
    case "$HOST_ARCH" in arm64) ;; x86_64) HOST_ARCH=x64 ;; *) printf 'Unsupported CPU: %s\n' "$HOST_ARCH"; return 1 ;; esac
    version_ge "$HOST_OS" 13.0 || { printf 'macOS 13 or later is required; host is %s.\n' "$HOST_OS"; return 1; }
}
safe_home() {
    case "${HOME:-}" in /*) ;; *) printf 'HOME must be an absolute path.\n'; return 1 ;; esac
    case "$HOME" in /|*/../*|*/..|*/./*|*/.|*$'\n'*|*$'\r'*|*$'\t'*|*'|'*) printf 'Unsupported HOME path.\n'; return 1 ;; esac
    test -d "$HOME" && test ! -L "$HOME" || { printf 'HOME must be an existing regular directory.\n'; return 1; }
}
inspect_target() {
    local target="$1" cursor="$1"
    case "$target" in "$HOME"/*) ;; *) printf 'Target outside HOME: %s\n' "$target"; return 1 ;; esac
    while test "$cursor" != "$HOME"; do
        test ! -L "$cursor" || { printf 'Symlink conflict: %s; resolve it before retrying.\n' "$cursor"; return 1; }
        if test -e "$cursor"; then
            if test "$cursor" = "$target"; then
                test -f "$cursor" || { printf 'Expected a regular file: %s\n' "$cursor"; return 1; }
                test -w "$cursor" || { printf 'Not writable: %s\n' "$cursor"; return 1; }
            else
                test -d "$cursor" && test -w "$cursor" || { printf 'Parent is not a writable directory: %s\n' "$cursor"; return 1; }
            fi
        fi
        cursor=${cursor%/*}
    done
    test -w "$HOME" || { printf 'HOME is not writable.\n'; return 1; }
}
command_version() {
    local executable="$1" output regex='[0-9]+\.[0-9]+(\.[0-9]+)?'
    output=$(env NPM_CONFIG_LOGS_MAX=0 NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_USERCONFIG=/dev/null \
        NPM_CONFIG_GLOBALCONFIG="$SETUP_ROOT/catalog/empty.npmrc" NPM_CONFIG_CACHE=/dev/null UV_NO_CACHE=1 GH_NO_UPDATE_NOTIFIER=1 "$executable" --version 2>/dev/null) || return 1
    [[ "$output" =~ $regex ]] || return 1
    printf '%s\n' "${BASH_REMATCH[0]}"
}
inspect_tig_prerequisites() {
    local developer sdk
    developer=$(xcode-select -p 2>/dev/null) && test -d "$developer" || {
        printf 'tig needs Apple Command Line Tools; run xcode-select --install yourself, finish installation, then retry.\n'; return 1;
    }
    command -v git >/dev/null && command -v make >/dev/null || { printf 'tig needs Git and make.\n'; return 1; }
    xcrun --find clang >/dev/null 2>&1 || { printf 'tig needs a working Command Line Tools compiler.\n'; return 1; }
    sdk=$(xcrun --show-sdk-path 2>/dev/null) || return 1
    test -f "$sdk/usr/include/curses.h" || { printf 'tig needs the SDK ncurses headers; repair Command Line Tools.\n'; return 1; }
    test -e "$sdk/usr/lib/libncurses.tbd" && test -e "$sdk/usr/lib/libiconv.tbd" || { printf 'tig needs the SDK ncurses and iconv libraries.\n'; return 1; }
    git --version >/dev/null && make --version >/dev/null && "$(xcrun --find clang)" --version >/dev/null || { printf 'tig needs working Git, make, and clang commands.\n'; return 1; }
}
