package main

import (
	"bufio"
	"context"
	"errors"
	"net"
	"net/http"
	"net/netip"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"
)

const trafficMaxIPs = 20000

type trafficBucket struct {
	tokens float64
	at     int64
}

func newTrafficBucket(cap float64) trafficBucket {
	return trafficBucket{tokens: cap, at: accountsNow()}
}

func (b *trafficBucket) allow(cap, seconds float64) bool {
	current := accountsNow()
	b.tokens = min(b.tokens+float64(max(current-b.at, 0))/1000*cap/seconds, cap)
	b.at = current
	if b.tokens >= 1 {
		b.tokens--
		return true
	}
	return false
}

// trafficClient: a client's rate limits; `recorded` once one of its requests was answered (not a health probe).
type trafficClient struct {
	recorded bool
	last     int64
	http     trafficBucket
	auth     trafficBucket
	admin    trafficBucket
	ws       trafficBucket
}

type Traffic struct {
	log     *ActivityLog
	updates *broadcaster[struct{}]
	mu      sync.Mutex
	ips     map[netip.Addr]*trafficClient
	started int64
	limit   uint32
	trusted []netip.Addr
}

func newTraffic(log *ActivityLog) *Traffic {
	limit := uint32(600)
	if n, err := strconv.ParseUint(os.Getenv("CUBIX_RATE_LIMIT"), 10, 32); err == nil && n > 0 {
		limit = uint32(n)
	}
	var trusted []netip.Addr
	for _, v := range strings.Split(os.Getenv("CUBIX_TRUSTED_PROXIES"), ",") {
		if ip, err := netip.ParseAddr(strings.TrimSpace(v)); err == nil {
			trusted = append(trusted, ip)
		}
	}
	return &Traffic{log: log, updates: newBroadcaster[struct{}](1), ips: map[netip.Addr]*trafficClient{}, started: accountsNow(), limit: limit, trusted: trusted}
}

// liveIPs: clients currently tracked in memory with at least one recorded request.
func (t *Traffic) liveIPs() int {
	t.mu.Lock()
	defer t.mu.Unlock()
	n := 0
	for _, c := range t.ips {
		if c.recorded {
			n++
		}
	}
	return n
}

// subscribe: changes whenever a request other than a health probe or an administration request is
// answered: the administration's live socket tells its views to refetch. Signals are coalesced (tokio's watch).
func (t *Traffic) subscribe() (<-chan struct{}, func()) {
	return t.updates.subscribe()
}

func (t *Traffic) isTrusted(ip netip.Addr) bool {
	for _, p := range t.trusted {
		if p == ip {
			return true
		}
	}
	return false
}

func (t *Traffic) ip(peer netip.Addr, header http.Header) netip.Addr {
	if !t.isTrusted(peer) {
		return peer
	}
	// Walk from the trusted socket towards the first untrusted hop. Never trust arbitrary XFF.
	current := peer
	if values, ok := header["X-Forwarded-For"]; ok && len(values) > 0 {
		hops := strings.Split(values[0], ",")
		for i := len(hops) - 1; i >= 0; i-- {
			if !t.isTrusted(current) {
				break
			}
			ip, err := netip.ParseAddr(strings.TrimSpace(hops[i]))
			if err != nil || ip.Zone() != "" {
				return peer
			}
			current = ip
		}
	}
	return current
}

func (t *Traffic) allow(ip netip.Addr, path string, websocket bool) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	if _, ok := t.ips[ip]; !ok && len(t.ips) >= trafficMaxIPs {
		// Evict only inactive buckets. A flood cannot reset an active IP's allowance.
		cutoff := accountsNow() - 900000
		for k, c := range t.ips {
			if c.last <= cutoff {
				delete(t.ips, k)
			}
		}
		if len(t.ips) >= trafficMaxIPs {
			return false
		}
	}
	c, ok := t.ips[ip]
	if !ok {
		c = &trafficClient{last: accountsNow(), http: newTrafficBucket(float64(t.limit)), auth: newTrafficBucket(20), admin: newTrafficBucket(5), ws: newTrafficBucket(120)}
		t.ips[ip] = c
	}
	c.last = accountsNow()
	if websocket {
		return c.ws.allow(120, 60)
	}
	general := c.http.allow(float64(t.limit), 60)
	special := true
	if path == "/api/admin/login" {
		special = c.admin.allow(5, 900)
	} else if path == "/api/auth/login" || path == "/api/auth/register" {
		special = c.auth.allow(20, 60)
	}
	return general && special
}

