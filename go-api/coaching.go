package main

// Coaching: players apply to coach (the administration approves them), coaches publish a profile and their weekly
// hours, players book one of the slots those hours offer, talk with their coach and meet them in a video call.
// Payment comes later: a booking is confirmed at once and keeps the price shown when it was made.
//
// The HTTP routes live under /api/coaching (`coachingRoute`, run on the database connection). The app's socket
// (live.go, channel "coaching") pushes chat messages and booking changes to every open app of an account, and relays
// the WebRTC signalling of a session's call between its coach and student; the media itself goes peer to peer.
//
// Pictures and videos sent in a conversation are posted raw to /api/coaching/conversations/{id}/media
// (`coachingUpload`) and kept as files beside the database; only the two parties of the conversation fetch them back
// (`coachingMedia`).

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"
)

const coachingMinute int64 = 60_000

// Slots are offered from an hour ahead, four weeks out.
const coachingNotice = 60 * coachingMinute
const coachingHorizonDays int64 = 28
const coachingCancellationPolicy = "24h-v1"
const coachingCancellationError = "Sessions cannot be cancelled in the final 24 hours before they start."

func coachingCancellationOpen(startsAt, at int64) bool {
	return saturatingSub(startsAt, at) > accountsDayMs
}

func saturatingSub(a, b int64) int64 {
	d := a - b
	if (b > 0 && d > a) || (b < 0 && d < a) {
		if b > 0 {
			return -1 << 63
		}
		return 1<<63 - 1
	}
	return d
}

// coachingLengths: the session lengths a coach may choose, in minutes.
var coachingLengths = []int64{30, 45, 60, 90, 120}

func coachingLength(v any) (int64, bool) {
	m, ok := asInt(v)
	if !ok {
		return 0, false
	}
	for _, l := range coachingLengths {
		if l == m {
			return m, true
		}
	}
	return 0, false
}

// The call opens a quarter of an hour before the session and stays open half an hour after it.
const coachingEarly = 15 * coachingMinute
const coachingLate = 30 * coachingMinute
const coachingUnknownCoach = "Unknown coach"
const coachingUnknownBooking = "Unknown session"
const coachingUnknownConversation = "Unknown conversation"
const coachingUnknownMedia = "Unknown picture or video"

// coachingMediaMax is the largest video a message carries; pictures stop at `coachingImageMax`.
const coachingMediaMax = 64 * 1024 * 1024
const coachingImageMax = 10 * 1024 * 1024

// coachingText: optional trimmed text of at most `max` characters, empty when absent.
func coachingText(body any, key string, max int) (string, error) {
	if v, ok := get(body, key); !ok || v == nil {
		return "", nil
	}
	s, err := apiString(body, key, 0, max)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(s), nil
}

// coachingWords: a list of short distinct words (events, languages).
func coachingWords(body any, key string, items, max int) ([]string, error) {
	value, ok := get(body, key)
	if !ok {
		return []string{}, nil
	}
	list, ok := asArray(value)
	if !ok || len(list) > items {
		return nil, validation()
	}
	out := []string{}
	for _, item := range list {
		s, ok := asStr(item)
		word := strings.TrimSpace(s)
		if n := utf8.RuneCountInString(word); !ok || n < 1 || n > max {
			return nil, validation()
		}
		seen := false
		for _, w := range out {
			if w == word {
				seen = true
				break
			}
		}
		if !seen {
			out = append(out, word)
		}
	}
	return out, nil
}

func coachingEvents(body any) ([]string, error) {
	list, err := coachingWords(body, "events", 24, 16)
	if err != nil {
		return nil, err
	}
	for _, e := range list {
		for i := 0; i < len(e); i++ {
			b := e[i]
			if !('0' <= b && b <= '9' || 'a' <= b && b <= 'z' || 'A' <= b && b <= 'Z' || b == '-' || b == '_') {
				return nil, validation()
			}
		}
	}
	return list, nil
}

// coachingParsed: a JSON list stored as text.
func coachingParsed(value any) any {
	if s, ok := asStr(value); ok {
		if v, err := decodeJSON([]byte(s)); err == nil {
			return v
		}
	}
	return []any{}
}

func coachingFlag(value any) bool {
	return eqInt(value, 1)
}

func coachingIceServers() any {
	if v, ok := os.LookupEnv("CUBIX_ICE_SERVERS"); ok {
		if value, err := decodeJSON([]byte(v)); err == nil {
			if _, ok := asArray(value); ok {
				return value
			}
		}
	}
	return []any{M{"urls": []any{"stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"}}}
}

// coachingSQL: a coach with their rating and how much they have coached.
const coachingSQL = `SELECT c.*,u.username,u.avatar,
 (SELECT avg(rating) FROM coach_reviews r WHERE r.coach_id=c.user_id) rating,
 (SELECT count(*) FROM coach_reviews r WHERE r.coach_id=c.user_id) reviews,
 (SELECT count(*) FROM coach_bookings b WHERE b.coach_id=c.user_id AND b.status='booked' AND b.ends_at<=?1) sessions,
 (SELECT count(DISTINCT student_id) FROM coach_bookings b WHERE b.coach_id=c.user_id AND b.status='booked') students
 FROM coaches c JOIN users u ON u.id=c.user_id`

// coachingDto: the public face of a coach; `own` adds what only the coach sees (their hours as they entered them).
func coachingDto(row M, own bool) M {
	value := M{
		"id": row["user_id"], "username": row["username"], "headline": row["headline"], "bio": row["bio"],
		"events": coachingParsed(row["events"]), "languages": coachingParsed(row["languages"]), "priceCents": row["price_cents"],
		"sessionMinutes": row["session_minutes"], "timezone": row["timezone"], "accepting": coachingFlag(row["accepting"]),
		"active": coachingFlag(row["active"]), "rating": row["rating"], "reviews": row["reviews"], "sessions": row["sessions"],
		"students": row["students"], "since": row["created_at"], "avatar": coachingAvatarURL(row["avatar"]),
		"newStudents": coachingFlag(row["new_students"]),
	}
	if own {
		value["windows"] = coachingParsed(row["windows"])
		value["daysOff"] = coachingParsed(row["days_off"])
		value["overrides"] = coachingParsed(row["overrides"])
	}
	return value
}

func coachingRow(db *Conn, id string) (M, error) {
	return dbOne(db, coachingSQL+" WHERE c.user_id=?2", accountsNow(), id)
}

// coachingOwn: the caller's own coach profile, while the administration keeps it active.
func coachingOwn(db *Conn, uid string) (M, error) {
	c, err := coachingRow(db, uid)
	if err != nil {
		return nil, err
	}
	if c == nil || !coachingFlag(c["active"]) {
		return nil, apiErr(403, "Only coaches can do this.")
	}
	return c, nil
}

// coachingActive: the coach `id` while the administration keeps them active, else a 404.
func coachingActive(db *Conn, id string) (M, error) {
	c, err := coachingRow(db, id)
	if err != nil {
		return nil, err
	}
	if c == nil || !coachingFlag(c["active"]) {
		return nil, apiErr(404, coachingUnknownCoach)
	}
	return c, nil
}

// coachingDay is jiff's civil::Date: a day of the proleptic Gregorian calendar, years -9999 to 9999.
type coachingDay struct{ y, m, d int }

func (d coachingDay) key() int { return d.y*10000 + d.m*100 + d.d }

func (d coachingDay) String() string {
	if d.y < 0 {
		return fmt.Sprintf("-%06d-%02d-%02d", -d.y, d.m, d.d)
	}
	return fmt.Sprintf("%04d-%02d-%02d", d.y, d.m, d.d)
}

func (d coachingDay) time() time.Time {
	return time.Date(d.y, time.Month(d.m), d.d, 0, 0, 0, 0, time.UTC)
}

// weekday is `weekday().to_monday_zero_offset()`.
func (d coachingDay) weekday() int8 { return int8((int(d.time().Weekday()) + 6) % 7) }

func (d coachingDay) tomorrow() (coachingDay, bool) {
	t := d.time().AddDate(0, 0, 1)
	if t.Year() > 9999 {
		return d, false
	}
	return coachingDay{t.Year(), int(t.Month()), t.Day()}, true
}

// coachingDate: a date as jiff parses one (`"2026-10-05".parse::<Date>()`), or false.
func coachingDate(value any) (coachingDay, bool) {
	s, ok := asStr(value)
	if !ok {
		return coachingDay{}, false
	}
	return coachingParseDate(s)
}

// coachingDigits reads exactly n ASCII digits.
func coachingDigits(s string, n int) (int, string, bool) {
	if len(s) < n {
		return 0, s, false
	}
	v := 0
	for i := 0; i < n; i++ {
		if s[i] < '0' || s[i] > '9' {
			return 0, s, false
		}
		v = v*10 + int(s[i]-'0')
	}
	return v, s[n:], true
}

// coachingFraction reads an optional `.123` or `,123` (one to nine digits).
func coachingFraction(s string) (string, bool) {
	if s == "" || (s[0] != '.' && s[0] != ',') {
		return s, true
	}
	s = s[1:]
	n := 0
	for n < len(s) && n < 9 && s[n] >= '0' && s[n] <= '9' {
		n++
	}
	return s[n:], n > 0
}

// coachingParseDate is jiff's Temporal date parser: a date, in extended (`2026-10-05`) or basic (`20261005`) form,
// with a signed six-digit year allowed, then optionally a time, an offset (not `Z`) and RFC 9557 annotations, which
// are checked and ignored.
func coachingParseDate(s string) (coachingDay, bool) {
	var year int
	var ok bool
	if s != "" && (s[0] == '+' || s[0] == '-') {
		negative := s[0] == '-'
		if year, s, ok = coachingDigits(s[1:], 6); !ok || year > 9999 || (year == 0 && negative) {
			return coachingDay{}, false
		}
		if negative {
			year = -year
		}
	} else if year, s, ok = coachingDigits(s, 4); !ok {
		return coachingDay{}, false
	}
	extended := strings.HasPrefix(s, "-")
	separator := func() bool {
		if extended {
			if !strings.HasPrefix(s, "-") {
				return false
			}
			s = s[1:]
			return true
		}
		return !strings.HasPrefix(s, "-")
	}
	if !separator() {
		return coachingDay{}, false
	}
	month, rest, ok := coachingDigits(s, 2)
	if s = rest; !ok || month < 1 || month > 12 || !separator() {
		return coachingDay{}, false
	}
	day, rest, ok := coachingDigits(s, 2)
	s = rest
	if !ok || day < 1 || day > 31 {
		return coachingDay{}, false
	}
	if t := time.Date(year, time.Month(month), day, 0, 0, 0, 0, time.UTC); t.Day() != day {
		return coachingDay{}, false
	}
	date := coachingDay{year, month, day}
	if s == "" {
		return date, true
	}
	if s[0] == ' ' || s[0] == 'T' || s[0] == 't' {
		if s, ok = coachingParseTime(s[1:]); !ok {
			return coachingDay{}, false
		}
		if s != "" && (s[0] == 'Z' || s[0] == 'z') {
			// A civil date read from a UTC instant is usually a bug: jiff refuses it.
			return coachingDay{}, false
		}
		if s != "" && (s[0] == '+' || s[0] == '-') {
			if s, ok = coachingParseOffset(s, true); !ok {
				return coachingDay{}, false
			}
		}
	}
	if s, ok = coachingParseAnnotations(s); !ok || s != "" {
		return coachingDay{}, false
	}
	return date, true
}

func coachingParseTime(s string) (string, bool) {
	hour, s, ok := coachingDigits(s, 2)
	if !ok || hour > 23 {
		return s, false
	}
	extended := strings.HasPrefix(s, ":")
	next := func() bool {
		if !extended {
			_, _, digits := coachingDigits(s, 2)
			return digits
		}
		if strings.HasPrefix(s, ":") {
			s = s[1:]
			return true
		}
		return false
	}
	if !next() {
		return s, true
	}
	minute, rest, ok := coachingDigits(s, 2)
	if s = rest; !ok || minute > 59 {
		return s, false
	}
	if !next() {
		return s, true
	}
	second, rest, ok := coachingDigits(s, 2)
	if s = rest; !ok || second > 60 {
		return s, false
	}
	return coachingFraction(s)
}

// coachingParseOffset reads `+HH[:MM[:SS[.fff]]]` (or without colons); `subminute` false stops at the minutes.
func coachingParseOffset(s string, subminute bool) (string, bool) {
	s = s[1:]
	hours, s, ok := coachingDigits(s, 2)
	if !ok || hours > 25 {
		return s, false
	}
	extended := strings.HasPrefix(s, ":")
	next := func() bool {
		if !extended {
			_, _, digits := coachingDigits(s, 2)
			return digits
		}
		if strings.HasPrefix(s, ":") {
			s = s[1:]
			return true
		}
		return false
	}
	if !next() {
		return s, true
	}
	minutes, rest, ok := coachingDigits(s, 2)
	if s = rest; !ok || minutes > 59 {
		return s, false
	}
	if !subminute {
		return s, !strings.HasPrefix(s, ":")
	}
	if !next() {
		return s, true
	}
	seconds, rest, ok := coachingDigits(s, 2)
	if s = rest; !ok || seconds > 59 {
		return s, false
	}
	return coachingFraction(s)
}

