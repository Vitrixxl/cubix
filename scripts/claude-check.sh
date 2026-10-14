#!/usr/bin/env bash
# Stop hook de Claude Code : `bun run check` à la fin d'un tour qui a touché au code ; un échec renvoie l'agent corriger.
input=$(cat)
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/..}" || exit 0
[ -n "$(git status --porcelain)" ] || exit 0
out=$(bun run check 2>&1) && exit 0
tail=$(printf '%s\n' "$out" | tail -n 40)
# Déjà relancé une fois par ce hook : on laisse s'arrêter plutôt que boucler, en prévenant l'utilisateur.
if [ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" = "true" ]; then
  jq -n --arg m "bun run check échoue encore :
$tail" '{systemMessage: $m}'
  exit 0
fi
jq -n --arg r "bun run check échoue (typecheck ou knip). Corrige avant de terminer :
$tail" '{decision: "block", reason: $r}'
