package main

import (
	"net/http"
	"net/netip"
	"testing"
)

func TestTrafficKeysIPv6By64(t *testing.T) {
	traffic := &Traffic{ips: map[netip.Addr]*trafficClient{}, limit: 3}
	for i, address := range []string{"2001:db8:1:2::1", "2001:db8:1:2::2", "2001:db8:1:2:ffff::9", "2001:db8:1:2::3"} {
		if got := traffic.allow(netip.MustParseAddr(address), "/api/moves", false); got != (i < 3) {
			t.Errorf("%s allowed: %v", address, got)
		}
	}
	if !traffic.allow(netip.MustParseAddr("2001:db8:1:3::1"), "/api/moves", false) {
		t.Error("another /64 shares the limit")
	}
}

func TestTrafficEvictsOldestWhenFull(t *testing.T) {
	traffic := &Traffic{ips: map[netip.Addr]*trafficClient{}, limit: 600}
	now := accountsNow()
	for i := range trafficMaxIPs {
		traffic.ips[netip.AddrFrom4([4]byte{10, 0, byte(i >> 8), byte(i)})] = &trafficClient{last: now - int64(i)}
	}
	if !traffic.allow(netip.MustParseAddr("192.0.2.1"), "/api/moves", false) {
		t.Fatal("a new client is refused when the table is full")
	}
	if _, ok := traffic.ips[netip.AddrFrom4([4]byte{10, 0, 0, 0})]; !ok {
		t.Error("the most recent client was evicted")
	}
	if len(traffic.ips) > trafficMaxIPs*9/10+1 {
		t.Errorf("%d clients left", len(traffic.ips))
	}
}

func TestTrafficLimitsDecodedAuthPaths(t *testing.T) {
	for path, want := range map[string]string{"/api/auth/%6cogin": "/api/auth/login", "/api//api/auth/register": "/api/auth/register", "/app": "/app"} {
		if got := trafficRoute(path); got != want {
			t.Errorf("%s: %s", path, got)
		}
	}
}

func TestTrafficJoinsForwardedLines(t *testing.T) {
	traffic := &Traffic{trusted: []netip.Addr{netip.MustParseAddr("127.0.0.1")}}
	header := http.Header{"X-Forwarded-For": {"198.51.100.1", "203.0.113.7"}}
	if got := traffic.ip(netip.MustParseAddr("127.0.0.1"), header); got != netip.MustParseAddr("203.0.113.7") {
		t.Errorf("%s", got)
	}
}
