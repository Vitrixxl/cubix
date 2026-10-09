package main

// Placeholders for the SOCIAL group (social.rs, tournament.rs, duel.rs). That port deletes this file and implements
// every symbol below with the same signature, in social.go, tournament.go and duel.go.
// Conventions: an `Option<i64>` id is 0 for None, an `Option<&str>` account id "" for None.

import "net/http"

// DuelArena is duel::Arena.
type DuelArena struct{}

// newDuelArena is duel::Arena::new.
func newDuelArena(log *ActivityLog) *DuelArena { return &DuelArena{} }

// duelRun is duel::run, started as a goroutine: pairs the queue every second, forever.
func duelRun(arena *DuelArena) {}

// duelUpgrade is duel::upgrade: GET /api/duel.
func duelUpgrade(state *AppState, w http.ResponseWriter, r *http.Request) { notImplemented(w) }

// TournamentLive is tournament::Live.
type TournamentLive struct{}

// newTournamentLive is tournament::Live::default.
func newTournamentLive() *TournamentLive { return &TournamentLive{} }

// tournamentRun is tournament::run, started as a goroutine: starts tournaments at their date, forever.
func tournamentRun(state *AppState) {}

// tournamentUpgrade is tournament::upgrade: GET /api/matches/live.
func tournamentUpgrade(state *AppState, w http.ResponseWriter, r *http.Request) { notImplemented(w) }

// socialRoute is social::route: /api/social/…, `parts` after "social".
func socialRoute(db *Conn, state *AppState, method string, parts []string, query map[string]string, body any, user M) (any, error) {
	return nil, apiErr(501, "Not implemented")
}

// tournamentRoute is tournament::route: /api/tournaments/…, /api/matches/…, /api/competition/…, `parts` whole.
func tournamentRoute(db *Conn, state *AppState, method string, parts []string, body any, user M) (any, error) {
	return nil, apiErr(501, "Not implemented")
}

// tournamentAdminList is tournament::admin_list (admin.rs).
func tournamentAdminList(db *Conn) (any, error) { return nil, apiErr(501, "Not implemented") }

// tournamentDetail is tournament::detail (admin.rs passes uid "").
func tournamentDetail(db *Conn, id int64, uid string) (any, error) {
	return nil, apiErr(501, "Not implemented")
}

// tournamentCreate is tournament::create (admin.rs passes group 0 and by "").
func tournamentCreate(db *Conn, state *AppState, body any, group int64, by string) (any, error) {
	return nil, apiErr(501, "Not implemented")
}

// tournamentStart is tournament::start (admin.rs).
func tournamentStart(db *Conn, state *AppState, id int64) error {
	return apiErr(501, "Not implemented")
}

// tournamentCancel is tournament::cancel (admin.rs).
func tournamentCancel(db *Conn, state *AppState, id int64) error {
	return apiErr(501, "Not implemented")
}

// tournamentDelete is tournament::delete (admin.rs).
func tournamentDelete(db *Conn, state *AppState, id int64) (any, error) {
	return nil, apiErr(501, "Not implemented")
}

// tournamentAward is tournament::award (admin.rs).
func tournamentAward(db *Conn, state *AppState, id int64, winner string) (any, error) {
	return nil, apiErr(501, "Not implemented")
}
