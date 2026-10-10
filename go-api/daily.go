package main

import (
	"math"
	"sort"
	"strconv"
	"strings"
	"time"
)

// The daily scramble: the same scramble for everyone, per event, drawn by the clients from the UTC date
// (src/client/lib/daily.ts). Each account has one ranked attempt a day per event; anyone may see the field.

// dailyEvents: the events with a daily scramble, and the fastest time taken as plausible (ms), under the world records.
var dailyEvents = map[string]float64{"333": 2500, "333oh": 5000}

const dailyMaxMs = 3_600_000

func dailyDay(t time.Time) string { return t.UTC().Format("2006-01-02") }

// dailyEffective: the time a result counts for, nil for a DNF.
func dailyEffective(ms float64, penalty string) *float64 {
	switch penalty {
	case "dnf":
		return nil
	case "+2":
		ms += 2000
	}
	return &ms
}

// dailyPlace: the rank of a time among `times` (DNF last) and the share of the others it beats, in percent. `in`
// says whether the time is one of `times` (the player's own result) or only placed against them.
func dailyPlace(times []*float64, t *float64, in bool) M {
	faster, slower := 0, 0
	for _, o := range times {
		switch {
		case o != nil && (t == nil || *o < *t):
			faster++
		case t != nil && (o == nil || *o > *t):
			slower++
		}
	}
	others := len(times)
	if in {
		others--
	}
	beats := 100.0
	if t == nil {
		beats = 0
	} else if others > 0 {
		beats = math.Round(float64(slower)*1000/float64(others)) / 10
	}
	return M{"rank": faster + 1, "beats": beats}
}

// dailyNiceWidths: the bucket widths a histogram picks from (ms).
var dailyNiceWidths = []float64{100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 15000, 20000, 30000, 60000, 120000, 300000}

// dailyBuckets: the finished times as a histogram of round widths, from the fastest to the 95th percentile; the
// slower ones fall in the last bucket.
func dailyBuckets(times []*float64) M {
	done := []float64{}
	for _, t := range times {
		if t != nil {
			done = append(done, *t)
		}
	}
	if len(done) == 0 {
		return M{"from": 0, "width": 0, "counts": []int{}}
	}
	sort.Float64s(done)
	lo, hi := done[0], done[int(math.Ceil(0.95*float64(len(done)-1)))]
	width := dailyNiceWidths[len(dailyNiceWidths)-1]
	for _, w := range dailyNiceWidths {
		if w*16 >= hi-lo {
			width = w
			break
		}
	}
	from := math.Floor(lo/width) * width
	counts := make([]int, int((hi-from)/width)+1)
	for _, t := range done {
		counts[min(int((t-from)/width), len(counts)-1)]++
	}
	return M{"from": from, "width": width, "counts": counts}
}

// dailyCancelMs: how long after it is recorded a ranked attempt may be cancelled (a false start, a stop missed), once a
// day per event: long enough to see a mistake, too short and too rare to fish for a better time.
const dailyCancelMs = 2 * 60_000

// dailyVerifiedMoves: the fewest turns a connected cube must have recorded for a result to count as verified.
// ponytail: the moves are kept but not replayed against the day's state; port dailyPattern to Go to check them.
const dailyVerifiedMoves = 10

// dailyField: a day's results for an event, only the verified ones when `verified`.
func dailyField(db *Conn, day, event string, verified bool) ([]M, []*float64, error) {
	q := "SELECT user_id,time_ms,penalty,verified FROM daily_results WHERE day=? AND event=?"
	if verified {
		q += " AND verified=1"
	}
	rows, err := dbAll(db, q, day, event)
	if err != nil {
		return nil, nil, err
	}
	times := make([]*float64, len(rows))
	for i, row := range rows {
		ms, _ := asFloat(row["time_ms"])
		times[i] = dailyEffective(ms, str(row["penalty"]))
	}
	return rows, times, nil
}

