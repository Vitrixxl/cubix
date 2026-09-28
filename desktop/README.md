# Cubix web et desktop

L'application est une application web (PWA) servie par l'API Rust. Le desktop
Electron n'est qu'une fenêtre qui l'ouvre : il ne contient ni l'interface, ni le
moteur de données, ni lanceur, ni système de mise à jour.

## Architecture

- `renderer/` : interface React. `bridge.ts` démarre le moteur dans un Web Worker
  (`worker.ts`) et enregistre le service worker (`sw.ts`).
- `engine/core.ts` : moteur de données (stockage local d'abord, synchronisation
  HTTP/WebSocket, mélanges, statistiques). Le worker le fait tourner sur IndexedDB
  (`renderer/idbStorage.ts`).
- `web.ts` : construit `dist/web` avec `bun build` — `index.html`, bundles nommés par
  leur contenu sous `/build/`, cubing.js en modules séparés sous
  `/vendor/cubing-<version>/` (ses mélangeurs démarrent leurs propres workers), icônes
  et schémas sous `/assets/`, copies brotli et gzip.
- `electron/` : fenêtre (`main.ts`), pont minimal (`preload.ts`) et page d'attente du
  premier lancement hors ligne (`offline.html`), construits dans `dist/` par `build.ts`.
- `scripts/export-assets.tsx` (`bun run build:assets`) : régénère `assets/catalog.json`,
  les schémas de `assets/cases/` et les icônes de `assets/icons/`.

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

Les tests d'interface lancent Electron sans fenêtre sur le bureau (backend Ozone
`headless` ; `CUBIX_OZONE_PLATFORM=x11` sous `xvfb-run -a` au besoin) ou Chromium headless (`/usr/bin/chromium`, `CUBIX_CHROMIUM`).
Chaque script de `testing/` démarre une API temporaire (binaire release) qui sert
`dist/web`, avec des données isolées.

```sh
bun run typecheck
bun test ./desktop/tests                  # détection GPU Linux, apparence au démarrage
bun run test:ui                           # construit l'API, la fenêtre et le site, puis :
bun desktop/testing/web-app.ts            #   import de storage.json, IndexedDB, relance hors ligne
bun desktop/testing/responsive.ts         #   chaque écran de 360×640 à 1600×900, sans défilement ni chevauchement
bun desktop/testing/history-chart.ts      #   gestes du graphique et tableau des temps
bun desktop/testing/error-notification.ts #   notification d'erreur (Chromium)
```

Les captures sont dans `artifacts/electron/testing`.
