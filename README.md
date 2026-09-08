# Cubix

Application web de speedcubing : catalogue F2L / OLL / PLL, entraînement, chronomètre,
statistiques et messagerie entre cubeurs.

**Serveur Rust** (Axum, Tokio, SQLite) · **React 19**, Jotai et Motion dans le navigateur.
Le frontend est compilé avec `bun build` ; les tests TypeScript utilisent `bun test`.
Le conteneur final exécute uniquement le serveur Rust, qui sert aussi l’interface compilée.

## Démarrer

Seuls **Docker et Docker Compose** sont nécessaires sur la machine.

```sh
git clone https://github.com/Vitrixxl/cubix.git
cd cubix
docker compose up
```

Ouvrir **http://localhost:3000**. Le premier démarrage construit automatiquement le frontend
et le binaire Rust en mode release. La base SQLite et ses migrations sont créées au démarrage.
Aucun compte externe, clé API, fichier `.env` ou installation locale de Bun/Node/Rust n’est nécessaire.

```sh
docker compose up -d           # en arrière-plan
docker compose logs -f api     # journaux
docker compose down           # arrêter, en conservant les données
docker compose up --build     # reconstruire après une mise à jour
```

Pour changer le port : `CUBIX_PORT=8080 docker compose up`.
Les comptes, temps, sessions, amitiés et messages sont conservés dans le volume `cubix-data`.
Le service expose le frontend, `/api` et la WebSocket `/api/social/live` sur le même port.
Les utilisateurs doivent ouvrir le même serveur pour retrouver les mêmes comptes et discuter.

## Stockage local et mode hors ligne

Les sessions, temps et pénalités sont d’abord enregistrés dans le **localStorage du navigateur**.
Sans compte connecté, aucune session invitée n’est créée sur le serveur et aucun temps ne lui est envoyé.
Le catalogue complet et les calculs de statistiques sont intégrés au frontend.

Après un premier chargement en ligne, le service worker conserve l’interface, le catalogue,
les fontes et les icônes : l’application peut être fermée puis rouverte sans réseau.
Cette installation hors ligne nécessite **HTTPS**, ou `http://localhost` pour un usage local.
Le serveur de développement Bun utilise le HMR ; le cache hors ligne est activé sur le build de production.

Pour un compte connecté, les modifications sont conservées dans une file persistante liée à ce compte,
puis envoyées à l’API Rust dès qu’elle répond. La synchronisation reprend au retour du réseau,
à la réouverture de l’application, au retour sur l’onglet, et toutes les 30 secondes pendant son ouverture.
Elle ne dépend pas d’une connexion permanente. Un clic sur l’état en bas relance les envois.
Si l’application est fermée, les éléments en attente restent sur l’appareil et repartent à sa prochaine ouverture.

- La connexion ou l’inscription importe les temps locaux dans le compte, sans duplication.
- Une déconnexion conserve les données en attente dans l’espace de leur compte ; elles ne sont jamais envoyées à un autre compte.
- Une session expirée conserve l’historique et les nouveaux temps localement ; se reconnecter reprend la synchronisation.
- Les dates originales sont conservées. Les envois rejoués après une réponse perdue sont dédupliqués côté Rust.
- Les suppressions se propagent entre appareils et priment sur les modifications tardives d’un temps supprimé.
- Les conversations déjà chargées sont lisibles hors ligne. Les nouveaux messages et temps partagés attendent dans la file d’envoi.
  L’inscription, la connexion et les actions d’amitié nécessitent le serveur ; les données sociales non encore chargées nécessitent aussi le réseau.
- Les anciens temps invités stockés sur le serveur sont récupérés localement lors de la migration.
- Si le stockage du navigateur est plein, le timer affiche l’échec et permet de réessayer l’enregistrement du temps.

Le volume Docker conserve la copie synchronisée. Les données encore exclusivement locales sont propres
au navigateur et à l’origine du site ; effacer les données du site les supprime.
Les thèmes et préférences d’interface restent propres à l’appareil.

## Fonctionnalités

- **Catalogue** : tous les cas F2L, F2L Advanced, F2L Expert, OLL, PLL et variantes 2-Look,
  avec cubes, setups, algorithmes, sources et lecture des mouvements.
- **Entraînement** : sélection de plusieurs cas, AUF aléatoire, solution masquable,
  précédent/suivant, historique et statistiques par cas. Les groupes peuvent être repliés.
- **Chronomètre libre** : scrambles, pénalités +2/DNF, moyennes WCA, suppression et partage
  d’un temps par clic droit ou appui long sur mobile.
- **Profils** : entraînement local sans compte, import des temps lors de la connexion,
  pseudonyme unique, bio, recherche de membres et progression. Les cas non entraînés sont grisés.
- **Messagerie** : demandes d’amitié, conversations privées entre amis, mises à jour en temps réel,
  pagination et partage d’une copie d’un temps conservée même si le temps original est supprimé.
