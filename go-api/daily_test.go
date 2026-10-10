package main

import (
	"path/filepath"
	"testing"
	"time"
)

func TestDailyPlaceAndBuckets(t *testing.T) {
	times := []*float64{f(9000), f(10000), f(12000), nil}
	if p := dailyPlace(times, times[1], true); p["rank"] != 2 || p["beats"] != 66.7 {
		t.Fatal(p)
	}
	if p := dailyPlace(times, nil, true); p["rank"] != 4 || p["beats"] != 0.0 {
		t.Fatal("dnf", p)
	}
	if p := dailyPlace(times, f(8000), false); p["rank"] != 1 || p["beats"] != 100.0 {
		t.Fatal("placed", p)
	}
	if p := dailyPlace([]*float64{f(8000)}, f(8000), true); p["beats"] != 100.0 {
		t.Fatal("alone", p)
	}
	b := dailyBuckets(times)
	counts := b["counts"].([]int)
	sum := 0
	for _, c := range counts {
		sum += c
	}
	if b["width"] != 200.0 || b["from"] != 9000.0 || sum != 3 || len(counts) != 16 || counts[0] != 1 || counts[5] != 1 || counts[15] != 1 {
		t.Fatal(b)
	}
	if len(dailyBuckets([]*float64{nil})["counts"].([]int)) != 0 {
		t.Fatal("empty")
	}
}

