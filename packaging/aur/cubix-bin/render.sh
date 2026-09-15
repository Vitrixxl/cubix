#!/bin/sh
# Render PKGBUILD for one GitHub desktop release: render.sh <tag> <pkgver> <sha256-of-tarball>
set -eu
[ "$#" -eq 3 ] || { printf '%s\n' 'Usage: render.sh <release-tag> <pkgver> <sha256>' >&2; exit 2; }
tag=$1 pkgver=$2 sum=$3
case "$tag" in ''|*[!a-zA-Z0-9._-]*) printf 'Invalid tag: %s\n' "$tag" >&2; exit 1 ;; esac
case "$pkgver" in ''|*[!a-zA-Z0-9._]*|*-*) printf 'Invalid pkgver: %s\n' "$pkgver" >&2; exit 1 ;; esac
case "$sum" in *[!0-9a-f]*) printf 'Invalid sha256: %s\n' "$sum" >&2; exit 1 ;; esac
[ "${#sum}" -eq 64 ] || { printf 'Invalid sha256: %s\n' "$sum" >&2; exit 1; }
dir=$(dirname "$0")
sed -e "s|@TAG@|$tag|" -e "s|@PKGVER@|$pkgver|" -e "s|@SHA256@|$sum|" "$dir/PKGBUILD.in" > "$dir/PKGBUILD"
printf 'Rendered %s/PKGBUILD for %s (%s)\n' "$dir" "$tag" "$pkgver"
