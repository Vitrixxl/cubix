package main

// Administration data behind the admin session (see `adminDispatch`): overview, persistent
// request log, IPs, accounts, and the two account actions. Every timestamp is milliseconds since
// the Unix epoch; every `day` is a UTC `YYYY-MM-DD`.

import (
	"fmt"
	"slices"
	"strconv"
	"strings"
)

const adminDataUnknown = "Unknown account"

// `/requests` counts its matching rows up to this many; beyond, `totalCapped` is set.
const adminDataCountCap int64 = 10_000

// adminDataMs: ISO-8601 text columns as milliseconds since the epoch.
func adminDataMs(expr string) string {
	return fmt.Sprintf("CAST(round((julianday(%s)-2440587.5)*86400000) AS INTEGER)", expr)
}

func adminDataN(value M, key string) int64 {
	n, _ := asInt(value[key])
	return n
}

func adminDataFlags(rows []M, keys ...string) {
	for _, row := range rows {
		for _, key := range keys {
			row[key] = eqInt(row[key], 1)
		}
	}
}

// adminDataQuery: validated query parameters, bounded in number and length, typed on access.
type adminDataQuery map[string]string

func newAdminDataQuery(query map[string]string) (*adminDataQuery, error) {
	if len(query) > 16 {
		return nil, validation()
	}
	for k, v := range query {
		if len(k) > 20 || len(v) > 100 {
			return nil, validation()
		}
	}
	q := adminDataQuery(query)
	return &q, nil
}

func (q *adminDataQuery) text(key string) (string, bool) {
	v, ok := (*q)[key]
	v = strings.TrimSpace(v)
	return v, ok && v != ""
}

func (q *adminDataQuery) optionalInt(key string, min, max int64) (*int64, error) {
	text, ok := q.text(key)
	if !ok {
		return nil, nil
	}
	v, err := strconv.ParseInt(text, 10, 64)
	if err != nil || v < min || v > max {
		return nil, validation()
	}
	return &v, nil
}

func (q *adminDataQuery) int(key string, def, min, max int64) (int64, error) {
	v, err := q.optionalInt(key, min, max)
	if err != nil || v == nil {
		return def, err
	}
	return *v, nil
}

func (q *adminDataQuery) choice(key string, allowed []string, def string) (string, error) {
	v, ok := q.text(key)
	if !ok {
		return def, nil
	}
	if !slices.Contains(allowed, v) {
		return "", validation()
	}
	return v, nil
}

// page: `page` from 0 and `limit` (1–200, 50 by default).
func (q *adminDataQuery) page() (int64, int64, error) {
	page, err := q.int("page", 0, 0, 100_000)
	if err != nil {
		return 0, 0, err
	}
	limit, err := q.int("limit", 50, 1, 200)
	return page, limit, err
}

// descending: `desc` unless `order=asc`, or the given default.
func (q *adminDataQuery) descending(def bool) (bool, error) {
	d := "asc"
	if def {
		d = "desc"
	}
	order, err := q.choice("order", []string{"asc", "desc"}, d)
	return order == "desc", err
}

// adminDataUserID: account ids are UUIDs; older or imported ones stay short and plain.
func adminDataUserID(value string) (string, error) {
	if len(value) < 1 || len(value) > 64 {
		return "", apiErr(404, adminDataUnknown)
	}
	for i := 0; i < len(value); i++ {
		c := value[i]
		if !('a' <= c && c <= 'z' || 'A' <= c && c <= 'Z' || '0' <= c && c <= '9' || c == '-' || c == '_') {
			return "", apiErr(404, adminDataUnknown)
		}
	}
	return value, nil
}

