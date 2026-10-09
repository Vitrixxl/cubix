# cubix-api en Go

Portage de `rust-api/` : mêmes routes, codes, JSON, messages d’erreur, protocoles WebSocket, options
(`--version`, `--host`, `--port`, `--init-db`, `admin-token [--revoke]`, `--admin-token`, `seed`,
`--import-history <user>`), variables d’environnement et base SQLite (les deux binaires ouvrent la base
de l’autre).

## Construire

```sh
go-api/build.sh               # copie les fichiers embarqués dans go-api/embed/ puis produit go-api/cubix-api
go-api/build.sh -tags seed    # avec la commande `cubix-api seed` (images de dev uniquement)
```

`go:embed` ne sort pas du module : `build.sh` copie `data/{catalog,puzzles,method-ids}.json` et
`rust-api/src/{schema,query-indexes}.sql` dans `embed/` (ignoré par git). Lancer `build.sh` une fois
avant `go vet` ou `go build`. Tests : `CUBIX_API_BIN=$PWD/go-api/cubix-api bun test …`.

Dépendances : `mattn/go-sqlite3` (cgo, vraie SQLite), `gorilla/websocket`, `x/crypto/argon2`.
Pas de framework : `net/http` et son `ServeMux`.

## Conventions

- Un seul `package main`, un fichier par module Rust, même nom (`api.go`, `social.go`…).
  `value.go` regroupe ce que serde_json faisait (aucun module Rust).
- Noms : `social::member` → `socialMember` ; `social::Card` → `SocialCard` ; un type qui porte déjà
  le nom du module le garde (`Admin`, `Traffic`, `Catalog`, `Db`, `ApiError`). `Type::new` → `newType`.
  Méthodes en lowerCamel (`hub.notifySync`).
- Commentaires : ceux du Rust qui expliquent le *pourquoi*, traduits fidèlement (en anglais).
- JSON : `type M = map[string]any`. Corps lus par `decodeJSON` (nombres en `json.Number`), écrits par
  `encodeJSON`/`writeJSON` (sans échappement HTML). Accès façon serde : `get`, `idx` (= `value[key]`),
  `asStr`, `str`, `asInt` (= `as_i64`, refuse 1.5 et 1.0), `asUint`, `asFloat`, `asBool`, `asArray`,
  `asObject`, `eqStr`, `eqInt`, `jsonEqual`, `contains`. Les lignes SQLite : `int64`, `float64`,
  `string`, `nil` (les blobs sont `nil`).
- `Option<T>` : pointeur (`*string`, `*float64`) ou, pour un id, valeur zéro (`0`, `""`).
- Erreurs : `*ApiError{Status, Message}` ; `apiErr`, `internal(err)` (journalise `API error: …`, 500),
  `validation()` (422). Toute autre `error` devient `internal` à la réponse (`toApiError`).
  Un `return nil, validation()` ; jamais un `*ApiError` nil typé dans une `error`.
- Base : `state.db.Call(func(db *Conn) error)` ou `dbCall(state.db, func(db *Conn) (T, error))` ;
  chaque appel a la connexion pour lui seul (comme le thread SQLite du Rust). Sur `*Conn` : `Exec`
  (lignes modifiées), `ExecBatch`, `LastInsertRowid`, `Begin` → `*Tx` (`defer tx.Rollback()`,
  `tx.Commit()`), et l’on continue d’utiliser le même `*Conn` dans la transaction. Aides : `dbAll`,
  `dbOne` (nil si rien), `dbRequired(db, sql, message404, params...)` (paramètres en dernier),
  `hasColumn`, `addColumnIfMissing`.
- Handlers HTTP hors `api::dispatch` : `func(state *AppState, w http.ResponseWriter, r *http.Request)`,
  paramètres de chemin par `r.PathValue`, corps par `readBody(w, r)` (limite de la route, 413 comme
  axum), réponse par `writeResult(w, value, err)`. `setActor(r, ActivityActor{…})` remplace
  l’extension `Actor` ; `onHeader` un en-tête posé par une couche.
- WebSocket : `wsUpgrader`, `wsReceive` (messages, pings et pongs sur un canal), `wsSend`, `wsClose`
  (dans `live.go`). Tâches tokio → goroutines, `Semaphore` → canal tamponné, `broadcast` →
  `broadcaster[T]`, `Notify` → canal de taille 1.
- `stubs_*.go` : symboles des autres groupes (SOCIAL, COACHING, ADMIN, SEED) avec leur signature
  définitive. Le groupe qui les porte supprime son fichier de stubs et les implémente à l’identique.
