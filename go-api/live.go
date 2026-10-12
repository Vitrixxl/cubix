package main

// The app's socket, /api/live: one per open app, signed in or not. It carries every live feature, each message naming
// its channel in both directions:
//
//   - "live": the connection itself: the app's `auth` first, the server's `ready`;
//   - "sync": the account's practice data: uploads and pulls answered by `requestId`, changes streamed as they happen;
//   - "coaching": chat messages, bookings, presence and the signalling of calls;
//   - "social": the community's events (server to app only);
//   - "duel": the one-on-one races, their queue included;
//   - "match": the battles and tournament matches open on screen, each named by its id.
//
// The server pings every socket; browsers answer protocol pings themselves, even in a background tab whose timers are
// throttled, so an open app needs no message of its own to stay connected.

import (
	"errors"
	"net/http"
	"net/netip"
	"os"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

// LiveSlot: live sockets indexed by account. Signals are coalesced, so a burst of changes produces at most
// one sync message per socket.
type LiveSlot struct {
	pending atomic.Bool
	cursor  atomic.Int64
	wake    chan struct{}
}

func newLiveSlot() *LiveSlot {
	return &LiveSlot{wake: make(chan struct{}, 1)}
}

// notify is tokio's Notify::notify_one: a wake-up is kept until taken.
func (s *LiveSlot) notify() {
	select {
	case s.wake <- struct{}{}:
	default:
	}
}

type LiveHub struct {
	mu      sync.Mutex
	sockets map[string]map[string]*LiveSlot
}

func newLiveHub() *LiveHub {
	return &LiveHub{sockets: map[string]map[string]*LiveSlot{}}
}

func (h *LiveHub) add(user, id string, slot *LiveSlot) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.sockets[user] == nil {
		h.sockets[user] = map[string]*LiveSlot{}
	}
	h.sockets[user][id] = slot
}

func (h *LiveHub) remove(user, id string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if sockets, ok := h.sockets[user]; ok {
		delete(sockets, id)
		if len(sockets) == 0 {
			delete(h.sockets, user)
		}
	}
}

// notifySync: the user's own practice data changed up to `cursor`; every device of that account pulls.
func (h *LiveHub) notifySync(user string, cursor int64) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, slot := range h.sockets[user] {
		for {
			old := slot.cursor.Load()
			if old >= cursor || slot.cursor.CompareAndSwap(old, cursor) {
				break
			}
		}
		slot.pending.Store(true)
		slot.notify()
	}
}

// wsUpgrader accepts any origin, as axum's WebSocketUpgrade does.
func wsUpgrader(readBuffer int) *websocket.Upgrader {
	return &websocket.Upgrader{ReadBufferSize: readBuffer, CheckOrigin: func(*http.Request) bool { return true }}
}

// wsMessage is one item of a socket's stream (axum's `socket.recv()`): a text or binary message, a ping or a
// pong (kind websocket.PingMessage / PongMessage, already answered), or the error that ends the stream.
type wsMessage struct {
	kind int
	data []byte
	err  error
}

// wsReceive reads the socket on its own goroutine, so a loop can select on its messages; `stop` ends it.
func wsReceive(conn *websocket.Conn) (messages <-chan wsMessage, stop func()) {
	out := make(chan wsMessage)
	done := make(chan struct{})
	deliver := func(m wsMessage) bool {
		select {
		case out <- m:
			return true
		case <-done:
			return false
		}
	}
	answer := conn.PingHandler()
	conn.SetPingHandler(func(data string) error {
		err := answer(data)
		deliver(wsMessage{kind: websocket.PingMessage})
		return err
	})
	conn.SetPongHandler(func(string) error {
		deliver(wsMessage{kind: websocket.PongMessage})
		return nil
	})
	go func() {
		for {
			kind, data, err := conn.ReadMessage()
			if !deliver(wsMessage{kind: kind, data: data, err: err}) || err != nil {
				return
			}
		}
	}()
	var once sync.Once
	return out, func() { once.Do(func() { close(done) }) }
}

// wsSend sends a JSON text message, failing after `timeout`.
func wsSend(conn *websocket.Conn, value any, timeout time.Duration) bool {
	_ = conn.SetWriteDeadline(time.Now().Add(timeout))
	return conn.WriteMessage(websocket.TextMessage, []byte(encodeJSON(value))) == nil
}

// wsClose sends a close frame.
func wsClose(conn *websocket.Conn, code int, reason string) {
	_ = conn.SetWriteDeadline(time.Time{})
	_ = conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(code, reason))
}

var liveUpgrader = wsUpgrader(16384)

