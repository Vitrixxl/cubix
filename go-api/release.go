package main

// Mobile release information, the Android APK the server hands out and the over-the-air
// JavaScript updates expo-updates fetches from it.
//
// The server and the APK are built from the same commit, but not in the same place: the
// Raspberry Pi has neither the memory for Gradle nor an ARM64 Android NDK. `scripts/deploy.ts`
// therefore builds the APK on the developer's machine and uploads it here with the admin
// password. The file lives next to the database, so it survives container rebuilds, and the
// application only offers an APK download once a build with another runtime version (that is,
// other native code) has been uploaded.
//
// Most deployments only change JavaScript. For those the script runs `expo export` and
// publishes the bundle here: each asset is stored under its SHA-256 and a manifest per runtime
// version points at them. Phones ask `GET /api/mobile/updates/manifest` on launch following the
// expo-updates protocol (version 1) and download a newer bundle for their next start.

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

const releaseApkFile = "cubix-android-arm64.apk"
const releaseMetaFile = "cubix-android-arm64.json"

// Path the application downloads from; `releaseInfo` announces it so clients need not hard-code it.
const releaseApkPath = "/api/mobile/apk"

// Over-the-air assets are served from here, followed by their hexadecimal SHA-256.
const releaseAssetsPath = "/api/mobile/updates/assets"

// releaseParseUint is Rust's `str::parse::<u64>`: digits, optionally after one `+`.
func releaseParseUint(text string) (uint64, bool) {
	n, err := strconv.ParseUint(strings.TrimPrefix(text, "+"), 10, 64)
	return n, err == nil
}

// releaseBuildNumber: commit time in minutes since the Unix epoch; see `CUBIX_BUILD_NUMBER` in the Dockerfile.
func releaseBuildNumber() (uint64, bool) {
	n, ok := releaseParseUint(strings.TrimSpace(os.Getenv("CUBIX_BUILD_NUMBER")))
	return n, ok && n > 0
}

func releaseCommit() (string, bool) {
	commit := strings.TrimSpace(os.Getenv("CUBIX_COMMIT"))
	return commit, commit != ""
}

// releaseApkDir: `CUBIX_APK_DIR`, or an `apk` directory beside the SQLite database.
func releaseApkDir() string {
	if dir := os.Getenv("CUBIX_APK_DIR"); dir != "" {
		return dir
	}
	db, ok := os.LookupEnv("CUBIX_DB")
	if !ok {
		db = "cubix.db"
	}
	return filepath.Join(filepath.Dir(db), "apk")
}

// releaseReadJSON: a JSON file's value, nil when it is missing or not JSON.
func releaseReadJSON(path string) any {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	value, err := decodeJSON(data)
	if err != nil {
		return nil
	}
	return value
}

// releasePretty is serde_json::to_vec_pretty.
func releasePretty(v any) []byte {
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
	return bytes.TrimSuffix(b.Bytes(), []byte("\n"))
}

// releaseMetadata: metadata written next to the APK at upload time; nil when nothing was uploaded yet.
func releaseMetadata() any {
	meta := releaseReadJSON(filepath.Join(releaseApkDir(), releaseMetaFile))
	if _, ok := asUint(idx(meta, "build")); !ok || !isFile(filepath.Join(releaseApkDir(), releaseApkFile)) {
		return nil
	}
	return meta
}

func releaseInfo() any {
	apk := releaseMetadata()
	var build, commit any
	if n, ok := releaseBuildNumber(); ok {
		build = n
	}
	if c, ok := releaseCommit(); ok {
		commit = c
	}
	return M{
		"version":           version,
		"build":             build,
		"commit":            commit,
		"apk":               releaseApkPath,
		"apkBuild":          idx(apk, "build"),
		"apkCommit":         idx(apk, "commit"),
		"apkRuntimeVersion": idx(apk, "runtimeVersion"),
		"apkSha256":         idx(apk, "sha256"),
		"apkSize":           idx(apk, "size"),
		"apkUploadedAt":     idx(apk, "uploadedAt"),
		"updates":           releasePublishedUpdates(),
	}
}

