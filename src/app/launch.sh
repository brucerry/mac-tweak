#!/bin/bash
# Keep terminal interrupts out of the JXA/AppKit runtime; request normal Quit.
set -eo pipefail
umask 077
launch_channel= launch_worker= launch_requests=0 launch_status=0
request_quit() {
    launch_requests=$((launch_requests + 1))
    launch_status="$1"
    if test -n "$launch_channel"; then
        if ! { printf '%s\n' "$launch_requests" > "$launch_channel/next-interrupt" && /bin/mv -f -- "$launch_channel/next-interrupt" "$launch_channel/interrupt"; }; then
            printf 'Could not send Quit to Mac Tweak. Close its window when ready.\n' >&2 || true
        elif test "$1" = 130; then
            printf '\nQuit requested; waiting for Mac Tweak to close.\n' >&2 || true
        fi
    fi
}
trap 'request_quit 130' INT
trap 'request_quit 143' TERM
trap 'request_quit 129' HUP
launch_channel=$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/mac-tweak-launch.XXXXXXXX")
launch_channel=$(cd -- "$launch_channel" && pwd -P)
trap 'test -z "$launch_channel" || /bin/rm -rf -- "$launch_channel"' EXIT
printf '%s\n' "$$" > "$launch_channel/launcher.pid"
if test "$launch_requests" -gt 0; then exit "$launch_status"; fi
# A separate background group prevents Ctrl+C from aborting a running JXA
# event handler or its open -W waiter before the native app handles Quit.
set -m
MAC_TWEAK_LAUNCH_CHANNEL="$launch_channel" /usr/bin/osascript -l JavaScript "$1/src/app/host.js" "$@" </dev/null &
launch_worker=$!
while :; do
    if wait "$launch_worker"; then launch_result=0; else launch_result=$?; fi
    # wait is interrupted by a trapped signal even though its child is alive.
    if ! kill -0 "$launch_worker" 2>/dev/null; then break; fi
done
if test "$launch_status" -ne 0; then exit "$launch_status"; fi
exit "$launch_result"
