# All extraction happens in private staging, after the pinned digest matches.
extract_artifact() {
    local archive="$1" destination="$2" entries entry link resolved
    entries=$(tar -tf "$archive") || return 1
    while IFS= read -r entry; do
        case "$entry" in /*|..|../*|*/../*|*/..) printf 'Unsafe archive path: %s\n' "$entry" >&2; return 1 ;; esac
    done <<< "$entries"
    # Hardlinks are unnecessary for these distributions and complicate confinement.
    if tar -tvf "$archive" | grep '^h' > /dev/null; then printf 'Archive hardlinks are unsupported.\n' >&2; return 1; fi
    mkdir "$destination" || return 1
    destination=$(cd "$destination" && pwd -P) || return 1
    # macOS libarchive refuses traversal through archive-created symlinks.
    tar -xf "$archive" -C "$destination" || return 1
    while IFS= read -r link; do
        resolved=$(/bin/zsh -f -c 'print -r -- ${1:A}' -- "$link") || return 1
        case "$resolved" in "$destination"/*) ;; *) printf 'Escaping archive symlink: %s\n' "$link" >&2; return 1 ;; esac
        test -e "$link" || { printf 'Broken archive symlink: %s\n' "$link" >&2; return 1; }
    done < <(find "$destination" -type l -print)
}
prepare_tool() {
    local id="$1" stage="$RUN/stage/$1" url digest actual root format bindir command
    url=$(release_field "$id" 8); digest=$(release_field "$id" 9)
    test "${#digest}" = 64 || { printf 'Missing checksum for %s\n' "$id" >&2; return 1; }
    mkdir "$stage" || return 1
    printf 'Downloading %s %s\n' "$id" "$(release_field "$id" 2)"
    curl --fail --location --silent --show-error --proto '=https' --proto-redir '=https' \
        --connect-timeout 15 --max-time 300 --retry 2 --output "$stage/archive" "$url" || return 1
    actual=$(hash_file "$stage/archive") || return 1
    test "$actual" = "$digest" || { printf 'Checksum mismatch for %s; downloaded contents will not be used.\n' "$id" >&2; return 1; }
    extract_artifact "$stage/archive" "$stage/extracted" || return 1
    root="$stage/extracted/$(release_field "$id" 10)"
    test -d "$root" && test ! -L "$root" || { printf 'Unexpected archive root for %s\n' "$id" >&2; return 1; }
    format=$(release_field "$id" 7)
    if test "$format" = source; then
        build_tig "$root" "$stage/payload" || return 1
    else
        mkdir "$stage/payload" || return 1
        cp -R "$root/." "$stage/payload" || return 1
        bindir=$(release_field "$id" 12)
        if test "$bindir" = .; then
            mkdir "$stage/payload/bin" || return 1
            for command in $(release_field "$id" 11 | tr ',' ' '); do
                mv "$stage/payload/$command" "$stage/payload/bin/$command" || return 1
            done
        fi
    fi
    commands_work "$id" "$stage/payload" "$(release_field "$id" 2)"
}
apply_tool() {
    prepare_tool "$1" || return 1
    repair_backup_tool_links "$1" || return 1
    activate_tool "$1" "$RUN/stage/$1/payload" "$(release_field "$1" 2)"
}
build_tig() {
    local root="$1" payload="$2" compiler install_root final_prefix sdk native_arch build_options=()
    # Apple's driver shim supplies the SDK context absent from the raw compiler.
    xcrun --find clang >/dev/null || return 1
    compiler=/usr/bin/clang
    final_prefix="$HOME/.local/opt/${STORAGE_ID:-mac-tweak}/tig/$(release_field tig 2)"
    install_root="$(dirname "$payload")/install-root"
    mkdir "$install_root" || return 1
    sdk=$(xcrun --show-sdk-path) || return 1
    if test "$HOST_ARCH" = x64; then native_arch=x86_64; else native_arch=arm64; fi
    build_options=('HOMEBREW_PREFIX=' 'NCURSES_DIR=' 'READLINE_DIR=' 'PCRE2_DIR=' "CFLAGS=-Wall -O2 -DHAVE_EXECINFO_H -arch $native_arch")
    if ! env SDKROOT="$sdk" "$compiler" -arch "$native_arch" -E -x c -include wordexp.h /dev/null > /dev/null 2>&1; then
        build_options[${#build_options[@]}]='NO_WORDEXP=1'
    fi
    printf 'Building tig with the system compiler; log: %s/build.log\n' "$(dirname "$payload")"
    if ! env SDKROOT="$sdk" make -C "$root" -j2 "prefix=$final_prefix" "CC=$compiler" "${build_options[@]}" > "$(dirname "$payload")/build.log" 2>&1; then
        tail -40 "$(dirname "$payload")/build.log" >&2; return 1
    fi
    if ! env SDKROOT="$sdk" make -C "$root" install "prefix=$final_prefix" "CC=$compiler" "DESTDIR=$install_root" "${build_options[@]}" >> "$(dirname "$payload")/build.log" 2>&1; then
        tail -40 "$(dirname "$payload")/build.log" >&2; return 1
    fi
    mv "$install_root$final_prefix" "$payload"
}
