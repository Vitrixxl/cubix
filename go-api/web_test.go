package main

import (
	"net/http/httptest"
	"testing"
)

func TestWebTrailingSlash(t *testing.T) {
	router := webRouter(t.TempDir())
	for path, want := range map[string]string{
		"/timer/?puzzle=333":       "/timer?puzzle=333",
		"/fr/algorithms/OLL%2021/": "/fr/algorithms/OLL%2021",
		"/fr/":                     "",
		"//evil.example/timer/":    "",
		"/timer//":                 "",
	} {
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if got := w.Header().Get("Location"); (w.Code == 301) != (want != "") || got != want {
			t.Errorf("%s: %d %q, want %q", path, w.Code, got, want)
		}
	}
}
