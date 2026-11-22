//! The challenges: a race against someone at your level (Duel, live on the app's socket), the tournaments, the
//! scramble of the day everyone solves (Daily), and the WCA's rankings, records, competitions and people.
use crate::ctx::{Ctx, spawn};
use crate::icon::{self, icon};
use crate::page::{Drawer, View};
use crate::press::{Look, press};
use crate::shell;
use crate::spring::Spring;
use crate::theme::*;
use crate::tournaments;
use crate::ui::{self, tx};
use iced::keyboard::{self, Key, key::Named};
use iced::widget::{Space, column, container, mouse_area, row, text};
use iced::{Alignment, Color, Element, Length, Padding, Task};
use qbix_core::api::{ApiError, encode};
use qbix_core::daily::{self, Board, Day};
use qbix_core::time::{Penalty, average_of, effective, fmt_solve, fmt_time, last_average};
use qbix_core::timer::{Phase, Stop, Timer};
use qbix_core::{date, t, tf};
use serde_json::{Value, json};
use std::time::Instant;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Tab {
    Duel,
    Tournaments,
    Daily,
    Wca,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum WcaTab {
    Rankings,
    Records,
    Competitions,
    People,
}

#[derive(Debug, Clone)]
pub enum Msg {
    Tab(Tab),
    Menu(bool),
    Event(String),
    Press,
    Release,
    // Duel.
    FaceOff,
    Leave,
    Rematch,
    Chat(String),
    SendChat,
    DuelPenalty(Penalty),
    Scrambled(Vec<String>),
    // Daily.
    Board(Result<Board, ApiError>),
    History(Result<Vec<Day>, ApiError>),
    // WCA.
    Wca(WcaTab),
    WcaKind(&'static str),
    WcaRegion(String),
    WcaQuery(String),
    WcaSearch,
    WcaPage(i64),
    WcaLoaded(String, Result<Value, ApiError>),
    WcaOpen(String),
    Drawer(bool),
    Tournaments(tournaments::Msg),
}

/// A finished race, kept on the device.
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct Record {
    pub at: i64,
    pub event: String,
    pub opponent: String,
    pub mine: Vec<Option<f64>>,
    pub theirs: Vec<Option<f64>>,
    pub result: String,
}

#[derive(Default)]
struct Race {
    seat: usize,
    players: Vec<String>,
    scrambles: Vec<String>,
    results: [Vec<Option<(f64, Penalty)>>; 2],
    rematch: [bool; 2],
    present: [bool; 2],
    other_phase: String,
    chat: Vec<(usize, String)>,
    kept: bool,
}

impl Race {
    fn round(&self) -> usize { self.results[self.seat].iter().take_while(|r| r.is_some()).count() }
    fn over(&self) -> bool { self.results.iter().all(|r| r.len() == 5 && r.iter().all(Option::is_some)) }
    fn values(&self, seat: usize) -> Vec<Option<f64>> { self.results[seat].iter().map(|r| r.and_then(|(ms, p)| effective(ms as u64, p))).collect() }
}

enum Duel {
    Lobby,
    Searching { since: Instant, searching: i64 },
    Racing(Box<Race>),
}

pub struct Page {
    timer: Timer,
    now: Instant,
    menu: Spring,
    menu_open: bool,
    focus: Spring,
    hold: Spring,
    ready: Spring,
    duel: Duel,
    lobby_count: i64,
    chat: String,
    // Daily.
    daily_board: Option<Result<Board, String>>,
    daily_history: Vec<Day>,
    daily_last: Option<Stop>,
    // WCA.
    wca: WcaTab,
    wca_kind: &'static str,
    wca_region: String,
    wca_query: String,
    wca_page: i64,
    wca_data: Option<Result<Value, String>>,
    wca_open: Option<(String, Option<Result<Value, String>>)>,
    open: bool,
    pub tournaments: tournaments::Page,
}

pub fn label_of(event: &str) -> String { qbix_core::puzzles::event(event).map_or_else(|| event.to_string(), |e| t(&e.label)) }

impl Page {
    pub fn new() -> Self {
        Self {
            timer: Timer::new(false),
            now: Instant::now(),
            menu: Spring::smooth(0.0),
            menu_open: false,
            focus: Spring::smooth(0.0),
            hold: Spring::quick(0.0),
            ready: Spring::quick(0.0),
            duel: Duel::Lobby,
            lobby_count: 0,
            chat: String::new(),
            daily_board: None,
            daily_history: vec![],
            daily_last: None,
            wca: WcaTab::Rankings,
            wca_kind: "single",
            wca_region: "world".into(),
            wca_query: String::new(),
            wca_page: 1,
            wca_data: None,
            wca_open: None,
            open: false,
            tournaments: tournaments::Page::new(),
        }
    }

    fn tab(ctx: &Ctx) -> Tab {
        match ctx.store.settings.pref("challenges.tab") {
            Some("tournaments") => Tab::Tournaments,
            Some("daily") => Tab::Daily,
            Some("wca") => Tab::Wca,
            _ => Tab::Duel,
        }
    }

    fn event(ctx: &Ctx) -> String { ctx.store.settings.pref("challenges.event").unwrap_or("333").to_string() }

    /// The daily scramble's event: a puzzle (the 3×3's for an event of another mode).
    fn daily_event(ctx: &Ctx) -> String { qbix_core::puzzles::event(&Self::event(ctx)).map_or_else(|| "333".into(), |e| if e.puzzle.starts_with('r') { "333".into() } else { e.puzzle.clone() }) }

    pub fn records(ctx: &Ctx) -> Vec<Record> { ctx.store.settings.pref("duels").and_then(|s| serde_json::from_str(s).ok()).unwrap_or_default() }

    /// The level the duel pairs on: the mean of the last twelve timer solves of the event, best and worst aside.
    fn level(ctx: &Ctx) -> Option<f64> {
        let e = qbix_core::puzzles::event(&Self::event(ctx))?;
        let c = qbix_core::puzzles::Context::new(&e.puzzle, &e.solve_mode, "normal");
        let mut times: Vec<f64> = ctx.store.solves_in(&c).rev().take(12).filter_map(|s| s.value()).collect();
        if times.len() < 5 { return None }
        times.sort_by(f64::total_cmp);
        let mid = &times[1..times.len() - 1];
        Some(mid.iter().sum::<f64>() / mid.len() as f64)
    }

    pub fn enter(&mut self, ctx: &Ctx) -> Task<Msg> {
        match Self::tab(ctx) {
            Tab::Duel => {
                if let (Some(live), Duel::Lobby) = (&ctx.live, &self.duel) { live.send("duel", json!({ "type": "watch", "event": Self::event(ctx) })) }
                Task::none()
            }
            Tab::Daily => self.load_daily(ctx, None, false),
            Tab::Wca => self.load_wca(ctx),
            Tab::Tournaments => self.tournaments.enter(ctx).map(Msg::Tournaments),
        }
    }

    fn load_daily(&mut self, ctx: &Ctx, attempt: Option<Stop>, rank: bool) -> Task<Msg> {
        let (api, event, day) = (ctx.api(), Self::daily_event(ctx), daily::today());
        let signed = ctx.store.signed_in();
        let board = Task::perform(
            spawn(move || {
                let path = format!("daily/{event}");
                match attempt {
                    Some(s) if rank && signed => api.post::<Board>(&path, &json!({ "day": day, "timeMs": s.ms, "penalty": s.penalty })),
                    Some(s) => api.get(&format!("{path}?day={day}&time={}&penalty={}", s.ms, serde_json::to_value(s.penalty).ok().and_then(|v| v.as_str().map(String::from)).unwrap_or_default())),
                    None => api.get(&format!("{path}?day={day}")),
                }
            }),
            Msg::Board,
        );
        if !signed || attempt.is_some() { return board }
        let (api, event) = (ctx.api(), Self::daily_event(ctx));
        Task::batch([board, Task::perform(spawn(move || api.get::<Vec<Day>>(&format!("daily/{event}/history"))), Msg::History)])
    }

    fn wca_path(&self, ctx: &Ctx) -> String {
        let event = qbix_core::puzzles::event(&Self::event(ctx)).map_or("333", |e| e.id.as_str()).to_string();
        let region = encode(&self.wca_region);
        match self.wca {
            WcaTab::Rankings => format!("wca/rankings/{event}/{}?region={region}&page={}", self.wca_kind, self.wca_page),
            WcaTab::Records => format!("wca/records?region={region}"),
            WcaTab::Competitions => format!("wca/competitions?status=upcoming&page={}{}", self.wca_page, if self.wca_query.trim().is_empty() { String::new() } else { format!("&q={}", encode(self.wca_query.trim())) }),
            WcaTab::People => format!("wca/search?q={}", encode(self.wca_query.trim())),
        }
    }

    fn load_wca(&mut self, ctx: &Ctx) -> Task<Msg> {
        if self.wca == WcaTab::People && self.wca_query.trim().len() < 2 {
            self.wca_data = None;
            return Task::none();
        }
        let path = self.wca_path(ctx);
        self.wca_data = None;
        let api = ctx.api();
        let key = path.clone();
        Task::perform(spawn(move || api.get_within::<Value>(&path, 30)), move |r| Msg::WcaLoaded(key.clone(), r))
    }

    pub fn step(&mut self, dt: f32, now: Instant, ctx: &mut Ctx) -> (bool, Task<Msg>) {
        self.now = now;
        let mut moving = false;
        for s in [&mut self.menu, &mut self.focus, &mut self.hold, &mut self.ready] {
            moving |= s.step(dt);
        }
        let mut task = Task::none();
        if let Some(stop) = self.timer.tick(now) { task = self.stopped(stop, ctx) }
        self.follow(ctx);
        (moving || self.timer.needs_ticks() || matches!(self.duel, Duel::Searching { .. }), task)
    }

    pub fn busy(&self) -> bool { matches!(self.timer.phase, Phase::Running | Phase::Holding | Phase::Ready) || matches!(self.duel, Duel::Searching { .. }) }

    fn follow(&mut self, ctx: &Ctx) {
        let phase = self.timer.phase;
        self.hold.to((phase == Phase::Holding) as u8 as f32);
        self.ready.to((phase == Phase::Ready) as u8 as f32);
        self.focus.to((phase == Phase::Running) as u8 as f32);
        if let (Duel::Racing(r), Some(live)) = (&self.duel, &ctx.live) {
            let name = match phase {
                Phase::Holding => "holding",
                Phase::Ready => "ready",
                Phase::Running => "running",
                _ => "idle",
            };
            let _ = r;
            thread_local!(static LAST: std::cell::RefCell<String> = std::cell::RefCell::new(String::new()));
            LAST.with(|l| {
                if *l.borrow() != name {
                    *l.borrow_mut() = name.into();
                    live.send("duel", json!({ "type": "timer", "phase": name }));
                }
            });
        }
    }

    fn stopped(&mut self, stop: Stop, ctx: &mut Ctx) -> Task<Msg> {
        match Self::tab(ctx) {
            Tab::Duel => {
                if let (Duel::Racing(r), Some(live)) = (&self.duel, &ctx.live) {
                    live.send("duel", json!({ "type": "solve", "round": r.round(), "ms": stop.ms.max(10), "penalty": stop.penalty }));
                }
                Task::none()
            }
            Tab::Daily => {
                // The first attempt of the day is the ranked one; the others are placed among the field.
                let rank = self.daily_board.as_ref().and_then(|b| b.as_ref().ok()).is_none_or(|b| b.mine.is_none());
                self.daily_last = Some(stop);
                self.load_daily(ctx, Some(stop), rank)
            }
            _ => Task::none(),
        }
    }

    /// A message of the duel's channel.
    pub fn live(&mut self, v: &Value, ctx: &mut Ctx) -> Task<Msg> {
        match v["type"].as_str().unwrap_or("") {
            "queued" => self.duel = Duel::Searching { since: Instant::now(), searching: 0 },
            "queue" | "waiting" => {
                let n = v["searching"].as_i64().unwrap_or(0);
                match &mut self.duel {
                    Duel::Searching { searching, .. } => *searching = n,
                    _ => self.lobby_count = n,
                }
            }
            "match" => {
                let players = v["players"].as_array().map(|p| p.iter().map(|x| x["name"].as_str().or(x.as_str()).unwrap_or("?").to_string()).collect()).unwrap_or_default();
                let seat = v["seat"].as_u64().unwrap_or(0) as usize;
                self.duel = Duel::Racing(Box::new(Race { seat, players, results: [vec![None; 5], vec![None; 5]], present: [true, true], ..Default::default() }));
                self.timer.reset();
                ctx.toast(t("Opponent found"));
                if v["host"].as_bool() == Some(true) {
                    let event = v["event"].as_str().unwrap_or("333").to_string();
                    return Task::perform(spawn(move || (0..5).map(|i| qbix_core::scramble(&event, qbix_core::store::now_ms() ^ (i * 7_919))).collect::<Vec<_>>()), Msg::Scrambled);
                }
            }
            "state" => {
                if let Duel::Racing(r) = &mut self.duel {
                    r.scrambles = v["scrambles"].as_array().map(|a| a.iter().filter_map(|s| s.as_str().map(String::from)).collect()).unwrap_or_default();
                    for seat in 0..2 {
                        r.results[seat] = v["results"][seat].as_array().map(|a| a.iter().map(|x| x.as_object().map(|o| (o.get("ms").and_then(Value::as_f64).unwrap_or(0.0), serde_json::from_value(o.get("penalty").cloned().unwrap_or(json!("none"))).unwrap_or_default()))).collect()).unwrap_or_else(|| vec![None; 5]);
                        r.rematch[seat] = v["rematch"][seat].as_bool().unwrap_or(false);
                        r.present[seat] = v["present"][seat].as_bool().unwrap_or(true);
                    }
                    if r.results.iter().all(|x| x.iter().all(Option::is_none)) {
                        r.kept = false;
                        self.timer.reset();
                    }
                    if r.over() && !r.kept {
                        r.kept = true;
                        let (mine, theirs) = (r.values(r.seat), r.values(1 - r.seat));
                        let (a, b) = (average_of(&mine), average_of(&theirs));
                        let result = match (a, b) {
                            (Some(x), Some(y)) if x < y => "win",
                            (Some(x), Some(y)) if x > y => "loss",
                            (Some(_), None) => "win",
                            (None, Some(_)) => "loss",
                            _ => "draw",
                        };
                        let rec = Record { at: qbix_core::store::now_ms() as i64, event: Self::event(ctx), opponent: r.players.get(1 - r.seat).cloned().unwrap_or_default(), mine, theirs, result: result.into() };
                        let mut list = Self::records(ctx);
                        list.insert(0, rec);
                        list.truncate(200);
                        ctx.store.settings.set_pref("duels", serde_json::to_string(&list).unwrap_or_default());
                        ctx.changed();
                    }
                }
            }
            "timer" => if let Duel::Racing(r) = &mut self.duel { r.other_phase = v["phase"].as_str().unwrap_or("idle").into() },
            "left" => {
                if let Duel::Racing(r) = &mut self.duel { r.present[1 - r.seat] = false }
                ctx.toast(t("Your opponent left the race"));
            }
            "chat" => if let Duel::Racing(r) = &mut self.duel { r.chat.push((v["seat"].as_u64().unwrap_or(0) as usize, v["text"].as_str().unwrap_or("").into())) },
            _ => {}
        }
        Task::none()
    }

    pub fn update(&mut self, msg: Msg, ctx: &mut Ctx) -> Task<Msg> {
        let now = Instant::now();
        self.now = now;
        let mut task = Task::none();
        match msg {
            Msg::Tab(tab) => {
                ctx.store.settings.set_pref("challenges.tab", match tab { Tab::Duel => "duel", Tab::Tournaments => "tournaments", Tab::Daily => "daily", Tab::Wca => "wca" });
                ctx.changed();
                self.open = false;
                self.timer.reset();
                return self.enter(ctx);
            }
            Msg::Menu(open) => {
                self.menu_open = open;
                self.menu.to(open as u8 as f32);
            }
            Msg::Event(e) => {
                ctx.store.settings.set_pref("challenges.event", e);
                ctx.changed();
                self.menu_open = false;
                self.menu.to(0.0);
                self.daily_board = None;
                self.daily_last = None;
                self.wca_page = 1;
                return self.enter(ctx);
            }
            Msg::Press => {
                let racing = matches!(&self.duel, Duel::Racing(r) if !r.scrambles.is_empty() && r.round() < 5);
                if Self::tab(ctx) == Tab::Daily || racing { if let Some(stop) = self.timer.press(now) { task = self.stopped(stop, ctx) } }
            }
            Msg::Release => {
                if let Some(stop) = self.timer.release(now) { task = self.stopped(stop, ctx) }
            }
            Msg::FaceOff => {
                let Some(live) = &ctx.live else {
                    ctx.toast(t("The server cannot be reached. Check your connection."));
                    return Task::none();
                };
                let mut body = json!({ "type": "queue", "event": Self::event(ctx) });
                if let Some(l) = Self::level(ctx) { body["level"] = json!(l) }
                live.send("duel", body);
                self.duel = Duel::Searching { since: now, searching: 0 };
            }
            Msg::Leave => {
                if let Some(live) = &ctx.live { live.send("duel", json!({ "type": "leave" })) }
                self.duel = Duel::Lobby;
                self.timer.reset();
                return self.enter(ctx);
            }
            Msg::Rematch => if let Some(live) = &ctx.live { live.send("duel", json!({ "type": "rematch" })) },
            Msg::Chat(s) => self.chat = s.chars().take(300).collect(),
            Msg::SendChat => {
                if let Some(live) = &ctx.live && !self.chat.trim().is_empty() {
                    live.send("duel", json!({ "type": "chat", "text": self.chat.trim() }));
                    self.chat.clear();
                }
            }
            Msg::DuelPenalty(p) => {
                if let (Duel::Racing(r), Some(live)) = (&self.duel, &ctx.live) {
                    let round = r.round().saturating_sub(1);
                    if let Some(Some((_, cur))) = r.results[r.seat].get(round) {
                        let p = if *cur == p { Penalty::None } else { p };
                        live.send("duel", json!({ "type": "penalty", "round": round, "penalty": p }));
                    }
                }
            }
            Msg::Scrambled(list) => if let Some(live) = &ctx.live { live.send("duel", json!({ "type": "scrambles", "list": list })) },
            Msg::Board(r) => {
                if let Ok(b) = &r && b.ranked == Some(true) { ctx.toast(t("Your time is ranked")) }
                self.daily_board = Some(r.map_err(|e| e.message()));
            }
            Msg::History(r) => self.daily_history = r.unwrap_or_default(),
            Msg::Wca(tab) => {
                self.wca = tab;
                self.wca_page = 1;
                return self.load_wca(ctx);
            }
            Msg::WcaKind(k) => {
                self.wca_kind = k;
                self.wca_page = 1;
                return self.load_wca(ctx);
            }
            Msg::WcaRegion(r) => {
                self.wca_region = r;
                self.wca_page = 1;
                return self.load_wca(ctx);
            }
            Msg::WcaQuery(q) => self.wca_query = q,
            Msg::WcaSearch => {
                self.wca_page = 1;
                return self.load_wca(ctx);
            }
            Msg::WcaPage(p) => {
                self.wca_page = p.max(1);
                return self.load_wca(ctx);
            }
            Msg::WcaLoaded(key, r) => {
                if self.wca_open.as_ref().is_some_and(|o| o.0 == key) {
                    self.wca_open = Some((key, Some(r.map_err(|e| e.message()))));
                } else if key == self.wca_path(ctx) {
                    self.wca_data = Some(r.map_err(|e| e.message()));
                }
            }
            Msg::WcaOpen(path) => {
                self.wca_open = Some((path.clone(), None));
                self.open = true;
                let api = ctx.api();
                let key = path.clone();
                return Task::perform(spawn(move || api.get_within::<Value>(&path, 30)), move |r| Msg::WcaLoaded(key.clone(), r));
            }
            Msg::Drawer(open) => self.open = open,
            Msg::Tournaments(m) => return self.tournaments.update(m, ctx).map(Msg::Tournaments),
        }
        self.follow(ctx);
        task
    }

    pub fn key(&mut self, event: keyboard::Event, ctx: &mut Ctx) -> Task<Msg> {
        let now = Instant::now();
        let mut task = Task::none();
        let timed = Self::tab(ctx) == Tab::Daily || matches!(&self.duel, Duel::Racing(r) if !r.scrambles.is_empty() && r.round() < 5);
        match event {
            keyboard::Event::KeyPressed { repeat: true, .. } => {}
            keyboard::Event::KeyPressed { key: Key::Named(Named::Escape), .. } => {
                if self.menu_open { return self.update(Msg::Menu(false), ctx) }
                if self.timer.phase == Phase::Running { if let Some(stop) = self.timer.press(now) { task = self.stopped(stop, ctx) } } else if matches!(self.timer.phase, Phase::Holding | Phase::Ready) { self.timer.cancel() } else { self.open = false }
            }
            keyboard::Event::KeyPressed { key, .. } if timed => {
                if self.timer.phase == Phase::Running || key == Key::Named(Named::Space) { if let Some(stop) = self.timer.press(now) { task = self.stopped(stop, ctx) } }
            }
            keyboard::Event::KeyReleased { key: Key::Named(Named::Space), .. } => {
                if let Some(stop) = self.timer.release(now) { task = self.stopped(stop, ctx) }
            }
            _ => {}
        }
        self.follow(ctx);
        task
    }

    fn chrome(&self) -> f32 { 1.0 - self.focus.value.clamp(0.0, 1.0) }

    pub fn view<'a>(&'a self, ctx: &'a Ctx) -> View<'a, Msg> {
        let tab = Self::tab(ctx);
        let a = self.chrome();
        if tab == Tab::Tournaments {
            let mut v = self.tournaments.view(ctx).map(Msg::Tournaments);
            v.title = t("Challenges");
            v.tabs = self.tabs(tab);
            return v;
        }
        let body: Element<'a, Msg> = match tab {
            Tab::Duel => self.duel_view(ctx),
            Tab::Daily => self.daily_view(ctx),
            Tab::Wca => self.wca_view(ctx),
            Tab::Tournaments => Space::new().into(),
        };
        let mut view = View::new(t("Challenges"), body);
        view.chrome = a;
        view.tabs = self.tabs(tab);
        let event = Self::event(ctx);
        let can_pick = !matches!(self.duel, Duel::Racing(_) | Duel::Searching { .. }) || tab != Tab::Duel;
        if can_pick {
            let label = if tab == Tab::Daily { label_of(&Self::daily_event(ctx)) } else { label_of(&event) };
            view.tools.push(crate::picker::button(label, self.menu_open, a, Msg::Menu(!self.menu_open)));
        }
        if self.menu.value > 0.002 {
            let events: Vec<&qbix_core::puzzles::Event> = qbix_core::puzzles::events().iter().filter(|e| !e.puzzle.starts_with('r') && (tab != Tab::Daily || e.solve_mode == "standard") && (tab != Tab::Duel || !qbix_core::puzzles::attempt_mode(&e.solve_mode))).collect();
            let per = events.len().div_ceil(2);
            let item = |e: &qbix_core::puzzles::Event| {
                let on = e.id == event;
                press(Look::Tab { on }, tx(t(&e.label), 15.0, if on { 650 } else { 550 }, if on { ACC_INK } else { INK })).width(Length::Fill).height(38).radius(13.0).padding([0, 13]).on_press(Msg::Event(e.id.clone())).into()
            };
            let grid = row![column(events[..per].iter().map(|e| item(e))).spacing(2).width(210), column(events[per..].iter().map(|e| item(e))).spacing(2).width(210)].spacing(6);
            let right = if ctx.phone { 16.0 } else { 14.0 + (392.0 + 12.0) * ctx.drawer + 36.0 };
            view.overlay = Some(shell::popover(column![ui::label(t("Event")), grid].spacing(10).padding(8), self.menu.value, Msg::Menu(false), if ctx.phone { 70.0 } else { 96.0 }, right));
        }
        if let Some((_, data)) = &self.wca_open && tab == Tab::Wca {
            let (title, body) = self.wca_detail(data.as_ref());
            view.drawer = Some(Drawer { open: self.open, key: self.wca_open.as_ref().map(|o| o.0.clone()).unwrap_or_default(), title, sub: None, back: None, close: Msg::Drawer(false), body });
        }
        view
    }

    fn tabs(&self, tab: Tab) -> Vec<(String, Msg, bool)> { [(Tab::Duel, "Duel"), (Tab::Tournaments, "Tournaments"), (Tab::Daily, "Daily"), (Tab::Wca, "WCA")].into_iter().map(|(k, n)| (t(n), Msg::Tab(k), k == tab)).collect() }

    fn time_big<'a>(&'a self, ctx: &Ctx, rest: String) -> Element<'a, Msg> {
        let running = matches!(self.timer.phase, Phase::Running | Phase::Holding | Phase::Ready);
        let digits = if running { fmt_time(Some(self.timer.elapsed(self.now) as f64)) } else { rest };
        text(digits).size(if ctx.phone { 84.0 } else { 128.0 }).font(display(400)).color(mix(mix(INK, WARN, self.hold.value), OK, self.ready.value)).line_height(1.1).into()
    }

    fn go<'a>(&'a self, ctx: &Ctx, label: String, enabled: bool) -> Element<'a, Msg> {
        let label = match self.timer.phase {
            Phase::Holding => t("Keep holding"),
            Phase::Ready => t("Release"),
            Phase::Running => t("Stop"),
            _ => label,
        };
        let b = press(if self.timer.phase == Phase::Ready { Look::Ready } else { Look::Primary }, tx(label, 18.5, 650, SHEET)).height(60).width(if ctx.phone { Length::Fill } else { Length::Fixed(248.0) });
        if enabled { b.on_hold(Msg::Press, Msg::Release).into() } else { b.into() }
    }

    fn duel_view<'a>(&'a self, ctx: &'a Ctx) -> Element<'a, Msg> {
        let a = self.chrome();
        match &self.duel {
            Duel::Lobby => {
                let level = Self::level(ctx);
                let records = Self::records(ctx);
                let (w, l) = (records.iter().filter(|r| r.result == "win").count(), records.iter().filter(|r| r.result == "loss").count());
                let me = ctx.username();
                let vs = row![ui::avatar(&me, 72.0), tx("vs", 20.0, 650, INK3), container(icon(icon::USER, 30.0, INK3)).width(72).height(72).center(72).style(|_| container::Style { background: Some(fade(INK, 0.06).into()), border: iced::border::rounded(99), ..Default::default() })].spacing(22).align_y(Alignment::Center);
                let last = records.first().map(|r| {
                    let mine = r.mine.iter().filter(|x| x.is_some()).count();
                    let _ = mine;
                    ui::item(Some(icon::SWORDS), tf("Last race: {0} against {1}", &[&t(match r.result.as_str() { "win" => "won", "loss" => "lost", _ => "drawn" }), &r.opponent]), Some(format!("{} · ao5 {} – {}", date::short(r.at), fmt_time(average_of(&r.mine)), fmt_time(average_of(&r.theirs)))), None::<Msg>)
                });
                let mut col = column![
                    vs,
                    row![ui::stat(level.map_or("–".into(), |l| fmt_time(Some(l))), t("your level"), 26.0, INK), ui::stat(format!("{w} – {l}"), t("won – lost"), 26.0, INK)].spacing(48),
                    ui::small(t("Race someone at your level on the same five scrambles: the better average of five wins.")).align_x(Alignment::Center),
                ]
                .spacing(24)
                .align_x(Alignment::Center)
                .max_width(520);
                if let Some(l) = last { col = col.push(container(l).width(Length::Fill)) }
                if self.lobby_count > 0 { col = col.push(ui::chip(qbix_core::i18n::plural(self.lobby_count as usize, "{0} cuber searching", "{0} cubers searching"), OK, OK_SOFT)) }
                column![
                    container(col).center(Length::Fill),
                    column![press(Look::Primary, row![icon(icon::SWORDS, 19.0, SHEET), tx(t("Face off"), 18.5, 650, SHEET)].spacing(10).align_y(Alignment::Center)).height(60).width(if ctx.phone { Length::Fill } else { Length::Fixed(248.0) }).on_press(Msg::FaceOff), ui::small(if ctx.live.is_some() { t("finds an opponent in a few seconds") } else { t("Connecting…") })].spacing(12).align_x(Alignment::Center).width(Length::Fill),
                ]
                .height(Length::Fill)
                .into()
            }
            Duel::Searching { since, searching } => {
                let gone = (self.now - *since).as_secs();
                column![
                    container(column![container(icon(icon::SWORDS, 30.0, ACC)).width(84).height(84).center(84).style(|_| container::Style { background: Some(fade(ACC, 0.1).into()), border: iced::border::rounded(99), ..Default::default() }), ui::h2(t("Looking for an opponent…")), ui::small(format!("{}:{:02} · {}", gone / 60, gone % 60, qbix_core::i18n::plural(*searching as usize, "{0} other cuber searching", "{0} other cubers searching")))].spacing(14).align_x(Alignment::Center)).center(Length::Fill),
                    container(press(Look::Soft, tx(t("Cancel"), 16.0, 600, INK2)).height(52).width(200).on_press(Msg::Leave)).width(Length::Fill).center_x(Length::Fill),
                ]
                .height(Length::Fill)
                .into()
            }
            Duel::Racing(r) => {
                let me = r.seat;
                let round = r.round();
                let side = |seat: usize| {
                    let values = r.values(seat);
                    let cells = row((0..5).map(|i| {
                        let v = r.results[seat].get(i).copied().flatten();
                        let label = v.map_or("·".into(), |(ms, p)| fmt_solve(ms as u64, p));
                        let ours = r.values(me).get(i).copied().flatten();
                        let theirs = r.values(1 - me).get(i).copied().flatten();
                        let better = v.is_some() && r.results[1 - seat].get(i).copied().flatten().is_some() && if seat == me { ours < theirs || theirs.is_none() } else { theirs < ours || ours.is_none() };
                        container(tx(label, 15.0, 650, if better { OK } else { INK })).width(Length::Fill).height(38).center(Length::Fill).style(move |_| container::Style { background: Some(fade(if better { OK } else { INK }, 0.06).into()), border: iced::border::rounded(12), ..Default::default() }).into()
                    }))
                    .spacing(6);
                    let name = r.players.get(seat).cloned().unwrap_or_default();
                    let state = if seat != me { match r.other_phase.as_str() { "running" => t("solving"), "holding" | "ready" => t("about to start"), _ => String::new() } } else { String::new() };
                    column![row![ui::avatar(&name, 32.0), tx(name.clone(), 16.0, 700, INK), ui::small(state), Space::new().width(Length::Fill), tx(fmt_time(last_average(&values, 5).or(average_of(&values)).filter(|_| values.iter().all(Option::is_some))), 18.0, 700, ACC_INK)].spacing(10).align_y(Alignment::Center), cells].spacing(10)
                };
                let scramble = r.scrambles.get(round.min(4)).cloned().unwrap_or_else(|| t("Waiting for the scrambles…"));
                let over = r.over();
                let centre: Element<'a, Msg> = if over {
                    let (x, y) = (average_of(&r.values(me)), average_of(&r.values(1 - me)));
                    let verdict = match (x, y) {
                        (Some(x), Some(y)) if x < y => t("You won"),
                        (Some(x), Some(y)) if x > y => t("You lost"),
                        (Some(_), None) => t("You won"),
                        (None, Some(_)) => t("You lost"),
                        _ => t("Draw"),
                    };
                    column![ui::h1(verdict), ui::small(if r.rematch[1 - me] { t("Your opponent asks for a rematch") } else { String::new() })].spacing(8).align_x(Alignment::Center).into()
                } else {
                    let last = r.results[me].get(round.saturating_sub(1)).copied().flatten().filter(|_| round > 0 && self.timer.phase != Phase::Running);
                    column![
                        tx(tf("Solve {0} of 5", &[&(round + 1).min(5)]), 14.0, 650, INK3),
                        text(scramble).size(if ctx.phone { 18.0 } else { 22.0 }).font(crate::theme::text(500)).color(fade(INK2, a)).align_x(Alignment::Center).width(Length::Fill),
                        self.time_big(ctx, last.map_or("0.00".into(), |(ms, p)| fmt_solve(ms as u64, p))),
                        if last.is_some() { Element::from(row![press(Look::Tab { on: last.is_some_and(|l| l.1 == Penalty::Plus2) }, tx("+2", 14.5, 600, INK2)).height(34).on_press(Msg::DuelPenalty(Penalty::Plus2)), press(Look::Tab { on: last.is_some_and(|l| l.1 == Penalty::Dnf) }, tx("DNF", 14.5, 600, INK2)).height(34).on_press(Msg::DuelPenalty(Penalty::Dnf))].spacing(4)) } else { Space::new().height(34).into() },
                    ]
                    .spacing(10)
                    .align_x(Alignment::Center)
                    .into()
                };
                let chat = column![
                    column(r.chat.iter().rev().take(4).rev().map(|(s, m)| row![tx(r.players.get(*s).cloned().unwrap_or_default(), 13.5, 700, if *s == me { ACC_INK } else { INK }), tx(m.clone(), 13.5, 500, INK2)].spacing(8).into())).spacing(4),
                    row![ui::field(&t("Say something"), &self.chat, Msg::Chat).on_submit(Msg::SendChat).width(Length::Fill).padding([7, 12]).size(14.0), press(Look::Soft, icon(icon::SEND, 16.0, INK2)).width(38).height(36).padding(0).on_press(Msg::SendChat)].spacing(6).align_y(Alignment::Center),
                ]
                .spacing(8)
                .max_width(520);
                let foot: Element<'a, Msg> = if over {
                    row![press(Look::Soft, tx(t("Leave"), 16.0, 600, INK2)).height(52).width(160).on_press(Msg::Leave), press(Look::Primary, tx(if r.rematch[me] { t("Waiting…") } else { t("Rematch") }, 18.0, 650, SHEET)).height(58).width(220).on_press_maybe((!r.rematch[me] && r.present[1 - me]).then_some(Msg::Rematch))].spacing(12).align_y(Alignment::Center).into()
                } else {
                    column![self.go(ctx, t("Start"), !r.scrambles.is_empty()), press(Look::Ghost, tx(t("Leave the race"), 13.5, 550, INK3)).height(30).on_press(Msg::Leave)].spacing(8).align_x(Alignment::Center).into()
                };
                let stage = mouse_area(container(centre).width(Length::Fill).height(Length::Fill).center(Length::Fill)).on_press(Msg::Press).on_release(Msg::Release);
                column![row![container(side(me)).width(Length::Fill), container(side(1 - me)).width(Length::Fill)].spacing(28), stage, container(chat).width(Length::Fill).center_x(Length::Fill), container(foot).width(Length::Fill).center_x(Length::Fill).padding(ui::padding_top(10.0))].spacing(14).height(Length::Fill).into()
            }
        }
    }

    fn daily_view<'a>(&'a self, ctx: &'a Ctx) -> Element<'a, Msg> {
        let a = self.chrome();
        let event = Self::daily_event(ctx);
        let day = daily::today();
        let scramble = daily::scramble(&day, &event);
        let board: Element<'a, Msg> = match &self.daily_board {
            None => ui::small(t("Loading the day's field…")).into(),
            Some(Err(e)) => ui::small(e.clone()).into(),
            Some(Ok(b)) => {
                let place = b.mine.as_ref().or(b.placed.as_ref());
                let bars = histogram(b, place.and_then(|p| effective(p.time_ms as u64, p.penalty)));
                let mine: Element<'a, Msg> = match place {
                    Some(p) => row![ui::stat(fmt_solve(p.time_ms as u64, p.penalty), if b.mine.is_some() { t("your ranked time") } else { t("this attempt") }, 22.0, ACC_INK), ui::stat(format!("{} / {}", p.rank, b.total.max(p.rank)), t("rank"), 22.0, INK), ui::stat(format!("{}", p.beats), t("beaten"), 22.0, INK)].spacing(40).into(),
                    None if ctx.store.signed_in() => ui::small(t("Your first attempt of the day is ranked.")).into(),
                    None => ui::small(t("Sign in to be ranked; your attempts are placed among the field.")).into(),
                };
                column![row![ui::label(t("Today's field")), Space::new().width(Length::Fill), ui::small(qbix_core::i18n::plural(b.total as usize, "{0} cuber", "{0} cubers"))], bars, mine].spacing(14).width(Length::Fill).into()
            }
        };
        let history: Element<'a, Msg> = if self.daily_history.is_empty() { Space::new().into() } else {
            column![ui::label(t("Your days")), row(self.daily_history.iter().rev().take(7).rev().map(|d| column![tx(fmt_solve(d.time_ms as u64, d.penalty), 15.0, 650, INK), ui::small(format!("#{} · {}", d.rank, &d.day[5..]))].spacing(2).align_x(Alignment::Center).width(Length::Fill).into())).spacing(6)].spacing(10).into()
        };
        let stage = mouse_area(container(column![tx(tf("Daily scramble · {0}", &[&day]), 14.0, 650, fade(INK3, a)), text(scramble).size(if ctx.phone { 18.0 } else { 23.0 }).font(crate::theme::text(500)).color(fade(INK2, a)).align_x(Alignment::Center).width(Length::Fill), self.time_big(ctx, self.daily_last.map_or("0.00".into(), |s| fmt_solve(s.ms, s.penalty)))].spacing(10).align_x(Alignment::Center).max_width(820)).width(Length::Fill).height(Length::Fill).center(Length::Fill)).on_press(Msg::Press).on_release(Msg::Release);
        column![stage, container(column![board, history].spacing(20).max_width(820)).width(Length::Fill).center_x(Length::Fill), ui::gap(16.0), container(self.go(ctx, t("Start"), true)).width(Length::Fill).center_x(Length::Fill)].height(Length::Fill).into()
    }

    fn wca_view<'a>(&'a self, ctx: &'a Ctx) -> Element<'a, Msg> {
        let sub = ui::pills([(WcaTab::Rankings, "Rankings"), (WcaTab::Records, "Records"), (WcaTab::Competitions, "Competitions"), (WcaTab::People, "People")].into_iter().map(|(k, n)| (t(n), Msg::Wca(k), k == self.wca)).collect());
        let mut head = row![sub, Space::new().width(Length::Fill)].spacing(10).align_y(Alignment::Center);
        if self.wca == WcaTab::Rankings { head = head.push(ui::pills(vec![(t("Single"), Msg::WcaKind("single"), self.wca_kind == "single"), (t("Average"), Msg::WcaKind("average"), self.wca_kind == "average")])) }
        if matches!(self.wca, WcaTab::Rankings | WcaTab::Records) {
            let regions = [("world", "World"), ("europe", "Europe"), ("north-america", "North America"), ("asia", "Asia"), ("oceania", "Oceania"), ("south-america", "South America"), ("africa", "Africa"), ("FR", "France")];
            head = head.push(ui::pills(regions.iter().map(|(id, n)| (t(n), Msg::WcaRegion(id.to_string()), self.wca_region == *id)).collect()));
        }
        if matches!(self.wca, WcaTab::People | WcaTab::Competitions) { head = head.push(ui::field(&t(if self.wca == WcaTab::People { "A name or a WCA ID" } else { "A competition's name" }), &self.wca_query, Msg::WcaQuery).on_submit(Msg::WcaSearch).width(300).padding([8, 14])) }
        let body: Element<'a, Msg> = match &self.wca_data {
            None if self.wca == WcaTab::People => container(ui::empty(icon::SEARCH, t("Find a cuber"), t("Type at least two letters of a name, or a WCA ID."))).center(Length::Fill).into(),
            None => container(ui::small(t("Loading…"))).center(Length::Fill).into(),
            Some(Err(e)) => container(ui::empty(icon::WIFI_OFF, t("The WCA cannot be reached."), e.clone())).center(Length::Fill).into(),
            Some(Ok(v)) => self.wca_list(ctx, v),
        };
        column![head, body].spacing(18).height(Length::Fill).into()
    }

    fn wca_list<'a>(&'a self, ctx: &'a Ctx, v: &'a Value) -> Element<'a, Msg> {
        let event = qbix_core::puzzles::event(&Self::event(ctx)).map_or("333", |e| e.id.as_str()).to_string();
        let flag = |c: &str| -> String { if c.len() == 2 && c.chars().all(|x| x.is_ascii_uppercase()) { c.chars().map(|x| char::from_u32(0x1f1a5 + x as u32).unwrap_or(' ')).collect() } else { String::new() } };
        let person_row = |id: String, name: String, country: String, right: String, left: String| -> Element<'a, Msg> {
            press(Look::Ghost, row![tx(left, 14.0, 600, INK3).width(46), tx(format!("{} {name}", flag(&country)), 15.0, 600, INK).width(Length::Fill), tx(right, 15.5, 700, INK)].spacing(12).align_y(Alignment::Center)).width(Length::Fill).height(44).radius(12.0).padding([0, 10]).on_press(Msg::WcaOpen(format!("wca/persons/{id}"))).into()
        };
        let s = |x: &Value, k: &str| x.get(k).and_then(Value::as_str).unwrap_or("").to_string();
        let n = |x: &Value, k: &str| x.get(k).and_then(Value::as_i64).unwrap_or(0);
        let list: Element<'a, Msg> = match self.wca {
            WcaTab::Rankings => {
                let rows = v["rows"].as_array().cloned().unwrap_or_default();
                let pages = n(v, "pages");
                column![
                    column(rows.iter().map(|r| person_row(s(r, "id"), s(r, "name"), s(r, "country"), wca_result(&event, self.wca_kind, n(r, "best")), n(r, "rank").to_string()))).spacing(2),
                    row![press(Look::Soft, icon(icon::CHEVRON_LEFT, 16.0, INK2)).width(40).padding(0).on_press_maybe((self.wca_page > 1).then(|| Msg::WcaPage(self.wca_page - 1))), ui::small(tf("Page {0} of {1}", &[&self.wca_page, &pages])), press(Look::Soft, icon(icon::CHEVRON_RIGHT, 16.0, INK2)).width(40).padding(0).on_press_maybe((self.wca_page < pages).then(|| Msg::WcaPage(self.wca_page + 1)))].spacing(10).align_y(Alignment::Center),
                ]
                .spacing(14)
                .into()
            }
            WcaTab::Records => column(v.as_array().cloned().unwrap_or_default().into_iter().map(|r| {
                let ev = s(&r, "event");
                let held = |k: &str| r.get(k).map(|h| (wca_result(&ev, k, n(h, "best")), h["holders"].as_array().map(|a| a.iter().map(|x| s(x, "name")).collect::<Vec<_>>().join(", ")).unwrap_or_default()));
                let cell = |x: Option<(String, String)>| -> Element<'a, Msg> { x.map_or_else(|| Element::from(Space::new().width(Length::Fill)), |(v, who)| column![tx(v, 16.0, 700, INK), ui::small(who)].spacing(2).width(Length::Fill).into()) };
                row![tx(label_of(&ev), 15.0, 650, INK2).width(180), cell(held("single")), cell(held("average"))].spacing(16).align_y(Alignment::Center).into()
            }))
            .spacing(16)
            .into(),
            WcaTab::Competitions => column(v["items"].as_array().cloned().unwrap_or_default().into_iter().map(|c| ui::item(Some(icon::CALENDAR), s(&c, "name"), Some(format!("{} {} · {} → {}", flag(&s(&c, "country")), s(&c, "city"), s(&c, "start"), s(&c, "end"))), Some(Msg::WcaOpen(format!("wca/competitions/{}", s(&c, "id"))))))).spacing(2).into(),
            WcaTab::People => column(v.as_array().cloned().unwrap_or_default().into_iter().map(|p| person_row(s(&p, "id"), s(&p, "name"), s(&p, "country"), s(&p, "id"), String::new()))).spacing(2).into(),
        };
        ui::scroll(container(container(list).max_width(980)).width(Length::Fill).center_x(Length::Fill).padding(Padding { right: 12.0, bottom: 20.0, ..Padding::ZERO })).height(Length::Fill).into()
    }

    fn wca_detail<'a>(&'a self, data: Option<&'a Result<Value, String>>) -> (String, Element<'a, Msg>) {
        let s = |x: &Value, k: &str| x.get(k).and_then(Value::as_str).unwrap_or("").to_string();
        match data {
            None => (t("Loading…"), ui::small(String::new()).into()),
            Some(Err(e)) => (t("The WCA cannot be reached."), ui::small(e.clone()).into()),
            Some(Ok(v)) if v.get("records").is_some() => {
                let mut rows = column![row![ui::small(t("Event")).width(Length::Fill), ui::small(t("Single")).width(90), ui::small(t("Average")).width(90)]].spacing(10);
                if let Some(map) = v["records"].as_object() {
                    for ev in qbix_core::puzzles::events().iter().map(|e| e.id.as_str()).chain(["333bf", "333fm", "333mbf"]) {
                        let Some(r) = map.get(ev) else { continue };
                        let best = |k: &str| r.get(k).and_then(|x| x.get("best")).and_then(Value::as_i64).map_or("–".into(), |b| wca_result(ev, k, b));
                        rows = rows.push(row![tx(label_of(ev), 14.5, 600, INK).width(Length::Fill), tx(best("single"), 14.5, 700, INK).width(90), tx(best("average"), 14.5, 700, INK).width(90)].align_y(Alignment::Center));
                    }
                }
                let medals = &v["medals"];
                let n = |x: &Value, k: &str| x.get(k).and_then(Value::as_i64).unwrap_or(0);
                (s(v, "name"), column![ui::small(format!("{} · {} · {}", s(v, "id"), s(v, "countryName"), tf("{0} competitions", &[&n(v, "competitions")]))), row![ui::stat(n(medals, "gold").to_string(), t("gold"), 20.0, WARN), ui::stat(n(medals, "silver").to_string(), t("silver"), 20.0, INK2), ui::stat(n(medals, "bronze").to_string(), t("bronze"), 20.0, INK2)].spacing(30), ui::scroll(rows).height(Length::Fill)].spacing(20).height(Length::Fill).into())
            }
            Some(Ok(v)) => {
                let events = v["events"].as_array().map(|a| a.iter().filter_map(Value::as_str).map(label_of).collect::<Vec<_>>().join(", ")).unwrap_or_default();
                (s(v, "name"), column![ui::small(format!("{} · {} → {}", s(v, "city"), s(v, "start"), s(v, "end"))), ui::body(s(v, "venue")), ui::small(s(v, "address")), ui::label(t("Events")), ui::small(events), ui::small(s(v, "url"))].spacing(12).into())
            }
        }
    }
}

