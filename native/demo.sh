#!/bin/sh
# Films the app full screen on the desktop, driven from the keyboard: ./demo.sh out.mp4
out=$(realpath -m "$1")
dir=$(cd "$(dirname "$0")" && pwd)
pkill -x qbix 2>/dev/null; sleep 0.3
hyprctl -q eval 'hl.window_rule({ name = "qbix-full", match = { class = "^(qbix)$" }, fullscreen = true })'
"$dir/target/release/qbix" >/tmp/qbix-demo.log 2>&1 &
sleep 2.2
wf-recorder -o eDP-1 -r 60 -c libx264 -p crf=20 -p preset=veryfast -x yuv420p -f "$out.raw.mp4" >/dev/null 2>&1 &
rec=$!
sleep 1.2
k() { wtype -k "$1"; }
hold() { wtype -P space; sleep "$1"; wtype -p space; }
hold 0.15; sleep 0.8          # a short hold: back to rest
hold 0.7; sleep 2.4           # held long enough: ready, release, the solve runs
k space; sleep 1.6            # stop: the scramble changes
k s; sleep 1.8                # the session drawer opens
k e; sleep 1.6                # the puzzle menu
k Escape; sleep 1.0
k s; sleep 1.4                # the drawer closes
k n; sleep 1.4                # a new scramble
kill -INT $rec; wait $rec 2>/dev/null
pkill -x qbix
ffmpeg -loglevel error -y -i "$out.raw.mp4" -vf "scale=1280:-2:flags=lanczos" -c:v libx264 -crf 22 -preset slow -pix_fmt yuv420p -movflags +faststart -an "$out" && rm "$out.raw.mp4"