// livePing: how often the server pings each socket (CUBIX_PING_SECONDS, 30 by default). A socket that sends nothing,
// not even a pong, for three of these is gone.
var livePing = func() time.Duration {
	if n, err := strconv.ParseUint(os.Getenv("CUBIX_PING_SECONDS"), 10, 16); err == nil && n > 0 {
		return time.Duration(n) * time.Second
	}
	return 30 * time.Second
}()

// The largest message of each channel; the read limit is the largest of them, a batch of practice uploads.
const liveSyncMax = 2 * 1024 * 1024

// Offers and answers carry a whole session description: a few kilobytes, rarely more than 16.
const liveCoachingMax = 65536
const liveGameMax = 16384

// Caps on open sockets. Each costs a few dozen kilobytes (buffers, two goroutines), so 8192 stay well within the Pi's
// memory. Apps without an account (duels and matches need none) may hold half of them, so a flood of those from many
// addresses leaves room for accounts; a household or a club behind one address still opens a few tabs each.
const liveMaxSockets = 8192
const liveMaxAnonymous = 4096
const liveMaxPerIP = 64
const liveMaxAnonymousPerIP = 8

type liveCount struct{ all, anonymous int }

// LiveSockets counts the open sockets, in all and by client address (liveIPKey).
type LiveSockets struct {
	mu    sync.Mutex
	total liveCount
	ips   map[netip.Addr]*liveCount
}

func newLiveSockets() *LiveSockets {
	return &LiveSockets{ips: map[netip.Addr]*liveCount{}}
}

var liveSockets = newLiveSockets()

// liveIPKey: an IPv6 client holds a whole /64, so its sockets count together.
func liveIPKey(ip netip.Addr) netip.Addr {
	ip = ip.Unmap()
	if ip.Is6() {
		prefix, _ := ip.Prefix(64)
		return prefix.Addr()
	}
	return ip
}

// open counts a new socket of `ip` or, with `anonymous`, one of its sockets signed in without an account; false
// when that would go over a cap.
func (s *LiveSockets) open(ip netip.Addr, anonymous bool) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	c := s.ips[ip]
	if c == nil {
		c = &liveCount{}
	}
	if anonymous {
		if s.total.anonymous >= liveMaxAnonymous || c.anonymous >= liveMaxAnonymousPerIP {
			return false
		}
		c.anonymous++
		s.total.anonymous++
	} else {
		if s.total.all >= liveMaxSockets || c.all >= liveMaxPerIP {
			return false
		}
		c.all++
		s.total.all++
	}
	s.ips[ip] = c
	return true
}

// close undoes an open.
func (s *LiveSockets) close(ip netip.Addr, anonymous bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	c := s.ips[ip]
	if c == nil {
		return
	}
	if anonymous {
		c.anonymous--
		s.total.anonymous--
	} else {
		c.all--
		s.total.all--
	}
	if c.all <= 0 && c.anonymous <= 0 {
		delete(s.ips, ip)
	}
}

func liveUpgrade(state *AppState, w http.ResponseWriter, r *http.Request) {
	ip := state.traffic.ip(peerIP(r), r.Header)
	key := liveIPKey(ip)
	if !liveSockets.open(key, false) {
		w.Header().Set("Retry-After", "30")
		http.Error(w, "Too many connections", http.StatusServiceUnavailable)
		return
	}
	defer liveSockets.close(key, false)
	conn, err := liveUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	// Until it signs in, a socket may send only its small `auth` message: no large frame is buffered nor decoded.
	conn.SetReadLimit(liveGameMax)
	live(state, conn, ip)
}

// liveSend writes a message; a peer that does not read it within 15 seconds is dropped.
func liveSend(conn *websocket.Conn, value any) bool {
	return wsSend(conn, value, 15*time.Second)
}

func liveClose(conn *websocket.Conn) {
	wsClose(conn, 4001, "Session expired")
}

// liveText: a message of the socket on `channel`, serialised. The value is left as it is: it may be shared.
func liveText(channel string, value M) string {
	out := copyMap(value)
	out["channel"] = channel
	return encodeJSON(out)
}

// liveBucket: a channel's allowance of messages: `burst` at once, refilled at `rate` a second.
type liveBucket struct {
	tokens, rate, burst float64
	at                  time.Time
}

func newLiveBucket(burst, rate float64) *liveBucket {
	return &liveBucket{tokens: burst, rate: rate, burst: burst, at: time.Now()}
}