func (t *Traffic) record(ip netip.Addr, path string) {
	// Health probes still obey rate limits, but never feed admin telemetry.
	if path == "/api/health" {
		return
	}
	t.mu.Lock()
	if c, ok := t.ips[ip]; ok {
		c.recorded = true
		c.last = accountsNow()
	}
	t.mu.Unlock()
	// The administration's own requests would otherwise make its views refetch themselves.
	if !strings.HasPrefix(path, "/api/admin/") {
		t.updates.send(struct{}{})
	}
}

// responseWriter records the status for the log, runs header hooks (the overriding header layers) just before the
// header goes out, and logs a hijacked (WebSocket) request when its 101 is sent, as axum answers upgrades at once.
type responseWriter struct {
	http.ResponseWriter
	status int
	hooks  []func(h http.Header, status int)
	actor  *ActivityActor
	finish func()
}

func (w *responseWriter) WriteHeader(status int) {
	if w.status != 0 {
		return
	}
	w.status = status
	for i := len(w.hooks) - 1; i >= 0; i-- {
		w.hooks[i](w.Header(), status)
	}
	w.ResponseWriter.WriteHeader(status)
}

func (w *responseWriter) Write(b []byte) (int, error) {
	if w.status == 0 {
		w.WriteHeader(200)
	}
	return w.ResponseWriter.Write(b)
}

func (w *responseWriter) Flush() {
	if w.status == 0 {
		w.WriteHeader(200)
	}
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func (w *responseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	h, ok := w.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, errors.New("hijacking not supported")
	}
	conn, rw, err := h.Hijack()
	if err == nil {
		w.status = http.StatusSwitchingProtocols
		w.finish()
	}
	return conn, rw, err
}

func (w *responseWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

// onHeader runs `hook` on the response's headers just before they are written, as an overriding layer would.
func onHeader(w http.ResponseWriter, hook func(h http.Header, status int)) {
	if rw, ok := w.(*responseWriter); ok {
		rw.hooks = append(rw.hooks, hook)
	}
}

type actorKey struct{}

// setActor names the account a response concerns (Rust's `Actor` response extension).
func setActor(r *http.Request, actor ActivityActor) {
	if rw, ok := r.Context().Value(actorKey{}).(*responseWriter); ok {
		rw.actor = &actor
	}
}

// peerIP is axum's ConnectInfo: the socket's remote address.
func peerIP(r *http.Request) netip.Addr {
	if ap, err := netip.ParseAddrPort(r.RemoteAddr); err == nil {
		return ap.Addr().Unmap()
	}
	return netip.AddrFrom4([4]byte{127, 0, 0, 1})
}

func trafficMonitor(traffic *Traffic, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := traffic.ip(peerIP(r), r.Header)
		path := r.URL.EscapedPath()
		method := r.Method
		// A short, printable user agent only; never other headers.
		var agent *string
		if v := headerText(r, "User-Agent"); v != "" {
			var b strings.Builder
			n := 0
			for _, c := range v {
				if n == 160 {
					break
				}
				if !unicode.IsControl(c) {
					b.WriteRune(c)
					n++
				}
			}
			if b.Len() > 0 {
				s := b.String()
				agent = &s
			}
		}
		start := time.Now()
		rw := &responseWriter{ResponseWriter: w}
		done := false
		rw.finish = func() {
			if done {
				return
			}
			done = true
			ms := float64(time.Since(start).Nanoseconds()) / 1e6
			status := rw.status
			if status == 0 {
				status = 200
			}
			traffic.record(ip, path)
			if path != "/api/health" {
				traffic.log.request(ActivityEntry{at: accountsNow(), ip: ip, path: truncateChars(path, 300), method: truncateChars(method, 16), status: status, ms: ms, agent: agent, actor: rw.actor})
			}
		}
		onHeader(rw, func(h http.Header, _ int) { h.Set("X-Content-Type-Options", "nosniff") })
		if traffic.allow(ip, path, false) {
			next.ServeHTTP(rw, r.WithContext(context.WithValue(r.Context(), actorKey{}, rw)))
		} else {
			retry := 60
			if path == "/api/admin/login" {
				retry = 180
			} else if strings.HasPrefix(path, "/api/auth/") {
				retry = 3
			}
			rw.Header().Set("Retry-After", strconv.Itoa(retry))
			writeJSON(rw, http.StatusTooManyRequests, M{"error": "Too many requests. Please retry shortly."})
		}
		if rw.status == 0 && !done {
			rw.WriteHeader(200)
		}
		rw.finish()
	})
}

func truncateChars(s string, n int) string {
	for i := range s {
		if n == 0 {
			return s[:i]
		}
		n--
	}
	return s
}
