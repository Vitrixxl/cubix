//go:build seed

package main

// Development data for `cubix-api seed`, compiled only with `-tags seed` (compose.dev.yaml):
// accounts with a year of practice on several events, learned cases, coaches with bookings,
// reviews and messages, coach applications, duels and traffic for the administration.
// Only an empty database is seeded, so the development container runs it at every start.
// The random generator has a fixed seed: every reset gives the same data, dated from today.
// seedRng reproduces rand 0.8's StdRng (ChaCha12) and its distributions draw for draw, so the Go and Rust
// binaries seed the same data (only the UUIDs, drawn from the OS, differ).

// The C library's exp, log and cos, as Rust's f64 methods call them: Go's own differ in the last bit now and then,
// which moved a rounded solve time by a millisecond.

/*
#cgo LDFLAGS: -lm
#include <math.h>
*/
import "C"

import (
	"math"
	"math/bits"
	"slices"
	"strconv"
	"strings"
	"time"
)

// SeedSummary is seed::Summary.
type SeedSummary struct {
	users  int
	solves int64
}

// seedPassword: every seeded account signs in with this password.
const seedPassword = "cubix-dev-password"

// seedAdminToken: the administration token, pasted on /admin.
const seedAdminToken = "cbx_admin_dev"

const (
	seedHourMs   int64 = 3_600_000
	seedMinuteMs int64 = 60_000
)

// seedEvent: an event, its puzzle, solve mode and the time (ms) of an average regular player.
type seedEvent struct {
	id, puzzle, mode string
	typical, dnf     float64
}

var seedEvents = []seedEvent{
	{"333", "333", "standard", 16_000, 0.01},
	{"222", "222", "standard", 5_500, 0.015},
	{"444", "444", "standard", 58_000, 0.015},
	{"555", "555", "standard", 105_000, 0.015},
	{"666", "666", "standard", 190_000, 0.02},
	{"777", "777", "standard", 280_000, 0.02},
	{"333oh", "333", "one-handed", 28_000, 0.015},
	{"333bf", "333", "blindfolded", 110_000, 0.35},
	{"444bf", "444", "blindfolded", 420_000, 0.5},
	{"sq1", "sq1", "standard", 27_000, 0.02},
	{"pyram", "pyram", "standard", 7_000, 0.02},
	{"skewb", "skewb", "standard", 8_000, 0.02},
	{"minx", "minx", "standard", 95_000, 0.015},
}

func seedEventOf(id string) *seedEvent {
	for i := range seedEvents {
		if seedEvents[i].id == id {
			return &seedEvents[i]
		}
	}
	panic("seed event")
}

type seedWeight struct {
	id string
	w  float64
}

// seedPlayer: a seeded account. `skill` multiplies the typical times at the end of the period (0.5 is twice
// as fast); `practice` is the share of days the player solves; `events` are weighted.
type seedPlayer struct {
	id, name string
	joined   int64
	skill    float64
	practice float64
	events   []seedWeight
}

// ---- rand 0.8's StdRng ----

// seedRng is rand 0.8's StdRng: ChaCha12 keyed by `seed_from_u64` (PCG32), read as a stream of u32 words.
type seedRng struct {
	key     [8]uint32
	counter uint64
	buf     [16]uint32
	pos     int
}

func newSeedRng(state uint64) *seedRng {
	r := &seedRng{pos: 16}
	for i := range r.key {
		state = state*6364136223846793005 + 11634580027462260723
		xorshifted := uint32(((state >> 18) ^ state) >> 27)
		r.key[i] = bits.RotateLeft32(xorshifted, -int(state>>59))
	}
	return r
}

func (r *seedRng) block() {
	s := [16]uint32{0x61707865, 0x3320646e, 0x79622d32, 0x6b206574}
	copy(s[4:12], r.key[:])
	s[12], s[13] = uint32(r.counter), uint32(r.counter>>32)
	x := s
	qr := func(a, b, c, d int) {
		x[a] += x[b]
		x[d] = bits.RotateLeft32(x[d]^x[a], 16)
		x[c] += x[d]
		x[b] = bits.RotateLeft32(x[b]^x[c], 12)
		x[a] += x[b]
		x[d] = bits.RotateLeft32(x[d]^x[a], 8)
		x[c] += x[d]
		x[b] = bits.RotateLeft32(x[b]^x[c], 7)
	}
	for range 6 {
		qr(0, 4, 8, 12)
		qr(1, 5, 9, 13)
		qr(2, 6, 10, 14)
		qr(3, 7, 11, 15)
		qr(0, 5, 10, 15)
		qr(1, 6, 11, 12)
		qr(2, 7, 8, 13)
		qr(3, 4, 9, 14)
	}
	for i := range x {
		r.buf[i] = x[i] + s[i]
	}
	r.counter++
	r.pos = 0
}

func (r *seedRng) u32() uint32 {
	if r.pos >= 16 {
		r.block()
	}
	r.pos++
	return r.buf[r.pos-1]
}

func (r *seedRng) u64() uint64 {
	lo := uint64(r.u32())
	return uint64(r.u32())<<32 | lo
}

// rangeU64 is `gen_range(low..high)` on 64-bit integers (i64, usize): UniformInt::sample_single.
func (r *seedRng) rangeU64(low, high int64) int64 {
	n := uint64(high - low)
	zone := n<<bits.LeadingZeros64(n) - 1
	for {
		hi, lo := bits.Mul64(r.u64(), n)
		if lo <= zone {
			return low + int64(hi)
		}
	}
}

// rangeU32 is `gen_range(low..high)` on 32-bit integers (i32, u32): what an unsuffixed literal range infers.
func (r *seedRng) rangeU32(low, high int64) int64 {
	n := uint32(high - low)
	zone := n<<bits.LeadingZeros32(n) - 1
	for {
		m := uint64(r.u32()) * uint64(n)
		if uint32(m) <= zone {
			return low + int64(m>>32)
		}
	}
}

// rangeF64 is `gen_range(low..high)` on f64: UniformFloat::sample_single.
func (r *seedRng) rangeF64(low, high float64) float64 {
	scale := high - low
	for {
		value := math.Float64frombits(r.u64()>>12|1023<<52) - 1
		if res := value*scale + low; res < high {
			return res
		}
		// The rare case of rounding up to `high`: as rand, step the scale down.
		scale = math.Nextafter(scale, 0)
	}
}

// f64 is `rng.gen::<f64>()`: 53 random bits in [0, 1).
func (r *seedRng) f64() float64 {
	return float64(r.u64()>>11) * (1.0 / (1 << 53))
}

// bool is `rng.gen::<bool>()`: the sign of a u32.
func (r *seedRng) bool() bool {
	return int32(r.u32()) < 0
}

// chance is `gen_bool(p)`: Bernoulli, which draws nothing when p is 1.
func (r *seedRng) chance(p float64) bool {
	if p == 1 {
		return true
	}
	return r.u64() < uint64(p*(2.0*(1<<63)))
}

// index is rand's gen_index: `gen_range(0..n as u32)` (choose, shuffle).
func (r *seedRng) index(n int) int {
	return int(r.rangeU32(0, int64(n)))
}

