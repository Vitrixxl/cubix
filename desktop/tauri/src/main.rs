//! The Tauri shell: desktop/electron/main.ts on the system's webview (WebKitGTK, WebView2, WKWebView) instead of a
//! bundled Chromium. It opens the web app served by the API in its own window; the app's service worker keeps it usable
//! offline and every online launch opens the latest deployed version: there is no updater. The page gets the same
//! `window.cubixDesktop` as from Electron's preload (desktop/renderer/bridge.ts), backed by the commands below.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{env, fs, path::PathBuf};
use tauri::{
    ipc::CapabilityBuilder,
    webview::{NewWindowResponse, PageLoadEvent},
    window::Color,
    AppHandle, Manager, State, Url, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_opener::OpenerExt;

struct Shell {
    data: PathBuf,
}

/// desktop/data-path.ts: %APPDATA%\Cubix on Windows, the XDG data directory elsewhere.
fn data_directory() -> PathBuf {
    if let Some(dir) = env::var_os("CUBIX_DESKTOP_DATA") {
        return dir.into();
    }
    let var = |name| env::var_os(name).filter(|v| !v.is_empty()).map(PathBuf::from);
    if cfg!(windows) {
        return var("APPDATA").unwrap_or_default().join("Cubix");
    }
    var("XDG_DATA_HOME")
        .unwrap_or_else(|| var("HOME").unwrap_or_default().join(".local/share"))
        .join("cubix-desktop")
}

fn external(app: &AppHandle, url: &Url) {
    if matches!(url.scheme(), "http" | "https") {
        let _ = app.opener().open_url(url.as_str(), None::<&str>);
    }
}

/// Solves, preferences and the session of the former Bun engine, imported once by the web app.
#[tauri::command]
fn legacy_read(shell: State<Shell>) -> Option<String> {
    fs::read_to_string(shell.data.join("storage.json")).ok()
}
#[tauri::command]
fn legacy_imported(shell: State<Shell>) {
    // Kept aside rather than deleted, in case the import ever needs to be checked.
    let _ = fs::rename(shell.data.join("storage.json"), shell.data.join("storage.imported.json"));
}
#[tauri::command]
fn open_external(app: AppHandle, url: String) {
    if let Ok(url) = Url::parse(&url) {
        external(&app, &url);
    }
}

fn main() {
    let configured = env::var("CUBIX_WEB_ORIGIN").or_else(|_| env::var("CUBIX_API_ORIGIN"));
    let origin = Url::parse(configured.as_deref().unwrap_or("https://cubix.vitrixxl.fr"))
        .expect("CUBIX_WEB_ORIGIN must be a URL")
        .origin();
    let base = origin.ascii_serialization();
    // The app itself: the site's root is its landing page.
    let start: Url = format!("{base}/timer").parse().unwrap();
    let data = data_directory();
    // Once the app has opened, its service worker serves it offline; before that, offline/index.html waits for the server.
    let opened = data.join("tauri/opened");
    let size = |name, default| env::var(name).ok().and_then(|v| v.parse().ok()).unwrap_or(default);
    let (width, height) = (size("CUBIX_WIDTH", 1280.0), size("CUBIX_HEIGHT", 800.0));
    let bridge = include_str!("bridge.js").replace("__START__", start.as_str());

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        // Links leave through on_new_window below: the plugin's own link script would ask for a permission the web app lacks.
        .plugin(tauri_plugin_opener::Builder::new().open_js_links_on_click(false).build())
        .manage(Shell { data: data.clone() })
        .invoke_handler(tauri::generate_handler![legacy_read, legacy_imported, open_external])
        .setup(move |app| {
            // The commands answer the web app's origin only, in the main window (build.rs declares them).
            app.add_capability(
                CapabilityBuilder::new("web-app")
                    .remote(format!("{base}/*"))
                    .local(false)
                    .window("main")
                    .permission("allow-legacy-read")
                    .permission("allow-legacy-imported")
                    .permission("allow-open-external"),
            )?;
            let url = if opened.exists() { WebviewUrl::External(start.clone()) } else { WebviewUrl::App("index.html".into()) };
            let (navigating, opening) = (app.handle().clone(), app.handle().clone());
            let same = origin.clone();
            WebviewWindowBuilder::new(app, "main", url)
                .title("Qbix")
                .inner_size(width, height)
                .background_color(Color(0x0b, 0x0b, 0x0e, 0xff))
                // Browser storage (the web app's IndexedDB and offline cache) lives with the rest of Cubix's data.
                .data_directory(data.join("tauri"))
                .initialization_script(&bridge)
                .on_navigation(move |url| {
                    let inside = url.origin() == same || matches!(url.scheme(), "tauri") || url.host_str() == Some("tauri.localhost");
                    if !inside {
                        external(&navigating, url);
                    }
                    inside
                })
                .on_new_window(move |url, _| {
                    external(&opening, &url);
                    NewWindowResponse::Deny
                })
                .on_document_title_changed(|window, title| {
                    let _ = window.set_title(&title);
                })
                .on_page_load(move |_, payload| {
                    if payload.event() == PageLoadEvent::Finished && payload.url().origin() == origin && !opened.exists() {
                        let _ = fs::create_dir_all(opened.parent().unwrap()).and_then(|_| fs::write(&opened, ""));
                    }
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Qbix could not start");
}
