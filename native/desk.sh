#!/bin/sh
# Runs the app full screen on the desktop (Hyprland) and captures it: ./desk.sh out.png [args…]
out=$(realpath -m "$1"); shift
dir=$(cd "$(dirname "$0")" && pwd)
pkill -x qbix 2>/dev/null; sleep 0.3
hyprctl -q eval 'hl.window_rule({ name = "qbix-full", match = { class = "^(qbix)$" }, fullscreen = true })'
"$dir/target/${QBIX_PROFILE:-release}/qbix" "$@" >/tmp/qbix-desk.log 2>&1 &
sleep "${QBIX_WAIT:-2.5}"
grim -o eDP-1 "$out"
