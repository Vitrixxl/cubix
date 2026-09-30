# Serveur Rust

Axum 0.8, Tokio, rusqlite et SQLite. Le binaire sert les API HTTP et WebSocket et, quand elle est construite (`CUBIX_WEB_DIR`, sinon `dist/web`), l'application web.
Voir le [README principal](../README.md) pour le démarrage avec `docker compose up`.

## Construction

```sh
bun run build:api
./rust-api/target/release/cubix-api --port 3000
```

Le catalogue est inclus dans le binaire, qui peut être lancé depuis tout répertoire. La base locale est choisie par `CUBIX_DB` ; son initialisation et ses migrations
sont automatiques. `--init-db` effectue seulement cette initialisation.

## Concurrence

- Quatre workers réseau Tokio et un thread SQLite propriétaire de la connexion.
- File SQL bornée à 1 024 jobs ; les jobs annulés sont ignorés avant exécution.
- Argon2id v19, mémoire 64 Mio, deux passes, une lane. Quatre opérations de mots de passe
  simultanées maximum, puis HTTP 429 pour éviter une croissance mémoire incontrôlée.
- Tokens aléatoires de 256 bits, condensats SHA-256 en base, expiration après 30 jours.
  La conversion d’un invité invalide ses anciens tokens de manière atomique.
- Notifications WebSocket `/api/live` indexées par utilisateur, avec un drapeau `sync` fusionné par socket.
  Authentification dans les cinq secondes, heartbeat/message valide toutes les 60 secondes.
  Le token est vérifié sur les messages entrants et avant les notifications sortantes.
- Trames/messages limités à 16 Kio ; tampon de lecture de 4 Kio par WebSocket.
- `CUBIX_EXTRA_PORTS=5200,5201` ajoute des listeners pour les tests locaux, tous dans le
  **même processus** avec la même base et les mêmes workers.

## Tests

```sh
bun run test:api
sh scripts/rust.sh test --locked
sh scripts/rust.sh clippy -- -D warnings
```

Les tests HTTP/WebSocket démarrent de vrais binaires Rust et des bases temporaires.
Ils couvrent les permissions, migrations, statistiques, tokens, pagination,
conservation des données et conversions concurrentes d’un invité.

## Benchmark

`bun run stress` utilise des générateurs Node.js pour envoyer des requêtes HTTP et maintenir
des WebSockets authentifiées. Il crée sa propre base de comptes fictifs ; il ne touche jamais
à la base normale de l’application. Les ports loopback doivent être libres.

| Variable | Valeur par défaut | Fonction |
| --- | --- | --- |
| `CUBIX_STRESS_OUT` | nouveau répertoire sous artifacts | Base et résultats |
| `CUBIX_STRESS_USERS` | 4500 | Nombre pair de comptes fictifs |
| `CUBIX_STRESS_SOLVES` | 50 | Temps initiaux par compte |
| `CUBIX_STRESS_WORKERS` | 4 | Processus clients |
| `CUBIX_STRESS_SECONDS` | 25 | Durée de chaque palier |
| `CUBIX_STRESS_STAGES` | montée intégrée | Paires JSON `[connexions, requêtes simultanées]` |
| `CUBIX_STRESS_PORT` | 5199 | Premier port du serveur |
| `CUBIX_STRESS_PORTS` | premier port | Liste de ports séparés par des virgules |
| `CUBIX_STRESS_TIMEOUT_MS` | 10000 | Timeout HTTP |
| `CUBIX_STRESS_MAX_RSS_MB` | 2000 | Plafond RAM du serveur de test |
| `CUBIX_STRESS_CONTINUE_ON_HTTP_ERRORS` | absent | `1` continue après saturation HTTP |

Les sorties comprennent `results.json`, `memory.csv` et `server.log`. Pour un rapport :

```sh
python3 scripts/stress-report.py artifacts/<répertoire-du-test>
```

Pour des dizaines de milliers de connexions, relever la limite des descripteurs du serveur
**et des générateurs**. Plusieurs ports loopback évitent de saturer une seule plage de ports TCP
clients. Le fichier Compose configure déjà une limite de 262 144 descripteurs pour le serveur.

Les générateurs ne sont pas des navigateurs. Le hachage des mots de passe n’entre pas dans
la mesure du débit ; les tokens préparés sont réellement vérifiés par l’API. Chaque requête
s’exécute contre SQLite, les historiques grossissent pendant le test, et les messages sont
persistés. Le rapport distingue connexions, utilisateurs HTTP actifs, concurrence, timeouts,
RAM du serveur et RAM des générateurs. Un timeout ne prouve pas l’annulation d’une écriture.
Un test de quelques minutes ne permet pas de conclure sur une fuite mémoire à long terme.

## Synchronisation locale

`GET /api/sync?after=<curseur>` renvoie au plus 500 changements appartenant à l’utilisateur authentifié.
Les triggers SQLite enregistrent également les modifications provenant des routes historiques.
Le journal conserve la dernière révision de chaque session, temps et marque d’apprentissage
(`learned_cases`, `PUT /api/learned` avec `{caseId, learned}` ; `GET /api/learned` liste les cas appris)
ainsi que les suppressions.

