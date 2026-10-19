package main

// The WCA's sign-in (OAuth 2, its `public` scope): signing in with a WCA account, or linking one to the account signed in,
// so that the WCA ID a profile shows is the one the WCA vouches for. CUBIX_WCA_CLIENT_ID and CUBIX_WCA_CLIENT_SECRET name
// the application registered on worldcubeassociation.org/oauth/applications, its redirect URI
// <origin>/api/auth/wca/callback.
//
// The app asks `auth/wca/start` for the WCA's page (its `state` kept here with the account to link); the WCA sends the
// browser back to `auth/wca/callback`, which reads the person and leaves the outcome under a one-time ticket in the app's
// address (`?wcaAuth=`); the app redeems it at `auth/wca/finish`: a session, or the WCA ID linked.

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// The WCA's site; the tests point it at a fake server.
var wcaSite = "https://www.worldcubeassociation.org"

// A sign-in under way, or its outcome, lasts ten minutes.
const wcaAuthLife = 10 * time.Minute

type wcaPending struct {
	user, redirect, back string
	at                   time.Time
}

type wcaOutcome struct {
	value M
	err   error
	at    time.Time
}

// ponytail: kept in memory, a restart drops the sign-ins under way (they start again); a table if the API ever runs twice.
var wcaAuth = struct {
	sync.Mutex
	pending map[string]wcaPending
	done    map[string]wcaOutcome
}{pending: map[string]wcaPending{}, done: map[string]wcaOutcome{}}

func wcaConfigured() bool {
	return os.Getenv("CUBIX_WCA_CLIENT_ID") != "" && os.Getenv("CUBIX_WCA_CLIENT_SECRET") != ""
}

// wcaAuthSweep forgets what has expired; called with the lock held.
func wcaAuthSweep() {
	for k, p := range wcaAuth.pending {
		if time.Since(p.at) > wcaAuthLife {
			delete(wcaAuth.pending, k)
		}
	}
	for k, o := range wcaAuth.done {
		if time.Since(o.at) > wcaAuthLife {
			delete(wcaAuth.done, k)
		}
	}
}

// wcaAuthStart: the WCA's sign-in page for `origin` (the app's, where the WCA sends the browser back), the app coming
// back on `back`; with `link`, for the account `token` opens.
func wcaAuthStart(state *AppState, ip, token string, body any) (any, error) {
	if !wcaConfigured() {
		return nil, apiErr(404, "Not found")
	}
	if err := apiLimited(state, "wca@"+ip, 30); err != nil {
		return nil, err
	}
	origin, err := apiString(body, "origin", 8, 200)
	if err != nil {
		return nil, err
	}
	if u, err := url.Parse(origin); err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || u.Path != "" || u.RawQuery != "" || u.User != nil {
		return nil, validation()
	}
	back, err := apiString(body, "back", 1, 512)
	if err != nil {
		return nil, err
	}
	// A path of the app only: never another site's address.
	if !strings.HasPrefix(back, "/") || strings.HasPrefix(back, "//") || strings.ContainsAny(back, "\\\r\n") {
		return nil, validation()
	}
	pending := wcaPending{redirect: origin + "/api/auth/wca/callback", back: back, at: time.Now()}
	if link, _ := asBool(idx(body, "link")); link {
		user, err := dbCall(state.db, func(db *Conn) (M, error) { return accountsSignedIn(db, token) })
		if err != nil {
			return nil, err
		}
		pending.user = str(user["id"])
	}
	key := accountsRandomToken()
	wcaAuth.Lock()
	wcaAuthSweep()
	wcaAuth.pending[key] = pending
	wcaAuth.Unlock()
	query := url.Values{"client_id": {os.Getenv("CUBIX_WCA_CLIENT_ID")}, "redirect_uri": {pending.redirect}, "response_type": {"code"}, "scope": {"public"}, "state": {key}}
	return M{"url": wcaSite + "/oauth/authorize?" + query.Encode()}, nil
}

// wcaCallback: the WCA sends the browser back here; the outcome waits under a ticket the app finds in its address.
func wcaCallback(state *AppState, w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	wcaAuth.Lock()
	pending, ok := wcaAuth.pending[q.Get("state")]
	delete(wcaAuth.pending, q.Get("state"))
	wcaAuth.Unlock()
	outcome := wcaOutcome{at: time.Now()}
	switch {
	case !ok || time.Since(pending.at) > wcaAuthLife:
		pending.back = "/"
		outcome.err = apiErr(400, "The WCA sign-in expired. Try again.")
	case q.Get("code") == "":
		outcome.err = apiErr(400, "The WCA sign-in was cancelled.")
	default:
		outcome.value, outcome.err = wcaSignIn(state, pending, q.Get("code"))
	}
	ticket := accountsRandomToken()
	wcaAuth.Lock()
	wcaAuth.done[ticket] = outcome
	wcaAuth.Unlock()
	sep := "?"
	if strings.Contains(pending.back, "?") {
		sep = "&"
	}
	http.Redirect(w, r, pending.back+sep+"wcaAuth="+ticket, http.StatusFound)
}

