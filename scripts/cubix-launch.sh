#!/bin/sh
# Starts the local Cubix server (if it is not already running) and opens it in Brave.
# Used by the desktop entry (~/.local/share/applications/cubix.desktop).
set -u

PORT="${CUBIX_PORT:-47129}"
URL="http://127.0.0.1:$PORT"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/cubix"
BUN="${BUN_BIN:-$HOME/.bun/bin/bun}"
[ -x "$BUN" ] || BUN="$(command -v bun)"

mkdir -p "$LOG_DIR"

healthy() { curl -sf -m 1 "$URL/api/health" >/dev/null 2>&1; }

if ! healthy; then
  # detached from the launcher: survives after this script exits
  (cd "$DIR" && setsid nohup "$BUN" run scripts/serve.ts --port "$PORT" >>"$LOG_DIR/server.log" 2>&1 &)
  i=0
  while [ $i -lt 100 ] && ! healthy; do
    sleep 0.1
    i=$((i + 1))
  done
fi

if healthy; then
  exec brave "$URL"
else
  notify-send "Cubix" "The local server did not start. See $LOG_DIR/server.log" 2>/dev/null
  exit 1
fi
