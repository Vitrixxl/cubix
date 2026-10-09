package main

// Desktop downloads: the Electron shell packaged for Linux and Windows, and the lighter Tauri shell
// (desktop/tauri) beside it, which the landing page's install commands fetch (`/install.sh`, `/install.ps1`).
//
// The shell only opens the web app this server serves, so it changes rarely: `scripts/deploy.ts`
// builds it on the developer's machine, as it does the APK, and uploads it here with the admin
// password only when its version (a hash of the shell's sources) changed. The files live next to
// the APK, beside the database, and survive container rebuilds.

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type desktopFile struct {
	name, kind string
	magic      []byte
}

// desktopFiles: the packages served: file name, content type and the first bytes every such file starts with.
var desktopFiles = [4]desktopFile{
	{"cubix-linux-x64.tar.gz", "application/gzip", []byte("\x1f\x8b")},
	{"cubix-windows-x64.zip", "application/zip", []byte("PK\x03\x04")},
	{"cubix-tauri-linux-x64.tar.gz", "application/gzip", []byte("\x1f\x8b")},
	{"cubix-tauri-windows-x64.zip", "application/zip", []byte("PK\x03\x04")},
}

const desktopPath = "/api/desktop"

func desktopDir() string {
	return filepath.Join(releaseApkDir(), "desktop")
}

func desktopFileOf(name string) (desktopFile, error) {
	for _, file := range desktopFiles {
		if file.name == name {
			return file, nil
		}
	}
	return desktopFile{}, apiErr(404, "Unknown desktop package")
}

// desktopMetadata: what was uploaded for a package, nil when nothing was.
func desktopMetadata(name string) any {
	meta := releaseReadJSON(filepath.Join(desktopDir(), name+".json"))
	if meta == nil || !isFile(filepath.Join(desktopDir(), name)) {
		return nil
	}
	return meta
}

// desktopPackages: every package uploaded, with its address, size, digest and version.
func desktopPackages() M {
	packages := M{}
	for _, file := range desktopFiles {
		if meta := desktopMetadata(file.name); meta != nil {
			packages[file.name] = M{"url": desktopPath + "/" + file.name, "size": idx(meta, "size"), "sha256": idx(meta, "sha256"), "version": idx(meta, "version"), "commit": idx(meta, "commit"), "uploadedAt": idx(meta, "uploadedAt")}
		}
	}
	return packages
}

// desktopInfo: `GET /api/desktop`.
func desktopInfo(state *AppState, w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, desktopPackages())
}

// desktopDownload: `GET /api/desktop/{name}` streams a package: a hundred megabytes never sit in memory.
func desktopDownload(state *AppState, w http.ResponseWriter, r *http.Request) {
	file, err := desktopFileOf(r.PathValue("name"))
	if err != nil {
		writeError(w, err)
		return
	}
	missing := apiErr(404, "This package has not been uploaded to this server yet")
	if desktopMetadata(file.name) == nil {
		writeError(w, missing)
		return
	}
	f, err := os.Open(filepath.Join(desktopDir(), file.name))
	if err != nil {
		writeError(w, missing)
		return
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		writeError(w, internal(err))
		return
	}
	h := w.Header()
	h.Set("Content-Type", file.kind)
	h.Set("Content-Length", strconv.FormatInt(info.Size(), 10))
	h.Set("Content-Disposition", `attachment; filename="`+file.name+`"`)
	w.WriteHeader(200)
	_, _ = io.Copy(w, f)
}

// desktopUpload: `PUT /api/desktop/{name}` with `Authorization: Bearer <admin password>`, `X-Cubix-Version`
// (the shell's version) and `X-Cubix-Commit` stores a package atomically.
func desktopUpload(state *AppState, w http.ResponseWriter, r *http.Request) {
	body, ok := readBody(w, r)
	if !ok {
		return
	}
	value, err := desktopStore(state, r, body)
	writeResult(w, value, err)
}

func desktopStore(state *AppState, r *http.Request, body []byte) (any, error) {
	if err := releaseAuthorize(state, r); err != nil {
		return nil, err
	}
	file, err := desktopFileOf(r.PathValue("name"))
	if err != nil {
		return nil, err
	}
	version := releaseHeaderText(r, "X-Cubix-Version")
	valid := version != "" && len(version) <= 64
	for i := 0; valid && i < len(version); i++ {
		if c := version[i]; !releaseIsAlphanumeric(c) && !strings.ContainsRune("._-", rune(c)) {
			valid = false
		}
	}
	if !valid {
		return nil, apiErr(422, "X-Cubix-Version must name the desktop version")
	}
	commit := releaseHeaderText(r, "X-Cubix-Commit")
	if !releaseIsCommit(commit) {
		return nil, apiErr(422, "X-Cubix-Commit must be a hexadecimal commit")
	}
	if len(body) < 1024 || !bytes.HasPrefix(body, file.magic) {
		return nil, apiErr(422, "The body is not this package")
	}
	sum := sha256.Sum256(body)
	meta := M{
		"version":    version,
		"commit":     commit,
		"sha256":     hex.EncodeToString(sum[:]),
		"size":       len(body),
		"uploadedAt": accountsNow(),
	}
	dir := desktopDir()
	err = func() error {
		if err := os.MkdirAll(dir, 0o777); err != nil {
			return err
		}
		if err := releaseReplace(filepath.Join(dir, file.name), filepath.Join(dir, file.name+".tmp"), body); err != nil {
			return err
		}
		return releaseReplace(filepath.Join(dir, file.name+".json"), filepath.Join(dir, file.name+".json.tmp"), releasePretty(meta))
	}()
	if err != nil {
		return nil, internal(err)
	}
	fmt.Printf("Stored desktop package %s (%s)\n", file.name, version)
	return desktopPackages(), nil
}
