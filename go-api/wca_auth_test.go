package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"testing"
)

func TestWcaSignIn(t *testing.T) {
	// The WCA: a code per person, its token, then the person.
	people := map[string]string{
		"feliks": `{"me":{"id":1,"wca_id":"2009ZEMD01","name":"Feliks Zemdegs"}}`,
		"newbie": `{"me":{"id":2,"wca_id":null,"name":"Sam Lee"}}`,
	}
	wca := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/oauth/token":
			if r.FormValue("client_secret") != "secret" || r.FormValue("redirect_uri") != "https://qbix.test/api/auth/wca/callback" || people[r.FormValue("code")] == "" {
				http.Error(w, "{}", 401)
				return
			}
			fmt.Fprintf(w, `{"access_token":%q}`, r.FormValue("code"))
		case "/api/v0/me":
			fmt.Fprint(w, people[strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")])
		default:
			http.NotFound(w, r)
		}
	}))
	defer wca.Close()
	wcaSite = wca.URL
	t.Setenv("CUBIX_WCA_CLIENT_ID", "qbix")
	t.Setenv("CUBIX_WCA_CLIENT_SECRET", "secret")
	db, err := dbOpen(filepath.Join(t.TempDir(), "cubix.db"))
	if err != nil {
		t.Fatal(err)
	}
	state := &AppState{db: db, attempts: map[string]*attempt{}}

	// Start, come back with `code`, redeem the ticket.
	signIn := func(token, code string, link bool) (any, error) {
		value, err := wcaAuthStart(state, "ip", token, M{"origin": "https://qbix.test", "back": "/profile?tab=wca", "link": link})
		if err != nil {
			t.Fatal(err)
		}
		page, _ := url.Parse(str(idx(value, "url")))
		if page.Query().Get("redirect_uri") != "https://qbix.test/api/auth/wca/callback" || page.Query().Get("scope") != "public" {
			t.Fatal(page)
		}
		w := httptest.NewRecorder()
		wcaCallback(state, w, httptest.NewRequest("GET", "/api/auth/wca/callback?code="+code+"&state="+page.Query().Get("state"), nil))
		back, _ := url.Parse(w.Header().Get("Location"))
		if w.Code != 302 || back.Path != "/profile" || back.Query().Get("tab") != "wca" {
			t.Fatal(w.Code, back)
		}
		ticket := back.Query().Get("wcaAuth")
		value, err = wcaAuthFinish(M{"ticket": ticket})
		if _, again := wcaAuthFinish(M{"ticket": ticket}); again == nil {
			t.Fatal("a ticket redeemed twice")
		}
		return value, err
	}

	// A first sign-in creates the account, a second opens it again; a WCA account without a WCA ID signs in too.
	first, err := signIn("", "feliks", false)
	user := idx(first, "user").(M)
	if err != nil || user["username"] != "feliks_zemdegs" || user["wcaId"] != "2009ZEMD01" || str(idx(first, "token")) == "" {
		t.Fatal(first, err)
	}
	again, _ := signIn("", "feliks", false)
	if idx(again, "user").(M)["id"] != user["id"] {
		t.Fatal(again)
	}
	if newbie, err := signIn("", "newbie", false); err != nil || idx(newbie, "user").(M)["wcaId"] != nil {
		t.Fatal(newbie, err)
	}
	if _, err := signIn("", "nobody", false); err == nil {
		t.Fatal("an unknown code accepted")
	}

	// Linked to an account signed in another way; never to a second account.
	other, _ := dbCall(db, func(c *Conn) (M, error) { return accountsOpen(c, "google_sub=?", "g", "sam", "google_sub") })
	if _, err := signIn("Bearer "+str(other["token"]), "feliks", true); err == nil || toApiError(err).Status != 409 {
		t.Fatal(err)
	}
	if _, err := dbCall(db, func(c *Conn) (any, error) { return c.Exec("UPDATE users SET wca_user_id=NULL,wca_id=NULL") }); err != nil {
		t.Fatal(err)
	}
	linked, err := signIn("Bearer "+str(other["token"]), "feliks", true)
	if err != nil || idx(linked, "wcaId") != "2009ZEMD01" || idx(linked, "token") != nil || idx(linked, "user").(M)["id"] != idx(other, "user").(M)["id"] {
		t.Fatal(linked, err)
	}

	// The profile keeps only the WCA ID the WCA vouches for.
	_ = db.Call(func(c *Conn) error {
		put := func(uid, id string) any {
			v, err := journeyPut(c, uid, M{"key": "profile", "value": M{"kind": "profile", "knownPuzzles": []any{"333"}, "priority": nil,
				"completedAt": "2026-10-10T08:00:00.000Z", "wcaId": id}})
			if err != nil {
				t.Fatal(err)
			}
			return idx(idx(v, "value"), "wcaId")
		}
		if got := put(str(idx(other, "user").(M)["id"]), "2009ZEMD01"); got != "2009ZEMD01" {
			t.Fatal(got)
		}
		if got := put(str(user["id"]), "2009ZEMD01"); got != nil {
			t.Fatal(got)
		}
		return nil
	})

	// Never back to another site; nothing without the WCA set up.
	for _, body := range []M{{"origin": "https://qbix.test", "back": "//evil.test"}, {"origin": "https://qbix.test", "back": "https://evil.test"}, {"origin": "javascript:x", "back": "/"}} {
		if _, err := wcaAuthStart(state, "ip", "", body); err == nil {
			t.Fatal(body)
		}
	}
	w := httptest.NewRecorder()
	wcaCallback(state, w, httptest.NewRequest("GET", "/api/auth/wca/callback?code=feliks&state=forged", nil))
	if back, _ := url.Parse(w.Header().Get("Location")); back.Path != "/" {
		t.Fatal(back)
	} else if _, err := wcaAuthFinish(M{"ticket": back.Query().Get("wcaAuth")}); err == nil {
		t.Fatal("a forged state signed in")
	}
	t.Setenv("CUBIX_WCA_CLIENT_SECRET", "")
	if _, err := wcaAuthStart(state, "ip", "", M{"origin": "https://qbix.test", "back": "/"}); err == nil || toApiError(err).Status != 404 {
		t.Fatal(err)
	}
}
