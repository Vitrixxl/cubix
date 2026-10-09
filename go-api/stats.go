package main

import (
	"math"
	"sort"
)

// statsEffectiveMs: the time a solve counts for: none for a DNF, two more seconds for +2.
func statsEffectiveMs(ms float64, penalty string) *float64 {
	switch penalty {
	case "dnf":
		return nil
	case "+2":
		ms += 2000
	}
	return &ms
}

// statsEffectiveMsSQL is `statsEffectiveMs` over the `time_ms` and `penalty` columns of a solve, in SQL.
const statsEffectiveMsSQL = "CASE WHEN penalty='dnf' THEN NULL ELSE time_ms+CASE WHEN penalty='+2' THEN 2000 ELSE 0 END END"

func statsEffective(s M) *float64 {
	ms, _ := asFloat(s["time_ms"])
	return statsEffectiveMs(ms, str(s["penalty"]))
}

func statsAverage(times []*float64) *float64 {
	dnfs := 0
	for _, t := range times {
		if t == nil {
			dnfs++
		}
	}
	if len(times) < 3 || dnfs > 1 {
		return nil
	}
	sorted := make([]float64, len(times))
	for i, t := range times {
		if t == nil {
			sorted[i] = math.Inf(1)
		} else {
			sorted[i] = *t
		}
	}
	sort.Float64s(sorted)
	sum := 0.0
	for _, v := range sorted[1 : len(sorted)-1] {
		sum += v
	}
	avg := sum / float64(len(sorted)-2)
	return &avg
}

func statsRolling(times []*float64, n int) []*float64 {
	var mins, maxs []int
	sum, dnfs := 0.0, 0
	result := make([]*float64, 0, len(times))
	for i, time := range times {
		if i >= n {
			if old := times[i-n]; old != nil {
				sum -= *old
			} else {
				dnfs--
			}
			for len(mins) > 0 && mins[0] <= i-n {
				mins = mins[1:]
			}
			for len(maxs) > 0 && maxs[0] <= i-n {
				maxs = maxs[1:]
			}
		}
		if time != nil {
			sum += *time
			for len(mins) > 0 && *times[mins[len(mins)-1]] >= *time {
				mins = mins[:len(mins)-1]
			}
			for len(maxs) > 0 && *times[maxs[len(maxs)-1]] <= *time {
				maxs = maxs[:len(maxs)-1]
			}
			mins = append(mins, i)
			maxs = append(maxs, i)
		} else {
			dnfs++
		}
		if i+1 < n || dnfs > 1 {
			result = append(result, nil)
			continue
		}
		v := sum - *times[mins[0]]
		if dnfs == 0 {
			v -= *times[maxs[0]]
		}
		v /= float64(n - 2)
		result = append(result, &v)
	}
	return result
}

func statsMinimum(values []*float64) *float64 {
	var best *float64
	for _, v := range values {
		if v != nil && (best == nil || *v < *best) {
			x := *v
			best = &x
		}
	}
	return best
}

func statsHistory(caseID string, solves []M) M {
	times := make([]*float64, len(solves))
	for i, s := range solves {
		times[i] = statsEffective(s)
	}
	ao5 := statsRolling(times, 5)
	ao12 := statsRolling(times, 12)
	var best *float64
	entries := make([]any, len(solves))
	for i, s := range solves {
		if t := times[i]; t != nil && (best == nil || *t < *best) {
			x := *t
			best = &x
		}
		entries[i] = M{"id": s["id"], "time": times[i], "timeMs": s["time_ms"], "penalty": s["penalty"], "comment": s["comment"], "at": s["created_at"], "best": best, "sessionId": s["session_id"]}
	}
	return M{"summary": statsSummaryOf(caseID, solves, times, ao5, ao12), "history": entries, "ao5": ao5, "ao12": ao12}
}

func statsSummary(caseID string, solves []M) M {
	times := make([]*float64, len(solves))
	for i, s := range solves {
		times[i] = statsEffective(s)
	}
	return statsSummaryOf(caseID, solves, times, statsRolling(times, 5), statsRolling(times, 12))
}

func last(values []*float64) *float64 {
	if len(values) == 0 {
		return nil
	}
	return values[len(values)-1]
}

func statsSummaryOf(caseID string, solves []M, times, ao5, ao12 []*float64) M {
	var worst, mean *float64
	sum, count := 0.0, 0
	for _, t := range times {
		if t == nil {
			continue
		}
		if worst == nil || *t > *worst {
			x := *t
			worst = &x
		}
		sum += *t
		count++
	}
	if count > 0 {
		m := sum / float64(count)
		mean = &m
	}
	var lastAt any
	if len(solves) > 0 {
		lastAt = solves[len(solves)-1]["created_at"]
	}
	return M{
		"caseId": caseID, "count": len(solves), "best": statsMinimum(times), "worst": worst, "mean": mean,
		"ao5": last(ao5), "ao12": last(ao12), "bestAo5": statsMinimum(ao5), "bestAo12": statsMinimum(ao12),
		"last": last(times), "lastAt": lastAt,
	}
}
