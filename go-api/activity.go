package main

// Durable administration data: the persistent request log, daily traffic per IP, daily activity
// per account, `last_seen_at`, token use and finished duels.
//
// Requests never wait for SQLite: the traffic middleware hands a small record to a bounded
// channel, and one writer task stores the records in batches (at most a second old, or 2 000 at
// a time) through the database thread. Only the method, the path without its query string, the
// status, the duration, the client IP, a truncated user agent and the account id are kept:
// never headers, tokens, query strings or bodies.

import (
	"fmt"
	"math"
	"net/netip"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Rows of the request log older than this are deleted.
const activityRetentionDays int64 = 30

// The log keeps at most this many ordinary rows and this many important rows.
const activityMaxRows int64 = 200_000
const activityMaxImportantRows int64 = 50_000

// Daily per-IP aggregates (and the accounts seen from each IP) are kept this long.
const activityTrafficDays int64 = 90

// Daily per-account activity is kept this long.
const activityActivityDays int64 = 400

// `last_seen_at` and a token's `last_used_at` are written at most once a minute.
const activitySeenEveryMs int64 = 60_000
const activityBatch = 2000
const activityQueue = 20_000

// activityKinds: every kind a request can be classified as, the important ones first.
var activityKinds = [14]string{
	"rate-limit",
	"server-error",
	"auth",
	"admin",
	"account",
	"release",
	"client-error",
	"not-found",
	"sync",
	"live",
	"mobile",
	"api",
	"page",
	"asset",
}

func activityMigrate(db *Conn) error {
	if err := db.ExecBatch(`CREATE TABLE IF NOT EXISTS request_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, ip TEXT NOT NULL,
          method TEXT NOT NULL, path TEXT NOT NULL, status INTEGER NOT NULL, duration_ms REAL NOT NULL,
          user_id TEXT, user_agent TEXT, kind TEXT NOT NULL, important INTEGER NOT NULL DEFAULT 0);
        CREATE INDEX IF NOT EXISTS idx_request_log_at ON request_log(at);
        CREATE INDEX IF NOT EXISTS idx_request_log_important ON request_log(important,id);
        CREATE INDEX IF NOT EXISTS idx_request_log_user ON request_log(user_id,id);
        CREATE INDEX IF NOT EXISTS idx_request_log_kind ON request_log(kind,id);
        CREATE TABLE IF NOT EXISTS traffic_daily (
          day TEXT NOT NULL, ip TEXT NOT NULL, requests INTEGER NOT NULL DEFAULT 0,
          errors INTEGER NOT NULL DEFAULT 0, server_errors INTEGER NOT NULL DEFAULT 0,
          limited INTEGER NOT NULL DEFAULT 0, first_at INTEGER NOT NULL, last_at INTEGER NOT NULL,
          PRIMARY KEY(day,ip)) WITHOUT ROWID;
        CREATE TABLE IF NOT EXISTS traffic_daily_users (
          day TEXT NOT NULL, ip TEXT NOT NULL, user_id TEXT NOT NULL,
          PRIMARY KEY(day,ip,user_id)) WITHOUT ROWID;
        CREATE INDEX IF NOT EXISTS idx_traffic_daily_users_user ON traffic_daily_users(user_id);
        CREATE INDEX IF NOT EXISTS idx_traffic_daily_users_ip ON traffic_daily_users(ip,day);
        CREATE TABLE IF NOT EXISTS user_activity (
          user_id TEXT NOT NULL, day TEXT NOT NULL, requests INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(user_id,day)) WITHOUT ROWID;
        CREATE INDEX IF NOT EXISTS idx_user_activity_day ON user_activity(day);
        CREATE TABLE IF NOT EXISTS duel_games (
          id INTEGER PRIMARY KEY AUTOINCREMENT, race TEXT NOT NULL, game INTEGER NOT NULL,
          event TEXT NOT NULL, ended_at INTEGER NOT NULL,
          player1_id TEXT, player1_name TEXT NOT NULL, player1_ao5 REAL,
          player2_id TEXT, player2_name TEXT NOT NULL, player2_ao5 REAL,
          winner INTEGER, results TEXT NOT NULL, UNIQUE(race,game));
        CREATE INDEX IF NOT EXISTS idx_duel_games_ended ON duel_games(ended_at);
        CREATE INDEX IF NOT EXISTS idx_duel_games_player1 ON duel_games(player1_id);
        CREATE INDEX IF NOT EXISTS idx_duel_games_player2 ON duel_games(player2_id);
        CREATE INDEX IF NOT EXISTS idx_solves_created ON solves(created_at);
        CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at);`); err != nil {
		return err
	}
	if err := addColumnIfMissing(db, "users", "last_seen_at", "INTEGER"); err != nil {
		return err
	}
	for _, column := range []string{"created_at", "last_used_at"} {
		if err := addColumnIfMissing(db, "auth_tokens", column, "INTEGER"); err != nil {
			return err
		}
	}
	return nil
}

// ActivityActor is who a response concerns, set by handlers with `setActor`. `seen` marks the account's
// own activity (it updates `last_seen_at` and the daily activity); an administrator acting on an
// account sets `seen: false`. `token` is the SHA-256 of the bearer token, kept in memory only to
// update that session's `last_used_at`.
type ActivityActor struct {
	user  string
	token *string
	seen  bool
}

type ActivityEntry struct {
	at     int64
	ip     netip.Addr
	method string
	path   string
	status int
	ms     float64
	agent  *string
	actor  *ActivityActor
}

type ActivityPlayer struct {
	user    *string
	name    string
	results any
	ao5     *float64
}

type ActivityGame struct {
	race    string
	game    uint32
	event   string
	players [2]ActivityPlayer
	// The winning seat; nil for a draw.
	winner *int
}

type activityEvent struct {
	request *ActivityEntry
	seen    string
	duel    *ActivityGame
	// A flush stores the pending events; with `everything` false, not if they are only the
	// administration's own reads.
	done       chan struct{}
	everything bool
}

type ActivityLog struct {
	tx        chan activityEvent
	important *broadcaster[M]
	dropped   *atomic.Uint64
}

// broadcaster is tokio's broadcast channel: each subscriber has its own bounded queue and misses what overflows it.
type broadcaster[T any] struct {
	mu   sync.Mutex
	subs map[chan T]struct{}
	size int
}

func newBroadcaster[T any](size int) *broadcaster[T] {
	return &broadcaster[T]{subs: map[chan T]struct{}{}, size: size}
}

func (b *broadcaster[T]) send(v T) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for ch := range b.subs {
		select {
		case ch <- v:
		default:
		}
	}
}

