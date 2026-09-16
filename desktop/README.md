# Cubix desktop

Application native Rust / GPUI. Un processus Bun sans navigateur gère le client
partagé, le stockage local, la synchronisation et les mélanges. Les guides et les
polices sont inclus dans le paquet ; le serveur ne fournit aucune interface web.

## Construire et lancer

Prérequis : Bun 1.4+, Rust/Cargo 1.98+, compilateur C/C++, Clang et pkg-config.
Sur Arch : `base-devel`, `rust`, `clang`, `pkgconf`, `bun`, `libxcb`,
`libxkbcommon`, `libxkbcommon-x11`, `wayland`, `fontconfig`, `freetype2` et
`vulkan-icd-loader`, avec un pilote Vulkan adapté au GPU.

Depuis la racine :

```sh
bun install --frozen-lockfile
bun run dev
bun run build:desktop
./artifacts/gpui/cubix-linux-x64/cubix-desktop
```

`CARGO` permet de choisir Cargo et `CARGO_TARGET_DIR` son cache de compilation.
Le dossier autonome contient les deux exécutables, `assets`, `vendor` et les
licences. Garder ces fichiers ensemble. Bun et le dépôt ne sont pas requis à
l'exécution. Seul Linux a été validé ; macOS et Windows nécessitent leurs propres builds.

## Installer sous Linux

Depuis la racine du dépôt :

```sh
make            # dépendances, compilation et installation utilisateur
make install    # réinstaller un paquet autonome déjà construit
make uninstall  # retirer l'application, les données sont conservées
```

`make deps` installe les paquets système avec pacman ou apt (sans yay), puis Bun et
Rust s'ils manquent. L'installation utilise `~/.local/share/cubix-gpui` (ou
`$XDG_DATA_HOME`), une entrée de menu Cubix, son icône et une commande `cubix` dans `~/.local/bin` ; elle requiert
`desktop-file-utils` et `gtk-update-icon-cache`. Relancer `make` après un `git pull`
pour actualiser cette copie. Aucun paquet système ni release précompilée n'est publié.

## Configuration et tests

`CUBIX_API_ORIGIN` choisit l'origine API (défaut `https://cubix.vitrixxl.fr`).
`CUBIX_DESKTOP_DATA` choisit le répertoire des données privées. Les invités
restent locaux ; les comptes utilisent l'API de synchronisation existante.
Les boutons souris arrière/suivant et Alt+Gauche/Droite naviguent dans l'historique.

```sh
bun run typecheck
bun run test:desktop
CUBIX_ENGINE_EXE="$PWD/artifacts/gpui/cubix-linux-x64/cubix-engine" bun desktop/engine/smoke.ts
```

Les tests du moteur utilisent un répertoire temporaire et une origine loopback.
Les outils de test d'interface historiques sont dans `desktop/testing` ; ils
nécessitent les fixtures locales `artifacts/gpui/reference-storage.json`, X11,
xdotool et le build `--features reference`. Les commandes de contrôle sont absentes
d'un build normal et refusent les origines API distantes.
