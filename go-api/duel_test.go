package main

import (
	"testing"
	"time"
)

func waiting(level float64, waited int) *duelWaiting {
	w := &duelWaiting{id: newUUID(), event: "333", since: time.Now().Add(-time.Duration(waited) * time.Second), tx: newWsOutbox()}
	if level > 0 {
		w.level = &level
	}
	return w
}

func TestRangeWidensWithWaiting(t *testing.T) {
	now := time.Now()
	meets := func(a, b *duelWaiting) bool { _, ok := duelGap(a, b, now); return ok }
	cases := []struct {
		a, b *duelWaiting
		want bool
	}{
		{waiting(10_000, 0), waiting(11_000, 0), true},
		{waiting(10_000, 0), waiting(20_000, 0), false},
		{waiting(10_000, 34), waiting(20_000, 0), true},
		{waiting(10_000, 31), waiting(60_000, 0), true},
		{waiting(0, 0), waiting(0, 0), true},
		{waiting(0, 0), waiting(9_000, 0), false},
		{waiting(0, 11), waiting(9_000, 0), true},
	}
	for i, c := range cases {
		if meets(c.a, c.b) != c.want {
			t.Fatal(i)
		}
	}
}

func TestAnAccountNeverMeetsItself(t *testing.T) {
	inner := newDuelInner()
	mine := []*duelWaiting{waiting(0, 40), waiting(0, 0)}
	for _, w := range mine {
		w.user = "u1"
	}
	inner.queue = mine
	inner.pair()
	if len(inner.queue) != 2 {
		t.Fatal(len(inner.queue))
	}
	// Someone else meets the device that has waited longest.
	first := mine[0].id
	inner.queue = append(inner.queue, waiting(0, 0))
	inner.pair()
	if _, ok := inner.seats[first]; len(inner.queue) != 1 || !ok {
		t.Fatal(len(inner.queue))
	}
}

func TestClosestLevelFirst(t *testing.T) {
	inner := newDuelInner()
	inner.queue = []*duelWaiting{waiting(10_000, 2), waiting(30_000, 1), waiting(10_500, 0)}
	slow, close := inner.queue[1].id, inner.queue[2].id
	inner.pair()
	if _, ok := inner.seats[close]; len(inner.queue) != 1 || inner.queue[0].id != slow || !ok {
		t.Fatal(inner.queue)
	}
}
