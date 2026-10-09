package main

import "testing"

func TestDaysAreUtcDates(t *testing.T) {
	for _, c := range []struct{ got, want string }{
		{activityDay(0), "1970-01-01"},
		{activityDay(1_790_000_000_000), "2026-09-21"},
		{activityDay(951_782_400_000), "2000-02-29"},
		{activityIsoTime(0), "1970-01-01T00:00:00.000Z"},
		{activityIsoTime(1_789_984_245_006), "2026-09-21T09:50:45.006Z"},
		{activityIsoTime(951_782_400_000), "2000-02-29T00:00:00.000Z"},
	} {
		if c.got != c.want {
			t.Errorf("%s != %s", c.got, c.want)
		}
	}
}

func TestClassification(t *testing.T) {
	for _, c := range []struct {
		method, path string
		status       int
		kind         string
		important    bool
		store        bool
	}{
		{"GET", "/api/health", 429, "rate-limit", true, true},
		{"POST", "/api/auth/login", 401, "auth", true, true},
		{"GET", "/api/auth/me", 200, "api", false, true},
		{"GET", "/api/admin/overview", 200, "admin", false, true},
		{"POST", "/api/admin/users/x/revoke", 200, "admin", true, true},
		{"DELETE", "/api/admin/users/x", 200, "account", true, true},
		{"PUT", "/api/mobile/apk", 200, "release", true, true},
		{"GET", "/api/mobile/apk", 200, "mobile", false, true},
		{"GET", "/build/app.js", 200, "asset", false, false},
		{"GET", "/missing.js", 404, "not-found", false, true},
		{"GET", "/api/nope", 404, "client-error", true, true},
		{"GET", "/", 200, "page", false, true},
		{"GET", "/api/sets", 500, "server-error", true, true},
	} {
		kind, important, store := activityClassify(c.method, c.path, c.status)
		if kind != c.kind || important != c.important || store != c.store {
			t.Errorf("%s %s %d: %s %v %v", c.method, c.path, c.status, kind, important, store)
		}
	}
}
