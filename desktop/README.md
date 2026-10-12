# Cubix web

L'application est une application web (PWA) servie par l'API (Go). Sur ordinateur,
elle s'installe depuis le navigateur (Chrome, Edge, Safari) et s'ouvre dans sa propre
fenêtre, hors ligne comprise.

## Architecture

- `renderer/` : interface React. `bridge.ts` démarre le moteur dans un Web Worker
  (`worker.ts`) et enregistre le service worker (`sw.ts`).
- `engine/core.ts` : moteur de données (stockage local d'abord, synchronisation
  HTTP/WebSocket, mélanges, statistiques). Le worker le fait tourner sur IndexedDB
  (`renderer/idbStorage.ts`).
- `web.ts` : construit `dist/web` avec `bun build` — `index.html`, bundles et
  mélangeur WebAssembly (`../scrambler`) nommés par leur contenu sous `/build/`, icônes
  et schémas sous `/assets/`, copies brotli et gzip.
- `scripts/export-assets.tsx` (`bun run build:assets`) : régénère `assets/catalog.json`,
  les schémas de `assets/cases/` et les icônes de `assets/icons/`.

Le service worker met en cache l'application, les icônes et les mélangeurs à
l'installation, puis les schémas de cas à leur premier affichage. En ligne, chaque
ouverture demande la page au serveur (4 s maximum) : la dernière version déployée
s'ouvre sans étape de mise à jour. Hors ligne, la version en cache s'ouvre.

Le moteur garde l'espace de travail en mémoire : un verrou Web Locks réserve les
données à un seul onglet, les autres affichent « Cubix est déjà ouvert » et prennent
le relais quand il se ferme.

## Développement

```sh
bun install --frozen-lockfile
bun run dev                 # construit le site et le sert sur 127.0.0.1:5180
```

`bun run dev` relaie `/api` vers `CUBIX_API_ORIGIN` (production par défaut).

## Validation

Les tests d'interface lancent Chromium headless (`/usr/bin/chromium`, `CUBIX_TEST_CHROMIUM`).
Chaque script de `testing/` démarre une API temporaire (binaire release) qui sert
`dist/web`, avec des données isolées.

```sh
bun run typecheck
bun test ./desktop/tests                  # apparence au démarrage, page d'accueil, navigation
bun run test:ui                           # construit l'API et le site, puis :
bun desktop/testing/web-app.ts            #   IndexedDB, relance hors ligne
bun desktop/testing/responsive.ts         #   chaque écran de 360×640 à 1600×900, sans défilement ni chevauchement
bun desktop/testing/history-chart.ts      #   gestes du graphique et tableau des temps
bun desktop/testing/error-notification.ts #   notification d'erreur
```

Les captures sont dans `artifacts/testing`.