// sample is rand::seq::index::sample for the small amounts the seed uses (Floyd's, fully shuffled).
func (r *seedRng) sample(length, amount int) []int {
	amount = min(amount, length)
	if amount > 11 {
		panic("seed sample: only Floyd's algorithm is ported")
	}
	indices := make([]int, 0, amount)
	for j := length - amount; j < length; j++ {
		t := int(r.rangeU32(0, int64(j)+1))
		if pos := slices.Index(indices, t); pos >= 0 {
			indices = slices.Insert(indices, pos, j)
			continue
		}
		indices = append(indices, t)
	}
	return indices
}

func seedShuffle[T any](r *seedRng, list []T) {
	for i := len(list) - 1; i >= 1; i-- {
		j := r.index(i + 1)
		list[i], list[j] = list[j], list[i]
	}
}

func seedChooseMultiple[T any](r *seedRng, list []T, amount int) []T {
	var out []T
	for _, i := range r.sample(len(list), amount) {
		out = append(out, list[i])
	}
	return out
}

// ---- the accounts ----

// seedRun seeds an empty database; nil when it already holds accounts.
func seedRun(db *Conn, catalog *Catalog) (*SeedSummary, error) {
	count, err := dbOne(db, "SELECT count(*) n FROM users")
	if err != nil {
		return nil, err
	}
	if n, _ := asInt(count["n"]); n > 0 {
		return nil, nil
	}
	hash := apiHashPassword(seedPassword)
	rng := newSeedRng(2026)
	at := accountsNow()
	players := seedPlayers(rng, at)
	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	for _, p := range players {
		if _, err := db.Exec("INSERT INTO users(id,username,password_hash,created_at,last_seen_at) VALUES(?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ',?/1000.0,'unixepoch'),?)",
			p.id, p.name, hash, p.joined, at-rng.rangeU64(0, 3*accountsDayMs)); err != nil {
			return nil, err
		}
	}
	for _, p := range players {
		if err := seedPractice(db, rng, catalog, p, at); err != nil {
			return nil, err
		}
	}
	for _, p := range players {
		if p.name == "dev" {
			if err := seedSmartSolves(db, rng, catalog, p); err != nil {
				return nil, err
			}
		}
	}
	if err := seedCoachingData(db, rng, players, at); err != nil {
		return nil, err
	}
	if err := seedDuels(db, rng, players, at); err != nil {
		return nil, err
	}
	if err := seedTraffic(db, rng, players, at); err != nil {
		return nil, err
	}
	if _, err := db.Exec("INSERT INTO admin_access(id,digest,version,created_at) VALUES(1,?,'dev',?)", accountsDigest(seedAdminToken), at); err != nil {
		return nil, err
	}
	row, err := dbOne(db, "SELECT count(*) n FROM solves")
	if err != nil {
		return nil, err
	}
	solves, _ := asInt(row["n"])
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &SeedSummary{users: len(players), solves: solves}, nil
}

var seedNames = []string{
	"alex_cubes", "ben_tps", "chloe_f2l", "dario_oh", "emma_pll", "felix_roux", "gaia_zz", "hugo_sub10",
	"ines_bld", "jules_lookahead", "kenji_cfop", "lea_skewb", "malo_megaminx", "nora_pyra", "oscar_ao5",
	"paula_sq1", "quentin_4x4", "rosa_cross", "sami_ortega", "tess_cll", "ugo_yau", "vera_zbll", "will_2gen",
	"xena_colorneutral", "yann_slowturn", "zoe_newbie", "arthur_rubik", "bea_timer", "cyril_ao100",
	"dina_lsll", "eliott_cube", "fanny_tracking", "gabin_wca", "hana_pb", "ivan_fingertricks",
}

// seedCoach: a coach, its name, skill, events taught, languages, price in cents, headline.
type seedCoach struct {
	name      string
	skill     float64
	events    []string
	languages []string
	price     int64
	headline  string
}

var seedCoaches = []seedCoach{
	{"coach", 0.45, []string{"333", "333oh", "222"}, []string{"French", "English"}, 2500, "Sub-8 CFOP, I fix your F2L look-ahead"},
	{"lena_speed", 0.4, []string{"333", "444", "555"}, []string{"English", "German"}, 4000, "Big cubes and reduction, from sub-1 to sub-40"},
	{"tom_onehand", 0.55, []string{"333oh"}, []string{"English"}, 2000, "One-handed specialist, 12 years of OH"},
	{"yuki_blind", 0.6, []string{"333bf", "444bf"}, []string{"English", "Japanese"}, 3500, "Blindfolded: memo, M2/OP to 3-style"},
	{"marco_minx", 0.5, []string{"minx", "pyram", "skewb"}, []string{"Italian", "English"}, 1500, "Megaminx and the small puzzles"},
	{"sofia_sq1", 0.55, []string{"sq1"}, []string{"Spanish", "English"}, 0, "Free Square-1 lessons for beginners"},
}

func seedPlayers(rng *seedRng, at int64) []*seedPlayer {
	list := []*seedPlayer{{
		id:       newUUID(),
		name:     "dev",
		joined:   at - 400*accountsDayMs,
		skill:    0.7,
		practice: 0.7,
		events:   []seedWeight{{"333", 10}, {"222", 2.5}, {"333oh", 1.5}, {"444", 1.2}, {"pyram", 1.5}, {"skewb", 1}, {"555", 0.5}, {"minx", 0.3}, {"333bf", 0.4}},
	}}
	for _, c := range seedCoaches {
		var events []seedWeight
		for _, e := range c.events {
			events = append(events, seedWeight{seedEventOf(e).id, 3})
		}
		if !slices.Contains(c.events, "333") {
			events = append(events, seedWeight{"333", 2})
		}
		joined := at - rng.rangeU64(250, 500)*accountsDayMs
		list = append(list, &seedPlayer{id: newUUID(), name: c.name, joined: joined, skill: c.skill, practice: rng.rangeF64(0.2, 0.4), events: events})
	}
	for _, name := range seedNames {
		events := []seedWeight{{"333", rng.rangeF64(3, 10)}}
		for _, e := range seedEvents[1:] {
			if rng.chance(0.3) {
				events = append(events, seedWeight{e.id, rng.rangeF64(0.3, 3)})
			}
		}
		joined := at - rng.rangeU64(5, 380)*accountsDayMs
		skill := rng.rangeF64(0.55, 2.2)
		list = append(list, &seedPlayer{id: newUUID(), name: name, joined: joined, skill: skill, practice: rng.rangeF64(0.03, 0.35), events: events})
	}
	return list
}

// seedNormal: a standard normal draw (Box-Muller).
func seedNormal(rng *seedRng) float64 {
	u := rng.rangeF64(2.220446049250313e-16, 1) // f64::EPSILON..1
	v := rng.f64()
	return math.Sqrt(-2*float64(C.log(C.double(u)))) * float64(C.cos(C.double(2*math.Pi*v)))
}

func seedTime(rng *seedRng, mean float64) float64 {
	// Mostly near the mean, with a long tail of bad solves.
	spread := 0.11
	if rng.chance(0.05) {
		spread = 0.35
	}
	return math.Round(math.Max(mean*float64(C.exp(C.double(spread*seedNormal(rng)))), mean*0.6))
}

