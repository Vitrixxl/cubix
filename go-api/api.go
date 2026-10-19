package main

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"unicode/utf8"

	"golang.org/x/crypto/argon2"
)

func apiString(body any, key string, min, max int) (string, error) {
	s, ok := asStr(idx(body, key))
	if n := utf8.RuneCountInString(s); !ok || n < min || n > max {
		return "", validation()
	}
	return s, nil
}

// apiLearnedRow: a learned case as clients read it: its algorithms as a list.
func apiLearnedRow(row M) M {
	var algs any = []any{}
	if text, ok := asStr(row["algs"]); ok {
		if v, err := decodeJSON([]byte(text)); err == nil {
			algs = v
		}
	}
	row["algs"] = algs
	return row
}

func apiOptionalString(body any, key string) (*string, error) {
	v, ok := get(body, key)
	if !ok || v == nil {
		return nil, nil
	}
	s, ok := asStr(v)
	if !ok {
		return nil, validation()
	}
	return &s, nil
}

// apiComment: a solve note: absent (set false), cleared (`null` or blank: nil) or trimmed text of at most 500
// characters.
func apiComment(body any) (set bool, text *string, err error) {
	v, ok := get(body, "comment")
	if !ok {
		return false, nil, nil
	}
	if v == nil {
		return true, nil, nil
	}
	s, err := apiString(body, "comment", 0, 500)
	if err != nil {
		return false, nil, err
	}
	if s = strings.TrimSpace(s); s == "" {
		return true, nil, nil
	}
	return true, &s, nil
}

// apiSessionName: a session's name: absent (set false), cleared (`null` or blank: nil) or trimmed text of at most 60
// characters.
func apiSessionName(body any) (set bool, text *string, err error) {
	v, ok := get(body, "name")
	if !ok {
		return false, nil, nil
	}
	if v == nil {
		return true, nil, nil
	}
	s, err := apiString(body, "name", 0, 60)
	if err != nil {
		return false, nil, err
	}
	if s = strings.TrimSpace(s); s == "" {
		return true, nil, nil
	}
	return true, &s, nil
}

// apiSolution: the turns of a solve: absent, or trimmed text of at most 10000 characters (blank is absent).
func apiSolution(body any) (*string, error) {
	v, ok := get(body, "solution")
	if !ok || v == nil {
		return nil, nil
	}
	s, err := apiString(body, "solution", 0, 10000)
	if err != nil {
		return nil, err
	}
	if s = strings.TrimSpace(s); s == "" {
		return nil, nil
	}
	return &s, nil
}

// apiSplits: a solve timed in phases (src/client/lib/phases.ts): absent, or when each phase but the last ended, in
// milliseconds from the start, rising and within the solve, 1 to 7 of them; kept as JSON text.
func apiSplits(body any, time float64) (any, error) {
	v, ok := get(body, "splits")
	if !ok || v == nil {
		return nil, nil
	}
	list, ok := v.([]any)
	if !ok || len(list) < 1 || len(list) > 7 {
		return nil, validation()
	}
	splits := make([]int64, len(list))
	last := 0.0
	for i, x := range list {
		f, ok := asFloat(x)
		if !ok || math.IsNaN(f) || f <= last || f >= time {
			return nil, validation()
		}
		last = f
		splits[i] = int64(math.Round(f))
	}
	return strings.TrimSpace(encodeJSON(splits)), nil
}

// apiSolveRow: a solve as the API gives it, its splits a list rather than the table's JSON text.
func apiSolveRow(row M, err error) (M, error) {
	if err != nil || row == nil {
		return row, err
	}
	row["splits"], err = parseJSONText(row["splits"], "null")
	return row, err
}

// apiSolveResult: a Fewest Moves solve's move count (0 to 200), a Multi-Blind one's cubes solved and attempted (2 to 40,
// as the app offers them); each absent or nil, and refused on another solve mode.
func apiSolveResult(body any, mode string) (moves, solved, attempted *int64, err error) {
	count := func(key string, low, high int64) (*int64, error) {
		v, ok := get(body, key)
		if !ok || v == nil {
			return nil, nil
		}
		f, ok := asFloat(v)
		if !ok || f != math.Trunc(f) || f < float64(low) || f > float64(high) {
			return nil, validation()
		}
		n := int64(f)
		return &n, nil
	}
	if moves, err = count("moves", 0, 200); err != nil {
		return
	}
	if attempted, err = count("cubesAttempted", 2, 40); err != nil {
		return
	}
	high := int64(0)
	if attempted != nil {
		high = *attempted
	}
	if solved, err = count("cubesSolved", 0, high); err != nil {
		return
	}
	if (moves != nil && mode != "fewest-moves") || ((solved != nil || attempted != nil) && mode != "multi-blind") || (solved == nil) != (attempted == nil) {
		return nil, nil, nil, validation()
	}
	return
}

// apiSolutionEdit: the turns of a solve as edited: absent, cleared (`null` or blank) or trimmed text of at most
// 10000 characters.
func apiSolutionEdit(body any) (set bool, text *string, err error) {
	v, ok := get(body, "solution")
	if !ok {
		return false, nil, nil
	}
	if v == nil {
		return true, nil, nil
	}
	s, err := apiString(body, "solution", 0, 10000)
	if err != nil {
		return false, nil, err
	}
	if s = strings.TrimSpace(s); s == "" {
		return true, nil, nil
	}
	return true, &s, nil
}