// coachingParseAnnotations reads `[Europe/Paris]`, `[+01:00]` then `[key=value]` annotations (none critical).
func coachingParseAnnotations(s string) (string, bool) {
	if !strings.HasPrefix(s, "[") {
		return s, true
	}
	isAlpha := func(b byte) bool { return 'A' <= b && b <= 'Z' || 'a' <= b && b <= 'z' }
	isDigit := func(b byte) bool { return '0' <= b && b <= '9' }
	span := func(s string, ok func(byte) bool) int {
		n := 0
		for n < len(s) && ok(s[n]) {
			n++
		}
		return n
	}
	// The time zone annotation, when the first one is not a key=value pair.
	unconsumed := s
	t := s[1:]
	t = strings.TrimPrefix(t, "!")
	if strings.HasPrefix(t, "+") || strings.HasPrefix(t, "-") {
		var ok bool
		if t, ok = coachingParseOffset(t, false); !ok || !strings.HasPrefix(t, "]") {
			return t, false
		}
		s = t[1:]
	} else {
		name := func() bool {
			if t == "" || !(t[0] == '_' || t[0] == '.' || isAlpha(t[0])) {
				return false
			}
			t = t[1+span(t[1:], func(b byte) bool {
				return b == '_' || b == '.' || b == '+' || b == '-' || isDigit(b) || isAlpha(b)
			}):]
			return true
		}
		if !name() {
			return t, false
		}
		if strings.HasPrefix(t, "=") {
			s = unconsumed
		} else {
			for strings.HasPrefix(t, "/") {
				t = t[1:]
				if !name() {
					return t, false
				}
			}
			if !strings.HasPrefix(t, "]") {
				return t, false
			}
			s = t[1:]
		}
	}
	for strings.HasPrefix(s, "[") {
		s = s[1:]
		critical := strings.HasPrefix(s, "!")
		s = strings.TrimPrefix(s, "!")
		if s == "" || !(s[0] == '_' || 'a' <= s[0] && s[0] <= 'z') {
			return s, false
		}
		s = s[1+span(s[1:], func(b byte) bool { return b == '_' || b == '-' || isDigit(b) || 'a' <= b && b <= 'z' }):]
		if !strings.HasPrefix(s, "=") {
			return s, false
		}
		s = s[1:]
		for {
			n := span(s, func(b byte) bool { return isDigit(b) || isAlpha(b) })
			if n == 0 {
				return s, false
			}
			s = s[n:]
			if !strings.HasPrefix(s, "-") {
				break
			}
			s = s[1:]
		}
		if !strings.HasPrefix(s, "]") || critical {
			return s, false
		}
		s = s[1:]
	}
	return s, true
}

var coachingZones sync.Map

// coachingTimeZone is jiff's TimeZone::get over its bundled database: names match whatever their ASCII case.
func coachingTimeZone(name string) (*time.Location, bool) {
	if strings.EqualFold(name, "utc") || strings.EqualFold(name, "etc/unknown") {
		return time.UTC, true
	}
	if loc, ok := coachingZones.Load(strings.ToLower(name)); ok {
		return loc.(*time.Location), true
	}
	i := sort.Search(len(coachingZoneNames()), func(i int) bool {
		return strings.ToLower(coachingZoneNames()[i]) >= strings.ToLower(name)
	})
	if i == len(coachingZoneNames()) || !strings.EqualFold(coachingZoneNames()[i], name) {
		return nil, false
	}
	loc, err := time.LoadLocation(coachingZoneNames()[i])
	if err != nil {
		return nil, false
	}
	coachingZones.Store(strings.ToLower(name), loc)
	return loc, true
}

// coachingZoneNames: jiff-tzdb's names, sorted ignoring ASCII case as it searches them.
var coachingZoneNames = sync.OnceValue(func() []string {
	names := strings.Fields(coachingZoneList)
	sort.Slice(names, func(i, j int) bool { return strings.ToLower(names[i]) < strings.ToLower(names[j]) })
	return names
})

// coachingInstant is `DateTime::to_zoned(tz)` (jiff's "compatible" disambiguation): the instant, in seconds, of a
// wall-clock time given as seconds since 1970-01-01T00:00 of that clock. In a fold (the clock goes back) the earlier
// instant; in a gap (the clock jumps forward) the offset from before the gap, which lands after it.
func coachingInstant(loc *time.Location, wall int64) int64 {
	// UTC offsets stay within ±26 hours: every zone period that may hold the wall time starts after this.
	const reach = 26 * 3600
	t := time.Unix(wall-reach, 0).In(loc)
	_, first := t.Zone()
	before := int64(first)
	for {
		start, end := t.ZoneBounds()
		_, o := t.Zone()
		offset := int64(o)
		at := wall - offset
		if (start.IsZero() || at >= start.Unix()) && (end.IsZero() || at < end.Unix()) {
			return at
		}
		if !end.IsZero() && at >= end.Unix() {
			before = offset
		}
		if end.IsZero() || end.Unix() > wall+reach {
			return wall - before
		}
		t = end.In(loc)
	}
}

// jiff's Timestamp range, in milliseconds.
const coachingMinMs int64 = -377705116800000
const coachingMaxMs int64 = 253402207199999

// coachingWindow: one weekly opening: a weekday (0 = Monday) and minutes of the day, repeated from `from` until
// `until` (the whole days, both included) or for good.
type coachingWindow struct {
	weekday     int8
	start, end  int64
	from, until *coachingDay
}

// coachingMinutesOfDay: `start` and `end` of an hour range: quarter hours of one day, the end after the start.
func coachingMinutesOfDay(value any) (int64, int64, bool) {
	start, ok1 := asInt(idx(value, "start"))
	end, ok2 := asInt(idx(value, "end"))
	if !ok1 || !ok2 {
		return 0, 0, false
	}
	return start, end, start%15 == 0 && end%15 == 0 && 0 <= start && start < end && end <= 1440
}

// coachingOptionalDate: a date given as YYYY-MM-DD, or nothing when the key is absent or null.
func coachingOptionalDate(value any, key string) (*coachingDay, error) {
	v := idx(value, key)
	if v == nil {
		return nil, nil
	}
	d, ok := coachingDate(v)
	if !ok {
		return nil, validation()
	}
	return &d, nil
}

func coachingWindows(coach M) []coachingWindow {
	list, _ := asArray(coachingParsed(coach["windows"]))
	out := []coachingWindow{}
	for _, w := range list {
		weekday, ok1 := asInt(idx(w, "weekday"))
		start, ok2 := asInt(idx(w, "start"))
		end, ok3 := asInt(idx(w, "end"))
		if !ok1 || !ok2 || !ok3 {
			continue
		}
		window := coachingWindow{weekday: int8(weekday), start: start, end: end}
		if d, ok := coachingDate(idx(w, "from")); ok {
			window.from = &d
		}
		if d, ok := coachingDate(idx(w, "until")); ok {
			window.until = &d
		}
		out = append(out, window)
	}
	return out
}

// coachingOverride: one day's exception to the weekly hours: extra hours (`open`) or hours taken back, in minutes of
// that day.
type coachingOverride struct {
	date       coachingDay
	start, end int64
	open       bool
}

func coachingOverrides(coach M) []coachingOverride {
	list, _ := asArray(coachingParsed(coach["overrides"]))
	out := []coachingOverride{}
	for _, o := range list {
		date, ok1 := coachingDate(idx(o, "date"))
		start, ok2 := asInt(idx(o, "start"))
		end, ok3 := asInt(idx(o, "end"))
		open, ok4 := asBool(idx(o, "open"))
		if ok1 && ok2 && ok3 && ok4 {
			out = append(out, coachingOverride{date, start, end, open})
		}
	}
	return out
}

// coachingHoursOn: the hours a coach is open on a day, in minutes of that day, sorted and apart: the weekly openings
// in force that day and its extra hours, less the hours taken back. None on a day off.
func coachingHoursOn(day coachingDay, openings []coachingWindow, changes []coachingOverride, off map[string]bool) [][2]int64 {
	if off[day.String()] {
		return nil
	}
	weekday := day.weekday()
	var open [][2]int64
	for _, w := range openings {
		if w.weekday == weekday && (w.from == nil || w.from.key() <= day.key()) && (w.until == nil || day.key() <= w.until.key()) {
			open = append(open, [2]int64{w.start, w.end})
		}
	}
	for _, o := range changes {
		if o.open && o.date == day {
			open = append(open, [2]int64{o.start, o.end})
		}
	}
	sort.Slice(open, func(i, j int) bool {
		if open[i][0] != open[j][0] {
			return open[i][0] < open[j][0]
		}
		return open[i][1] < open[j][1]
	})
	var merged [][2]int64
	for _, r := range open {
		if n := len(merged); n > 0 && r[0] <= merged[n-1][1] {
			merged[n-1][1] = max(merged[n-1][1], r[1])
		} else {
			merged = append(merged, r)
		}
	}
	for _, o := range changes {
		if o.open || o.date != day {
			continue
		}
		var kept [][2]int64
		for _, r := range merged {
			for _, part := range [][2]int64{{r[0], min(r[1], o.start)}, {max(r[0], o.end), r[1]}} {
				if part[0] < part[1] {
					kept = append(kept, part)
				}
			}
		}
		merged = kept
	}
	return merged
}

// coachingBusy: the coach's sessions still to come or under way, which no new booking may overlap.
func coachingBusy(db *Conn, coach string, from int64) ([][2]int64, error) {
	rows, err := dbAll(db, "SELECT starts_at,ends_at FROM coach_bookings WHERE coach_id=? AND status='booked' AND ends_at>?", coach, from)
	if err != nil {
		return nil, err
	}
	out := make([][2]int64, 0, len(rows))
	for _, r := range rows {
		s, _ := asInt(r["starts_at"])
		e, _ := asInt(r["ends_at"])
		out = append(out, [2]int64{s, e})
	}
	return out, nil
}

// coachingFreeSlots is coaching::free_slots (seed.rs uses it): the free slots of a coach from `from` for `days` days:
// each day's open hours (`coachingHoursOn`), cut into sessions, on the coach's own clock (so a change of daylight
// saving time keeps their hours), minus booked sessions and anything sooner than the notice. Sorted, as
// `[start, end)` in milliseconds.
func coachingFreeSlots(coach M, busy [][2]int64, from int64, days int64) [][2]int64 {
	name, ok := asStr(coach["timezone"])
	if !ok {
		name = "UTC"
	}
	loc, ok := coachingTimeZone(name)
	if !ok || from < coachingMinMs || from > coachingMaxMs {
		return [][2]int64{}
	}
	minutes, ok := coachingLength(coach["session_minutes"])
	if !ok {
		minutes = 60
	}
	openings := coachingWindows(coach)
	changes := coachingOverrides(coach)
	off := map[string]bool{}
	if list, ok := asArray(coachingParsed(coach["days_off"])); ok {
		for _, d := range list {
			if s, ok := asStr(d); ok {
				off[s] = true
			}
		}
	}
	earliest, latest := from+coachingNotice, from+days*accountsDayMs
	t := time.UnixMilli(from).In(loc)
	day := coachingDay{t.Year(), int(t.Month()), t.Day()}
	out := [][2]int64{}
	for i := int64(0); i <= days; i++ {
		for _, hours := range coachingHoursOn(day, openings, changes, off) {
			for m := hours[0]; m+minutes <= hours[1]; m += minutes {
				if m < 0 || m >= 1440 {
					continue
				}
				wall := day.time().Unix() + m*60
				s := coachingInstant(loc, wall) * 1000
				if s < coachingMinMs || s > coachingMaxMs {
					continue
				}
				e := s + minutes*coachingMinute
				taken := false
				for _, b := range busy {
					if b[0] < e && s < b[1] {
						taken = true
						break
					}
				}
				if s >= earliest && s < latest && !taken {
					out = append(out, [2]int64{s, e})
				}
			}
		}
		next, ok := day.tomorrow()
		if !ok {
			break
		}
		day = next
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i][0] != out[j][0] {
			return out[i][0] < out[j][0]
		}
		return out[i][1] < out[j][1]
	})
	deduped := out[:0]
	for i, s := range out {
		if i == 0 || s != out[i-1] {
			deduped = append(deduped, s)
		}
	}
	return deduped
}

func coachingSlotDto(slots [][2]int64) []any {
	out := make([]any, 0, len(slots))
	for _, s := range slots {
		out = append(out, M{"start": s[0], "end": s[1]})
	}
	return out
}

const coachingBookingSQL = `SELECT b.*,cu.username coach_name,su.username student_name,cu.avatar coach_avatar,su.avatar student_avatar,r.rating,r.comment review_comment,
 cv.id conversation_id FROM coach_bookings b JOIN users cu ON cu.id=b.coach_id JOIN users su ON su.id=b.student_id
 LEFT JOIN coach_reviews r ON r.booking_id=b.id
 LEFT JOIN coach_conversations cv ON cv.coach_id=b.coach_id AND cv.student_id=b.student_id`

// coachingParty: the other party of a session or a conversation row (with `coach_*` and `student_*` columns).
func coachingParty(row M, uid string) M {
	other := "coach"
	if eqStr(row["coach_id"], uid) {
		other = "student"
	}
	return M{"id": row[other+"_id"], "username": row[other+"_name"], "avatar": coachingAvatarURL(row[other+"_avatar"])}
}