// adminDataPurge removes an account and everything it owns, inside the caller's transaction: its solves and sessions
// (counted), then the rest. Finished duels stay for the opponent under the name `deleted`; request log rows lose the
// account id, except the audit rows of administrator actions on it.
func adminDataPurge(tx *Conn, user string) (solves int64, sessions int64, err error) {
	if solves, err = tx.Exec("DELETE FROM solves WHERE user_id=?", user); err != nil {
		return
	}
	if sessions, err = tx.Exec("DELETE FROM sessions WHERE user_id=?", user); err != nil {
		return
	}
	for _, query := range []string{
		"DELETE FROM learned_cases WHERE user_id=?",
		"DELETE FROM learning_group_orders WHERE user_id=?",
		"DELETE FROM personal_entries WHERE user_id=?",
		"DELETE FROM sync_receipts WHERE user_id=?",
		// Last: the deletions above journal their changes here.
		"DELETE FROM sync_changes WHERE user_id=?",
		"DELETE FROM auth_tokens WHERE user_id=?",
		"DELETE FROM user_activity WHERE user_id=?",
		"DELETE FROM traffic_daily_users WHERE user_id=?",
		"UPDATE duel_games SET player1_id=NULL,player1_name='deleted' WHERE player1_id=?",
		"UPDATE duel_games SET player2_id=NULL,player2_name='deleted' WHERE player2_id=?",
		"UPDATE request_log SET user_id=NULL WHERE user_id=? AND kind NOT IN ('admin','account')",
		"DELETE FROM users WHERE id=?",
	} {
		if _, err = tx.Exec(query, user); err != nil {
			return
		}
	}
	return
}

// adminDataPurgeGuests: guest accounts were retired; those left (no password) go with everything they own, at startup.
func adminDataPurgeGuests(db *Conn) (int, error) {
	tx, err := db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	rows, err := dbAll(db, "SELECT id FROM users WHERE password_hash IS NULL")
	if err != nil {
		return 0, err
	}
	guests := 0
	for _, row := range rows {
		if id, ok := asStr(row["id"]); ok {
			if _, _, err := adminDataPurge(db, id); err != nil {
				return 0, err
			}
			guests++
		}
	}
	return guests, tx.Commit()
}

