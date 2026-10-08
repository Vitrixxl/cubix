fn main() {
    // Declaring the commands gives each its `allow-…` permission, which src/main.rs grants the web app's origin.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["legacy_read", "legacy_imported", "open_external"]),
    ))
    .expect("tauri-build failed");
}
