package main

import (
	"path/filepath"
	"strconv"
	"testing"
)

// A session's name travels through the sync push: given at creation, renamed, cleared, and pulled by other devices.
func TestSessionNamesSync(t *testing.T) {
	db, err := dbOpen(filepath.Join(t.TempDir(), "cubix.db"))
	if err != nil {
		t.Fatal(err)
	}
	err = db.Call(func(c *Conn) error {
		if _, err := c.Exec("INSERT INTO users(id,username,password_hash) VALUES('u','sam','x')"); err != nil {
			return err
		}
		caller := &ApiCaller{user: M{"id": "u", "password_hash": "x"}}
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
