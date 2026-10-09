package main

// The web application built by `desktop/web.ts`, which the desktop app loads too.
// Only files that exist are served, the administration's pages (`/admin`, `/admin/…`) and the app's: each of its
// addresses, under the prefix of its language but English's (`/fr/timer`), is its page written ahead of time
// (`desktop/prerender.tsx`) when it has one, else the single-page app's `index.html`. The site's root is the landing
// page (`landing.html`): the app lives under its own paths, `/timer` first.

import (
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"unicode/utf8"
)

// webPages: the first segment of every address of the app (`src/client/lib/route.ts`).
var webPages = []string{
	"login", "onboarding", "timer", "algorithms", "training", "duel", "learn", "coaching", "community",
	"tournaments", "match", "profile", "solve",
}

// webLanguages: the languages whose pages live under their prefix; English's are at the root.
var webLanguages = []string{"fr", "es", "it", "de"}

// webDirectory: `CUBIX_WEB_DIR`, else `dist/web` next to the working directory when it has been built.
func webDirectory() (string, bool) {
	dir, ok := os.LookupEnv("CUBIX_WEB_DIR")
	if !ok {
		dir = "dist/web"
	}
	info, err := os.Stat(filepath.Join(dir, "index.html"))
	return dir, err == nil && info.Mode().IsRegular()
}

func isFile(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.Mode().IsRegular()
}

func webRouter(dir string) http.Handler {
	// A build from before the landing page keeps the app at the root.
	landing := "index.html"
	if isFile(filepath.Join(dir, "landing.html")) {
		landing = "landing.html"
	}
	files := map[string]string{
		"/":      landing,
		"/admin": "index.html",
		// The legal notice, the privacy policy and the terms of use, pages of their own.
		"/legal":   "legal.html",
		"/privacy": "privacy.html",
		"/terms":   "terms.html",
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		webCache(w, r)
		path := r.URL.EscapedPath()
		if file, ok := files[path]; ok {
			webServeFile(w, r, filepath.Join(dir, file))
			return
		}
		if page, ok := strings.CutPrefix(path, "/admin/"); ok && page != "" {
			webServeFile(w, r, filepath.Join(dir, "index.html"))
			return
		}
		webPage(dir, w, r)
	})
}

// webAppPath: an address of the app: its language and its path under it, decoded (`algorithms/OLL 21`); none for any
// other address or one naming anything outside the app's pages.
func webAppPath(path string) (string, string, bool) {
	rest, ok := strings.CutPrefix(path, "/")
	if !ok {
		return "", "", false
	}
	language := "en"
	if first, after, ok := strings.Cut(rest, "/"); ok && slices.Contains(webLanguages, first) {
		language = first
		rest = after
	}
	first, _, _ := strings.Cut(rest, "/")
	if !slices.Contains(webPages, first) {
		return "", "", false
	}
	decoded := percentDecode(rest)
	if !utf8.Valid(decoded) {
		return "", "", false
	}
	for _, part := range strings.Split(string(decoded), "/") {
		if part == "" || part == "." || part == ".." || strings.ContainsAny(part, "\\\x00") {
			return "", "", false
		}
	}
	return language, string(decoded), true
}

// webPage: the app's address `path`: its page in its language (`pages/<language>/<path>[@<puzzle>[~<step>]].html`,
// compressed as the browser accepts it), trying without the step, then without the puzzle; else the app's
// `index.html`. Any other address is a file of the build.
func webPage(dir string, w http.ResponseWriter, r *http.Request) {
	language, path, ok := webAppPath(r.URL.EscapedPath())
	if !ok {
		webServeDir(w, r, dir)
		return
	}
	if r.Method != "GET" && r.Method != "HEAD" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	query := parseQuery(r.URL.RawQuery)
	plain := func(key string) (string, bool) {
		v, ok := query[key]
		if !ok || v == "" {
			return "", false
		}
		for i := 0; i < len(v); i++ {
			c := v[i]
			if !('a' <= c && c <= 'z' || 'A' <= c && c <= 'Z' || '0' <= c && c <= '9') {
				return "", false
			}
		}
		return v, true
	}
	var names []string
	if puzzle, ok := plain("puzzle"); ok {
		if step, ok := plain("step"); ok {
			names = append(names, path+"@"+puzzle+"~"+step)
		}
		names = append(names, path+"@"+puzzle)
	}
	names = append(names, path)
	if encoding := webAccepted(r); encoding != "" {
		extension := "gz"
		if encoding == "br" {
			extension = "br"
		}
		for _, name := range names {
			if bytes, err := os.ReadFile(filepath.Join(dir, "pages", language, name+".html."+extension)); err == nil {
				h := w.Header()
				h.Set("Content-Type", "text/html; charset=utf-8")
				h.Set("Content-Encoding", encoding)
				h.Set("Vary", "accept-encoding")
				w.WriteHeader(200)
				if r.Method != "HEAD" {
					_, _ = w.Write(bytes)
				}
				return
			}
		}
	}
	webServeFile(w, r, filepath.Join(dir, "index.html"))
}