func (b *liveBucket) take() bool {
	b.tokens = min(b.tokens+time.Since(b.at).Seconds()*b.rate, b.burst)
	b.at = time.Now()
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

// liveClient: one open app.
type liveClient struct {
	state *AppState
	conn  *websocket.Conn
	ip    netip.Addr
	// The socket in the live hub, the coaching rooms, the duel arena and the match rooms.
	id string
	// "Bearer …" and its account, or "" and nil for an app without an account.
	token string
	user  M
	// An account with a password: practice sync and coaching are theirs only.
	member bool
	// Signed in without an account: counted against the anonymous caps.
	anonymous bool
	// The practice cursor the app holds, for the changes streamed to it.
	slot      *LiveSlot
	delivered int64
	// Coaching, community, duel and match messages, in the order they were sent.
	tx *wsOutbox
	// A call starts with a burst of ICE candidates; then a few messages a second.
	coachingRate *liveBucket
	// A burst of 30 messages, then 3 a second: a solve takes a handful, chat a few more.
	duelRate  *liveBucket
	matchRate *liveBucket
	// The matches open, with the account's seat in each (-1 to watch).
	matches map[int64]int
}

func (c *liveClient) uid() string {
	return str(idx(c.user, "id"))
}

func live(state *AppState, conn *websocket.Conn, ip netip.Addr) {
	defer conn.Close()
	c := &liveClient{state: state, conn: conn, ip: ip, id: newUUID(), slot: newLiveSlot(), tx: newWsOutbox(),
		coachingRate: newLiveBucket(200, 20), duelRate: newLiveBucket(30, 3), matchRate: newLiveBucket(30, 5), matches: map[int64]int{}}
	defer c.leave()
	// The app says who it is at once, read here before anything else; afterwards any frame, a pong included, shows it
	// is still there.
	_ = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	kind, data, err := conn.ReadMessage()
	if err != nil {
		if errors.Is(err, os.ErrDeadlineExceeded) {
			wsClose(conn, 1001, "Idle")
		}
		return
	}
	if kind != websocket.TextMessage {
		wsClose(conn, 1008, "Invalid message")
		return
	}
	body, err := decodeJSON(data)
	if err != nil {
		wsClose(conn, 1008, "Invalid message")
		return
	}
	if !eqStr(idx(body, "channel"), "live") || !eqStr(idx(body, "type"), "auth") {
		wsClose(conn, 1008, "Authentication expected")
		return
	}
	if !state.traffic.allow(ip, "/api/live", true) {
		wsClose(conn, 1008, "Message rate limit exceeded")
		return
	}
	if !c.auth(body) {
		return
	}
	_ = conn.SetReadDeadline(time.Time{})
	// Sync and coaching, the large messages, are an account's only: others keep the small limit, so only an account's
	// large frames are ever buffered and decoded. Set before the reading goroutine starts.
	var wake chan struct{}
	if c.member {
		conn.SetReadLimit(liveSyncMax)
		wake = c.slot.wake
	}
	incoming, stop := wsReceive(conn)
	defer stop()
	idle := time.NewTimer(3 * livePing)
	defer idle.Stop()
	ping := time.NewTicker(livePing)
	defer ping.Stop()
	for {
		select {
		case <-idle.C:
			wsClose(conn, 1001, "Idle")
			return
		case <-ping.C:
			if conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(15*time.Second)) != nil {
				return
			}
		case <-wake:
			if !c.stream() {
				return
			}
		case <-c.tx.wake:
			if !c.tx.flush(conn) {
				return
			}
		case message := <-incoming:
			if message.err != nil {
				return
			}
			idle.Reset(3 * livePing)
			switch message.kind {
			case websocket.PongMessage:
				// An open app is an active account even between HTTP requests.
				if c.user != nil {
					state.traffic.log.seen(c.uid())
				}
				continue
			case websocket.PingMessage:
				continue
			case websocket.TextMessage:
			default:
				wsClose(conn, 1008, "Invalid message")
				return
			}
			body, err := decodeJSON(message.data)
			if err != nil {
				wsClose(conn, 1008, "Invalid message")
				return
			}
			channel := str(idx(body, "channel"))
			limit := liveGameMax
			switch channel {
			case "sync":
				limit = liveSyncMax
			case "coaching":
				limit = liveCoachingMax
			}
			if len(message.data) > limit {
				wsClose(conn, 1009, "Message too big")
				return
			}
			ok := true
			switch channel {
			case "sync":
				ok = c.onSync(body)
			case "coaching":
				ok = c.onCoaching(body)
			case "duel":
				c.onDuel(body)
			case "match":
				c.onMatch(body)
			}
			if !ok {
				return
			}
		}
	}
}

