# Cubix web et desktop

L'application est une application web (PWA) servie par l'API (Go). Le desktop
Electron n'est qu'une fenêtre qui l'ouvre : il ne contient ni l'interface, ni le
moteur de données, ni lanceur, ni système de mise à jour.

## Architecture

- `renderer/` : interface React. `bridge.ts` démarre le moteur dans un Web Worker
  (`worker.ts`) et enregistre le service worker (`sw.ts`).
- `engine/core.ts` : moteur de données (stockage local d'abord, synchronisation
  HTTP/WebSocket, mélanges, statistiques). Le worker le fait tourner sur IndexedDB
  (`renderer/idbStorage.ts`).
- `web.ts` : construit `dist/web` avec `bun build` — `index.html`, bundles et
  mélangeur WebAssembly (`../scrambler`) nommés par leur contenu sous `/build/`, icônes
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
bun run build:desktop       # paquet natif Linux ou macOS, selon la machine
make install                # Linux : installation utilisateur, menu et commande cubix
```

### macOS

Avec Bun **1.4+** et Node.js **24+**, exécuter sur le Mac :

```sh
bun install --frozen-lockfile
bun run build:desktop
open artifacts/electron/Cubix-darwin-*/Cubix.app
```

Le paquet est `artifacts/electron/Cubix-darwin-arm64/Cubix.app` sur Apple Silicon
ou `Cubix-darwin-x64/Cubix.app` sur Intel. Il contient la fenêtre Electron, ses
helpers, l'icône Cubix et les licences. Copier `Cubix.app` dans `/Applications`
pour l'installer. Le build ne compile ni le serveur ni Android : il ouvre
par défaut l'application de production.

Electron Packager assemble le bundle et le signe ad hoc, sans compte Apple. Une
signature Developer ID et la notarisation restent nécessaires pour distribuer
publiquement une application reconnue par Gatekeeper. Voir la
[documentation Electron](https://www.electronjs.org/docs/latest/tutorial/code-signing).

### Développement et Linux

`bun run dev` relaie `/api` vers `CUBIX_API_ORIGIN` (production par défaut) et
utilise ses propres données (`~/.local/share/cubix-desktop-dev`), séparées de
l'application installée. `bun run dev:web` sert le site sans ouvrir Electron.

Sous Linux, `make` remplace l'installation précédente, ancien lanceur compris, dans
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

La session n'accorde que ce que l'application utilise (caméra et micro, partage d'écran,
plein écran, copie), et seulement à cette origine ; tout le reste est refusé. Il n'y a
pas de mise à jour automatique de la fenêtre : au lancement, elle compare sa version
(`version.json`, écrit par `package-release.ts`) à celle de `GET /api/desktop` et, si
elle diffère, une boîte de dialogue donne la commande d'installation à relancer.

- `CUBIX_DESKTOP_GPU=system` : conserver la sélection graphique du système. Par défaut,
  sur les PC hybrides Intel/AMD + NVIDIA, la fenêtre utilise le GPU intégré et évite
  le scan Vulkan qui réveille la carte dédiée. L’accélération OpenGL reste active.

### Paquets signés

`bun run deploy` signe chaque paquet (`cubix-linux-x64.tar.gz`, `cubix-windows-x64.zip`)
en RSA-3072, SHA-256, PKCS#1 v1.5, avec `~/.config/cubix/keys/desktop-private-key.pem`
(`CUBIX_DESKTOP_SIGNING_KEY` pour un autre chemin), et l'envoie avec sa signature.
`install.sh` (openssl) et `install.ps1` (.NET de Windows PowerShell 5.1) embarquent la
clé publique, téléchargent `<paquet>.sig` et refusent d'extraire un paquet qui ne
correspond pas. La clé privée ne quitte pas la machine de déploiement : la
**sauvegarder** (hors du dépôt, chiffrée). Pour en changer, remplacer la clé publique
des deux scripts (PEM dans `install.sh`, module et exposant en base64 dans
`install.ps1`) ; le déploiement refuse une clé que `install.sh` ne reconnaît pas. Elle a
été créée par :

```sh
umask 077; openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out ~/.config/cubix/keys/desktop-private-key.pem
```

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
