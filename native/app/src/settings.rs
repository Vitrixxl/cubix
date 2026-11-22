//! The settings: the account (its name, signing out, deleting it, the server), the language, the timer, the training,
//! and the data (exporting every solve).
use crate::ctx::{Ctx, spawn};
use crate::icon::{self, icon};
use crate::page::View;
use crate::press::{Look, press, switch};
use crate::shell;
use crate::spring::Spring;
use crate::theme::*;
use crate::ui::{self, tx};
use iced::widget::{Space, column, container, row};
use iced::{Alignment, Element, Length, Padding, Task};
use qbix_core::api::ApiError;
use qbix_core::store::User;
use qbix_core::{account, i18n, t, tf};

#[derive(Debug, Clone)]
pub enum Msg {
    Language(String),
    Inspection,
    HideRunning,
    Hold(u64),
    Phases(u8),
    RandomAuf,
    Server(String),
    SaveServer,
    Username(String),
    SaveUsername,
    Renamed(Result<User, ApiError>),
    SignOut,
    SignedOut,
    AskDelete(bool),
    Delete,
    Deleted(Result<serde_json::Value, ApiError>),
    Export(&'static str),
    ImportPath(String),
    Import,
}

pub struct Page {
    import_path: String,
    server: Option<String>,
    username: Option<String>,
    error: Option<String>,
    confirm: Spring,
    confirming: bool,
}

impl Page {
    pub fn new() -> Self { Self { import_path: String::new(), server: None, username: None, error: None, confirm: Spring::smooth(0.0), confirming: false } }

    pub fn step_motion(&mut self, dt: f32) -> bool { self.confirm.step(dt) }

