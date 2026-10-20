package main

import (
	"strings"
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
	inner.queue["333"] = mine
	inner.pair()
	if len(inner.queue["333"]) != 2 {
		t.Fatal(inner.queue)
	}
	// Someone else meets the device that has waited longest.
	first := mine[0].id
	inner.queue["333"] = append(inner.queue["333"], waiting(0, 0))
	inner.pair()
	if _, ok := inner.seats[first]; len(inner.queue["333"]) != 1 || !ok {
		t.Fatal(inner.queue)
	}
}

func TestClosestLevelFirst(t *testing.T) {
	inner := newDuelInner()
	inner.queue["333"] = []*duelWaiting{waiting(10_000, 2), waiting(30_000, 1), waiting(10_500, 0)}
	slow, close := inner.queue["333"][1].id, inner.queue["333"][2].id
	inner.pair()
	if _, ok := inner.seats[close]; len(inner.queue["333"]) != 1 || inner.queue["333"][0].id != slow || !ok {
		t.Fatal(inner.queue)
	}
}

func duelClient(arena *DuelArena) *liveClient {
	return &liveClient{state: &AppState{duel: arena}, id: newUUID(), tx: newWsOutbox(), duelRate: newLiveBucket(30, 3)}
}

func TestOnlyKnownEventsQueueEachInItsOwnQueue(t *testing.T) {
	arena := newDuelArena(nil)
	for _, event := range []any{"abc", "333x", "", 333} {
		duelClient(arena).onDuel(M{"type": "queue", "event": event})
	}
	if arena.inner.searching() != 0 {
		t.Fatal(arena.inner.queue)
	}
	a, b, c := duelClient(arena), duelClient(arena), duelClient(arena)
	a.onDuel(M{"type": "queue", "event": "222"})
	b.onDuel(M{"type": "queue", "event": "444"})
	c.onDuel(M{"type": "queue", "event": "222"})
	_, raced := arena.inner.seats[a.id]
	if _, ok := arena.inner.seats[c.id]; !ok || !raced || len(arena.inner.queue) != 1 || arena.inner.queue["444"][0].id != b.id {
		t.Fatal(arena.inner.queue)
	}
	if last := b.tx.queue[len(b.tx.queue)-1]; !strings.Contains(last, `"searching":0`) {
		t.Fatal(last)
	}
}

func TestTheQueueIsCapped(t *testing.T) {
	arena := newDuelArena(nil)
	for range duelQueueMax {
		w := waiting(0, 0)
		w.user = "u1"
		arena.inner.queue["333"] = append(arena.inner.queue["333"], w)
	}
	duelClient(arena).onDuel(M{"type": "queue", "event": "222"})
	if arena.inner.searching() != duelQueueMax || arena.inner.queue["222"] != nil {
		t.Fatal(arena.inner.searching())
	}
}

func TestALobbyHearsHowManySearchItsEventWhenItChanges(t *testing.T) {
	arena := newDuelArena(nil)
	lobby, other := duelClient(arena), duelClient(arena)
	lobby.onDuel(M{"type": "watch", "event": "nope"})
	lobby.onDuel(M{"type": "watch", "event": "444"})
	sent := func() []string { return lobby.tx.queue }
	if len(sent()) != 1 || !strings.Contains(sent()[0], `"type":"waiting"`) || !strings.Contains(sent()[0], `"searching":0`) {
		t.Fatal(sent())
	}
	other.onDuel(M{"type": "queue", "event": "444"})
	if len(sent()) != 2 || !strings.Contains(sent()[1], `"searching":1`) {
		t.Fatal(sent())
	}
	// Unchanged: nothing more; another event's queue is not its count.
	arena.tick()
	duelClient(arena).onDuel(M{"type": "queue", "event": "222"})
	if len(sent()) != 2 {
		t.Fatal(sent())
	}
	lobby.onDuel(M{"type": "watch", "event": ""})
	other.onDuel(M{"type": "leave"})
	if len(sent()) != 2 || len(arena.inner.watchers) != 0 {
		t.Fatal(sent())
	}
}