func adminDataOverview(state *AppState) (any, error) {
	state.traffic.log.settle()
	liveIPs := state.traffic.liveIPs()
	started := state.traffic.started
	dropped := state.traffic.log.droppedCount()
	days := activityLastDays(30)
	data, err := dbCall(state.db, func(db *Conn) (M, error) {
		today, week, month := days[29], days[23], days[0]
		dayStart := accountsNow() / accountsDayMs * accountsDayMs
		var failed error
		// Counts since a moment are range counts, each served by an index.
		count := func(sql string, args ...any) int64 {
			if failed != nil {
				return 0
			}
			row, err := dbOne(db, sql, args...)
			if err != nil {
				failed = err
			}
			return adminDataN(row, "n")
		}
		one := func(sql string, args ...any) M {
			if failed != nil {
				return nil
			}
			row, err := dbOne(db, sql, args...)
			if err != nil {
				failed = err
			}
			return row
		}
		users := one("SELECT count(*) total,coalesce(sum(password_hash IS NOT NULL),0) registered,coalesce(sum(password_hash IS NULL),0) guests FROM users")
		newUsers := func(since string) int64 { return count("SELECT count(*) n FROM users WHERE created_at>=?", since) }
		active := func(since string) int64 {
			return count("SELECT count(DISTINCT user_id) n FROM user_activity WHERE day>=?", since)
		}
		solvesSince := func(since string) int64 { return count("SELECT count(*) n FROM solves WHERE created_at>=?", since) }
		solves := M{"total": count("SELECT count(*) n FROM solves"), "today": solvesSince(today), "d7": solvesSince(week)}
		traffic := one("SELECT coalesce(sum(requests),0) requests,coalesce(sum(errors),0) errors,coalesce(sum(server_errors),0) serverErrors,coalesce(sum(limited),0) limited,count(*) ips FROM traffic_daily WHERE day=?", today)
		ips := func(since string) int64 {
			return count("SELECT count(DISTINCT ip) n FROM traffic_daily WHERE day>=?", since)
		}
		duelsSince := func(since int64) int64 { return count("SELECT count(*) n FROM duel_games WHERE ended_at>=?", since) }
		duels := M{"total": count("SELECT count(*) n FROM duel_games"), "today": duelsSince(dayStart), "d7": duelsSince(dayStart - 6*accountsDayMs)}
		series := make([]any, len(days))
		index := map[string]int{}
		for i, day := range days {
			series[i] = M{"day": day, "requests": 0, "ips": 0, "errors": 0, "serverErrors": 0, "limited": 0, "signups": 0, "registrations": 0, "active": 0, "solves": 0, "duels": 0}
			index[day] = i
		}
		merge := func(sql string, args ...any) {
			if failed != nil {
				return
			}
			rows, err := dbAll(db, sql, args...)
			if err != nil {
				failed = err
				return
			}
			for _, row := range rows {
				day, ok := asStr(row["day"])
				i, known := index[day]
				if !ok || !known {
					continue
				}
				for key, value := range row {
					if key != "day" {
						series[i].(M)[key] = value
					}
				}
			}
		}
		merge("SELECT day,sum(requests) requests,count(*) ips,sum(errors) errors,sum(server_errors) serverErrors,sum(limited) limited FROM traffic_daily WHERE day>=? GROUP BY day", month)
		merge("SELECT substr(created_at,1,10) day,count(*) signups,sum(password_hash IS NOT NULL) registrations FROM users WHERE created_at>=? GROUP BY 1", month)
		merge("SELECT day,count(*) active FROM user_activity WHERE day>=? GROUP BY day", month)
		merge("SELECT substr(created_at,1,10) day,count(*) solves FROM solves WHERE created_at>=? GROUP BY 1", month)
		merge("SELECT date(ended_at/1000,'unixepoch') day,count(*) duels FROM duel_games WHERE ended_at>=? GROUP BY 1", dayStart-29*accountsDayMs)
		size := one("SELECT (SELECT page_count FROM pragma_page_count())*(SELECT page_size FROM pragma_page_size()) bytes,(SELECT freelist_count FROM pragma_freelist_count())*(SELECT page_size FROM pragma_page_size()) free")
		log := one("SELECT (SELECT count(*) FROM request_log) rows,(SELECT count(*) FROM request_log WHERE important=1) important,(SELECT min(at) FROM request_log) oldestAt")
		result := M{
			"users": M{
				"total": users["total"], "registered": users["registered"], "guests": users["guests"],
				"new":    M{"today": newUsers(today), "d7": newUsers(week), "d30": newUsers(month)},
				"active": M{"today": active(today), "d7": active(week), "d30": active(month)},
			},
			"solves":   solves,
			"requests": M{"today": traffic["requests"], "errorsToday": traffic["errors"], "serverErrorsToday": traffic["serverErrors"], "rateLimitedToday": traffic["limited"]},
			"ips":      M{"today": traffic["ips"], "d7": ips(week), "d30": ips(month)},
			"duels":    duels,
			"series":   series,
			"db":       M{"bytes": size["bytes"], "freeBytes": size["free"], "logRows": log["rows"], "importantLogRows": log["important"], "oldestLogAt": log["oldestAt"]},
		}
		return result, failed
	})
	if err != nil {
		return nil, err
	}
	data["ips"].(M)["live"] = liveIPs
	var build, commit any
	if n, ok := releaseBuildNumber(); ok {
		build = n
	}
	if c, ok := releaseCommit(); ok {
		commit = c
	}
	data["server"] = M{
		"now":       accountsNow(),
		"startedAt": started,
		"uptimeMs":  accountsNow() - started,
		"version":   version,
		"build":     build,
		"commit":    commit,
		"db":        data["db"],
		"log": M{
			"retentionDays":    activityRetentionDays,
			"maxRows":          activityMaxRows,
			"maxImportantRows": activityMaxImportantRows,
			"trafficDays":      activityTrafficDays,
			"dropped":          dropped,
		},
	}
	delete(data, "db")
	return data, nil
}

