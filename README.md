# Cubix

Application native de speedcubing : chronomètre, algorithmes, entraînement,
statistiques et messagerie. Desktop en **Rust / GPUI**, Android en **React Native**,
API en **Rust / Axum / SQLite**. L'application web et la PWA ne sont plus prises en charge.

## Desktop

Installer ou mettre à jour le binaire précompilé sur Arch Linux x86_64 :

```sh
./update.sh
```

Aucun compilateur ni compte AUR n'est nécessaire. Le script télécharge la dernière
release GitHub, vérifie son SHA-256 puis installe le paquet `cubix-bin`.
Les releases sont produites après validation de `main` par la CI.

Pour développer ou compiler soi-même :

```sh
bun install --frozen-lockfile
bun run dev             # construire et lancer le desktop
bun run build:desktop   # paquet autonome dans artifacts/gpui/cubix-linux-x64
```

Le paquet contient le binaire GPUI, un moteur Bun compilé, les mélanges, les guides,
les schémas et les polices. Bun n'est pas nécessaire sur la machine cible.
Linux X11/Wayland avec un pilote Vulkan est la plateforme validée.
Voir [le guide desktop](desktop/README.md) pour les dépendances et l'installation locale.

Le paquet Arch `cubix-git` est préparé dans [packaging/aur](packaging/aur/README.md).
Après publication des sources sur `main` et du paquet sur l'AUR :

```sh
yay -S cubix-git
```

Cette commande nécessite une publication AUR effective ; le PKGBUILD seul dans
ce dépôt ne la rend pas encore disponible.

## Android

```sh
bun run mobile          # lancer dans l'émulateur Android
bun run build:android   # construire mobile/build/cubix-release.apk
```

L'APK release fonctionne sans Metro. Installation, prérequis Android et
validation : [guide mobile](mobile/README.md).

## API

Docker et Docker Compose suffisent pour héberger le serveur :

```sh
docker compose up -d --build
curl --fail http://localhost:3000/api/health
docker compose logs -f api
```

Le service expose `/api/*` et la WebSocket `/api/social/live`.
Les anciennes pages web, les fichiers statiques et `/aaaaadmin` renvoient 404.
L'image ne contient que le serveur Rust ; aucun build JavaScript n'est nécessaire.
Les comptes, temps, sessions, amitiés et messages restent dans le volume `cubix-data`.
`docker compose down` conserve ce volume. `CUBIX_PORT=8080` change le port publié.

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
synchronisation et les fonctions sociales ; les opérations en attente sont conservées
hors ligne et reprises au retour du réseau. Une déconnexion ou une session expirée
ne supprime pas les temps en attente. Les guides et le catalogue sont embarqués.

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
data/           catalogues embarqués
assets/cases/   schémas sources des puzzles
packaging/aur/  PKGBUILD et métadonnées Arch
tests/          tests des clients et de l'API réelle
```

Les écrans restent à la hauteur de la fenêtre ; seules les listes et panneaux
internes défilent. Les explications se trouvent dans les guides accessibles via l'aide.
Les [sources du catalogue et modes de pratique](docs/catalogue.md) sont documentés séparément.
