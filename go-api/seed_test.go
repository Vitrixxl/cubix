//go:build seed

package main

import (
	"bufio"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func TestSeedsAnEmptyDatabaseOnce(t *testing.T) {
	db, err := dbOpen(filepath.Join(t.TempDir(), "cubix.db"))
	if err != nil {
		t.Fatal(err)
	}
	catalog := catalogLoad()
	err = db.Call(func(c *Conn) error {
		summary, err := seedRun(c, catalog)
		if err != nil || summary == nil {
			t.Fatalf("seeded: %v %v", summary, err)
		}
		if summary.users <= 40 || summary.solves <= 10_000 {
			t.Fatalf("summary %+v", summary)
		}
		if again, err := seedRun(c, catalog); err != nil || again != nil {
			t.Fatalf("seeded twice: %v %v", again, err)
		}
		// Every seeded row reaches the change feed the clients pull.
		row, err := dbOne(c, "SELECT count(*) n FROM sync_changes WHERE kind='solves'")
		if err != nil {
			return err
		}
		if n, _ := asInt(row["n"]); n != summary.solves {
			t.Fatalf("feed %d, solves %d", n, summary.solves)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

// TestSeedRngMatchesRand checks seedRng against rand 0.8.8's StdRng, from a reference file written by a Rust program
// with the same draws (CUBIX_RAND_REFERENCE; skipped without it).
func TestSeedRngMatchesRand(t *testing.T) {
	path := os.Getenv("CUBIX_RAND_REFERENCE")
	if path == "" {
		t.Skip("CUBIX_RAND_REFERENCE unset")
	}
	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	lines := bufio.NewScanner(file)
	r := newSeedRng(2026)
	f := func(v float64) string { return strconv.FormatFloat(v, 'f', -1, 64) }
	list := func(v []int) string {
		s := make([]string, len(v))
		for i, x := range v {
			s[i] = strconv.Itoa(x)
		}
		return "[" + strings.Join(s, ", ") + "]"
	}
	var got []string
	for range 3 {
		got = append(got, strconv.FormatUint(uint64(r.u32()), 10))
	}
	for range 3 {
		got = append(got, strconv.FormatUint(r.u64(), 10))
	}
	for range 200 {
		got = append(got, strconv.FormatInt(r.rangeU64(0, 3), 10), strconv.FormatInt(r.rangeU64(0, 1000), 10),
			strconv.FormatInt(r.rangeU32(1, 3), 10), f(r.rangeF64(0.2, 0.4)), f(r.rangeF64(2.220446049250313e-16, 1)),
			f(r.f64()), strconv.FormatBool(r.bool()), strconv.FormatBool(r.chance(0.3)), strconv.FormatBool(r.chance(1)))
		all := make([]int, 35)
		for i := range all {
			all[i] = i
		}
		got = append(got, list(seedChooseMultiple(r, all, 6)))
		s := []int{0, 1, 2, 3, 4, 5, 6, 7, 8, 9}
		seedShuffle(r, s)
		got = append(got, list(s), strconv.Itoa([]int{1, 2, 3, 4, 5}[r.index(5)]))
	}
	for i, g := range got {
		if !lines.Scan() {
			t.Fatalf("reference ends at %d", i)
		}
		if want := lines.Text(); want != g {
			t.Fatalf("draw %d: got %s, want %s", i, g, want)
		}
	}
}