// releasePublishedUpdates: the over-the-air update stored for each runtime version, so the deploy script knows
// what to skip.
func releasePublishedUpdates() M {
	updates := M{}
	entries, err := os.ReadDir(releaseUpdatesDir())
	if err != nil {
		return updates
	}
	for _, entry := range entries {
		runtime, ok := strings.CutSuffix(entry.Name(), ".json")
		if !ok {
			continue
		}
		if update := releaseReadUpdate(runtime); update != nil {
			updates[runtime] = M{"id": update["id"], "build": update["build"], "commit": update["commit"], "createdAt": update["createdAt"]}
		}
	}
	return updates
}

// releaseFile answers stored bytes with their headers, as `bytes.into_response()` with headers inserted.
func releaseFile(w http.ResponseWriter, data []byte, headers map[string]string) {
	for name, value := range headers {
		w.Header().Set(name, value)
	}
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	w.WriteHeader(200)
	_, _ = w.Write(data)
}

// releaseApk: `GET /api/mobile/apk` sends the uploaded APK; the phone's browser offers to install it.
func releaseApk(state *AppState, w http.ResponseWriter, r *http.Request) {
	meta := releaseMetadata()
	if meta == nil {
		writeError(w, apiErr(404, "No APK has been uploaded to this server yet"))
		return
	}
	data, err := os.ReadFile(filepath.Join(releaseApkDir(), releaseApkFile))
	if err != nil {
		writeError(w, internal(err))
		return
	}
	headers := map[string]string{
		"Content-Type":        "application/vnd.android.package-archive",
		"Content-Disposition": `attachment; filename="cubix-android-arm64.apk"`,
	}
	if sha, ok := asStr(idx(meta, "sha256")); ok && releaseHeaderValue(sha) {
		headers["ETag"] = `"` + sha + `"`
	}
	releaseFile(w, data, headers)
}

// releaseHeaderValue is HeaderValue::from_str succeeding: visible ASCII, spaces and tabs.
func releaseHeaderValue(value string) bool {
	for i := 0; i < len(value); i++ {
		if c := value[i]; c != '\t' && (c < 32 || c == 127) {
			return false
		}
	}
	return true
}

// releaseUpload: `PUT /api/mobile/apk` with `Authorization: Bearer <admin password>`, `X-Cubix-Build` and
// `X-Cubix-Commit` stores a new APK atomically. Uploading the same build again is harmless.
func releaseUpload(state *AppState, w http.ResponseWriter, r *http.Request) {
	body, ok := readBody(w, r)
	if !ok {
		return
	}
	value, err := releaseStoreApk(state, r, body)
	writeResult(w, value, err)
}