// coachingBookingDto: a session as one of its two parties sees it.
func coachingBookingDto(row M, uid string) M {
	role := "student"
	if eqStr(row["coach_id"], uid) {
		role = "coach"
	}
	var review, proposal any
	if row["rating"] != nil {
		review = M{"rating": row["rating"], "comment": row["review_comment"]}
	}
	if row["proposed_start"] != nil {
		proposal = M{"start": row["proposed_start"], "end": row["proposed_end"]}
	}
	return M{
		"id": row["id"], "role": role,
		"coachId": row["coach_id"], "coachName": row["coach_name"],
		"studentId": row["student_id"], "studentName": row["student_name"],
		"with":     coachingParty(row, uid),
		"startsAt": row["starts_at"], "endsAt": row["ends_at"], "status": row["status"], "note": row["note"],
		"priceCents": row["price_cents"], "createdAt": row["created_at"], "cancelledAt": row["cancelled_at"],
		"cancelledByMe":  eqStr(row["cancelled_by"], uid),
		"review":         review,
		"conversationId": row["conversation_id"],
		"proposal":       proposal,
	}
}

func coachingBookingDtos(rows []M, uid string) []any {
	out := make([]any, 0, len(rows))
	for _, r := range rows {
		out = append(out, coachingBookingDto(r, uid))
	}
	return out
}

func coachingBookingRow(db *Conn, id, uid string) (M, error) {
	return dbRequired(db, coachingBookingSQL+" WHERE b.id=?1 AND (b.coach_id=?2 OR b.student_id=?2)", coachingUnknownBooking, id, uid)
}

const coachingConversationSQL = `SELECT cv.*,cu.username coach_name,su.username student_name,cu.avatar coach_avatar,su.avatar student_avatar,
 last.body last_body,last.created_at last_at,last.sender_id last_sender,last.media_type last_media,
 (SELECT count(*) FROM coach_messages m WHERE m.conversation_id=cv.id AND m.sender_id!=?1 AND m.read_at IS NULL) unread,
 EXISTS(SELECT 1 FROM coach_bookings b WHERE b.coach_id=cv.coach_id AND b.student_id=cv.student_id) booked
 FROM coach_conversations cv JOIN users cu ON cu.id=cv.coach_id JOIN users su ON su.id=cv.student_id
 LEFT JOIN coach_messages last ON last.id=(SELECT m.id FROM coach_messages m WHERE m.conversation_id=cv.id ORDER BY m.id DESC LIMIT 1)`

func coachingConversationDto(row M, uid string) M {
	coach := eqStr(row["coach_id"], uid)
	role := "student"
	if coach {
		role = "coach"
	}
	var lastMessage, note any
	if row["last_at"] != nil {
		lastMessage = M{"body": row["last_body"], "media": row["last_media"], "at": row["last_at"], "mine": eqStr(row["last_sender"], uid)}
	}
	// The coach's private notes on the student never reach the student.
	if coach {
		note = row["note"]
	}
	return M{
		"id": row["id"], "role": role,
		"coachId": row["coach_id"], "studentId": row["student_id"],
		"with":        coachingParty(row, uid),
		"lastMessage": lastMessage,
		"unread":      row["unread"], "updatedAt": row["updated_at"],
		// Messages open once the student booked the coach.
		"open": coachingFlag(row["booked"]),
		"note": note,
	}
}

func coachingConversationRow(db *Conn, id, uid string) (M, error) {
	n, err := strconv.ParseInt(id, 10, 64)
	if err != nil {
		return nil, validation()
	}
	return dbRequired(db, coachingConversationSQL+" WHERE cv.id=?2 AND (cv.coach_id=?1 OR cv.student_id=?1)", coachingUnknownConversation, uid, n)
}

// coachingConversationBetween: the conversation of a coach and a student, created on first need.
func coachingConversationBetween(db *Conn, coach, student string) (int64, error) {
	if _, err := db.Exec("INSERT OR IGNORE INTO coach_conversations(coach_id,student_id,updated_at) VALUES(?,?,?)", coach, student, accountsNow()); err != nil {
		return 0, err
	}
	row, err := dbRequired(db, "SELECT id FROM coach_conversations WHERE coach_id=? AND student_id=?", coachingUnknownConversation, coach, student)
	if err != nil {
		return 0, err
	}
	id, _ := asInt(row["id"])
	return id, nil
}

func coachingUnread(db *Conn, uid string) (int64, error) {
	row, err := dbOne(db, `SELECT count(*) n FROM coach_messages m JOIN coach_conversations cv ON cv.id=m.conversation_id
         WHERE (cv.coach_id=?1 OR cv.student_id=?1) AND m.sender_id!=?1 AND m.read_at IS NULL`, uid)
	if err != nil || row == nil {
		return 0, err
	}
	n, _ := asInt(row["n"])
	return n, nil
}

func coachingApplicationDto(row M) M {
	return M{
		"id": row["id"], "userId": row["user_id"], "username": row["username"], "email": row["email"],
		"events": coachingParsed(row["events"]), "experience": row["experience"], "message": row["message"],
		"status": row["status"], "createdAt": row["created_at"], "decidedAt": row["decided_at"],
	}
}

// coachingNotifyParties tells the apps of both parties of a session that their bookings changed.
func coachingNotifyParties(state *AppState, row M) {
	for _, key := range []string{"coach_id", "student_id"} {
		state.coaching.notify(str(row[key]), M{"type": "bookings"})
	}
}

