package main

// The web administration is opened with a token generated inside the container
// (`cubix-api admin-token`), whose SHA-256 alone is stored in `admin_access`. Sessions opened
// with it name its `version`, so replacing or revoking the token ends them at once.
//
// `CUBIX_ADMIN_PASSWORD` no longer opens the administration: it only authorizes the mobile
// APK and over-the-air uploads that `scripts/deploy.ts` sends (see `releaseAuthorize`).

import (
	"errors"
	"io"
	"net/http"
	"net/netip"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

type Admin struct {
	// Argon2 hash of `CUBIX_ADMIN_PASSWORD`, for mobile uploads only.
	upload  *string
	permits chan struct{}
	sockets chan struct{}
	revoked *broadcaster[struct{}]
}

const adminTokenPrefix = "cbx_admin_"
const adminDisabled = "Run `cubix-api admin-token` in the container to enable administration"

// adminRotate replaces the admin token: returns the new one, stores only its digest and signs every admin
// session out. Used by `cubix-api admin-token`, possibly while the server runs.
func adminRotate(db *Conn) (string, error) {
	// 256 random bits, hexadecimal so the token is URL-safe.
	token := adminTokenPrefix + accountsRandomToken()
	tx, err := db.Begin()
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	if _, err := db.Exec("DELETE FROM admin_access"); err != nil {
		return "", err
	}
	if _, err := db.Exec("DELETE FROM admin_tokens"); err != nil {
		return "", err
	}
	if _, err := db.Exec("INSERT INTO admin_access(id,digest,version,created_at) VALUES(1,?,?,?)",
		accountsDigest(token), accountsRandomToken(), accountsNow()); err != nil {
		return "", err
	}
	return token, tx.Commit()
}

// adminDisable disables the administration: no token, no admin session. Returns whether a token existed.
func adminDisable(db *Conn) (bool, error) {
	tx, err := db.Begin()
	if err != nil {
		return false, err
	}
	defer tx.Rollback()
	deleted, err := db.Exec("DELETE FROM admin_access")
	if err != nil {
		return false, err
	}
	if _, err := db.Exec("DELETE FROM admin_tokens"); err != nil {
		return false, err
	}
	return deleted > 0, tx.Commit()
}

type adminAccess struct {
	digest  string
	version string
}

func adminAccessOf(db *Conn) (*adminAccess, error) {
	row, err := dbOne(db, "SELECT digest,version FROM admin_access WHERE id=1")
	if err != nil || row == nil {
		return nil, err
	}
	return &adminAccess{digest: str(row["digest"]), version: str(row["version"])}, nil
}

// adminSame: equal-length comparison whose time does not depend on where the inputs differ.
func adminSame(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	acc := byte(0)
	for i := 0; i < len(a); i++ {
		acc |= a[i] ^ b[i]
	}
	return acc == 0
}

// adminRefused: a refused admin request answers 503 instead while the administration is disabled. Only
// refusals look `admin_access` up: a valid session implies the token it was opened with.
func adminRefused(state *AppState, refusal error) error {
	access, err := dbCall(state.db, adminAccessOf)
	if err == nil && access == nil {
		return apiErr(503, adminDisabled)
	}
	return refusal
}

func newAdmin() (*Admin, error) {
	password := os.Getenv("CUBIX_ADMIN_PASSWORD")
	if password != "" && len(password) < 12 {
		return nil, errors.New("CUBIX_ADMIN_PASSWORD must contain at least 12 characters")
	}
	var upload *string
	if password != "" {
		// Argon2::default(): Argon2id, 19 MiB, two passes, one lane.
		hash := argonHash([]byte(password), 19456, 2, 1)
		upload = &hash
	}
	return &Admin{upload: upload, permits: make(chan struct{}, 2), sockets: make(chan struct{}, 32), revoked: newBroadcaster[struct{}](1)}, nil
}

func (a *Admin) uploadConfigured() bool {
	return a.upload != nil
}

// verifyUpload checks `CUBIX_ADMIN_PASSWORD` for the mobile uploads of `scripts/deploy.ts`, never for the
// web administration. Argon2 runs at most two at a time so a burst of guesses cannot exhaust memory.
// `configured` is false when no password is configured.
func (a *Admin) verifyUpload(password string) (ok bool, configured bool, err error) {
	if a.upload == nil {
		return false, false, nil
	}
	select {
	case a.permits <- struct{}{}:
	default:
		return false, false, apiErr(429, "Try again shortly")
	}
	defer func() { <-a.permits }()
	ok, err = argonVerify(*a.upload, []byte(password))
	return ok && err == nil, true, nil
}

// adminHeader is `headers.get(name).and_then(|v| v.to_str().ok())`: the first value, if visible ASCII.
func adminHeader(r *http.Request, name string) (string, bool) {
	values := r.Header.Values(name)
	if len(values) == 0 {
		return "", false
	}
	v := values[0]
	for i := 0; i < len(v); i++ {
		if c := v[i]; c != '\t' && (c < 32 || c > 126) {
			return "", false
		}
	}
	return v, true
}

func adminCookie(r *http.Request) (string, bool) {
	header, ok := adminHeader(r, "Cookie")
	if !ok {
		return "", false
	}
	for _, item := range strings.Split(header, ";") {
		token, found := strings.CutPrefix(strings.TrimSpace(item), "cubix_admin=")
		if !found {
			continue
		}
		if len(token) != 64 {
			return "", false
		}
		for i := 0; i < len(token); i++ {
			if _, hex := unhex(token[i]); !hex {
				return "", false
			}
		}
		return token, true
	}
	return "", false
}

func adminCookieHeader(r *http.Request, value string, age int) string {
	origin, _ := adminHeader(r, "Origin")
	secure := ""
	if strings.HasPrefix(origin, "https://") {
		secure = "; Secure"
	}
	return "cubix_admin=" + value + "; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=" + strconv.Itoa(age) + secure
}

func adminSameOrigin(r *http.Request) error {
	origin, ok := adminHeader(r, "Origin")
	if !ok {
		return nil
	}
	authority, found := strings.CutPrefix(origin, "https://")
	if !found {
		authority, found = strings.CutPrefix(origin, "http://")
	}
	// Go keeps the Host header in r.Host; empty when the request has none.
	host := r.Host
	hostValid := host != ""
	for i := 0; i < len(host); i++ {
		if c := host[i]; c != '\t' && (c < 32 || c > 126) {
			hostValid = false
		}
	}
	if found != hostValid || (found && authority != host) {
		return apiErr(403, "Origin not allowed")
	}
	return nil
}

// adminInt: a number in the address.
func adminInt(text string) (int64, error) {
	n, err := strconv.ParseInt(text, 10, 64)
	if err != nil {
		return 0, validation()
	}
	return n, nil
}

func adminDispatch(state *AppState, w http.ResponseWriter, r *http.Request) {
	bytes, ok := readBody(w, r)
	if !ok {
		return
	}
	value, cookie, err := adminRespond(state, r, bytes)
	if err != nil {
		writeError(w, err)
		return
	}
	if cookie != "" {
		w.Header().Set("Set-Cookie", cookie)
	}
	writeJSON(w, 200, value)
}

// adminRespond answers an admin request, with the `Set-Cookie` header to send if any.
func adminRespond(state *AppState, r *http.Request, bytes []byte) (any, string, error) {
	path := r.URL.EscapedPath()
	method := r.Method
	if method != "GET" && method != "HEAD" {
		if err := adminSameOrigin(r); err != nil {
			return nil, "", err
		}
	}
	if path == "/api/admin/login" && method == "POST" {
		access, err := dbCall(state.db, adminAccessOf)
		if err != nil {
			return nil, "", err
		}
		if access == nil {
			return nil, "", apiErr(503, adminDisabled)
		}
		// Attempts share the admin rate limit (traffic.go); failures are logged as important.
		body, err := decodeJSON(bytes)
		if err != nil {
			return nil, "", validation()
		}
		supplied, err := apiString(body, "token", 1, 256)
		if err != nil {
			return nil, "", err
		}
		if !adminSame(accountsDigest(strings.TrimSpace(supplied)), access.digest) {
			return nil, "", apiErr(401, "Incorrect admin token")
		}
		token := accountsRandomToken()
		digest := accountsDigest(token)
		version := access.version
		expires := accountsNow() + accountsDayMs
		err = state.db.Call(func(db *Conn) error {
			if _, err := db.Exec("DELETE FROM admin_tokens WHERE expires_at<=? OR password_version!=?", accountsNow(), version); err != nil {
				return err
			}
			_, err := db.Exec("INSERT INTO admin_tokens(token_hash,expires_at,password_version) VALUES(?,?,?)", digest, expires, version)
			return err
		})
		if err != nil {
			return nil, "", err
		}
		return M{"expiresAt": expires}, adminCookieHeader(r, token, 86400), nil
	}
	token, ok := adminCookie(r)
	if !ok {
		return nil, "", adminRefused(state, apiErr(401, "Admin sign-in required"))
	}
	expires, err := adminSession(state, token)
	if err != nil {
		return nil, "", adminRefused(state, err)
	}
	if path == "/api/admin/session" && method == "GET" {
		return M{"expiresAt": expires}, "", nil
	}
	if path == "/api/admin/logout" && method == "POST" {
		err := state.db.Call(func(db *Conn) error {
			_, err := db.Exec("DELETE FROM admin_tokens WHERE token_hash=?", accountsDigest(token))
			return err
		})
		if err != nil {
			return nil, "", err
		}
		state.admin.revoked.send(struct{}{})
		return M{"ok": true}, adminCookieHeader(r, "", 0), nil
	}
	query := parseQuery(r.URL.RawQuery)
	rest := path
	for strings.HasPrefix(rest, "/api/admin/") {
		rest = rest[len("/api/admin/"):]
	}
	segments := strings.Split(rest, "/")
	is := func(m string, pattern ...string) bool { return method == m && matchParts(segments, pattern...) }
	jsonBody := func() (any, error) {
		body, err := decodeJSON(bytes)
		if err != nil {
			return nil, validation()
		}
		return body, nil
	}
	var value any
	switch {
	case is("GET", "overview"):
		value, err = adminDataOverview(state)
	case is("GET", "requests"), is("GET", "ips"), is("GET", "users"):
		var q *adminDataQuery
		if q, err = newAdminDataQuery(query); err == nil {
			switch segments[0] {
			case "requests":
				value, err = adminDataRequests(state, q)
			case "ips":
				value, err = adminDataIps(state, q)
			default:
				value, err = adminDataUsers(state, q)
			}
		}
	case is("GET", "users", "*"):
		var id string
		if id, err = adminDataUserID(segments[1]); err == nil {
			value, err = adminDataUser(state, id)
		}
	case is("GET", "coaching"):
		value, err = dbCall(state.db, coachingAdminOverview)
	case is("POST", "coaching", "applications", "*", "approve"), is("POST", "coaching", "applications", "*", "reject"):
		id, perr := strconv.ParseInt(segments[2], 10, 64)
		if perr != nil {
			return nil, "", validation()
		}
		approve := segments[3] == "approve"
		value, err = dbCall(state.db, func(db *Conn) (any, error) { return coachingDecide(db, id, approve) })
	case is("POST", "coaching", "coaches", "*", "enable"), is("POST", "coaching", "coaches", "*", "disable"):
		var id string
		if id, err = adminDataUserID(segments[2]); err == nil {
			active := segments[3] == "enable"
			value, err = dbCall(state.db, func(db *Conn) (any, error) { return coachingSetActive(db, id, active) })
		}
	// Tournaments open to every account: the administration creates and runs them.
	case is("GET", "tournaments"):
		value, err = dbCall(state.db, tournamentAdminList)
	case is("GET", "tournaments", "*"):
		var id int64
		if id, err = adminInt(segments[1]); err == nil {
			value, err = dbCall(state.db, func(db *Conn) (any, error) { return tournamentDetail(db, id, "") })
		}
	case is("POST", "tournaments"):
		var body any
		if body, err = jsonBody(); err == nil {
			value, err = dbCall(state.db, func(db *Conn) (any, error) { return tournamentCreate(db, state, body, 0, "") })
		}
	case is("POST", "tournaments", "*", "start"), is("POST", "tournaments", "*", "cancel"):
		var id int64
		if id, err = adminInt(segments[1]); err == nil {
			start := segments[2] == "start"
			value, err = dbCall(state.db, func(db *Conn) (any, error) {
				var err error
				if start {
					err = tournamentStart(db, state, id)
				} else {
					err = tournamentCancel(db, state, id)
				}
				if err != nil {
					return nil, err
				}
				return tournamentDetail(db, id, "")
			})
		}
	case is("DELETE", "tournaments", "*"):
		var id int64
		if id, err = adminInt(segments[1]); err == nil {
			value, err = dbCall(state.db, func(db *Conn) (any, error) { return tournamentDelete(db, state, id) })
		}
	case is("POST", "matches", "*", "award"):
		var id int64
		var body any
		if id, err = adminInt(segments[1]); err == nil {
			if body, err = jsonBody(); err == nil {
				value, err = dbCall(state.db, func(db *Conn) (any, error) {
					winner, err := apiString(body, "winner", 1, 64)
					if err != nil {
						return nil, err
					}
					return tournamentAward(db, state, id, winner)
				})
			}
		}
	case is("POST", "users", "*", "revoke"), is("DELETE", "users", "*"):
		id, err := adminDataUserID(segments[1])
		if err != nil {
			return nil, "", err
		}
		if method == "POST" {
			value, err = adminDataRevoke(state, id)
		} else {
			value, err = adminDataDelete(state, id)
		}
		if err != nil {
			return nil, "", err
		}
		// The log names the account acted on, without counting it as the account's activity.
		setActor(r, ActivityActor{user: id, seen: false})
		return value, "", nil
	default:
		return nil, "", apiErr(404, "Unknown admin route")
	}
	if err != nil {
		return nil, "", err
	}
	return value, "", nil
}

func adminSession(state *AppState, token string) (int64, error) {
	digest := accountsDigest(token)
	// Only sessions opened with the current admin token are valid.
	row, err := dbCall(state.db, func(db *Conn) (M, error) {
		return dbOne(db, "SELECT t.expires_at FROM admin_tokens t JOIN admin_access a ON a.version=t.password_version WHERE t.token_hash=? AND t.expires_at>?", digest, accountsNow())
	})
	if err != nil {
		return 0, err
	}
	if row == nil {
		return 0, apiErr(401, "Admin session expired")
	}
	expires, ok := asInt(row["expires_at"])
	if !ok {
		return 0, validation()
	}
	return expires, nil
}

// adminRejection is axum's WebSocketUpgrade extractor refusing a request that is no WebSocket handshake.
func adminRejection(r *http.Request) (int, string) {
	if r.Method != "GET" {
		return 405, "Request method must be `GET`"
	}
	if v := r.Header.Values("Connection"); len(v) == 0 || !strings.Contains(strings.ToLower(v[0]), "upgrade") {
		return 400, "Connection header did not include 'upgrade'"
	}
	if v := r.Header.Values("Upgrade"); len(v) == 0 || !strings.EqualFold(v[0], "websocket") {
		return 400, "`Upgrade` header did not include 'websocket'"
	}
	if len(r.Header.Values("Sec-Websocket-Key")) == 0 {
		return 400, "`Sec-WebSocket-Key` header missing"
	}
	if v := r.Header.Values("Sec-Websocket-Version"); len(v) == 0 || v[0] != "13" {
		return 400, "`Sec-WebSocket-Version` header did not include '13'"
	}
	return 0, ""
}

var adminUpgrader = wsUpgrader(4096)

func adminUpgrade(state *AppState, w http.ResponseWriter, r *http.Request) {
	if status, message := adminRejection(r); status != 0 {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(status)
		_, _ = io.WriteString(w, message)
		return
	}
	if err := adminSameOrigin(r); err != nil {
		writeError(w, err)
		return
	}
	token, ok := adminCookie(r)
	if !ok {
		writeError(w, apiErr(401, "Admin sign-in required"))
		return
	}
	expires, err := adminSession(state, token)
	if err != nil {
		writeError(w, err)
		return
	}
	select {
	case state.admin.sockets <- struct{}{}:
	default:
		writeError(w, apiErr(429, "Too many admin connections"))
		return
	}
	defer func() { <-state.admin.sockets }()
	ip := state.traffic.ip(peerIP(r), r.Header)
	conn, err := adminUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	conn.SetReadLimit(4096)
	adminLive(conn, state, token, expires, ip)
}

func adminSend(conn *websocket.Conn, kind int, data []byte) bool {
	deadline := time.Now().Add(5 * time.Second)
	if kind == websocket.PingMessage {
		return conn.WriteControl(kind, data, deadline) == nil
	}
	_ = conn.SetWriteDeadline(deadline)
	return conn.WriteMessage(kind, data) == nil
}

func adminClose(conn *websocket.Conn, code int, reason string) {
	adminSend(conn, websocket.CloseMessage, websocket.FormatCloseMessage(code, reason))
}

// adminLive: the live socket tells the administration when to refetch, without data: `changed` at most
// every 500 ms while requests other than its own arrive, and each newly stored important request
// as `/api/admin/requests` lists it. Nothing is sent while the subscription is paused.
func adminLive(conn *websocket.Conn, state *AppState, token string, expires int64, ip netip.Addr) {
	defer conn.Close()
	updates, unsubscribeUpdates := state.traffic.subscribe()
	defer unsubscribeUpdates()
	important, unsubscribeImportant := state.traffic.log.subscribe()
	defer unsubscribeImportant()
	revoked, unsubscribeRevoked := state.admin.revoked.subscribe()
	defer unsubscribeRevoked()
	deadline := time.NewTimer(time.Duration(max(expires-accountsNow(), 0)) * time.Millisecond)
	defer deadline.Stop()
	heartbeat := time.NewTicker(30 * time.Second)
	defer heartbeat.Stop()
	// Sign-outs in this process arrive on `revoked`; a token replaced or revoked by the CLI, or
	// a session ended in the database, is noticed by checking the session again while open.
	recheck := time.NewTicker(5 * time.Second)
	defer recheck.Stop()
	incoming, stop := wsReceive(conn)
	defer stop()
	lastPong := time.Now()
	streaming := false
	pending := false
	nextSend := time.Now()
	changed := []byte(encodeJSON(M{"type": "changed"}))
	for {
		var sendNow <-chan time.Time
		if pending {
			sendNow = time.After(time.Until(nextSend))
		}
		select {
		case <-deadline.C:
			adminClose(conn, 4001, "Admin session expired")
			return
		case <-revoked:
			if _, err := adminSession(state, token); err != nil {
				adminClose(conn, 4001, "Admin session revoked")
				return
			}
		case <-recheck.C:
			if _, err := adminSession(state, token); err != nil {
				adminClose(conn, 4001, "Admin session revoked")
				return
			}
		case <-heartbeat.C:
			if time.Since(lastPong) > 60*time.Second {
				return
			}
			if !adminSend(conn, websocket.PingMessage, nil) {
				return
			}
		case <-updates:
			if streaming {
				pending = true
			}
		case row := <-important:
			if streaming && !adminSend(conn, websocket.TextMessage, []byte(encodeJSON(M{"type": "important", "data": row}))) {
				return
			}
		case <-sendNow:
			pending = false
			if !adminSend(conn, websocket.TextMessage, changed) {
				return
			}
			nextSend = time.Now().Add(500 * time.Millisecond)
		case message := <-incoming:
			if message.err != nil {
				return
			}
			if !state.traffic.allow(ip, "/api/admin/live", true) {
				adminClose(conn, 1008, "Message rate limit exceeded")
				return
			}
			switch message.kind {
			case websocket.PongMessage:
				lastPong = time.Now()
				continue
			case websocket.PingMessage:
				continue
			case websocket.TextMessage:
			default:
				adminClose(conn, 1008, "Invalid message")
				return
			}
			body, err := decodeJSON(message.data)
			if err != nil {
				adminClose(conn, 1008, "Invalid message")
				return
			}
			// `filters` remain part of the protocol, bounded, but views fetch their own data.
			filters, ok := asObject(idx(body, "filters"))
			for _, v := range filters {
				if _, text := v.(string); !text {
					ok = false
				}
			}
			if !ok {
				adminClose(conn, 1008, "Invalid filters")
				return
			}
			live, isBool := asBool(idx(body, "live"))
			valid := eqStr(idx(body, "type"), "subscribe") && isBool && len(filters) <= 8
			for k, v := range filters {
				if len(k) > 20 || len(v.(string)) > 100 {
					valid = false
				}
			}
			if !valid {
				adminClose(conn, 1008, "Invalid subscription")
				return
			}
			streaming = live
			// Subscribing or resuming asks for one refetch, so nothing missed while paused.
			pending = streaming
		}
	}
}