func adminDataRequests(state *AppState, query *adminDataQuery) (any, error) {
	page, limit, err := query.page()
	if err != nil {
		return nil, err
	}
	var clauses []string
	var args []any
	if flag, ok := query.text("important"); ok {
		clauses = append(clauses, "l.important=?")
		switch flag {
		case "1", "true":
			args = append(args, 1)
		case "0", "false":
			args = append(args, 0)
		default:
			return nil, validation()
		}
	}
	if kind, ok := query.text("kind"); ok {
		if !slices.Contains(activityKinds[:], kind) {
			return nil, validation()
		}
		clauses = append(clauses, "l.kind=?")
		args = append(args, kind)
	}
	if status, ok := query.text("status"); ok {
		if status == "error" {
			clauses = append(clauses, "l.status>=400")
		} else if len(status) == 3 && '1' <= status[0] && status[0] <= '5' && status[1:] == "xx" {
			base := int64(status[0]-'0') * 100
			clauses = append(clauses, "l.status BETWEEN ? AND ?")
			args = append(args, base, base+99)
		} else {
			code, err := strconv.ParseInt(status, 10, 64)
			if err != nil || code < 100 || code > 599 {
				return nil, validation()
			}
			clauses = append(clauses, "l.status=?")
			args = append(args, code)
		}
	}
	if method, ok := query.text("method"); ok {
		if len(method) > 10 {
			return nil, validation()
		}
		for i := 0; i < len(method); i++ {
			if c := method[i]; !('a' <= c && c <= 'z' || 'A' <= c && c <= 'Z') {
				return nil, validation()
			}
		}
		clauses = append(clauses, "l.method=?")
		args = append(args, strings.ToUpper(method))
	}
	for _, field := range [][2]string{{"ip", "l.ip"}, {"path", "l.path"}} {
		if value, ok := query.text(field[0]); ok {
			clauses = append(clauses, fmt.Sprintf("instr(%s,?)>0", field[1]))
			args = append(args, value)
		}
	}
	if user, ok := query.text("user"); ok {
		clauses = append(clauses, "(l.user_id=? OR l.user_id=(SELECT id FROM users WHERE username=? COLLATE NOCASE))")
		args = append(args, user, user)
	}
	for _, field := range [][2]string{{"from", "l.at>=?"}, {"to", "l.at<?"}, {"before", "l.id<?"}} {
		value, err := query.optionalInt(field[0], 0, (1<<63-1)/2)
		if err != nil {
			return nil, err
		}
		if value != nil {
			clauses = append(clauses, field[1])
			args = append(args, *value)
		}
	}
	filter := ""
	if len(clauses) > 0 {
		filter = "WHERE " + strings.Join(clauses, " AND ")
	}
	state.traffic.log.settle()
	return dbCall(state.db, func(db *Conn) (any, error) {
		// Counting stops past the cap: a broad filter over the whole log stays cheap.
		row, err := dbOne(db, fmt.Sprintf("SELECT count(*) n FROM (SELECT 1 FROM request_log l %s LIMIT ?)", filter), append(slices.Clone(args), adminDataCountCap+1)...)
		if err != nil {
			return nil, err
		}
		total := adminDataN(row, "n")
		values, err := dbAll(db, fmt.Sprintf("SELECT %s FROM request_log l LEFT JOIN users u ON u.id=l.user_id %s ORDER BY l.id DESC LIMIT ? OFFSET ?", activityRowColumns, filter), append(args, limit, page*limit)...)
		if err != nil {
			return nil, err
		}
		rows := make([]any, len(values))
		for i, value := range values {
			rows[i] = activityRowValue(value)
		}
		return M{"rows": rows, "total": min(total, adminDataCountCap), "totalCapped": total > adminDataCountCap, "page": page, "limit": limit, "kinds": activityKinds}, nil
	})
}

