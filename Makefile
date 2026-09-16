# Cubix desktop: `make` installs the build tools it needs, builds the native application
# and installs it for the current user. No AUR helper or prebuilt release is involved.
#
#   make            deps + build + install
#   make deps       system packages (pacman, no yay), Bun and Rust if they are missing
#   make build      standalone application in artifacts/gpui/cubix-linux-<arch>
#   make install    copy the build to ~/.local/share/cubix-gpui and register the menu entry
#   make run        build and launch the desktop from the repository
#   make uninstall  remove the installed copy and its menu entry
#   make deploy     push, update the server through pihost, build the ARM64 APK and upload it
#   make clean      remove build outputs

SHELL := /bin/sh
BUN ?= $(shell command -v bun 2>/dev/null || printf '%s' "$$HOME/.bun/bin/bun")
CARGO ?= $(shell command -v cargo 2>/dev/null || printf '%s' "$$HOME/.cargo/bin/cargo")
DATA ?= $(if $(XDG_DATA_HOME),$(XDG_DATA_HOME),$(HOME)/.local/share)
# Build inputs (GPUI on Linux): compilers, X11/Wayland, fonts, Vulkan, and the installer's desktop tools.
PACMAN_PACKAGES := base-devel clang cmake pkgconf git unzip libxcb libxkbcommon libxkbcommon-x11 wayland fontconfig freetype2 vulkan-icd-loader vulkan-headers desktop-file-utils gtk-update-icon-cache rustup
APT_PACKAGES := build-essential clang cmake pkg-config git unzip curl libxcb1-dev libxkbcommon-dev libxkbcommon-x11-dev libwayland-dev libfontconfig1-dev libfreetype6-dev libvulkan-dev libssl-dev desktop-file-utils gtk-update-icon-cache

.PHONY: all deps build install run uninstall clean deploy

all: deps build install

deps:
	@if command -v pacman >/dev/null 2>&1; then \
	  sudo pacman -S --needed --noconfirm $(PACMAN_PACKAGES); \
	elif command -v apt-get >/dev/null 2>&1; then \
	  sudo apt-get update && sudo apt-get install -y $(APT_PACKAGES); \
	else \
	  echo 'Unknown package manager: install a C/C++ toolchain, clang, cmake, pkg-config, xcb/xkbcommon/wayland/fontconfig/freetype/vulkan headers, desktop-file-utils and gtk-update-icon-cache yourself.'; \
	fi
	@if ! command -v bun >/dev/null 2>&1 && [ ! -x "$$HOME/.bun/bin/bun" ]; then \
	  echo 'Installing Bun…'; curl -fsSL https://bun.sh/install | bash; \
	fi
	@if ! command -v cargo >/dev/null 2>&1 && [ ! -x "$$HOME/.cargo/bin/cargo" ]; then \
	  if command -v rustup >/dev/null 2>&1; then rustup default stable; \
	  else echo 'Installing Rust…'; curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal; fi; \
	fi
	@[ -x "$(BUN)" ] || { echo 'Bun not found: open a new shell or set BUN=/path/to/bun'; exit 1; }
	@[ -x "$(CARGO)" ] || { echo 'Cargo not found: run `rustup default stable` or set CARGO=/path/to/cargo'; exit 1; }

node_modules/.bin: package.json bun.lock
	"$(BUN)" install --frozen-lockfile
	@touch node_modules/.bin

build: node_modules/.bin
	CARGO="$(CARGO)" "$(BUN)" desktop/package.ts

install:
	"$(BUN)" desktop/install-linux.ts --skip-build

run: node_modules/.bin
	CARGO="$(CARGO)" sh desktop/run.sh

uninstall:
	rm -rf "$(DATA)/cubix-gpui" "$(DATA)/applications/fr.vitrixxl.cubix.desktop" "$(DATA)/icons/hicolor/512x512/apps/fr.vitrixxl.cubix.png" "$(HOME)/.local/bin/cubix"
	-update-desktop-database "$(DATA)/applications" 2>/dev/null
	@echo 'Cubix removed. Application data in $(DATA)/cubix-desktop was kept.'

deploy: node_modules/.bin
	"$(BUN)" scripts/deploy.ts

clean:
	rm -rf artifacts/gpui desktop/bin
	-"$(CARGO)" clean --manifest-path desktop/Cargo.toml