// subscribe returns the receiving end and the function that ends the subscription.
func (b *broadcaster[T]) subscribe() (<-chan T, func()) {
	ch := make(chan T, b.size)
	b.mu.Lock()
	b.subs[ch] = struct{}{}
	b.mu.Unlock()
	return ch, func() {
		b.mu.Lock()
		delete(b.subs, ch)
		b.mu.Unlock()
	}
}

// activityClassify: the route category of a request and whether the administration should see it among the
// important events; `store` is false for successful static files, which are only counted.
func activityClassify(method, path string, status int) (kind string, important bool, store bool) {
	api := path == "/api" || strings.HasPrefix(path, "/api/")
	admin := strings.HasPrefix(path, "/api/admin/")
	accountDeletion := method == "DELETE" &&
		(path == "/api/auth/me" || path == "/api/account" ||
			(admin && strings.HasPrefix(path, "/api/admin/users/") && strings.Count(path, "/") == 4))
	name := path[strings.LastIndex(path, "/")+1:]
	file := strings.Contains(name, ".") && !strings.HasSuffix(name, ".html")
	switch {
	case status == 429:
		kind = "rate-limit"
	case status >= 500:
		kind = "server-error"
	case accountDeletion:
		kind = "account"
	case strings.HasPrefix(path, "/api/auth/") && !(method == "GET" && path == "/api/auth/me"):
		kind = "auth"
	case admin:
		kind = "admin"
	case strings.HasPrefix(path, "/api/mobile/") && method != "GET" && method != "HEAD":
		kind = "release"
	case !api && status == 404:
		kind = "not-found"
	case status >= 400 && status < 500:
		kind = "client-error"
	case path == "/api/sync":
		kind = "sync"
	case path == "/api/live":
		kind = "live"
	case strings.HasPrefix(path, "/api/mobile/"):
		kind = "mobile"
	case api:
		kind = "api"
	case file:
		kind = "asset"
	default:
		kind = "page"
	}
	switch kind {
	case "rate-limit", "server-error", "account", "auth", "release", "client-error":
		important = true
	case "admin":
		important = method != "GET" || status >= 400
	}
	return kind, important, kind != "asset" || status >= 400
}