func adminDataIps(state *AppState, query *adminDataQuery) (any, error) {
	page, limit, err := query.page()
	if err != nil {
		return nil, err
	}
	days, err := query.int("days", 7, 1, activityTrafficDays)
	if err != nil {
		return nil, err
	}
	sort, err := query.choice("sort", []string{"requests", "errors", "serverErrors", "limited", "lastSeen", "firstSeen", "ip", "users"}, "requests")
	if err != nil {
		return nil, err
	}
	descending, err := query.descending(sort != "ip")
	if err != nil {
		return nil, err
	}
	column := sort
	switch sort {
	case "lastSeen":
		column = "lastSeenAt"
	case "firstSeen":
		column = "firstSeenAt"
	case "users":
		column = "userCount"
	}
	direction := "ASC"
	if descending {
		direction = "DESC"
	}
	order := column + " " + direction + ",ip"
	q, _ := query.text("q")
	var user any
	if text, ok := query.text("user"); ok {
		user = text
	}
	state.traffic.log.settle()
	return dbCall(state.db, func(db *Conn) (any, error) {
		since := activityDay(accountsNow() - (days-1)*accountsDayMs)
		scope := "day>=?1 AND instr(ip,?2)>0 AND (?3 IS NULL OR ip IN (SELECT ip FROM traffic_daily_users WHERE day>=?1 AND user_id IN (SELECT id FROM users WHERE id=?3 OR username=?3 COLLATE NOCASE)))"
		totals, err := dbOne(db, "SELECT count(DISTINCT ip) ips,coalesce(sum(requests),0) requests,coalesce(sum(errors),0) errors,coalesce(sum(limited),0) limited FROM traffic_daily WHERE "+scope, since, q, user)
		if err != nil {
			return nil, err
		}
		rows, err := dbAll(db, fmt.Sprintf(`SELECT t.*,coalesce(c.userCount,0) userCount FROM
                (SELECT ip,sum(requests) requests,sum(errors) errors,sum(server_errors) serverErrors,sum(limited) limited,min(first_at) firstSeenAt,max(last_at) lastSeenAt,count(*) activeDays
                 FROM traffic_daily WHERE %s GROUP BY ip) t
                LEFT JOIN (SELECT ip,count(DISTINCT user_id) userCount FROM traffic_daily_users WHERE day>=?1 GROUP BY ip) c USING(ip)
                ORDER BY %s LIMIT ?4 OFFSET ?5`, scope, order), since, q, user, limit, page*limit)
		if err != nil {
			return nil, err
		}
		// The accounts seen from the page's IPs, at most 20 each, in one query.
		users := map[string][]any{}
		if len(rows) > 0 {
			args := []any{since}
			for _, row := range rows {
				args = append(args, str(row["ip"]))
			}
			marks := strings.Repeat("?,", len(rows))
			seen, err := dbAll(db, fmt.Sprintf(`SELECT ip,id,username,isGuest FROM (SELECT t.ip,u.id,u.username,(u.password_hash IS NULL) isGuest,
                    row_number() OVER (PARTITION BY t.ip ORDER BY u.password_hash IS NULL,u.username) n
                    FROM (SELECT DISTINCT ip,user_id FROM traffic_daily_users WHERE day>=?1 AND ip IN (%s)) t JOIN users u ON u.id=t.user_id)
                    WHERE n<=20 ORDER BY ip,n`, marks[:len(marks)-1]), args...)
			if err != nil {
				return nil, err
			}
			adminDataFlags(seen, "isGuest")
			for _, user := range seen {
				ip := str(user["ip"])
				delete(user, "ip")
				users[ip] = append(users[ip], user)
			}
		}
		for _, row := range rows {
			ip := str(row["ip"])
			list := users[ip]
			delete(users, ip)
			if list == nil {
				list = []any{}
			}
			row["users"] = list
		}
		return M{"days": days, "since": since, "rows": rows, "total": totals["ips"], "totals": totals, "page": page, "limit": limit}, nil
	})
}

// The `solves.created_at` of seven days ago.
const adminDataWeekAgo = "strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days')"

