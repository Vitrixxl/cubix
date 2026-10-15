package main

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// A shared solve is a copy made by its owner alone, under a short id: shared again unchanged it keeps its link, changed
// it gets a new one, and the copy outlives the solve; anyone reads it, and its page is titled after it.
func TestSharedSolves(t *testing.T) {
	db, err := dbOpen(filepath.Join(t.TempDir(), "cubix.db"))
	if err != nil {
		t.Fatal(err)
	}
	state := &AppState{catalog: &Catalog{}}
	sam := &ApiCaller{user: M{"id": "u", "username": "sam"}}
	var first string
	err = db.Call(func(c *Conn) error {
		if err := c.ExecBatch(`INSERT INTO users(id,username) VALUES('u','sam'),('v','lena');
			INSERT INTO solves(id,user_id,time_ms,penalty,scramble,comment,solution) VALUES(7,'u',12340,'+2','R U F','Nice','[{"move":"R","at":0}]')`); err != nil {
			return err
		}
		share := func(caller *ApiCaller, id string) (string, int) {
			got, err := apiRoute(c, state, "POST", "solves/"+id+"/share", nil, M{}, caller)
			if err != nil {
				return "", testStatus(err)
			}
			return str(got.(M)["token"]), 200
		}
		if _, status := share(&ApiCaller{}, "7"); status != 401 {
			t.Fatalf("a guest shared: %d", status)
		}
		if _, status := share(&ApiCaller{user: M{"id": "v", "username": "lena"}}, "7"); status != 404 {
			t.Fatalf("another account shared: %d", status)
		}
		first, _ = share(sam, "7")
		if len(first) != 10 || strings.Trim(first, "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz") != "" {
			t.Fatalf("id %q", first)
		}
		if again, _ := share(sam, "7"); again != first {
			t.Fatalf("shared again: %q, then %q", first, again)
		}
		if _, err := c.Exec("UPDATE solves SET comment='Lucky' WHERE id=7"); err != nil {
			return err
		}
		if changed, _ := share(sam, "7"); changed == first || changed == "" {
			t.Fatalf("changed solve kept %q", changed)
		}
		if _, err := c.Exec("DELETE FROM solves WHERE id=7"); err != nil {
			return err
		}
		got, err := sharedSolve(c, first)
		if err != nil {
			return err
		}
		if s := got.(M); s["username"] != "sam" || s["comment"] != "Nice" || s["scramble"] != "R U F" || s["solution"] != `[{"move":"R","at":0}]` || s["id"] != nil {
			t.Fatalf("shared %v", s)
		}
		if _, err := sharedSolve(c, "nothing"); testStatus(err) != 404 {
			t.Fatalf("unknown id: %v", err)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<head><title>Qbix</title></head>"), 0o644); err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	webRouter(dir, db).ServeHTTP(w, httptest.NewRequest("GET", "/fr/s/"+first, nil))
	if body := w.Body.String(); w.Code != 200 || !strings.Contains(body, `<meta property="og:title" content="14.340+ · 3×3 on Qbix" />`) ||
		!strings.Contains(body, `<meta property="og:url" content="https://example.com/s/`+first+`" />`) {
		t.Fatalf("page %d %s", w.Code, body)
	}
}

// The links made when a shared solve was its solve's token keep working, as copies.
func TestSharedSolveTokensBecomeCopies(t *testing.T) {
	db, err := dbOpen(filepath.Join(t.TempDir(), "cubix.db"))
	if err != nil {
		t.Fatal(err)
	}
	err = db.Call(func(c *Conn) error {
		if err := c.ExecBatch(`ALTER TABLE solves ADD COLUMN share_token TEXT;
			CREATE UNIQUE INDEX idx_solves_share ON solves(share_token) WHERE share_token IS NOT NULL;
			INSERT INTO users(id,username) VALUES('u','sam');
			INSERT INTO solves(user_id,time_ms,share_token) VALUES('u',9000,'0123456789abcdef01234567')`); err != nil {
			return err
		}
		if err := dbMigrate(c); err != nil {
			return err
		}
		got, err := sharedSolve(c, "0123456789abcdef01234567")
		if err != nil || got.(M)["username"] != "sam" {
			t.Fatalf("legacy link %v %v", got, err)
		}
		if has, _ := hasColumn(c, "solves", "share_token"); has {
			t.Fatal("share_token stayed")
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
