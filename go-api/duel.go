package main

// One-on-one races: players queue for an event, get paired with someone of a similar level among those
// searching, then race an Ao5 on the same five scrambles. There is no rating: the level each player sends is the
// average of their recent solves on that event, and the range accepted around it widens the longer they wait.
// The server pairs, relays timers and chat, and keeps the score; the scrambles come from the first player.

import (
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/gorilla/websocket"
)

const duelRounds = 5

// Levels within 15% of each other are paired at once; the range widens by 3% per second of waiting.
const duelRange = 0.15
const duelRangePerSecond = 0.03

// After this long anyone searching the same event will do.
const duelAnyoneAfter = 30 * time.Second

// Players without a level meet each other at once, and anyone else after this long.
const duelUnknownAfter = 10 * time.Second

var duelPhases = [4]string{"idle", "holding", "ready", "running"}
var duelPenalties = [3]string{"none", "+2", "dnf"}

func isOneOf(s string, list []string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

// wsOutbox is an unbounded queue of serialised messages for one socket (tokio's unbounded mpsc): senders never block,
// the socket's loop wakes on `wake` and writes what is queued.
type wsOutbox struct {
	mu    sync.Mutex
	queue []string
	wake  chan struct{}
}

func newWsOutbox() *wsOutbox {
	return &wsOutbox{wake: make(chan struct{}, 1)}
}

func (o *wsOutbox) send(message string) {
	o.mu.Lock()
	o.queue = append(o.queue, message)
	o.mu.Unlock()
	select {
	case o.wake <- struct{}{}:
	default:
	}
}

// flush writes every queued message to the socket; false once a write fails.
func (o *wsOutbox) flush(conn *websocket.Conn) bool {
	o.mu.Lock()
	queue := o.queue
	o.queue = nil
	o.mu.Unlock()
	for _, message := range queue {
		if conn.WriteMessage(websocket.TextMessage, []byte(message)) != nil {
			return false
		}
	}
	return true
}

type duelWaiting struct {
	id   string
	name string
	// The account behind the socket, when it sent a valid token ("" otherwise).
	user  string
	event string
	level *float64
	since time.Time
	tx    *wsOutbox
}

// duelMs is a rounded time as serde_json writes an f64: `9001.0`, so stored games read as Rust wrote them.
type duelMs float64

func (ms duelMs) MarshalJSON() ([]byte, error) {
	return []byte(strconv.FormatFloat(float64(ms), 'f', 1, 64)), nil
}

type duelSolve struct {
	ms      duelMs
	penalty string
}

type duelSeat struct {
	id    string
	name  string
	user  string
	level *float64
	// nil once the player has left.
	tx      *wsOutbox
	results []*duelSolve
	rematch bool
}

type duelRace struct {
	id        string
	event     string
	seats     [2]*duelSeat
	scrambles []string
	game      uint32
	// Whether the current game, once over, went to the administration's statistics.
	recorded bool
}

// round: the round being raced: the first one someone has not finished.
func (r *duelRace) round() int {
	for i := 0; i < duelRounds; i++ {
		for _, s := range r.seats {
			if s.results[i] == nil {
				return i
			}
		}
	}
	return duelRounds
}

func (r *duelRace) over() bool {
	return r.round() == duelRounds
}

func (r *duelRace) send(seat int, value M) {
	if tx := r.seats[seat].tx; tx != nil {
		tx.send(encodeJSON(value))
	}
}

func (r *duelRace) broadcast(value M) {
	for seat := range r.seats {
		r.send(seat, value)
	}
}

func duelResults(results []*duelSolve) []any {
	out := make([]any, len(results))
	for i, r := range results {
		if r != nil {
			out[i] = M{"ms": r.ms, "penalty": r.penalty}
		}
	}
	return out
}

// record: the finished game for the statistics, once: when a rematch starts or someone leaves.
func (r *duelRace) record() *ActivityGame {
	if !r.over() || r.recorded {
		return nil
	}
	r.recorded = true
	player := func(s *duelSeat) ActivityPlayer {
		times := make([]*float64, len(s.results))
		for i, r := range s.results {
			if r != nil {
				times[i] = statsEffectiveMs(float64(r.ms), r.penalty)
			}
		}
		var user *string
		if s.user != "" {
			u := s.user
			user = &u
		}
		return ActivityPlayer{user: user, name: s.name, results: duelResults(s.results), ao5: statsAverage(times)}
	}
	players := [2]ActivityPlayer{player(r.seats[0]), player(r.seats[1])}
	// Lower wins, a DNF average loses to any time, two DNFs draw.
	var winner *int
	a, b := players[0].ao5, players[1].ao5
	seat := -1
	switch {
	case a != nil && b != nil && *a < *b:
		seat = 0
	case a != nil && b != nil && *b < *a:
		seat = 1
	case a != nil && b == nil:
		seat = 0
	case a == nil && b != nil:
		seat = 1
	}
	if seat >= 0 {
		winner = &seat
	}
	return &ActivityGame{race: r.id, game: r.game, event: r.event, players: players, winner: winner}
}

func (r *duelRace) state() M {
	results, rematch, present := []any{}, []any{}, []any{}
	for _, s := range r.seats {
		results = append(results, duelResults(s.results))
		rematch = append(rematch, s.rematch)
		present = append(present, s.tx != nil)
	}
	scrambles := r.scrambles
	if scrambles == nil {
		scrambles = []string{}
	}
	return M{"type": "state", "game": r.game, "scrambles": scrambles, "results": results, "rematch": rematch, "present": present}
}

type duelSeatRef struct {
	race string
	seat int
}

type duelInner struct {
	queue []*duelWaiting
	races map[string]*duelRace
	// Race and seat of each player in a race.
	seats map[string]duelSeatRef
}

func newDuelInner() *duelInner {
	return &duelInner{races: map[string]*duelRace{}, seats: map[string]duelSeatRef{}}
}

// DuelArena: the queue and the races under way.
type DuelArena struct {
	mu    sync.Mutex
	inner *duelInner
	log   *ActivityLog
}

// duelGap: how far apart two levels are, if they may meet now: a ratio, 0 for equal levels. An account signed in
// on two devices searches on both, but never meets itself.
func duelGap(a, b *duelWaiting, now time.Time) (float64, bool) {
	if a.user != "" && a.user == b.user {
		return 0, false
	}
	since := a.since
	if b.since.Before(since) {
		since = b.since
	}
	waited := now.Sub(since)
	switch {
	case a.level != nil && b.level != nil:
		x, y := *a.level, *b.level
		gap := math.Max(x, y)/math.Min(x, y) - 1
		return gap, gap <= duelRange+duelRangePerSecond*waited.Seconds() || waited >= duelAnyoneAfter
	case a.level == nil && b.level == nil:
		return 0, true
	}
	// Behind every known level that could have matched.
	return math.MaxFloat64, waited >= duelUnknownAfter
}

func newDuelArena(log *ActivityLog) *DuelArena {
	return &DuelArena{inner: newDuelInner(), log: log}
}

func (a *DuelArena) keep(game *ActivityGame) {
	if a.log != nil && game != nil {
		a.log.duel(*game)
	}
}

func (inner *duelInner) raceOf(id string) (*duelRace, int) {
	ref, ok := inner.seats[id]
	if !ok {
		return nil, 0
	}
	return inner.races[ref.race], ref.seat
}

// pair pairs the players waiting longest with the closest level they may meet.
func (inner *duelInner) pair() {
	now := time.Now()
	sort.SliceStable(inner.queue, func(i, j int) bool { return inner.queue[i].since.Before(inner.queue[j].since) })
	for i := 0; i < len(inner.queue); {
		best, bestGap := -1, 0.0
		for j := range inner.queue {
			if j == i || inner.queue[j].event != inner.queue[i].event {
				continue
			}
			if g, ok := duelGap(inner.queue[i], inner.queue[j], now); ok && (best < 0 || g < bestGap) {
				best, bestGap = j, g
			}
		}
		if best < 0 {
			i++
			continue
		}
		lo, hi := min(i, best), max(i, best)
		first, second := inner.queue[lo], inner.queue[hi]
		inner.queue = append(inner.queue[:hi], inner.queue[hi+1:]...)
		inner.queue = append(inner.queue[:lo], inner.queue[lo+1:]...)
		id := newUUID()
		seat := func(w *duelWaiting) *duelSeat {
			return &duelSeat{id: w.id, name: w.name, user: w.user, level: w.level, tx: w.tx, results: make([]*duelSolve, duelRounds)}
		}
		race := &duelRace{id: id, event: first.event, seats: [2]*duelSeat{seat(first), seat(second)}, game: 1}
		players := []any{}
		for _, s := range race.seats {
			var level any
			if s.level != nil {
				level = *s.level
			}
			players = append(players, M{"name": s.name, "level": level})
		}
		for seat := range race.seats {
			inner.seats[race.seats[seat].id] = duelSeatRef{race: id, seat: seat}
			race.send(seat, M{"type": "match", "race": id, "seat": seat, "host": seat == 0, "event": race.event, "players": players})
		}
		race.broadcast(race.state())
		inner.races[id] = race
	}
}

// status tells everyone searching how many others search the same event.
func (inner *duelInner) status() {
	for _, w := range inner.queue {
		others := -1
		for _, o := range inner.queue {
			if o.event == w.event {
				others++
			}
		}
		w.tx.send(encodeJSON(M{"type": "queue", "searching": others}))
	}
}

func (a *DuelArena) tick() {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.inner.pair()
	a.inner.status()
}

func (a *DuelArena) queue(waiting *duelWaiting) {
	a.leave(waiting.id)
	a.mu.Lock()
	defer a.mu.Unlock()
	waiting.tx.send(encodeJSON(M{"type": "queued"}))
	a.inner.queue = append(a.inner.queue, waiting)
	a.inner.pair()
	a.inner.status()
}

// leave: out of the queue, or out of a race: the opponent is told and the race ends once both are gone.
func (a *DuelArena) leave(id string) {
	a.mu.Lock()
	inner := a.inner
	kept := inner.queue[:0]
	for _, w := range inner.queue {
		if w.id != id {
			kept = append(kept, w)
		}
	}
	inner.queue = kept
	ref, ok := inner.seats[id]
	if !ok {
		a.mu.Unlock()
		return
	}
	delete(inner.seats, id)
	race, ok := inner.races[ref.race]
	if !ok {
		a.mu.Unlock()
		return
	}
	game := race.record()
	race.seats[ref.seat].tx = nil
	race.seats[ref.seat].rematch = false
	race.send(1-ref.seat, M{"type": "left"})
	race.broadcast(race.state())
	if race.seats[0].tx == nil && race.seats[1].tx == nil {
		delete(inner.races, ref.race)
	}
	a.mu.Unlock()
	a.keep(game)
}

// play: a message of a player in a race; wrong or late messages are ignored.
func (a *DuelArena) play(id string, body any) {
	a.mu.Lock()
	var game *ActivityGame
	defer func() {
		a.mu.Unlock()
		a.keep(game)
	}()
	race, seat := a.inner.raceOf(id)
	if race == nil {
		return
	}
	other := 1 - seat
	round := func(key string) (int, bool) {
		r, ok := asUint(idx(body, key))
		return int(r), ok && r < duelRounds
	}
	penalty := func() (string, bool) {
		p, ok := asStr(idx(body, "penalty"))
		return p, ok && isOneOf(p, duelPenalties[:])
	}
	switch str(idx(body, "type")) {
	case "scrambles":
		var list []string
		if items, ok := asArray(idx(body, "list")); ok {
			list = []string{}
			for _, v := range items {
				s, ok := asStr(v)
				if !ok || len(s) < 1 || len(s) > 2000 {
					list = nil
					break
				}
				list = append(list, s)
			}
		}
		if seat != 0 || len(race.scrambles) > 0 {
			return
		}
		if len(list) != duelRounds {
			return
		}
		race.scrambles = list
		race.broadcast(race.state())
	case "timer":
		if phase, ok := asStr(idx(body, "phase")); ok && isOneOf(phase, duelPhases[:]) && len(race.scrambles) > 0 {
			race.send(other, M{"type": "timer", "phase": phase})
		}
	case "solve":
		r, okR := round("round")
		ms, okMs := asFloat(idx(body, "ms"))
		okMs = okMs && !math.IsInf(ms, 0) && !math.IsNaN(ms) && ms > 0 && ms < 3_600_000
		p, okP := penalty()
		if !okR || !okMs || !okP {
			return
		}
		if len(race.scrambles) == 0 || r != race.round() || race.seats[seat].results[r] != nil {
			return
		}
		race.seats[seat].results[r] = &duelSolve{ms: duelMs(math.Round(ms)), penalty: p}
		race.broadcast(race.state())
	case "penalty":
		r, okR := round("round")
		p, okP := penalty()
		if !okR || !okP {
			return
		}
		if solve := race.seats[seat].results[r]; solve != nil {
			solve.penalty = p
			race.broadcast(race.state())
		}
	// A solve can be taken back while the round is open, to redo it on the same scramble.
	case "cancel":
		r, ok := round("round")
		if !ok {
			return
		}
		if race.seats[other].results[r] == nil && race.seats[seat].results[r] != nil {
			race.seats[seat].results[r] = nil
			race.send(other, M{"type": "timer", "phase": "idle"})
			race.broadcast(race.state())
		}
	case "chat":
		text, ok := asStr(idx(body, "text"))
		text = strings.TrimSpace(text)
		if n := utf8.RuneCountInString(text); !ok || n < 1 || n > 300 {
			return
		}
		race.broadcast(M{"type": "chat", "seat": seat, "text": text})
	case "rematch":
		if !race.over() || race.seats[other].tx == nil {
			return
		}
		race.seats[seat].rematch = true
		if race.seats[0].rematch && race.seats[1].rematch {
			game = race.record()
			race.game++
			race.recorded = false
			race.scrambles = nil
			for _, s := range race.seats {
				s.rematch = false
				s.results = make([]*duelSolve, duelRounds)
			}
		}
		race.broadcast(race.state())
	}
}

// duelRun pairs players whose range widened while they waited, and keeps their search counts current.
func duelRun(arena *DuelArena) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		arena.tick()
		<-ticker.C
	}
}