// wcaAuthFinish: the outcome a ticket holds, once.
func wcaAuthFinish(body any) (any, error) {
	ticket, err := apiString(body, "ticket", 1, 128)
	if err != nil {
		return nil, err
	}
	wcaAuth.Lock()
	outcome, ok := wcaAuth.done[ticket]
	delete(wcaAuth.done, ticket)
	wcaAuth.Unlock()
	if !ok || time.Since(outcome.at) > wcaAuthLife {
		return nil, apiErr(400, "The WCA sign-in expired. Try again.")
	}
	return outcome.value, outcome.err
}

// wcaAccount: the WCA's account, its WCA ID empty before a first competition.
type wcaAccount struct {
	ID    int64   `json:"id"`
	WcaID *string `json:"wca_id"`
	Name  string  `json:"name"`
}

// wcaMe: the account whose sign-in gave `code`.
func wcaMe(code, redirect string) (wcaAccount, error) {
	var me struct {
		Me wcaAccount `json:"me"`
	}
	failed := apiErr(502, "The WCA cannot be reached.")
	response, err := wcaClient.PostForm(wcaSite+"/oauth/token", url.Values{
		"grant_type": {"authorization_code"}, "code": {code}, "redirect_uri": {redirect},
		"client_id": {os.Getenv("CUBIX_WCA_CLIENT_ID")}, "client_secret": {os.Getenv("CUBIX_WCA_CLIENT_SECRET")},
	})
	if err != nil {
		return me.Me, failed
	}
	defer response.Body.Close()
	var grant struct {
		AccessToken string `json:"access_token"`
	}
	if response.StatusCode != 200 || json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&grant) != nil || grant.AccessToken == "" {
		return me.Me, apiErr(400, "The WCA refused the sign-in. Try again.")
	}
	request, err := http.NewRequest("GET", wcaSite+"/api/v0/me", nil)
	if err != nil {
		return me.Me, failed
	}
	request.Header.Set("Authorization", "Bearer "+grant.AccessToken)
	request.Header.Set("User-Agent", "Qbix")
	answer, err := wcaClient.Do(request)
	if err != nil {
		return me.Me, failed
	}
	defer answer.Body.Close()
	if answer.StatusCode != 200 || json.NewDecoder(io.LimitReader(answer.Body, 1<<20)).Decode(&me) != nil || me.Me.ID == 0 {
		return me.Me, failed
	}
	return me.Me, nil
}

// wcaSignIn: the account the WCA's sign-in opens (created the first time), or the account it is linked to.
func wcaSignIn(state *AppState, pending wcaPending, code string) (M, error) {
	me, err := wcaMe(code, pending.redirect)
	if err != nil {
		return nil, err
	}
	account := strconv.FormatInt(me.ID, 10)
	var wcaId any
	if me.WcaID != nil && wcaID.MatchString(*me.WcaID) {
		wcaId = *me.WcaID
	}
	return dbCall(state.db, func(db *Conn) (M, error) {
		if pending.user == "" {
			response, err := accountsOpen(db, "wca_user_id=?", account, accountsName(me.Name), "wca_user_id")
			if err != nil {
				return nil, err
			}
			// Its WCA ID comes with a first competition: kept up to date at each sign-in.
			if _, err := db.Exec("UPDATE users SET wca_id=? WHERE wca_user_id=?", wcaId, account); err != nil {
				return nil, err
			}
			response["user"].(M)["wcaId"] = wcaId
			return response, nil
		}
		other, err := dbOne(db, "SELECT id FROM users WHERE wca_user_id=? AND id!=?", account, pending.user)
		if err != nil {
			return nil, err
		}
		if other != nil {
			return nil, apiErr(409, "This WCA account is linked to another Qbix account.")
		}
		if _, err := db.Exec("UPDATE users SET wca_user_id=?,wca_id=? WHERE id=?", account, wcaId, pending.user); err != nil {
			return nil, err
		}
		user, err := dbRequired(db, "SELECT * FROM users WHERE id=?", "Unknown account", pending.user)
		if err != nil {
			return nil, err
		}
		return M{"user": accountsPublic(user), "wcaId": wcaId}, nil
	})
}
