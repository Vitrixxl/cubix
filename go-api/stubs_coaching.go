package main

// Placeholders for the COACHING group (coaching.rs). That port deletes this file and implements every symbol below
// with the same signature in coaching.go, next to coachingMediaDir and coachingSweepMedia, already ported there.

import "net/http"

// CoachingRooms is coaching::Rooms.
type CoachingRooms struct{}

// newCoachingRooms is coaching::Rooms::default.
func newCoachingRooms() *CoachingRooms { return &CoachingRooms{} }

// notify is coaching::Rooms::notify: tells every open app of the account (social::notify uses it).
func (r *CoachingRooms) notify(user string, value M) {}

// coachingMediaMax is coaching::MEDIA_MAX, the body limit of the media upload route.
const coachingMediaMax = 64 * 1024 * 1024

// coachingRoute is coaching::route: /api/coaching/…, `parts` after "coaching".
func coachingRoute(db *Conn, state *AppState, method string, parts []string, query map[string]string, body any, user M) (any, error) {
	return nil, apiErr(501, "Not implemented")
}

// coachingUpgrade is coaching::upgrade: GET /api/coaching/live.
func coachingUpgrade(state *AppState, w http.ResponseWriter, r *http.Request) { notImplemented(w) }

// coachingUpload is coaching::upload: POST /api/coaching/conversations/{id}/media (r.PathValue("id")).
func coachingUpload(state *AppState, w http.ResponseWriter, r *http.Request) { notImplemented(w) }

// coachingMedia is coaching::media: GET /api/coaching/media/{id}.
func coachingMedia(state *AppState, w http.ResponseWriter, r *http.Request) { notImplemented(w) }

// coachingSetAvatar is coaching::set_avatar: PUT and DELETE /api/coaching/avatar.
func coachingSetAvatar(state *AppState, w http.ResponseWriter, r *http.Request) { notImplemented(w) }

// coachingAvatar is coaching::avatar: GET /api/avatars/{file}.
func coachingAvatar(state *AppState, w http.ResponseWriter, r *http.Request) { notImplemented(w) }

// coachingAvatarURL is coaching::avatar_url (social.rs uses it).
func coachingAvatarURL(file any) any { return nil }

// coachingForgetAvatar is coaching::forget_avatar (admin_data.rs uses it).
func coachingForgetAvatar(file string) {}

// coachingAdminOverview is coaching::admin_overview (admin.rs).
func coachingAdminOverview(db *Conn) (any, error) { return nil, apiErr(501, "Not implemented") }

// coachingDecide is coaching::decide (admin.rs).
func coachingDecide(db *Conn, id int64, approve bool) (any, error) {
	return nil, apiErr(501, "Not implemented")
}

// coachingSetActive is coaching::set_active (admin.rs).
func coachingSetActive(db *Conn, user string, active bool) (any, error) {
	return nil, apiErr(501, "Not implemented")
}

// coachingFreeSlots is coaching::free_slots (seed.rs): the coach's free [start, end) slots in milliseconds.
func coachingFreeSlots(coach M, busy [][2]int64, from int64, days int64) [][2]int64 { return nil }