func apiEnumString(body any, key string, allowed ...string) (string, error) {
	s, err := apiString(body, key, 0, 32)
	if err != nil {
		return "", err
	}
	for _, a := range allowed {
		if a == s {
			return s, nil
		}
	}
	return "", validation()
}

// apiMaxSolves: the most solves an account keeps, years of daily practice; the server's card is shared.
const apiMaxSolves = 200_000

// apiUserLimits: per-account allowances for writes a free account could otherwise repeat at will (solves,
// messages): token buckets as traffic.go keeps per IP.
var apiUserLimits = struct {
	sync.Mutex
	buckets map[string]*trafficBucket
}{buckets: map[string]*trafficBucket{}}

// apiUserAllow takes a token from the bucket `key` (a kind and an account), which holds `cap` refilled over
// `seconds`.
func apiUserAllow(key string, cap, seconds float64) bool {
	apiUserLimits.Lock()
	defer apiUserLimits.Unlock()
	b, ok := apiUserLimits.buckets[key]
	if !ok {
		// An hour idle refills every bucket: forgetting it changes nothing.
		if len(apiUserLimits.buckets) >= 10000 {
			for k, old := range apiUserLimits.buckets {
				if accountsNow()-old.at > 3600_000 {
					delete(apiUserLimits.buckets, k)
				}
			}
		}
		bucket := newTrafficBucket(cap)
		b = &bucket
		apiUserLimits.buckets[key] = b
	}
	return b.allow(cap, seconds)
}

// sharedSolveID: a shared solve's id, 10 random letters and digits (59 bits), the link's only key.
func sharedSolveID() string {
	const letters = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
	id := make([]byte, 0, 10)
	b := make([]byte, 1)
	for len(id) < cap(id) {
		_, _ = rand.Read(b)
		// 248 is 4×62: a byte past it is drawn again, so every letter is as likely.
		if b[0] < 248 {
			id = append(id, letters[b[0]%62])
		}
	}
	return string(id)
}

// shareSolve: the public link to a solve of `uid`'s: a copy of it as it is now, with its owner's name; sharing it again
// unchanged gives the same link.
func shareSolve(db *Conn, uid, solve string) (M, error) {
	row, err := dbRequired(db, "SELECT s.time_ms,s.penalty,s.scramble,s.solution,s.comment,s.memo_ms,s.moves,s.cubes_solved,s.cubes_attempted,s.puzzle_id,s.cube_size,s.solve_mode,s.scramble_type,s.created_at,u.username FROM solves s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.user_id=?", "Unknown solve", solve, uid)
	if err != nil {
		return nil, err
	}
	if id, ok := asStr(row["puzzle_id"]); !ok || !practiceIsPuzzle(id) {
		return nil, apiErr(404, "Unknown solve")
	}
	// Only Fewest Moves and Multi-Blind have these: a timed solve's copy stays as it was.
	for _, key := range []string{"moves", "cubes_solved", "cubes_attempted"} {
		if row[key] == nil {
			delete(row, key)
		}
	}
	copied := encodeJSON(row)
	same, err := dbOne(db, "SELECT id FROM shared_solves WHERE solve_id=? AND solve=?", solve, copied)
	if err != nil || same != nil {
		return M{"token": idx(same, "id")}, err
	}
	id := sharedSolveID()
	if _, err := db.Exec("INSERT INTO shared_solves(id,user_id,solve_id,solve) VALUES(?,?,?,?)", id, uid, solve, copied); err != nil {
		return nil, err
	}
	return M{"token": id}, nil
}

// sharedSolve: a shared solve, as it was shared, for anyone holding its link.
func sharedSolve(db *Conn, id string) (any, error) {
	row, err := dbRequired(db, "SELECT solve FROM shared_solves WHERE id=?", "Unknown solve", id)
	if err != nil {
		return nil, err
	}
	return decodeJSON([]byte(str(row["solve"])))
}