// activityDay: `YYYY-MM-DD` of a UTC millisecond timestamp.
func activityDay(ms int64) string {
	return time.UnixMilli(ms).UTC().Format("2006-01-02")
}

// activityIsoTime: `2026-09-17T10:04:05.006Z`: a UTC millisecond timestamp as SQLite's
// `strftime('%Y-%m-%dT%H:%M:%fZ')` writes it.
func activityIsoTime(ms int64) string {
	return time.UnixMilli(ms).UTC().Format("2006-01-02T15:04:05.000Z")
}

// activityLastDays: the UTC days from `days - 1` days ago to today, oldest first.
func activityLastDays(days int64) []string {
	today := accountsNow()
	out := make([]string, 0, days)
	for i := days - 1; i >= 0; i-- {
		out = append(out, activityDay(today-i*accountsDayMs))
	}
	return out
}

func newActivityLog(db *Db) *ActivityLog {
	l := &ActivityLog{tx: make(chan activityEvent, activityQueue), important: newBroadcaster[M](256), dropped: &atomic.Uint64{}}
	go activityWriter(db, l.tx, l.important)
	return l
}

func (l *ActivityLog) send(event activityEvent) {
	select {
	case l.tx <- event:
	default:
		l.dropped.Add(1)
	}
}

func (l *ActivityLog) request(entry ActivityEntry) {
	l.send(activityEvent{request: &entry})
}

// seen: an account is active without an HTTP request, on a live socket.
func (l *ActivityLog) seen(user string) {
	l.send(activityEvent{seen: user})
}

func (l *ActivityLog) duel(game ActivityGame) {
	l.send(activityEvent{duel: &game})
}

// droppedCount: records dropped because the queue was full (a flood faster than SQLite).
func (l *ActivityLog) droppedCount() uint64 {
	return l.dropped.Load()
}

// subscribe: newly stored important requests, as the administration lists them.
func (l *ActivityLog) subscribe() (<-chan M, func()) {
	return l.important.subscribe()
}

func (l *ActivityLog) wait(everything bool) {
	done := make(chan struct{}, 1)
	l.tx <- activityEvent{done: done, everything: everything}
	select {
	case <-done:
	case <-time.After(5 * time.Second):
	}
}

// flush waits until everything recorded so far is in the database.
func (l *ActivityLog) flush() {
	l.wait(true)
}

// settle waits until what an administration read expects is in the database: everything recorded
// so far, except when only the administration's own reads are pending (they wait for the
// next batch rather than forcing a write per admin request).
func (l *ActivityLog) settle() {
	l.wait(false)
}

type activityTraffic struct {
	requests, errors, serverErrors, limited, first, last int64
}

type activityRow struct {
	entry     *ActivityEntry
	kind      string
	important bool
}

type activityBatchState struct {
	rows     []activityRow
	traffic  map[[2]string]*activityTraffic
	ipUsers  map[[3]string]struct{}
	activity map[[2]string]int64
	seen     [][2]any
	used     [][2]any
	games    []*ActivityGame
	events   int
	// Holds something other than the administration's own reads.
	urgent bool
}

func newActivityBatch() *activityBatchState {
	return &activityBatchState{traffic: map[[2]string]*activityTraffic{}, ipUsers: map[[3]string]struct{}{}, activity: map[[2]string]int64{}}
}

// activityThrottle throttles per-key writes to once a minute, with a bounded memory.
type activityThrottle map[string]int64

func (t activityThrottle) due(key string, at int64) bool {
	if last, ok := t[key]; ok && at-last < activitySeenEveryMs {
		return false
	}
	if len(t) >= 50_000 {
		for k, last := range t {
			if at-last >= activitySeenEveryMs {
				delete(t, k)
			}
		}
	}
	t[key] = at
	return true
}

