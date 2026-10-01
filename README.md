# Cubix

Application native de speedcubing : chronomètre, algorithmes, entraînement,
statistiques et succès. Un compte sert uniquement à synchroniser ses temps entre
appareils. Application web (PWA) servie par l'API, desktop **Electron** qui ouvre
cette même application, Android en **React Native**, API en **Rust / Axum / SQLite**.

## Web et desktop

L'application web est construite par `bun build` dans `dist/web` et servie par l'API
(`https://cubix.vitrixxl.fr`). Elle s'installe comme PWA et fonctionne hors ligne :
son service worker garde l'application et les mélangeurs, les temps sont enregistrés
dans IndexedDB par un Web Worker avant toute synchronisation. Un seul onglet à la
fois ouvre les données ; les autres attendent qu'il se ferme.

Le desktop Electron ne contient que sa fenêtre : il ouvre l'application servie par
l'API, comme une PWA. Il n'y a ni lanceur ni mise à jour : chaque lancement en ligne
ouvre la dernière version déployée, et hors ligne la version en cache.

```sh
bun install --frozen-lockfile
bun run dev             # site sur http://127.0.0.1:5180 (API de production) et Electron
bun run dev:web         # le même site, sans Electron, pour un navigateur
bun run build:web       # dist/web, servi par l'API quand il existe
bun run build:desktop   # paquet Electron pour Linux ou macOS, selon la machine
make                    # Linux : construit le paquet, puis l'installe
```

Sur macOS, après un clone ou un pull, installer **Bun 1.4+** et **Node.js 24+**, puis :

```sh
bun install --frozen-lockfile
bun run build:desktop
open artifacts/electron/Cubix-darwin-*/Cubix.app
```

Le build crée `artifacts/electron/Cubix-darwin-arm64/Cubix.app` sur Apple Silicon,
ou `Cubix-darwin-x64/Cubix.app` sur Intel. Copier `Cubix.app` dans `/Applications`
pour l'installer. Le build s'exécute sur le Mac cible ; aucun build Rust ou Android
n'est nécessaire, la fenêtre ouvre l'API de production. L'application est signée
localement (ad hoc), sans certificat Apple ; elle n'est pas notariée pour une
distribution publique.

Sous Linux, `make` installe le desktop dans `~/.local/share/cubix-electron` avec l'entrée de menu
Cubix et la commande `~/.local/bin/cubix`, sans sudo ; il ne sert qu'à mettre à jour la
fenêtre Electron elle-même. Voir [le guide desktop](desktop/README.md).

## Android

```sh
bun run mobile          # lancer dans l'émulateur Android
bun run build:android   # construire mobile/build/cubix-release.apk
```

L'APK release fonctionne sans Metro. Installation, prérequis Android et
validation : [guide mobile](mobile/README.md).

`bun run deploy` (ou `make deploy`) pousse `main`, met à jour le serveur avec
`pihost update cubix` (l'image construit aussi l'application web, donc le desktop),
puis livre le mobile de deux façons (`CUBIX_ADMIN_PASSWORD` du serveur, lu par SSH, ou
`CUBIX_DEPLOY_PASSWORD` ; ce mot de passe ne sert qu'aux envois mobiles) :

- **Mise à jour à la volée (expo-updates)**, à chaque déploiement : `expo export` produit
  le bundle JavaScript et ses assets, envoyés à l'API (`PUT /api/mobile/updates/assets/<sha256>`
  puis `PUT /api/mobile/updates`). Les applications installées interrogent
  `GET /api/mobile/updates/manifest` au lancement ; quand un bundle est à télécharger,
  l'écran de démarrage au cube mélangé qui se résout couvre
  le téléchargement et le redémarrage avant d'ouvrir la pratique, sans réinstallation.
  Sans mise à jour, l'application s'ouvre directement. Sans connexion, la version installée
  s'ouvre et une notification « Mode hors ligne » l'annonce. Ouvrir les paramètres
  relance la vérification et propose « Restart to update » dès qu'un bundle est prêt.
- **APK**, seulement quand le natif change : `mobile/app.config.ts` dérive une
  `runtimeVersion` des fichiers natifs (app.json, plugins, bun.lock, icônes, police).
  Si elle diffère de celle de l'APK stocké, le script compile l'APK ARM64 à basse priorité
  et l'envoie (`PUT /api/mobile/apk`) ; l'application affiche alors « Download update ».
  `--apk` force l'APK, `--skip-apk` ou `--update-only` s'en dispensent, `--apk-only` ne fait que lui.

