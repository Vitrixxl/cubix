#!/bin/sh
# Builds the apps people download from the landing page into a directory: ./package.sh <dir>
#   <dir>/qbix.apk                    Android (arm64 and x86_64)
#   <dir>/qbix-linux-x86_64.tar.gz    Linux: the app, its icon and its launcher, with install.sh
# CARGO_TARGET_DIR is honoured, so a deployment's checkout can reuse this one's build.
set -e
dest=$(realpath -m "$1")
cd "$(dirname "$0")"
tgt=${CARGO_TARGET_DIR:-target}
mkdir -p "$dest"
cargo build --release -p qbix
./android/build.sh all
cp "$tgt/qbix.apk" "$dest/qbix.apk"
pack=$tgt/linux/qbix && rm -rf "$tgt/linux" && mkdir -p "$pack"
cp "$tgt/release/qbix" "$pack/qbix" && strip "$pack/qbix"
cp ../desktop/renderer/pwa/icon-512.png "$pack/qbix.png"
cat > "$pack/install.sh" <<'SH'
#!/bin/sh
# Installs Qbix for this user: the app in ~/.local/bin, its launcher and icon where the desktop finds them.
set -e
cd "$(dirname "$0")"
mkdir -p ~/.local/bin ~/.local/share/applications ~/.local/share/icons/hicolor/512x512/apps
cp qbix ~/.local/bin/qbix
cp qbix.png ~/.local/share/icons/hicolor/512x512/apps/qbix.png
printf '[Desktop Entry]\nType=Application\nName=Qbix\nComment=Speedcubing timer and algorithm trainer\nExec=%s/.local/bin/qbix\nIcon=qbix\nCategories=Game;Utility;\nTerminal=false\n' "$HOME" > ~/.local/share/applications/qbix.desktop
echo "Qbix is installed: open it from your applications, or run ~/.local/bin/qbix"
SH
chmod +x "$pack/install.sh"
# Fixed dates and owner: the same build gives the same archive, which a deployment then need not send again.
tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner -C "$tgt/linux" -cf - qbix | gzip -n -9 > "$dest/qbix-linux-x86_64.tar.gz"
ls -la "$dest"