func releaseStoreApk(state *AppState, r *http.Request, body []byte) (any, error) {
	if err := releaseAuthorize(state, r); err != nil {
		return nil, err
	}
	build, ok := releaseParseUint(releaseHeaderText(r, "X-Cubix-Build"))
	if !ok || build == 0 {
		return nil, apiErr(422, "X-Cubix-Build must be a positive build number")
	}
	commit := releaseHeaderText(r, "X-Cubix-Commit")
	if !releaseIsCommit(commit) {
		return nil, apiErr(422, "X-Cubix-Commit must be a hexadecimal commit")
	}
	// APKs built before expo-updates carry no runtime version; the application then falls
	// back to comparing build numbers.
	var runtime any
	if value := releaseHeaderText(r, "X-Cubix-Runtime"); value != "" {
		if !releaseIsRuntimeVersion(value) {
			return nil, apiErr(422, "X-Cubix-Runtime is not a runtime version")
		}
		runtime = value
	}
	// Every APK is a ZIP archive; anything else is a wrong file, not a signed build.
	if len(body) < 1024 || !bytes.HasPrefix(body, []byte("PK\x03\x04")) {
		return nil, apiErr(422, "The body is not an APK")
	}
	sum := sha256.Sum256(body)
	size := len(body)
	meta := M{
		"build":          build,
		"commit":         commit,
		"runtimeVersion": runtime,
		"sha256":         hex.EncodeToString(sum[:]),
		"size":           size,
		"uploadedAt":     accountsNow(),
	}
	dir := releaseApkDir()
	err := func() error {
		if err := os.MkdirAll(dir, 0o777); err != nil {
			return err
		}
		if err := releaseReplace(filepath.Join(dir, releaseApkFile), filepath.Join(dir, releaseApkFile+".tmp"), body); err != nil {
			return err
		}
		return releaseReplace(filepath.Join(dir, releaseMetaFile), filepath.Join(dir, releaseMetaFile+".tmp"), releasePretty(meta))
	}()
	if err != nil {
		return nil, internal(err)
	}
	fmt.Printf("Stored APK build %d (%s) — %d bytes\n", build, commit[:min(len(commit), 7)], size)
	return releaseInfo(), nil
}

// releaseReplace writes `data` to `temporary`, then renames it over `path`.
func releaseReplace(path, temporary string, data []byte) error {
	if err := os.WriteFile(temporary, data, 0o666); err != nil {
		return err
	}
	return os.Rename(temporary, path)
}

// releaseAuthorize checks `CUBIX_ADMIN_PASSWORD`, sent as `Authorization: Bearer <password>` by
// `scripts/deploy.ts`. This password is kept for mobile uploads only: the web administration
// uses the token generated by `cubix-api admin-token` instead.
func releaseAuthorize(state *AppState, r *http.Request) error {
	header, _ := adminHeader(r, "Authorization")
	password, found := strings.CutPrefix(header, "Bearer ")
	password = strings.TrimSpace(password)
	present := found && password != "" && len(password) <= 256
	if !state.admin.uploadConfigured() {
		return apiErr(503, "Set CUBIX_ADMIN_PASSWORD in .env to accept mobile uploads")
	}
	if !present {
		return apiErr(401, "Missing admin password")
	}
	ok, _, err := state.admin.verifyUpload(password)
	if err != nil {
		return err
	}
	if !ok {
		return apiErr(401, "Incorrect password")
	}
	return nil
}

// releaseHeaderText: a header's trimmed text, "" when missing, empty or not visible ASCII.
func releaseHeaderText(r *http.Request, name string) string {
	value, _ := adminHeader(r, name)
	return strings.TrimSpace(value)
}

func releaseIsCommit(value string) bool {
	if value == "" || len(value) > 64 {
		return false
	}
	for i := 0; i < len(value); i++ {
		if _, ok := unhex(value[i]); !ok {
			return false
		}
	}
	return true
}

func releaseIsAlphanumeric(c byte) bool {
	return 'a' <= c && c <= 'z' || 'A' <= c && c <= 'Z' || '0' <= c && c <= '9'
}

// releaseIsRuntimeVersion: runtime versions name files on disk, so only a conservative character set is accepted.
func releaseIsRuntimeVersion(value string) bool {
	if value == "" || len(value) > 64 {
		return false
	}
	for i := 0; i < len(value); i++ {
		if c := value[i]; !releaseIsAlphanumeric(c) && c != '.' && c != '-' && c != '_' {
			return false
		}
	}
	return true
}

func releaseIsSha256(value string) bool {
	return len(value) == 64 && releaseIsCommit(value)
}

// ---------------------------------------------------------------------------------------------
// Over-the-air updates
// ---------------------------------------------------------------------------------------------

func releaseUpdatesDir() string {
	return filepath.Join(releaseApkDir(), "updates")
}

func releaseAssetsDir() string {
	return filepath.Join(releaseUpdatesDir(), "assets")
}

