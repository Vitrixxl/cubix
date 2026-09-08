# Serveur Rust

Axum 0.8, Tokio, rusqlite et SQLite. Le binaire sert l’API complète et le frontend statique.
Voir le [README principal](../README.md) pour le démarrage avec `docker compose up`.

## Construction

```sh
npm run build:api
./rust-api/target/release/cubix-api --port 3000
```

Le binaire doit être lancé depuis la racine du projet, ou avec `CUBIX_ASSETS` et `CUBIX_PWA`
configurés. La base locale est choisie par `CUBIX_DB` ; son initialisation et ses migrations
sont automatiques. `--init-db` effectue seulement cette initialisation.

## Concurrence

- Quatre workers réseau Tokio et un thread SQLite propriétaire de la connexion.
- File SQL bornée à 1 024 jobs ; les jobs annulés sont ignorés avant exécution.
- Argon2id v19, mémoire 64 Mio, deux passes, une lane. Quatre opérations de mots de passe
  simultanées maximum, puis HTTP 429 pour éviter une croissance mémoire incontrôlée.
- Tokens aléatoires de 256 bits, condensats SHA-256 en base, expiration après 30 jours.
  La conversion d’un invité invalide ses anciens tokens de manière atomique.
- Notifications WebSocket indexées par utilisateur, avec une file d’invalidation d’une place.
  Authentification dans les cinq secondes, heartbeat/message valide toutes les 60 secondes.
  Le token est vérifié sur les messages entrants et avant les notifications sortantes.
- Trames/messages limités à 16 Kio ; tampon de lecture de 4 Kio par WebSocket.
- `CUBIX_EXTRA_PORTS=5200,5201` ajoute des listeners pour les tests locaux, tous dans le
  **même processus** avec la même base et les mêmes workers.

## Tests

```sh
npm run test:api
sh scripts/rust.sh test --locked
sh scripts/rust.sh clippy -- -D warnings
```

Les tests HTTP/WebSocket démarrent de vrais binaires Rust et des bases temporaires.
Ils couvrent les permissions, migrations, statistiques, tokens, messages, pagination,
conservation des données et conversions concurrentes d’un invité.

## Benchmark

`npm run stress` utilise des générateurs Node.js pour envoyer des requêtes HTTP et maintenir
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
