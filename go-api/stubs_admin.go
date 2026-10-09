package main

// Placeholders for the ADMIN group (admin.rs, admin_data.rs, release.rs, desktop.rs). That port deletes this file
// and implements every symbol below with the same signature, in admin.go, admin_data.go (where adminDataPurge and
// adminDataPurgeGuests are already ported), release.go (releaseBuildNumber already there) and desktop.go.

import "net/http"

// Admin is admin::Admin.
type Admin struct{}

// newAdmin is admin::Admin::new; its error stops the server (CUBIX_ADMIN_PASSWORD too short).
func newAdmin() (*Admin, error) { return &Admin{}, nil }

// adminRotate is admin::rotate: `cubix-api admin-token`.
func adminRotate(db *Conn) (string, error) { return "", apiErr(501, "Not implemented") }

// adminDisable is admin::disable: `cubix-api admin-token --revoke`.
func adminDisable(db *Conn) (bool, error) { return false, apiErr(501, "Not implemented") }

// adminDispatch is admin::dispatch: /api/admin/{*path}.
func adminDispatch(state *AppState, w http.ResponseWriter, r *http.Request) { notImplemented(w) }

// adminUpgrade is admin::upgrade: GET /api/admin/live.
func adminUpgrade(state *AppState, w http.ResponseWriter, r *http.Request) { notImplemented(w) }

// adminDataDelete is admin_data::delete (api.rs: an account deleted by its owner).
func adminDataDelete(state *AppState, id string) (any, error) {
	return nil, apiErr(501, "Not implemented")
}

// releaseInfo is release::info: GET /api/mobile/release.
func releaseInfo() any { return nil }

// releaseApk is release::apk: GET /api/mobile/apk.
func releaseApk(state *AppState, w http.ResponseWriter, r *http.Request) { notImplemented(w) }

// releaseUpload is release::upload: PUT /api/mobile/apk.
func releaseUpload(state *AppState, w http.ResponseWriter, r *http.Request) { notImplemented(w) }

// releaseAsset is release::asset: GET /api/mobile/updates/assets/{hash}.
func releaseAsset(state *AppState, w http.ResponseWriter, r *http.Request) { notImplemented(w) }

// releaseUploadAsset is release::upload_asset: PUT /api/mobile/updates/assets/{hash}.
func releaseUploadAsset(state *AppState, w http.ResponseWriter, r *http.Request) { notImplemented(w) }

// releasePublish is release::publish: PUT /api/mobile/updates.
func releasePublish(state *AppState, w http.ResponseWriter, r *http.Request) { notImplemented(w) }

// releaseManifest is release::manifest: GET /api/mobile/updates/manifest.
func releaseManifest(state *AppState, w http.ResponseWriter, r *http.Request) { notImplemented(w) }

// desktopInfo is desktop::info: GET /api/desktop.
func desktopInfo(state *AppState, w http.ResponseWriter, r *http.Request) { notImplemented(w) }

// desktopDownload is desktop::download: GET /api/desktop/{name}.
func desktopDownload(state *AppState, w http.ResponseWriter, r *http.Request) { notImplemented(w) }

// desktopUpload is desktop::upload: PUT /api/desktop/{name}.
func desktopUpload(state *AppState, w http.ResponseWriter, r *http.Request) { notImplemented(w) }