// adminDataUserRows: one account row, as listed and in its detail. `filter` follows `FROM users u`.
func adminDataUserRows(db *Conn, filter, order string, args ...any) ([]M, error) {
	sql := fmt.Sprintf(`SELECT u.id,u.username,(u.password_hash IS NULL) isGuest,%[1]s createdAt,u.last_seen_at lastSeenAt,
          (SELECT count(*) FROM solves s WHERE s.user_id=u.id) solves,
          (SELECT count(*) FROM solves s WHERE s.user_id=u.id AND s.created_at>=%[2]s) solves7d,
          (SELECT count(*) FROM learned_cases l WHERE l.user_id=u.id AND l.learned=1) learnedCases,
          (SELECT count(*) FROM duel_games d WHERE d.player1_id=u.id)+(SELECT count(*) FROM duel_games d WHERE d.player2_id=u.id) duels,
          (SELECT count(*) FROM auth_tokens t WHERE t.user_id=u.id AND t.expires_at>%[3]d) activeSessions,
          %[4]s lastSolveAt
        FROM users u %[5]s ORDER BY %[6]s`,
		adminDataMs("u.created_at"), adminDataWeekAgo, accountsNow(), adminDataMs("(SELECT max(s.created_at) FROM solves s WHERE s.user_id=u.id)"), filter, order)
	rows, err := dbAll(db, sql, args...)
	if err != nil {
		return nil, err
	}
	adminDataFlags(rows, "isGuest")
	return rows, nil
}

func adminDataUsers(state *AppState, query *adminDataQuery) (any, error) {
	page, limit, err := query.page()
	if err != nil {
		return nil, err
	}
	filter, err := query.choice("filter", []string{"all", "registered", "guests"}, "all")
	if err != nil {
		return nil, err
	}
	sort, err := query.choice("sort", []string{"created", "lastSeen", "solves", "solves7d", "username"}, "created")
	if err != nil {
		return nil, err
	}
	descending, err := query.descending(sort != "username")
	if err != nil {
		return nil, err
	}
	q, _ := query.text("q")
	q = strings.ToLower(q)
	direction := "ASC"
	if descending {
		direction = "DESC"
	}
	var order string
	switch sort {
	case "lastSeen":
		order = "u.last_seen_at IS NULL,u.last_seen_at " + direction + ",u.id"
	case "solves":
		order = "solves " + direction + ",u.created_at DESC,u.id"
	case "solves7d":
		order = "solves7d " + direction + ",lastSolveAt DESC,u.id"
	case "username":
		order = "u.username COLLATE NOCASE " + direction + ",u.id"
	default:
		order = "u.created_at " + direction + ",u.id"
	}
	kind := "1"
	switch filter {
	case "registered":
		kind = "u.password_hash IS NOT NULL"
	case "guests":
		kind = "u.password_hash IS NULL"
	}
	state.traffic.log.settle()
	return dbCall(state.db, func(db *Conn) (any, error) {
		counts, err := dbOne(db, `SELECT count(*) "all",coalesce(sum(password_hash IS NOT NULL),0) registered,coalesce(sum(password_hash IS NULL),0) guests FROM users`)
		if err != nil {
			return nil, err
		}
		scope := "WHERE " + kind + " AND (?='' OR instr(lower(u.username),?)>0 OR u.id=?)"
		search := []any{q, q, q}
		args := append(slices.Clone(search), limit, page*limit)
		var total M
		var rows []M
		if sort == "solves7d" {
			// Only the accounts that solved this week, ranked through the solves index: the
			// per-account counts are computed for the page alone.
			recent := "SELECT s.user_id FROM solves s JOIN users u ON u.id=s.user_id " + scope + " AND s.created_at>=" + adminDataWeekAgo + " GROUP BY s.user_id"
			if total, err = dbOne(db, "SELECT count(*) n FROM ("+recent+")", search...); err != nil {
				return nil, err
			}
			join := "JOIN (" + recent + " ORDER BY count(*) " + direction + ",max(s.created_at) DESC LIMIT ? OFFSET ?) r ON r.user_id=u.id"
			rows, err = adminDataUserRows(db, join, order, args...)
		} else {
			if total, err = dbOne(db, "SELECT count(*) n FROM users u "+scope, search...); err != nil {
				return nil, err
			}
			rows, err = adminDataUserRows(db, scope, order+" LIMIT ? OFFSET ?", args...)
		}
		if err != nil {
			return nil, err
		}
		return M{"counts": counts, "total": total["n"], "rows": rows, "page": page, "limit": limit}, nil
	})
}