func releaseReadUpdate(runtime string) M {
	update, ok := asObject(releaseReadJSON(filepath.Join(releaseUpdatesDir(), runtime+".json")))
	if !ok {
		return nil
	}
	if _, ok := asStr(update["id"]); !ok {
		return nil
	}
	if _, ok := asObject(update["launchAsset"]); !ok {
		return nil
	}
	return update
}

// releaseWriteAtomically writes beside `path` (its extension followed by `.tmp`), then renames.
func releaseWriteAtomically(path string, data []byte) error {
	// Path::with_extension(format!("{ext}.tmp")): `x.json` → `x.json.tmp`, `hash` → `hash..tmp`.
	temporary := path + ".tmp"
	if filepath.Ext(path) == "" {
		temporary = path + "..tmp"
	}
	return releaseReplace(path, temporary, data)
}

// releaseUploadAsset: `PUT /api/mobile/updates/assets/{sha256}` stores one exported file under its hash. The
// content is verified against the path, so a corrupt upload is refused rather than served.
func releaseUploadAsset(state *AppState, w http.ResponseWriter, r *http.Request) {
	body, ok := readBody(w, r)
	if !ok {
		return
	}
	value, err := func() (any, error) {
		if err := releaseAuthorize(state, r); err != nil {
			return nil, err
		}
		hash := r.PathValue("hash")
		if !releaseIsSha256(hash) {
			return nil, apiErr(422, "The asset path must be a hexadecimal SHA-256")
		}
		if len(body) == 0 {
			return nil, apiErr(422, "The asset is empty")
		}
		if sum := sha256.Sum256(body); hex.EncodeToString(sum[:]) != hash {
			return nil, apiErr(422, "The asset does not match its SHA-256")
		}
		dir := releaseAssetsDir()
		if err := os.MkdirAll(dir, 0o777); err != nil {
			return nil, internal(err)
		}
		if err := releaseWriteAtomically(filepath.Join(dir, hash), body); err != nil {
			return nil, internal(err)
		}
		return M{"size": len(body)}, nil
	}()
	writeResult(w, value, err)
}

// releaseAssetEntry validates one manifest asset from the publish request and keeps the fields expo-updates reads.
func releaseAssetEntry(value any, launch bool) (M, error) {
	hash, hashOk := asStr(idx(value, "hash"))
	hashOk = hashOk && releaseIsSha256(hash)
	key, keyOk := asStr(idx(value, "key"))
	keyOk = keyOk && key != "" && len(key) <= 128
	for i := 0; keyOk && i < len(key); i++ {
		if c := key[i]; !releaseIsAlphanumeric(c) && c != '-' && c != '_' && c != '.' {
			keyOk = false
		}
	}
	contentType, typeOk := asStr(idx(value, "contentType"))
	typeOk = typeOk && contentType != "" && len(contentType) <= 128
	for i := 0; typeOk && i < len(contentType); i++ {
		if contentType[i] >= 128 {
			typeOk = false
		}
	}
	rawExtension, isString := asStr(idx(value, "fileExtension"))
	var extension any
	if isString && strings.HasPrefix(rawExtension, ".") && len(rawExtension) <= 16 {
		extension = rawExtension
		for i := 1; i < len(rawExtension); i++ {
			if !releaseIsAlphanumeric(rawExtension[i]) {
				extension = nil
			}
		}
	}
	if !hashOk || !keyOk || !typeOk {
		return nil, apiErr(422, "Each asset needs a SHA-256 hash, a key and a content type")
	}
	if extension == nil && (!launch || isString) {
		return nil, apiErr(422, `Asset file extensions look like ".png"`)
	}
	if !isFile(filepath.Join(releaseAssetsDir(), hash)) {
		return nil, apiErr(422, fmt.Sprintf("Asset %s was not uploaded", hash))
	}
	return M{"hash": hash, "key": key, "contentType": contentType, "fileExtension": extension}, nil
}