func activityAdd(batch *activityBatchState, event activityEvent, seen, used activityThrottle) {
	batch.events++
	switch {
	case event.request != nil:
		entry := event.request
		kind, important, store := activityClassify(entry.method, entry.path, entry.status)
		batch.urgent = batch.urgent || kind != "admin" || important
		today := activityDay(entry.at)
		ip := entry.ip.String()
		t, ok := batch.traffic[[2]string{today, ip}]
		if !ok {
			t = &activityTraffic{first: entry.at}
			batch.traffic[[2]string{today, ip}] = t
		}
		t.requests++
		if entry.status >= 400 {
			t.errors++
		}
		if entry.status >= 500 {
			t.serverErrors++
		}
		if entry.status == 429 {
			t.limited++
		}
		t.first = min(t.first, entry.at)
		t.last = max(t.last, entry.at)
		if actor := entry.actor; actor != nil && actor.seen {
			batch.ipUsers[[3]string{today, ip, actor.user}] = struct{}{}
			batch.activity[[2]string{actor.user, today}]++
			if seen.due(actor.user, entry.at) {
				batch.seen = append(batch.seen, [2]any{actor.user, entry.at})
			}
			if actor.token != nil && used.due(*actor.token, entry.at) {
				batch.used = append(batch.used, [2]any{*actor.token, entry.at})
			}
		}
		if store {
			batch.rows = append(batch.rows, activityRow{entry: entry, kind: kind, important: important})
		}
	case event.duel != nil:
		batch.urgent = true
		batch.games = append(batch.games, event.duel)
	default:
		batch.urgent = true
		at := accountsNow()
		if seen.due(event.seen, at) {
			key := [2]string{event.seen, activityDay(at)}
			batch.activity[key] += 0
			batch.seen = append(batch.seen, [2]any{event.seen, at})
		}
	}
}

// activityRowColumns: a request log row as the administration receives it.
const activityRowColumns = "l.id,l.at,l.ip,l.method,l.path,l.status,l.duration_ms AS durationMs,l.user_id AS userId,u.username,l.user_agent AS userAgent,l.kind,l.important"

func activityRowValue(value M) M {
	value["important"] = eqInt(value["important"], 1)
	return value
}

func activityWrite(db *Conn, batch *activityBatchState) ([]M, error) {
	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	important := []M{}
	// Each important row as `activityRowColumns` lists it, built from the entry: usernames are
	// looked up once per account and batch.
	names := map[string]any{}
	for _, row := range batch.rows {
		entry := row.entry
		var user any
		if entry.actor != nil {
			user = entry.actor.user
		}
		ms := math.Round(entry.ms*100) / 100
		if _, err := db.Exec("INSERT INTO request_log(at,ip,method,path,status,duration_ms,user_id,user_agent,kind,important) VALUES(?,?,?,?,?,?,?,?,?,?)",
			entry.at, entry.ip.String(), entry.method, entry.path, entry.status, ms, user, entry.agent, row.kind, row.important); err != nil {
			return nil, err
		}
		if row.important {
			id := db.LastInsertRowid()
			var name any
			if user != nil {
				var ok bool
				if name, ok = names[entry.actor.user]; !ok {
					found, err := dbOne(db, "SELECT username FROM users WHERE id=?", entry.actor.user)
					if err != nil {
						return nil, err
					}
					if found != nil {
						name = found["username"]
					}
					names[entry.actor.user] = name
				}
			}
			important = append(important, M{
				"id": id, "at": entry.at, "ip": entry.ip.String(),
				"method": entry.method, "path": entry.path, "status": entry.status,
				"durationMs": ms, "userId": user,
				"username": name, "userAgent": entry.agent, "kind": row.kind, "important": true,
			})
		}
	}
	for key, t := range batch.traffic {
		if _, err := db.Exec(`INSERT INTO traffic_daily(day,ip,requests,errors,server_errors,limited,first_at,last_at) VALUES(?,?,?,?,?,?,?,?)
            ON CONFLICT(day,ip) DO UPDATE SET requests=requests+excluded.requests,errors=errors+excluded.errors,
            server_errors=server_errors+excluded.server_errors,limited=limited+excluded.limited,
            first_at=min(first_at,excluded.first_at),last_at=max(last_at,excluded.last_at)`,
			key[0], key[1], t.requests, t.errors, t.serverErrors, t.limited, t.first, t.last); err != nil {
			return nil, err
		}
	}
	for key := range batch.ipUsers {
		if _, err := db.Exec("INSERT OR IGNORE INTO traffic_daily_users(day,ip,user_id) SELECT ?1,?2,?3 WHERE EXISTS(SELECT 1 FROM users WHERE id=?3)", key[0], key[1], key[2]); err != nil {
			return nil, err
		}
	}
	for key, requests := range batch.activity {
		if _, err := db.Exec(`INSERT INTO user_activity(user_id,day,requests) SELECT ?1,?2,?3 WHERE EXISTS(SELECT 1 FROM users WHERE id=?1)
            ON CONFLICT(user_id,day) DO UPDATE SET requests=requests+excluded.requests`, key[0], key[1], requests); err != nil {
			return nil, err
		}
	}
	for _, s := range batch.seen {
		if _, err := db.Exec("UPDATE users SET last_seen_at=max(coalesce(last_seen_at,0),?) WHERE id=?", s[1], s[0]); err != nil {
			return nil, err
		}
	}
	for _, u := range batch.used {
		if _, err := db.Exec("UPDATE auth_tokens SET last_used_at=max(coalesce(last_used_at,0),?) WHERE token_hash=?", u[1], u[0]); err != nil {
			return nil, err
		}
	}
	for _, g := range batch.games {
		a, b := g.players[0], g.players[1]
		// An account deleted while it raced leaves no id behind.
		exists := func(user *string) (any, error) {
			if user == nil {
				return nil, nil
			}
			row, err := dbOne(db, "SELECT id FROM users WHERE id=?", *user)
			if err != nil || row == nil {
				return nil, err
			}
			return row["id"], nil
		}
		first, err := exists(a.user)
		if err != nil {
			return nil, err
		}
		second, err := exists(b.user)
		if err != nil {
			return nil, err
		}
		var winner any
		if g.winner != nil {
			winner = int64(*g.winner)
		}
		if _, err := db.Exec("INSERT OR IGNORE INTO duel_games(race,game,event,ended_at,player1_id,player1_name,player1_ao5,player2_id,player2_name,player2_ao5,winner,results) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
			g.race, g.game, g.event, accountsNow(), first, a.name, a.ao5, second, b.name, b.ao5, winner, encodeJSON([]any{a.results, b.results})); err != nil {
			return nil, err
		}
	}
	return important, tx.Commit()
}

