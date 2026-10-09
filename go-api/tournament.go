package main

// Tournaments and battles: two players race on the same scrambles, a solve at a time. The faster one takes the solve
// (a DNF loses to any time; a tie, or two DNFs, gives nothing); `points` solves take a set, `sets` sets the match.
//
// A tournament is a single-elimination bracket. Players register until it starts, at its date (or when its organiser
// starts it); they are then drawn at random, byes going to the first drawn when they are not a power of two. A round
// opens once every match of the one before is over: everyone waits for everyone. A tournament without a group is open
// to every account and run by the administration; a group's is run by its owner and admins, for its members. A battle
// is a single match launched in a conversation: in a group, against one member or whoever accepts it; between two
// friends, against the other. Battles and a group's tournaments show in their conversation as cards.
//
// The HTTP routes live under /api/tournaments and /api/matches (`tournamentRoute`, on the database thread). Matches
// are played on the app's socket (live.go, channel "match", `onMatch`): the players' solves, their timers' phases, and
// whoever watches. Everything is kept in the database as it happens, so a match survives a restart; who is connected
// is not.

import (
	"fmt"
	"math"
	"math/bits"
	"math/rand/v2"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const tournamentUnknownTournament = "Unknown tournament"
const tournamentUnknownMatch = "Unknown match"

// tournamentEffective: a player's time on a solve with its penalty: nil for a DNF (the rule of `statsEffectiveMs`).
func tournamentEffective(ms int64, penalty string) *int64 {
	t := statsEffectiveMs(float64(ms), penalty)
	if t == nil {
		return nil
	}
	v := int64(*t)
	return &v
}

// TournamentTime is one player's time on a solve: `done` false while not solved yet, `ms` nil for a DNF.
type TournamentTime struct {
	done bool
	ms   *int64
}

// TournamentScore: where a match stands after its solves.
type TournamentScore struct {
	sets [2]int64
	// Solves won in the set under way.
	points [2]int64
	// The seat that won the match; -1 for none yet.
	winner int
	// Who took each solve counted (-1 for a tie).
	solves []int
}

// tournamentScore: the score of solves given in order, each as both players' times. Counting stops at the first
// solve still open, and once the match is won.
func tournamentScore(points, sets int64, solves [][2]TournamentTime) TournamentScore {
	score := TournamentScore{winner: -1, solves: []int{}}
	for _, solve := range solves {
		a, b := solve[0], solve[1]
		if !a.done || !b.done {
			break
		}
		if score.winner >= 0 {
			break
		}
		taken := -1
		switch {
		case a.ms != nil && b.ms != nil && *a.ms < *b.ms:
			taken = 0
		case a.ms != nil && b.ms != nil && *b.ms < *a.ms:
			taken = 1
		case a.ms != nil && b.ms == nil:
			taken = 0
		case a.ms == nil && b.ms != nil:
			taken = 1
		}
		score.solves = append(score.solves, taken)
		if taken >= 0 {
			score.points[taken]++
			if score.points[taken] >= points {
				score.sets[taken]++
				score.points = [2]int64{}
				if score.sets[taken] >= sets {
					score.winner = taken
				}
			}
		}
	}
	return score
}

// tournamentBracket: the single-elimination bracket of `players` (in draw order): the pairs of the first round, each
// slot's two seats, byes ("") going to the first drawn. Its size is the power of two at or above the count.
func tournamentBracket(players []string) (int64, [][2]string) {
	size := 1
	for size < max(len(players), 2) {
		size <<= 1
	}
	seeded := make([]string, size)
	copy(seeded, players)
	pairs := make([][2]string, size/2)
	for k := range pairs {
		pairs[k] = [2]string{seeded[k], seeded[size-1-k]}
	}
	return int64(bits.TrailingZeros(uint(size))), pairs
}

// tournamentOutcome: what a match of two seats becomes: played (`ready`) with both, won by the one there (a bye), or
// `empty`.
func tournamentOutcome(a, b string, empty string) (string, string) {
	switch {
	case a != "" && b != "":
		return "ready", ""
	case a != "":
		return "done", a
	case b != "":
		return "done", b
	}
	return empty, ""
}

// tournamentPlaying: whether a match is to be played or under way.
func tournamentPlaying(row M) bool {
	return eqStr(row["status"], "ready") || eqStr(row["status"], "live")
}

// Matches.

const tournamentMatchSQL = `SELECT m.*,a.username a_name,a.avatar a_avatar,b.username b_name,b.avatar b_avatar,t.name tournament_name,
  g.name group_name,c.username creator_name,(SELECT conversation_id FROM social_messages x WHERE x.match_id=m.id LIMIT 1) conversation_id
 FROM matches m
 LEFT JOIN users a ON a.id=m.player_a LEFT JOIN users b ON b.id=m.player_b LEFT JOIN users c ON c.id=m.created_by
 LEFT JOIN tournaments t ON t.id=m.tournament_id LEFT JOIN social_groups g ON g.id=m.group_id`

func tournamentMatchRow(db *Conn, id int64) (M, error) {
	return dbRequired(db, tournamentMatchSQL+" WHERE m.id=?", tournamentUnknownMatch, id)
}

// tournamentSeatOf: the account's seat in the match, -1 for none.
func tournamentSeatOf(row M, uid string) int {
	if eqStr(row["player_a"], uid) {
		return 0
	}
	if eqStr(row["player_b"], uid) {
		return 1
	}
	return -1
}

func tournamentPlayersOf(row M) []string {
	out := []string{}
	for _, v := range []any{row["player_a"], row["player_b"]} {
		if s, ok := asStr(v); ok {
			out = append(out, s)
		}
	}
	return out
}

func tournamentSolves(db *Conn, id int64) ([]M, error) {
	return dbAll(db, "SELECT * FROM match_solves WHERE match_id=? ORDER BY number", id)
}

func tournamentTimes(rows []M) [][2]TournamentTime {
	out := make([][2]TournamentTime, len(rows))
	for i, r := range rows {
		side := func(ms, penalty string) TournamentTime {
			v, ok := asInt(r[ms])
			if !ok {
				return TournamentTime{}
			}
			p, ok := asStr(r[penalty])
			if !ok {
				p = "none"
			}
			return TournamentTime{done: true, ms: tournamentEffective(v, p)}
		}
		out[i] = [2]TournamentTime{side("a_ms", "a_penalty"), side("b_ms", "b_penalty")}
	}
	return out
}

func tournamentMatchScore(row M, rows []M) TournamentScore {
	points, ok := asInt(row["points"])
	if !ok {
		points = 1
	}
	sets, ok := asInt(row["sets"])
	if !ok {
		sets = 1
	}
	return tournamentScore(points, sets, tournamentTimes(rows))
}

// tournamentMatchDto: a match as the apps show it; `full` adds every solve with its scramble.
func tournamentMatchDto(db *Conn, row M, full bool) (M, error) {
	id, _ := asInt(row["id"])
	rows, err := tournamentSolves(db, id)
	if err != nil {
		return nil, err
	}
	return tournamentMatchValue(row, rows, full), nil
}

// tournamentMatchList: matches with their solves, all loaded at once: `sql` selects them (from `tournamentMatchSQL`).
func tournamentMatchList(db *Conn, sql string, args ...any) ([]any, error) {
	matches, err := dbAll(db, tournamentMatchSQL+" "+sql, args...)
	if err != nil {
		return nil, err
	}
	ids := []string{}
	for _, m := range matches {
		if id, ok := asInt(m["id"]); ok {
			ids = append(ids, strconv.FormatInt(id, 10))
		}
	}
	rows, err := dbAll(db, fmt.Sprintf("SELECT * FROM match_solves WHERE match_id IN (%s) ORDER BY match_id,number", strings.Join(ids, ",")))
	if err != nil {
		return nil, err
	}
	byMatch := map[int64][]M{}
	for _, row := range rows {
		id, _ := asInt(row["match_id"])
		byMatch[id] = append(byMatch[id], row)
	}
	out := make([]any, len(matches))
	for i, m := range matches {
		id, _ := asInt(m["id"])
		out[i] = tournamentMatchValue(m, byMatch[id], false)
	}
	return out, nil
}

func tournamentMatchValue(row M, rows []M, full bool) M {
	id, _ := asInt(row["id"])
	s := tournamentMatchScore(row, rows)
	player := func(id, name, avatar any) any {
		if id == nil {
			return nil
		}
		return socialPerson(id, name, avatar)
	}
	won := [2]int{}
	for _, w := range s.solves {
		if w >= 0 {
			won[w]++
		}
	}
	value := M{
		"id":           id,
		"tournamentId": row["tournament_id"],
		"tournament":   row["tournament_name"],
		"groupId":      row["group_id"],
		"group":        row["group_name"],
		// The conversation whose card shows the battle.
		"conversationId": row["conversation_id"],
		"round":          row["round"],
		"slot":           row["slot"],
		"event":          row["event"],
		"points":         row["points"],
		"sets":           row["sets"],
		"status":         row["status"],
		"winner":         row["winner"],
		"forfeit":        eqInt(row["forfeit"], 1),
		"players":        []any{player(row["player_a"], row["a_name"], row["a_avatar"]), player(row["player_b"], row["b_name"], row["b_avatar"])},
		// Sets won, solves won in the set under way, and solves won in all.
		"score":      M{"sets": s.sets, "points": s.points, "solves": won},
		"solved":     len(rows),
		"createdBy":  row["created_by"],
		"creator":    row["creator_name"],
		"createdAt":  row["created_at"],
		"startedAt":  row["started_at"],
		"finishedAt": row["finished_at"],
	}
	if full {
		list := make([]any, len(rows))
		for i, r := range rows {
			side := func(ms, penalty string) any {
				if r[ms] == nil {
					return nil
				}
				return M{"ms": r[ms], "penalty": r[penalty]}
			}
			var winner any
			if i < len(s.solves) && s.solves[i] >= 0 {
				winner = s.solves[i]
			}
			list[i] = M{"number": r["number"], "scramble": r["scramble"], "results": []any{side("a_ms", "a_penalty"), side("b_ms", "b_penalty")}, "winner": winner}
		}
		value["solves"] = list
	}
	return value
}

// tournamentVisible: whether the account may see the match: a group's for its members, a battle between two friends
// for them, an open tournament's for everyone signed in.
func tournamentVisible(db *Conn, row M, uid string) error {
	if group, ok := asInt(row["group_id"]); ok {
		if _, err := socialMember(db, group, uid, false); err != nil {
			return apiErr(404, tournamentUnknownMatch)
		}
	} else if row["tournament_id"] == nil && tournamentSeatOf(row, uid) < 0 {
		return apiErr(404, tournamentUnknownMatch)
	}
	return nil
}

// sortedUnique is `sort` then `dedup`.
func sortedUnique(list []string) []string {
	sort.Strings(list)
	out := list[:0]
	for i, s := range list {
		if i == 0 || s != list[i-1] {
			out = append(out, s)
		}
	}
	return out
}

// tournamentAnnounce tells the players of a match, and the members of its group (whose conversation shows it), where
// it now stands.
func tournamentAnnounce(db *Conn, state *AppState, row M, status string) error {
	players := tournamentPlayersOf(row)
	users := append([]string{}, players...)
	if group, ok := asInt(row["group_id"]); ok {
		members, err := socialMembers(db, group)
		if err != nil {
			return err
		}
		users = sortedUnique(append(users, members...))
	}
	socialNotify(state, users, "match", M{"match": row["id"], "status": status, "players": players, "tournament": row["tournament_name"], "round": row["round"], "group": row["group_name"], "groupId": row["group_id"]})
	return nil
}

// tournamentMatchCard: a battle as its card in a conversation shows it.
func tournamentMatchCard(db *Conn, id int64) (M, error) {
	row, err := tournamentMatchRow(db, id)
	if err != nil {
		return nil, err
	}
	return tournamentMatchDto(db, row, false)
}

// tournamentTournamentCard: a tournament as its card in a conversation shows it, for the account `uid` when known
// ("" otherwise).
func tournamentTournamentCard(db *Conn, id int64, uid string) (M, error) {
	t, err := tournamentRow(db, id)
	if err != nil {
		return nil, err
	}
	return tournamentDto(db, t, uid)
}

// tournamentFinish closes a match: its winner (a seat), whether it was given rather than raced; a tournament's goes on.
func tournamentFinish(db *Conn, state *AppState, row M, winner int, forfeit bool) error {
	id, _ := asInt(row["id"])
	user := row["player_a"]
	if winner != 0 {
		user = row["player_b"]
	}
	if _, err := db.Exec("UPDATE matches SET status='done',winner=?,forfeit=?,finished_at=? WHERE id=? AND status IN ('ready','live')",
		optStr(str(user)), forfeit, accountsNow(), id); err != nil {
		return err
	}
	if err := tournamentAnnounce(db, state, row, "done"); err != nil {
		return err
	}
	if tournament, ok := asInt(row["tournament_id"]); ok {
		if err := tournamentAdvance(db, state, tournament); err != nil {
			return err
		}
		t, err := tournamentRow(db, tournament)
		if err != nil {
			return err
		}
		return tournamentChanged(db, state, t)
	} else if group, ok := asInt(row["group_id"]); ok {
		return socialChanged(db, state, group, false)
	}
	return nil
}

// tournamentPublish sends the match as it stands to whoever has it open.
func tournamentPublish(db *Conn, state *AppState, id int64) error {
	row, err := tournamentMatchRow(db, id)
	if err != nil {
		return err
	}
	value, err := tournamentMatchDto(db, row, true)
	if err != nil {
		return err
	}
	state.matches.publish(id, value)
	return nil
}

// tournamentSettle recounts a match after a change of its solves, and closes it once someone won.
func tournamentSettle(db *Conn, state *AppState, id int64) error {
	row, err := tournamentMatchRow(db, id)
	if err != nil {
		return err
	}
	rows, err := tournamentSolves(db, id)
	if err != nil {
		return err
	}
	if winner := tournamentMatchScore(row, rows).winner; winner >= 0 && tournamentPlaying(row) {
		if err := tournamentFinish(db, state, row, winner, false); err != nil {
			return err
		}
	}
	return tournamentPublish(db, state, id)
}

// tournamentPlay: what a player does in a match, from its socket; wrong or late moves are ignored.
func tournamentPlay(db *Conn, state *AppState, id int64, seat int, body any) error {
	row, err := tournamentMatchRow(db, id)
	if err != nil {
		return err
	}
	if !tournamentPlaying(row) {
		return nil
	}
	rows, err := tournamentSolves(db, id)
	if err != nil {
		return err
	}
	var last M
	if len(rows) > 0 {
		last = rows[len(rows)-1]
	}
	number, ok := asInt(idx(body, "number"))
	if !ok {
		number = 0
	}
	side := "a"
	if seat != 0 {
		side = "b"
	}
	open := func(r M) bool { return r["a_ms"] == nil || r["b_ms"] == nil }
	lastIs := func() bool {
		n, ok := asInt(last["number"])
		return last != nil && ok && n == number
	}
	switch str(idx(body, "type")) {
	// The scramble of the next solve, from the first player's app (or the second's when the first is away).
	case "scramble":
		text, ok := asStr(idx(body, "text"))
		text = strings.TrimSpace(text)
		if !ok || len(text) < 1 || len(text) > 2000 {
			return nil
		}
		if number != int64(len(rows))+1 || (last != nil && open(last)) || tournamentMatchScore(row, rows).winner >= 0 {
			return nil
		}
		if _, err := db.Exec("INSERT OR IGNORE INTO match_solves(match_id,number,scramble) VALUES(?,?,?)", id, number, text); err != nil {
			return err
		}
		if eqStr(row["status"], "ready") {
			if _, err := db.Exec("UPDATE matches SET status='live',started_at=? WHERE id=?", accountsNow(), id); err != nil {
				return err
			}
			if err := tournamentAnnounce(db, state, row, "live"); err != nil {
				return err
			}
		}
		return tournamentPublish(db, state, id)
	case "solve":
		ms, ok := asFloat(idx(body, "ms"))
		if !ok || math.IsInf(ms, 0) || math.IsNaN(ms) || ms <= 0 || ms >= 3_600_000 || last == nil {
			return nil
		}
		if !lastIs() || last[side+"_ms"] != nil {
			return nil
		}
		if _, err := db.Exec(fmt.Sprintf("UPDATE match_solves SET %s_ms=?,%s_penalty='none' WHERE match_id=? AND number=?", side, side),
			int64(math.Round(ms)), id, number); err != nil {
			return err
		}
		return tournamentSettle(db, state, id)
	// A penalty on the player's own latest solve, while the match is on.
	case "penalty":
		penalty, ok := asStr(idx(body, "penalty"))
		if !ok || !isOneOf(penalty, duelPenalties[:]) {
			return nil
		}
		if !lastIs() || last[side+"_ms"] == nil {
			return nil
		}
		if _, err := db.Exec(fmt.Sprintf("UPDATE match_solves SET %s_penalty=? WHERE match_id=? AND number=?", side), penalty, id, last["number"]); err != nil {
			return err
		}
		return tournamentSettle(db, state, id)
	// A solve taken back to redo it on the same scramble, until the other player solved it too.
	case "cancel":
		if !lastIs() || !open(last) {
			return nil
		}
		if _, err := db.Exec(fmt.Sprintf("UPDATE match_solves SET %s_ms=NULL,%s_penalty=NULL WHERE match_id=? AND number=?", side, side), id, last["number"]); err != nil {
			return err
		}
		return tournamentPublish(db, state, id)
	case "forfeit":
		if err := tournamentFinish(db, state, row, 1-seat, true); err != nil {
			return err
		}
		return tournamentPublish(db, state, id)
	}
	return nil
}

// Tournaments.

// tournamentSQL: tournaments with their group, winner and count of players; `extra` adds columns.
func tournamentSQL(extra string) string {
	return `SELECT t.*,g.name group_name,w.username winner_name,w.avatar winner_avatar,
          (SELECT count(*) FROM tournament_players p WHERE p.tournament_id=t.id) players` + extra + `
         FROM tournaments t LEFT JOIN social_groups g ON g.id=t.group_id LEFT JOIN users w ON w.id=t.winner_id`
}

func tournamentRow(db *Conn, id int64) (M, error) {
	return dbRequired(db, tournamentSQL("")+" WHERE t.id=?", tournamentUnknownTournament, id)
}

// tournamentDto: a tournament, for the account `uid` ("" for none).
func tournamentDto(db *Conn, t M, uid string) (M, error) {
	id, _ := asInt(t["id"])
	var winner any
	if t["winner_id"] != nil {
		winner = socialPerson(t["winner_id"], t["winner_name"], t["winner_avatar"])
	}
	value := M{
		"id":          id,
		"name":        t["name"],
		"description": t["description"],
		"event":       t["event"],
		"groupId":     t["group_id"],
		"group":       t["group_name"],
		"startsAt":    t["starts_at"],
		"points":      t["points"],
		"sets":        t["sets"],
		"maxPlayers":  t["max_players"],
		"status":      t["status"],
		"round":       t["round"],
		"rounds":      t["rounds"],
		"players":     t["players"],
		"winner":      winner,
		"createdAt":   t["created_at"],
		"startedAt":   t["started_at"],
		"finishedAt":  t["finished_at"],
	}
	if _, ok := t["registered"]; ok {
		// Read along with the list (`tournamentList`).
		value["registered"] = eqInt(t["registered"], 1)
		value["myMatch"] = t["my_match"]
	} else if uid != "" {
		registered, err := dbOne(db, "SELECT 1 FROM tournament_players WHERE tournament_id=? AND user_id=?", id, uid)
		if err != nil {
			return nil, err
		}
		value["registered"] = registered != nil
		// The player's match to play now, if any.
		mine, err := dbOne(db, "SELECT id FROM matches WHERE tournament_id=?1 AND status IN ('ready','live') AND (player_a=?2 OR player_b=?2)", id, uid)
		if err != nil {
			return nil, err
		}
		value["myMatch"] = idx(mine, "id")
	}
	return value, nil
}

// tournamentList: the tournaments of a group, or every account's (group 0): the coming and running ones first, by
// date, then the past.
func tournamentList(db *Conn, group int64, uid string) (any, error) {
	// Whether the account is registered, and its match to play, read with each tournament.
	mine := `,EXISTS(SELECT 1 FROM tournament_players p WHERE p.tournament_id=t.id AND p.user_id=?2) registered,
      (SELECT id FROM matches m WHERE m.tournament_id=t.id AND m.status IN ('ready','live') AND (m.player_a=?2 OR m.player_b=?2)) my_match`
	// Every account's tournaments come with those of the account's groups.
	scope := "(t.group_id IS NULL OR t.group_id IN (SELECT group_id FROM group_members WHERE user_id=?2 AND role!='invited'))"
	if group != 0 {
		scope = "t.group_id IS ?1"
	}
	rows, err := dbAll(db, tournamentSQL(mine)+" WHERE "+scope+` ORDER BY CASE WHEN t.status IN ('open','running') THEN 0 ELSE 1 END,
          CASE WHEN t.status IN ('open','running') THEN t.starts_at ELSE -t.starts_at END LIMIT 100`, optID(group), uid)
	if err != nil {
		return nil, err
	}
	out := make([]any, len(rows))
	for i, t := range rows {
		if out[i], err = tournamentDto(db, t, uid); err != nil {
			return nil, err
		}
	}
	return out, nil
}

// tournamentOrganises: whether the account runs this tournament: the owner or an admin of its group.
func tournamentOrganises(db *Conn, t M, uid string) bool {
	group, ok := asInt(t["group_id"])
	if !ok {
		return false
	}
	_, err := socialMember(db, group, uid, true)
	return err == nil
}

// tournamentDetail: a tournament with its entrants and matches, for the account `uid` ("" for the administration).
func tournamentDetail(db *Conn, id int64, uid string) (any, error) {
	t, err := tournamentRow(db, id)
	if err != nil {
		return nil, err
	}
	if group, ok := asInt(t["group_id"]); ok && uid != "" {
		if _, err := socialMember(db, group, uid, false); err != nil {
			return nil, apiErr(404, tournamentUnknownTournament)
		}
	}
	value, err := tournamentDto(db, t, uid)
	if err != nil {
		return nil, err
	}
	players, err := dbAll(db, `SELECT p.seed,p.registered_at,p.withdrawn,u.id,u.username,u.avatar FROM tournament_players p JOIN users u ON u.id=p.user_id
         WHERE p.tournament_id=? ORDER BY p.seed IS NULL,p.seed,p.registered_at`, id)
	if err != nil {
		return nil, err
	}
	entrants := make([]any, len(players))
	for i, p := range players {
		v := socialPerson(p["id"], p["username"], p["avatar"])
		v["seed"] = p["seed"]
		v["registeredAt"] = p["registered_at"]
		v["withdrawn"] = eqInt(p["withdrawn"], 1)
		entrants[i] = v
	}
	value["entrants"] = entrants
	if value["matches"], err = tournamentMatchList(db, "WHERE m.tournament_id=? ORDER BY m.round,m.slot", id); err != nil {
		return nil, err
	}
	value["canManage"] = uid != "" && tournamentOrganises(db, t, uid)
	return value, nil
}

// The most players a tournament takes, and the limit of one made without saying.
const tournamentMaxPlayers int64 = 100

func tournamentNumber(body any, key string, min, max int64) (int64, error) {
	n, ok := asInt(idx(body, key))
	if !ok || n < min || n > max {
		return 0, validation()
	}
	return n, nil
}

// tournamentFormat: the format shared by tournaments and battles: the event, solves to take a set, sets to take the
// match.
func tournamentFormat(body any) (string, int64, int64, error) {
	event, err := apiString(body, "event", 1, 16)
	if err != nil {
		return "", 0, 0, err
	}
	if !practiceIsEvent(event) {
		return "", 0, 0, validation()
	}
	points, err := tournamentNumber(body, "points", 1, 15)
	if err != nil {
		return "", 0, 0, err
	}
	sets, err := tournamentNumber(body, "sets", 1, 9)
	if err != nil {
		return "", 0, 0, err
	}
	return event, points, sets, nil
}

// tournamentCreate: a new tournament: the administration's (group 0, by "") or a group's, by one of its organisers.
func tournamentCreate(db *Conn, state *AppState, body any, group int64, by string) (any, error) {
	name, err := socialTrimmed(body, "name", 2, 60)
	if err != nil {
		return nil, err
	}
	description, err := socialOptional(body, "description", 500)
	if err != nil {
		return nil, err
	}
	event, points, sets, err := tournamentFormat(body)
	if err != nil {
		return nil, err
	}
	starts, err := tournamentNumber(body, "startsAt", accountsNow()-60_000, accountsNow()+365*accountsDayMs)
	if err != nil {
		return nil, err
	}
	limit := tournamentMaxPlayers
	if v, ok := get(body, "maxPlayers"); ok && v != nil {
		if limit, err = tournamentNumber(body, "maxPlayers", 2, tournamentMaxPlayers); err != nil {
			return nil, err
		}
	}
	if _, err := db.Exec("INSERT INTO tournaments(name,description,event,group_id,created_by,starts_at,points,sets,max_players,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
		name, description, event, optID(group), optStr(by), starts, points, sets, limit, accountsNow()); err != nil {
		return nil, err
	}
	id := db.LastInsertRowid()
	if group != 0 {
		members, err := socialMembers(db, group)
		if err != nil {
			return nil, err
		}
		socialNotify(state, members, "tournament", M{"tournament": id, "group": group, "created": true})
		// Its card in the group's conversation, from its organiser.
		if by != "" {
			author, err := dbRequired(db, "SELECT id,username,avatar FROM users WHERE id=?", tournamentUnknownTournament, by)
			if err != nil {
				return nil, err
			}
			conversation, err := socialGroupConversation(db, group)
			if err != nil {
				return nil, err
			}
			if _, err := socialPost(db, state, conversation, author, "", SocialCard{tournamentID: id}); err != nil {
				return nil, err
			}
		}
	}
	return tournamentDetail(db, id, by)
}

func tournamentRegister(db *Conn, state *AppState, id int64, uid string, join bool) (any, error) {
	t, err := tournamentRow(db, id)
	if err != nil {
		return nil, err
	}
	if group, ok := asInt(t["group_id"]); ok {
		if _, err := socialMember(db, group, uid, false); err != nil {
			return nil, apiErr(404, tournamentUnknownTournament)
		}
	}
	if !eqStr(t["status"], "open") {
		return nil, apiErr(409, "Registration is closed: the tournament has started.")
	}
	if join {
		if limit, ok := asInt(t["max_players"]); ok {
			players, _ := asInt(t["players"])
			if players >= limit {
				return nil, apiErr(409, "The tournament is full.")
			}
		}
		if _, err := db.Exec("INSERT OR IGNORE INTO tournament_players(tournament_id,user_id,registered_at) VALUES(?,?,?)", id, uid, accountsNow()); err != nil {
			return nil, err
		}
	} else if _, err := db.Exec("DELETE FROM tournament_players WHERE tournament_id=? AND user_id=?", id, uid); err != nil {
		return nil, err
	}
	if err := tournamentChanged(db, state, t); err != nil {
		return nil, err
	}
	return tournamentDetail(db, id, uid)
}

func tournamentEntrants(db *Conn, id int64) ([]string, error) {
	return socialUserIds(db, "SELECT user_id FROM tournament_players WHERE tournament_id=?", id)
}

// tournamentChanged tells those who follow a tournament (its players, and its group) that it changed.
func tournamentChanged(db *Conn, state *AppState, t M) error {
	id, _ := asInt(t["id"])
	users, err := tournamentEntrants(db, id)
	if err != nil {
		return err
	}
	if group, ok := asInt(t["group_id"]); ok {
		members, err := socialMembers(db, group)
		if err != nil {
			return err
		}
		users = sortedUnique(append(users, members...))
	}
	socialNotify(state, users, "tournament", M{"tournament": id})
	return nil
}

// tournamentStart starts a tournament: draws its players into the bracket, or cancels it with fewer than two.
func tournamentStart(db *Conn, state *AppState, id int64) error {
	t, err := tournamentRow(db, id)
	if err != nil {
		return err
	}
	if !eqStr(t["status"], "open") {
		return apiErr(409, "This tournament has already started.")
	}
	players, err := tournamentEntrants(db, id)
	if err != nil {
		return err
	}
	if len(players) < 2 {
		if _, err := db.Exec("UPDATE tournaments SET status='cancelled',finished_at=? WHERE id=?", accountsNow(), id); err != nil {
			return err
		}
		return tournamentChanged(db, state, t)
	}
	rand.Shuffle(len(players), func(i, j int) { players[i], players[j] = players[j], players[i] })
	rounds, pairs := tournamentBracket(players)
	at := accountsNow()
	group := t["group_id"]
	if _, ok := asInt(group); !ok {
		group = nil
	}
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for seed, player := range players {
		if _, err := db.Exec("UPDATE tournament_players SET seed=? WHERE tournament_id=? AND user_id=?", seed+1, id, player); err != nil {
			return err
		}
	}
	for round := int64(1); round <= rounds; round++ {
		for slot := 0; slot < len(pairs)>>(round-1); slot++ {
			a, b := "", ""
			if round == 1 {
				a, b = pairs[slot][0], pairs[slot][1]
			}
			// A bye: the player goes through at once.
			status, winner := tournamentOutcome(a, b, "waiting")
			var finished any
			if status == "done" {
				finished = at
			}
			if _, err := db.Exec(`INSERT INTO matches(tournament_id,group_id,round,slot,event,points,sets,player_a,player_b,status,winner,created_at,finished_at)
                 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
				id, group, round, slot, optString(t["event"]), optInt(t["points"]), optInt(t["sets"]), optStr(a), optStr(b), status, optStr(winner), at, finished); err != nil {
				return err
			}
		}
	}
	if _, err := db.Exec("UPDATE tournaments SET status='running',round=1,rounds=?,started_at=? WHERE id=?", rounds, at, id); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	if err := tournamentReady(db, state, id, 1); err != nil {
		return err
	}
	if err := tournamentAdvance(db, state, id); err != nil {
		return err
	}
	return tournamentChanged(db, state, t)
}

// optString is `value.as_str()` as an SQL parameter.
func optString(v any) any {
	if s, ok := asStr(v); ok {
		return s
	}
	return nil
}

// optInt is `value.as_i64()` as an SQL parameter.
func optInt(v any) any {
	if n, ok := asInt(v); ok {
		return n
	}
	return nil
}

// tournamentReady tells the players of a round's matches that theirs can be played.
func tournamentReady(db *Conn, state *AppState, id, round int64) error {
	matches, err := dbAll(db, tournamentMatchSQL+" WHERE m.tournament_id=? AND m.round=? AND m.status='ready'", id, round)
	if err != nil {
		return err
	}
	for _, m := range matches {
		if err := tournamentAnnounce(db, state, m, "ready"); err != nil {
			return err
		}
	}
	return nil
}

// tournamentAdvance opens the next round once every match of the current one is over, and closes the tournament
// after its final. Its callers tell those who follow the tournament (`tournamentChanged`), once.
func tournamentAdvance(db *Conn, state *AppState, id int64) error {
	for {
		t, err := tournamentRow(db, id)
		if err != nil {
			return err
		}
		if !eqStr(t["status"], "running") {
			return nil
		}
		round, ok := asInt(t["round"])
		if !ok {
			round = 1
		}
		rounds, ok := asInt(t["rounds"])
		if !ok {
			rounds = 1
		}
		matches, err := dbAll(db, "SELECT * FROM matches WHERE tournament_id=? AND round=? ORDER BY slot", id, round)
		if err != nil {
			return err
		}
		for _, m := range matches {
			if !eqStr(m["status"], "done") && !eqStr(m["status"], "cancelled") {
				return nil
			}
		}
		if round >= rounds {
			var winner any
			if len(matches) > 0 {
				winner = optString(matches[0]["winner"])
			}
			_, err := db.Exec("UPDATE tournaments SET status='finished',winner_id=?,finished_at=? WHERE id=?", winner, accountsNow(), id)
			return err
		}
		withdrawn, err := socialUserIds(db, "SELECT user_id FROM tournament_players WHERE tournament_id=? AND withdrawn=1", id)
		if err != nil {
			return err
		}
		gone := func(p string) bool {
			for _, u := range withdrawn {
				if p != "" && u == p {
					return true
				}
			}
			return false
		}
		for i := 0; i < len(matches); i += 2 {
			slot, _ := asInt(matches[i]["slot"])
			slot /= 2
			a := str(matches[i]["winner"])
			b := ""
			if i+1 < len(matches) {
				b = str(matches[i+1]["winner"])
			}
			// A player who gave up stays in the bracket, the match given to the other.
			var status, winner string
			forfeit := false
			switch goneA, goneB := gone(a), gone(b); {
			case goneA && !goneB && b != "":
				status, winner, forfeit = "done", b, true
			case !goneA && goneB && a != "":
				status, winner, forfeit = "done", a, true
			case goneA || goneB:
				status = "cancelled"
			default:
				status, winner = tournamentOutcome(a, b, "cancelled")
			}
			var finished any
			if status != "ready" {
				finished = accountsNow()
			}
			if _, err := db.Exec("UPDATE matches SET player_a=?,player_b=?,status=?,winner=?,forfeit=?,finished_at=? WHERE tournament_id=? AND round=? AND slot=?",
				optStr(a), optStr(b), status, optStr(winner), forfeit, finished, id, round+1, slot); err != nil {
				return err
			}
		}
		if _, err := db.Exec("UPDATE tournaments SET round=? WHERE id=?", round+1, id); err != nil {
			return err
		}
		if err := tournamentReady(db, state, id, round+1); err != nil {
			return err
		}
	}
}

// tournamentWithdraw: a player gives up: before the start, their registration goes; once under way, their match under
// way goes to their opponent and every later one too.
func tournamentWithdraw(db *Conn, state *AppState, id int64, uid string) (any, error) {
	t, err := tournamentRow(db, id)
	if err != nil {
		return nil, err
	}
	registered, err := dbOne(db, "SELECT 1 FROM tournament_players WHERE tournament_id=? AND user_id=?", id, uid)
	if err != nil {
		return nil, err
	}
	if registered == nil {
		return nil, apiErr(404, tournamentUnknownTournament)
	}
	switch str(t["status"]) {
	case "open":
		return tournamentRegister(db, state, id, uid, false)
	case "running":
	default:
		return nil, apiErr(409, "This tournament is over.")
	}
	if _, err := db.Exec("UPDATE tournament_players SET withdrawn=1 WHERE tournament_id=? AND user_id=?", id, uid); err != nil {
		return nil, err
	}
	playing, err := dbOne(db, "SELECT id FROM matches WHERE tournament_id=?1 AND status IN ('ready','live') AND (player_a=?2 OR player_b=?2)", id, uid)
	if err != nil {
		return nil, err
	}
	if m, ok := asInt(idx(playing, "id")); ok {
		row, err := tournamentMatchRow(db, m)
		if err != nil {
			return nil, err
		}
		if err := tournamentFinish(db, state, row, 1-max(tournamentSeatOf(row, uid), 0), true); err != nil {
			return nil, err
		}
		if err := tournamentPublish(db, state, m); err != nil {
			return nil, err
		}
	} else if err := tournamentChanged(db, state, t); err != nil {
		return nil, err
	}
	return tournamentDetail(db, id, uid)
}

// tournamentCurrent: what the account is in the middle of, which the app keeps it in until it is over or given up: a
// battle ready or under way, else a tournament under way it is still in.
func tournamentCurrent(db *Conn, uid string) (any, error) {
	battle, err := dbOne(db, "SELECT id FROM matches WHERE tournament_id IS NULL AND status IN ('ready','live') AND (player_a=?1 OR player_b=?1) ORDER BY id DESC LIMIT 1", uid)
	if err != nil {
		return nil, err
	}
	tournament, err := dbOne(db, `SELECT t.id FROM tournaments t JOIN tournament_players p ON p.tournament_id=t.id AND p.user_id=?1
         WHERE t.status='running' AND p.withdrawn=0 AND NOT EXISTS (SELECT 1 FROM matches m WHERE m.tournament_id=t.id
           AND m.status IN ('done','cancelled') AND (m.player_a=?1 OR m.player_b=?1) AND (m.winner IS NULL OR m.winner!=?1))
         ORDER BY t.started_at LIMIT 1`, uid)
	if err != nil {
		return nil, err
	}
	return M{"match": idx(battle, "id"), "tournament": idx(tournament, "id")}, nil
}

// tournamentCancel cancels a tournament that has not finished: its matches stop where they are.
func tournamentCancel(db *Conn, state *AppState, id int64) error {
	t, err := tournamentRow(db, id)
	if err != nil {
		return err
	}
	if !eqStr(t["status"], "open") && !eqStr(t["status"], "running") {
		return apiErr(409, "This tournament is over.")
	}
	if _, err := db.Exec("UPDATE tournaments SET status='cancelled',finished_at=? WHERE id=?", accountsNow(), id); err != nil {
		return err
	}
	if _, err := db.Exec("UPDATE matches SET status='cancelled' WHERE tournament_id=? AND status NOT IN ('done','cancelled')", id); err != nil {
		return err
	}
	return tournamentChanged(db, state, t)
}

// tournamentAward gives a match to one of its players (a no-show, a player gone): `winner` is their account.
func tournamentAward(db *Conn, state *AppState, id int64, winner string) (any, error) {
	row, err := tournamentMatchRow(db, id)
	if err != nil {
		return nil, err
	}
	seat := tournamentSeatOf(row, winner)
	if seat < 0 {
		return nil, validation()
	}
	if !tournamentPlaying(row) {
		return nil, apiErr(409, "This match cannot be decided now.")
	}
	if err := tournamentFinish(db, state, row, seat, true); err != nil {
		return nil, err
	}
	if err := tournamentPublish(db, state, id); err != nil {
		return nil, err
	}
	if row, err = tournamentMatchRow(db, id); err != nil {
		return nil, err
	}
	return tournamentMatchDto(db, row, true)
}

// tournamentDue starts every tournament whose date has come.
func tournamentDue(db *Conn, state *AppState) error {
	rows, err := dbAll(db, "SELECT id FROM tournaments WHERE status='open' AND starts_at<=?", accountsNow())
	if err != nil {
		return err
	}
	for _, r := range rows {
		if id, ok := asInt(r["id"]); ok {
			if err := tournamentStart(db, state, id); err != nil {
				return err
			}
		}
	}
	return nil
}

// tournamentAdminList: the administration's view: every tournament open to all, the latest first, with its entrants.
func tournamentAdminList(db *Conn) (any, error) {
	rows, err := dbAll(db, tournamentSQL("")+" WHERE t.group_id IS NULL ORDER BY t.starts_at DESC LIMIT 200")
	if err != nil {
		return nil, err
	}
	out := make([]any, len(rows))
	for i, t := range rows {
		if out[i], err = tournamentDto(db, t, ""); err != nil {
			return nil, err
		}
	}
	return out, nil
}

func tournamentDelete(db *Conn, state *AppState, id int64) (any, error) {
	t, err := tournamentRow(db, id)
	if err != nil {
		return nil, err
	}
	users, err := tournamentEntrants(db, id)
	if err != nil {
		return nil, err
	}
	if _, err := db.Exec("DELETE FROM tournaments WHERE id=?", id); err != nil {
		return nil, err
	}
	socialNotify(state, users, "tournament", M{"tournament": id, "deleted": true})
	if group, ok := asInt(t["group_id"]); ok {
		if err := socialChanged(db, state, group, false); err != nil {
			return nil, err
		}
	}
	return M{"ok": true}, nil
}

// Battles.

// tournamentBattles: a group's latest battles, the ones under way first.
func tournamentBattles(db *Conn, group int64) (any, error) {
	return tournamentMatchList(db, "WHERE m.group_id=? AND m.tournament_id IS NULL ORDER BY CASE WHEN m.status IN ('waiting','ready','live') THEN 0 ELSE 1 END,m.created_at DESC LIMIT 30", group)
}

// tournamentBattle: a new battle, waiting for its opponent; its card goes to the conversation it was launched from.
func tournamentBattle(db *Conn, state *AppState, user M, body any) (any, error) {
	uid := str(user["id"])
	// Where it is launched: a conversation, a group's or two friends', or a group by its id.
	var conversation M
	if _, ok := get(body, "conversationId"); ok {
		id, err := tournamentNumber(body, "conversationId", 1, math.MaxInt64)
		if err != nil {
			return nil, err
		}
		if conversation, err = socialConversation(db, id, uid); err != nil {
			return nil, err
		}
	} else {
		group, err := tournamentNumber(body, "groupId", 1, math.MaxInt64)
		if err != nil {
			return nil, err
		}
		if _, err := socialMember(db, group, uid, false); err != nil {
			return nil, err
		}
		if conversation, err = socialGroupConversation(db, group); err != nil {
			return nil, err
		}
	}
	group, isGroup := asInt(conversation["group_id"])
	event, points, sets, err := tournamentFormat(body)
	if err != nil {
		return nil, err
	}
	opponent := ""
	if isGroup {
		if v, ok := get(body, "opponentId"); ok && v != nil {
			other, err := apiString(body, "opponentId", 1, 64)
			if err != nil {
				return nil, err
			}
			if other == uid {
				return nil, apiErr(422, "Pick a member of the group.")
			}
			if _, err := socialMember(db, group, other, false); err != nil {
				return nil, apiErr(422, "Pick a member of the group.")
			}
			opponent = other
		}
	} else {
		// Between two friends, against the other.
		for _, v := range []any{conversation["user_a"], conversation["user_b"]} {
			if u, ok := asStr(v); ok && u != uid {
				opponent = u
				break
			}
		}
		if err := socialRequireFriend(db, uid, opponent); err != nil {
			return nil, err
		}
	}
	if _, err := db.Exec("INSERT INTO matches(group_id,event,points,sets,player_a,player_b,status,created_by,created_at) VALUES(?,?,?,?,?,?,'waiting',?,?)",
		optID(group), event, points, sets, uid, optStr(opponent), uid, accountsNow()); err != nil {
		return nil, err
	}
	id := db.LastInsertRowid()
	if _, err := socialPost(db, state, conversation, user, "", SocialCard{matchID: id}); err != nil {
		return nil, err
	}
	row, err := tournamentMatchRow(db, id)
	if err != nil {
		return nil, err
	}
	var challenged []string
	if opponent != "" {
		challenged = []string{opponent}
	} else if isGroup {
		challenged, _ = socialMembers(db, group)
	}
	others := []string{}
	for _, u := range challenged {
		if u != uid {
			others = append(others, u)
		}
	}
	socialNotify(state, others, "battle", M{"match": id, "group": optID(group), "groupName": row["group_name"], "conversation": conversation["id"], "from": row["creator_name"], "open": row["player_b"] == nil})
	if isGroup {
		if err := socialChanged(db, state, group, false); err != nil {
			return nil, err
		}
	}
	return tournamentMatchDto(db, row, false)
}

func tournamentRoute(db *Conn, state *AppState, method string, parts []string, body any, user M) (any, error) {
	if user["password_hash"] == nil {
		return nil, apiErr(403, "Sign in to play tournaments.")
	}
	uid := str(user["id"])
	id := func(s string) (int64, error) {
		n, err := strconv.ParseInt(s, 10, 64)
		if err != nil {
			return 0, validation()
		}
		return n, nil
	}
	is := func(m string, pattern ...string) bool { return method == m && matchParts(parts, pattern...) }
	switch {
	case is("GET", "tournaments"):
		return tournamentList(db, 0, uid)
	// A group's tournament, by one of its organisers.
	case is("POST", "tournaments"):
		group, err := tournamentNumber(body, "groupId", 1, math.MaxInt64)
		if err != nil {
			return nil, err
		}
		if _, err := socialMember(db, group, uid, true); err != nil {
			return nil, err
		}
		return tournamentCreate(db, state, body, group, uid)
	case is("GET", "tournaments", "*"):
		t, err := id(parts[1])
		if err != nil {
			return nil, err
		}
		return tournamentDetail(db, t, uid)
	case is("POST", "tournaments", "*", "register"), is("DELETE", "tournaments", "*", "register"):
		t, err := id(parts[1])
		if err != nil {
			return nil, err
		}
		return tournamentRegister(db, state, t, uid, method == "POST")
	case is("POST", "tournaments", "*", "withdraw"):
		t, err := id(parts[1])
		if err != nil {
			return nil, err
		}
		return tournamentWithdraw(db, state, t, uid)
	case is("GET", "competition"):
		return tournamentCurrent(db, uid)
	case is("POST", "tournaments", "*", "start"), is("POST", "tournaments", "*", "cancel"):
		t, err := id(parts[1])
		if err != nil {
			return nil, err
		}
		row, err := tournamentRow(db, t)
		if err != nil {
			return nil, err
		}
		if !tournamentOrganises(db, row, uid) {
			return nil, apiErr(403, "Only the group's owner and admins run its tournaments.")
		}
		if parts[2] == "start" {
			err = tournamentStart(db, state, t)
		} else {
			err = tournamentCancel(db, state, t)
		}
		if err != nil {
			return nil, err
		}
		return tournamentDetail(db, t, uid)
	case is("POST", "matches"):
		return tournamentBattle(db, state, user, body)
	case is("GET", "matches", "*"):
		m, err := id(parts[1])
		if err != nil {
			return nil, err
		}
		row, err := tournamentMatchRow(db, m)
		if err != nil {
			return nil, err
		}
		if err := tournamentVisible(db, row, uid); err != nil {
			return nil, err
		}
		return tournamentMatchDto(db, row, true)
	// A battle taken up: by the member challenged, or by anyone in the group when it is open to all.
	case is("POST", "matches", "*", "accept"):
		m, err := id(parts[1])
		if err != nil {
			return nil, err
		}
		row, err := tournamentMatchRow(db, m)
		if err != nil {
			return nil, err
		}
		if err := tournamentVisible(db, row, uid); err != nil {
			return nil, err
		}
		if row["tournament_id"] != nil || !eqStr(row["status"], "waiting") || eqStr(row["player_a"], uid) || !(row["player_b"] == nil || eqStr(row["player_b"], uid)) {
			return nil, apiErr(409, "This battle cannot be accepted.")
		}
		if _, err := db.Exec("UPDATE matches SET player_b=?,status='ready' WHERE id=?", uid, optInt(row["id"])); err != nil {
			return nil, err
		}
		if row, err = tournamentMatchRow(db, m); err != nil {
			return nil, err
		}
		if err := tournamentAnnounce(db, state, row, "ready"); err != nil {
			return nil, err
		}
		if group, ok := asInt(row["group_id"]); ok {
			if err := socialChanged(db, state, group, false); err != nil {
				return nil, err
			}
		}
		return tournamentMatchDto(db, row, false)
	// A battle withdrawn by its challenger, or declined by the member challenged, before it starts.
	case is("DELETE", "matches", "*"):
		m, err := id(parts[1])
		if err != nil {
			return nil, err
		}
		row, err := tournamentMatchRow(db, m)
		if err != nil {
			return nil, err
		}
		if row["tournament_id"] != nil || tournamentSeatOf(row, uid) < 0 || !(eqStr(row["status"], "waiting") || eqStr(row["status"], "ready")) {
			return nil, apiErr(409, "This battle cannot be called off.")
		}
		if _, err := db.Exec("UPDATE matches SET status='cancelled',finished_at=? WHERE id=?", accountsNow(), optInt(row["id"])); err != nil {
			return nil, err
		}
		if err := tournamentAnnounce(db, state, row, "cancelled"); err != nil {
			return nil, err
		}
		if group, ok := asInt(row["group_id"]); ok {
			if err := socialChanged(db, state, group, false); err != nil {
				return nil, err
			}
		}
		return M{"ok": true}, nil
	// A group's organisers give a match of its tournament to a player (a no-show).
	case is("POST", "matches", "*", "award"):
		m, err := id(parts[1])
		if err != nil {
			return nil, err
		}
		row, err := tournamentMatchRow(db, m)
		if err != nil {
			return nil, err
		}
		organises := false
		if tid, ok := asInt(row["tournament_id"]); ok {
			t, err := tournamentRow(db, tid)
			if err != nil {
				return nil, err
			}
			organises = tournamentOrganises(db, t, uid)
		}
		if !organises {
			return nil, apiErr(403, "Only the group's owner and admins decide its matches.")
		}
		winner, err := apiString(body, "winner", 1, 64)
		if err != nil {
			return nil, err
		}
		matchID, _ := asInt(row["id"])
		return tournamentAward(db, state, matchID, winner)
	}
	return nil, apiErr(404, "Unknown tournament route")
}

// tournamentRun starts the tournaments whose date has come, every few seconds.
func tournamentRun(state *AppState) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		if err := state.db.Call(func(db *Conn) error { return tournamentDue(db, state) }); err != nil {
			fmt.Fprintf(os.Stderr, "Tournaments: %s\n", toApiError(err).Message)
		}
		<-ticker.C
	}
}

// The matches open on the apps (live.go).

type tournamentViewer struct {
	id string
	// The player's seat, -1 for someone watching.
	seat int
	tx   *wsOutbox
}

type tournamentRoom struct {
	viewers []*tournamentViewer
	// The match as last sent, to send again when someone comes or goes.
	last M
}

// TournamentLive: who has each match open.
type TournamentLive struct {
	mu    sync.Mutex
	rooms map[int64]*tournamentRoom
}

func newTournamentLive() *TournamentLive {
	return &TournamentLive{rooms: map[int64]*tournamentRoom{}}
}

// copyMap is a shallow copy: the room keeps its own `present`.
func copyMap(value M) M {
	out := make(M, len(value)+1)
	for k, v := range value {
		out[k] = v
	}
	return out
}

func (room *tournamentRoom) send(value M) {
	value = copyMap(value)
	present := [2]bool{}
	for seat := range present {
		for _, v := range room.viewers {
			if v.seat == seat {
				present[seat] = true
			}
		}
	}
	value["present"] = present
	// Serialised once: one state goes to every viewer of a match as the same text.
	message := liveText("match", M{"type": "state", "match": value})
	room.last = value
	for _, viewer := range room.viewers {
		viewer.tx.send(message)
	}
}

// publish: the match changed: everyone who has it open hears.
func (l *TournamentLive) publish(id int64, value M) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if room, ok := l.rooms[id]; ok {
		room.send(value)
	}
}

func (l *TournamentLive) join(id int64, viewer *tournamentViewer, value M) {
	l.mu.Lock()
	defer l.mu.Unlock()
	room, ok := l.rooms[id]
	if !ok {
		room = &tournamentRoom{}
		l.rooms[id] = room
	}
	// The same app opening the match again (in another tab) hears its state again, in the same seat.
	known := false
	for _, v := range room.viewers {
		known = known || v.id == viewer.id
	}
	if !known {
		room.viewers = append(room.viewers, viewer)
	}
	room.send(value)
}

func (l *TournamentLive) leave(id int64, viewer string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	room, ok := l.rooms[id]
	if !ok {
		return
	}
	seat := -1
	kept := room.viewers[:0]
	for _, v := range room.viewers {
		if v.id == viewer {
			if seat < 0 {
				seat = v.seat
			}
			continue
		}
		kept = append(kept, v)
	}
	room.viewers = kept
	if len(room.viewers) == 0 {
		delete(l.rooms, id)
	} else if room.last != nil {
		room.send(room.last)
		if seat >= 0 {
			message := liveText("match", M{"type": "timer", "match": id, "seat": seat, "phase": "idle"})
			for _, v := range room.viewers {
				v.tx.send(message)
			}
		}
	}
}

// relay: a player's timer phase, to everyone else watching.
func (l *TournamentLive) relay(id int64, from string, seat int, phase string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	room, ok := l.rooms[id]
	if !ok {
		return
	}
	message := liveText("match", M{"type": "timer", "match": id, "seat": seat, "phase": phase})
	for _, v := range room.viewers {
		if v.id != from {
			v.tx.send(message)
		}
	}
}

// onMatch: a match open on the app: joining it (or leaving it), then the player's timer and moves; whoever is not a
// player watches. Over the allowance, messages are dropped.
func (c *liveClient) onMatch(body any) {
	if !c.matchRate.take() {
		return
	}
	state := c.state
	id, ok := asInt(idx(body, "match"))
	if !ok {
		return
	}
	failed := func(err error) {
		c.tx.send(liveText("match", M{"type": "error", "match": id, "message": toApiError(err).Message}))
	}
	seat, joined := c.matches[id]
	switch kind := str(idx(body, "type")); {
	case kind == "join":
		var value M
		userSeat := -1
		auth := c.token
		err := state.db.Call(func(db *Conn) error {
			user, err := accountsSignedIn(db, auth)
			if err != nil {
				return err
			}
			uid := str(user["id"])
			row, err := tournamentMatchRow(db, id)
			if err != nil {
				return err
			}
			if err := tournamentVisible(db, row, uid); err != nil {
				return err
			}
			userSeat = tournamentSeatOf(row, uid)
			value, err = tournamentMatchDto(db, row, true)
			return err
		})
		if err != nil {
			failed(err)
			return
		}
		state.matches.join(id, &tournamentViewer{id: c.id, seat: userSeat, tx: c.tx}, value)
		c.matches[id] = userSeat
	case kind == "leave" && joined:
		state.matches.leave(id, c.id)
		delete(c.matches, id)
	case kind == "timer" && joined && seat >= 0:
		if phase, ok := asStr(idx(body, "phase")); ok && isOneOf(phase, duelPhases[:]) {
			state.matches.relay(id, c.id, seat, phase)
		}
	case joined && seat >= 0:
		if err := state.db.Call(func(db *Conn) error { return tournamentPlay(db, state, id, seat, body) }); err != nil {
			failed(err)
		}
	}
}
