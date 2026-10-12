package main

// Desktop downloads: the Electron shell packaged for Linux and Windows, which the landing page's install
// commands fetch (`/install.sh`, `/install.ps1`).
//
// The shell only opens the web app this server serves, so it changes rarely: `scripts/deploy.ts`
// builds it on the developer's machine, as it does the APK, and uploads it here with the admin
// password only when its version (a hash of the shell's sources) changed. The files live next to
// the APK, beside the database, and survive container rebuilds.
//
// Each package comes with its RSA signature, made at deploy time with a key that never leaves the developer's
// machine and served at `<package>.sig`: the install scripts check it against the public key they embed, so a
// leaked admin password cannot slip them another package.

import (
	"bytes"
	"encoding/base64"
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
var desktopFiles = [2]desktopFile{
	{"cubix-linux-x64.tar.gz", "application/gzip", []byte("\x1f\x8b")},
	{"cubix-windows-x64.zip", "application/zip", []byte("PK\x03\x04")},
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
			if idx(meta, "signature") != nil {
				packages[file.name].(M)["signature"] = desktopPath + "/" + file.name + ".sig"
			}
		}
	}
	return packages
}

// desktopInfo: `GET /api/desktop`.
func desktopInfo(state *AppState, w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, desktopPackages())
}

// desktopDownload: `GET /api/desktop/{name}` streams a package: a hundred megabytes never sit in memory.
// `GET /api/desktop/{name}.sig` sends its signature.
func desktopDownload(state *AppState, w http.ResponseWriter, r *http.Request) {
	name, signature := strings.CutSuffix(r.PathValue("name"), ".sig")
	file, err := desktopFileOf(name)
	if err != nil {
		writeError(w, err)
		return
	}
	missing := apiErr(404, "This package has not been uploaded to this server yet")
	meta := desktopMetadata(file.name)
	if meta == nil {
		writeError(w, missing)
		return
	}
	if signature {
		sig, err := base64.StdEncoding.DecodeString(str(idx(meta, "signature")))
		if err != nil || len(sig) == 0 {
			writeError(w, apiErr(404, "This package was uploaded without a signature"))
			return
		}
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Content-Length", strconv.Itoa(len(sig)))
		w.WriteHeader(200)
		_, _ = w.Write(sig)
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
	file, meta, err := desktopHeaders(state, r)
	if err != nil {
		writeError(w, err)
		return
	}
	dir := desktopDir()
	if err := os.MkdirAll(dir, 0o777); err != nil {
		writeError(w, internal(err))
		return
	}
	size, sum, ok := storeBody(w, r, filepath.Join(dir, file.name), func(head []byte, size int64, _ string) error {
		if size < 1024 || !bytes.HasPrefix(head, file.magic) {
			return apiErr(422, "The body is not this package")
		}
		return nil
	})
	if !ok {
		return
	}
	meta["sha256"], meta["size"], meta["uploadedAt"] = sum, size, accountsNow()
	if err := releaseReplace(filepath.Join(dir, file.name+".json"), filepath.Join(dir, file.name+".json.tmp"), releasePretty(meta)); err != nil {
		writeError(w, internal(err))
		return
	}
	fmt.Printf("Stored desktop package %s (%s)\n", file.name, meta["version"])
	writeJSON(w, 200, desktopPackages())
}

// desktopHeaders checks an upload before its body is read: the password, the package's name, its version and commit.
func desktopHeaders(state *AppState, r *http.Request) (desktopFile, M, error) {
	if err := releaseAuthorize(state, r); err != nil {
		return desktopFile{}, nil, err
	}
	file, err := desktopFileOf(r.PathValue("name"))
	if err != nil {
		return desktopFile{}, nil, err
	}
	version := releaseHeaderText(r, "X-Cubix-Version")
	valid := version != "" && len(version) <= 64
	for i := 0; valid && i < len(version); i++ {
		if c := version[i]; !releaseIsAlphanumeric(c) && !strings.ContainsRune("._-", rune(c)) {
			valid = false
		}
	}
	if !valid {
		return desktopFile{}, nil, apiErr(422, "X-Cubix-Version must name the desktop version")
	}
	commit := releaseHeaderText(r, "X-Cubix-Commit")
	if !releaseIsCommit(commit) {
		return desktopFile{}, nil, apiErr(422, "X-Cubix-Commit must be a hexadecimal commit")
	}
	// The server cannot check it (the install scripts do), only that there is one to serve.
	signature := releaseHeaderText(r, "X-Cubix-Signature")
	if sig, err := base64.StdEncoding.DecodeString(signature); err != nil || len(sig) == 0 || len(sig) > 1024 {
		return desktopFile{}, nil, apiErr(422, "X-Cubix-Signature must be the package's signature in base64")
	}
	return file, M{"version": version, "commit": commit, "signature": signature}, nil
}
