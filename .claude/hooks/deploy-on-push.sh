#!/usr/bin/env bash
# PostToolUse hook (Bash): after a `git push` of main from this repo, put it in prod.
# `bun run deploy` pushes on its own, so a deploy never re-triggers itself.
set -u
repo=/home/vitrix/dev/cubix
input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // ""')
cwd=$(printf '%s' "$input" | jq -r '.cwd // ""')

case "$cmd" in *"git push"*) ;; *) exit 0 ;; esac
case "$cmd" in *"bun run deploy"*|*"deploy.ts"*) exit 0 ;; esac

top=$(git -C "${cwd:-$repo}" rev-parse --show-toplevel 2>/dev/null) || exit 0
[ "$top" = "$repo" ] || exit 0

# Which branch was pushed: an explicit refspec wins, else the checked-out branch.
args=$(printf '%s' "$cmd" | sed -n 's/.*git push\([^&|;]*\).*/\1/p')
branch=""
for a in $args; do
  case "$a" in -*|origin|*'>'*|*'<'*) ;; *) branch=$a ;; esac
done
[ -n "$branch" ] || branch=$(git -C "$repo" rev-parse --abbrev-ref HEAD)
case "$branch" in main|HEAD|main:main|refs/heads/main) ;; *) exit 0 ;; esac

if [ "${DEPLOY_HOOK_DRY_RUN:-}" = 1 ]; then echo "would deploy ($branch)"; exit 0; fi
echo "Push on main detected: deploying cubix"
cd "$repo" && bun run deploy 2>&1