func seedPenalty(rng *seedRng, dnf float64) string {
	roll := rng.f64()
	switch {
	case roll < dnf:
		return "dnf"
	case roll < dnf+0.025:
		return "+2"
	}
	return "none"
}

// seedScramble: a random-move scramble in the puzzle's notation; none for Square-1, whose random moves are
// not all legal.
func seedScramble(rng *seedRng, puzzle string) *string {
	suffix := func() string { return []string{"", "'", "2"}[rng.rangeU64(0, 3)] }
	cube := func(faces, wide []string, length int) string {
		var moves []string
		last := -1
		for len(moves) < length {
			pick := int(rng.rangeU64(0, int64(len(faces)+len(wide))))
			name := ""
			if pick < len(faces) {
				name = faces[pick]
			} else {
				name = wide[pick-len(faces)]
			}
			// Never two turns in a row on the same axis.
			axis := 2
			switch name[strings.IndexFunc(name, func(c rune) bool { return c >= 'A' && c <= 'Z' })] {
			case 'R', 'L':
				axis = 0
			case 'U', 'D':
				axis = 1
			}
			if axis == last {
				continue
			}
			last = axis
			moves = append(moves, name+suffix())
		}
		return strings.Join(moves, " ")
	}
	faces := []string{"R", "L", "U", "D", "F", "B"}
	wide := []string{"Rw", "Lw", "Uw", "Dw", "Fw", "Bw"}
	var text string
	switch puzzle {
	case "222":
		text = cube([]string{"R", "U", "F"}, nil, 10)
	case "333":
		text = cube(faces, nil, 20)
	case "444":
		text = cube(faces, wide, 44)
	case "555":
		text = cube(faces, wide, 60)
	case "666":
		text = cube(faces, append(slices.Clone(wide), "3Rw", "3Uw", "3Fw"), 80)
	case "777":
		text = cube(faces, append(slices.Clone(wide), "3Rw", "3Lw", "3Uw", "3Dw", "3Fw", "3Bw"), 100)
	case "pyram", "skewb":
		length := 9
		if puzzle == "pyram" {
			length = 10
		}
		text = strings.ReplaceAll(cube([]string{"R", "L", "U", "B"}, nil, length), "2", "")
		if puzzle == "pyram" {
			for _, tip := range []string{"u", "l", "r", "b"} {
				switch rng.rangeU32(0, 3) {
				case 0:
				case 1:
					text += " " + tip
				default:
					text += " " + tip + "'"
				}
			}
		}
	case "minx":
		lines := make([]string, 0, 7)
		for range 7 {
			line := make([]string, 0, 11)
			for i := range 10 {
				face, turn := "R", "--"
				if i%2 != 0 {
					face = "D"
				}
				if rng.bool() {
					turn = "++"
				}
				line = append(line, face+turn)
			}
			if rng.bool() {
				line = append(line, "U")
			} else {
				line = append(line, "U'")
			}
			lines = append(lines, strings.Join(line, " "))
		}
		text = strings.Join(lines, " ")
	default:
		return nil
	}
	return &text
}

// seedCubeSize: the size of a cube puzzle ("333" is 3), none for the others.
func seedCubeSize(puzzle string) any {
	if puzzle[0] >= '0' && puzzle[0] <= '9' {
		return int64(puzzle[0] - '0')
	}
	return nil
}

// seedSession: a session of solves on one practice context, then its solves.
func seedSession(db *Conn, player *seedPlayer, puzzle, mode, kind string, training bool, cases []string, at int64) (int64, error) {
	sessionMode := "playground"
	if training {
		sessionMode = "training"
	}
	if cases == nil {
		cases = []string{}
	}
	if _, err := db.Exec(`INSERT INTO sessions(mode,case_ids,user_id,cube_size,puzzle_id,solve_mode,scramble_type,created_at)
         VALUES(?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ',?/1000.0,'unixepoch'))`,
		sessionMode, encodeJSON(cases), player.id, seedCubeSize(puzzle), puzzle, mode, kind, at); err != nil {
		return 0, err
	}
	return db.LastInsertRowid(), nil
}

func seedSolve(db *Conn, player *seedPlayer, session int64, puzzle, mode, kind string, caseID *string, ms float64, penalty string, scramble *string, comment *string, at int64) error {
	_, err := db.Exec(`INSERT INTO solves(session_id,case_id,time_ms,penalty,scramble,comment,user_id,cube_size,puzzle_id,solve_mode,scramble_type,created_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ',?/1000.0,'unixepoch'))`,
		session, caseID, ms, penalty, scramble, comment, player.id, seedCubeSize(puzzle), puzzle, mode, kind, at)
	return err
}

var seedComments = []string{
	"PLL skip!", "Lockup on the U perm", "Easy cross, bad F2L", "New PB, finally", "Popped on the last move",
	"Forgot the OLL", "Xcross", "Full step", "Misread the case", "Felt slow but it's fine",
}