func activityPrune(db *Conn) error {
	at := accountsNow()
	if _, err := db.Exec("DELETE FROM request_log WHERE at<?", at-activityRetentionDays*accountsDayMs); err != nil {
		return err
	}
	for _, c := range [][2]int64{{0, activityMaxRows}, {1, activityMaxImportantRows}} {
		if _, err := db.Exec("DELETE FROM request_log WHERE important=?1 AND id<(SELECT id FROM request_log WHERE important=?1 ORDER BY id DESC LIMIT 1 OFFSET ?2)", c[0], c[1]-1); err != nil {
			return err
		}
	}
	traffic := activityDay(at - activityTrafficDays*accountsDayMs)
	if _, err := db.Exec("DELETE FROM traffic_daily WHERE day<?", traffic); err != nil {
		return err
	}
	if _, err := db.Exec("DELETE FROM traffic_daily_users WHERE day<?", traffic); err != nil {
		return err
	}
	_, err := db.Exec("DELETE FROM user_activity WHERE day<?", activityDay(at-activityActivityDays*accountsDayMs))
	return err
}

func activityWriter(db *Db, rx chan activityEvent, important *broadcaster[M]) {
	batch := newActivityBatch()
	seen, used := activityThrottle{}, activityThrottle{}
	tick := time.NewTicker(time.Second)
	// The first tick is immediate: old rows go at startup, then hourly.
	hourly := time.NewTimer(0)
	store := func() {
		if batch.events == 0 {
			return
		}
		pending := batch
		batch = newActivityBatch()
		rows, err := dbCall(db, func(c *Conn) ([]M, error) { return activityWrite(c, pending) })
		if err != nil {
			fmt.Fprintf(os.Stderr, "Request log: %s\n", toApiError(err).Message)
			return
		}
		for _, row := range rows {
			important.send(row)
		}
	}
	for {
		select {
		case event := <-rx:
			if event.done != nil {
				if event.everything || batch.urgent {
					store()
				}
				event.done <- struct{}{}
				continue
			}
			activityAdd(batch, event, seen, used)
			if batch.events >= activityBatch {
				store()
			}
		case <-tick.C:
			store()
		case <-hourly.C:
			if err := db.Call(activityPrune); err != nil {
				fmt.Fprintf(os.Stderr, "Request log pruning: %s\n", toApiError(err).Message)
			}
			hourly.Reset(time.Hour)
		}
	}
}
