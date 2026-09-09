# Cubix

Application web de speedcubing du **2×2 au 7×7**, avec Square-1, Pyraminx, Skewb, Megaminx et Clock : algorithmes, entraînement, chronomètre,
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

## Administration

L’interface **`/aaaaadmin`** donne accès au journal HTTP en direct, aux compteurs par IP
et à la liste paginée des utilisateurs (recherche, nombre de temps et de sessions).
Le direct passe par une WebSocket authentifiée sur `/api/admin/live` : les changements sont poussés
au navigateur, regroupés au maximum deux fois par seconde sous charge. Au repos, seul un ping
de maintien de connexion est envoyé toutes les 30 secondes. Les filtres et la pause passent par
la même connexion ; une coupure déclenche une reconnexion automatique avec délai progressif.
L’expiration ou la révocation de la session ferme le flux. Les files de notifications sont bornées
et le serveur accepte au maximum 32 connexions admin simultanées.
Les anciens invités serveur sont séparés des comptes inscrits ; les invités locaux ne sont pas envoyés au serveur.

Créer un fichier `.env` à la racine à partir de `.env.example`, puis définir
`CUBIX_ADMIN_PASSWORD` avec un mot de passe d’au moins 12 caractères. Ce fichier est ignoré par Git
et exclu de l’image Docker. Compose transmet la variable au conteneur ; les lancements Rust directs lisent également `.env`.
Sans mot de passe configuré, les API d’administration sont désactivées.
Après un changement : `docker compose up -d --build`.

La connexion utilise uniquement ce mot de passe. Le jeton admin, indépendant des comptes utilisateurs,
est conservé dans un cookie `HttpOnly`, `SameSite=Strict` (`Secure` en HTTPS), valable **24 heures**.
Il reste valide après un redémarrage ; une déconnexion ou un changement de mot de passe le révoque.
Le serveur stocke uniquement l’empreinte des jetons. Les données admin ne sont pas mises en cache par la PWA.

Les sondes `/api/health` restent soumises aux limites de requêtes mais sont exclues du journal,
des compteurs et des listes IP d’administration.

Le journal conserve les **10 000 dernières requêtes HTTP** en mémoire (routes statiques, API,
erreurs et ouvertures WebSocket incluses) ; l’interface affiche les 200 dernières correspondances aux filtres.
Les corps, paramètres de requête, mots de passe et jetons ne sont pas enregistrés.
Les compteurs repartent à zéro au redémarrage. Le suivi est limité à 20 000 IP ; à saturation,
les IP inactives depuis 15 minutes sont évincées et les nouvelles IP restantes sont bloquées.

### Rate limiting

- Général : **600 requêtes/minute/IP**, configurable avec `CUBIX_RATE_LIMIT` dans `.env`.
- Connexion, inscription et ancien accès invité : **20 tentatives/minute/IP**.
- Connexion admin : **5 tentatives/15 minutes/IP**.
- WebSocket : **120 messages/minute/IP**, avec le plafond existant sur les messages de chat.

Les limites HTTP utilisent des seaux à jetons et renvoient `429` avec `Retry-After`.
Elles s’appliquent également aux IP locales. Le test de charge doit définir explicitement une valeur
`CUBIX_RATE_LIMIT` adaptée s’il veut mesurer la capacité brute plutôt que le limiteur.

Par défaut, l’IP vient de la connexion TCP : `X-Forwarded-For` est ignoré.
Derrière un reverse proxy, définir `CUBIX_TRUSTED_PROXIES` avec ses **IP exactes**, séparées par des virgules.
Le serveur parcourt alors la chaîne de droite à gauche jusqu’au premier intermédiaire non approuvé.

## Stockage local et mode hors ligne

Les sessions, temps et pénalités sont d’abord enregistrés dans le **localStorage du navigateur**.
Sans compte connecté, aucune session invitée n’est créée sur le serveur et aucun temps ne lui est envoyé.
Le catalogue complet et les calculs de statistiques sont intégrés au frontend.