L'API stocke ces fichiers à côté de sa base ; `/api/mobile/release` annonce son build,
celui de l'APK, sa runtime version et les updates publiées. Le numéro de build est la date
du commit en minutes : il est calculé par `mobile/app.config.ts` pour l'APK et par le
`Dockerfile` pour l'API. Aucune release GitHub n'intervient. L'APK n'est pas compilé sur le
Raspberry Pi : Gradle dépasse sa mémoire et Google ne publie pas de NDK Android pour Linux ARM64.

## API

Docker et Docker Compose suffisent pour héberger le serveur :

```sh
docker compose up -d --build
curl --fail http://localhost:3000/api/health
docker compose logs -f api
```

Le service expose l'application web sur `/`, `/api/*` et la WebSocket `/api/live`, qui
transporte les notifications de synchronisation entre les appareils d'un même compte.
L'image construit l'application web dans une étape Bun (dépendances de production
seulement) et la sert depuis `CUBIX_WEB_DIR` : fichiers précompressés (brotli, gzip),
bundles nommés par leur contenu et mis en cache définitivement, page toujours revalidée.
Hors Docker, l'API sert `dist/web` quand il a été construit, sinon l'API seule.
Les comptes, temps, sessions et marques d'apprentissage restent dans le volume `cubix-data`.
`docker compose down` conserve ce volume. `CUBIX_PORT=8080` change le port publié.
Sur la Raspberry Pi de 4 Go, la compilation Rust utilise un seul job, sans LTO et
avec 16 unités de génération de code. Le build Android se fait en local.

Les applications utilisent `https://cubix.vitrixxl.fr` par défaut. Pour travailler
avec une API locale :

```sh
bun run dev:api
# Dans un second terminal :
CUBIX_API_ORIGIN=http://127.0.0.1:47129 bun run dev
```

L'API accepte `--host`, `--port`, `--version`, `--init-db` et
`--import-history <username>`. `CUBIX_DB` choisit le fichier SQLite ; hors Docker,
il est par défaut sous `$XDG_DATA_HOME/cubix/cubix.db` ou `~/.local/share/cubix/cubix.db`.
Le catalogue est inclus dans le binaire et les migrations sont automatiques.

Pour attribuer les anciens temps serveur sans propriétaire à un compte existant :

```sh
docker compose exec api cubix-api --import-history votre_pseudo
```

L'import est transactionnel et peut être répété sans duplication.

## Administration et réseau

L'administration (`/admin`, API `/api/admin/*` et socket `/api/admin/live`) montre comment
tous les comptes utilisent l'application : vue d'ensemble, comptes et leur activité, journal
des requêtes, IP. Elle s'ouvre avec un **jeton unique généré dans le conteneur** ; seul son
SHA-256 est stocké en base (table `admin_access`). Sans jeton, les routes admin répondent 503.

Générer (ou remplacer) le jeton sur le Pi, serveur en marche :

```sh
ssh vitrix@82.67.236.74
cd /srv/pihost/apps/cubix/repo
docker compose -p pihost-cubix exec api cubix-api admin-token
```

pihost n'a pas de commande `exec` ; en une ligne, sans passer par le dossier :

```sh
ssh vitrix@82.67.236.74 'docker exec $(docker ps -qf label=com.docker.compose.project=pihost-cubix -f label=com.docker.compose.service=api) cubix-api admin-token'
```

La commande affiche `cbx_admin_…` (256 bits aléatoires) une seule fois, puis s'arrête. Ouvrir
<https://cubix.vitrixxl.fr/admin> et coller le jeton : `POST /api/admin/login` avec
`{"token": "…"}` pose un cookie HttpOnly valable un jour, indépendant des comptes utilisateurs.
Relancer `admin-token` remplace le jeton : l'ancien ne marche plus et toutes les sessions admin
ouvertes avec lui sont fermées, sockets live compris (en deux secondes au plus).
`cubix-api admin-token --revoke` désactive entièrement l'administration. En local :
`CUBIX_DB=… ./rust-api/target/release/cubix-api admin-token` (ou `--admin-token`).

`CUBIX_ADMIN_PASSWORD` n'ouvre plus l'administration : il sert **uniquement** aux envois de
l'APK et des mises à jour mobiles par `bun run deploy` (`Authorization: Bearer <mot de passe>`).

