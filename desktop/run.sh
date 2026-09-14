#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
export CUBIX_API_ORIGIN="${CUBIX_API_ORIGIN:-https://cubix.vitrixxl.fr}"
bun desktop/scripts/export-assets.tsx
bun desktop/engine/build.ts
if command -v cargo >/dev/null 2>&1; then
  exec "${CARGO:-cargo}" run --manifest-path desktop/Cargo.toml --locked
fi
exec "${CARGO:-${CARGO_HOME:-$HOME/.cargo}/bin/cargo}" run --manifest-path desktop/Cargo.toml --locked