- **Interface** : navigation en bas, écran principal sans défilement, disposition responsive,
  six palettes avec modes clair/sombre et réglage pour désactiver les animations.

Maintenir **Espace** 300 ms, relâcher pour démarrer, puis appuyer sur **n’importe quelle touche**
pour arrêter. Sur écran tactile, maintenir le timer, relâcher, puis toucher pour arrêter.

| Raccourci | Action |
| --- | --- |
| Alt + 1–5 | Catalogue, entraînement, timer libre, messages, communauté |
| Alt + 6 / 7 / 8 | Thèmes / compte / mode clair-sombre |
| Alt + N / P | Cas suivant / précédent en entraînement |
| Alt + C / T | Sélection des cas / temps de la session |
| Alt + H / A | Masquer la solution / AUF aléatoire |
| Échap | Fermer le panneau courant |

Les raccourcis sont ignorés pendant la saisie de texte et pendant le chronométrage.

## Architecture

```text
rust-api/          API Rust, authentification, statistiques, WebSockets et migrations SQLite
src/frontend/      interface React et client HTTP/WebSocket natif
src/shared/        contrats TypeScript et modèle du cube
data/              catalogue des algorithmes inclus dans le binaire Rust
public/pwa/        manifeste et icônes
scripts/           outils de développement, vérification du cube et stress test
tests/             tests du frontend et tests HTTP/WebSocket contre le vrai serveur Rust
Dockerfile         construction frontend + API, image finale Rust
compose.yaml       application complète et volume persistant
```

SQLite utilise WAL et vérifie les clés étrangères. Un thread dédié traite les requêtes SQL
via une file bornée. Les connexions WebSocket utilisent des notifications indexées par utilisateur.
Les mots de passe sont hachés avec Argon2id ; seuls les condensats SHA-256 des tokens sont stockés.
Les requêtes de sessions et de temps vérifient systématiquement leur propriétaire.

## Développement et tests

Pour travailler sans Docker : Bun **1.4+**, Node.js **24+** (scripts de catalogue / stress test) et Rust **1.98+**.

```sh
bun install --frozen-lockfile
bun run dev           # API Rust :47129 et frontend Bun avec HMR :5180
bun run build         # frontend dans dist/view
bun run build:api     # binaire Rust release
bun run start         # sert le frontend construit et l’API sur :47129
bun run typecheck
bun run test          # tests API/WS, frontend, cube et tests Rust
```

`bun run dev` reconstruit l’API à son lancement ; relancer cette commande après une modification Rust.
L’interface se recharge automatiquement pendant les modifications React/CSS.

Le serveur accepte `--host`, `--port`, `--version`, `--init-db` et `--import-history <username>`.
`CUBIX_DB` choisit le fichier SQLite. Hors Docker, le chemin par défaut est
`~/.local/share/cubix/cubix.db` (ou sous `XDG_DATA_HOME`).
`CUBIX_ASSETS` et `CUBIX_PWA` permettent de déplacer les fichiers statiques.

Les anciennes données sans compte sont conservées, mais ne sont pas attribuées au premier
visiteur. Pour les associer explicitement à un compte déjà créé :

```sh
docker compose exec api cubix-api --import-history votre_pseudo
# Installation locale :
bun run import:history -- votre_pseudo
```

L’import est transactionnel et peut être répété sans dupliquer les temps.

## Stress test

```sh
bun run build:api
bun run stress
```

Le script crée une base temporaire avec des comptes fictifs et lance sa propre instance Rust.
Il mesure les connexions authentifiées, débit, latences, erreurs, CPU et RAM du serveur.
Les résultats vont dans `artifacts/` et ne sont pas publiés dans le dépôt.
Le scénario par défaut utilise 4 500 comptes, 225 000 temps et plusieurs paliers de charge.
Voir [les détails du serveur et du benchmark](rust-api/README.md).

## Sources du catalogue

| Source | Utilisation |
| --- | --- |
| [SpeedCubeDB](https://speedcubedb.com/a/3x3/) | Algorithmes, setups, votes et vidéos |
| [J Perm](https://jperm.net/algs/) | Recommandations et groupes OLL/PLL |
| [F2LTrainer](https://github.com/Dave2ooo/F2LTrainer) | Cas F2L standard, avancés et experts |
| [andyjudson/cfop](https://github.com/andyjudson/cfop) | Noms et probabilités |
| [cubing.js](https://js.cubing.net/cubing/) | Vérification et génération des setups |

La croix est en bas (blanc), la dernière face est jaune et la face avant est verte.
Les cas F2L visent le slot avant-droit. Les sources brutes sont conservées dans `data/raw` ;
`bun run build:db` reconstruit et vérifie le catalogue.
Les fontes Geist sont distribuées avec leur licence dans `src/frontend/fonts`.