// coachingRoute is coaching::route: /api/coaching/…, `parts` after "coaching".
func coachingRoute(db *Conn, state *AppState, method string, parts []string, query map[string]string, body any, user M) (any, error) {
	uid := str(user["id"])
	is := func(m string, pattern ...string) bool { return method == m && matchParts(parts, pattern...) }
	switch {
	case is("GET", "me"):
		application, err := dbOne(db, "SELECT a.*,u.username FROM coach_applications a JOIN users u ON u.id=a.user_id WHERE a.user_id=? ORDER BY a.id DESC LIMIT 1", uid)
		if err != nil {
			return nil, err
		}
		row, err := coachingRow(db, uid)
		if err != nil {
			return nil, err
		}
		var coach, app any
		if row != nil {
			coach = coachingDto(row, true)
		}
		if application != nil {
			app = coachingApplicationDto(application)
		}
		unread, err := coachingUnread(db, uid)
		if err != nil {
			return nil, err
		}
		return M{"coach": coach, "application": app, "unread": unread, "iceServers": coachingIceServers(), "lengths": coachingLengths}, nil

	case is("POST", "application"):
		row, err := coachingRow(db, uid)
		if err != nil {
			return nil, err
		}
		if row != nil && coachingFlag(row["active"]) {
			return nil, apiErr(409, "You are already a coach.")
		}
		pending, err := dbOne(db, "SELECT id FROM coach_applications WHERE user_id=? AND status='pending'", uid)
		if err != nil {
			return nil, err
		}
		if pending != nil {
			return nil, apiErr(409, "Your application is already being reviewed.")
		}
		email, err := apiString(body, "email", 3, 254)
		if err != nil {
			return nil, err
		}
		email = strings.TrimSpace(email)
		name, domain, found := strings.Cut(email, "@")
		valid := found && name != "" && strings.Contains(domain, ".") && !strings.HasPrefix(domain, ".") &&
			!strings.HasSuffix(domain, ".") && !strings.ContainsFunc(email, unicode.IsSpace)
		if !valid {
			return nil, apiErr(422, "Enter a valid e-mail address.")
		}
		experience, err := coachingText(body, "experience", 1000)
		if err != nil {
			return nil, err
		}
		message, err := coachingText(body, "message", 2000)
		if err != nil {
			return nil, err
		}
		if message == "" {
			return nil, apiErr(422, "Tell us a little about how you would coach.")
		}
		events, err := coachingEvents(body)
		if err != nil {
			return nil, err
		}
		if _, err := db.Exec("INSERT INTO coach_applications(user_id,email,events,experience,message,created_at) VALUES(?,?,?,?,?,?)",
			uid, email, encodeJSON(events), experience, message, accountsNow()); err != nil {
			return nil, err
		}
		created, err := dbRequired(db, "SELECT a.*,u.username FROM coach_applications a JOIN users u ON u.id=a.user_id WHERE a.id=last_insert_rowid()", "Unknown application")
		if err != nil {
			return nil, err
		}
		return coachingApplicationDto(created), nil

	case is("GET", "coaches"):
		at := accountsNow()
		rows, err := dbAll(db, coachingSQL+" WHERE c.active=1 ORDER BY rating IS NULL, rating DESC, sessions DESC, u.username LIMIT 200", at)
		if err != nil {
			return nil, err
		}
		list := []any{}
		for _, row := range rows {
			slots := [][2]int64{}
			if coachingFlag(row["accepting"]) {
				busy, err := coachingBusy(db, str(row["user_id"]), at)
				if err != nil {
					return nil, err
				}
				slots = coachingFreeSlots(row, busy, at, coachingHorizonDays)
			}
			value := coachingDto(row, false)
			value["nextSlot"] = nil
			if len(slots) > 0 {
				value["nextSlot"] = slots[0][0]
			}
			value["openSlots"] = len(slots)
			if value["practice"], err = coachingPractice(db, str(row["user_id"]), 1); err != nil {
				return nil, err
			}
			list = append(list, value)
		}
		return list, nil

	case is("GET", "coaches", "*"):
		id := parts[1]
		row, err := coachingRow(db, id)
		if err != nil {
			return nil, err
		}
		if row == nil || !(coachingFlag(row["active"]) || id == uid) {
			return nil, apiErr(404, coachingUnknownCoach)
		}
		reviews, err := dbAll(db, `SELECT r.rating,r.comment,r.created_at,u.username FROM coach_reviews r JOIN users u ON u.id=r.student_id
                 WHERE r.coach_id=? ORDER BY r.created_at DESC LIMIT 100`, id)
		if err != nil {
			return nil, err
		}
		counts := make([]int64, 5)
		ratings, err := dbAll(db, "SELECT rating,count(*) n FROM coach_reviews WHERE coach_id=? GROUP BY rating", id)
		if err != nil {
			return nil, err
		}
		for _, r := range ratings {
			if i, ok := asInt(r["rating"]); ok && 1 <= i && i <= 5 {
				counts[i-1], _ = asInt(r["n"])
			}
		}
		value := coachingDto(row, false)
		reviewList := make([]any, 0, len(reviews))
		for _, r := range reviews {
			reviewList = append(reviewList, M{"rating": r["rating"], "comment": r["comment"], "at": r["created_at"], "username": r["username"]})
		}
		value["reviewList"] = reviewList
		value["ratingCounts"] = counts
		if value["practice"], err = coachingPractice(db, id, 6); err != nil {
			return nil, err
		}
		if value["history"], err = coachingHistory(db, id); err != nil {
			return nil, err
		}
		return value, nil

	case is("GET", "coaches", "*", "slots"):
		id := parts[1]
		row, err := coachingActive(db, id)
		if err != nil {
			return nil, err
		}
		days := coachingHorizonDays
		if v, ok := query["days"]; ok {
			d, err := strconv.ParseInt(v, 10, 64)
			if err != nil || d < 1 || d > coachingHorizonDays {
				return nil, validation()
			}
			days = d
		}
		at := accountsNow()
		slots := [][2]int64{}
		if coachingFlag(row["accepting"]) {
			busy, err := coachingBusy(db, id, at)
			if err != nil {
				return nil, err
			}
			slots = coachingFreeSlots(row, busy, at, days)
		}
		// Someone new sees no slot while the coach keeps to the students they have.
		welcome := coachingFlag(row["new_students"])
		if !welcome {
			if welcome, err = coachingCoached(db, id, uid); err != nil {
				return nil, err
			}
		}
		if !welcome {
			slots = nil
		}
		return M{"timezone": row["timezone"], "sessionMinutes": row["session_minutes"], "priceCents": row["price_cents"],
			"accepting": coachingFlag(row["accepting"]), "welcome": welcome, "slots": coachingSlotDto(slots)}, nil

	case is("PUT", "profile"):
		if _, err := coachingOwn(db, uid); err != nil {
			return nil, err
		}
		price := int64(0)
		if v, ok := get(body, "priceCents"); ok {
			p, ok := asInt(v)
			if !ok {
				return nil, validation()
			}
			price = p
		}
		if price < 0 || price > 100_000 {
			return nil, validation()
		}
		accepting, err := coachingOptionalBool(body, "accepting")
		if err != nil {
			return nil, err
		}
		newcomers, err := coachingOptionalBool(body, "newStudents")
		if err != nil {
			return nil, err
		}
		headline, err := coachingText(body, "headline", 80)
		if err != nil {
			return nil, err
		}
		bio, err := coachingText(body, "bio", 2000)
		if err != nil {
			return nil, err
		}
		events, err := coachingEvents(body)
		if err != nil {
			return nil, err
		}
		languages, err := coachingWords(body, "languages", 10, 24)
		if err != nil {
			return nil, err
		}
		if _, err := db.Exec("UPDATE coaches SET headline=?,bio=?,events=?,languages=?,price_cents=?,accepting=?,new_students=? WHERE user_id=?",
			headline, bio, encodeJSON(events), encodeJSON(languages), price, boolInt(accepting), boolInt(newcomers), uid); err != nil {
			return nil, err
		}
		row, err := coachingOwn(db, uid)
		if err != nil {
			return nil, err
		}
		return coachingDto(row, true), nil

	case is("PUT", "availability"):
		return coachingSetAvailability(db, uid, body)

	case is("GET", "bookings"):
		rows, err := dbAll(db, coachingBookingSQL+" WHERE b.coach_id=?1 OR b.student_id=?1 ORDER BY b.starts_at DESC LIMIT 500", uid)
		if err != nil {
			return nil, err
		}
		return coachingBookingDtos(rows, uid), nil

	case is("POST", "bookings"):
		return coachingBook(db, state, uid, body)

	case is("POST", "bookings", "*", "cancel"):
		id := parts[1]
		row, err := coachingBookingRow(db, id, uid)
		if err != nil {
			return nil, err
		}
		if !eqStr(row["status"], "booked") {
			return nil, apiErr(409, "This session is already cancelled.")
		}
		at := accountsNow()
		if ends, _ := asInt(row["ends_at"]); ends <= at {
			return nil, apiErr(409, "This session is over.")
		}
		if starts, _ := asInt(row["starts_at"]); !coachingCancellationOpen(starts, at) {
			return nil, apiErr(409, coachingCancellationError)
		}
		if _, err := db.Exec("UPDATE coach_bookings SET status='cancelled',cancelled_at=?,cancelled_by=?,proposed_start=NULL,proposed_end=NULL WHERE id=?", at, uid, id); err != nil {
			return nil, err
		}
		coachingNotifyParties(state, row)
		return coachingBookingAgain(db, id, uid)

	case is("POST", "bookings", "*", "propose"):
		// The coach offers another time for a coming session (or takes the offer back with `start: null`).
		id := parts[1]
		row, err := coachingBookingRow(db, id, uid)
		if err != nil {
			return nil, err
		}
		if !eqStr(row["coach_id"], uid) {
			return nil, apiErr(403, "Only the coach offers another time.")
		}
		startsAt, _ := asInt(row["starts_at"])
		endsAt, _ := asInt(row["ends_at"])
		if !eqStr(row["status"], "booked") || endsAt <= accountsNow() {
			return nil, apiErr(409, "This session can no longer be moved.")
		}
		var proposedStart, proposedEnd any
		if v, ok := get(body, "start"); ok && v != nil {
			start, ok := asInt(v)
			if !ok {
				return nil, validation()
			}
			end := start + endsAt - startsAt
			if start < accountsNow()+coachingNotice {
				return nil, apiErr(422, "Offer a time at least an hour from now.")
			}
			if start == startsAt {
				return nil, apiErr(422, "That is the time of the session already.")
			}
			if err := coachingClash(db, row, start, end); err != nil {
				return nil, err
			}
			proposedStart, proposedEnd = start, end
		}
		if _, err := db.Exec("UPDATE coach_bookings SET proposed_start=?,proposed_end=? WHERE id=?", proposedStart, proposedEnd, id); err != nil {
			return nil, err
		}
		coachingNotifyParties(state, row)
		return coachingBookingAgain(db, id, uid)

	case is("POST", "bookings", "*", "answer"):
		// The student takes the time the coach offered, or keeps the session where it was.
		id := parts[1]
		row, err := coachingBookingRow(db, id, uid)
		if err != nil {
			return nil, err
		}
		if !eqStr(row["student_id"], uid) {
			return nil, apiErr(403, "Only the student answers an offer.")
		}
		start, ok1 := asInt(row["proposed_start"])
		end, ok2 := asInt(row["proposed_end"])
		if !ok1 || !ok2 {
			return nil, apiErr(409, "The coach took this offer back.")
		}
		if !eqStr(row["status"], "booked") {
			return nil, apiErr(409, "This session is cancelled.")
		}
		accept, ok := asBool(idx(body, "accept"))
		if !ok {
			return nil, validation()
		}
		if accept {
			if start <= accountsNow() {
				return nil, apiErr(409, "This time has passed.")
			}
			if err := coachingClash(db, row, start, end); err != nil {
				return nil, err
			}
			if _, err := db.Exec("UPDATE coach_bookings SET starts_at=?,ends_at=?,proposed_start=NULL,proposed_end=NULL WHERE id=?", start, end, id); err != nil {
				return nil, err
			}
		} else if _, err := db.Exec("UPDATE coach_bookings SET proposed_start=NULL,proposed_end=NULL WHERE id=?", id); err != nil {
			return nil, err
		}
		coachingNotifyParties(state, row)
		return coachingBookingAgain(db, id, uid)

	case is("POST", "bookings", "*", "review"):
		id := parts[1]
		row, err := coachingBookingRow(db, id, uid)
		if err != nil {
			return nil, err
		}
		if !eqStr(row["student_id"], uid) {
			return nil, apiErr(403, "Only the student reviews a session.")
		}
		ends, ok := asInt(row["ends_at"])
		if !ok {
			ends = 1<<63 - 1
		}
		if !eqStr(row["status"], "booked") || ends > accountsNow() {
			return nil, apiErr(409, "You can review a session once it is over.")
		}
		rating, ok := asInt(idx(body, "rating"))
		if !ok || rating < 1 || rating > 5 {
			return nil, validation()
		}
		comment, err := coachingText(body, "comment", 1000)
		if err != nil {
			return nil, err
		}
		if _, err := db.Exec(`INSERT INTO coach_reviews(booking_id,coach_id,student_id,rating,comment,created_at) VALUES(?,?,?,?,?,?)
                 ON CONFLICT(booking_id) DO UPDATE SET rating=excluded.rating,comment=excluded.comment,created_at=excluded.created_at`,
			id, row["coach_id"], uid, rating, comment, accountsNow()); err != nil {
			return nil, err
		}
		return coachingBookingAgain(db, id, uid)

	case is("GET", "conversations"):
		rows, err := dbAll(db, coachingConversationSQL+" WHERE cv.coach_id=?1 OR cv.student_id=?1 ORDER BY cv.updated_at DESC LIMIT 300", uid)
		if err != nil {
			return nil, err
		}
		out := make([]any, 0, len(rows))
		for _, r := range rows {
			out = append(out, coachingConversationDto(r, uid))
		}
		return out, nil

	case is("POST", "conversations"):
		// A player who booked a coach (even a session cancelled since) opens their conversation; coaches answer in
		// the ones opened with them.
		coachID, err := apiString(body, "coachId", 1, 64)
		if err != nil {
			return nil, err
		}
		if coachID == uid {
			return nil, apiErr(422, "You cannot message yourself.")
		}
		coach, err := coachingActive(db, coachID)
		if err != nil {
			return nil, err
		}
		coached, err := coachingCoached(db, coachID, uid)
		if err != nil {
			return nil, err
		}
		if !coached {
			name, ok := asStr(coach["username"])
			if !ok {
				name = "this coach"
			}
			return nil, apiErr(403, fmt.Sprintf("Book a session with %s to write to them.", name))
		}
		id, err := coachingConversationBetween(db, coachID, uid)
		if err != nil {
			return nil, err
		}
		row, err := coachingConversationRow(db, strconv.FormatInt(id, 10), uid)
		if err != nil {
			return nil, err
		}
		return coachingConversationDto(row, uid), nil

	case is("GET", "conversations", "*", "messages"):
		conversation, err := coachingConversationRow(db, parts[1], uid)
		if err != nil {
			return nil, err
		}
		before := int64(1<<63 - 1)
		if v, ok := query["before"]; ok {
			if before, err = strconv.ParseInt(v, 10, 64); err != nil {
				return nil, validation()
			}
		}
		rows, err := dbAll(db, "SELECT "+coachingMessageColumns+" FROM coach_messages WHERE conversation_id=? AND id<? ORDER BY id DESC LIMIT 200", conversation["id"], before)
		if err != nil {
			return nil, err
		}
		out := make([]any, len(rows))
		for i, r := range rows {
			out[len(rows)-1-i] = coachingMessageDto(r)
		}
		return out, nil

	case is("POST", "conversations", "*", "messages"):
		conversation, err := coachingWritable(db, parts[1], uid)
		if err != nil {
			return nil, err
		}
		text, err := apiString(body, "body", 1, 2000)
		if err != nil {
			return nil, err
		}
		if text = strings.TrimSpace(text); text == "" {
			return nil, validation()
		}
		return coachingPost(db, state, conversation, user, text, nil)

	case is("POST", "conversations", "*", "read"):
		conversation, err := coachingConversationRow(db, parts[1], uid)
		if err != nil {
			return nil, err
		}
		cid, _ := asInt(conversation["id"])
		read, err := db.Exec("UPDATE coach_messages SET read_at=? WHERE conversation_id=? AND sender_id!=? AND read_at IS NULL", accountsNow(), cid, uid)
		if err != nil {
			return nil, err
		}
		if read > 0 {
			state.coaching.notify(uid, M{"type": "read", "conversation": cid})
		}
		unread, err := coachingUnread(db, uid)
		if err != nil {
			return nil, err
		}
		return M{"ok": true, "read": read, "unread": unread}, nil

	case is("PUT", "conversations", "*", "note"):
		conversation, err := coachingConversationRow(db, parts[1], uid)
		if err != nil {
			return nil, err
		}
		if !eqStr(conversation["coach_id"], uid) {
			return nil, apiErr(403, "Only the coach keeps notes.")
		}
		note, err := coachingText(body, "note", 20000)
		if err != nil {
			return nil, err
		}
		if _, err := db.Exec("UPDATE coach_conversations SET note=? WHERE id=?", note, conversation["id"]); err != nil {
			return nil, err
		}
		row, err := coachingConversationRow(db, parts[1], uid)
		if err != nil {
			return nil, err
		}
		return coachingConversationDto(row, uid), nil

	case is("GET", "dashboard"):
		return coachingDashboard(db, uid)

	case is("GET", "people", "*"):
		return coachingPerson(db, uid, parts[1])
	}
	return nil, apiErr(404, "Not found")
}

func boolInt(b bool) int64 {
	if b {
		return 1
	}
	return 0
}

// coachingOptionalBool: a boolean, true when absent.
func coachingOptionalBool(body any, key string) (bool, error) {
	v, ok := get(body, key)
	if !ok {
		return true, nil
	}
	b, ok := asBool(v)
	if !ok {
		return false, validation()
	}
	return b, nil
}

func coachingBookingAgain(db *Conn, id, uid string) (any, error) {
	row, err := coachingBookingRow(db, id, uid)
	if err != nil {
		return nil, err
	}
	return coachingBookingDto(row, uid), nil
}

// coachingSetAvailability is `PUT /api/coaching/availability`: the time zone, session length, weekly hours, days off
// and one-day changes of the coach.
func coachingSetAvailability(db *Conn, uid string, body any) (any, error) {
	if _, err := coachingOwn(db, uid); err != nil {
		return nil, err
	}
	timezone, err := apiString(body, "timezone", 1, 64)
	if err != nil {
		return nil, err
	}
	if _, ok := coachingTimeZone(timezone); !ok {
		return nil, apiErr(422, "Unknown time zone.")
	}
	minutes, ok := coachingLength(idx(body, "sessionMinutes"))
	if !ok {
		return nil, validation()
	}
	list, ok := asArray(idx(body, "windows"))
	if !ok || len(list) > 200 {
		return nil, validation()
	}
	openings := []M{}
	for _, w := range list {
		weekday, ok := asInt(idx(w, "weekday"))
		start, end, valid := coachingMinutesOfDay(w)
		if !ok || !valid {
			return nil, validation()
		}
		from, err := coachingOptionalDate(w, "from")
		if err != nil {
			return nil, err
		}
		until, err := coachingOptionalDate(w, "until")
		if err != nil {
			return nil, err
		}
		if weekday < 0 || weekday > 6 || (from != nil && until != nil && from.key() > until.key()) {
			return nil, validation()
		}
		opening := M{"weekday": weekday, "start": start, "end": end}
		if from != nil {
			opening["from"] = from.String()
		}
		if until != nil {
			opening["until"] = until.String()
		}
		openings = append(openings, opening)
	}
	sort.SliceStable(openings, func(i, j int) bool {
		a, b := openings[i], openings[j]
		if a["weekday"] != b["weekday"] {
			return a["weekday"].(int64) < b["weekday"].(int64)
		}
		return a["start"].(int64) < b["start"].(int64)
	})
	changes := []M{}
	overrides, _ := asArray(idx(body, "overrides"))
	if len(overrides) > 1000 {
		overrides = overrides[:1000]
	}
	for _, o := range overrides {
		day, ok1 := coachingDate(idx(o, "date"))
		start, end, ok2 := coachingMinutesOfDay(o)
		open, ok3 := asBool(idx(o, "open"))
		if !ok1 || !ok2 || !ok3 {
			return nil, validation()
		}
		changes = append(changes, M{"date": day.String(), "start": start, "end": end, "open": open})
	}
	sort.SliceStable(changes, func(i, j int) bool {
		a, b := changes[i], changes[j]
		if a["date"] != b["date"] {
			return a["date"].(string) < b["date"].(string)
		}
		return a["start"].(int64) < b["start"].(int64)
	})
	days, ok := asArray(idx(body, "daysOff"))
	if !ok || len(days) > 400 {
		return nil, validation()
	}
	off := []string{}
	for _, d := range days {
		day, ok := coachingDate(d)
		if !ok {
			return nil, validation()
		}
		off = append(off, day.String())
	}
	sort.Strings(off)
	deduped := off[:0]
	for i, d := range off {
		if i == 0 || d != off[i-1] {
			deduped = append(deduped, d)
		}
	}
	if _, err := db.Exec("UPDATE coaches SET timezone=?,session_minutes=?,windows=?,days_off=?,overrides=? WHERE user_id=?",
		timezone, minutes, encodeJSON(openings), encodeJSON(deduped), encodeJSON(changes), uid); err != nil {
		return nil, err
	}
	row, err := coachingOwn(db, uid)
	if err != nil {
		return nil, err
	}
	return coachingDto(row, true), nil
}

