package main

import (
	"bytes"
	"compress/gzip"
	"net/http/httptest"
	"os"
	"path/filepath"
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

func TestWebPageWithoutBrotli(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "pages", "en"), 0o755); err != nil {
		t.Fatal(err)
	}
	var packed bytes.Buffer
	zw := gzip.NewWriter(&packed)
	_, _ = zw.Write([]byte("<h1>Timer</h1>"))
	_ = zw.Close()
	_ = os.WriteFile(filepath.Join(dir, "pages", "en", "timer.html.gz"), packed.Bytes(), 0o644)
	_ = os.WriteFile(filepath.Join(dir, "pages", "en", "timer.html.br"), []byte("brotli"), 0o644)
	router := webRouter(dir)
	for encoding, want := range map[string]string{"br, gzip": "brotli", "gzip": packed.String(), "": "<h1>Timer</h1>"} {
		r := httptest.NewRequest("GET", "/timer", nil)
		if encoding != "" {
			r.Header.Set("Accept-Encoding", encoding)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		if w.Code != 200 || w.Body.String() != want {
			t.Errorf("%q: %d %q", encoding, w.Code, w.Body.String())
		}
	}
}
