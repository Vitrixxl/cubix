package main

import (
	"testing"
)

func f(v float64) *float64 { return &v }

func TestRollingMatchesSortedWindows(t *testing.T) {
	times := make([]*float64, 2000)
	for i := range times {
		if i%17 >= 2 {
			times[i] = f(float64((i*7919)%100) * 123)
		}
	}
	for _, size := range []int{3, 5, 12, 100} {
		got := statsRolling(times, size)
		for i := range times {
			var want *float64
			if i+1 >= size {
				want = statsAverage(times[i+1-size : i+1])
			}
			if (want == nil) != (got[i] == nil) || want != nil && *want != *got[i] {
				t.Fatalf("size %d, index %d: %v != %v", size, i, got[i], want)
			}
		}
	}
	rows := make([]M, len(times))
	for i, time := range times {
		if time == nil {
			rows[i] = M{"id": int64(i), "time_ms": 1000.0, "penalty": "dnf", "created_at": "2026-01-01"}
		} else {
			rows[i] = M{"id": int64(i), "time_ms": *time, "penalty": "none", "created_at": "2026-01-01"}
		}
	}
	if encodeJSON(statsSummary("case", rows)) != encodeJSON(statsHistory("case", rows)["summary"]) {
		t.Fatal("summary differs from history's")
	}
}

func TestDnfAndTrimming(t *testing.T) {
	if got := statsAverage([]*float64{f(1000), f(2000), f(3000), f(4000), nil}); got == nil || *got != 3000 {
		t.Fatal(got)
	}
	if statsAverage([]*float64{f(1000), f(2000), f(3000), nil, nil}) != nil {
		t.Fatal("two DNFs")
	}
	if got := statsEffective(M{"time_ms": int64(1000), "penalty": "+2"}); got == nil || *got != 3000 {
		t.Fatal(got)
	}
	if statsHistory("empty", nil)["summary"].(M)["lastAt"] != nil {
		t.Fatal("lastAt")
	}
}