// coachingBook is `POST /api/coaching/bookings`: a player books one of the coach's free slots.
func coachingBook(db *Conn, state *AppState, uid string, body any) (any, error) {
	if !eqStr(idx(body, "cancellationPolicy"), coachingCancellationPolicy) {
		return nil, apiErr(422, "Please read and accept the cancellation policy before booking.")
	}
	coachID, err := apiString(body, "coachId", 1, 64)
	if err != nil {
		return nil, err
	}
	start, ok := asInt(idx(body, "start"))
	if !ok {
		return nil, validation()
	}
	note, err := coachingText(body, "note", 1000)
	if err != nil {
		return nil, err
	}
	if coachID == uid {
		return nil, apiErr(422, "You cannot book yourself.")
	}
	coach, err := coachingActive(db, coachID)
	if err != nil {
		return nil, err
	}
	if !coachingFlag(coach["accepting"]) {
		return nil, apiErr(409, "This coach is not taking bookings right now.")
	}
	if !coachingFlag(coach["new_students"]) {
		coached, err := coachingCoached(db, coachID, uid)
		if err != nil {
			return nil, err
		}
		if !coached {
			name, ok := asStr(coach["username"])
			if !ok {
				name = "This coach"
			}
			return nil, apiErr(403, fmt.Sprintf("%s is not taking new students right now.", name))
		}
	}
	at := accountsNow()
	busy, err := coachingBusy(db, coachID, at)
	if err != nil {
		return nil, err
	}
	var slot *[2]int64
	for _, s := range coachingFreeSlots(coach, busy, at, coachingHorizonDays) {
		if s[0] == start {
			slot = &s
			break
		}
	}
	if slot == nil {
		return nil, apiErr(409, "This slot is no longer available.")
	}
	starts, ends := slot[0], slot[1]
	taken, err := dbOne(db, "SELECT id FROM coach_bookings WHERE (student_id=?1 OR coach_id=?1) AND status='booked' AND starts_at<?3 AND ?2<ends_at", uid, starts, ends)
	if err != nil {
		return nil, err
	}
	if taken != nil {
		return nil, apiErr(409, "You already have a session at that time.")
	}
	id := newUUID()
	price, _ := asInt(coach["price_cents"])
	if _, err := db.Exec("INSERT INTO coach_bookings(id,coach_id,student_id,starts_at,ends_at,note,price_cents,created_at,cancellation_policy,cancellation_policy_accepted_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
		id, coachID, uid, starts, ends, note, price, at, coachingCancellationPolicy, at); err != nil {
		return nil, err
	}
	if _, err := coachingConversationBetween(db, coachID, uid); err != nil {
		return nil, err
	}
	for _, party := range []string{coachID, uid} {
		state.coaching.notify(party, M{"type": "bookings"})
	}
	return coachingBookingAgain(db, id, uid)
}

const coachingMessageColumns = "id,sender_id,body,created_at,read_at,media_id,media_type,media_size,media_name"

func coachingMessageDto(row M) M {
	var media any
	if row["media_id"] != nil {
		media = M{"id": row["media_id"], "type": row["media_type"], "size": row["media_size"], "name": row["media_name"]}
	}
	return M{"id": row["id"], "senderId": row["sender_id"], "body": row["body"], "createdAt": row["created_at"], "readAt": row["read_at"], "media": media}
}

// coachingAttachment: a picture or a video attached to a message: its file's name under the media directory, type,
// size and original name.
type coachingAttachment struct {
	id   string
	kind string
	size int
	name string
}

// coachingPost adds a message to the conversation and brings it to the open apps of both parties.
func coachingPost(db *Conn, state *AppState, conversation M, user M, text string, media *coachingAttachment) (any, error) {
	at := accountsNow()
	cid, _ := asInt(conversation["id"])
	var mediaID, kind, size, name any
	if media != nil {
		mediaID, kind, size, name = media.id, media.kind, int64(media.size), media.name
	}
	if _, err := db.Exec("INSERT INTO coach_messages(conversation_id,sender_id,body,created_at,media_id,media_type,media_size,media_name) VALUES(?,?,?,?,?,?,?,?)",
		cid, user["id"], text, at, mediaID, kind, size, name); err != nil {
		return nil, err
	}
	if _, err := db.Exec("UPDATE coach_conversations SET updated_at=? WHERE id=?", at, cid); err != nil {
		return nil, err
	}
	row, err := dbRequired(db, "SELECT "+coachingMessageColumns+" FROM coach_messages WHERE id=last_insert_rowid()", "Unknown message")
	if err != nil {
		return nil, err
	}
	message := coachingMessageDto(row)
	event := M{"type": "message", "conversation": cid, "message": message, "from": user["username"]}
	for _, key := range []string{"coach_id", "student_id"} {
		state.coaching.notify(str(conversation[key]), event)
	}
	return message, nil
}

// coachingMediaDir is `CUBIX_MEDIA_DIR`, or a `coaching-media` directory beside the SQLite database, so the files
// outlive the container.
func coachingMediaDir() string {
	if dir := os.Getenv("CUBIX_MEDIA_DIR"); dir != "" {
		return dir
	}
	db, ok := os.LookupEnv("CUBIX_DB")
	if !ok {
		db = "cubix.db"
	}
	return filepath.Join(filepath.Dir(db), "coaching-media")
}

// coachingSniff: the type of a picture or a video, read from its first bytes rather than taken from the sender's word.
func coachingSniff(b []byte) string {
	at := func(offset int, magic string) bool {
		return len(b) >= offset+len(magic) && string(b[offset:offset+len(magic)]) == magic
	}
	switch {
	case at(0, "\xFF\xD8\xFF"):
		return "image/jpeg"
	case at(0, "\x89PNG\r\n\x1a\n"):
		return "image/png"
	case at(0, "GIF87a") || at(0, "GIF89a"):
		return "image/gif"
	case at(0, "RIFF") && at(8, "WEBP"):
		return "image/webp"
	case at(4, "ftypavif"):
		return "image/avif"
	case at(4, "ftypqt  "):
		return "video/quicktime"
	case at(4, "ftyp") && !(at(8, "heic") || at(8, "heix") || at(8, "mif1") || at(8, "msf1")):
		return "video/mp4"
	case at(0, "\x1A\x45\xDF\xA3"):
		return "video/webm"
	}
	return ""
}

// coachingLossy is String::from_utf8_lossy: each maximal invalid subpart becomes one U+FFFD.
func coachingLossy(b []byte) string {
	var out strings.Builder
	for len(b) > 0 {
		r, size := utf8.DecodeRune(b)
		if r != utf8.RuneError || size > 1 {
			out.Write(b[:size])
			b = b[size:]
			continue
		}
		// How far the bytes still made a valid beginning of a sequence.
		lo, hi, need := byte(0x80), byte(0xBF), 0
		switch c := b[0]; {
		case 0xC2 <= c && c <= 0xDF:
			need = 1
		case c == 0xE0:
			lo, need = 0xA0, 2
		case 0xE1 <= c && c <= 0xEC, c == 0xEE, c == 0xEF:
			need = 2
		case c == 0xED:
			hi, need = 0x9F, 2
		case c == 0xF0:
			lo, need = 0x90, 3
		case 0xF1 <= c && c <= 0xF3:
			need = 3
		case c == 0xF4:
			hi, need = 0x8F, 3
		}
		taken := 1
		for i := 1; i <= need && i < len(b); i++ {
			if b[i] < lo || b[i] > hi {
				break
			}
			lo, hi = 0x80, 0xBF
			taken++
		}
		out.WriteRune(utf8.RuneError)
		b = b[taken:]
	}
	return out.String()
}

// coachingSignedIn: the account of an `Authorization: Bearer …` header.
func coachingSignedIn(db *Conn, authorization string) (M, error) {
	user, err := accountsAuth(db, authorization)
	if err != nil {
		return nil, err
	}
	if user == nil || user["password_hash"] == nil {
		return nil, apiErr(401, "Please sign in again.")
	}
	return user, nil
}

// coachingUpload is `POST /api/coaching/conversations/{id}/media`: a picture or a video as the whole body, sent as a
// message of its own. Its original name may come URI-encoded in `X-File-Name`.
func coachingUpload(state *AppState, w http.ResponseWriter, r *http.Request) {
	bytes, ok := readBody(w, r)
	if !ok {
		return
	}
	value, err := coachingSendMedia(state, r, bytes)
	writeResult(w, value, err)
}

func coachingSendMedia(state *AppState, r *http.Request, bytes []byte) (any, error) {
	kind := coachingSniff(bytes)
	if kind == "" {
		return nil, apiErr(415, "Send a picture (JPEG, PNG, GIF, WebP, AVIF) or a video (MP4, MOV, WebM).")
	}
	if strings.HasPrefix(kind, "image/") && len(bytes) > coachingImageMax {
		return nil, apiErr(413, "Pictures are limited to 10 MB.")
	}
	var b strings.Builder
	n := 0
	for _, c := range strings.TrimSpace(coachingLossy(percentDecode(headerText(r, "X-File-Name")))) {
		if unicode.IsControl(c) {
			continue
		}
		if n == 120 {
			break
		}
		b.WriteRune(c)
		n++
	}
	name := b.String()
	// Only a party to the conversation leaves a file on the disk.
	id, authorization := r.PathValue("id"), headerText(r, "Authorization")
	var user, conversation M
	err := state.db.Call(func(db *Conn) error {
		var err error
		if user, err = coachingSignedIn(db, authorization); err != nil {
			return err
		}
		conversation, err = coachingWritable(db, id, str(user["id"]))
		return err
	})
	if err != nil {
		return nil, err
	}
	media := &coachingAttachment{id: newUUID(), kind: kind, size: len(bytes), name: name}
	dir := coachingMediaDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, internal(err)
	}
	path := filepath.Join(dir, media.id)
	if err := os.WriteFile(path, bytes, 0o644); err != nil {
		return nil, internal(err)
	}
	sent, err := dbCall(state.db, func(db *Conn) (any, error) { return coachingPost(db, state, conversation, user, "", media) })
	if err != nil {
		_ = os.Remove(path)
	}
	return sent, err
}

// coachingMedia is `GET /api/coaching/media/{id}`: a picture or a video of a conversation, for its two parties only.
func coachingMedia(state *AppState, w http.ResponseWriter, r *http.Request) {
	// A UUID names the file: nothing else reaches the disk.
	id, ok := parseUUID(r.PathValue("id"))
	if !ok {
		writeError(w, apiErr(404, coachingUnknownMedia))
		return
	}
	authorization := headerText(r, "Authorization")
	kind, err := dbCall(state.db, func(db *Conn) (string, error) {
		user, err := coachingSignedIn(db, authorization)
		if err != nil {
			return "", err
		}
		row, err := dbRequired(db, `SELECT m.media_type FROM coach_messages m JOIN coach_conversations cv ON cv.id=m.conversation_id
                     WHERE m.media_id=?1 AND (cv.coach_id=?2 OR cv.student_id=?2)`, coachingUnknownMedia, id, user["id"])
		if err != nil {
			return "", err
		}
		kind, ok := asStr(row["media_type"])
		if !ok {
			kind = "application/octet-stream"
		}
		return kind, nil
	})
	if err != nil {
		writeError(w, err)
		return
	}
	file, err := os.Open(filepath.Join(coachingMediaDir(), id))
	if err != nil {
		writeError(w, apiErr(404, coachingUnknownMedia))
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		writeError(w, internal(err))
		return
	}
	h := w.Header()
	h.Set("Content-Type", kind)
	h.Set("Content-Length", strconv.FormatInt(info.Size(), 10))
	h.Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, file)
}

// coachingAvatarDir is `CUBIX_AVATAR_DIR`, or an `avatars` directory beside the SQLite database.
func coachingAvatarDir() string {
	if dir := os.Getenv("CUBIX_AVATAR_DIR"); dir != "" {
		return dir
	}
	return filepath.Join(filepath.Dir(filepath.Clean(coachingMediaDir())), "avatars")
}

const coachingAvatarMax = 2 * 1024 * 1024

// coachingSetAvatar is `PUT /api/coaching/avatar`: the account's picture as the whole body (the app sends it square
// and small); `DELETE` takes it away. Answers the new picture's address.
func coachingSetAvatar(state *AppState, w http.ResponseWriter, r *http.Request) {
	bytes, ok := readBody(w, r)
	if !ok {
		return
	}
	value, err := coachingReplaceAvatar(state, r.Method == http.MethodDelete, headerText(r, "Authorization"), bytes)
	writeResult(w, value, err)
}

