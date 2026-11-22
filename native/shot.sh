#!/bin/sh
# Captures the app headless, off the user's desktop: a hidden Wayland compositor (cage), the app in it, grim.
#   ./shot.sh out.png [qbix args…]   (QBIX_SIZE=1440x900 by default; QBIX_WAIT seconds before the capture)
set -e
out=$(realpath -m "$1"); shift
dir=$(cd "$(dirname "$0")" && pwd)
runtime=$(mktemp -d)
export XDG_RUNTIME_DIR=$runtime WLR_BACKENDS=headless WLR_LIBINPUT_NO_DEVICES=1 WLR_HEADLESS_OUTPUTS=1
unset DISPLAY WAYLAND_DISPLAY
cage -s -- "$dir/target/${QBIX_PROFILE:-debug}/qbix" "$@" >"$runtime/log" 2>&1 &
pid=$!
sleep 1
WAYLAND_DISPLAY=wayland-0 wlr-randr --output HEADLESS-1 --custom-mode "${QBIX_SIZE:-1440x900}" 2>/dev/null || true
sleep "${QBIX_WAIT:-3}"
WAYLAND_DISPLAY=wayland-0 grim "$out"
kill $pid 2>/dev/null || true
wait $pid 2>/dev/null || true
grep -iE "error|panic|warn" "$runtime/log" | head -5 || true
rm -rf "$runtime"