// auth: the app's first message: its token when it has an account, and the practice cursor it holds.
func (c *liveClient) auth(body any) bool {
	state := c.state
	if idx(body, "token") != nil {
		token, err := apiString(body, "token", 1, 128)
		if err != nil {
			wsClose(c.conn, 1008, "Invalid message")
			return false
		}
		user, err := dbCall(state.db, func(db *Conn) (M, error) { return accountsAuth(db, "Bearer "+token) })
		if err != nil || user == nil {
			liveClose(c.conn)
			return false
		}
		c.token, c.user, c.member = "Bearer "+token, user, user["password_hash"] != nil
	}
	if c.user == nil {
		if !liveSockets.open(liveIPKey(c.ip), true) {
			wsClose(c.conn, 1013, "Too many connections")
			return false
		}
		c.anonymous = true
	}
	ready := M{"channel": "live", "type": "ready", "user": nil}
	if c.user != nil {
		state.traffic.log.seen(c.uid())
		ready["user"] = accountsPublic(c.user)
	}
	if c.member {
		if idx(body, "after") != nil {
			after, ok := asInt(idx(body, "after"))
			if !ok || after < 0 {
				wsClose(c.conn, 1008, "Invalid message")
				return false
			}
			c.delivered = after
		}
		uid := c.uid()
		// The current cursor lets a reconnecting device pull immediately if it fell behind.
		cursor, err := dbCall(state.db, func(db *Conn) (int64, error) { return syncCursor(db, uid) })
		if err != nil {
			liveClose(c.conn)
			return false
		}
		ready["cursor"] = cursor
		state.hub.add(uid, c.id, c.slot)
		state.coaching.add(uid, c.id, c.tx)
	}
	return liveSend(c.conn, ready)
}

// leave: the app is gone: out of every room it was in.
func (c *liveClient) leave() {
	if c.anonymous {
		liveSockets.close(liveIPKey(c.ip), true)
	}
	if c.member {
		c.state.hub.remove(c.uid(), c.id)
		c.state.coaching.remove(c.uid(), c.id)
	}
	c.state.duel.leave(c.id)
	for id := range c.matches {
		c.state.matches.leave(id, c.id)
	}
}

// stream: the account's practice data changed: the next page of changes goes out.
func (c *liveClient) stream() bool {
	if !c.slot.pending.Swap(false) {
		return true
	}
	auth, after := c.token, c.delivered
	page, err := dbCall(c.state.db, func(db *Conn) (M, error) {
		user, err := accountsSignedIn(db, auth)
		if err != nil {
			return nil, err
		}
		return syncPull(db, str(user["id"]), after, true, true)
	})
	if err != nil {
		liveClose(c.conn)
		return false
	}
	c.delivered, _ = asInt(page["cursor"])
	if page["more"] == true {
		c.slot.pending.Store(true)
		c.slot.notify()
	}
	if c.delivered <= after {
		return true
	}
	page["channel"] = "sync"
	page["type"] = "changes"
	page["after"] = after
	return liveSend(c.conn, page)
}

// onSync: an upload or a pull, answered under its `requestId`.
func (c *liveClient) onSync(body any) bool {
	state := c.state
	if !state.traffic.allow(c.ip, "/api/live", true) {
		wsClose(c.conn, 1008, "Message rate limit exceeded")
		return false
	}
	kind := str(idx(body, "type"))
	requestID, err := apiString(body, "requestId", 1, 100)
	if err != nil || (kind != "push" && kind != "pull") {
		wsClose(c.conn, 1008, "Invalid message")
		return false
	}
	if !c.member {
		return liveSend(c.conn, M{"channel": "sync", "type": "result", "requestId": requestID, "status": 403, "error": "Sign in to synchronize."})
	}
	auth := c.token
	result, err := dbCall(state.db, func(db *Conn) (any, error) {
		caller, err := newApiCaller(db, auth)
		if err != nil {
			return nil, err
		}
		uid := caller.id()
		if uid == "" {
			return nil, apiErr(401, "Please sign in again.")
		}
		if kind == "pull" {
			after, ok := asInt(idx(body, "after"))
			if !ok || after < 0 {
				return nil, validation()
			}
			return syncPull(db, uid, after, true, true)
		}
		result, err := syncPush(db, state, uid, caller, body)
		if err != nil {
			return nil, err
		}
		cursor, err := syncCursor(db, uid)
		if err != nil {
			return nil, err
		}
		state.hub.notifySync(uid, cursor)
		return result, nil
	})
	response := M{"channel": "sync", "type": "result", "requestId": requestID}
	expired := false
	if err != nil {
		e := toApiError(err)
		expired = e.Status == 401
		response["status"], response["error"] = e.Status, e.Message
	} else {
		if kind == "pull" {
			cursor, _ := asInt(idx(result, "cursor"))
			c.delivered = max(c.delivered, cursor)
		}
		response["value"] = result
	}
	if !liveSend(c.conn, response) {
		return false
	}
	if expired {
		liveClose(c.conn)
		return false
	}
	return true
}