func coachingReplaceAvatar(state *AppState, remove bool, authorization string, bytes []byte) (any, error) {
	var file any
	if !remove {
		kind := coachingSniff(bytes)
		if !strings.HasPrefix(kind, "image/") || kind == "image/gif" {
			return nil, apiErr(415, "Use a JPEG, PNG, WebP or AVIF picture.")
		}
		if len(bytes) > coachingAvatarMax {
			return nil, apiErr(413, "Pictures are limited to 2 MB.")
		}
		// The type travels in the name, so serving it needs no lookup.
		file = newUUID() + "." + strings.TrimPrefix(kind, "image/")
	}
	user, err := dbCall(state.db, func(db *Conn) (M, error) { return coachingSignedIn(db, authorization) })
	if err != nil {
		return nil, err
	}
	dir := coachingAvatarDir()
	if name, ok := file.(string); ok {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, internal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, name), bytes, 0o644); err != nil {
			return nil, internal(err)
		}
	}
	uid := str(user["id"])
	if err := state.db.Call(func(db *Conn) error {
		_, err := db.Exec("UPDATE users SET avatar=? WHERE id=?", file, uid)
		return err
	}); err != nil {
		return nil, err
	}
	if old, ok := asStr(user["avatar"]); ok {
		_ = os.Remove(filepath.Join(dir, old))
	}
	return M{"avatar": coachingAvatarURL(file)}, nil
}

// coachingForgetAvatar removes an account's picture file (the account is going).
func coachingForgetAvatar(file string) {
	if !strings.ContainsAny(file, "/\\") {
		_ = os.Remove(filepath.Join(coachingAvatarDir(), file))
	}
}

// coachingAvatar is `GET /api/avatars/{file}`: a picture of an account, for anyone signed in or not, like its
// username.
func coachingAvatar(state *AppState, w http.ResponseWriter, r *http.Request) {
	file := r.PathValue("file")
	unknown := apiErr(404, "Unknown picture")
	id, ext, ok := strings.Cut(file, ".")
	if !ok {
		writeError(w, unknown)
		return
	}
	kinds := map[string]string{"jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp", "avif": "image/avif"}
	kind, ok := kinds[ext]
	if !ok || !isUUID(id) {
		writeError(w, unknown)
		return
	}
	bytes, err := os.ReadFile(filepath.Join(coachingAvatarDir(), file))
	if err != nil {
		writeError(w, unknown)
		return
	}
	h := w.Header()
	h.Set("Content-Type", kind)
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Content-Length", strconv.Itoa(len(bytes)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(bytes)
}

// coachingSweepMedia removes the files no message refers to any more: their conversation or one of its parties went.
func coachingSweepMedia(db *Conn) error {
	entries, err := os.ReadDir(coachingMediaDir())
	if err != nil {
		return nil
	}
	for _, entry := range entries {
		name := entry.Name()
		if !isUUID(name) {
			continue
		}
		kept, err := dbOne(db, "SELECT 1 FROM coach_messages WHERE media_id=?", name)
		if err != nil {
			return err
		}
		if kept == nil {
			_ = os.Remove(filepath.Join(coachingMediaDir(), name))
		}
	}
	return nil
}

// coachingPerson: someone the caller coaches or is coached by: who they are, the sessions they had together, the
// coach's notes (for the coach only) and how they practise: timer solves per puzzle with the best single and the last
// Ao5.
func coachingPerson(db *Conn, uid, id string) (any, error) {
	conversation, err := dbOne(db, "SELECT * FROM coach_conversations WHERE (coach_id=?1 AND student_id=?2) OR (coach_id=?2 AND student_id=?1)", uid, id)
	if err != nil {
		return nil, err
	}
	if conversation == nil {
		return nil, apiErr(404, "Unknown person")
	}
	user, err := dbRequired(db, "SELECT id,username,avatar,created_at FROM users WHERE id=?", "Unknown person", id)
	if err != nil {
		return nil, err
	}
	coach := eqStr(conversation["coach_id"], uid)
	rows, err := dbAll(db, coachingBookingSQL+" WHERE (b.coach_id=?1 AND b.student_id=?2) OR (b.coach_id=?2 AND b.student_id=?1) ORDER BY b.starts_at DESC LIMIT 100", uid, id)
	if err != nil {
		return nil, err
	}
	role := "coach"
	var note any
	if coach {
		role = "student"
		note = conversation["note"]
	}
	practice, err := coachingPractice(db, id, 6)
	if err != nil {
		return nil, err
	}
	history, err := coachingHistory(db, id)
	if err != nil {
		return nil, err
	}
	return M{
		"id": user["id"], "username": user["username"], "since": user["created_at"], "avatar": coachingAvatarURL(user["avatar"]),
		"role": role, "conversationId": conversation["id"],
		"note":     note,
		"sessions": coachingBookingDtos(rows, uid),
		"practice": practice,
		"history":  history,
	}, nil
}

// coachingTimestamp is jiff's Timestamp display: RFC 3339 in UTC, the fraction only as long as needed.
func coachingTimestamp(ms int64) string {
	return time.UnixMilli(ms).UTC().Format(time.RFC3339Nano)
}

// coachingRecent: the effective times of a player's last `limit` timer solves of a puzzle, latest first.
func coachingRecent(db *Conn, id, puzzle string, limit int) ([]*float64, error) {
	rows, err := dbAll(db, "SELECT time_ms,penalty FROM solves WHERE user_id=? AND case_id IS NULL AND solve_mode='standard' AND puzzle_id=? ORDER BY created_at DESC,id DESC LIMIT "+strconv.Itoa(limit), id, puzzle)
	if err != nil {
		return nil, err
	}
	out := make([]*float64, 0, len(rows))
	for _, r := range rows {
		out = append(out, statsEffective(r))
	}
	return out, nil
}

// coachingHistory: what the coach follows a student's progress with: their solves per day over the last 53 weeks,
// their last 50 timer solves per puzzle (oldest first, null for a DNF) with the last Ao12, and the cases they learned.
func coachingHistory(db *Conn, id string) (any, error) {
	since := ""
	if at := accountsNow() - 371*accountsDayMs; at >= coachingMinMs && at <= coachingMaxMs {
		since = coachingTimestamp(at)
	}
	rows, err := dbAll(db, "SELECT substr(created_at,1,10) day,count(*) n FROM solves WHERE user_id=? AND created_at>=? GROUP BY day ORDER BY day", id, since)
	if err != nil {
		return nil, err
	}
	days := make([]any, 0, len(rows))
	for _, r := range rows {
		days = append(days, []any{r["day"], r["n"]})
	}
	puzzles := M{}
	distinct, err := dbAll(db, "SELECT DISTINCT puzzle_id FROM solves WHERE user_id=? AND case_id IS NULL AND solve_mode='standard'", id)
	if err != nil {
		return nil, err
	}
	for _, row := range distinct {
		puzzle := str(row["puzzle_id"])
		if !practiceIsPuzzle(puzzle) {
			continue
		}
		recent, err := coachingRecent(db, id, puzzle, 50)
		if err != nil {
			return nil, err
		}
		var ao12 *float64
		if len(recent) >= 12 {
			ao12 = statsAverage(recent[:12])
		}
		for i, j := 0, len(recent)-1; i < j; i, j = i+1, j-1 {
			recent[i], recent[j] = recent[j], recent[i]
		}
		puzzles[puzzle] = M{"ao12": ao12, "recent": recent}
	}
	learnedRows, err := dbAll(db, "SELECT case_id FROM learned_cases WHERE user_id=? AND learned=1", id)
	if err != nil {
		return nil, err
	}
	learned := make([]any, 0, len(learnedRows))
	for _, r := range learnedRows {
		learned = append(learned, r["case_id"])
	}
	return M{"days": days, "puzzles": puzzles, "learned": learned}, nil
}

// coachingPractice: how someone practises: their solves, the days they solved on this month, the cases they learned,
// and their timer solves per puzzle (the `top` most solved) with the best single and the last Ao5. A best time they
// gave at sign-up stands while no solve beats it.
func coachingPractice(db *Conn, id string, top int64) (any, error) {
	monthAgo := ""
	if at := accountsNow() - 30*accountsDayMs; at >= coachingMinMs && at <= coachingMaxMs {
		monthAgo = coachingTimestamp(at)
	}
	totals, err := dbRequired(db, `SELECT count(*) solves, count(DISTINCT CASE WHEN created_at>=?2 THEN substr(created_at,1,10) END) active_days, max(created_at) last_at
         FROM solves WHERE user_id=?1`, "Unknown person", id, monthAgo)
	if err != nil {
		return nil, err
	}
	declared, err := journeyDeclaredBests(db, id)
	if err != nil {
		return nil, err
	}
	rows, err := dbAll(db, "SELECT puzzle_id,count(*) solves,min("+statsEffectiveMsSQL+") best FROM solves WHERE user_id=? AND case_id IS NULL AND solve_mode='standard' GROUP BY puzzle_id ORDER BY solves DESC LIMIT ?", id, top)
	if err != nil {
		return nil, err
	}
	puzzles := []M{}
	for _, row := range rows {
		puzzle := str(row["puzzle_id"])
		if !practiceIsPuzzle(puzzle) {
			continue
		}
		last, err := coachingRecent(db, id, puzzle, 5)
		if err != nil {
			return nil, err
		}
		var best any
		b, hasBest := asFloat(row["best"])
		d, hasDeclared := declared[puzzle]
		switch {
		case hasBest && hasDeclared:
			best = min(b, d)
		case hasBest:
			best = b
		case hasDeclared:
			best = d
		}
		var ao5 *float64
		if len(last) == 5 {
			ao5 = statsAverage(last)
		}
		puzzles = append(puzzles, M{"puzzle": puzzle, "solves": row["solves"], "best": best, "ao5": ao5})
	}
	// Puzzles known from sign-up but never timed here still show their best.
	names := make([]string, 0, len(declared))
	for puzzle := range declared {
		names = append(names, puzzle)
	}
	sort.Strings(names)
	for _, puzzle := range names {
		listed := false
		for _, p := range puzzles {
			if p["puzzle"] == puzzle {
				listed = true
				break
			}
		}
		if int64(len(puzzles)) < top && !listed {
			puzzles = append(puzzles, M{"puzzle": puzzle, "solves": 0, "best": declared[puzzle], "ao5": nil})
		}
	}
	var learned any = int64(0)
	row, err := dbOne(db, "SELECT count(*) n FROM learned_cases WHERE user_id=? AND learned=1", id)
	if err != nil {
		return nil, err
	}
	if row != nil {
		learned = row["n"]
	}
	return M{"solves": totals["solves"], "activeDays": totals["active_days"], "lastAt": totals["last_at"], "learned": learned, "puzzles": puzzles}, nil
}

// coachingCoached: whether the student had a session with the coach (any, even cancelled): coaches closed to new
// students still take theirs.
func coachingCoached(db *Conn, coach, student string) (bool, error) {
	row, err := dbOne(db, "SELECT 1 FROM coach_bookings WHERE coach_id=? AND student_id=? LIMIT 1", coach, student)
	return row != nil, err
}

// coachingWritable: a conversation the account may write in: only once its student booked the coach.
func coachingWritable(db *Conn, id, uid string) (M, error) {
	conversation, err := coachingConversationRow(db, id, uid)
	if err != nil {
		return nil, err
	}
	coached, err := coachingCoached(db, str(conversation["coach_id"]), str(conversation["student_id"]))
	if err != nil {
		return nil, err
	}
	if !coached {
		return nil, apiErr(403, "Messages open once a session is booked.")
	}
	return conversation, nil
}

// coachingClash fails when another session of the coach or of the student overlaps `start..end`.
func coachingClash(db *Conn, booking M, start, end int64) error {
	taken, err := dbOne(db, "SELECT coach_id FROM coach_bookings WHERE id!=?1 AND status='booked' AND starts_at<?4 AND ?3<ends_at AND (coach_id IN (?2,?5) OR student_id IN (?2,?5))",
		coachingStrOrNil(booking["id"]), coachingStrOrNil(booking["coach_id"]), start, end, coachingStrOrNil(booking["student_id"]))
	if err != nil {
		return err
	}
	if taken != nil {
		return apiErr(409, "Another session already takes that time.")
	}
	return nil
}

// coachingStrOrNil is `value.as_str()` as a parameter: the text, or NULL.
func coachingStrOrNil(v any) any {
	if s, ok := asStr(v); ok {
		return s
	}
	return nil
}

// coachingAvatarURL is coaching::avatar_url (social.rs uses it): where an account's picture is fetched from, or null
// without one.
func coachingAvatarURL(file any) any {
	if f, ok := asStr(file); ok {
		return "/api/avatars/" + f
	}
	return nil
}