// webAccepted: br, else gzip, when the request's Accept-Encoding names it.
func webAccepted(r *http.Request) string {
	accepted := headerText(r, "Accept-Encoding")
	for _, encoding := range []string{"br", "gzip"} {
		for _, a := range strings.Split(accepted, ",") {
			name, _, _ := strings.Cut(a, ";")
			if strings.TrimSpace(name) == encoding {
				return encoding
			}
		}
	}
	return ""
}

// webServeDir is tower-http's ServeDir: the request's path under `dir`, `index.html` for a directory.
func webServeDir(w http.ResponseWriter, r *http.Request, dir string) {
	if r.Method != "GET" && r.Method != "HEAD" {
		w.Header().Set("Allow", "GET,HEAD")
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	decoded := percentDecode(strings.TrimPrefix(r.URL.EscapedPath(), "/"))
	if !utf8.Valid(decoded) {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	full := dir
	for _, part := range strings.Split(string(decoded), "/") {
		switch {
		case part == "" || part == ".":
		case part == ".." || strings.ContainsAny(part, "\\\x00") || filepath.IsAbs(part):
			w.WriteHeader(http.StatusNotFound)
			return
		default:
			full = filepath.Join(full, part)
		}
	}
	if info, err := os.Stat(full); err == nil && info.IsDir() {
		if !strings.HasSuffix(r.URL.EscapedPath(), "/") {
			location := r.URL.EscapedPath() + "/"
			if r.URL.RawQuery != "" {
				location += "?" + r.URL.RawQuery
			}
			w.Header().Set("Location", location)
			w.WriteHeader(http.StatusTemporaryRedirect)
			return
		}
		full = filepath.Join(full, "index.html")
	}
	webServeFile(w, r, full)
}

// webServeFile is tower-http's ServeFile with precompressed br and gzip variants.
func webServeFile(w http.ResponseWriter, r *http.Request, path string) {
	if r.Method != "GET" && r.Method != "HEAD" {
		w.Header().Set("Allow", "GET,HEAD")
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	served := path
	encoding := webAccepted(r)
	if encoding != "" {
		extension := ".gz"
		if encoding == "br" {
			extension = ".br"
		}
		if isFile(path + extension) {
			served = path + extension
		} else if encoding == "br" && strings.Contains(headerText(r, "Accept-Encoding"), "gzip") && isFile(path+".gz") {
			served, encoding = path+".gz", "gzip"
		} else {
			encoding = ""
		}
	}
	file, err := os.Open(served)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	kind := mime.TypeByExtension(filepath.Ext(path))
	if kind == "" {
		kind = "application/octet-stream"
	}
	h := w.Header()
	h.Set("Content-Type", kind)
	if encoding != "" {
		h.Set("Content-Encoding", encoding)
	}
	http.ServeContent(w, r, "", info.ModTime(), file)
}

// webCache: bundles carry a content hash and vendor modules their version in the path.
func webCache(w http.ResponseWriter, r *http.Request) {
	path := r.URL.EscapedPath()
	immutable := strings.HasPrefix(path, "/build/") || strings.HasPrefix(path, "/vendor/")
	onHeader(w, func(h http.Header, status int) {
		if status >= 200 && status < 300 || status == http.StatusNotModified {
			if immutable {
				h.Set("Cache-Control", "public, max-age=31536000, immutable")
			} else {
				h.Set("Cache-Control", "no-cache")
			}
		}
		h.Set("X-Content-Type-Options", "nosniff")
	})
}