// dailyBoard: the day's field for an event (only its verified results when `verified`): its histogram, its size, the
// caller's ranked result if any (placed among them when the view leaves it out), and where `placed` would stand.
func dailyBoard(db *Conn, day, event, user string, placed *[2]any, verified bool) (M, error) {
	// ponytail: the whole field is read per request; a cached histogram when a day holds tens of thousands.
	rows, times, err := dailyField(db, day, event, verified)
	if err != nil {
		return nil, err
	}
	dnf := 0
	for _, t := range times {
		if t == nil {
			dnf++
		}
	}
	shown, err := dbOne(db, "SELECT count(*) n,coalesce(sum(verified),0) v FROM daily_results WHERE day=? AND event=?", day, event)
	if err != nil {
		return nil, err
	}
	out := M{"day": day, "event": event, "total": len(rows), "dnf": dnf, "buckets": dailyBuckets(times), "verifiedTotal": shown["v"], "allTotal": shown["n"], "mine": nil, "placed": nil}
	if user != "" {
		own, err := dbOne(db, "SELECT time_ms,penalty,verified,created_at FROM daily_results WHERE day=? AND event=? AND user_id=?", day, event, user)
		if err != nil {
			return nil, err
		}
		if own != nil {
			ms, _ := asFloat(own["time_ms"])
			in := !verified || truthy(own["verified"])
			mine := dailyPlace(times, dailyEffective(ms, str(own["penalty"])), in)
			mine["timeMs"], mine["penalty"], mine["verified"] = own["time_ms"], own["penalty"], truthy(own["verified"])
			mine["cancellable"] = dailyCancellable(db, day, event, user, str(own["created_at"]))
			out["mine"] = mine
		}
	}
	if placed != nil {
		ms, _ := asFloat(placed[0])
		p := dailyPlace(times, dailyEffective(ms, str(placed[1])), false)
		p["timeMs"], p["penalty"] = ms, placed[1]
		out["placed"] = p
	}
	return out, nil
}

func truthy(v any) bool { n, _ := asFloat(v); return n != 0 }

// dailyCancellable: whether the ranked attempt recorded at `at` may still be cancelled.
func dailyCancellable(db *Conn, day, event, user, at string) bool {
	t, err := time.Parse("2006-01-02T15:04:05.999Z", at)
	if err != nil || time.Since(t) > dailyCancelMs*time.Millisecond {
		return false
	}
	used, err := dbOne(db, "SELECT 1 FROM daily_cancelled WHERE day=? AND event=? AND user_id=?", day, event, user)
	return err == nil && used == nil
}

// dailyHistory: the account's results on an event, newest first, each with its rank in that day's field (the verified
// field when `verified`, then only its verified results), over the last 120 days.
func dailyHistory(db *Conn, event, user string, verified bool) ([]M, error) {
	q := "SELECT day,time_ms,penalty,verified FROM daily_results WHERE event=? AND user_id=? AND day>=?"
	if verified {
		q += " AND verified=1"
	}
	rows, err := dbAll(db, q+" ORDER BY day DESC", event, user, dailyDay(time.Now().Add(-120*24*time.Hour)))
	if err != nil {
		return nil, err
	}
	out := make([]M, 0, len(rows))
	for _, row := range rows {
		// ponytail: one field read per day shown; a stored rank per result if the history grows past months.
		_, times, err := dailyField(db, str(row["day"]), event, verified)
		if err != nil {
			return nil, err
		}
		ms, _ := asFloat(row["time_ms"])
		place := dailyPlace(times, dailyEffective(ms, str(row["penalty"])), true)
		place["day"], place["timeMs"], place["penalty"], place["verified"], place["total"] = row["day"], row["time_ms"], row["penalty"], truthy(row["verified"]), len(times)
		out = append(out, place)
	}
	return out, nil
}

