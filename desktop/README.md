# Cubix desktop — Electron + Bun

Electron affiche l'interface React et canvas. Le moteur Bun autonome conserve le
stockage local, la synchronisation HTTP/WebSocket, les mélanges et les statistiques.
Les fichiers utilisateur restent dans `~/.local/share/cubix-desktop` : une migration
depuis GPUI conserve les comptes, les temps, les préférences et les sélections.
L'API reste en Rust/Axum et ne sert aucune page web.

## Construire et lancer

Prérequis de construction : Bun 1.4+ et les bibliothèques nécessaires à Electron.
Aucun compilateur Rust n'est requis pour le desktop. Rust reste nécessaire à l'API.

```sh
bun install --frozen-lockfile
bun run dev                 # construire avec bun build, puis ouvrir Electron
bun run build:desktop       # paquet autonome, avec Chromium et Bun inclus
./artifacts/electron/cubix-linux-x64/cubix
make install                # installer le dernier paquet pour l'utilisateur courant
```

`make` construit et installe. L'installation Linux place le lanceur dans
`~/.local/share/cubix-electron`, crée l'entrée de menu Cubix et la commande
`~/.local/bin/cubix`. Elle ne demande pas sudo. `make uninstall` conserve les données.
Le lanceur compilé fonctionne sans Bun, Node, Cargo ni le dépôt sur la machine cible.

Toutes les entrées JavaScript sont compilées par `bun build` : renderer navigateur,
main/preload Electron, moteur Bun et lanceur (`--compile`). Electron exécute son
main dans son Node intégré et le renderer dans Chromium ; Bun exécute le moteur,
le lanceur et les outils de construction. Pas de Vite, Webpack ni Electron Forge.

## Mises à jour

Au lancement, une fenêtre Cubix affiche la recherche puis le téléchargement.
Le lanceur interroge `GET /api/desktop/releases/linux-x64` (cible propre au build).
Le serveur renvoie un manifeste signé Ed25519 qui identifie chaque fichier par
son SHA-256. Les fichiers inchangés sont réutilisés ; seuls les nouveaux fichiers
sont téléchargés depuis `GET /api/desktop/assets/<sha256>`.

Une release est préparée dans un répertoire distinct. Le pointeur `current.json`
est remplacé uniquement après vérification de tous les fichiers. L'application
fonctionne hors ligne avec la release installée. Si une nouvelle version ne confirme
pas son démarrage, le lanceur restaure la précédente et évite de retenter cette même
release défectueuse. `update-error.log`, `application.log` et `last-launch.json`
aident à diagnostiquer un problème. Les mises à jour ne touchent pas aux données.

La première construction crée une clé privée dans
`~/.config/cubix/desktop-signing.pem` (permissions 0600). Conserver et sauvegarder
cette clé : les lanceurs installés n'acceptent que les releases signées par elle.
`CUBIX_DESKTOP_SIGNING_KEY` permet de fournir une autre clé PEM Ed25519.
La clé privée n'est jamais copiée dans le paquet ni envoyée au serveur.

```sh
bun run build:desktop
CUBIX_DEPLOY_PASSWORD=… bun run publish:desktop
# Ou le déploiement complet existant :
bun run deploy
```

Le déploiement complet publie désormais aussi le desktop de la plateforme qui
exécute le build. Les modes `--apk-only` et `--update-only` restent spécifiques au
mobile. `--skip-apk` publie l'OTA mobile et le desktop. Les uploads desktop utilisent
le même mot de passe administrateur que les releases mobiles. Le serveur stocke
les releases dans `apk/desktop` à côté de la base (ou sous `CUBIX_APK_DIR`).
Une première installation de cette version Electron est nécessaire pour activer
le nouveau lanceur sur une ancienne installation GPUI.

## Configuration et validation

- `CUBIX_API_ORIGIN` : origine API, défaut `https://cubix.vitrixxl.fr`.
- `CUBIX_DESKTOP_DATA` : dossier des données privées.
- `CUBIX_DESKTOP_BUILD` : numéro de build monotone, défaut timestamp en millisecondes.
- `CUBIX_ORIGIN` : origine du serveur de publication.

```sh
bun run typecheck
bun run test:desktop             # moteur Bun et updater signé
bun run test:desktop:ui          # vrais écrans Electron
bun desktop/testing/flows.ts     # interactions, API temporaire, thèmes, guides
bun desktop/testing/launcher.ts  # mise à jour, rollback, quarantaine et démarrage hors ligne
bun desktop/testing/compare.ts   # captures GPUI/Electron déterministes (build GPUI reference)
```

Les tests d'interface utilisent Playwright piloté par Bun, un affichage X11 et des
dossiers temporaires. Les tests de parcours requièrent le binaire API construit.
Les captures sont dans `artifacts/electron/testing`. Sous CI, lancer ces tests dans
Xvfb. Le code GPUI dans `desktop/src` et ses outils de référence sont conservés pour
comparer le rendu, mais ne font pas partie du build Electron.
Linux x64 est la plateforme validée dans cet environnement. macOS et Windows
requièrent leurs propres builds et une validation de leurs installateurs.

Sur la Raspberry Pi, Docker compile uniquement l’API Rust avec un job, sans LTO.
Les transferts desktop utilisent des fichiers immuables lus par blocs de 64 Kio ;
les uploads sont traités un par un et vérifiés avant publication.
