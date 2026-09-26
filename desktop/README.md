# Cubix web et desktop

L'application est une application web (PWA) servie par l'API Rust. Le desktop
Electron n'est qu'une fenêtre qui l'ouvre : il ne contient ni l'interface, ni le
moteur de données, ni lanceur, ni système de mise à jour.

## Architecture

- `renderer/` : interface React. `bridge.ts` démarre le moteur dans un Web Worker
  (`worker.ts`) et enregistre le service worker (`sw.ts`).
- `engine/core.ts` : moteur de données (stockage local d'abord, synchronisation
  HTTP/WebSocket, mélanges, statistiques). Le worker le fait tourner sur IndexedDB
  (`renderer/idbStorage.ts`) ; `engine/main.ts` le garde en processus Bun pour la
  référence GPUI archivée et le test `engine/smoke.ts`.
- `web.ts` : construit `dist/web` avec `bun build` — `index.html`, bundles nommés par
  leur contenu sous `/build/`, cubing.js en modules séparés sous
  `/vendor/cubing-<version>/` (ses mélangeurs démarrent leurs propres workers), icônes
  et schémas sous `/assets/`, copies brotli et gzip.
- `electron/` : fenêtre (`main.ts`), pont minimal (`preload.ts`) et page d'attente du
  premier lancement hors ligne (`offline.html`).

Le service worker met en cache l'application, les icônes et les mélangeurs à
l'installation, puis les schémas de cas à leur premier affichage. En ligne, chaque
ouverture demande la page au serveur (4 s maximum) : la dernière version déployée
s'ouvre sans étape de mise à jour. Hors ligne, la version en cache s'ouvre.

Le moteur garde l'espace de travail en mémoire : un verrou Web Locks réserve les
données à un seul onglet, les autres affichent « Cubix est déjà ouvert » et prennent
le relais quand il se ferme.

## Desktop

```sh
bun install --frozen-lockfile
bun run dev                 # construit le site, le sert sur 127.0.0.1:5180, ouvre Electron
bun run build:desktop       # artifacts/electron/cubix-linux-x64 : runtime Electron + fenêtre
make install                # installation utilisateur, menu et commande cubix
```

`bun run dev` relaie `/api` vers `CUBIX_API_ORIGIN` (production par défaut) et
utilise ses propres données (`~/.local/share/cubix-desktop-dev`), séparées de
l'application installée. `bun run dev:web` sert le site sans ouvrir Electron.

`make` remplace l'installation précédente, ancien lanceur compris, dans
`~/.local/share/cubix-electron`, crée l'entrée de menu et `~/.local/bin/cubix`, sans
sudo. `make uninstall` conserve les données. Réinstaller n'est utile que lorsque la
fenêtre Electron elle-même change.

La fenêtre ouvre `CUBIX_WEB_ORIGIN`, sinon `CUBIX_API_ORIGIN`, sinon
`https://cubix.vitrixxl.fr`. Elle n'autorise la navigation que sur cette origine et
ouvre les autres liens dans le navigateur. Si le tout premier lancement n'a pas de
connexion, une page d'attente s'affiche et l'application s'ouvre dès que le serveur
répond.

Le profil Chromium (IndexedDB, cache du service worker) est dans
`~/.local/share/cubix-desktop/electron` (`CUBIX_DESKTOP_DATA` change le dossier).
Au premier lancement, le `storage.json` de l'ancien moteur desktop est importé une
seule fois, puis renommé `storage.imported.json`.

- `CUBIX_DESKTOP_GPU=system` : conserver la sélection graphique du système. Par défaut,
  sur les PC hybrides Intel/AMD + NVIDIA, la fenêtre utilise le GPU intégré et évite
  le scan Vulkan qui réveille la carte dédiée. L’accélération OpenGL reste active.

## Validation

Tous les tests graphiques tournent sous `xvfb-run -a`. Chaque script de
`testing/` lance une API temporaire qui sert `dist/web`, puis Electron dessus.

```sh
bun run typecheck
bun run test:desktop             # moteur Bun, mélanges, détection GPU
bun run test:desktop:web         # import de storage.json, IndexedDB, relance hors ligne
bun run test:desktop:responsive  # fenêtres étroites/courtes, aucun chevauchement
bun run test:desktop:learning    # apprentissage quotidien
bun desktop/testing/history-chart.ts
bun desktop/testing/error-notification.ts
```

Les captures sont dans `artifacts/electron/testing`. Le code GPUI dans `desktop/src`
et ses outils de référence (`testing/compare.ts`, `testing/native.ts`) sont conservés
pour comparer le rendu, mais ne font partie d'aucun build.
