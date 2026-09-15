#!/bin/sh
# Publish cubix-bin to the AUR: publish-bin.sh [<directory with PKGBUILD and .SRCINFO>]
# Without argument, the files of the latest GitHub desktop release are used.
# Requires an AUR account whose SSH key is available to this shell.
set -eu
repo=https://github.com/Vitrixxl/cubix
aur=${AUR_REMOTE:-ssh://aur@aur.archlinux.org/cubix-bin.git}
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
if [ "$#" -ge 1 ]; then
  source=$1
else
  release=$(curl --fail --silent --show-error --location --retry 3 --output /dev/null --write-out '%{url_effective}' "$repo/releases/latest")
  case "$release" in
    "$repo/releases/tag/"*) tag=${release#"$repo/releases/tag/"} ;;
    *) printf '%s\n' 'Unexpected GitHub release URL.' >&2; exit 1 ;;
  esac
  case "$tag" in ''|*[!a-zA-Z0-9._-]*) printf '%s\n' 'Invalid release tag.' >&2; exit 1 ;; esac
  mkdir "$work/release"
  # The release stores .SRCINFO as SRCINFO because GitHub asset names cannot start with a dot.
  curl --fail --silent --show-error --location --retry 3 --output "$work/release/PKGBUILD" "$repo/releases/download/$tag/PKGBUILD"
  curl --fail --silent --show-error --location --retry 3 --output "$work/release/.SRCINFO" "$repo/releases/download/$tag/SRCINFO"
  source=$work/release
fi
grep -q '^pkgname=cubix-bin$' "$source/PKGBUILD" || { printf '%s\n' 'Not a cubix-bin PKGBUILD.' >&2; exit 1; }
grep -q '^pkgbase = cubix-bin$' "$source/.SRCINFO" || { printf '%s\n' 'Not a cubix-bin .SRCINFO.' >&2; exit 1; }
version=$(sed -n 's/^\tpkgver = //p' "$source/.SRCINFO")
git clone --quiet "$aur" "$work/aur"
cp "$source/PKGBUILD" "$source/.SRCINFO" "$work/aur/"
cd "$work/aur"
git add PKGBUILD .SRCINFO
if git diff --cached --quiet; then printf 'AUR already at %s.\n' "$version"; exit 0; fi
git -c user.name="${GIT_AUTHOR_NAME:-Cubix release}" -c user.email="${GIT_AUTHOR_EMAIL:-cubix@vitrixxl.fr}" commit --quiet -m "Update to $version"
git push --quiet origin HEAD:master
printf 'Published cubix-bin %s to the AUR.\n' "$version"