func adminDataUser(state *AppState, id string) (any, error) {
	state.traffic.log.settle()
	return dbCall(state.db, func(db *Conn) (any, error) {
		users, err := adminDataUserRows(db, "WHERE u.id=?", "u.id", id)
		if err != nil {
			return nil, err
		}
		if len(users) == 0 {
			return nil, apiErr(404, adminDataUnknown)
		}
		user := users[0]
		effective := statsEffectiveMsSQL
		puzzles, err := dbAll(db, fmt.Sprintf(`SELECT puzzle_id puzzleId,solve_mode solveMode,count(*) solves,sum(penalty='dnf') dnf,sum(case_id IS NOT NULL) trainingSolves,
                min(%[1]s) bestMs,avg(%[1]s) meanMs,%[2]s lastAt FROM solves WHERE user_id=? GROUP BY puzzle_id,solve_mode ORDER BY solves DESC,puzzle_id`,
			effective, adminDataMs("max(created_at)")), id)
		if err != nil {
			return nil, err
		}
		days := activityLastDays(90)
		series := make([]any, len(days))
		index := map[string]int{}
		for i, d := range days {
			series[i] = M{"day": d, "requests": 0, "active": false, "solves": 0}
			index[d] = i
		}
		activity, err := dbAll(db, "SELECT day,requests FROM user_activity WHERE user_id=? AND day>=?", id, days[0])
		if err != nil {
			return nil, err
		}
		for _, row := range activity {
			if day, ok := asStr(row["day"]); ok {
				if i, ok := index[day]; ok {
					series[i].(M)["requests"] = row["requests"]
					series[i].(M)["active"] = true
				}
			}
		}
		solves, err := dbAll(db, "SELECT substr(created_at,1,10) day,count(*) solves FROM solves WHERE user_id=? AND created_at>=? GROUP BY 1", id, days[0])
		if err != nil {
			return nil, err
		}
		for _, row := range solves {
			if day, ok := asStr(row["day"]); ok {
				if i, ok := index[day]; ok {
					series[i].(M)["solves"] = row["solves"]
				}
			}
		}
		recentSolves, err := dbAll(db, fmt.Sprintf(`SELECT id,%s at,time_ms timeMs,penalty,%s effectiveMs,puzzle_id puzzleId,solve_mode solveMode,scramble_type scrambleType,case_id caseId
                FROM solves WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 20`, adminDataMs("created_at"), effective), id)
		if err != nil {
			return nil, err
		}
		requests, err := dbAll(db, fmt.Sprintf("SELECT %s FROM request_log l LEFT JOIN users u ON u.id=l.user_id WHERE l.user_id=? ORDER BY l.id DESC LIMIT 20", activityRowColumns), id)
		if err != nil {
			return nil, err
		}
		recentRequests := make([]any, len(requests))
		for i, row := range requests {
			recentRequests[i] = activityRowValue(row)
		}
		// Tokens themselves are never shown; a hash of their digest identifies each session.
		sessions, err := dbAll(db, "SELECT token_hash,coalesce(created_at,expires_at-2592000000) createdAt,last_used_at lastUsedAt,expires_at expiresAt FROM auth_tokens WHERE user_id=? AND expires_at>? ORDER BY createdAt DESC", id, accountsNow())
		if err != nil {
			return nil, err
		}
		for _, s := range sessions {
			s["id"] = accountsDigest(str(s["token_hash"]))[:12]
			delete(s, "token_hash")
		}
		duelSummary, err := dbOne(db, `SELECT count(*) played,coalesce(sum((player1_id=?1 AND winner=0) OR (player2_id=?1 AND winner=1)),0) won,
                coalesce(sum((player1_id=?1 AND winner=1) OR (player2_id=?1 AND winner=0)),0) lost,coalesce(sum(winner IS NULL),0) drawn
                FROM duel_games WHERE player1_id=?1 OR player2_id=?1`, id)
		if err != nil {
			return nil, err
		}
		recentDuels, err := dbAll(db, `SELECT id,ended_at endedAt,event,
                CASE WHEN player1_id=?1 THEN player2_name ELSE player1_name END opponent,
                CASE WHEN player1_id=?1 THEN player2_id ELSE player1_id END opponentId,
                CASE WHEN player1_id=?1 THEN player1_ao5 ELSE player2_ao5 END ao5,
                CASE WHEN player1_id=?1 THEN player2_ao5 ELSE player1_ao5 END opponentAo5,
                CASE WHEN winner IS NULL THEN 'draw' WHEN (winner=0)=(player1_id=?1) THEN 'win' ELSE 'loss' END result
                FROM duel_games WHERE player1_id=?1 OR player2_id=?1 ORDER BY ended_at DESC,id DESC LIMIT 10`, id)
		if err != nil {
			return nil, err
		}
		ips, err := dbAll(db, "SELECT ip,count(*) days,max(day) lastDay FROM traffic_daily_users WHERE user_id=? GROUP BY ip ORDER BY lastDay DESC,days DESC LIMIT 20", id)
		if err != nil {
			return nil, err
		}
		practice, err := dbOne(db, "SELECT count(*) n FROM sessions WHERE user_id=?", id)
		if err != nil {
			return nil, err
		}
		user["practiceSessions"] = practice["n"]
		// Whether the account coaches (see coaching.go): listed, or turned off by the administration.
		coach, err := dbOne(db, "SELECT active FROM coaches WHERE user_id=?", id)
		if err != nil {
			return nil, err
		}
		user["coach"] = nil
		if coach != nil {
			user["coach"] = "disabled"
			if eqInt(coach["active"], 1) {
				user["coach"] = "active"
			}
		}
		return M{
			"user":           user,
			"puzzles":        puzzles,
			"activity":       series,
			"recentSolves":   recentSolves,
			"recentRequests": recentRequests,
			"sessions":       sessions,
			"duels":          M{"played": duelSummary["played"], "won": duelSummary["won"], "lost": duelSummary["lost"], "drawn": duelSummary["drawn"], "recent": recentDuels},
			"ips":            ips,
		}, nil
	})
}