Après un premier chargement en ligne, le service worker conserve l’interface, le catalogue,
les fontes, les icônes et les générateurs cubing.js locaux : l’application peut être fermée puis rouverte sans réseau.
Ce fonctionnement est disponible dans un onglet normal, sans installer la PWA.
À l’ouverture ou au rechargement, la page est demandée au serveur en priorité ; le cache prend
le relais en cas de panne, d’absence de réseau ou après 4 secondes sans réponse. L’administration
reste exclusivement en réseau. Une mise à jour du service worker ne recharge pas les sessions d’entraînement ouvertes.
Cette installation hors ligne nécessite **HTTPS**, ou `http://localhost` pour un usage local.
Le serveur de développement Bun utilise le HMR ; le cache hors ligne est activé sur le build de production.

Pour un compte connecté, les modifications sont conservées dans une file persistante liée à ce compte,
puis envoyées à l’API Rust dès qu’elle répond. La synchronisation reprend au retour du réseau,
à la réouverture de l’application, au retour sur l’onglet, et toutes les 30 secondes pendant son ouverture.
Elle ne dépend pas d’une connexion permanente. Un message avec une action apparaît uniquement si une intervention est nécessaire.
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

## Puzzle, mélange et mode de résolution

Le sélecteur **2×2 à 7×7 / Square-1 / Pyraminx / Skewb / Megaminx / Clock** dans la barre de navigation
ouvre un popover avec une icône SVG par puzzle et fixe le puzzle pour toute l’application.
Le mode **Standard / One-handed / Blindfolded** se règle avec les boutons du Playground.
Catalogue, entraînement, mélanges, temps et progression
des profils suivent ce choix. Il est mémorisé à la réouverture. Chaque cube conserve sa sélection
de cas, son dernier mélange et ses préférences de catalogue. Le changement est verrouillé pendant
l’armement, le chronométrage et l’enregistrement d’un temps.

- **2×2** : Ortega OLL (7 cas) et PBL (5 cas).
- **3×3** : catalogue CFOP existant (228 cas).
- **4×4 à 7×7** : exercices de centres, appariement des arêtes et parités par profondeur,
  puis les 228 cas CFOP adaptés à la résolution après réduction. Les exercices de centres
  et d’arêtes couvrent des séquences utiles ; la construction intuitive n’est pas un catalogue exhaustif.
  Les cubes pairs ont aussi les parités OLL et PLL après réduction.

Le type **Random moves** utilise 11, 22, 40, 60, 80 et 100 mouvements selon la taille,
avec des mouvements larges jusqu’à la moitié du cube et sans deux axes consécutifs identiques.
Ce sont des mélanges par mouvements aléatoires, pas des mélanges officiels WCA à état aléatoire.
Les rendus interactifs utilisent **Three.js / WebGL 2** pour les onze puzzles.
Les cubes sont composés de pièces et de stickers ; Square-1 et Clock ont leurs modèles dédiés,
et les géométries de Pyraminx, Skewb et Megaminx viennent de cubing.js. Les scènes ne redessinent
que lors des mouvements, rotations et redimensionnements, puis libèrent leurs ressources à la fermeture.
Les vignettes de catalogue restent des SVG légers.
Les aperçus et animations représentent la vraie taille du cube, y compris les tranches internes
(`2R`, `3R`) et mouvements larges (`Rw`, `3Rw`). En résolution après réduction, un mouvement
large du 3×3 devient un bloc de N−1 couches (`3Rw` sur 4×4, par exemple).

Le Playground propose les types compatibles avec le puzzle : mélanges d’épreuve via cubing.js,
2-gen (RU, LU, RF, MU), 3-gen (RUL, RUF), demi-tours, arêtes seules, coins seuls,
dernière couche, cas OLL/PLL/F2L et couches extérieures des grands cubes.
Les cas sont tirés du catalogue ; les générateurs restreints par mouvements ne prétendent pas
échantillonner uniformément tous les états. **Event scramble** sert à l’entraînement personnel ;
les compétitions officielles utilisent leurs propres mélanges. Square-1, Pyraminx, Skewb,
Megaminx et Clock ont également leur catalogue, animations et entraînement : **99 cas dans 18 groupes**.

