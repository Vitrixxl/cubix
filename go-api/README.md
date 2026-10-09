# Serveur (go-api)

Go, `net/http` et SQLite (`mattn/go-sqlite3`, cgo). Le binaire `cubix-api` sert les API HTTP et
WebSocket et, quand elle est construite (`CUBIX_WEB_DIR`, sinon `dist/web`), l’application web.
Voir le [README principal](../README.md) pour `docker compose up` et `bun run dev:docker`.

## Construire et lancer

```sh
bun run build:api             # = sh go-api/build.sh → go-api/cubix-api
go-api/build.sh -tags seed    # avec la commande `cubix-api seed` (images de dev uniquement)
go-api/cubix-api --port 3000  # ou `bun run start` (port 47129 par défaut)
```

`go:embed` ne sort pas du module : `build.sh` copie `data/{catalog,puzzles,method-ids}.json` dans
`embed/` (ignoré par git) ; `schema.sql` et `query-indexes.sql` sont embarqués depuis `go-api/`.
Lancer `build.sh` une fois avant `go vet` ou `go test`. Il ajoute toujours le tag `sqlite_stat4`.

Le binaire se lance depuis tout répertoire. La base est choisie par `CUBIX_DB` ; initialisation et
migrations sont automatiques (`--init-db` ne fait que cela). Autres commandes : `--version`,
`--host`, `--port`, `admin-token [--revoke]` (ou `--admin-token`), `seed`, `--import-history <user>`.
Un `.env` du répertoire courant ou de ses parents est chargé au démarrage, sans écraser l’environnement.

L’image de production est le `Dockerfile` racine : binaire statique (musl, SQLite liée),
`GO_TAGS=seed` pour l’image de dev (`compose.dev.yaml`).

## Tests

```sh
bun run test:api                                                     # vrais binaires, bases temporaires
cd go-api && go vet -tags seed ./... && go test -tags "sqlite_stat4 seed" ./...
```

Les tests `tests/*.test.ts` lancent `go-api/cubix-api` (`CUBIX_API_BIN` pour un autre binaire).
`bun run stress` mesure le serveur sous charge (variables `CUBIX_STRESS_*` dans `scripts/stress-api.ts`,
rapport par `python3 scripts/stress-report.py artifacts/<test>`).

## Conventions

- Un seul `package main`, un fichier par domaine (`api.go`, `social.go`, `coaching.go`…).
- Noms préfixés par leur fichier : `socialMember`, `SocialCard` ; un type qui porte déjà le nom du
  domaine le garde (`Admin`, `Traffic`, `Catalog`, `Db`, `ApiError`). Constructeurs `newType`.
- Commentaires en anglais, qui expliquent le *pourquoi*.
- JSON : `type M = map[string]any`. Corps lus par `decodeJSON` (nombres en `json.Number`), écrits par
  `encodeJSON`/`writeJSON` (sans échappement HTML). Accès : `get`, `idx`, `asStr`, `str`, `asInt`
  (refuse 1.5 et 1.0), `asUint`, `asFloat`, `asBool`, `asArray`, `asObject`, `eqStr`, `eqInt`,
  `jsonEqual`, `contains` (`value.go`). Lignes SQLite : `int64`, `float64`, `string`, `nil`.
- Valeur facultative : pointeur (`*string`, `*float64`) ou, pour un id, valeur zéro (`0`, `""`).
- Erreurs : `*ApiError{Status, Message}` ; `apiErr`, `internal(err)` (journalise, 500),
  `validation()` (422). Toute autre `error` devient `internal` à la réponse (`toApiError`).
  Jamais un `*ApiError` nil typé dans une `error`. Les messages sont traduits par le client :
  `bun scripts/i18n-extract.ts` les relève (`apiErr(…, "…")` et constantes `const x = "…"`).
- Base : une connexion, un appel à la fois : `state.db.Call(func(db *Conn) error)` ou
  `dbCall(state.db, func(db *Conn) (T, error))`. Sur `*Conn` : `Exec`, `ExecBatch`,
  `LastInsertRowid`, `Begin` → `*Tx` (`defer tx.Rollback()`, `tx.Commit()`). Aides : `dbAll`,
  `dbOne` (nil si rien), `dbRequired(db, sql, message404, params...)`, `hasColumn`, `addColumnIfMissing`.
- Handlers HTTP : `func(state *AppState, w http.ResponseWriter, r *http.Request)`, `r.PathValue`,
  `readBody(w, r)` (limite de la route, 413), `writeResult(w, value, err)`, `setActor` pour le
  journal d’activité.

## Administration

`cubix-api admin-token` génère un jeton `cbx_admin_` + 64 caractères hexadécimaux, n’en stocke que
le SHA-256 dans `admin_access` et l’affiche une fois ; le relancer le remplace et ferme toutes les
sessions admin, `--revoke` désactive l’administration. La commande fonctionne serveur en marche
(WAL). `POST /api/admin/login` prend `{"token"}` (5 essais / 15 min / IP) et pose le cookie
`cubix_admin` (HttpOnly, SameSite=Strict, un jour). Sans jeton, les routes admin répondent 503.

Les routes `/api/admin/*` (vue d’ensemble, journal des requêtes, IP, comptes, révocation et
suppression d’un compte, socket `/api/admin/live`) exigent ce cookie, répondent `no-store`, et
les écritures vérifient l’origine. Le journal est écrit par lots en arrière-plan et vidé à l’arrêt
(SIGTERM). Rétention : 30 jours, 200 000 lignes ordinaires et 50 000 importantes ; agrégats par IP
90 jours, activité quotidienne des comptes 400 jours (`activity.go`).

`CUBIX_ADMIN_PASSWORD` sert uniquement aux envois de l’APK et des mises à jour mobiles
(`PUT /api/mobile/apk`, `Authorization: Bearer …`). Le numéro de build (`CUBIX_BUILD_NUMBER`, date
du commit en minutes) et `CUBIX_COMMIT` viennent de `/app/.env`, écrit par le `Dockerfile`.
