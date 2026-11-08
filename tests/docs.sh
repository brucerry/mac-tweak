#!/bin/bash
set -eo pipefail
for tool in node uv gh tig; do
    info=$(run_setup info "$tool")
    while IFS='|' read -r id version minimum maximum arch os_min format url checksum root commands bindir; do
        test "$id" = "$tool" || continue
        assert_contains "$info" "Release: $version on $arch, macOS >=$os_min; existing >=$minimum, <$maximum; commands: $commands"
        grep -Fq "| $tool | $version | >=$minimum, <$maximum | $os_min |" "$TEST_REPO/docs/tools.md"
    done < "$TEST_REPO/src/catalog/releases.txt"
    if test "$tool" = tig; then assert_contains "$info" 'offers to install missing Apple Command Line Tools after approval';
    else assert_contains "$info" 'Manual steps:'; fi
done
assert_contains "$(run_setup info gh)" 'Use gh auth login separately'
assert_contains "$(run_setup info tig)" 'offers to install missing Apple Command Line Tools after approval'
printf 'PASS: published tool documentation and CLI info match release contracts\n'
