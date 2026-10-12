package main

import (
	"net/netip"
	"testing"
)

func TestSocketsAreCappedByAddressAndIPv6ByItsSlash64(t *testing.T) {
	s := newLiveSockets()
	a := liveIPKey(netip.MustParseAddr("2001:db8:1:2::1"))
	if b := liveIPKey(netip.MustParseAddr("2001:db8:1:2:ffff::9")); a != b {
		t.Fatal(a, b)
	}
	if v4 := liveIPKey(netip.MustParseAddr("::ffff:192.0.2.7")); v4 != netip.MustParseAddr("192.0.2.7") {
		t.Fatal(v4)
	}
	for range liveMaxPerIP {
		if !s.open(a, false) {
			t.Fatal("refused under the cap")
		}
	}
	other := netip.MustParseAddr("2001:db8:1:3::1")
	if s.open(a, false) || !s.open(other, false) {
		t.Fatal("the cap is per address")
	}
	for range liveMaxAnonymousPerIP {
		if !s.open(a, true) {
			t.Fatal("anonymous refused under the cap")
		}
	}
	if s.open(a, true) {
		t.Fatal("anonymous over the cap")
	}
	s.close(a, true)
	s.close(a, false)
	if !s.open(a, true) || !s.open(a, false) {
		t.Fatal("a closed socket frees its place")
	}
	// Everything closed, nothing is left behind.
	for range liveMaxAnonymousPerIP {
		s.close(a, true)
	}
	for range liveMaxPerIP {
		s.close(a, false)
	}
	s.close(other, false)
	if len(s.ips) != 0 || s.total != (liveCount{}) {
		t.Fatal(s.ips, s.total)
	}
	// The global cap.
	s.total.all = liveMaxSockets
	if s.open(other, false) {
		t.Fatal("over the global cap")
	}
}
