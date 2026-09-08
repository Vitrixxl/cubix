#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ "${1:-}" = serve ]; then
  shift
  exec ./rust-api/target/release/cubix-api "$@"
fi
if command -v cargo >/dev/null 2>&1; then
  cubix_cargo=cargo
else
  cubix_cargo="${CARGO_HOME:-$HOME/.cargo}/bin/cargo"
fi
command="${1:-build}"
if [ "$#" -gt 0 ]; then shift; fi
exec "$cubix_cargo" "$command" --manifest-path rust-api/Cargo.toml "$@"
