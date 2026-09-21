# Bun builds and installs Cubix Electron for the current user. Updates never require sudo.
SHELL := /bin/sh
BUN ?= $(shell command -v bun 2>/dev/null || printf '%s' "$$HOME/.bun/bin/bun")
DATA ?= $(if $(XDG_DATA_HOME),$(XDG_DATA_HOME),$(HOME)/.local/share)
.PHONY: all deps build install run uninstall clean deploy
all: build install
deps:
	"$(BUN)" install --frozen-lockfile
node_modules/.bin: package.json bun.lock
	"$(BUN)" install --frozen-lockfile
	@touch node_modules/.bin
build: node_modules/.bin
	"$(BUN)" desktop/package.ts
install:
	"$(BUN)" desktop/install-linux.ts --skip-build
run: node_modules/.bin
	"$(BUN)" desktop/dev.ts
uninstall:
	rm -rf "$(DATA)/cubix-electron" "$(DATA)/applications/fr.vitrixxl.cubix.desktop" "$(DATA)/icons/hicolor/512x512/apps/fr.vitrixxl.cubix.png" "$(HOME)/.local/bin/cubix"
	@echo 'Cubix removed. Application data in $(DATA)/cubix-desktop was kept.'
deploy: node_modules/.bin
	"$(BUN)" scripts/deploy.ts
clean:
	rm -rf artifacts/electron desktop/dist desktop/bin
