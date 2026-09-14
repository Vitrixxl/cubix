#!/bin/sh
# Install a prebuilt desktop release. No compiler or AUR account is required.
set -eu

case "${1:-}" in
  '') download_only=false ;;
  --download-only) download_only=true ;;
  -h|--help) printf '%s\n' 'Usage: ./update.sh [--download-only]' 'Download and verify the latest Linux x86_64 release, then install it.'; exit 0 ;;
  *) printf 'Unknown option: %s\n' "$1" >&2; exit 2 ;;
esac
[ "$#" -le 1 ] || { printf '%s\n' 'Too many arguments.' >&2; exit 2; }
[ "$(uname -s)-$(uname -m)" = Linux-x86_64 ] || {
  printf '%s\n' 'The prebuilt package currently supports Linux x86_64 only.' >&2
  exit 1
}
for tool in curl sha256sum pacman; do
  command -v "$tool" >/dev/null 2>&1 || { printf 'Missing command: %s\n' "$tool" >&2; exit 1; }
done
repo=https://github.com/Vitrixxl/cubix
asset=cubix-linux-x86_64.pkg.tar.zst
# Resolve once so the archive and checksum always come from the same release.
release=$(curl --fail --silent --show-error --location --retry 3 --connect-timeout 15 --max-time 60 \
  --output /dev/null --write-out '%{url_effective}' "$repo/releases/latest") || {
  printf '%s\n' 'No binary release could be retrieved. Try again after the GitHub build finishes.' >&2
  exit 1
}
case "$release" in
  "$repo/releases/tag/"*) tag=${release#"$repo/releases/tag/"} ;;
  *) printf '%s\n' 'Unexpected GitHub release URL.' >&2; exit 1 ;;
esac
case "$tag" in ''|*[!a-zA-Z0-9._-]*) printf '%s\n' 'Invalid release tag.' >&2; exit 1 ;; esac
cache="${XDG_CACHE_HOME:-$HOME/.cache}/cubix/releases/$tag"
mkdir -p "$cache"
staging=$(mktemp -d "$cache/download.XXXXXX")
trap 'rm -rf -- "$staging"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
base="$repo/releases/download/$tag"
printf 'Downloading Cubix %s…\n' "$tag"
for name in "$asset" "$asset.sha256"; do
  curl --fail --show-error --location --retry 3 --connect-timeout 15 --max-time 600 \
    --output "$staging/$name" "$base/$name"
done
expected=$(awk -v file="$asset" 'NF == 2 && $2 == file && length($1) == 64 && $1 !~ /[^0-9a-f]/ {print $1}' "$staging/$asset.sha256")
actual=$(sha256sum "$staging/$asset")
actual=${actual%% *}
[ "$expected" = "$actual" ] || { printf '%s\n' 'Checksum mismatch; installation cancelled.' >&2; exit 1; }
metadata=$(pacman -Qp "$staging/$asset")
case "$metadata" in 'cubix-bin '*) ;; *) printf '%s\n' 'Unexpected package; installation cancelled.' >&2; exit 1 ;; esac
mv -- "$staging/$asset" "$cache/$asset"
printf 'Verified: %s\n' "$cache/$asset"
if "$download_only"; then exit 0; fi
if [ "$(id -u)" -eq 0 ]; then
  pacman -U "$cache/$asset"
elif command -v yay >/dev/null 2>&1; then
  yay -U "$cache/$asset"
else
  sudo pacman -U "$cache/$asset"
fi
printf '%s\n' 'Update installed. Close and reopen Cubix.'
