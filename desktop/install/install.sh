#!/bin/sh
# Installs Qbix, the desktop app of https://cubix.vitrixxl.fr, for the current user, without sudo:
# the app in ~/.local/share/cubix-electron, an entry in the applications menu and the `cubix` command.
# Run it again to update.
#
#   curl -fsSL https://cubix.vitrixxl.fr/install.sh | sh
#   curl -fsSL https://cubix.vitrixxl.fr/install.sh | sh -s -- --uninstall
set -eu

origin="${CUBIX_ORIGIN:-https://cubix.vitrixxl.fr}"
data="${XDG_DATA_HOME:-$HOME/.local/share}"
package=cubix-linux-x64
base="$data/cubix-electron"
entry="$data/applications/fr.vitrixxl.cubix.desktop"
icon="$data/icons/hicolor/512x512/apps/fr.vitrixxl.cubix.png"
command="$HOME/.local/bin/cubix"

refresh_menus() {
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$data/applications" >/dev/null 2>&1 || true
  command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -f -t "$data/icons/hicolor" >/dev/null 2>&1 || true
}

if [ "${1:-}" = "--uninstall" ]; then
  rm -rf "$data/cubix-electron" "$data/cubix-tauri" "$entry" "$icon" "$command"
  refresh_menus
  echo "Qbix is uninstalled. Your times stay in your account; local data is kept in $data/cubix-desktop."
  exit 0
fi

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64 | Linux-amd64) ;;
  *)
    echo "Qbix's desktop app is built for Linux x64. Use it in your browser instead: $origin/timer" >&2
    exit 1
    ;;
esac
command -v tar >/dev/null 2>&1 || { echo "Qbix needs tar to install." >&2; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo "Qbix needs openssl to check the download: install your distribution's openssl package." >&2; exit 1; }

# Packages are signed with a key kept off the server (scripts/deploy.ts): one that does not match this key is not
# Qbix's, whoever serves it.
public_key='-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEA596v2w8FYeJqX3xF/fac
CaAzmkuN897RX9uC5xi2Oo6yS8mQ0P3ENu5cRv8JMDu89pBSzt5uXHceuv1FCULB
j6jLhLu4hcx2ko2t8mKYZTZK7RIRbXnoVVDQVV6rt6wex/6q/iRyuFiPBvX152T0
DdcogAV3yGr9WeZvjKq1bhmA8Df67BooI01Ip2tOt/Ea4WSqLa8iUS45V6qPPYoa
P3IxqWjFpc7zvZYiPYSGKWY8JsQSRqFveDz/+HfTtk3geYZF60iTDMtaLe5TdGXE
03NesIopdqB3zsIf3X4FnkkTlh5b7aKB7LusdfSGcfmSsglDYF2sopOnv27Ia/Lm
+42EdIIXuwACw3uLyMri4ypEI6bIJEvmQvmZsXvnD699NlKUG34H1soQ7uR7yGhC
sZHVcv5B5pQGXlnjmduYWRdkK9bjYCiawbkgSW4UjlntQo6ez+sK7ZtP+/n/MAjv
ckBZF3bP3+NA1Ewi3hLvfgNNJBrk/fgWjY5FybYZjoZ7AgMBAAE=
-----END PUBLIC KEY-----'

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM
download() {
  if command -v curl >/dev/null 2>&1; then
    curl -fL --progress-bar "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then
    wget -q --show-progress -O "$2" "$1"
  else
    echo "Qbix needs curl or wget to download." >&2
    exit 1
  fi
}
echo "Downloading Qbix…"
download "$origin/api/desktop/$package.tar.gz" "$tmp/qbix.tar.gz"
download "$origin/api/desktop/$package.tar.gz.sig" "$tmp/qbix.tar.gz.sig"
printf '%s\n' "$public_key" >"$tmp/key.pem"
if ! openssl dgst -sha256 -verify "$tmp/key.pem" -signature "$tmp/qbix.tar.gz.sig" "$tmp/qbix.tar.gz" >/dev/null 2>&1; then
  echo "The download's signature does not match: Qbix was not installed." >&2
  exit 1
fi
tar -xzf "$tmp/qbix.tar.gz" -C "$tmp"

# The whole folder is swapped at once: the app never runs half replaced. Private data lives elsewhere.
mkdir -p "$data" "$data/applications" "$(dirname "$icon")" "$(dirname "$command")"
rm -rf "$base.new" "$base.old"
mv "$tmp/$package" "$base.new"
if [ -e "$base" ]; then mv "$base" "$base.old"; fi
mv "$base.new" "$base"
# The former Tauri app, replaced by this one.
rm -rf "$base.old" "$data/cubix-tauri"

cp "$base/fr.vitrixxl.cubix.png" "$icon"
cat >"$entry" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Qbix
Comment=Speedcubing timer and algorithm trainer
Exec="$base/cubix"
Icon=fr.vitrixxl.cubix
Terminal=false
Categories=Game;Education;
Keywords=cube;rubik;speedcubing;timer;algorithms;
StartupWMClass=Cubix
DESKTOP
ln -sf "$base/cubix" "$command"
refresh_menus

echo "Qbix is installed. Open it from your applications menu, or run: cubix"
case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) echo "(~/.local/bin is not in your PATH: add it to run \`cubix\` from a terminal.)" ;;
esac
