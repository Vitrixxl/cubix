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
	router := webRouter(t.TempDir(), nil)
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
	router := webRouter(dir, nil)
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

func TestWebLocalizedCaseNotIndexed(t *testing.T) {
	dir := t.TempDir()
	for _, sub := range []string{"pages/en/algorithms", "pages/fr"} {
		if err := os.MkdirAll(filepath.Join(dir, sub), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	_ = os.WriteFile(filepath.Join(dir, "index.html"), []byte("app"), 0o644)
	_ = os.WriteFile(filepath.Join(dir, "pages", "en", "algorithms", "OLL 21.html.gz"), []byte("case"), 0o644)
	_ = os.WriteFile(filepath.Join(dir, "pages", "fr", "timer.html.gz"), []byte("chrono"), 0o644)
	router := webRouter(dir, nil)
	for path, want := range map[string]string{
		"/fr/algorithms/OLL%2021":            "noindex",
		"/de/algorithms/OLL%2021?puzzle=333": "noindex",
		"/algorithms/OLL%2021":               "",
		"/fr/timer":                          "",
		"/fr/training":                       "",
	} {
		for _, method := range []string{"GET", "HEAD"} {
			r := httptest.NewRequest(method, path, nil)
			r.Header.Set("Accept-Encoding", "gzip")
			w := httptest.NewRecorder()
			router.ServeHTTP(w, r)
			if got := w.Header().Get("X-Robots-Tag"); w.Code != 200 || got != want {
				t.Errorf("%s %s: %d %q, want %q", method, path, w.Code, got, want)
			}
		}
	}
}
