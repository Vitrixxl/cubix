mod app;
mod assets;
mod cube;
mod engine;
mod input;
mod theme;
mod timer;
use gpui::*;
fn main() {
    let exe = std::env::current_exe().unwrap();
    let assets = std::env::var_os("CUBIX_DESKTOP_ASSETS")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| {
            let packaged = exe.parent().unwrap().join("assets");
            if packaged.exists() {
                packaged
            } else {
                std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("assets")
            }
        });
    let width = std::env::var("CUBIX_WIDTH")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(1280.);
    let height = std::env::var("CUBIX_HEIGHT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(800.);
    Application::new()
        .with_assets(assets::Assets(assets.clone()))
        .run(move |cx| {
            input::bind(cx);
            if let Ok(font) = std::fs::read(assets.join("cubing-icons.ttf")) {
                cx.text_system()
                    .add_fonts(vec![std::borrow::Cow::Owned(font)])
                    .expect("cubing icon font");
            }
            let fonts = std::fs::read_dir(assets.join("fonts"))
                .expect("font assets")
                .filter_map(Result::ok)
                .filter(|e| e.path().extension().is_some_and(|s| s == "ttf"))
                .map(|e| std::borrow::Cow::Owned(std::fs::read(e.path()).unwrap()))
                .collect();
            cx.text_system().add_fonts(fonts).expect("Geist fonts");
            cx.on_window_closed(|cx| {
                if cx.windows().is_empty() {
                    cx.quit();
                }
            })
            .detach();
            cx.open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(Bounds::centered(
                        None,
                        size(px(width), px(height)),
                        cx,
                    ))),
                    titlebar: None,
                    app_id: Some("fr.vitrixxl.cubix".into()),
                    ..Default::default()
                },
                move |window, cx| cx.new(|cx| app::Cubix::new(assets, window, cx)),
            )
            .unwrap();
            cx.activate(true);
        });
}
