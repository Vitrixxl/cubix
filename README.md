# Cubix

Application native de speedcubing : chronomètre, algorithmes, entraînement,
statistiques et succès. Un compte sert uniquement à synchroniser ses temps entre
appareils. Desktop en **Electron / Bun**, Android en **React Native**, API en
**Rust / Axum / SQLite**. L'application web et la PWA ne sont plus prises en charge.

## Desktop

Le desktop utilise Electron pour l'interface et un moteur Bun pour les données.
Le lanceur récupère automatiquement les mises à jour signées depuis l'API,
sans sudo, puis ouvre l’application à jour. Hors ligne, il ouvre la version installée
et l’application le signale dans une notification.

```sh
bun install --frozen-lockfile
bun run dev             # construire avec bun build et lancer Electron
bun run build:desktop   # paquet autonome dans artifacts/electron/cubix-linux-x64
make install            # installation utilisateur, menu et commande cubix
```

`make` construit et installe le desktop dans `~/.local/share/cubix-electron`.
Bun, Node et Rust ne sont pas requis sur la machine cible. Les données GPUI
existantes sont conservées dans `~/.local/share/cubix-desktop`.
Linux x64 est validé ; les autres plateformes nécessitent leurs propres builds.
Voir [le guide desktop](desktop/README.md) pour la signature, la publication et les tests.

## Android

```sh
bun run mobile          # lancer dans l'émulateur Android
bun run build:android   # construire mobile/build/cubix-release.apk
```

L'APK release fonctionne sans Metro. Installation, prérequis Android et
validation : [guide mobile](mobile/README.md).

`bun run deploy` (ou `make deploy`) pousse `main`, met à jour le serveur avec
`pihost update cubix`, publie le desktop Electron signé, puis livre le mobile de deux façons (mot de passe admin du serveur
lu par SSH ou `CUBIX_DEPLOY_PASSWORD`) :

- **Mise à jour à la volée (expo-updates)**, à chaque déploiement : `expo export` produit
  le bundle JavaScript et ses assets, envoyés à l'API (`PUT /api/mobile/updates/assets/<sha256>`
  puis `PUT /api/mobile/updates`). Les applications installées interrogent
  `GET /api/mobile/updates/manifest` au lancement, derrière l'écran de démarrage au cube
  mélangé qui se résout (le même que le lanceur desktop), téléchargent le bundle et redémarrent dessus
  avant d'ouvrir la pratique, sans réinstallation. Sans connexion, la version installée
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

Le service expose `/api/*` et la WebSocket `/api/live`, qui transporte les notifications
de synchronisation entre les appareils d'un même compte.
Les anciennes pages web, les fichiers statiques et `/aaaaadmin` renvoient 404.
L'image ne contient que le serveur Rust ; aucun build JavaScript n'est nécessaire.
Les comptes, temps, sessions et marques d'apprentissage restent dans le volume `cubix-data`.
`docker compose down` conserve ce volume. `CUBIX_PORT=8080` change le port publié.
Sur la Raspberry Pi de 4 Go, la compilation Rust utilise un seul job, sans LTO et
avec 16 unités de génération de code. Les builds Electron et Android se font en
local. Les assets desktop sont servis par blocs de 64 Kio et les uploads sont
sérialisés, pour garder une consommation mémoire limitée.

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

Les endpoints `/api/admin/*` et `/api/admin/live` sont conservés, sans interface web.
Copier `.env.example` vers `.env` puis définir `CUBIX_ADMIN_PASSWORD` (12 caractères
minimum) pour les activer. Le cookie admin reste indépendant des comptes utilisateurs.

Les limites sont de 600 requêtes/minute/IP par défaut (`CUBIX_RATE_LIMIT`),
20 tentatives/minute/IP pour l'authentification utilisateur et 5 tentatives/15 minutes/IP
pour l'administration. Les réponses 429 incluent `Retry-After`.
`CUBIX_TRUSTED_PROXIES` accepte les IP exactes des reverse proxies autorisés ;
sinon `X-Forwarded-For` est ignoré. Les sondes de santé sont exclues du journal admin.
Voir [la documentation du serveur](rust-api/README.md).

## Données locales

Le chronomètre et l'entraînement enregistrent les temps sur l'appareil avant toute
synchronisation. Sans compte, les temps restent locaux. Un compte ajoute la
synchronisation ; les opérations en attente sont conservées
hors ligne et reprises au retour du réseau. Une déconnexion ou une session expirée
ne supprime pas les temps en attente. Les marques « appris / à apprendre » des cas suivent
le même mécanisme. Tant qu'un appareil est connecté, il reçoit en direct les changements
faits sur les autres appareils du compte. Les guides et le catalogue sont embarqués.

Le desktop utilise `$XDG_DATA_HOME/cubix-desktop/storage.json` ou
`~/.local/share/cubix-desktop/storage.json` (`CUBIX_DESKTOP_DATA` pour changer le dossier).
Les données de l'ancien navigateur ne sont pas importées automatiquement ; les
comptes retrouvent les données déjà synchronisées avec l'API.

## Développement et vérification

Bun **1.4+**, Node.js **24+** pour les outils de catalogue/stress et Rust **1.98+**.

```sh
bun install --frozen-lockfile
bun run typecheck
bun run test            # clients partagés, API HTTP/WS, catalogue et Rust
bun run test:desktop    # moteur desktop, workers de mélange et stockage local
bun run build:api       # serveur seul
bun run build:desktop   # application autonome
bun run stress          # API isolée, base et résultats temporaires sous artifacts/
```

```text
desktop/        interface Electron, moteur Bun, lanceur et mises à jour signées
mobile/         application Android React Native
src/client/     client HTTP/WS, stockage/sync, statistiques et schémas partagés
src/shared/     contrats TypeScript et modèle du cube
rust-api/       API, authentification, WebSockets et migrations SQLite
data/           catalogues embarqués (catalog.json généré par `bun run build:catalog`)
assets/cases/   schémas sources des puzzles
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
Les parcours réels Electron sont dans `desktop/testing/flows.ts` (après
`bun run build:desktop:ui`, avec un affichage X11 disponible sous Linux).