// coachingDashboard: what a coach plans with: the coming weeks (sessions, hours, expected income, free slots), the
// next sessions and every student.
func coachingDashboard(db *Conn, uid string) (any, error) {
	coach, err := coachingOwn(db, uid)
	if err != nil {
		return nil, err
	}
	at := accountsNow()
	booked, err := dbAll(db, coachingBookingSQL+" WHERE b.coach_id=?1 AND b.status='booked' AND b.ends_at>?2 ORDER BY b.starts_at", uid, at)
	if err != nil {
		return nil, err
	}
	open := [][2]int64{}
	if coachingFlag(coach["accepting"]) {
		busy, err := coachingBusy(db, uid, at)
		if err != nil {
			return nil, err
		}
		open = coachingFreeSlots(coach, busy, at, coachingHorizonDays)
	}
	weeks := make([]any, 0, 4)
	for w := int64(0); w < 4; w++ {
		from, to := at+w*7*accountsDayMs, at+(w+1)*7*accountsDayMs
		var sessions, minutes, income int64
		for _, b := range booked {
			starts, _ := asInt(b["starts_at"])
			if starts < from || starts >= to {
				continue
			}
			ends, _ := asInt(b["ends_at"])
			price, _ := asInt(b["price_cents"])
			sessions++
			minutes += (ends - starts) / coachingMinute
			income += price
		}
		slots := 0
		for _, s := range open {
			if from <= s[0] && s[0] < to {
				slots++
			}
		}
		weeks = append(weeks, M{"from": from, "to": to, "sessions": sessions, "minutes": minutes, "incomeCents": income, "openSlots": slots})
	}
	students, err := dbAll(db, `SELECT u.id,u.username,u.avatar,cv.id conversation_id,cv.note,
          (SELECT count(*) FROM coach_bookings b WHERE b.coach_id=?1 AND b.student_id=u.id AND b.status='booked' AND b.ends_at<=?2) done,
          (SELECT count(*) FROM coach_bookings b WHERE b.coach_id=?1 AND b.student_id=u.id AND b.status='booked' AND b.ends_at>?2) upcoming,
          (SELECT min(starts_at) FROM coach_bookings b WHERE b.coach_id=?1 AND b.student_id=u.id AND b.status='booked' AND b.ends_at>?2) next_at,
          (SELECT max(starts_at) FROM coach_bookings b WHERE b.coach_id=?1 AND b.student_id=u.id AND b.status='booked' AND b.ends_at<=?2) last_at,
          (SELECT avg(rating) FROM coach_reviews r WHERE r.coach_id=?1 AND r.student_id=u.id) rating,
          (SELECT count(*) FROM coach_messages m WHERE m.conversation_id=cv.id AND m.sender_id!=?1 AND m.read_at IS NULL) unread
         FROM coach_conversations cv JOIN users u ON u.id=cv.student_id WHERE cv.coach_id=?1
         ORDER BY next_at IS NULL, next_at, cv.updated_at DESC`, uid, at)
	if err != nil {
		return nil, err
	}
	upcoming := booked
	if len(upcoming) > 30 {
		upcoming = upcoming[:30]
	}
	list := make([]any, 0, len(students))
	for _, s := range students {
		list = append(list, M{
			"id": s["id"], "username": s["username"], "avatar": coachingAvatarURL(s["avatar"]), "conversationId": s["conversation_id"], "note": s["note"],
			"done": s["done"], "upcoming": s["upcoming"], "nextAt": s["next_at"], "lastAt": s["last_at"],
			"rating": s["rating"], "unread": s["unread"],
		})
	}
	return M{
		"coach":     coachingDto(coach, true),
		"weeks":     weeks,
		"openSlots": len(open),
		"upcoming":  coachingBookingDtos(upcoming, uid),
		"students":  list,
	}, nil
}

// coachingAdminOverview is the administration's view (`/api/admin/coaching`): every application, latest first, and
// every coach.
func coachingAdminOverview(db *Conn) (any, error) {
	applications, err := dbAll(db, `SELECT a.*,u.username FROM coach_applications a JOIN users u ON u.id=a.user_id
         ORDER BY a.status!='pending', a.created_at DESC LIMIT 300`)
	if err != nil {
		return nil, err
	}
	coaches, err := dbAll(db, coachingSQL+" ORDER BY c.active DESC, u.username", accountsNow())
	if err != nil {
		return nil, err
	}
	upcoming, err := dbAll(db, "SELECT coach_id,count(*) n FROM coach_bookings WHERE status='booked' AND ends_at>? GROUP BY coach_id", accountsNow())
	if err != nil {
		return nil, err
	}
	apps := make([]any, 0, len(applications))
	pending := 0
	for _, a := range applications {
		apps = append(apps, coachingApplicationDto(a))
		if eqStr(a["status"], "pending") {
			pending++
		}
	}
	list := make([]any, 0, len(coaches))
	for _, c := range coaches {
		value := coachingDto(c, false)
		n := int64(0)
		for _, u := range upcoming {
			if jsonEqual(u["coach_id"], c["user_id"]) {
				n, _ = asInt(u["n"])
				break
			}
		}
		value["upcoming"] = n
		list = append(list, value)
	}
	return M{"applications": apps, "coaches": list, "pending": pending}, nil
}

// coachingDecide approves (making the account a coach) or rejects a pending application.
func coachingDecide(db *Conn, id int64, approve bool) (any, error) {
	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	application, err := dbRequired(db, "SELECT * FROM coach_applications WHERE id=?", "Unknown application", id)
	if err != nil {
		return nil, err
	}
	if !eqStr(application["status"], "pending") {
		return nil, apiErr(409, "This application was already answered.")
	}
	status := "rejected"
	if approve {
		status = "approved"
	}
	if _, err := db.Exec("UPDATE coach_applications SET status=?,decided_at=? WHERE id=?", status, accountsNow(), id); err != nil {
		return nil, err
	}
	user := str(application["user_id"])
	if approve {
		events, ok := asStr(application["events"])
		if !ok {
			events = "[]"
		}
		if err := coachingEnable(db, user, events); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return M{"ok": true, "userId": user}, nil
}

func coachingEnable(db *Conn, user, events string) error {
	_, err := db.Exec("INSERT INTO coaches(user_id,events,created_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET active=1", user, events, accountsNow())
	return err
}

// coachingSetActive turns an account into a coach (or back), without an application.
func coachingSetActive(db *Conn, user string, active bool) (any, error) {
	if _, err := dbRequired(db, "SELECT id FROM users WHERE id=?", "Unknown account", user); err != nil {
		return nil, err
	}
	if active {
		if err := coachingEnable(db, user, "[]"); err != nil {
			return nil, err
		}
	} else if _, err := db.Exec("UPDATE coaches SET active=0 WHERE user_id=?", user); err != nil {
		return nil, err
	}
	return M{"ok": true}, nil
}

type coachingMember struct{ user, socket string }

// CoachingRooms is coaching::Rooms: the open apps and the calls under way.
type CoachingRooms struct {
	mu sync.Mutex
	// Every open coaching socket of each account.
	sockets map[string]map[string]*wsOutbox
	// Who is in each session's call: the account and the socket it joined from.
	calls map[string][]coachingMember
	// The two accounts of each call under way, so whoever waits hears when the other one opens or closes the app.
	parties map[string][2]string
	// The username of each account that joined a call, to tell the other party who waits.
	names map[string]string
}

// newCoachingRooms is coaching::Rooms::default.
func newCoachingRooms() *CoachingRooms {
	return &CoachingRooms{
		sockets: map[string]map[string]*wsOutbox{},
		calls:   map[string][]coachingMember{},
		parties: map[string][2]string{},
		names:   map[string]string{},
	}
}

func (r *CoachingRooms) sendLocked(user, socket string, value M) {
	if tx := r.sockets[user][socket]; tx != nil {
		tx.send(liveText("coaching", value))
	}
}

func (r *CoachingRooms) notifyLocked(user string, value M) {
	text := liveText("coaching", value)
	for _, tx := range r.sockets[user] {
		tx.send(text)
	}
}

// leaveLocked takes a socket out of a call; the one left in hears why: "left" (on purpose) or "lost" (the app went
// away).
func (r *CoachingRooms) leaveLocked(booking, socket, reason string) {
	members, ok := r.calls[booking]
	if !ok {
		return
	}
	i := -1
	for j, m := range members {
		if m.socket == socket {
			i = j
			break
		}
	}
	if i < 0 {
		return
	}
	user := members[i].user
	rest := append(append([]coachingMember{}, members[:i]...), members[i+1:]...)
	r.calls[booking] = rest
	if len(rest) == 0 {
		delete(r.calls, booking)
		delete(r.parties, booking)
	}
	for _, m := range rest {
		r.sendLocked(m.user, m.socket, M{"type": "peer", "booking": booking, "present": false, "reason": reason})
		r.notifyLocked(m.user, M{"type": "presence", "booking": booking, "user": user, "inCall": false})
	}
}

// onlineLocked tells whoever waits in a call for `user` that their app opened or closed; an app that opens hears who
// waits.
func (r *CoachingRooms) onlineLocked(user string, online bool) {
	for booking, members := range r.calls {
		parties, ok := r.parties[booking]
		if !ok || (parties[0] != user && parties[1] != user) {
			continue
		}
		inCall := false
		for _, m := range members {
			if m.user == user {
				inCall = true
			}
		}
		if inCall {
			continue
		}
		for _, m := range members {
			r.sendLocked(m.user, m.socket, M{"type": "online", "booking": booking, "online": online})
			if online {
				r.notifyLocked(user, M{"type": "presence", "booking": booking, "user": r.names[m.user], "inCall": true})
			}
		}
	}
}

// notify is coaching::Rooms::notify: tells every open app of the account.
func (r *CoachingRooms) notify(user string, value M) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.notifyLocked(user, value)
}

// tell sends a message already serialised to every open app of the account (social::notify uses it).
func (r *CoachingRooms) tell(user, text string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, tx := range r.sockets[user] {
		tx.send(text)
	}
}

func (r *CoachingRooms) add(user, socket string, tx *wsOutbox) {
	r.mu.Lock()
	defer r.mu.Unlock()
	_, known := r.sockets[user]
	if !known {
		r.sockets[user] = map[string]*wsOutbox{}
	}
	r.sockets[user][socket] = tx
	if !known {
		r.onlineLocked(user, true)
	}
}

func (r *CoachingRooms) remove(user, socket string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var bookings []string
	for booking, members := range r.calls {
		for _, m := range members {
			if m.socket == socket {
				bookings = append(bookings, booking)
				break
			}
		}
	}
	for _, booking := range bookings {
		r.leaveLocked(booking, socket, "lost")
	}
	if sockets, ok := r.sockets[user]; ok {
		delete(sockets, socket)
		if len(sockets) == 0 {
			delete(r.sockets, user)
			r.onlineLocked(user, false)
		}
	}
}

// join enters a session's call. The same account joining from another app takes its place there; whoever is already
// in learns that the other party arrived, and the newcomer whether someone waits, or else whether the other party
// (`other`) has the app open at all.
func (r *CoachingRooms) join(booking, user, name, other, socket string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.names[user] = name
	r.parties[booking] = [2]string{user, other}
	var replaced []string
	members := []coachingMember{}
	for _, m := range r.calls[booking] {
		if m.user == user {
			if m.socket != socket {
				replaced = append(replaced, m.socket)
			}
			continue
		}
		members = append(members, m)
	}
	members = append(members, coachingMember{user, socket})
	r.calls[booking] = members
	var others []coachingMember
	for _, m := range members {
		if m.user != user {
			others = append(others, m)
		}
	}
	for _, old := range replaced {
		r.sendLocked(user, old, M{"type": "ended", "booking": booking, "reason": "elsewhere"})
	}
	for _, m := range others {
		r.sendLocked(m.user, m.socket, M{"type": "peer", "booking": booking, "present": true})
	}
	_, online := r.sockets[other]
	r.sendLocked(user, socket, M{"type": "joined", "booking": booking, "peer": len(others) > 0, "online": online})
}

func (r *CoachingRooms) leave(booking, socket string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.leaveLocked(booking, socket, "left")
}

// relay passes an offer, answer or ICE candidate to the other party of the call.
func (r *CoachingRooms) relay(booking, socket string, data any) {
	r.mu.Lock()
	defer r.mu.Unlock()
	members := r.calls[booking]
	user, found := "", false
	for _, m := range members {
		if m.socket == socket {
			user, found = m.user, true
			break
		}
	}
	if !found {
		return
	}
	for _, m := range members {
		if m.user != user {
			r.sendLocked(m.user, m.socket, M{"type": "signal", "booking": booking, "data": data})
		}
	}
}

// ring tells the other party's apps that someone waits in the call, so they can offer to join.
func (r *CoachingRooms) ring(other, booking, from string) {
	r.notify(other, M{"type": "presence", "booking": booking, "user": from, "inCall": true})
}

// coachingCallable: whether the account may be in the session's call now: one of its two parties, the session not
// cancelled, from a quarter of an hour before it until half an hour after. Returns the other party.
func coachingCallable(state *AppState, booking, uid string) (string, error) {
	return dbCall(state.db, func(db *Conn) (string, error) {
		row, err := dbOne(db, "SELECT coach_id,student_id,starts_at,ends_at,status FROM coach_bookings WHERE id=?1 AND (coach_id=?2 OR student_id=?2)", booking, uid)
		if err != nil {
			return "", err
		}
		if row == nil {
			return "", apiErr(404, coachingUnknownBooking)
		}
		if !eqStr(row["status"], "booked") {
			return "", apiErr(409, "This session was cancelled.")
		}
		at := accountsNow()
		starts, _ := asInt(row["starts_at"])
		ends, _ := asInt(row["ends_at"])
		if at < starts-coachingEarly {
			return "", apiErr(409, "The call opens 15 minutes before the session.")
		}
		if at > ends+coachingLate {
			return "", apiErr(409, "This session is over.")
		}
		if eqStr(row["coach_id"], uid) {
			return str(row["student_id"]), nil
		}
		return str(row["coach_id"]), nil
	})
}