    pub fn update(&mut self, msg: Msg, ctx: &mut Ctx) -> Task<Msg> {
        match msg {
            Msg::Language(l) => {
                i18n::set_language(&l);
                ctx.store.settings.language = l;
                ctx.changed();
            }
            Msg::Inspection => {
                ctx.store.settings.inspection = !ctx.store.settings.inspection;
                ctx.changed();
            }
            Msg::HideRunning => {
                ctx.store.settings.hide_running = !ctx.store.settings.hide_running;
                ctx.changed();
            }
            Msg::Hold(ms) => {
                ctx.store.settings.hold_ms = ms;
                ctx.changed();
            }
            Msg::Phases(n) => {
                ctx.store.settings.set_pref("timer.phases", n.to_string());
                ctx.changed();
            }
            Msg::RandomAuf => {
                let off = ctx.store.settings.pref("training.auf") == Some("off");
                ctx.store.settings.set_pref("training.auf", if off { "on" } else { "off" });
                ctx.changed();
            }
            Msg::Server(s) => self.server = Some(s),
            Msg::SaveServer => {
                if let Some(s) = self.server.take() {
                    let s = s.trim().trim_end_matches('/').to_string();
                    if s.starts_with("http://") || s.starts_with("https://") {
                        if ctx.store.signed_in() && s != ctx.store.settings.server {
                            ctx.store.sign_out();
                            ctx.toast(t("Signed out: the account lives on the other server"));
                        }
                        ctx.store.settings.server = s;
                        ctx.changed();
                    } else {
                        self.error = Some(t("A server's address starts with https://"));
                    }
                }
            }
            Msg::Username(s) => self.username = Some(s.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_').take(24).collect()),
            Msg::SaveUsername => {
                if let Some(name) = self.username.clone().filter(|n| n.len() >= 3) {
                    let api = ctx.api();
                    return Task::perform(spawn(move || account::set_username(&api, &name)), Msg::Renamed);
                }
            }
            Msg::Renamed(r) => match r {
                Ok(user) => {
                    self.username = None;
                    ctx.store.user = Some(user);
                    ctx.changed();
                    ctx.toast(t("Username changed"));
                }
                Err(e) => self.error = Some(e.message()),
            },
            Msg::SignOut => {
                let api = ctx.api();
                ctx.store.sign_out();
                ctx.sync = crate::ctx::SyncState::Local;
                ctx.changed();
                ctx.toast(t("Signed out"));
                return Task::perform(spawn(move || account::logout(&api)), |_| Msg::SignedOut);
            }
            Msg::SignedOut => {}
            Msg::AskDelete(on) => {
                self.confirming = on;
                self.confirm.to(on as u8 as f32);
            }
            Msg::Delete => {
                let api = ctx.api();
                self.confirming = false;
                self.confirm.to(0.0);
                return Task::perform(spawn(move || account::delete_account(&api)), Msg::Deleted);
            }
            Msg::Deleted(r) => match r {
                Ok(_) => {
                    ctx.store.sign_out();
                    ctx.sync = crate::ctx::SyncState::Local;
                    ctx.changed();
                    ctx.toast(t("Your account was deleted"));
                }
                Err(e) => self.error = Some(e.message()),
            },
            Msg::ImportPath(p) => self.import_path = p,
            Msg::Import => {
                let path = self.import_path.trim().trim_start_matches("file://").to_string();
                self.import_file(&path, ctx);
            }
            Msg::Export(kind) => match export(ctx, kind) {
                Ok(path) => ctx.toast(tf("Saved in {0}", &[&path])),
                Err(e) => ctx.toast(e),
            },
        }
        Task::none()
    }

    /// Reads another timer's export (or Qbix's) and adds its solves.
    pub fn import_file(&mut self, path: &str, ctx: &mut Ctx) {
        let text = match std::fs::read(path) {
            Ok(b) => String::from_utf8_lossy(&b).into_owned(),
            Err(e) => return ctx.toast(e.to_string()),
        };
        let fallback = ctx.store.settings.context.event_id();
        match qbix_core::import::read(&text, &fallback) {
            Ok(import) => {
                let added = qbix_core::import::apply(&mut ctx.store, &import);
                ctx.changed();
                let skipped: usize = import.skipped.values().sum();
                ctx.toast(if skipped > 0 { tf("{0}: {1} solves imported, {2} left out", &[&import.app, &added, &skipped]) } else { tf("{0}: {1} solves imported", &[&import.app, &added]) });
                self.import_path.clear();
            }
            Err(e) => ctx.toast(e),
        }
    }

    pub fn view<'a>(&'a self, ctx: &'a Ctx) -> View<'a, Msg> {
        let s = &ctx.store.settings;
        let line = |title: String, sub: String, control: Element<'a, Msg>| -> Element<'a, Msg> { row![column![tx(title, 16.0, 600, INK), ui::small(sub)].spacing(3).width(Length::Fill), control].spacing(16).align_y(Alignment::Center).into() };
        let section = |title: String, items: Vec<Element<'a, Msg>>| -> Element<'a, Msg> { column![ui::h3(title), ui::well(column(items).spacing(20)).padding(20).width(Length::Fill)].spacing(12).into() };

        let account: Element<'a, Msg> = if ctx.store.signed_in() {
            let name = self.username.clone().unwrap_or_else(|| ctx.username());
            section(t("Account"), vec![
                line(tf("Signed in as {0}", &[&ctx.username()]), t("Your solves, learned cases and settings follow you on every device."), press(Look::Soft, row![icon(icon::LOG_OUT, 16.0, INK2), tx(t("Sign out"), 14.5, 600, INK2)].spacing(8).align_y(Alignment::Center)).height(40).on_press(Msg::SignOut).into()),
                row![ui::field(&t("Username"), &name, Msg::Username).on_submit(Msg::SaveUsername).width(Length::Fill), press(Look::Tonal, tx(t("Change"), 14.5, 650, ACC_INK)).height(44).on_press_maybe(self.username.as_ref().filter(|n| n.len() >= 3).map(|_| Msg::SaveUsername))].spacing(10).align_y(Alignment::Center).into(),
                line(t("Delete the account"), t("Every solve and mark, for good, on every device."), press(Look::Danger, tx(t("Delete…"), 14.5, 650, BAD)).height(40).on_press(Msg::AskDelete(true)).into()),
            ])
        } else {
            section(t("Account"), vec![line(t("Not signed in"), t("Your solves stay on this device. Sign in from the profile to keep them everywhere."), Space::new().into())])
        };
        let server = self.server.clone().unwrap_or_else(|| s.server.clone());
        let server_row = row![ui::field("https://", &server, Msg::Server).on_submit(Msg::SaveServer).width(Length::Fill), press(Look::Tonal, tx(t("Use"), 14.5, 650, ACC_INK)).height(44).on_press_maybe(self.server.as_ref().map(|_| Msg::SaveServer))].spacing(10).align_y(Alignment::Center);

        let languages = ui::pills(i18n::LANGUAGES.iter().map(|(id, name)| (name.to_string(), Msg::Language(id.to_string()), i18n::language() == *id)).collect());
        let holds = ui::pills([0u64, 150, 300, 550].iter().map(|ms| (if *ms == 0 { t("None") } else { format!("{:.2} s", *ms as f64 / 1000.0) }, Msg::Hold(*ms), s.hold_ms == *ms)).collect());

        let mut col = column![
            account,
            section(t("Language"), vec![languages]),
            section(t("Timer"), vec![
                line(t("WCA inspection"), t("15 seconds before each solve, +2 past 15, DNF past 17"), switch(s.inspection, Msg::Inspection).into()),
                line(t("Hide the time while solving"), t("The time shows once the solve is over"), switch(s.hide_running, Msg::HideRunning).into()),
                column![tx(t("Hold before the start"), 16.0, 600, INK), ui::small(t("How long Space or a touch is held before the timer is ready")), holds].spacing(8).into(),
                column![tx(t("Phases"), 16.0, 600, INK), ui::small(t("Time a solve in parts: each press before the last ends a phase (cross, F2L, last layer…)")), ui::pills((1u8..=4).map(|n| (if n == 1 { t("One") } else { n.to_string() }, Msg::Phases(n), s.pref("timer.phases").unwrap_or("1") == n.to_string())).collect())].spacing(8).into(),
            ]),
            section(t("Training"), vec![line(t("Random AUF"), t("A random turn of the top before each case"), switch(s.pref("training.auf") != Some("off"), Msg::RandomAuf).into())]),
            section(t("Data"), vec![
                line(t("Export every solve"), qbix_core::i18n::plural(ctx.store.solves.len(), "{0} solve", "{0} solves"), row![press(Look::Soft, tx("CSV", 14.5, 650, INK2)).height(40).on_press(Msg::Export("csv")), press(Look::Soft, tx("JSON", 14.5, 650, INK2)).height(40).on_press(Msg::Export("json"))].spacing(6).into()),
                column![tx(t("Import times"), 16.0, 600, INK), ui::small(tf("From {0}, or a Qbix export: drop the file on the window, or give its path.", &[&qbix_core::import::APPS.join(", ")])), row![ui::field("/home/…/cstimer.txt", &self.import_path, Msg::ImportPath).on_submit(Msg::Import).width(Length::Fill), press(Look::Tonal, tx(t("Import"), 14.5, 650, ACC_INK)).height(44).on_press_maybe((!self.import_path.trim().is_empty()).then_some(Msg::Import))].spacing(10).align_y(Alignment::Center)].spacing(8).into(),
                column![tx(t("Server"), 16.0, 600, INK), ui::small(t("Where your account lives")), server_row].spacing(8).into(),
            ]),
            section(t("About"), vec![line(format!("Qbix {}", env!("CARGO_PKG_VERSION")), t("Bricolage Grotesque (OFL) and Lucide icons (ISC)."), Space::new().into())]),
        ]
        .spacing(30)
        .max_width(760);
        if let Some(e) = &self.error { col = col.push(tx(e.clone(), 14.0, 600, BAD)) }
        let body = ui::scroll(container(col).width(Length::Fill).center_x(Length::Fill).padding(Padding { top: 6.0, right: 14.0, bottom: 30.0, left: 0.0 })).height(Length::Fill);
        let mut view = View::new(t("Settings"), body);
        if self.confirm.value > 0.002 {
            let content = column![ui::h2(t("Delete your account?")), ui::body(t("Every solve, learned case and message goes, on every device. This cannot be undone.")), row![Space::new().width(Length::Fill), press(Look::Soft, tx(t("Cancel"), 15.0, 600, INK2)).height(44).on_press(Msg::AskDelete(false)), press(Look::Danger, tx(t("Delete for good"), 15.0, 650, BAD)).height(44).on_press(Msg::Delete)].spacing(8)].spacing(18);
            view.overlay = Some(shell::dialog(content, self.confirm.value, Msg::AskDelete(false), 460.0));
        }
        view
    }
}

/// Writes every solve to the Downloads folder (the data folder where there is none).
fn export(ctx: &Ctx, kind: &str) -> Result<String, String> {
    let dir = std::env::var_os("XDG_DOWNLOAD_DIR").map(std::path::PathBuf::from).or_else(|| std::env::var_os("HOME").map(|h| std::path::Path::new(&h).join("Downloads"))).filter(|d| d.is_dir()).unwrap_or_else(qbix_core::store::default_dir);
    let day = qbix_core::date::iso(qbix_core::store::now_ms() as i64)[..10].to_string();
    let path = dir.join(format!("qbix-{}-{day}.{kind}", ctx.username().to_lowercase()));
    let text = if kind == "json" {
        serde_json::to_string_pretty(&serde_json::json!({ "app": "Qbix", "sessions": ctx.store.sessions, "solves": ctx.store.solves })).map_err(|e| e.to_string())?
    } else {
        let mut out = String::from("date,puzzle,mode,scramble_type,time_ms,penalty,time,scramble,comment\n");
        for s in &ctx.store.solves {
            let q = |v: &str| format!("\"{}\"", v.replace('"', "\"\""));
            out.push_str(&format!("{},{},{},{},{},{},{},{},{}\n", s.created_at, s.puzzle_id, s.solve_mode, s.scramble_type, s.time_ms, serde_json::to_value(s.penalty).ok().and_then(|v| v.as_str().map(String::from)).unwrap_or_default(), qbix_core::time::fmt_solve(s.time_ms, s.penalty), q(s.scramble.as_deref().unwrap_or("")), q(s.comment.as_deref().unwrap_or(""))));
        }
        out
    };
    std::fs::write(&path, text).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}