var duelUpgrader = wsUpgrader(4096)

func duelUpgrade(state *AppState, w http.ResponseWriter, r *http.Request) {
	conn, err := duelUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	conn.SetReadLimit(16384)
	duelPlayer(state, conn)
}

// duelName: signed-in players race under their username, guests under a short name of their socket.
// The account id, guest accounts included, goes to the statistics only.
func duelName(state *AppState, id string, token *string) (string, string) {
	var user M
	if token != nil {
		user, _ = dbCall(state.db, func(db *Conn) (M, error) { return accountsAuth(db, "Bearer "+*token) })
	}
	account := str(idx(user, "id"))
	name := "guest-" + strings.ReplaceAll(id, "-", "")[:4]
	if user != nil && user["password_hash"] != nil {
		if username, ok := asStr(user["username"]); ok {
			name = username
		}
	}
	return name, account
}

func duelPlayer(state *AppState, conn *websocket.Conn) {
	defer conn.Close()
	id := newUUID()
	tx := newWsOutbox()
	named := false
	var playerName, playerUser string
	// A burst of 30 messages, then 3 a second: a solve takes a handful, chat a few more.
	tokens, at := 30.0, time.Now()
	// Clients ping every 20 seconds; a silent socket is gone.
	idle := time.NewTimer(60 * time.Second)
	defer idle.Stop()
	incoming, stop := wsReceive(conn)
	defer stop()
	defer state.duel.leave(id)
	for {
		select {
		case <-idle.C:
			return
		case <-tx.wake:
			if !tx.flush(conn) {
				return
			}
		case message := <-incoming:
			if message.err != nil {
				return
			}
			switch message.kind {
			case websocket.PingMessage, websocket.PongMessage:
				continue
			case websocket.TextMessage:
			default:
				return
			}
			idle.Reset(60 * time.Second)
			tokens = min(tokens+time.Since(at).Seconds()*3, 30)
			at = time.Now()
			if tokens < 1 {
				continue
			}
			tokens--
			body, err := decodeJSON(message.data)
			if err != nil {
				return
			}
			switch str(idx(body, "type")) {
			case "ping":
				tx.send(encodeJSON(M{"type": "pong"}))
			case "queue":
				event, err := apiString(body, "event", 1, 16)
				if err != nil {
					continue
				}
				alphanumeric := true
				for i := 0; i < len(event); i++ {
					c := event[i]
					alphanumeric = alphanumeric && ('a' <= c && c <= 'z' || 'A' <= c && c <= 'Z' || '0' <= c && c <= '9')
				}
				if !alphanumeric {
					continue
				}
				var level *float64
				if l, ok := asFloat(idx(body, "level")); ok && !math.IsInf(l, 0) && !math.IsNaN(l) && l > 0 && l < 3_600_000 {
					level = &l
				}
				if !named {
					var token *string
					if t, err := apiString(body, "token", 1, 128); err == nil {
						token = &t
					}
					playerName, playerUser = duelName(state, id, token)
					named = true
				}
				state.duel.queue(&duelWaiting{id: id, name: playerName, user: playerUser, event: event, level: level, since: time.Now(), tx: tx})
			case "leave":
				state.duel.leave(id)
			default:
				state.duel.play(id, body)
			}
		}
	}
}
