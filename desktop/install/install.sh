#!/bin/sh
# Installs Qbix, the desktop app of https://cubix.vitrixxl.fr, for the current user, without sudo:
# the app in ~/.local/share/cubix-electron, an entry in the applications menu and the `cubix` command.
# Run it again to update. With --tauri, the Tauri app instead, in ~/.local/share/cubix-tauri: lighter, it draws
# with the system's WebKitGTK 4.1 rather than its own Chromium. Each replaces the other.
#
#   curl -fsSL https://cubix.vitrixxl.fr/install.sh | sh
#   curl -fsSL https://cubix.vitrixxl.fr/install.sh | sh -s -- --tauri
#   curl -fsSL https://cubix.vitrixxl.fr/install.sh | sh -s -- --uninstall
set -eu

origin="${CUBIX_ORIGIN:-https://cubix.vitrixxl.fr}"
data="${XDG_DATA_HOME:-$HOME/.local/share}"
shell=electron package=cubix-linux-x64
if [ "${1:-}" = "--tauri" ]; then shell=tauri package=cubix-tauri-linux-x64; fi
base="$data/cubix-$shell"
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

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM
echo "Downloading Qbix…"
if command -v curl >/dev/null 2>&1; then
  curl -fL --progress-bar "$origin/api/desktop/$package.tar.gz" -o "$tmp/qbix.tar.gz"
elif command -v wget >/dev/null 2>&1; then
  wget -q --show-progress -O "$tmp/qbix.tar.gz" "$origin/api/desktop/$package.tar.gz"
else
  echo "Qbix needs curl or wget to download." >&2
  exit 1
fi
tar -xzf "$tmp/qbix.tar.gz" -C "$tmp"
if [ "$shell" = tauri ] && ldd "$tmp/$package/cubix" 2>/dev/null | grep -q "not found"; then
  echo "Qbix's Tauri app needs WebKitGTK 4.1: install libwebkit2gtk-4.1-0 (Debian, Ubuntu), webkit2gtk4.1 (Fedora)" >&2
  echo "or webkit2gtk-4.1 (Arch), then run this again. Or install the Electron app, which brings its own: drop --tauri." >&2
  exit 1
fi

# The whole folder is swapped at once: the app never runs half replaced. Private data lives elsewhere.
mkdir -p "$data" "$data/applications" "$(dirname "$icon")" "$(dirname "$command")"
rm -rf "$base.new" "$base.old"
mv "$tmp/$package" "$base.new"
if [ -e "$base" ]; then mv "$base" "$base.old"; fi
mv "$base.new" "$base"
rm -rf "$base.old" "$data/cubix-$([ "$shell" = tauri ] && echo electron || echo tauri)"

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
