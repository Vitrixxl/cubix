package main

// Account-scoped incremental sync. Protocol 2 streams changed entities and acknowledges durable
// uploads over the same socket; older clients retain cursor-only notifications.

import (
	"net/http"
	"net/netip"
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

var liveUpgrader = wsUpgrader(4096)

func liveUpgrade(state *AppState, w http.ResponseWriter, r *http.Request) {
	ip := state.traffic.ip(peerIP(r), r.Header)
	conn, err := liveUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	conn.SetReadLimit(2 * 1024 * 1024)
	live(state, conn, ip)
}

func liveSend(conn *websocket.Conn, value any) bool {
	return wsSend(conn, value, 15*time.Second)
}

func liveClose(conn *websocket.Conn) {
	wsClose(conn, 4001, "Session expired")
}

func liveAuthenticated(state *AppState, token string) (M, error) {
	user, err := dbCall(state.db, func(db *Conn) (M, error) { return accountsSignedIn(db, token) })
	if err != nil {
		return nil, err
	}
	if user["password_hash"] == nil {
		return nil, apiErr(403, "Sign in to synchronize.")
	}
	return user, nil
}

func live(state *AppState, conn *websocket.Conn, ip netip.Addr) {
	defer conn.Close()
	id := newUUID()
	userID := ""
	token := ""
	streaming := false
	delivered := int64(0)
	slot := newLiveSlot()
	deadline := time.NewTimer(5 * time.Second)
	defer deadline.Stop()
	incoming, stop := wsReceive(conn)
	defer stop()
	var wake chan struct{}
	defer func() {
		if userID != "" {
			state.hub.remove(userID, id)
		}
	}()
	for {
		select {
		case <-deadline.C:
			liveClose(conn)
			return
		case <-wake:
			if !slot.pending.Swap(false) {
				continue
			}
			if streaming {
				auth, after := token, delivered
				page, err := dbCall(state.db, func(db *Conn) (M, error) {
					user, err := accountsSignedIn(db, auth)
					if err != nil {
						return nil, err
					}
					return syncPull(db, str(user["id"]), after, true, true)
				})
				if err != nil {
					liveClose(conn)
					return
				}
				delivered, _ = asInt(page["cursor"])
				if page["more"] == true {
					slot.pending.Store(true)
					slot.notify()
				}
				if delivered > after {
					page["type"] = "changes"
					page["after"] = after
					if !liveSend(conn, page) {
						return
					}
				}
			} else {
				if _, err := liveAuthenticated(state, token); err != nil {
					liveClose(conn)
					return
				}
				if !liveSend(conn, M{"type": "sync", "cursor": slot.cursor.Load()}) {
					return
				}
			}
		case message := <-incoming:
			if message.err != nil {
				return
			}
			if !state.traffic.allow(ip, "/api/live", true) {
				wsClose(conn, 1008, "Message rate limit exceeded")
				return
			}
			switch message.kind {
			case websocket.PingMessage, websocket.PongMessage:
				continue
			case websocket.TextMessage:
			default:
				liveClose(conn)
				return
			}
			body, err := decodeJSON(message.data)
			if err != nil {
				liveClose(conn)
				return
			}
			kind := str(idx(body, "type"))
			if streaming && userID != "" && (kind == "push" || kind == "pull") {
				requestID, err := apiString(body, "requestId", 1, 100)
				if err != nil {
					liveClose(conn)
					return
				}
				auth := token
				result, err := dbCall(state.db, func(db *Conn) (any, error) {
					caller, err := newApiCaller(db, auth)
					if err != nil {
						return nil, err
					}
					uid := caller.id()
					if uid == "" {
						return nil, apiErr(401, "Please sign in again.")
					}
					if eqStr(idx(body, "type"), "pull") {
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
				var response M
				expired := false
				if err != nil {
					e := toApiError(err)
					expired = e.Status == 401
					response = M{"type": "result", "requestId": requestID, "status": e.Status, "error": e.Message}
				} else {
					if kind == "pull" {
						cursor, _ := asInt(idx(result, "cursor"))
						delivered = max(delivered, cursor)
					}
					response = M{"type": "result", "requestId": requestID, "value": result}
				}
				if !liveSend(conn, response) {
					return
				}
				if expired {
					liveClose(conn)
					return
				}
				deadline.Reset(60 * time.Second)
				continue
			}
			if kind != "auth" && kind != "ping" {
				liveClose(conn)
				return
			}
			if kind == "auth" && userID == "" {
				value, err := apiString(body, "token", 1, 128)
				if err != nil {
					liveClose(conn)
					return
				}
				token = "Bearer " + value
				streaming = eqInt(idx(body, "protocol"), 2)
				if streaming {
					after, ok := asInt(idx(body, "after"))
					if !ok || after < 0 {
						liveClose(conn)
						return
					}
					delivered = after
				}
			}
			user, err := liveAuthenticated(state, token)
			if err != nil {
				liveClose(conn)
				return
			}
			uid := str(user["id"])
			// An open app is an active account even between HTTP requests.
			state.traffic.log.seen(uid)
			if userID == "" {
				state.hub.add(uid, id, slot)
				userID = uid
				wake = slot.wake
			}
			deadline.Reset(60 * time.Second)
			var response M
			if kind == "auth" {
				// The current cursor lets a reconnecting device pull immediately if it fell behind.
				cursor, err := dbCall(state.db, func(db *Conn) (int64, error) { return syncCursor(db, uid) })
				if err != nil {
					liveClose(conn)
					return
				}
				if streaming {
					response = M{"type": "ready", "cursor": cursor, "protocol": 2, "user": accountsPublic(user)}
				} else {
					response = M{"type": "ready", "cursor": cursor}
				}
			} else {
				response = M{"type": "pong"}
			}
			if !liveSend(conn, response) {
				return
			}
		}
	}
}