// releaseJSONBody is axum's `Json<Value>` extractor; on a rejection it has answered.
func releaseJSONBody(w http.ResponseWriter, r *http.Request) (any, bool) {
	reject := func(status int, message string) (any, bool) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(status)
		_, _ = io.WriteString(w, message)
		return nil, false
	}
	contentType, _ := adminHeader(r, "Content-Type")
	media, _, err := mime.ParseMediaType(contentType)
	kind, subtype, _ := strings.Cut(media, "/")
	if err != nil || kind != "application" || (subtype != "json" && !strings.HasSuffix(subtype, "+json")) {
		return reject(415, "Expected request with `Content-Type: application/json`")
	}
	data, ok := readBody(w, r)
	if !ok {
		return nil, false
	}
	value, err := decodeJSON(data)
	if err != nil {
		return reject(400, "Failed to parse the request body as JSON: "+err.Error())
	}
	return value, true
}

// releasePublish: `PUT /api/mobile/updates` publishes a manifest for one runtime version once its assets are
// stored. The body carries `runtimeVersion`, `build`, `commit`, `launchAsset`, `assets` and
// the public Expo config (`expoClient`) the application reads through `Constants.expoConfig`.
// Republishing the same commit keeps the existing update id, so phones do not download it again.
func releasePublish(state *AppState, w http.ResponseWriter, r *http.Request) {
	body, ok := releaseJSONBody(w, r)
	if !ok {
		return
	}
	value, err := releaseStoreUpdate(state, r, body)
	writeResult(w, value, err)
}

func releaseStoreUpdate(state *AppState, r *http.Request, body any) (any, error) {
	if err := releaseAuthorize(state, r); err != nil {
		return nil, err
	}
	runtime, ok := asStr(idx(body, "runtimeVersion"))
	if !ok || !releaseIsRuntimeVersion(runtime) {
		return nil, apiErr(422, "runtimeVersion is required")
	}
	build, ok := asUint(idx(body, "build"))
	if !ok || build == 0 {
		return nil, apiErr(422, "build must be a positive build number")
	}
	commit, ok := asStr(idx(body, "commit"))
	if !ok || !releaseIsCommit(commit) {
		return nil, apiErr(422, "commit must be a hexadecimal commit")
	}
	launchAsset, err := releaseAssetEntry(idx(body, "launchAsset"), true)
	if err != nil {
		return nil, err
	}
	list, ok := asArray(idx(body, "assets"))
	if !ok {
		return nil, apiErr(422, "assets must be an array")
	}
	assets := make([]any, len(list))
	for i, asset := range list {
		if assets[i], err = releaseAssetEntry(asset, false); err != nil {
			return nil, err
		}
	}
	if len(assets) > 10_000 {
		return nil, apiErr(422, "Too many assets")
	}
	expoClient := idx(body, "expoClient")
	if _, object := asObject(expoClient); !object && expoClient != nil {
		return nil, apiErr(422, "expoClient must be an object")
	}
	previous := releaseReadUpdate(runtime)
	unchanged := previous != nil && eqStr(previous["commit"], commit) && jsonEqual(idx(previous["launchAsset"], "hash"), launchAsset["hash"])
	id := newUUID()
	var createdAt any = activityIsoTime(accountsNow())
	if unchanged {
		id = str(previous["id"])
		createdAt = previous["createdAt"]
	}
	update := M{
		"id":             id,
		"createdAt":      createdAt,
		"runtimeVersion": runtime,
		"build":          build,
		"commit":         commit,
		"launchAsset":    launchAsset,
		"assets":         assets,
		"expoClient":     expoClient,
	}
	path := filepath.Join(releaseUpdatesDir(), runtime+".json")
	if err := os.MkdirAll(filepath.Dir(path), 0o777); err != nil {
		return nil, internal(err)
	}
	if err := releaseWriteAtomically(path, releasePretty(update)); err != nil {
		return nil, internal(err)
	}
	fmt.Printf("Published update build %d (%s) for runtime %s\n", build, commit[:min(len(commit), 7)], runtime)
	return releaseInfo(), nil
}