// seedPractice: the account's profile, its learned cases and group orders, and a year of solves: sessions on
// the days it practised, times improving from twice its final level, and drills on cases.
func seedPractice(db *Conn, rng *seedRng, catalog *Catalog, p *seedPlayer, at int64) error {
	var known []string
	for _, e := range p.events {
		if puzzle := seedEventOf(e.id).puzzle; !slices.Contains(known, puzzle) {
			known = append(known, puzzle)
		}
	}
	catalogMethods, err := decodeJSON(methodIDsJSON)
	if err != nil {
		return err
	}
	// knownMethods keeps the order of the puzzles, as serde_json's preserve_order map.
	var methods []string
	for _, puzzle := range known {
		list, _ := asArray(idx(catalogMethods, puzzle))
		// The most advanced method for fast players, the first one otherwise.
		index := 0
		if p.skill < 1 {
			index = min(1, max(len(list)-1, 0))
		}
		if index < len(list) {
			methods = append(methods, encodeJSON(puzzle)+":"+encodeJSON([]any{list[index]}))
		}
	}
	completedAt := time.UnixMilli(p.joined).UTC().Format("2006-01-02T15:04:05.000Z")
	profile := `{"kind":"profile","knownPuzzles":` + encodeJSON(known) + `,"knownMethods":{` + strings.Join(methods, ",") +
		`},"priority":null,"completedAt":` + encodeJSON(completedAt) + `}`
	if _, err := db.Exec("INSERT INTO personal_entries(user_id,key,value) VALUES(?,'profile',?)", p.id, profile); err != nil {
		return err
	}

	// Cases: fast players know all of PLL and most of OLL and F2L; slow ones a few 2-look cases.
	var learned []string
	share := func(set string) float64 {
		s := p.skill
		switch {
		case (set == "pll" || set == "2look-oll" || set == "2look-pll") && s < 1.2:
			return 1
		case (set == "f2l" || set == "oll") && s < 0.8:
			return 0.9
		case set == "f2l" && s < 1.3:
			return 0.5
		case set == "oll" && s < 1.1:
			return 0.35
		case (set == "zbll-t" || set == "zbll-u" || set == "f2l-advanced") && s < 0.6:
			return 0.4
		case set == "2look-oll" || set == "2look-pll":
			return 0.6
		}
		return 0
	}
	for _, c := range catalog.cases {
		if idx(c, "puzzle_id") == nil && rng.chance(share(str(idx(c, "set")))) {
			learned = append(learned, str(idx(c, "id")))
		}
	}
	for _, id := range learned {
		if _, err := db.Exec("INSERT INTO learned_cases(user_id,case_id,learned) VALUES(?,?,1)", p.id, id); err != nil {
			return err
		}
	}
	if p.skill < 1 {
		for _, track := range []string{"F2L", "OLL", "PLL"} {
			set := strings.ToLower(track)
			groups := []string{}
			for _, c := range catalog.cases {
				group := str(idx(c, "group"))
				if eqStr(idx(c, "set"), set) && !slices.Contains(groups, group) {
					groups = append(groups, group)
				}
			}
			seedShuffle(rng, groups)
			if _, err := db.Exec("INSERT INTO learning_group_orders(user_id,track,groups) VALUES(?,?,?)", p.id, track, encodeJSON(groups)); err != nil {
				return err
			}
		}
	}

	total := 0.0
	for _, e := range p.events {
		total += e.w
	}
	span := float64(at - p.joined)
	for day := p.joined / accountsDayMs * accountsDayMs; day < at; day += accountsDayMs {
		// The main account keeps a streak going: it practised every day of the last two weeks.
		if !((p.name == "dev" && at-day < 14*accountsDayMs) || rng.chance(p.practice)) {
			continue
		}
		// An evening session (or a lunch break), on one or two events.
		clock := day + rng.rangeU64(7, 20)*seedHourMs
		clock += rng.rangeU64(0, 60) * seedMinuteMs
		for range rng.rangeU32(1, 3) {
			pick := rng.rangeF64(0, total)
			id := "333"
			for _, e := range p.events {
				pick -= e.w
				if pick < 0 {
					id = e.id
					break
				}
			}
			e := seedEventOf(id)
			// Improvement: twice slower at sign-up, reaching `skill` by today.
			progress := math.Min(math.Max(float64(day-p.joined)/math.Max(span, 1), 0), 1)
			mean := e.typical * p.skill * (1 + 0.9*float64(C.exp(C.double(-3*progress))))
			kind := "normal"
			if e.puzzle == "333" && e.mode == "standard" && rng.chance(0.08) {
				kind = []string{"2gen-ru", "f2l", "last-layer", "xcross-6"}[rng.rangeU64(0, 4)]
			}
			// About 5 to 30 solves; more on quick events, fewer on long ones.
			count := int(math.Max(math.Round(rng.rangeF64(5, 30)*math.Min(math.Max(15_000/mean, 0.25), 1.3)), 3))
			if clock >= at {
				break
			}
			sid, err := seedSession(db, p, e.puzzle, e.mode, kind, false, nil, clock)
			if err != nil {
				return err
			}
			for range count {
				target := mean
				if kind != "normal" {
					target = mean * 0.5
				}
				ms := seedTime(rng, target)
				var comment *string
				if rng.chance(0.01) {
					comment = &seedComments[rng.index(len(seedComments))]
				}
				if clock >= at {
					break
				}
				penalty := seedPenalty(rng, e.dnf)
				if err := seedSolve(db, p, sid, e.puzzle, e.mode, kind, nil, ms, penalty, seedScramble(rng, e.puzzle), comment, clock); err != nil {
					return err
				}
				clock += int64(ms) + rng.rangeU64(8_000, 25_000)
			}
		}
		// Drills on known cases, now and then.
		if len(learned) > 0 && rng.chance(0.25) && clock < at {
			n := min(int(rng.rangeU64(3, 12)), len(learned))
			picked := seedChooseMultiple(rng, learned, n)
			sid, err := seedSession(db, p, "333", "standard", "case", true, picked, clock)
			if err != nil {
				return err
			}
			for range rng.rangeU32(10, 40) {
				id := picked[rng.index(len(picked))]
				var setup *string
				if s, ok := asStr(idx(catalog.byID[id], "setup")); ok {
					setup = &s
				}
				base := 1_700.0
				if strings.HasPrefix(id, "F2L") {
					base = 2_200
				}
				if clock >= at {
					break
				}
				ms := seedTime(rng, base*math.Max(p.skill, 0.5))
				if err := seedSolve(db, p, sid, "333", "standard", "case", &id, ms, seedPenalty(rng, 0.01), setup, nil, clock); err != nil {
					return err
				}
				clock += rng.rangeU64(4_000, 9_000)
			}
		}
	}
	return nil
}

// seedInverse: a turn undone: R for R', R' for R, R2 for R2.
func seedInverse(turn string) string {
	switch {
	case len(turn) == 2 && turn[1] == '\'':
		return turn[:1]
	case len(turn) == 1:
		return turn + "'"
	case len(turn) >= 2 && turn[1] == '2':
		return turn[:1] + "2"
	}
	panic("face turn")
}

// seedSetups: the face-turn setups of a catalogue case (from the solved cube), tokens normalised.
func seedSetups(c any) [][]string {
	algs := []any{idx(c, "setup")}
	if alt, ok := asArray(idx(c, "setups_alt")); ok {
		algs = append(algs, alt...)
	}
	var out [][]string
	for _, alg := range algs {
		text, ok := asStr(alg)
		if !ok {
			continue
		}
		var turns []string
		faceTurns := true
		for _, t := range strings.Fields(text) {
			t = strings.ReplaceAll(t, "2'", "2")
			faceTurns = faceTurns && strings.ContainsRune("UDFBRL", rune(t[0])) && (len(t) == 1 || len(t) == 2 && (t[1] == '\'' || t[1] == '2'))
			turns = append(turns, t)
		}
		if faceTurns {
			out = append(out, turns)
		}
	}
	return out
}