Le serveur garde un journal persistant des requêtes (méthode, chemin sans paramètres, statut,
durée, IP, user agent tronqué, compte ; jamais de jeton, de paramètre ni de corps) :
30 jours, 200 000 lignes ordinaires et 50 000 importantes au plus. Les agrégats quotidiens par
IP sont gardés 90 jours, l'activité quotidienne des comptes 400 jours. Sont « importants » :
les erreurs serveur, les erreurs client (sauf 404 hors API), l'authentification (échecs
compris), les actions admin, les 429, les suppressions de compte, le matchmaking duel et les
envois mobiles. Voir [la documentation du serveur](rust-api/README.md#administration).

Les limites sont de 600 requêtes/minute/IP par défaut (`CUBIX_RATE_LIMIT`),
20 tentatives/minute/IP pour l'authentification utilisateur et 5 tentatives/15 minutes/IP
pour l'administration. Les réponses 429 incluent `Retry-After`.
`CUBIX_TRUSTED_PROXIES` accepte les IP exactes des reverse proxies autorisés ;
sinon `X-Forwarded-For` est ignoré. Les sondes de santé sont exclues du journal admin.

## Données locales

Le chronomètre et l'entraînement enregistrent les temps sur l'appareil avant toute
synchronisation. Sans compte, les temps restent locaux. Un compte ajoute la
synchronisation ; les opérations en attente sont conservées
hors ligne et reprises au retour du réseau. Une déconnexion ou une session expirée
ne supprime pas les temps en attente. Les marques « appris / à apprendre » des cas suivent
le même mécanisme. Tant qu'un appareil est connecté, il reçoit en direct les changements
faits sur les autres appareils du compte. Les guides et le catalogue sont embarqués.

Le desktop garde le profil de navigateur de l'application (IndexedDB, cache hors
ligne) dans `$XDG_DATA_HOME/cubix-desktop/electron` ou `~/.local/share/cubix-desktop/electron`
(`CUBIX_DESKTOP_DATA` pour changer le dossier). Au premier lancement, les données de
l'ancien moteur desktop (`storage.json` du même dossier : temps non synchronisés,
préférences, session) sont importées une fois, puis le fichier est renommé
`storage.imported.json`.

## Développement et vérification

Bun **1.4+**, Node.js **24+** pour les outils de catalogue/stress et Rust **1.98+**.

```sh
bun install --frozen-lockfile
bun run typecheck
bun run test            # clients partagés, API HTTP/WS, catalogue, desktop et Rust
bun run test:ui         # parcours réels du site dans Electron/Chromium headless
bun run build:api       # serveur seul
bun run build:web       # application web
bun run build:desktop   # fenêtre Electron autonome
bun run stress          # API isolée, base et résultats temporaires sous artifacts/
```

```text
desktop/        application web (renderer/, engine/, guides/), fenêtre Electron et builds
mobile/         application Android React Native
src/client/     client HTTP/WS, stockage/sync, statistiques et schémas partagés
src/shared/     contrats TypeScript et modèle du cube
rust-api/       API, authentification, WebSockets et migrations SQLite
data/           catalogues embarqués (catalog.json généré par `bun run build:catalog`)
assets/cases/   schémas sources des puzzles
scripts/        catalogue, déploiement, tests de charge et `rust.sh` (cargo)
docs/           sources du catalogue et modes de pratique
Makefile        dépendances, compilation et installation du desktop
tests/          tests des clients et de l'API réelle
```

Les écrans restent à la hauteur de la fenêtre ; seules les listes et panneaux
internes défilent. Les explications se trouvent dans les guides accessibles via l'aide.
Les [sources du catalogue et modes de pratique](docs/catalogue.md) sont documentés séparément.

La logique de pratique commune au mobile et au desktop se trouve dans
`src/client/lib/` : chrono (`practiceTimer`), thèmes (`theme`), catalogue et
sélections (`practiceCatalog`), indicateurs et regroupement des temps
(`practiceSummary`), sessions du lancement (`launchSessions`) et représentation
des cas (`caseState`). Ces modules TypeScript ne dépendent ni de React Native,
ni d’Electron, ni d’un stockage spécifique. Les interfaces les consomment via
leurs adaptateurs : clavier/RAF côté desktop, tactile/AppState côté mobile.
Les composants, la navigation et les mises à jour restent propres à chaque plateforme.

`bun run typecheck` vérifie le code partagé et les deux applications.
`bun test tests/practice-shared.test.ts` vérifie les règles communes ;
`bun run --cwd mobile test` vérifie aussi leur intégration au chrono mobile.
Les parcours réels de l'interface sont dans `desktop/testing/` (`bun run test:ui` les
construit et les enchaîne) : chaque script lance une API temporaire qui sert `dist/web`
et ouvre Electron dessus sans fenêtre. Voir [le guide desktop](desktop/README.md#validation).
