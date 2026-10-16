package main

import (
	"path/filepath"
	"strconv"
	"testing"
)

// Fewest Moves solves keep their move count and Multi-Blind ones their cubes, each on its own event only, and both
// reach the other devices.
func TestFewestMovesAndMultiBlindResults(t *testing.T) {
	db, err := dbOpen(filepath.Join(t.TempDir(), "cubix.db"))
	if err != nil {
		t.Fatal(err)
	}
	err = db.Call(func(c *Conn) error {
		if _, err := c.Exec("INSERT INTO users(id,username) VALUES('u','sam')"); err != nil {
			return err
		}
		caller := &ApiCaller{user: M{"id": "u"}}
		state := &AppState{catalog: &Catalog{}}
		n := 0
		push := func(body M) (M, int) {
			n++
			body["timeMs"], body["puzzle"] = int64(1_800_000), "333"
			op := M{"id": strconv.Itoa(n), "method": "POST", "path": "solves", "createdAt": "2026-10-10T08:00:00.000Z", "body": body}
			result, err := syncPush(c, state, "u", caller, M{"operations": []any{op}})
			if err != nil {
				return nil, toApiError(err).Status
			}
			value, _ := result.(M)["results"].([]any)[0].(M)["value"].(M)
			return value, 200
		}
		if fm, s := push(M{"solveMode": "fewest-moves", "moves": 28, "solution": "R U x Rw2"}); s != 200 || !eqInt(fm["moves"], 28) || fm["cubes_attempted"] != nil {
			t.Fatalf("fewest moves %v %d", fm, s)
		}
		if mb, s := push(M{"solveMode": "multi-blind", "cubesSolved": 3, "cubesAttempted": 4}); s != 200 || !eqInt(mb["cubes_solved"], 3) || !eqInt(mb["cubes_attempted"], 4) || mb["moves"] != nil {
			t.Fatalf("multi-blind %v %d", mb, s)
		}
		for _, bad := range []M{
			{"solveMode": "standard", "moves": 28},
			{"solveMode": "fewest-moves", "moves": 28.5},
			{"solveMode": "fewest-moves", "moves": 201},
			{"solveMode": "fewest-moves", "cubesSolved": 2, "cubesAttempted": 2},
			{"solveMode": "multi-blind", "cubesSolved": 5, "cubesAttempted": 4},
			{"solveMode": "multi-blind", "cubesSolved": 1, "cubesAttempted": 1},
			{"solveMode": "multi-blind", "cubesAttempted": 4},
			{"solveMode": "multi-blind", "cubesSolved": 2, "cubesAttempted": 41},
		} {
			if _, s := push(bad); s != 422 {
				t.Fatalf("%v accepted: %d", bad, s)
			}
		}
		// No race (duel, tournament) on them; Clock is one again.
		if practiceIsEvent("333fm") || practiceIsEvent("333mbf") || !practiceIsEvent("clock") {
			t.Fatal("race events")
		}
		pulled, err := syncPull(c, "u", 0, false, false)
		if err != nil {
			return err
		}
		changes := pulled["changes"].([]any)
		if len(changes) != 2 || !eqInt(changes[0].(M)["value"].(M)["moves"], 28) || !eqInt(changes[1].(M)["value"].(M)["cubes_attempted"], 4) {
			t.Fatalf("pulled %v", changes)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