// seedSmartSolves: the 3×3 timer solves of the last weeks turned on a smart cube, for the analysis: each one a cross,
// four F2L pairs, an OLL and a PLL from the catalogue, timed with a pause to recognise each step.
// The solution is built first and the scramble is its inverse, so no solver is needed.
func seedSmartSolves(db *Conn, rng *seedRng, catalog *Catalog, p *seedPlayer) error {
	pick := func(set string) [][][]string {
		var out [][][]string
		for _, c := range catalog.cases {
			if eqStr(idx(c, "set"), set) {
				if s := seedSetups(c); len(s) > 0 {
					out = append(out, s)
				}
			}
		}
		return out
	}
	f2l, oll, pll := pick("f2l"), pick("oll"), pick("pll")
	choose := func(set [][][]string) []string {
		cases := set[rng.index(len(set))]
		return cases[rng.index(len(cases))]
	}
	rows, err := dbAll(db, "SELECT id FROM solves WHERE user_id=? AND puzzle_id='333' AND solve_mode='standard' AND scramble_type='normal' AND case_id IS NULL ORDER BY created_at DESC LIMIT 150", p.id)
	if err != nil {
		return err
	}
	for _, row := range rows {
		id, ok := asInt(row["id"])
		if !ok {
			continue
		}
		// The steps as the solver holds the cube (yellow on top, the cross below); undone, each F2L,
		// OLL and PLL case keeps the cross and the other pairs, so each step solves exactly its part.
		var steps [][]string
		var cross []string
		for int64(len(cross)) < rng.rangeU64(6, 9) {
			face := []string{"U", "D", "F", "B", "R", "L"}[rng.rangeU64(0, 6)]
			if len(cross) == 0 || !strings.HasPrefix(cross[len(cross)-1], face) {
				cross = append(cross, face+[]string{"", "'", "2"}[rng.rangeU64(0, 3)])
			}
		}
		steps = append(steps, cross)
		slots := []int{0, 1, 2, 3}
		seedShuffle(rng, slots)
		for _, slot := range slots {
			// The front-right pair's setup turned to another slot: R→F→L→B→R once per slot.
			setup := choose(f2l)
			step := make([]string, 0, len(setup))
			for i := len(setup) - 1; i >= 0; i-- {
				face := setup[i][:1]
				for range slot {
					if next, ok := map[string]string{"R": "F", "F": "L", "L": "B", "B": "R"}[face]; ok {
						face = next
					}
				}
				step = append(step, seedInverse(face+setup[i][1:]))
			}
			steps = append(steps, step)
		}
		for _, set := range [][][][]string{oll, pll} {
			alg := choose(set)
			step := make([]string, 0, len(alg))
			for i := len(alg) - 1; i >= 0; i-- {
				step = append(step, seedInverse(alg[i]))
			}
			steps = append(steps, step)
		}
		// Recognition then execution, at a pace close to the player's.
		clock := 0.0
		var solution, scramble []string
		for i, step := range steps {
			if i > 0 {
				pause := 700.0
				if i < 5 {
					pause = 450
				}
				clock += seedTime(rng, pause)
			}
			for _, turn := range step {
				// Recorded held white on top and green in front: up and down, right and left swap.
				face := turn[:1]
				if swapped, ok := map[string]string{"U": "D", "D": "U", "R": "L", "L": "R"}[face]; ok {
					face = swapped
				}
				solution = append(solution, face+turn[1:]+"@"+strconv.FormatInt(int64(clock), 10))
				scramble = append(scramble, seedInverse(face+turn[1:]))
				clock += seedTime(rng, 140)
			}
		}
		slices.Reverse(scramble)
		if _, err := db.Exec("UPDATE solves SET scramble=?, solution=?, time_ms=?, penalty='none' WHERE id=?", strings.Join(scramble, " "), strings.Join(solution, " "), int64(clock), id); err != nil {
			return err
		}
	}
	return nil
}

// ---- coaching ----