func TestDailyOneRankedAttempt(t *testing.T) {
	db, err := dbOpen(filepath.Join(t.TempDir(), "cubix.db"))
	if err != nil {
		t.Fatal(err)
	}
	today := dailyDay(time.Now())
	err = db.Call(func(c *Conn) error {
		for _, id := range []string{"a", "b"} {
			if _, err := c.Exec("INSERT INTO users(id,username,password_hash,created_at) VALUES(?,?,'x','2026-01-01')", id, id); err != nil {
				return err
			}
		}
		a := &ApiCaller{user: M{"id": "a", "password_hash": "x"}}
		b := &ApiCaller{user: M{"id": "b", "password_hash": "x"}}
		post := func(caller *ApiCaller, ms float64, penalty string) (M, error) {
			v, err := dailyRoute(c, "POST", []string{"daily", "333"}, nil, M{"day": today, "timeMs": ms, "penalty": penalty}, caller)
			if err != nil {
				return nil, err
			}
			return v.(M), nil
		}
		if _, err := post(a, 1000, "none"); err == nil {
			t.Fatal("implausible time ranked")
		}
		if _, err := post(&ApiCaller{user: M{"id": "a"}}, 10000, "none"); err == nil {
			t.Fatal("an account without a password ranked")
		}
		if v, _ := post(a, 10000, "none"); v["ranked"] != true || v["mine"].(M)["rank"] != 1 {
			t.Fatal(v)
		}
		// A second attempt is placed, not recorded; the first takes a penalty.
		if v, _ := post(a, 8000, "none"); v["ranked"] != false || v["total"] != 1 || v["placed"].(M)["rank"] != 1 {
			t.Fatal(v)
		}
		if v, _ := post(a, 10000, "+2"); v["ranked"] != true || v["mine"].(M)["penalty"] != "+2" {
			t.Fatal(v)
		}
		if v, _ := post(b, 11000, "none"); v["mine"].(M)["rank"] != 1 || v["mine"].(M)["beats"] != 100.0 {
			t.Fatal(v)
		}
		// A guest sees the field and where a time would stand.
		v, err := dailyRoute(c, "GET", []string{"daily", "333"}, map[string]string{"time": "11500"}, nil, &ApiCaller{})
		if err != nil {
			return err
		}
		if m := v.(M); m["total"] != 2 || m["mine"] != nil || m["placed"].(M)["rank"] != 2 || m["placed"].(M)["beats"] != 50.0 {
			t.Fatal(m)
		}
		if _, err := dailyRoute(c, "GET", []string{"daily", "pyram"}, nil, nil, &ApiCaller{}); err == nil {
			t.Fatal("event without a daily scramble")
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestDailyVerifiedCancelAndHistory(t *testing.T) {
	db, err := dbOpen(filepath.Join(t.TempDir(), "cubix.db"))
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	today, yesterday := dailyDay(now), dailyDay(now.Add(-24*time.Hour))
	err = db.Call(func(c *Conn) error {
		for _, id := range []string{"a", "b", "c"} {
			if _, err := c.Exec("INSERT INTO users(id,username,password_hash,created_at) VALUES(?,?,'x','2026-01-01')", id, id); err != nil {
				return err
			}
		}
		who := func(id string) *ApiCaller { return &ApiCaller{user: M{"id": id, "password_hash": "x"}} }
		route := func(caller *ApiCaller, method string, parts []string, query map[string]string, body any) (any, error) {
			return dailyRoute(c, method, append([]string{"daily", "333"}, parts...), query, body, caller)
		}
		moves := "R U R' U' F2 D L' B2 U2 R D' F"
		// a: smart cube, verified; b: keyboard, not; c: too few turns to count.
		if _, err := route(who("a"), "POST", nil, nil, M{"day": today, "timeMs": 9000, "solution": moves}); err != nil {
			return err
		}
		if _, err := route(who("b"), "POST", nil, nil, M{"day": today, "timeMs": 8000}); err != nil {
			return err
		}
		if _, err := route(who("c"), "POST", nil, nil, M{"day": today, "timeMs": 7000, "solution": "R U"}); err != nil {
			return err
		}
		v, _ := route(who("b"), "GET", nil, map[string]string{"verified": "1"}, nil)
		m := v.(M)
		if m["total"] != 1 || m["allTotal"] != int64(3) || m["verifiedTotal"] != int64(1) || m["mine"].(M)["verified"] != false || m["mine"].(M)["rank"] != 1 {
			t.Fatal("verified view", m)
		}
		v, _ = route(who("a"), "GET", nil, nil, nil)
		if mine := v.(M)["mine"].(M); mine["rank"] != 3 || mine["verified"] != true || mine["cancellable"] != true {
			t.Fatal("all view", mine)
		}
		// Cancelled once: the attempt goes, a new one ranks, a second cancel is refused.
		if v, err := route(who("b"), "DELETE", nil, map[string]string{"day": today}, nil); err != nil || v.(M)["mine"] != nil || v.(M)["total"] != 2 {
			t.Fatal("cancel", v, err)
		}
		if v, _ := route(who("b"), "POST", nil, nil, M{"day": today, "timeMs": 12000}); v.(M)["ranked"] != true {
			t.Fatal("ranked again", v)
		}
		if _, err := route(who("b"), "DELETE", nil, map[string]string{"day": today}, nil); err == nil {
			t.Fatal("cancelled twice")
		}
		// Too late: two minutes after the recording.
		if _, err := c.Exec("UPDATE daily_results SET created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 minutes') WHERE user_id='a'"); err != nil {
			return err
		}
		if _, err := route(who("a"), "DELETE", nil, map[string]string{"day": today}, nil); err == nil {
			t.Fatal("cancelled too late")
		}
		if _, err := route(&ApiCaller{}, "DELETE", nil, map[string]string{"day": today}, nil); err == nil {
			t.Fatal("a guest cancelled")
		}
		// History: each day with its rank, the verified view keeping only verified days.
		if _, err := c.Exec("INSERT INTO daily_results(day,event,user_id,time_ms,penalty,verified) VALUES(?,?,?,?,?,0),(?,?,?,?,?,0)", yesterday, "333", "a", 10000, "none", yesterday, "333", "b", 9000, "none"); err != nil {
			return err
		}
		v, err := route(who("a"), "GET", []string{"history"}, nil, nil)
		if err != nil {
			return err
		}
		h := v.([]M)
		if len(h) != 2 || h[0]["day"] != today || h[1]["day"] != yesterday || h[1]["rank"] != 2 || h[1]["total"] != 2 || h[0]["verified"] != true {
			t.Fatal("history", h)
		}
		v, _ = route(who("a"), "GET", []string{"history"}, map[string]string{"verified": "1"}, nil)
		if h := v.([]M); len(h) != 1 || h[0]["rank"] != 1 || h[0]["total"] != 1 {
			t.Fatal("verified history", h)
		}
		if _, err := route(&ApiCaller{}, "GET", []string{"history"}, nil, nil); err == nil {
			t.Fatal("a guest's history")
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