- **Square-1** : 29 cas de forme cubique, orientation et permutation des coins/arêtes, parité et tranche centrale.
- **Pyraminx** : 11 cas de pointes, insertions et dernière couche.
- **Skewb** : 7 cas de coins et cycles de centres pour la méthode débutante.
- **Megaminx** : 34 exercices de paires et cas d’orientation/permutation de dernière couche.
- **Clock** : 18 exercices de groupes de cadrans, face arrière et alignement complet.

Ces catalogues couvrent des méthodes débutantes et intermédiaires ainsi que des exercices ciblés ;
ils ne recensent pas toutes les variantes avancées. Chaque cas a un setup, une solution et un schéma.
Les AUF aléatoires restent réservés aux cubes NxN. Sur Clock, les séquences servent à travailler
les groupes de cadrans ; une résolution libre demande d’adapter les rotations à leur état.

En blindfolded, le temps enregistré inclut mémorisation et exécution, sans chronos séparés.

Chaque session et chaque temps enregistrent **`puzzle_id`, `solve_mode`, `scramble_type`**
en local et dans SQLite. `cube_size` reste disponible pour les cubes et vaut `null` pour les autres puzzles.
Ces labels suivent les données lors de la synchronisation, de l’import invité et du partage.
L’historique et les moyennes du Playground sont isolés par ces trois dimensions ; les profils
permettent de filtrer le type de mélange, et les statistiques de cas sont séparées par mode de résolution.
La migration conserve les anciennes données : puzzle déduit de `cube_size` (3×3 sinon),
mode `standard`, type `random-moves` pour le Playground ou `case` pour l’entraînement.

Les API acceptent `puzzle`, `solveMode` et `scrambleType` dans les filtres et les créations.
Par exemple : `?puzzle=333&solveMode=one-handed&scrambleType=2gen-ru`.
Un temps hérite du contexte de sa session et les contextes incompatibles sont rejetés.
Le paramètre historique `cubeSize` reste accepté. Les identifiants et compatibilités sont définis
dans `data/puzzles.json`, partagé avec Rust.
Le build distribue cubing.js et ses workers sous `/vendor/cubing/`, sans dépendre d’un CDN.

`bun scripts/build-cube-catalog.ts` reconstruit `data/multi-cube.json`, partagé par le frontend
et le serveur Rust. Les sources des nouveaux algorithmes sont conservées avec chaque cas :
[J Perm Ortega](https://www.jperm.net/algs/2x2/oll), [PBL](https://www.jperm.net/algs/2x2/pbl),
[4×4](https://www.jperm.net/4x4) et [SpeedCubeDB L2E](https://www.speedcubedb.com/a/5x5/L2E).
Les commutateurs de centres sont des exercices Cubix ; les tests vérifient les pièces affectées,
les setups inverses, les AUF et l’équivalence de chaque algorithme CFOP après réduction.

`bun scripts/build-niche-catalog.ts` reconstruit `data/niche-catalog.json` et les schémas dans `public/cases`.
Sources : [Jaap](https://www.jaapsch.net/puzzles/), [CubeZone](https://www.cubezone.be/square1.html),
[Speedcube](https://www.speedcube.com.au/blogs/pyraminx-beginner), [Sarah Strong](https://sarah.cubing.net/skewb/my-method),
[Cubing World](https://www.youtube.com/watch?v=Fyl7-RgkfCs) et
[CubeSkills](https://www.cubeskills.com/uploads/pdf/tutorials/intermediate-megaminx-techniques.pdf).
Les tests vérifient les inverses, les pièces préservées et la légalité des coupes Square-1.

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
  Le défilement est mémorisé par puzzle, catalogue, cas et panneau, y compris après un rechargement dans le même onglet.

Maintenir **Espace** 300 ms, relâcher pour démarrer, puis appuyer sur **n’importe quelle touche**
pour arrêter. Sur écran tactile, maintenir le timer ou une zone libre, relâcher, puis toucher pour arrêter.
Les boutons, menus, modèles 3D et gestes de défilement restent utilisables sans déclencher le timer.

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