/// A WCA result as the WCA writes it (centiseconds; moves for Fewest Moves; cubes for Multi-Blind).
pub fn wca_result(event: &str, kind: &str, value: i64) -> String {
    match value {
        -1 => return "DNF".into(),
        -2 => return "DNS".into(),
        v if v <= 0 => return "–".into(),
        _ => {}
    }
    if event == "333fm" { return if kind == "single" { value.to_string() } else { format!("{:.2}", value as f64 / 100.0) } }
    if event == "333mbf" {
        let missed = value % 100;
        let seconds = (value / 100) % 100_000;
        let solved = 99 - value / 10_000_000 + missed;
        return format!("{solved}/{} {}:{:02}", solved + missed, seconds / 60, seconds % 60);
    }
    fmt_time(Some(value as f64 * 10.0))
}

/// The day's finished times as bars, the bar of `mine` in the accent.
fn histogram<'a>(b: &Board, mine: Option<f64>) -> Element<'a, Msg> {
    let counts = &b.buckets.counts;
    if counts.is_empty() { return ui::small(t("No one yet: be the first.")).into() }
    let most = *counts.iter().max().unwrap_or(&1) as f32;
    let at = mine.map(|m| (((m - b.buckets.from) / b.buckets.width.max(1.0)).floor().max(0.0) as usize).min(counts.len() - 1));
    row(counts.iter().enumerate().map(|(i, c)| {
        let h = 8.0 + 72.0 * *c as f32 / most.max(1.0);
        let colour: Color = if Some(i) == at { ACC } else { fade(INK, 0.12) };
        column![Space::new().height(Length::Fill), container(Space::new()).width(Length::Fill).height(h).style(move |_| container::Style { background: Some(colour.into()), border: iced::border::rounded(5), ..Default::default() })].width(Length::Fill).height(84).into()
    }))
    .spacing(3)
    .into()
}