// onCoaching: the calls of an account's sessions: joining, leaving, and the offers, answers and ICE candidates relayed
// to the other party.
func (c *liveClient) onCoaching(body any) bool {
	if !c.coachingRate.take() {
		wsClose(c.conn, 1008, "Message rate limit exceeded")
		return false
	}
	state, kind := c.state, str(idx(body, "type"))
	booking, err := apiString(body, "booking", 1, 64)
	if err != nil {
		return true
	}
	if !c.member {
		if kind == "join" {
			c.tx.send(liveText("coaching", M{"type": "ended", "booking": booking, "reason": "Please sign in again."}))
		}
		return true
	}
	uid, username := c.uid(), str(c.user["username"])
	switch kind {
	case "join":
		other, err := coachingCallable(state, booking, uid)
		if err != nil {
			c.tx.send(liveText("coaching", M{"type": "ended", "booking": booking, "reason": toApiError(err).Message}))
		} else {
			state.coaching.join(booking, uid, username, other, c.id)
			state.coaching.ring(other, booking, username)
		}
	case "leave":
		state.coaching.leave(booking, c.id)
	case "signal":
		if data, ok := asObject(idx(body, "data")); ok {
			state.coaching.relay(booking, c.id, data)
		}
	}
	return true
}

// coachingZoneList: the time zones of jiff-tzdb 2026c, the database the server knew when written.
const coachingZoneList = `
Africa/Abidjan Africa/Accra Africa/Addis_Ababa Africa/Algiers Africa/Asmara Africa/Asmera Africa/Bamako
Africa/Bangui Africa/Banjul Africa/Bissau Africa/Blantyre Africa/Brazzaville Africa/Bujumbura Africa/Cairo
Africa/Casablanca Africa/Ceuta Africa/Conakry Africa/Dakar Africa/Dar_es_Salaam Africa/Djibouti Africa/Douala
Africa/El_Aaiun Africa/Freetown Africa/Gaborone Africa/Harare Africa/Johannesburg Africa/Juba Africa/Kampala
Africa/Khartoum Africa/Kigali Africa/Kinshasa Africa/Lagos Africa/Libreville Africa/Lome Africa/Luanda
Africa/Lubumbashi Africa/Lusaka Africa/Malabo Africa/Maputo Africa/Maseru Africa/Mbabane Africa/Mogadishu
Africa/Monrovia Africa/Nairobi Africa/Ndjamena Africa/Niamey Africa/Nouakchott Africa/Ouagadougou Africa/Porto-Novo
Africa/Sao_Tome Africa/Timbuktu Africa/Tripoli Africa/Tunis Africa/Windhoek America/Adak America/Anchorage
America/Anguilla America/Antigua America/Araguaina America/Argentina/Buenos_Aires America/Argentina/Catamarca
America/Argentina/ComodRivadavia America/Argentina/Cordoba America/Argentina/Jujuy America/Argentina/La_Rioja
America/Argentina/Mendoza America/Argentina/Rio_Gallegos America/Argentina/Salta America/Argentina/San_Juan
America/Argentina/San_Luis America/Argentina/Tucuman America/Argentina/Ushuaia America/Aruba America/Asuncion
America/Atikokan America/Atka America/Bahia America/Bahia_Banderas America/Barbados America/Belem America/Belize
America/Blanc-Sablon America/Boa_Vista America/Bogota America/Boise America/Buenos_Aires America/Cambridge_Bay
America/Campo_Grande America/Cancun America/Caracas America/Catamarca America/Cayenne America/Cayman
America/Chicago America/Chihuahua America/Ciudad_Juarez America/Coral_Harbour America/Cordoba America/Costa_Rica
America/Coyhaique America/Creston America/Cuiaba America/Curacao America/Danmarkshavn America/Dawson
America/Dawson_Creek America/Denver America/Detroit America/Dominica America/Edmonton America/Eirunepe
America/El_Salvador America/Ensenada America/Fort_Nelson America/Fort_Wayne America/Fortaleza America/Glace_Bay
America/Godthab America/Goose_Bay America/Grand_Turk America/Grenada America/Guadeloupe America/Guatemala
America/Guayaquil America/Guyana America/Halifax America/Havana America/Hermosillo America/Indiana/Indianapolis
America/Indiana/Knox America/Indiana/Marengo America/Indiana/Petersburg America/Indiana/Tell_City
America/Indiana/Vevay America/Indiana/Vincennes America/Indiana/Winamac America/Indianapolis America/Inuvik
America/Iqaluit America/Jamaica America/Jujuy America/Juneau America/Kentucky/Louisville
America/Kentucky/Monticello America/Knox_IN America/Kralendijk America/La_Paz America/Lima America/Los_Angeles
America/Louisville America/Lower_Princes America/Maceio America/Managua America/Manaus America/Marigot
America/Martinique America/Matamoros America/Mazatlan America/Mendoza America/Menominee America/Merida
America/Metlakatla America/Mexico_City America/Miquelon America/Moncton America/Monterrey America/Montevideo
America/Montreal America/Montserrat America/Nassau America/New_York America/Nipigon America/Nome America/Noronha
America/North_Dakota/Beulah America/North_Dakota/Center America/North_Dakota/New_Salem America/Nuuk America/Ojinaga
America/Panama America/Pangnirtung America/Paramaribo America/Phoenix America/Port-au-Prince America/Port_of_Spain
America/Porto_Acre America/Porto_Velho America/Puerto_Rico America/Punta_Arenas America/Rainy_River
America/Rankin_Inlet America/Recife America/Regina America/Resolute America/Rio_Branco America/Rosario
America/Santa_Isabel America/Santarem America/Santiago America/Santo_Domingo America/Sao_Paulo America/Scoresbysund
America/Shiprock America/Sitka America/St_Barthelemy America/St_Johns America/St_Kitts America/St_Lucia
America/St_Thomas America/St_Vincent America/Swift_Current America/Tegucigalpa America/Thule America/Thunder_Bay
America/Tijuana America/Toronto America/Tortola America/Vancouver America/Virgin America/Whitehorse
America/Winnipeg America/Yakutat America/Yellowknife Antarctica/Casey Antarctica/Davis Antarctica/DumontDUrville
Antarctica/Macquarie Antarctica/Mawson Antarctica/McMurdo Antarctica/Palmer Antarctica/Rothera
Antarctica/South_Pole Antarctica/Syowa Antarctica/Troll Antarctica/Vostok Arctic/Longyearbyen Asia/Aden Asia/Almaty
Asia/Amman Asia/Anadyr Asia/Aqtau Asia/Aqtobe Asia/Ashgabat Asia/Ashkhabad Asia/Atyrau Asia/Baghdad Asia/Bahrain
Asia/Baku Asia/Bangkok Asia/Barnaul Asia/Beirut Asia/Bishkek Asia/Brunei Asia/Calcutta Asia/Chita Asia/Choibalsan
Asia/Chongqing Asia/Chungking Asia/Colombo Asia/Dacca Asia/Damascus Asia/Dhaka Asia/Dili Asia/Dubai Asia/Dushanbe
Asia/Famagusta Asia/Gaza Asia/Harbin Asia/Hebron Asia/Ho_Chi_Minh Asia/Hong_Kong Asia/Hovd Asia/Irkutsk
Asia/Istanbul Asia/Jakarta Asia/Jayapura Asia/Jerusalem Asia/Kabul Asia/Kamchatka Asia/Karachi Asia/Kashgar
Asia/Kathmandu Asia/Katmandu Asia/Khandyga Asia/Kolkata Asia/Krasnoyarsk Asia/Kuala_Lumpur Asia/Kuching Asia/Kuwait
Asia/Macao Asia/Macau Asia/Magadan Asia/Makassar Asia/Manila Asia/Muscat Asia/Nicosia Asia/Novokuznetsk
Asia/Novosibirsk Asia/Omsk Asia/Oral Asia/Phnom_Penh Asia/Pontianak Asia/Pyongyang Asia/Qatar Asia/Qostanay
Asia/Qyzylorda Asia/Rangoon Asia/Riyadh Asia/Saigon Asia/Sakhalin Asia/Samarkand Asia/Seoul Asia/Shanghai
Asia/Singapore Asia/Srednekolymsk Asia/Taipei Asia/Tashkent Asia/Tbilisi Asia/Tehran Asia/Tel_Aviv Asia/Thimbu
Asia/Thimphu Asia/Tokyo Asia/Tomsk Asia/Ujung_Pandang Asia/Ulaanbaatar Asia/Ulan_Bator Asia/Urumqi Asia/Ust-Nera
Asia/Vientiane Asia/Vladivostok Asia/Yakutsk Asia/Yangon Asia/Yekaterinburg Asia/Yerevan Atlantic/Azores
Atlantic/Bermuda Atlantic/Canary Atlantic/Cape_Verde Atlantic/Faeroe Atlantic/Faroe Atlantic/Jan_Mayen
Atlantic/Madeira Atlantic/Reykjavik Atlantic/South_Georgia Atlantic/St_Helena Atlantic/Stanley Australia/ACT
Australia/Adelaide Australia/Brisbane Australia/Broken_Hill Australia/Canberra Australia/Currie Australia/Darwin
Australia/Eucla Australia/Hobart Australia/LHI Australia/Lindeman Australia/Lord_Howe Australia/Melbourne
Australia/North Australia/NSW Australia/Perth Australia/Queensland Australia/South Australia/Sydney
Australia/Tasmania Australia/Victoria Australia/West Australia/Yancowinna Brazil/Acre Brazil/DeNoronha Brazil/East
Brazil/West Canada/Atlantic Canada/Central Canada/Eastern Canada/Mountain Canada/Newfoundland Canada/Pacific
Canada/Saskatchewan Canada/Yukon CET Chile/Continental Chile/EasterIsland CST6CDT Cuba EET Egypt Eire EST EST5EDT
Etc/GMT Etc/GMT+0 Etc/GMT+1 Etc/GMT+10 Etc/GMT+11 Etc/GMT+12 Etc/GMT+2 Etc/GMT+3 Etc/GMT+4 Etc/GMT+5 Etc/GMT+6
Etc/GMT+7 Etc/GMT+8 Etc/GMT+9 Etc/GMT-0 Etc/GMT-1 Etc/GMT-10 Etc/GMT-11 Etc/GMT-12 Etc/GMT-13 Etc/GMT-14 Etc/GMT-2
Etc/GMT-3 Etc/GMT-4 Etc/GMT-5 Etc/GMT-6 Etc/GMT-7 Etc/GMT-8 Etc/GMT-9 Etc/GMT0 Etc/Greenwich Etc/UCT Etc/Universal
Etc/UTC Etc/Zulu Europe/Amsterdam Europe/Andorra Europe/Astrakhan Europe/Athens Europe/Belfast Europe/Belgrade
Europe/Berlin Europe/Bratislava Europe/Brussels Europe/Bucharest Europe/Budapest Europe/Busingen Europe/Chisinau
Europe/Copenhagen Europe/Dublin Europe/Gibraltar Europe/Guernsey Europe/Helsinki Europe/Isle_of_Man Europe/Istanbul
Europe/Jersey Europe/Kaliningrad Europe/Kiev Europe/Kirov Europe/Kyiv Europe/Lisbon Europe/Ljubljana Europe/London
Europe/Luxembourg Europe/Madrid Europe/Malta Europe/Mariehamn Europe/Minsk Europe/Monaco Europe/Moscow
Europe/Nicosia Europe/Oslo Europe/Paris Europe/Podgorica Europe/Prague Europe/Riga Europe/Rome Europe/Samara
Europe/San_Marino Europe/Sarajevo Europe/Saratov Europe/Simferopol Europe/Skopje Europe/Sofia Europe/Stockholm
Europe/Tallinn Europe/Tirane Europe/Tiraspol Europe/Ulyanovsk Europe/Uzhgorod Europe/Vaduz Europe/Vatican
Europe/Vienna Europe/Vilnius Europe/Volgograd Europe/Warsaw Europe/Zagreb Europe/Zaporozhye Europe/Zurich Factory
GB GB-Eire GMT GMT+0 GMT-0 GMT0 Greenwich Hongkong HST Iceland Indian/Antananarivo Indian/Chagos Indian/Christmas
Indian/Cocos Indian/Comoro Indian/Kerguelen Indian/Mahe Indian/Maldives Indian/Mauritius Indian/Mayotte
Indian/Reunion Iran Israel Jamaica Japan Kwajalein Libya MET Mexico/BajaNorte Mexico/BajaSur Mexico/General MST
MST7MDT Navajo NZ NZ-CHAT Pacific/Apia Pacific/Auckland Pacific/Bougainville Pacific/Chatham Pacific/Chuuk
Pacific/Easter Pacific/Efate Pacific/Enderbury Pacific/Fakaofo Pacific/Fiji Pacific/Funafuti Pacific/Galapagos
Pacific/Gambier Pacific/Guadalcanal Pacific/Guam Pacific/Honolulu Pacific/Johnston Pacific/Kanton
Pacific/Kiritimati Pacific/Kosrae Pacific/Kwajalein Pacific/Majuro Pacific/Marquesas Pacific/Midway Pacific/Nauru
Pacific/Niue Pacific/Norfolk Pacific/Noumea Pacific/Pago_Pago Pacific/Palau Pacific/Pitcairn Pacific/Pohnpei
Pacific/Ponape Pacific/Port_Moresby Pacific/Rarotonga Pacific/Saipan Pacific/Samoa Pacific/Tahiti Pacific/Tarawa
Pacific/Tongatapu Pacific/Truk Pacific/Wake Pacific/Wallis Pacific/Yap Poland Portugal PRC PST8PDT ROC ROK
Singapore Turkey UCT Universal US/Alaska US/Aleutian US/Arizona US/Central US/East-Indiana US/Eastern US/Hawaii
US/Indiana-Starke US/Michigan US/Mountain US/Pacific US/Samoa UTC W-SU WET Zulu
`
