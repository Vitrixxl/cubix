package main

import (
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// A session's name travels through the sync push: given at creation, renamed, cleared, and pulled by other devices.
func TestSessionNamesSync(t *testing.T) {
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
		push := func(op M) (M, error) {
			result, err := syncPush(c, state, "u", caller, M{"operations": []any{op}})
			if err != nil {
				return nil, err
			}
			value, _ := result.(M)["results"].([]any)[0].(M)["value"].(M)
			return value, nil
		}
		created, err := push(M{"id": "a", "method": "POST", "path": "sessions", "createdAt": "2026-10-10T08:00:00.000Z",
			"body": M{"mode": "playground", "caseIds": []any{}, "puzzle": "333", "name": " Morning "}})
		if err != nil {
			t.Fatal(err)
		}
		if created["name"] != "Morning" {
			t.Fatalf("created %v", created)
		}
		id, _ := asInt(created["id"])
		path := "sessions/" + strconv.FormatInt(id, 10)
		renamed, err := push(M{"id": "b", "method": "PATCH", "path": path, "body": M{"name": "Comp prep"}})
		if err != nil || renamed["name"] != "Comp prep" {
			t.Fatalf("renamed %v %v", renamed, err)
		}
		if _, err := push(M{"id": "c", "method": "PATCH", "path": path, "body": M{"name": string(make([]rune, 61))}}); err == nil {
			t.Fatal("a 61-character name was accepted")
		}
		pulled, err := syncPull(c, "u", 0, false, false)
		if err != nil {
			return err
		}
		changes := pulled["changes"].([]any)
		if len(changes) != 1 || changes[0].(M)["value"].(M)["name"] != "Comp prep" {
			t.Fatalf("pulled %v", changes)
		}
		cleared, err := push(M{"id": "d", "method": "PATCH", "path": path, "body": M{"name": nil}})
		if err != nil || cleared["name"] != nil {
			t.Fatalf("cleared %v %v", cleared, err)
		}
		// Renaming a session another device deleted is not an error.
		if _, err := push(M{"id": "e", "method": "PATCH", "path": "sessions/999", "body": M{"name": "Gone"}}); err != nil {
			t.Fatal(err)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

// Solves arriving through the sync push are held to the route's limits, and their receipts keep only a digest of the
// operation and the id it made, until they expire.
func TestSyncedSolveLimitsAndCompactReceipts(t *testing.T) {
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
		push := func(op M) (any, error) { return syncPush(c, state, "u", caller, M{"operations": []any{op}}) }
		status := func(_ any, err error) int {
			if err == nil {
				return 200
			}
			return toApiError(err).Status
		}
		solve := func(id, scramble string) M {
			return M{"id": id, "method": "POST", "path": "solves", "createdAt": "2026-10-10T08:00:00.000Z",
				"body": M{"timeMs": int64(9000), "scramble": scramble}}
		}
		if s := status(push(solve("long", strings.Repeat("R ", 2000)+"U"))); s != 422 {
			t.Fatalf("a 4001-character scramble: %d", s)
		}
		if s := status(push(M{"id": "cases", "method": "POST", "path": "sessions", "createdAt": "2026-10-10T08:00:00.000Z",
			"body": M{"mode": "training", "caseIds": []any{"PLL Aa"}}})); s != 422 {
			t.Fatalf("more case ids than the catalogue holds: %d", s)
		}
		op := solve("ok", strings.Repeat("R ", 2000))
		first, err := push(op)
		if err != nil {
			t.Fatal(err)
		}
		id, _ := asInt(first.(M)["results"].([]any)[0].(M)["value"].(M)["id"])
		receipt, err := dbOne(c, "SELECT payload,result FROM sync_receipts WHERE operation_id='ok'")
		if err != nil {
			return err
		}
		if len(str(receipt["payload"])) != 64 || str(receipt["result"]) != encodeJSON(M{"id": id}) {
			t.Fatalf("receipt %v", receipt)
		}
		again, err := push(op)
		if err != nil {
			t.Fatal(err)
		}
		if replayed, _ := again.(M)["results"].([]any)[0].(M)["value"].(M); len(replayed) != 1 || !eqInt(replayed["id"], id) {
			t.Fatalf("replay %v", again)
		}
		if s := status(push(solve("ok", "U"))); s != 409 {
			t.Fatalf("an operation id reused with other data: %d", s)
		}
		if _, err := c.Exec("UPDATE sync_receipts SET at=?", accountsNow()-31*accountsDayMs); err != nil {
			return err
		}
		if err := syncPrune(c); err != nil {
			return err
		}
		if left, err := dbOne(c, "SELECT count(*) n FROM sync_receipts"); err != nil || !eqInt(left["n"], 0) {
			t.Fatalf("receipts left %v %v", left, err)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

// An account takes a new username: lower-cased, of the allowed characters, and never another account's.
func TestUsernameChange(t *testing.T) {
	db, err := dbOpen(filepath.Join(t.TempDir(), "cubix.db"))
	if err != nil {
		t.Fatal(err)
	}
	err = db.Call(func(c *Conn) error {
		if _, err := c.Exec("INSERT INTO users(id,username) VALUES('u','sam'),('v','lena')"); err != nil {
			return err
		}
		state := &AppState{catalog: &Catalog{}}
		rename := func(name string) (any, error) {
			return apiRoute(c, state, "POST", "account/username", nil, M{"username": name}, &ApiCaller{user: M{"id": "u", "username": "sam"}})
		}
		got, err := rename(" Sam_Cubes ")
		if err != nil || got.(M)["user"].(M)["username"] != "sam_cubes" {
			t.Fatalf("renamed %v %v", got, err)
		}
		for _, bad := range []string{"LENA", "no spaces", "ab", " ab "} {
			if _, err := rename(bad); err == nil {
				t.Fatalf("%q was accepted", bad)
			}
		}
		// Its own name again, in other letters, is no conflict.
		if _, err := rename("SAM_cubes"); err != nil {
			t.Fatal(err)
		}
		row, err := dbOne(c, "SELECT username FROM users WHERE id='u'")
		if err != nil || row["username"] != "sam_cubes" {
			t.Fatalf("stored %v %v", row, err)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

// A solve timed in phases keeps its splits, rising and within the solve, and other devices pull them as a list.
func TestSolveSplits(t *testing.T) {
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
		push := func(id string, splits any) (any, error) {
			return syncPush(c, state, "u", caller, M{"operations": []any{M{"id": id, "method": "POST", "path": "solves", "createdAt": "2026-10-10T08:00:00.000Z",
				"body": M{"timeMs": float64(10000), "splits": splits}}}})
		}
		for i, bad := range []any{[]any{}, []any{float64(3000), float64(2000)}, []any{float64(10000)}, []any{float64(0)}, "1,2", make([]any, 8)} {
			if _, err := push("bad"+strconv.Itoa(i), bad); err == nil || toApiError(err).Status != 422 {
				t.Fatalf("splits %v: %v", bad, err)
			}
		}
		if _, err := push("ok", []any{float64(1500.4), float64(6000), float64(8200)}); err != nil {
			t.Fatal(err)
		}
		if _, err := push("none", nil); err != nil {
			t.Fatal(err)
		}
		pulled, err := syncPull(c, "u", 0, false, false)
		if err != nil {
			return err
		}
		changes := pulled["changes"].([]any)
		if len(changes) != 2 {
			t.Fatalf("pulled %v", changes)
		}
		if got := strings.TrimSpace(encodeJSON(changes[0].(M)["value"].(M)["splits"])); got != "[1500,6000,8200]" {
			t.Fatalf("splits %q", got)
		}
		if got := changes[1].(M)["value"].(M)["splits"]; got != nil {
			t.Fatalf("no splits %v", got)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