// adminDataRevoke signs the account out everywhere; its open live sockets close on their next check.
func adminDataRevoke(state *AppState, id string) (any, error) {
	revoked, err := dbCall(state.db, func(db *Conn) (int64, error) {
		if _, err := dbRequired(db, "SELECT id FROM users WHERE id=?", adminDataUnknown, id); err != nil {
			return 0, err
		}
		return db.Exec("DELETE FROM auth_tokens WHERE user_id=?", id)
	})
	if err != nil {
		return nil, err
	}
	state.hub.notifySync(id, 0)
	return M{"ok": true, "revoked": revoked}, nil
}

// adminDataDelete deletes the account and everything it owns in one transaction (see `adminDataPurge`).
func adminDataDelete(state *AppState, id string) (any, error) {
	// Requests already answered are stored first, so none re-adds the account's id afterwards.
	state.traffic.log.flush()
	var avatar any
	deleted, err := dbCall(state.db, func(db *Conn) (M, error) {
		tx, err := db.Begin()
		if err != nil {
			return nil, err
		}
		defer tx.Rollback()
		account, err := dbRequired(db, "SELECT username,avatar FROM users WHERE id=?", adminDataUnknown, id)
		if err != nil {
			return nil, err
		}
		solves, sessions, err := adminDataPurge(db, id)
		if err != nil {
			return nil, err
		}
		if err := tx.Commit(); err != nil {
			return nil, err
		}
		// Pictures and videos of its coaching conversations went with it.
		if err := coachingSweepMedia(db); err != nil {
			return nil, err
		}
		avatar = account["avatar"]
		return M{"ok": true, "username": account["username"], "solves": solves, "sessions": sessions}, nil
	})
	if err != nil {
		return nil, err
	}
	if file, ok := asStr(avatar); ok {
		coachingForgetAvatar(file)
	}
	state.hub.notifySync(id, 0)
	return deleted, nil
}
