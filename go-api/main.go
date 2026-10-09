package main

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"
	_ "time/tzdata"
)

const version = "0.1.0"

type AppState struct {
	db         *Db
	catalog    *Catalog
	hub        *LiveHub
	duel       *DuelArena
	coaching   *CoachingRooms
	matches    *TournamentLive
	attemptsMu sync.Mutex
	attempts   map[string]*attempt
	passwords  chan struct{}
	admin      *Admin
	traffic    *Traffic
}

// handler is an axum handler with its state.
type handler func(state *AppState, w http.ResponseWriter, r *http.Request)

// orphaned returns once the process that started this server has exited, when `CUBIX_EXIT_WITH_PARENT`
// is set. Test runners spawn one server per test; a runner killed mid-way must not leave
// hundreds of servers behind. A parent that dies gets replaced by init (or a subreaper).
func orphaned(gone chan<- struct{}) {
	if _, ok := os.LookupEnv("CUBIX_EXIT_WITH_PARENT"); !ok {
		return
	}
	parent := os.Getppid()
	for {
		time.Sleep(500 * time.Millisecond)
		if os.Getppid() != parent {
			gone <- struct{}{}
			return
		}
	}
}

func envOr(name, fallback string) string {
	if v, ok := os.LookupEnv(name); ok {
		return v
	}
	return fallback
}

func defaultDb() string {
	if db, ok := os.LookupEnv("CUBIX_DB"); ok {
		return db
	}
	data, ok := os.LookupEnv("XDG_DATA_HOME")
	if !ok {
		data = filepath.Join(envOr("HOME", "."), ".local/share")
	}
	return filepath.Join(data, "cubix/cubix.db")
}

