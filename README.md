# Cubix

Application native de speedcubing : chronomètre, algorithmes, entraînement,
statistiques et succès. Un compte sert uniquement à synchroniser ses temps entre
appareils. Desktop en **Rust / GPUI**, Android en **React Native**, API en
**Rust / Axum / SQLite**. L'application web et la PWA ne sont plus prises en charge.

## Desktop

Le desktop se compile depuis les sources : cloner le dépôt puis lancer `make`.

```sh
git clone https://github.com/Vitrixxl/cubix && cd cubix
make                    # dépendances (pacman ou apt, Bun, Rust), compilation, installation
```

`make` installe les paquets système nécessaires sans yay, Bun et Rust s'ils manquent,
construit l'application autonome dans `artifacts/gpui/cubix-linux-x64` puis l'installe
pour l'utilisateur courant (`~/.local/share/cubix-gpui`, entrée de menu, icône et commande `cubix` dans `~/.local/bin`).
Relancer `make` après un `git pull` pour mettre à jour. `make uninstall` retire
l'application en conservant les données. `make run` compile et lance le desktop
depuis le dépôt.

Pour développer :

```sh
bun install --frozen-lockfile
bun run dev             # construire et lancer le desktop
bun run build:desktop   # paquet autonome dans artifacts/gpui/cubix-linux-x64
```

Le paquet contient le binaire GPUI, un moteur Bun compilé, les mélanges, les guides,
les schémas et les polices. Bun n'est pas nécessaire sur la machine cible.
Linux X11/Wayland avec un pilote Vulkan est la plateforme validée.
Voir [le guide desktop](desktop/README.md) pour les dépendances et l'installation locale.

## Android

```sh
bun run mobile          # lancer dans l'émulateur Android
bun run build:android   # construire mobile/build/cubix-release.apk
```

L'APK release fonctionne sans Metro. Installation, prérequis Android et
validation : [guide mobile](mobile/README.md).

`bun run deploy` (ou `make deploy`) pousse `main`, met à jour le serveur avec
`pihost update cubix`, puis livre le mobile de deux façons (mot de passe admin du serveur
lu par SSH ou `CUBIX_DEPLOY_PASSWORD`) :

- **Mise à jour à la volée (expo-updates)**, à chaque déploiement : `expo export` produit
  le bundle JavaScript et ses assets, envoyés à l'API (`PUT /api/mobile/updates/assets/<sha256>`
  puis `PUT /api/mobile/updates`). Les applications installées interrogent
  `GET /api/mobile/updates/manifest` au lancement, téléchargent le bundle en arrière-plan
  et l'appliquent au démarrage suivant, sans réinstallation. Ouvrir les paramètres
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
La compilation Rust dans l'image est limitée à deux jobs pour tenir en mémoire sur un
Raspberry Pi ; `docker compose build --build-arg CARGO_BUILD_JOBS=4` lève cette limite.

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
desktop/        interface GPUI, moteur Bun et packaging natif
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