func apiQueryInt(query map[string]string, key string, def, max int64) (int64, error) {
	v, ok := query[key]
	if !ok {
		return def, nil
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil || n < 1 || n > max {
		return 0, validation()
	}
	return n, nil
}

type attempt struct {
	count uint32
	until int64
}

// apiLimited counts an attempt under `key`: past `most` within 15 minutes, it is refused.
func apiLimited(state *AppState, key string, most uint32) error {
	now := accountsNow()
	state.attemptsMu.Lock()
	defer state.attemptsMu.Unlock()
	for k, a := range state.attempts {
		if a.until < now {
			delete(state.attempts, k)
		}
	}
	entry, ok := state.attempts[key]
	if len(state.attempts) >= 10000 && !ok {
		// Full: the oldest entry goes. Refusing new keys would let a flood of names lock everyone out.
		oldest := ""
		for k, a := range state.attempts {
			if oldest == "" || a.until < state.attempts[oldest].until {
				oldest = k
			}
		}
		delete(state.attempts, oldest)
	}
	if !ok {
		entry = &attempt{until: now + 15*60000}
		state.attempts[key] = entry
	}
	entry.count++
	if entry.count > most {
		return apiErr(429, "Too many attempts. Try again in 15 minutes.")
	}
	return nil
}

// argonHash is argon2's hash_password with a fresh 16-byte salt: a PHC string such as
// `$argon2id$v=19$m=65536,t=2,p=1$salt$hash` (standard base64 without padding).
func argonHash(password []byte, memory, time uint32, threads uint8) string {
	salt := make([]byte, 16)
	_, _ = rand.Read(salt)
	key := argon2.IDKey(password, salt, time, memory, threads, 32)
	return fmt.Sprintf("$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s", memory, time, threads,
		base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(key))
}

// argonVerify is PasswordHash::new then verify_password, with the hash's own parameters. The error is for a hash
// that does not parse; a wrong password is (false, nil).
func argonVerify(phc string, password []byte) (bool, error) {
	parts := strings.Split(phc, "$")
	if len(parts) < 5 || parts[0] != "" {
		return false, errors.New("invalid password hash")
	}
	algorithm := parts[1]
	rest := parts[2:]
	if strings.HasPrefix(rest[0], "v=") {
		if rest[0] != "v=19" {
			return false, nil
		}
		rest = rest[1:]
	}
	if len(rest) != 3 {
		return false, errors.New("invalid password hash")
	}
	var memory, time uint64
	threads := uint64(0)
	for _, param := range strings.Split(rest[0], ",") {
		name, value, _ := strings.Cut(param, "=")
		n, err := strconv.ParseUint(value, 10, 32)
		switch name {
		case "m":
			memory = n
		case "t":
			time = n
		case "p":
			threads = n
		default:
			continue
		}
		if err != nil {
			return false, errors.New("invalid password hash")
		}
	}
	salt, err := base64.RawStdEncoding.DecodeString(rest[1])
	if err != nil {
		return false, errors.New("invalid password hash")
	}
	hash, err := base64.RawStdEncoding.DecodeString(rest[2])
	if err != nil || len(hash) == 0 || threads == 0 || threads > 255 {
		return false, errors.New("invalid password hash")
	}
	var key []byte
	switch algorithm {
	case "argon2id":
		key = argon2.IDKey(password, salt, uint32(time), uint32(memory), uint8(threads), uint32(len(hash)))
	case "argon2i":
		key = argon2.Key(password, salt, uint32(time), uint32(memory), uint8(threads), uint32(len(hash)))
	default:
		return false, nil
	}
	return subtle.ConstantTimeCompare(key, hash) == 1, nil
}

func isUsernameByte(b byte) bool {
	return 'a' <= b && b <= 'z' || '0' <= b && b <= '9' || b == '_'
}

// apiUsername: the body's `username`, lower-cased: 3–24 letters, numbers or underscores.
func apiUsername(body any) (string, error) {
	username, err := apiString(body, "username", 3, 24)
	if err != nil {
		return "", err
	}
	username = strings.ToLower(strings.TrimSpace(username))
	if len(username) < 3 {
		return "", apiErr(400, "Use 3–24 letters, numbers or underscores for your username.")
	}
	for i := 0; i < len(username); i++ {
		if !isUsernameByte(username[i]) {
			return "", apiErr(400, "Use 3–24 letters, numbers or underscores for your username.")
		}
	}
	return username, nil
}

// apiAuthRequest signs in with Google (`auth/google`, its ID token) or, where CUBIX_DEV_LOGIN=1, with a bare username
// (`auth/dev`: development and tests); either creates the account the first time.
func apiAuthRequest(state *AppState, r *http.Request, path string, body any) (any, error) {
	ip := trafficKey(state.traffic.ip(peerIP(r), r.Header)).String()
	if path == "auth/dev" {
		if os.Getenv("CUBIX_DEV_LOGIN") != "1" {
			return nil, apiErr(404, "Not found")
		}
		username, err := apiUsername(body)
		if err != nil {
			return nil, err
		}
		return dbCall(state.db, func(db *Conn) (M, error) {
			return accountsOpen(db, "username=? COLLATE NOCASE", username, username, nil)
		})
	}
	credential, err := apiString(body, "credential", 1, 4096)
	if err != nil {
		return nil, err
	}
	// Each sign-in may create an account: thirty per client every 15 minutes (a family or a class behind one address).
	if err := apiLimited(state, "google@"+ip, 30); err != nil {
		return nil, err
	}
	claims, err := googleVerify(credential, os.Getenv("CUBIX_GOOGLE_CLIENT_ID"))
	if err != nil {
		return nil, err
	}
	return dbCall(state.db, func(db *Conn) (M, error) {
		return accountsOpen(db, "google_sub=?", claims.Sub, accountsName(claims.Name), claims.Sub)
	})
}

// headerText is HeaderValue::to_str: visible ASCII only, else "".
func headerText(r *http.Request, name string) string {
	v := r.Header.Get(name)
	for i := 0; i < len(v); i++ {
		if c := v[i]; c != '\t' && (c < 32 || c > 126) {
			return ""
		}
	}
	return v
}

// The API's JSON bodies stay under apiBodyMax; a signed-in sync push may carry apiSyncMax. Bodies above apiSmallBody
// are read and decoded a few at a time (apiLargeBodies): decoded JSON takes many times its size, `[0,0,…]` about 20.
const apiBodyMax = 256 * 1024
const apiSyncMax = 2 * 1024 * 1024
const apiSmallBody = 64 * 1024

var apiLargeBodies = make(chan struct{}, 4)

func apiDispatch(state *AppState, w http.ResponseWriter, r *http.Request) {
	// A chunked body has no announced length (-1).
	if r.ContentLength < 0 || r.ContentLength > apiSmallBody {
		if (r.ContentLength < 0 || r.ContentLength > apiBodyMax) && r.Method == "POST" && string(apiRoutePath(r.URL.EscapedPath())) == "sync" {
			// The larger limit only once the token opens an account.
			if _, err := dbCall(state.db, func(db *Conn) (M, error) { return accountsSignedIn(db, headerText(r, "Authorization")) }); err != nil {
				writeError(w, err)
				return
			}
			r = r.WithContext(context.WithValue(r.Context(), limitKey{}, int64(apiSyncMax)))
		}
		select {
		case apiLargeBodies <- struct{}{}:
			defer func() { <-apiLargeBodies }()
		case <-r.Context().Done():
			return
		}
	}
	bytes, ok := readBody(w, r)
	if !ok {
		return
	}
	// Handlers name the account a request concerns; the request log and activity use it.
	actor, value, err := apiHandle(state, r, bytes)
	if actor != nil {
		setActor(r, *actor)
	}
	writeResult(w, r, value, err)
}

func apiHandle(state *AppState, r *http.Request, bytes []byte) (*ActivityActor, any, error) {
	var actor *ActivityActor
	value, err := apiRespond(state, r, bytes, &actor)
	if err == nil && actor == nil {
		if user, ok := asStr(idx(idx(value, "user"), "id")); ok {
			// Sign-in and registration return the account they opened.
			actor = &ActivityActor{user: user, seen: true}
		}
	}
	return actor, value, err
}

// apiRoutePath: the route an API path names: every leading `/api/` stripped, then percent-decoded.
func apiRoutePath(escaped string) []byte {
	for strings.HasPrefix(escaped, "/api/") {
		escaped = escaped[len("/api/"):]
	}
	return percentDecode(escaped)
}

func apiRespond(state *AppState, r *http.Request, bytes []byte, actor **ActivityActor) (any, error) {
	decoded := apiRoutePath(r.URL.EscapedPath())
	if !utf8.Valid(decoded) {
		return nil, validation()
	}
	path := string(decoded)
	query := parseQuery(r.URL.RawQuery)
	var body any = M{}
	if len(bytes) > 0 {
		var err error
		if body, err = decodeJSON(bytes); err != nil {
			return nil, validation()
		}
	}
	token := headerText(r, "Authorization")
	method := r.Method
	if method == "POST" && (path == "auth/google" || path == "auth/dev") {
		return apiAuthRequest(state, r, path, body)
	}
	// The account deleted by its owner: everything it holds goes at once (admin_data::purge).
	if method == "POST" && path == "account/delete" {
		user, err := dbCall(state.db, func(db *Conn) (M, error) { return accountsSignedIn(db, token) })
		if err != nil {
			return nil, err
		}
		id := str(user["id"])
		if err := apiLimited(state, "delete:"+id, 10); err != nil {
			return nil, err
		}
		if _, err := adminDataDelete(state, id); err != nil {
			return nil, err
		}
		return M{"ok": true}, nil
	}
	if method == "GET" {
		switch path {
		case "health":
			return M{"ok": true}, nil
		// What the sign-in dialog offers: Google with this client ID, and the dev sign-in.
		case "auth/config":
			var google any
			if id := os.Getenv("CUBIX_GOOGLE_CLIENT_ID"); id != "" {
				google = id
			}
			return M{"google": google, "dev": os.Getenv("CUBIX_DEV_LOGIN") == "1"}, nil
		case "mobile/release":
			return releaseInfo(), nil
		case "moves":
			return state.catalog.moves, nil
		case "sets", "cases":
			filter, err := practiceQuery(query)
			if err != nil {
				return nil, err
			}
			if path == "sets" {
				return practiceCatalog(state.catalog.sets, filter), nil
			}
			return practiceCatalog(state.catalog.cases, filter), nil
		}
		// A solve shared by its link: what it was, by whom, for anyone holding the link.
		if id, ok := strings.CutPrefix(path, "shared/"); ok && id != "" && !strings.Contains(id, "/") {
			return dbRead(state.db, func(db *Conn) (any, error) { return sharedSolve(db, id) })
		}
		// The WCA's rankings, records, competitions and people, proxied and cached (wca.go).
		if rest, ok := strings.CutPrefix(path, "wca/"); ok {
			return wcaRoute(state, trafficKey(state.traffic.ip(peerIP(r), r.Header)).String(), rest, query)
		}
		if id, ok := strings.CutPrefix(path, "cases/"); ok && !strings.Contains(id, "/") {
			if c, ok := state.catalog.byID[id]; ok {
				return c, nil
			}
			return nil, apiErr(404, "Unknown case")
		}
	}
	var caller *ApiCaller
	var value any
	var routeErr error
	// GET routes only read: they run on a read-only connection, beside the writer (a stray write fails there).
	call := state.db.Call
	if method == "GET" {
		call = state.db.Read
	}
	err := call(func(db *Conn) error {
		var err error
		// Looked up before the route runs, so a sign-out still names its account.
		if caller, err = newApiCaller(db, token); err != nil {
			return err
		}
		// Other devices of the same account learn about committed practice changes immediately: whenever the
		// request moved the account's change feed.
		uid := caller.id()
		var before int64
		if uid != "" && method != "GET" {
			if before, err = syncCursor(db, uid); err != nil {
				return err
			}
		}
		value, routeErr = apiRoute(db, state, method, path, query, body, caller)
		if routeErr == nil && uid != "" && method != "GET" {
			after, err := syncCursor(db, uid)
			if err != nil {
				return err
			}
			if after != before {
				state.hub.notifySync(uid, after)
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	if user := caller.id(); user != "" {
		*actor = &ActivityActor{user: user, token: caller.tokenHash, seen: true}
	}
	return value, routeErr
}

// ApiCaller is who sends a request: the digest of its bearer token and the account that token opens, resolved once
// per request.
type ApiCaller struct {
	tokenHash *string
	user      M
	// solves: the account's solves, counted at its first new solve of the request and kept up to date after, so a
	// sync push of a hundred solves counts once.
	solves *int64
}

func newApiCaller(db *Conn, authorization string) (*ApiCaller, error) {
	caller := &ApiCaller{}
	if hash, ok := accountsBearerHash(authorization); ok {
		caller.tokenHash = &hash
		user, err := accountsByTokenHash(db, hash)
		if err != nil {
			return nil, err
		}
		caller.user = user
	}
	return caller, nil
}

// id is the account's id, "" for none.
func (c *ApiCaller) id() string {
	return str(idx(c.user, "id"))
}

func (c *ApiCaller) signedIn() (M, error) {
	if c.user == nil {
		return nil, apiErr(401, "Please sign in again.")
	}
	return c.user, nil
}

func apiSession(db *Conn, id float64, user string) (M, error) {
	return dbRequired(db, "SELECT * FROM sessions WHERE id=? AND user_id=?", "Unknown session", id, user)
}

func apiSessionDto(value M) (M, error) {
	ids, err := parseJSONText(value["case_ids"], "[]")
	if err != nil {
		return nil, err
	}
	value["case_ids"] = ids
	return value, nil
}

func matchParts(parts []string, pattern ...string) bool {
	if len(parts) != len(pattern) {
		return false
	}
	for i, p := range pattern {
		if p != "*" && p != parts[i] {
			return false
		}
	}
	return true
}

func apiRoute(db *Conn, state *AppState, method, path string, query map[string]string, body any, caller *ApiCaller) (any, error) {
	if method == "POST" && path == "auth/logout" {
		if caller.tokenHash != nil {
			if _, err := db.Exec("DELETE FROM auth_tokens WHERE token_hash=?", *caller.tokenHash); err != nil {
				return nil, err
			}
		}
		return M{"ok": true}, nil
	}
	// The daily scramble's field is open to guests; ranking asks for an account.
	if strings.HasPrefix(path, "daily/") {
		return dailyRoute(db, method, strings.Split(path, "/"), query, body, caller)
	}
	user, err := caller.signedIn()
	if err != nil {
		return nil, err
	}
	uid := str(user["id"])
	// The account's new username (a Google account starts with one made from its name), free of any other account's.
	if method == "POST" && path == "account/username" {
		name, err := apiUsername(body)
		if err != nil {
			return nil, err
		}
		if taken, err := accountsByUsername(db, name); err != nil {
			return nil, err
		} else if taken != nil && str(taken["id"]) != uid {
			return nil, apiErr(409, "This username is taken.")
		}
		if _, err := db.Exec("UPDATE users SET username=? WHERE id=?", name, uid); err != nil {
			return nil, err
		}
		user["username"] = name
		return M{"user": accountsPublic(user)}, nil
	}
	if path == "sync" {
		if method == "GET" {
			after := int64(0)
			if s, ok := query["after"]; ok {
				if after, err = strconv.ParseInt(s, 10, 64); err != nil {
					return nil, validation()
				}
			}
			if after < 0 {
				return nil, validation()
			}
			return syncPull(db, uid, after, query["learningGroups"] == "1", query["journey"] == "1")
		}
		if method == "POST" {
			return syncPush(db, state, uid, caller, body)
		}
	}
	parts := strings.Split(path, "/")
	switch parts[0] {
	case "coaching":
		return coachingRoute(db, state, method, parts[1:], query, body, user)
	case "social":
		return socialRoute(db, state, method, parts[1:], query, body, user)
	case "tournaments", "matches", "competition":
		return tournamentRoute(db, state, method, parts, body, user)
	}
	is := func(m string, pattern ...string) bool { return method == m && matchParts(parts, pattern...) }
	switch {
	case is("GET", "auth", "me"):
		return accountsPublic(user), nil
	case is("GET", "stats"):
		filter, err := practiceQuery(query)
		if err != nil {
			return nil, err
		}
		// The puzzle's whole training history: scanned into times, without a map per solve.
		stmt, err := db.prepare("SELECT case_id,time_ms,penalty,created_at FROM solves WHERE case_id IS NOT NULL AND user_id=? AND puzzle_id=? AND solve_mode=? ORDER BY case_id,created_at,id")
		if err != nil {
			return nil, err
		}
		rows, err := stmt.QueryContext(bg, uid, filter.puzzle, filter.solveMode)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		out := []any{}
		var id, lastAt string
		var times []*float64
		for rows.Next() {
			var caseID, penalty, at string
			var ms float64
			if err := rows.Scan(&caseID, &ms, &penalty, &at); err != nil {
				return nil, err
			}
			if caseID != id && len(times) > 0 {
				out = append(out, statsSummary(id, times, lastAt))
				times = nil
			}
			id, lastAt = caseID, at
			times = append(times, statsEffectiveMs(ms, penalty))
		}
		if err := rows.Err(); err != nil {
			return nil, err
		}
		if len(times) > 0 {
			out = append(out, statsSummary(id, times, lastAt))
		}
		return out, nil
	case is("GET", "cases", "*", "stats"):
		filter, err := practiceQuery(query)
		if err != nil {
			return nil, err
		}
		rows, err := dbAll(db, "SELECT id,session_id,time_ms,penalty,comment,created_at FROM solves WHERE case_id=? AND user_id=? AND solve_mode=? ORDER BY created_at,id", parts[1], uid, filter.solveMode)
		if err != nil {
			return nil, err
		}
		return statsHistory(parts[1], rows), nil
	case is("POST", "sessions"):
		mode, err := apiEnumString(body, "mode", "training", "playground")
		if err != nil {
			return nil, err
		}
		cases, ok := get(body, "caseIds")
		if !ok {
			cases = []any{}
		}
		list, ok := asArray(cases)
		// Each id is the catalogue's: a longer list only repeats them.
		if !ok || len(list) > len(state.catalog.byID) {
			return nil, validation()
		}
		for _, id := range list {
			if _, ok := asStr(id); !ok {
				return nil, validation()
			}
		}
		context, err := practiceContextFromBody(body, nil, mode == "training")
		if err != nil {
			return nil, err
		}
		for _, id := range list {
			c, ok := state.catalog.byID[id.(string)]
			if !ok || practicePuzzleOf(c) != context.puzzle {
				return nil, apiErr(400, "Case and cube do not match.")
			}
		}
		_, name, err := apiSessionName(body)
		if err != nil {
			return nil, err
		}
		row, err := dbRequired(db, "INSERT INTO sessions(mode,case_ids,user_id,cube_size,puzzle_id,solve_mode,scramble_type,name) VALUES(?,?,?,?,?,?,?,?) RETURNING *", "Unknown session",
			mode, encodeJSON(cases), uid, context.cubeSize(), context.puzzle, context.solveMode, context.scrambleType, name)
		if err != nil {
			return nil, err
		}
		return apiSessionDto(row)
	case is("PATCH", "sessions", "*"):
		set, name, err := apiSessionName(body)
		if err != nil {
			return nil, err
		}
		if !set {
			return nil, validation()
		}
		row, err := dbRequired(db, "UPDATE sessions SET name=? WHERE id=? AND user_id=? RETURNING *", "Unknown session", name, parts[1], uid)
		if err != nil {
			return nil, err
		}
		return apiSessionDto(row)
	case is("GET", "sessions", "*"):
		id, err := strconv.ParseFloat(parts[1], 64)
		if err != nil {
			return nil, apiErr(404, "Unknown session")
		}
		row, err := apiSession(db, id, uid)
		if err != nil {
			return nil, err
		}
		s, err := apiSessionDto(row)
		if err != nil {
			return nil, err
		}
		// The session's latest solves: one session may hold an account's whole history.
		solves, err := dbAll(db, "SELECT * FROM (SELECT * FROM solves WHERE session_id=? AND user_id=? ORDER BY created_at DESC,id DESC LIMIT 1000) ORDER BY created_at,id", id, uid)
		if err != nil {
			return nil, err
		}
		for _, solve := range solves {
			if _, err := apiSolveRow(solve, nil); err != nil {
				return nil, err
			}
		}
		s["solves"] = solves
		return s, nil
	case is("GET", "solves"):
		mode, ok := query["mode"]
		if !ok {
			mode = "playground"
		}
		if mode != "training" && mode != "playground" {
			return nil, validation()
		}
		// Rows carry up to 12,500 characters of text each: a page stays in the tens of megabytes.
		limit, err := apiQueryInt(query, "limit", 500, 1000)
		if err != nil {
			return nil, err
		}
		filter, err := practiceQuery(query)
		if err != nil {
			return nil, err
		}
		// Keep the optional filter out of an OR so SQLite can seek by scramble type.
		scrambleClause := ""
		if filter.scrambleType != nil {
			scrambleClause = "AND s.scramble_type=?4"
		}
		return dbAll(db, "SELECT s.* FROM solves s LEFT JOIN sessions se ON se.id=s.session_id WHERE s.user_id=?1 AND s.puzzle_id=?2 AND s.solve_mode=?3 "+scrambleClause+" AND COALESCE(se.mode,CASE WHEN s.case_id IS NULL THEN 'playground' ELSE 'training' END)=?5 ORDER BY s.created_at DESC,s.id DESC LIMIT ?6",
			uid, filter.puzzle, filter.solveMode, filter.scrambleType, mode, limit)
	case is("POST", "solves"):
		var sid *float64
		if v, ok := get(body, "sessionId"); ok && v != nil {
			f, ok := asFloat(v)
			if !ok {
				return nil, validation()
			}
			sid = &f
		}
		caseID, err := apiOptionalString(body, "caseId")
		if err != nil {
			return nil, err
		}
		if caseID != nil && len(*caseID) > 100 {
			return nil, validation()
		}
		time, ok := asFloat(idx(body, "timeMs"))
		if !ok || math.IsInf(time, 0) || math.IsNaN(time) || time < 0 {
			return nil, validation()
		}
		penalty := "none"
		if _, ok := get(body, "penalty"); ok {
			if penalty, err = apiEnumString(body, "penalty", "none", "+2", "dnf"); err != nil {
				return nil, err
			}
		}
		var scramble *string
		if v, ok := get(body, "scramble"); ok && v != nil {
			// As long as a Multi-Blind attempt's 40 scrambles.
			s, err := apiString(body, "scramble", 0, 4000)
			if err != nil {
				return nil, err
			}
			scramble = &s
		}
		_, comment, err := apiComment(body)
		if err != nil {
			return nil, err
		}
		solution, err := apiSolution(body)
		if err != nil {
			return nil, err
		}
		// Blindfolded: the memorisation, absent or within the solve.
		var memo *float64
		if v, ok := get(body, "memoMs"); ok && v != nil {
			f, ok := asFloat(v)
			if !ok || math.IsNaN(f) || f < 0 || f > time {
				return nil, validation()
			}
			f = math.Round(f)
			memo = &f
		}
		splits, err := apiSplits(body, time)
		if err != nil {
			return nil, err
		}
		var selectedSession M
		if sid != nil {
			if selectedSession, err = apiSession(db, *sid, uid); err != nil {
				return nil, err
			}
		}
		var selectedCase M
		if caseID != nil {
			selectedCase = state.catalog.byID[*caseID]
		}
		training := caseID != nil && *caseID != ""
		var fallback any
		if selectedSession != nil {
			fallback = selectedSession
		} else if selectedCase != nil {
			fallback = selectedCase
		}
		context, err := practiceContextFromBody(body, fallback, training)
		if err != nil {
			return nil, err
		}
		if (selectedSession != nil && practiceContextOf(selectedSession) != context) ||
			(selectedCase != nil && practicePuzzleOf(selectedCase) != context.puzzle) {
			return nil, apiErr(400, "Case, cube and practice context do not match.")
		}
		if selectedSession != nil && eqStr(selectedSession["mode"], "training") != training {
			return nil, apiErr(400, "Case and session mode do not match.")
		}
		if training {
			if _, ok := state.catalog.byID[*caseID]; !ok {
				return nil, apiErr(400, "Unknown case")
			}
		}
		moves, solved, attempted, err := apiSolveResult(body, context.solveMode)
		if err != nil {
			return nil, err
		}
		// A thousand a minute lets an import through (a hundred per sync request), not a flood.
		if !apiUserAllow("solves:"+uid, 1000, 60) {
			return nil, apiErr(429, "Too many solves at once. Try again in a minute.")
		}
		// ponytail: counts the account's index once per request, milliseconds near the cap; a stored counter if it shows.
		if caller.solves == nil {
			count, err := dbOne(db, "SELECT count(*) n FROM solves WHERE user_id=?", uid)
			if err != nil {
				return nil, err
			}
			n, _ := asInt(count["n"])
			caller.solves = &n
		}
		if *caller.solves >= apiMaxSolves {
			return nil, apiErr(409, "This account holds 200,000 solves, the most it can keep. Delete old ones to add more.")
		}
		row, err := apiSolveRow(dbRequired(db, "INSERT INTO solves(session_id,case_id,time_ms,penalty,scramble,comment,solution,memo_ms,splits,moves,cubes_solved,cubes_attempted,user_id,cube_size,puzzle_id,solve_mode,scramble_type) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *", "Unknown solve",
			sid, caseID, math.Round(time), penalty, scramble, comment, solution, memo, splits, moves, solved, attempted, uid, context.cubeSize(), context.puzzle, context.solveMode, context.scrambleType))
		if err == nil {
			*caller.solves++
		}
		return row, err
	case is("PATCH", "solves", "*"):
		// Either field may be edited on its own; the other keeps its value.
		var penalty *string
		if _, ok := get(body, "penalty"); ok {
			p, err := apiEnumString(body, "penalty", "none", "+2", "dnf")
			if err != nil {
				return nil, err
			}
			penalty = &p
		}
		commentSet, comment, err := apiComment(body)
		if err != nil {
			return nil, err
		}
		solutionSet, solution, err := apiSolutionEdit(body)
		if err != nil {
			return nil, err
		}
		if penalty == nil && !commentSet && !solutionSet {
			return nil, validation()
		}
		return apiSolveRow(dbRequired(db, "UPDATE solves SET penalty=COALESCE(?,penalty),comment=CASE WHEN ? THEN ? ELSE comment END,solution=CASE WHEN ? THEN ? ELSE solution END WHERE id=? AND user_id=? RETURNING *", "Unknown solve",
			penalty, commentSet, comment, solutionSet, solution, parts[1], uid))
	case is("POST", "solves", "*", "share"):
		if !apiUserAllow("shares:"+uid, 30, 60) {
			return nil, apiErr(429, "Too many links at once. Try again in a minute.")
		}
		return shareSolve(db, uid, parts[1])
	case is("DELETE", "solves", "*"):
		row, err := apiSolveRow(dbRequired(db, "DELETE FROM solves WHERE id=? AND user_id=? RETURNING *", "Unknown solve", parts[1], uid))
		if err == nil && caller.solves != nil {
			*caller.solves--
		}
		return row, err
	case is("PUT", "journey"):
		return journeyPut(db, uid, body)
	case is("PUT", "learning-group-order"):
		track, err := apiEnumString(body, "track", "F2L", "OLL", "PLL")
		if err != nil {
			return nil, err
		}
		groups, ok := asArray(idx(body, "groups"))
		if !ok || len(groups) == 0 || len(groups) > 100 {
			return nil, validation()
		}
		onlyIfMissing := false
		if v, ok := get(body, "onlyIfMissing"); ok {
			if onlyIfMissing, ok = asBool(v); !ok {
				return nil, validation()
			}
		}
		set := strings.ToLower(track)
		seen := map[string]bool{}
		for _, group := range groups {
			name, ok := asStr(group)
			if !ok || seen[name] {
				return nil, validation()
			}
			seen[name] = true
			found := false
			for _, c := range state.catalog.byID {
				if eqStr(c["set"], set) && eqStr(c["group"], name) {
					found = true
					break
				}
			}
			if !found {
				return nil, validation()
			}
		}
		// Legacy device preferences may seed a track, but never replace an existing cloud order.
		existing, err := dbOne(db, "SELECT id FROM learning_group_orders WHERE user_id=? AND track=?", uid, track)
		if err != nil {
			return nil, err
		}
		if existing == nil {
			_, err = db.Exec("INSERT INTO learning_group_orders(user_id,track,groups) VALUES(?,?,?)", uid, track, encodeJSON(groups))
		} else if !onlyIfMissing {
			_, err = db.Exec("UPDATE learning_group_orders SET groups=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=? AND track=?", encodeJSON(groups), uid, track)
		}
		if err != nil {
			return nil, err
		}
		value, err := dbRequired(db, "SELECT * FROM learning_group_orders WHERE user_id=? AND track=?", "Unknown learning track", uid, track)
		if err != nil {
			return nil, err
		}
		if value["groups"], err = parseJSONText(value["groups"], "[]"); err != nil {
			return nil, err
		}
		return value, nil
	case is("GET", "learned"):
		rows, err := dbAll(db, "SELECT case_id FROM learned_cases WHERE user_id=? AND learned=1 ORDER BY case_id", uid)
		if err != nil {
			return nil, err
		}
		out := make([]any, len(rows))
		for i, r := range rows {
			out[i] = r["case_id"]
		}
		return out, nil
	// How many players learned each case, and with which of its algorithms.
	case is("GET", "algorithm-choices"):
		cases := []string{}
		if c, ok := query["cases"]; ok {
			for _, id := range strings.Split(c, ",") {
				if id != "" {
					cases = append(cases, id)
				}
			}
		}
		if len(cases) == 0 || len(cases) > 500 {
			return nil, validation()
		}
		out := M{}
		ids := encodeJSON(cases)
		// Players who chose at least one algorithm, then how many chose each (a player may have several).
		rows, err := dbAll(db, "SELECT case_id,count(*) n FROM learned_cases WHERE learned=1 AND algs IS NOT NULL AND case_id IN (SELECT value FROM json_each(?)) GROUP BY case_id", ids)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			out[str(row["case_id"])] = M{"total": row["n"], "algs": M{}}
		}
		rows, err = dbAll(db, "SELECT l.case_id,j.value alg,count(*) n FROM learned_cases l, json_each(l.algs) j WHERE l.learned=1 AND l.algs IS NOT NULL AND l.case_id IN (SELECT value FROM json_each(?)) GROUP BY l.case_id,j.value", ids)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			if entry, ok := out[str(row["case_id"])].(M); ok {
				entry["algs"].(M)[str(row["alg"])] = row["n"]
			}
		}
		return out, nil
	case is("PUT", "learned"):
		caseID, err := apiString(body, "caseId", 1, 100)
		if err != nil {
			return nil, err
		}
		learned, ok := asBool(idx(body, "learned"))
		if !ok {
			return nil, validation()
		}
		entry, ok := state.catalog.byID[caseID]
		if !ok {
			return nil, apiErr(400, "Unknown case")
		}
		// The algorithms the case was learned with, the catalogue's; `alg` alone is an older
		// client's single choice. Unlearning forgets them. `alg` keeps the first for those clients.
		algs := []string{}
		switch v := idx(body, "algs").(type) {
		case []any:
			for _, a := range v {
				s, ok := asStr(a)
				if !ok {
					return nil, validation()
				}
				algs = append(algs, s)
			}
		case nil:
			alg, err := apiOptionalString(body, "alg")
			if err != nil {
				return nil, err
			}
			if alg != nil {
				algs = append(algs, *alg)
			}
		default:
			return nil, validation()
		}
		if !learned {
			algs = algs[:0]
		}
		known, _ := asArray(entry["algorithms"])
		for _, alg := range algs {
			found := false
			for _, a := range known {
				if eqStr(idx(a, "alg"), alg) {
					found = true
					break
				}
			}
			if !found {
				return nil, apiErr(400, "Unknown algorithm")
			}
		}
		unique := []string{}
		seen := map[string]bool{}
		for _, alg := range algs {
			if !seen[alg] {
				seen[alg] = true
				unique = append(unique, alg)
			}
		}
		var alg, list any
		if len(unique) > 0 {
			alg, list = unique[0], encodeJSON(unique)
		}
		// Two statements rather than UPSERT: an UPSERT's conflict clause would override the
		// INSERT OR REPLACE inside the sync journal trigger.
		updated, err := db.Exec("UPDATE learned_cases SET learned=?,alg=?,algs=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=? AND case_id=?", learned, alg, list, uid, caseID)
		if err != nil {
			return nil, err
		}
		if updated == 0 {
			if _, err := db.Exec("INSERT INTO learned_cases(user_id,case_id,learned,alg,algs) VALUES(?,?,?,?,?)", uid, caseID, learned, alg, list); err != nil {
				return nil, err
			}
		}
		row, err := dbRequired(db, "SELECT * FROM learned_cases WHERE user_id=? AND case_id=?", "Unknown case", uid, caseID)
		if err != nil {
			return nil, err
		}
		return apiLearnedRow(row), nil
	}
	return nil, apiErr(404, "Not found")
}