Chaque écriture réussie (routes historiques ou `POST /api/sync`) envoie `{"type":"sync","cursor":N}` sur les
WebSockets `/api/live` du même compte, où `N` est le dernier numéro du journal. Un appareil dont le curseur
local est inférieur tire immédiatement les changements ; le message `ready` porte aussi ce curseur pour rattraper
une reconnexion. Le signal est fusionné par socket : une rafale d’écritures produit au plus un message.

`POST /api/sync` applique une liste de 1 à 100 opérations dans une transaction, pour un compte enregistré.
Chaque opération possède un identifiant stable, une méthode, un chemin autorisé et un corps ; les créations
incluent leur date originale ISO. Une réception répétée renvoie le résultat déjà enregistré ; réutiliser
l’identifiant avec un contenu différent échoue. Les contrôles d’appartenance des routes habituelles restent appliqués.

## Release mobile

`GET /api/mobile/release` renvoie `{version, build, commit, apk, apkBuild, apkCommit, apkSha256,
apkSize, apkUploadedAt}` : la version Cargo, le build et le commit du serveur, le chemin de
téléchargement et la description de l’APK stocké (`null` tant qu’aucun n’a été envoyé).
`GET /api/mobile/apk` sert l’APK (404 sans APK). `PUT /api/mobile/apk` avec
`Authorization: Bearer <CUBIX_ADMIN_PASSWORD>` (ce mot de passe ne sert qu’aux envois mobiles),
`X-Cubix-Build` et `X-Cubix-Commit` remplace
l’APK de façon atomique (256 Mio maximum, le corps doit être une archive ZIP). Le fichier et
ses métadonnées vivent dans `CUBIX_APK_DIR`, par défaut le dossier `apk` à côté de la base,
donc dans le volume Docker. `scripts/deploy.ts` compile l’APK sur la machine de développement
et l’envoie après `pihost update cubix`.

Le numéro de build est la date du commit en minutes, lue dans `CUBIX_BUILD_NUMBER` ;
`CUBIX_COMMIT` porte le SHA. Le `Dockerfile` les calcule depuis `.git` (un clone
superficiel suffit) et les écrit dans `/app/.env`, chargé au démarrage. Sans ces variables,
`build` et `commit` valent `null` et l’application mobile ne propose jamais de mise à jour.

## Administration

Accès : `cubix-api admin-token` (ou `--admin-token`) génère un jeton `cbx_admin_` + 64 caractères
hexadécimaux, n’en stocke que le SHA-256 dans `admin_access` et l’affiche une fois ; le relancer
le remplace et ferme toutes les sessions admin, `--revoke` désactive l’administration. La
commande partage la base SQLite (WAL) et fonctionne serveur en marche. `POST /api/admin/login`
prend `{"token"}` (comparaison en temps constant, 5 essais / 15 min / IP, échecs journalisés
comme importants) et pose le cookie `cubix_admin` (HttpOnly, SameSite=Strict, un jour). Sans
jeton, les routes admin répondent 503.

Toutes les routes exigent ce cookie, répondent `cache-control: no-store`, et les écritures
vérifient l’origine. Dates en millisecondes depuis l’epoch, jours UTC `YYYY-MM-DD`,
pagination `page` (depuis 0) et `limit` (1–200, 50 par défaut) :

- `GET /api/admin/overview` : comptes (total, inscrits, invités, nouveaux et actifs aujourd’hui /
  7 j / 30 j), solves, requêtes et erreurs du jour, IP distinctes, duels, séries sur 30 jours,
  informations serveur (uptime, version, taille de la base, rétention du journal).
- `GET /api/admin/requests` : journal persistant, filtres `important`, `kind`, `status` (`5xx`,
  `4xx`, `error` ou code), `method`, `ip`, `path`, `user`, `from`, `to`, curseur `before`.
- `GET /api/admin/ips` : IP sur `days` jours (1–90) avec requêtes, erreurs, 429, premières et
  dernières visites et comptes vus ; tri `sort`/`order`, filtres `q` et `user`.
- `GET /api/admin/users` : `q`, `filter` (`all`, `registered`, `guests`), `sort` (`created`,
  `lastSeen`, `solves`, `username`) ; `GET /api/admin/users/{id}` : détail (solves par puzzle,
  activité sur 90 jours, derniers solves et requêtes, sessions sans jeton, duels, IP).
- `POST /api/admin/users/{id}/revoke` déconnecte le compte partout ;
  `DELETE /api/admin/users/{id}` supprime le compte et ses données en une transaction.
- `/api/admin/live` pousse l’instantané du tableau de bord et chaque nouvelle requête importante
  (`{"type":"important","data":…}`).

Le journal est écrit par lots en arrière-plan (jamais sur le chemin de la requête) et vidé à
l’arrêt (SIGTERM). Rétention : 30 jours, 200 000 lignes ordinaires et 50 000 importantes ;
agrégats quotidiens par IP 90 jours, activité quotidienne des comptes 400 jours ;
`last_seen_at` au plus une écriture par minute et par compte.