// loadDotenv is dotenvy::dotenv: the first `.env` of the working directory or its parents, without overriding
// variables already set. ponytail: no `${VAR}` substitution, add it if a .env ever needs one.
func loadDotenv() {
	dir, err := os.Getwd()
	if err != nil {
		return
	}
	for {
		file, err := os.Open(filepath.Join(dir, ".env"))
		if err == nil {
			defer file.Close()
			scanner := bufio.NewScanner(file)
			for scanner.Scan() {
				line := strings.TrimSpace(scanner.Text())
				if line == "" || strings.HasPrefix(line, "#") {
					continue
				}
				line = strings.TrimPrefix(line, "export ")
				key, value, ok := strings.Cut(line, "=")
				if !ok {
					continue
				}
				key, value = strings.TrimSpace(key), strings.TrimSpace(value)
				if len(value) >= 2 && (value[0] == '"' || value[0] == '\'') && value[len(value)-1] == value[0] {
					quote := value[0]
					value = value[1 : len(value)-1]
					if quote == '"' {
						value = strings.NewReplacer(`\n`, "\n", `\"`, `"`, `\\`, `\`).Replace(value)
					}
				} else if i := strings.Index(value, " #"); i >= 0 {
					value = strings.TrimSpace(value[:i])
				}
				if _, set := os.LookupEnv(key); !set {
					os.Setenv(key, value)
				}
			}
			return
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return
		}
		dir = parent
	}
}

// fail is main returning Err: the error on stderr, exit status 1.
func fail(message string) int {
	fmt.Fprintf(os.Stderr, "Error: %q\n", message)
	return 1
}

func main() {
	os.Exit(run())
}

// seedCommand is `cubix-api seed`, built with the `seed` tag only (main_seed.go).
var seedCommand func(db *Db) error

func run() int {
	// Docker supplies .env through Compose; direct launches also load the local file.
	loadDotenv()
	args := os.Args
	has := func(flag string) bool {
		for _, arg := range args {
			if arg == flag {
				return true
			}
		}
		return false
	}
	if has("--version") {
		build := "unknown"
		if n, ok := releaseBuildNumber(); ok {
			build = fmt.Sprint(n)
		}
		fmt.Printf("cubix-api %s (build %s)\n", version, build)
		return 0
	}
	host := envOr("CUBIX_HOST", "127.0.0.1")
	port := envOr("PORT", "47129")
	for i, arg := range args {
		if arg == "--host" {
			host = "0.0.0.0"
			if i+1 < len(args) && !strings.HasPrefix(args[i+1], "--") {
				host = args[i+1]
			}
		}
		if arg == "--port" {
			if i+1 >= len(args) {
				return fail("--port requires a value")
			}
			port = args[i+1]
		}
	}
	path := defaultDb()
	db, err := dbOpen(path)
	if err != nil {
		return fail("Database: " + toApiError(err).Message)
	}
	if has("--init-db") {
		return 0
	}
	// `cubix-api admin-token` (or `--admin-token`), run inside the container: the only way to
	// obtain the administration token. It shares the database, so the server may keep running.
	if (len(args) > 1 && args[1] == "admin-token") || has("--admin-token") {
		if has("--revoke") {
			existed, err := dbCall(db, adminDisable)
			if err != nil {
				return fail(toApiError(err).Message)
			}
			if existed {
				fmt.Println("Administration disabled: the admin token and every admin session are revoked.")
			} else {
				fmt.Println("Administration was already disabled.")
			}
		} else {
			token, err := dbCall(db, adminRotate)
			if err != nil {
				return fail(toApiError(err).Message)
			}
			fmt.Println(token)
			fmt.Println("Paste this token on /admin; it is shown only once. Running admin-token again replaces it and signs every admin session out.")
		}
		return 0
	}
	// `cubix-api seed`, in development images only (compose.dev.yaml): fills an empty database.
	if seedCommand != nil && len(args) > 1 && args[1] == "seed" {
		if err := seedCommand(db); err != nil {
			return fail(toApiError(err).Message)
		}
		return 0
	}
	for index, arg := range args {
		if arg != "--import-history" {
			continue
		}
		if index+1 >= len(args) {
			return fail("--import-history requires a username")
		}
		name := strings.ToLower(strings.TrimSpace(args[index+1]))
		var solves, sessions int64
		err := db.Call(func(db *Conn) error {
			user, err := accountsByUsername(db, name)
			if err != nil {
				return err
			}
			if user == nil {
				return apiErr(404, "Account does not exist. Create it in Cubix first.")
			}
			id := str(user["id"])
			tx, err := db.Begin()
			if err != nil {
				return err
			}
			defer tx.Rollback()
			if sessions, err = db.Exec("UPDATE sessions SET user_id=? WHERE user_id IS NULL", id); err != nil {
				return err
			}
			if solves, err = db.Exec("UPDATE solves SET user_id=? WHERE user_id IS NULL", id); err != nil {
				return err
			}
			return tx.Commit()
		})
		if err != nil {
			return fail(toApiError(err).Message)
		}
		fmt.Printf("Imported %d legacy times and %d sessions into @%s.\n", solves, sessions, name)
		return 0
	}
	log := newActivityLog(db)
	traffic := newTraffic(log)
	admin, err := newAdmin()
	if err != nil {
		return fail(err.Error())
	}
	duel := newDuelArena(log)
	go duelRun(duel)
	state := &AppState{
		admin:     admin,
		traffic:   traffic,
		db:        db,
		catalog:   catalogLoad(),
		hub:       newLiveHub(),
		duel:      duel,
		coaching:  newCoachingRooms(),
		matches:   newTournamentLive(),
		attempts:  map[string]*attempt{},
		passwords: make(chan struct{}, 4),
	}
	// Tournaments start at their date.
	go tournamentRun(state)
	app := state.routes()
	// Optional extra listeners let local load generators use separate TCP port pools.
	// All listeners share the same runtime, SQLite worker, authentication and live hub.
	ports := []string{port}
	for _, p := range strings.Split(envOr("CUBIX_EXTRA_PORTS", ""), ",") {
		if p != "" {
			ports = append(ports, p)
		}
	}
	failed := make(chan error, len(ports))
	for _, port := range ports {
		listener, err := net.Listen("tcp", host+":"+port)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			return 1
		}
		fmt.Printf("Cubix Go: http://%s (db: %s)\n", listener.Addr(), path)
		go func() { failed <- (&http.Server{Handler: app}).Serve(listener) }()
	}
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	gone := make(chan struct{}, 1)
	go orphaned(gone)
	code := 0
	select {
	case <-signals:
	case <-gone:
		fmt.Fprintln(os.Stderr, "Parent process gone; stopping.")
	case err := <-failed:
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		code = 1
	}
	// Requests already answered reach the persistent log before the process exits.
	log.flush()
	return code
}

// routes is main's router: the API with its body limits, `Cache-Control: no-store` and permissive CORS, the
// administration's routes, the web application as the fallback, and the traffic monitor around everything.
func (s *AppState) routes() http.Handler {
	// Without the web application, axum's default fallback answers, under the routers' `no-store`.
	fallback := http.Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusNotFound)
	}))
	if dir, ok := webDirectory(); ok {
		fmt.Printf("Cubix web: %s\n", dir)
		fallback = webRouter(dir)
	} else {
		fmt.Println("Cubix web: not built, serving the API only")
	}
	mux := http.NewServeMux()
	route := func(cors bool, pattern string, limit int64, methods map[string]handler) http.Handler {
		h := s.endpoint(cors, limit, methods)
		mux.Handle(pattern, h)
		return h
	}
	every := func(h handler) map[string]handler { return map[string]handler{"*": h} }
	get := func(h handler) map[string]handler { return map[string]handler{"GET": h} }
	const json = 2 * 1024 * 1024
	route(false, "/api/admin/live", 4096, get(adminUpgrade))
	admin := s.endpoint(false, 4096, every(adminDispatch))
	route(true, "/api/live", json, get(liveUpgrade))
	// Pictures and videos in coaching conversations travel raw, above the JSON limit below.
	route(true, "/api/coaching/conversations/{id}/media", coachingMediaMax, map[string]handler{"POST": coachingUpload})
	route(true, "/api/coaching/media/{id}", json, get(coachingMedia))
	route(true, "/api/coaching/avatar", 4*1024*1024, map[string]handler{"PUT": coachingSetAvatar, "DELETE": coachingSetAvatar})
	route(true, "/api/avatars/{file}", json, get(coachingAvatar))
	// The APK upload carries a whole Android build, far above the JSON limit below.
	route(true, "/api/mobile/apk", 256*1024*1024, map[string]handler{"GET": releaseApk, "PUT": releaseUpload})
	// The desktop packages the landing page's install commands download.
	route(true, "/api/desktop", json, get(desktopInfo))
	route(true, "/api/desktop/{name}", 512*1024*1024, map[string]handler{"GET": desktopDownload, "PUT": desktopUpload})
	// Over-the-air JavaScript updates: the bundle weighs a few megabytes.
	route(true, "/api/mobile/updates/assets/{hash}", 64*1024*1024, map[string]handler{"GET": releaseAsset, "PUT": releaseUploadAsset})
	route(true, "/api/mobile/updates", json, map[string]handler{"PUT": releasePublish})
	route(true, "/api/mobile/updates/manifest", json, get(releaseManifest))
	api := s.endpoint(true, json, every(apiDispatch))
	// An empty catch-all matches no route in axum: `/api/` is the fallback's. The exact
	// patterns keep ServeMux from redirecting `/api` and `/api/admin` to them.
	mux.Handle("/api", fallback)
	mux.Handle("/api/admin", api)
	mux.HandleFunc("/api/{path...}", func(w http.ResponseWriter, r *http.Request) {
		if r.PathValue("path") == "" {
			fallback.ServeHTTP(w, r)
			return
		}
		api.ServeHTTP(w, r)
	})
	mux.HandleFunc("/api/admin/{path...}", func(w http.ResponseWriter, r *http.Request) {
		// `/api/admin/` is `/api/{*path}` with the path `admin/`.
		if r.PathValue("path") == "" {
			api.ServeHTTP(w, r)
			return
		}
		admin.ServeHTTP(w, r)
	})
	mux.Handle("/", fallback)
	// ServeMux redirects paths with `//`, `.` or `..`; axum routes them as they are, by their prefix.
	router := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		if c := path.Clean(p); c == p || c+"/" == p {
			mux.ServeHTTP(w, r)
		} else if strings.HasPrefix(p, "/api/admin/") {
			admin.ServeHTTP(w, r)
		} else if strings.HasPrefix(p, "/api/") {
			api.ServeHTTP(w, r)
		} else {
			fallback.ServeHTTP(w, r)
		}
	})
	return trafficMonitor(s.traffic, router)
}

type limitKey struct{}

// endpoint is one route: its methods (`*` for any; GET answers HEAD too), its body limit, `no-store` and, for the
// API, CORS::permissive.
func (s *AppState) endpoint(cors bool, limit int64, methods map[string]handler) http.Handler {
	var allow []string
	for _, m := range []string{"GET", "HEAD", "POST", "PUT", "DELETE", "PATCH"} {
		if methods[m] != nil || (m == "HEAD" && methods["GET"] != nil) {
			allow = append(allow, m)
		}
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if cors {
			h := w.Header()
			h.Set("Access-Control-Allow-Origin", "*")
			h.Add("Vary", "origin, access-control-request-method, access-control-request-headers")
			if r.Method == http.MethodOptions {
				h.Set("Access-Control-Allow-Methods", "*")
				h.Set("Access-Control-Allow-Headers", "*")
				w.WriteHeader(http.StatusOK)
				return
			}
			h.Set("Access-Control-Expose-Headers", "*")
		}
		onHeader(w, func(h http.Header, _ int) { h.Set("Cache-Control", "no-store") })
		h := methods["*"]
		if h == nil {
			h = methods[r.Method]
		}
		if h == nil && r.Method == "HEAD" {
			h = methods["GET"]
		}
		if h == nil {
			w.Header().Set("Allow", strings.Join(allow, ","))
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		h(s, w, r.WithContext(context.WithValue(r.Context(), limitKey{}, limit)))
	})
}

// readBody is axum's `Bytes` extractor under the route's body limit; on failure it has answered.
func readBody(w http.ResponseWriter, r *http.Request) ([]byte, bool) {
	limit, ok := r.Context().Value(limitKey{}).(int64)
	if !ok {
		limit = 2 * 1024 * 1024
	}
	tooLarge := func() ([]byte, bool) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusRequestEntityTooLarge)
		_, _ = io.WriteString(w, "Failed to buffer the request body: length limit exceeded")
		return nil, false
	}
	if r.ContentLength > limit {
		return tooLarge()
	}
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, limit))
	if err != nil {
		var max *http.MaxBytesError
		if errors.As(err, &max) {
			return tooLarge()
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = io.WriteString(w, "Failed to buffer the request body: "+err.Error())
		return nil, false
	}
	return data, true
}