// releaseManifest: `GET /api/mobile/updates/manifest`: the expo-updates protocol. The phone names its runtime
// version and platform in headers; the answer is the stored manifest or an empty 204 that
// means "nothing newer". The manifest's own build identity rides in `extra.expoClient.extra`.
func releaseManifest(state *AppState, w http.ResponseWriter, r *http.Request) {
	var manifest M
	runtime := releaseHeaderText(r, "Expo-Runtime-Version")
	platform := releaseHeaderText(r, "Expo-Platform")
	if releaseIsRuntimeVersion(runtime) && (platform == "" || platform == "android") {
		if update := releaseReadUpdate(runtime); update != nil {
			origin := releasePublicOrigin(r)
			asset := func(entry any) M {
				hash := str(idx(entry, "hash"))
				return M{
					"hash":          base64.RawURLEncoding.EncodeToString(releaseHexBytes(hash)),
					"key":           idx(entry, "key"),
					"contentType":   idx(entry, "contentType"),
					"fileExtension": idx(entry, "fileExtension"),
					"url":           origin + releaseAssetsPath + "/" + hash,
				}
			}
			assets := []any{}
			if list, ok := asArray(update["assets"]); ok {
				for _, entry := range list {
					assets = append(assets, asset(entry))
				}
			}
			manifest = M{
				"id":             update["id"],
				"createdAt":      update["createdAt"],
				"runtimeVersion": update["runtimeVersion"],
				"launchAsset":    asset(update["launchAsset"]),
				"assets":         assets,
				"metadata":       M{},
				"extra":          M{"expoClient": update["expoClient"]},
			}
		}
	}
	h := w.Header()
	h.Set("Expo-Protocol-Version", "1")
	h.Set("Expo-Sfv-Version", "0")
	h.Set("Cache-Control", "private, max-age=0")
	if manifest == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	writeJSON(w, 200, manifest)
}

// releaseAsset: `GET /api/mobile/updates/assets/{sha256}` sends one stored file. The manifest carries the
// content type, so the file itself is served as opaque bytes.
func releaseAsset(state *AppState, w http.ResponseWriter, r *http.Request) {
	hash := r.PathValue("hash")
	if !releaseIsSha256(hash) {
		writeError(w, apiErr(404, "No such asset"))
		return
	}
	data, err := os.ReadFile(filepath.Join(releaseAssetsDir(), hash))
	if err != nil {
		writeError(w, apiErr(404, "No such asset"))
		return
	}
	releaseFile(w, data, map[string]string{"Content-Type": "application/octet-stream", "ETag": `"` + hash + `"`})
}

// releasePublicOrigin: where phones reach this server: `CUBIX_PUBLIC_ORIGIN`, or the request's own host through
// Caddy's forwarding headers.
func releasePublicOrigin(r *http.Request) string {
	if origin := strings.TrimSpace(os.Getenv("CUBIX_PUBLIC_ORIGIN")); origin != "" {
		return strings.TrimRight(origin, "/")
	}
	proto := releaseHeaderText(r, "X-Forwarded-Proto")
	if proto == "" {
		proto = "http"
	}
	host := releaseHeaderText(r, "X-Forwarded-Host")
	if host == "" {
		// Go keeps the Host header in r.Host.
		host = strings.TrimSpace(r.Host)
	}
	if host == "" {
		host = "localhost"
	}
	return proto + "://" + host
}

func releaseHexBytes(text string) []byte {
	out := []byte{}
	for i := 0; i+1 < len(text); i += 2 {
		high, ok1 := unhex(text[i])
		low, ok2 := unhex(text[i+1])
		if ok1 && ok2 {
			out = append(out, high<<4|low)
		}
	}
	return out
}