// seedCoachingData: coaches with their profile and week, applications in every state, past sessions (most of them
// reviewed), upcoming ones on free slots, one cancelled, and conversations with unread messages.
func seedCoachingData(db *Conn, rng *seedRng, players []*seedPlayer, at int64) error {
	byName := func(name string) *seedPlayer {
		for _, p := range players {
			if p.name == name {
				return p
			}
		}
		panic("seed account")
	}
	var students []*seedPlayer
	for _, p := range players {
		if !slices.ContainsFunc(seedCoaches, func(c seedCoach) bool { return c.name == p.name }) {
			students = append(students, p)
		}
	}
	zones := []string{"Europe/Paris", "Europe/Berlin", "America/New_York", "Asia/Tokyo", "Europe/Rome", "Europe/Madrid"}
	type window struct {
		Weekday int64 `json:"weekday"`
		Start   int64 `json:"start"`
		End     int64 `json:"end"`
	}
	for i, c := range seedCoaches {
		coach := byName(c.name)
		created := at - rng.rangeU64(60, 200)*accountsDayMs
		if _, err := db.Exec("INSERT INTO coach_applications(user_id,email,events,experience,message,status,created_at,decided_at) VALUES(?,?,?,?,?,'approved',?,?)",
			coach.id, c.name+"@example.com", encodeJSON(c.events), "Competing since 2015, several national podiums.",
			"I would love to help players get past their plateau.", created-3*accountsDayMs, created); err != nil {
			return err
		}
		// Weekday evenings and Saturday mornings, in the coach's time zone (minutes of the day).
		var windows []window
		for d := range 5 {
			if (d+i)%3 != 2 {
				windows = append(windows, window{int64(d), int64(17*60 + 30*(i%3)), 21 * 60})
			}
		}
		windows = append(windows, window{5, 9 * 60, 12 * 60})
		accepting := int64(0)
		if i != 4 {
			accepting = 1
		}
		if _, err := db.Exec(`INSERT INTO coaches(user_id,active,accepting,headline,bio,events,languages,price_cents,session_minutes,timezone,windows,days_off,created_at)
             VALUES(?,1,?,?,?,?,?,?,?,?,?,'[]',?)`,
			coach.id, accepting, c.headline,
			"Hi, I'm "+c.name+"! I have coached dozens of players, from their first solve to their first competition.\n\nEach session starts with a few solves on camera, then we work on one thing at a time, with drills you keep after the call.",
			encodeJSON(c.events), encodeJSON(c.languages), c.price, []int64{60, 45, 60, 90, 30, 60}[i], zones[i], encodeJSON(windows), created); err != nil {
			return err
		}
	}
	// Applications still waiting for the administration, and one refused.
	for _, a := range [][2]string{{"chloe_f2l", "pending"}, {"kenji_cfop", "pending"}, {"vera_zbll", "pending"}, {"yann_slowturn", "rejected"}} {
		name, status := a[0], a[1]
		p := byName(name)
		created := at - rng.rangeU64(1, 20)*accountsDayMs
		var decided any
		if status != "pending" {
			decided = created + accountsDayMs
		}
		if _, err := db.Exec("INSERT INTO coach_applications(user_id,email,events,experience,message,status,created_at,decided_at) VALUES(?,?,?,?,?,?,?,?)",
			p.id, name+"@example.com", encodeJSON([]string{"333", "222"}), "Sub-12 average, I teach at my local club.",
			"I'd like to coach beginners on CFOP and F2L intuition.", status, created, decided); err != nil {
			return err
		}
	}

	dev := byName("dev")
	reviews := []struct {
		rating  int64
		comment string
	}{
		{5, "Super clear, my F2L is way smoother after two sessions."},
		{5, "Great drills, I finally broke sub-15!"},
		{4, "Very helpful, a bit short on time at the end."},
		{5, ""},
		{3, "Good tips but the call quality was poor."},
		{4, "Learned a lot about look-ahead."},
	}
	for i, c := range seedCoaches {
		coach := byName(c.name)
		row, err := dbRequired(db, "SELECT * FROM coaches WHERE user_id=?", "Unknown coach", coach.id)
		if err != nil {
			return err
		}
		minutes, ok := asInt(row["session_minutes"])
		if !ok {
			minutes = 60
		}
		price, _ := asInt(row["price_cents"])
		var pupils []*seedPlayer
		if i < 2 {
			pupils = append(pupils, dev)
		}
		for _, p := range seedChooseMultiple(rng, students, 4+i%3) {
			if p.id != dev.id {
				pupils = append(pupils, p)
			}
		}
		var upcoming [][2]int64
		if eqInt(row["accepting"], 1) {
			upcoming = coachingFreeSlots(row, nil, at, 28)
		}
		seedShuffle(rng, upcoming)
		for n, pupil := range pupils {
			var conversation *int64
			// Past sessions, at round hours.
			for k := range rng.rangeU32(1, 5) {
				start := (at - rng.rangeU64(2, 120)*accountsDayMs) / seedHourMs * seedHourMs
				id, err := seedBooking(db, coach, pupil, start, start+minutes*seedMinuteMs, price, "booked", start-5*accountsDayMs)
				if err != nil {
					return err
				}
				if k < 3 && rng.chance(0.75) {
					review := reviews[rng.rangeU64(0, int64(len(reviews)))]
					if _, err := db.Exec("INSERT INTO coach_reviews(booking_id,coach_id,student_id,rating,comment,created_at) VALUES(?,?,?,?,?,?)",
						id, coach.id, pupil.id, review.rating, review.comment, start+minutes*seedMinuteMs+seedHourMs); err != nil {
						return err
					}
				}
				if conversation == nil {
					since := start - 5*accountsDayMs
					conversation = &since
				}
			}
			// Upcoming sessions on the coach's free slots; the third pupil cancelled one.
			count := int64(2)
			if pupil.id != dev.id {
				count = rng.rangeU32(0, 2)
			}
			for k := range count {
				if len(upcoming) == 0 {
					break
				}
				slot := upcoming[len(upcoming)-1]
				upcoming = upcoming[:len(upcoming)-1]
				cancelled := n == 2 && k == 0
				status := "booked"
				if cancelled {
					status = "cancelled"
				}
				id, err := seedBooking(db, coach, pupil, slot[0], slot[1], price, status, at-rng.rangeU64(1, 6)*accountsDayMs)
				if err != nil {
					return err
				}
				if cancelled {
					if _, err := db.Exec("UPDATE coach_bookings SET cancelled_at=?,cancelled_by=? WHERE id=?", at-seedHourMs, pupil.id, id); err != nil {
						return err
					}
				}
			}
			if conversation != nil {
				if err := seedChat(db, rng, coach, pupil, *conversation, at); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func seedBooking(db *Conn, coach, student *seedPlayer, start, end, price int64, status string, created int64) (string, error) {
	id := newUUID()
	notes := []string{"", "I'd like to work on my cross.", "Can we look at my OLL recognition?", "Preparing my first competition!"}
	_, err := db.Exec("INSERT INTO coach_bookings(id,coach_id,student_id,starts_at,ends_at,status,note,price_cents,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
		id, coach.id, student.id, start, end, status, notes[start/seedHourMs%4], price, created)
	return id, err
}

// seedChat: a conversation between a coach and a student, the last messages unread by their recipient.
func seedChat(db *Conn, rng *seedRng, coach, student *seedPlayer, since, at int64) error {
	lines := []struct {
		fromCoach bool
		body      string
	}{
		{false, "Hi! I just booked a session, looking forward to it."},
		{true, "Hi, welcome! Could you send me a video of a few solves before we start?"},
		{false, "Sure, I'll record an ao5 tonight."},
		{true, "Thanks. Your cross is good, but you pause a lot before the first pair."},
		{false, "Yes, I never know which pair to start with."},
		{true, "We'll work on that: plan the cross and the first pair during inspection."},
		{false, "Great session today, thank you!"},
		{true, "You're welcome. Do the inspection drill 15 minutes a day and tell me how it goes."},
		{false, "Done for a week, my average went down by a second!"},
		{true, "Excellent! Next time we'll look at your last layer."},
	}
	if _, err := db.Exec("INSERT INTO coach_conversations(coach_id,student_id,note,updated_at) VALUES(?,?,?,?)",
		coach.id, student.id, "Good cross, slow first pair. Working on inspection planning.", at); err != nil {
		return err
	}
	conversation := db.LastInsertRowid()
	count := int(rng.rangeU64(3, int64(len(lines))+1))
	step := (at - since) / int64(count+1)
	for k, line := range lines[:count] {
		sent := since + step*int64(k+1)
		var read any
		if k+2 < count {
			read = sent + 10*seedMinuteMs
		}
		sender := student.id
		if line.fromCoach {
			sender = coach.id
		}
		if _, err := db.Exec("INSERT INTO coach_messages(conversation_id,sender_id,body,created_at,read_at) VALUES(?,?,?,?,?)",
			conversation, sender, line.body, sent, read); err != nil {
			return err
		}
	}
	return nil
}

// ---- duels and traffic ----

// seedFloat writes an f64 as serde_json does: an integral value keeps its ".0".
func seedFloat(v float64) string {
	s := strconv.FormatFloat(v, 'f', -1, 64)
	if !strings.ContainsAny(s, ".eE") {
		s += ".0"
	}
	return s
}

// seedDuels: finished duels over the last two months, for the administration.
func seedDuels(db *Conn, rng *seedRng, players []*seedPlayer, at int64) error {
	for game := range 400 {
		var pair []*seedPlayer
		if game%4 == 0 {
			rest := players[1:]
			pair = []*seedPlayer{players[0], rest[rng.index(len(rest))]}
		} else {
			pair = seedChooseMultiple(rng, players, 2)
		}
		e := seedEventOf([]string{"333", "333", "333", "222", "pyram", "skewb", "333oh", "444"}[rng.rangeU64(0, 8)])
		var results [2]string
		var ao5 [2]*float64
		for s, p := range pair {
			var effective []*float64
			var items []string
			for range 5 {
				ms := seedTime(rng, e.typical*p.skill)
				penalty := seedPenalty(rng, e.dnf)
				effective = append(effective, statsEffectiveMs(ms, penalty))
				items = append(items, `{"ms":`+seedFloat(ms)+`,"penalty":`+encodeJSON(penalty)+`}`)
			}
			results[s] = "[" + strings.Join(items, ",") + "]"
			ao5[s] = statsAverage(effective)
		}
		var winner any
		switch {
		case ao5[0] != nil && ao5[1] != nil:
			if *ao5[0] <= *ao5[1] {
				winner = int64(0)
			} else {
				winner = int64(1)
			}
		case ao5[0] != nil:
			winner = int64(0)
		case ao5[1] != nil:
			winner = int64(1)
		}
		if _, err := db.Exec("INSERT INTO duel_games(race,game,event,ended_at,player1_id,player1_name,player1_ao5,player2_id,player2_name,player2_ao5,winner,results) VALUES(?,1,?,?,?,?,?,?,?,?,?,?)",
			newUUID(), e.id, at-rng.rangeU64(0, 60*accountsDayMs), pair[0].id, pair[0].name, ao5[0], pair[1].id, pair[1].name, ao5[1], winner,
			"["+results[0]+","+results[1]+"]"); err != nil {
			return err
		}
	}
	return nil
}

// seedTraffic: a month of daily traffic and activity, and the last day of requests, for the administration.
func seedTraffic(db *Conn, rng *seedRng, players []*seedPlayer, at int64) error {
	var ips []string
	for i := range 40 {
		ips = append(ips, "203.0.113."+strconv.Itoa(10+i))
	}
	for back := range int64(30) {
		day := time.UnixMilli(at - back*accountsDayMs).UTC().Format("2006-01-02")
		start := (at - back*accountsDayMs) / accountsDayMs * accountsDayMs
		for i, p := range players {
			if !rng.chance(math.Max(p.practice, 0.15)) {
				continue
			}
			requests := rng.rangeU32(5, 400)
			ip := ips[i%len(ips)]
			if _, err := db.Exec("INSERT INTO user_activity(user_id,day,requests) VALUES(?,?,?)", p.id, day, requests); err != nil {
				return err
			}
			if _, err := db.Exec(`INSERT INTO traffic_daily(day,ip,requests,errors,server_errors,limited,first_at,last_at) VALUES(?,?,?,?,0,0,?,?)
                 ON CONFLICT(day,ip) DO UPDATE SET requests=requests+excluded.requests`,
				day, ip, requests, rng.rangeU32(0, requests/20+1), start+8*seedHourMs, start+22*seedHourMs); err != nil {
				return err
			}
			if _, err := db.Exec("INSERT OR IGNORE INTO traffic_daily_users(day,ip,user_id) VALUES(?,?,?)", day, ip, p.id); err != nil {
				return err
			}
		}
	}
	paths := []struct {
		method, path string
		status       int64
		kind         string
	}{
		{"GET", "/api/sync", 200, "api"}, {"POST", "/api/sync", 200, "api"}, {"GET", "/timer", 200, "page"},
		{"GET", "/api/coaching/coaches", 200, "api"}, {"POST", "/api/auth/login", 401, "api"}, {"GET", "/assets/app.js", 200, "asset"},
		{"GET", "/api/cases", 200, "api"}, {"GET", "/api/nope", 404, "api"},
	}
	for range 1500 {
		r := paths[rng.rangeU64(0, int64(len(paths)))]
		p := players[rng.index(len(players))]
		when := at - rng.rangeU64(0, accountsDayMs)
		ip := ips[rng.index(len(ips))]
		duration := rng.rangeF64(0.2, 40)
		var user any
		if r.kind == "api" && r.status == 200 {
			user = p.id
		}
		important := int64(0)
		if r.status == 401 {
			important = 1
		}
		if _, err := db.Exec("INSERT INTO request_log(at,ip,method,path,status,duration_ms,user_id,user_agent,kind,important) VALUES(?,?,?,?,?,?,?,?,?,?)",
			when, ip, r.method, r.path, r.status, duration, user, "Mozilla/5.0 (X11; Linux x86_64) Cubix-dev", r.kind, important); err != nil {
			return err
		}
	}
	return nil
}

// ---- the community ----

// seedSocial: the community of the development accounts: friends, conversations, two groups, battles and
// tournaments. Some tournaments start a few minutes after the server, so their brackets can be played. Seeds a
// database whose accounts are seeded and whose community is empty, so an existing development database gets it too.
// Returns whether it did.
func seedSocial(db *Conn) (bool, error) {
	row, err := dbOne(db, "SELECT count(*) n FROM social_groups")
	if err != nil {
		return false, err
	}
	groups, _ := asInt(row["n"])
	rows, err := dbAll(db, "SELECT id,username FROM users WHERE password_hash IS NOT NULL")
	if err != nil {
		return false, err
	}
	ids := map[string]string{}
	for _, r := range rows {
		name, ok1 := asStr(r["username"])
		id, ok2 := asStr(r["id"])
		if ok1 && ok2 {
			ids[name] = id
		}
	}
	if _, ok := ids["dev"]; groups > 0 || !ok {
		return false, nil
	}
	id := func(name string) string { return ids[name] }
	at := accountsNow()
	tx, err := db.Begin()
	if err != nil {
		return false, err
	}
	defer tx.Rollback()
	friend := func(a, b string, accepted bool, days int64) error {
		status, acceptedAt := "pending", any(nil)
		if accepted {
			status, acceptedAt = "accepted", at-days*accountsDayMs+seedHourMs
		}
		_, err := db.Exec("INSERT INTO friends(user_id,friend_id,status,created_at,accepted_at) VALUES(?,?,?,?,?)",
			id(a), id(b), status, at-days*accountsDayMs, acceptedAt)
		return err
	}
	for _, f := range []struct {
		other string
		days  int64
	}{{"lena_speed", 40}, {"alex_cubes", 25}, {"coach", 60}, {"kenji_cfop", 9}} {
		if err := friend("dev", f.other, true, f.days); err != nil {
			return false, err
		}
	}
	if err := friend("ben_tps", "dev", false, 1); err != nil {
		return false, err
	}
	if err := friend("dev", "chloe_f2l", false, 2); err != nil {
		return false, err
	}
	// A conversation between friends.
	a, b := id("lena_speed"), id("dev")
	if id("dev") < id("lena_speed") {
		a, b = b, a
	}
	if _, err := db.Exec("INSERT INTO social_conversations(user_a,user_b,updated_at) VALUES(?,?,?)", a, b, at-seedHourMs); err != nil {
		return false, err
	}
	direct := db.LastInsertRowid()
	say := func(conversation int64, who, body string, ago int64) error {
		_, err := db.Exec("INSERT INTO social_messages(conversation_id,sender_id,body,created_at) VALUES(?,?,?,?)", conversation, id(who), body, at-ago)
		return err
	}
	// Two groups: the dev account runs the first, and is invited to the second.
	group := func(name, description, owner string, members [][2]string) (int64, int64, error) {
		if _, err := db.Exec("INSERT INTO social_groups(name,description,owner_id,created_at) VALUES(?,?,?,?)", name, description, id(owner), at-30*accountsDayMs); err != nil {
			return 0, 0, err
		}
		g := db.LastInsertRowid()
		if _, err := db.Exec("INSERT INTO group_members(group_id,user_id,role,joined_at) VALUES(?,?,'owner',?)", g, id(owner), at-30*accountsDayMs); err != nil {
			return 0, 0, err
		}
		for k, m := range members {
			if _, err := db.Exec("INSERT INTO group_members(group_id,user_id,role,invited_by,joined_at) VALUES(?,?,?,?,?)",
				g, id(m[0]), m[1], id(owner), at-(20-int64(k))*accountsDayMs); err != nil {
				return 0, 0, err
			}
		}
		if _, err := db.Exec("INSERT INTO social_conversations(group_id,updated_at) VALUES(?,?)", g, at-30*seedMinuteMs); err != nil {
			return 0, 0, err
		}
		return g, db.LastInsertRowid(), nil
	}
	clubMembers := [][2]string{{"lena_speed", "admin"}, {"alex_cubes", "member"}, {"coach", "member"}, {"ben_tps", "member"}, {"chloe_f2l", "member"}, {"hugo_sub10", "member"}, {"kenji_cfop", "member"}, {"emma_pll", "invited"}}
	club, clubChat, err := group("Cubix Club", "Weekly races and a cup every month. Be nice, turn fast.", "dev", clubMembers)
	if err != nil {
		return false, err
	}
	if _, _, err := group("Big cubes", "4×4 and up, reduction and Yau.", "lena_speed", [][2]string{{"quentin_4x4", "member"}, {"dev", "invited"}}); err != nil {
		return false, err
	}
	// A card in a conversation: a battle (`m`) or a tournament (`t`) as its message.
	card := func(conversation int64, who string, m, t any, ago int64) error {
		_, err := db.Exec("INSERT INTO social_messages(conversation_id,sender_id,body,created_at,match_id,tournament_id) VALUES(?,?,'',?,?,?)",
			conversation, id(who), at-ago, m, t)
		return err
	}
	// Tournaments: the group's and the administration's; the "sprint" ones start a few minutes from now.
	tournament := func(name, event string, group, by any, starts, points, sets, cap int64, players []string) (int64, error) {
		if _, err := db.Exec("INSERT INTO tournaments(name,description,event,group_id,created_by,starts_at,points,sets,max_players,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
			name, "", event, group, by, starts, points, sets, cap, at-3*accountsDayMs); err != nil {
			return 0, err
		}
		t := db.LastInsertRowid()
		for k, player := range players {
			if _, err := db.Exec("INSERT INTO tournament_players(tournament_id,user_id,registered_at) VALUES(?,?,?)", t, id(player), at-accountsDayMs+int64(k)*seedMinuteMs); err != nil {
				return 0, err
			}
		}
		return t, nil
	}
	clubPlayers := []string{"dev", "lena_speed", "alex_cubes", "coach", "ben_tps", "chloe_f2l", "hugo_sub10"}
	cup, err := tournament("Club cup", "333", club, id("dev"), at+2*accountsDayMs, 3, 2, 16, clubPlayers)
	if err != nil {
		return false, err
	}
	sprint, err := tournament("Friday sprint", "222", club, id("lena_speed"), at+3*seedMinuteMs, 2, 1, 8, []string{"dev", "lena_speed", "alex_cubes", "kenji_cfop", "hugo_sub10"})
	if err != nil {
		return false, err
	}
	open := []string{"lena_speed", "alex_cubes", "kenji_cfop", "emma_pll", "felix_roux", "gaia_zz", "ines_bld", "tess_cll", "vera_zbll"}
	// Full: the dev account sees it closed to newcomers.
	if _, err := tournament("Qbix Autumn Open", "333", nil, nil, at+3*accountsDayMs, 3, 2, int64(len(open)), open); err != nil {
		return false, err
	}
	if _, err := tournament("Weekly 2×2 sprint", "222", nil, nil, at+5*seedMinuteMs, 2, 1, 32, []string{"dev", "alex_cubes", "kenji_cfop"}); err != nil {
		return false, err
	}
	// Battles waiting in the club: one open to all, one aimed at the dev account.
	type battle struct {
		from string
		id   int64
	}
	var battles []battle
	for _, m := range []struct {
		from  string
		to    string
		event string
	}{{"alex_cubes", "", "222"}, {"lena_speed", "dev", "333"}} {
		var to any
		if m.to != "" {
			to = id(m.to)
		}
		if _, err := db.Exec("INSERT INTO matches(group_id,event,points,sets,player_a,player_b,status,created_by,created_at) VALUES(?,?,3,2,?,?,'waiting',?,?)",
			club, m.event, id(m.from), to, id(m.from), at-20*seedMinuteMs); err != nil {
			return false, err
		}
		battles = append(battles, battle{m.from, db.LastInsertRowid()})
	}
	// The club's conversation, in order, its cards among the words.
	steps := []func() error{
		func() error {
			return say(clubChat, "dev", "Welcome everyone! The Club cup opens on Saturday.", 26*seedHourMs)
		},
		func() error { return card(clubChat, "dev", nil, cup, 26*seedHourMs-seedMinuteMs) },
		func() error { return say(clubChat, "alex_cubes", "Can we do 2×2 battles in between?", 25*seedHourMs) },
		func() error {
			return say(clubChat, "lena_speed", "Sure, launch one from the swords at the top of the chat.", 24*seedHourMs)
		},
		func() error { return card(clubChat, "lena_speed", nil, sprint, 45*seedMinuteMs) },
		func() error {
			return say(clubChat, "hugo_sub10", "Friday sprint starts in a few minutes, register!", 40*seedMinuteMs)
		},
	}
	for _, b := range battles {
		steps = append(steps, func() error { return card(clubChat, b.from, b.id, nil, 20*seedMinuteMs) })
	}
	// Between friends: words, then a battle raced and won, solve by solve.
	steps = append(steps,
		func() error { return say(direct, "lena_speed", "Your Ao12 went down a lot this week!", 3*seedHourMs) },
		func() error {
			return say(direct, "dev", "Thanks, the F2L drills helped. Club cup this weekend?", 2*seedHourMs+30*seedMinuteMs)
		},
		func() error {
			return say(direct, "lena_speed", "Already registered. Quick warm-up battle?", 2*seedHourMs+20*seedMinuteMs)
		},
	)
	for _, step := range steps {
		if err := step(); err != nil {
			return false, err
		}
	}
	if _, err := db.Exec("INSERT INTO matches(event,points,sets,player_a,player_b,status,winner,created_by,created_at,started_at,finished_at) VALUES('333',3,1,?,?,'done',?,?,?,?,?)",
		id("lena_speed"), id("dev"), id("dev"), id("lena_speed"), at-2*seedHourMs-15*seedMinuteMs, at-2*seedHourMs-10*seedMinuteMs, at-2*seedHourMs); err != nil {
		return false, err
	}
	warmUp := db.LastInsertRowid()
	race := []struct {
		scramble   string
		devMs      int64
		devPenalty string
		lenaMs     int64
		lenaPen    string
	}{
		{"R2 U' F2 D' L2 U R2 B2 U' F2 R' B' L' D2 F U' L2 B' R D'", 9_870, "none", 10_420, "none"},
		{"F' L2 D R2 U' B2 D' L2 F2 U2 R2 B U' L' F' R D' F' U2 L'", 11_350, "none", 10_930, "none"},
		{"U2 L' B2 R' D2 L F2 D2 R' U2 B' U L2 F' D B R' U' F2 U'", 10_010, "+2", 10_880, "none"},
		{"B2 D' R2 F2 U L2 D B2 R2 U2 F' L' B' U R' F2 D L' B U2", 9_640, "none", 11_200, "none"},
		{"L2 F' U2 R2 D' B2 U L2 D2 F2 R' D' B L U' F R2 U B' L", 10_120, "none", 10_760, "none"},
	}
	for n, r := range race {
		if _, err := db.Exec("INSERT INTO match_solves(match_id,number,scramble,a_ms,a_penalty,b_ms,b_penalty) VALUES(?,?,?,?,?,?,?)",
			warmUp, int64(n)+1, r.scramble, r.lenaMs, r.lenaPen, r.devMs, r.devPenalty); err != nil {
			return false, err
		}
	}
	if err := card(direct, "lena_speed", warmUp, nil, 2*seedHourMs+15*seedMinuteMs); err != nil {
		return false, err
	}
	if err := say(direct, "lena_speed", "GG, that last one was fast 😄 See you in the bracket.", seedHourMs); err != nil {
		return false, err
	}
	return true, tx.Commit()
}