// dailyRoute: GET daily/<event>[?day=&time=&penalty=&verified=1] for anyone; GET daily/<event>/history[?verified=1]
// the account's past results; POST daily/<event> {day, timeMs, penalty, solution} records the signed-in account's
// ranked attempt: the first of the day, whose penalty may change afterwards (a later attempt is placed, not recorded);
// DELETE daily/<event>?day= cancels it, once a day per event and within dailyCancelMs of its recording.
func dailyRoute(db *Conn, method string, parts []string, query map[string]string, body any, caller *ApiCaller) (any, error) {
	if len(parts) != 2 && !(len(parts) == 3 && parts[2] == "history" && method == "GET") {
		return nil, apiErr(404, "Not found")
	}
	event := parts[1]
	floor, ok := dailyEvents[event]
	if !ok {
		return nil, apiErr(404, "Not found")
	}
	now := time.Now()
	today, yesterday := dailyDay(now), dailyDay(now.Add(-24*time.Hour))
	verified := query["verified"] == "1"
	if method != "GET" || len(parts) == 3 {
		if caller.user == nil || caller.user["password_hash"] == nil {
			return nil, apiErr(403, "Sign in to be ranked.")
		}
	}
	switch method {
	case "GET":
		if len(parts) == 3 {
			return dailyHistory(db, event, caller.id(), verified)
		}
		day := today
		if d, ok := query["day"]; ok {
			if t, err := time.Parse("2006-01-02", d); err != nil || d > today || t.IsZero() {
				return nil, validation()
			}
			day = d
		}
		var placed *[2]any
		if t, ok := query["time"]; ok {
			ms, err := strconv.ParseFloat(t, 64)
			penalty := query["penalty"]
			if penalty == "" {
				penalty = "none"
			}
			if err != nil || ms < 0 || ms > dailyMaxMs || (penalty != "none" && penalty != "+2" && penalty != "dnf") {
				return nil, validation()
			}
			placed = &[2]any{ms, penalty}
		}
		return dailyBoard(db, day, event, caller.id(), placed, verified)
	case "DELETE":
		day := query["day"]
		if day != today && day != yesterday {
			return nil, validation()
		}
		uid := caller.id()
		own, err := dbOne(db, "SELECT time_ms,penalty,created_at FROM daily_results WHERE day=? AND event=? AND user_id=?", day, event, uid)
		if err != nil {
			return nil, err
		}
		if own == nil {
			return nil, apiErr(404, "No ranked attempt to cancel.")
		}
		if !dailyCancellable(db, day, event, uid, str(own["created_at"])) {
			return nil, apiErr(409, "This time can no longer be cancelled: once a day, within two minutes of the solve.")
		}
		if _, err := db.Exec("INSERT INTO daily_cancelled(day,event,user_id,time_ms,penalty) VALUES(?,?,?,?,?)", day, event, uid, own["time_ms"], own["penalty"]); err != nil {
			return nil, err
		}
		if _, err := db.Exec("DELETE FROM daily_results WHERE day=? AND event=? AND user_id=?", day, event, uid); err != nil {
			return nil, err
		}
		return dailyBoard(db, day, event, uid, nil, false)
	case "POST":
		day, err := apiEnumString(body, "day", today, yesterday)
		if err != nil {
			return nil, err
		}
		penalty := "none"
		if _, ok := get(body, "penalty"); ok {
			if penalty, err = apiEnumString(body, "penalty", "none", "+2", "dnf"); err != nil {
				return nil, err
			}
		}
		ms, ok := asFloat(idx(body, "timeMs"))
		if !ok || math.IsNaN(ms) || ms != math.Round(ms) || ms < 0 || ms > dailyMaxMs || (penalty != "dnf" && ms < floor) {
			return nil, apiErr(400, "This time is not plausible.")
		}
		// A connected cube's turns make the result verified; the keyboard's and the screen's are not.
		var solution any
		solved := 0
		if v, ok := idx(body, "solution").(string); ok && len(v) <= 4000 {
			if solved = len(strings.Fields(v)); solved > 0 {
				solution = v
			}
		}
		isVerified := 0
		if solved >= dailyVerifiedMoves {
			isVerified = 1
		}
		uid := caller.id()
		inserted, err := db.Exec("INSERT INTO daily_results(day,event,user_id,time_ms,penalty,verified,solution) VALUES(?,?,?,?,?,?,?) ON CONFLICT DO NOTHING", day, event, uid, ms, penalty, isVerified, solution)
		if err != nil {
			return nil, err
		}
		ranked := inserted > 0
		if !ranked {
			// The ranked attempt again, with another penalty (a +2 or a DNF given after the solve).
			updated, err := db.Exec("UPDATE daily_results SET penalty=? WHERE day=? AND event=? AND user_id=? AND time_ms=?", penalty, day, event, uid, ms)
			if err != nil {
				return nil, err
			}
			ranked = updated > 0
		}
		out, err := dailyBoard(db, day, event, uid, &[2]any{ms, penalty}, false)
		if err != nil {
			return nil, err
		}
		out["ranked"] = ranked
		return out, nil
	}
	return nil, apiErr(404, "Not found")
}
