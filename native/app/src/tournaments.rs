//! The tournaments (open, running, finished: registering, the bracket's matches) and a match played live on the app's
//! socket (channel "match"): both players solve the same scrambles, each solve won takes a point, points take sets,
//! sets the match. The match view is shared by the tournaments and the groups' battles.
use crate::ctx::{Ctx, spawn};
use crate::icon::{self, icon};
use crate::page::{Drawer, View};
use crate::press::{Look, press};
use crate::spring::Spring;
use crate::theme::*;
use crate::ui::{self, tx};
use iced::keyboard::{self, Key, key::Named};
use iced::widget::{Space, column, container, mouse_area, row, text};
use iced::{Alignment, Element, Length, Padding, Task};
use qbix_core::api::ApiError;
use qbix_core::time::{Penalty, fmt_solve, fmt_time};
use qbix_core::timer::{Phase, Stop, Timer};
use qbix_core::{date, t, tf};
use serde_json::{Value, json};
use std::time::Instant;

#[derive(Debug, Clone)]
pub enum Msg {
    Loaded(Result<Value, ApiError>),
    Open(i64),
    Detail(Result<Value, ApiError>),
    Register(i64, bool),
    Withdraw(i64),
    Done(Result<Value, ApiError>),
    Drawer(bool),
    Play(i64),
    CloseMatch,
    Press,
    Release,
    Penalty(Penalty),
    Forfeit,
    Scrambled(i64, i64, String),
}

pub fn s(v: &Value, k: &str) -> String { v.get(k).and_then(Value::as_str).unwrap_or("").to_string() }
pub fn n(v: &Value, k: &str) -> i64 { v.get(k).and_then(Value::as_i64).unwrap_or(0) }

/// A match open: its state as the socket last said, and the player's timer.
pub struct Play {
    pub id: i64,
    pub state: Option<Value>,
    pub seat: Option<usize>,
    timer: Timer,
    hold: Spring,
    ready: Spring,
    other: String,
    asked: i64,
    now: Instant,
    pub error: Option<String>,
}

impl Play {
    pub fn new(id: i64, ctx: &Ctx) -> Self {
        if let Some(live) = &ctx.live { live.send("match", json!({ "type": "join", "match": id })) }
        Self { id, state: None, seat: None, timer: Timer::new(false), hold: Spring::quick(0.0), ready: Spring::quick(0.0), other: String::new(), asked: 0, now: Instant::now(), error: None }
    }

    pub fn leave(&self, ctx: &Ctx) {
        if let Some(live) = &ctx.live { live.send("match", json!({ "type": "leave", "match": self.id })) }
    }

    fn solves(&self) -> Vec<Value> { self.state.as_ref().and_then(|s| s["solves"].as_array().cloned()).unwrap_or_default() }

    /// The solve being played: its number, and whether this player has done it.
    fn current(&self) -> Option<(i64, bool)> {
        let seat = self.seat?;
        let last = self.solves().last().cloned()?;
        let mine = !last["results"][seat].is_null();
        let open = last["results"][0].is_null() || last["results"][1].is_null();
        open.then(|| (n(&last, "number"), mine))
    }

    fn playing(&self) -> bool { self.state.as_ref().is_some_and(|s| matches!(s["status"].as_str(), Some("ready" | "live"))) }

    /// A message of the match channel; a scramble to draw when this player's app gives the next one.
    pub fn live(&mut self, v: &Value, ctx: &Ctx) -> Option<(i64, i64, String)> {
        if v["match"].as_i64() != Some(self.id) && v["match"]["id"].as_i64() != Some(self.id) { return None }
        match v["type"].as_str().unwrap_or("") {
            "state" => {
                let m = v["match"].clone();
                let me = ctx.store.user.as_ref().map(|u| u.id.clone()).unwrap_or_default();
                self.seat = m["players"].as_array().and_then(|p| p.iter().position(|x| x["id"].as_str() == Some(&me)));
                self.state = Some(m);
                self.error = None;
                if self.timer.phase == Phase::Stopped && self.current().is_none_or(|c| !c.1) { self.timer.reset() }
                // The first player's app gives the next scramble (the second's when the first is away).
                let present = self.state.as_ref().map(|s| [s["present"][0].as_bool().unwrap_or(true), s["present"][1].as_bool().unwrap_or(true)]).unwrap_or([true, true]);
                let giver = if present[0] { 0 } else { 1 };
                if self.playing() && self.current().is_none() && self.seat == Some(giver) {
                    let next = self.solves().len() as i64 + 1;
                    if self.asked < next {
                        self.asked = next;
                        let event = self.state.as_ref().map(|s| s["event"].as_str().unwrap_or("333").to_string()).unwrap_or_default();
                        return Some((self.id, next, event));
                    }
                }
            }
            "timer" => if v["seat"].as_u64().map(|x| x as usize) != self.seat { self.other = v["phase"].as_str().unwrap_or("idle").into() },
            "error" => self.error = v["message"].as_str().map(String::from),
            _ => {}
        }
        None
    }

    fn send(&self, ctx: &Ctx, body: Value) {
        if let Some(live) = &ctx.live {
            let mut body = body;
            body["match"] = json!(self.id);
            live.send("match", body);
        }
    }

    pub fn step(&mut self, dt: f32, now: Instant, ctx: &Ctx) -> bool {
        self.now = now;
        let moving = self.hold.step(dt) | self.ready.step(dt);
        if let Some(stop) = self.timer.tick(now) { self.stopped(stop, ctx) }
        moving || self.timer.needs_ticks()
    }

    fn stopped(&mut self, stop: Stop, ctx: &Ctx) {
        if let Some((number, _)) = self.current() {
            self.send(ctx, json!({ "type": "solve", "number": number, "ms": stop.ms.max(10) }));
            if stop.penalty != Penalty::None { self.send(ctx, json!({ "type": "penalty", "number": number, "penalty": stop.penalty })) }
        }
        self.timer_phase(ctx);
    }

    fn timer_phase(&mut self, ctx: &Ctx) {
        let phase = match self.timer.phase {
            Phase::Holding => "holding",
            Phase::Ready => "ready",
            Phase::Running => "running",
            _ => "idle",
        };
        self.hold.to((self.timer.phase == Phase::Holding) as u8 as f32);
        self.ready.to((self.timer.phase == Phase::Ready) as u8 as f32);
        self.send(ctx, json!({ "type": "timer", "phase": phase }));
    }

    pub fn press(&mut self, ctx: &Ctx) {
        if self.current().is_some_and(|c| !c.1) || self.timer.phase == Phase::Running {
            if let Some(stop) = self.timer.press(Instant::now()) { self.stopped(stop, ctx) }
            self.timer_phase(ctx);
        }
    }

    pub fn release(&mut self, ctx: &Ctx) {
        if let Some(stop) = self.timer.release(Instant::now()) { self.stopped(stop, ctx) }
        self.timer_phase(ctx);
    }

    pub fn penalty(&mut self, p: Penalty, ctx: &Ctx) {
        let Some(seat) = self.seat else { return };
        if let Some(last) = self.solves().last() {
            let cur = last["results"][seat]["penalty"].as_str().unwrap_or("none");
            let p = if serde_json::to_value(p).ok().and_then(|v| v.as_str().map(String::from)).as_deref() == Some(cur) { Penalty::None } else { p };
            self.send(ctx, json!({ "type": "penalty", "number": n(last, "number"), "penalty": p }));
        }
    }

    pub fn forfeit(&self, ctx: &Ctx) { self.send(ctx, json!({ "type": "forfeit" })) }

    pub fn scramble(&self, ctx: &Ctx, number: i64, text: String) { self.send(ctx, json!({ "type": "scramble", "number": number, "text": text })) }

    pub fn key(&mut self, event: &keyboard::Event, ctx: &Ctx) {
        match event {
            keyboard::Event::KeyPressed { repeat: false, key, .. } if self.timer.phase == Phase::Running || *key == Key::Named(Named::Space) => self.press(ctx),
            keyboard::Event::KeyPressed { key: Key::Named(Named::Escape), .. } => self.timer.cancel(),
            keyboard::Event::KeyReleased { key: Key::Named(Named::Space), .. } => self.release(ctx),
            _ => {}
        }
    }

    pub fn busy(&self) -> bool { self.timer.needs_ticks() }

    pub fn view<'a, M: Clone + 'a>(&'a self, ctx: &'a Ctx, press_m: M, release_m: M, penalty_m: impl Fn(Penalty) -> M, forfeit: M, close: M) -> Element<'a, M> {
        let Some(m) = &self.state else { return container(column![ui::small(self.error.clone().unwrap_or_else(|| t("Joining the match…"))), press(Look::Soft, tx(t("Back"), 15.0, 600, INK2)).height(44).on_press(close)].spacing(16).align_x(Alignment::Center)).center(Length::Fill).into() };
        let players: Vec<String> = (0..2).map(|i| m["players"][i]["username"].as_str().unwrap_or("?").to_string()).collect();
        let score = &m["score"];
        let side = |i: usize| {
            column![ui::avatar(&players[i], 54.0), tx(players[i].clone(), 17.0, 700, INK), row![ui::stat(score["sets"][i].as_i64().unwrap_or(0).to_string(), t("sets"), 24.0, ACC_INK), ui::stat(score["points"][i].as_i64().unwrap_or(0).to_string(), t("points"), 24.0, INK)].spacing(24), ui::small(if Some(i) != self.seat && self.other == "running" { t("solving") } else { String::new() })].spacing(8).align_x(Alignment::Center).width(Length::Fill)
        };
        let status = m["status"].as_str().unwrap_or("");
        let solves = self.solves();
        let current = self.current();
        let scramble = solves.last().filter(|_| current.is_some()).map(|l| s(l, "scramble")).unwrap_or_default();
        let running = matches!(self.timer.phase, Phase::Running | Phase::Holding | Phase::Ready);
        let mine = self.seat.and_then(|seat| solves.last().map(|l| l["results"][seat].clone())).filter(|r| !r.is_null());
        let shown = if running { fmt_time(Some(self.timer.elapsed(self.now) as f64)) } else { mine.as_ref().map_or("0.00".into(), |r| fmt_solve(r["ms"].as_f64().unwrap_or(0.0) as u64, serde_json::from_value(r["penalty"].clone()).unwrap_or_default())) };
        let centre: Element<'a, M> = match status {
            "done" | "cancelled" => {
                let winner = s(m, "winner");
                let me = ctx.store.user.as_ref().map(|u| u.id.clone()).unwrap_or_default();
                ui::h1(if status == "cancelled" { t("Match cancelled") } else if winner == me { t("You won the match") } else if self.seat.is_some() { t("You lost the match") } else { t("Match over") }).into()
            }
            _ if self.seat.is_none() => ui::small(t("You are watching this match.")).into(),
            _ => column![
                tx(tf("Solve {0}", &[&solves.len().max(1)]), 14.0, 650, INK3),
                text(if scramble.is_empty() { t("Waiting for the next scramble…") } else { scramble }).size(22.0).font(crate::theme::text(500)).color(INK2).align_x(Alignment::Center).width(Length::Fill),
                text(shown).size(if ctx.phone { 84.0 } else { 120.0 }).font(display(400)).color(mix(mix(INK, WARN, self.hold.value), OK, self.ready.value)),
                if mine.is_some() && current.is_some() { Element::from(row![press(Look::Soft, tx("+2", 14.5, 600, INK2)).height(34).on_press(penalty_m(Penalty::Plus2)), press(Look::Soft, tx("DNF", 14.5, 600, INK2)).height(34).on_press(penalty_m(Penalty::Dnf))].spacing(4)) } else { Space::new().height(34).into() },
            ]
            .spacing(10)
            .align_x(Alignment::Center)
            .into(),
        };
        let history = row(solves.iter().rev().take(10).rev().map(|x| {
            let w = x["winner"].as_i64();
            let cell = |i: usize| x["results"][i].as_object().map_or("·".into(), |r| fmt_solve(r.get("ms").and_then(Value::as_f64).unwrap_or(0.0) as u64, serde_json::from_value(r.get("penalty").cloned().unwrap_or(json!("none"))).unwrap_or_default()));
            column![tx(cell(0), 13.5, if w == Some(0) { 700 } else { 500 }, if w == Some(0) { OK } else { INK2 }), tx(cell(1), 13.5, if w == Some(1) { 700 } else { 500 }, if w == Some(1) { OK } else { INK2 })].spacing(4).align_x(Alignment::Center).width(64).into()
        }))
        .spacing(4);
        let stage = mouse_area(container(centre).width(Length::Fill).height(Length::Fill).center(Length::Fill)).on_press(press_m.clone()).on_release(release_m.clone());
        let label = match self.timer.phase {
            Phase::Holding => t("Keep holding"),
            Phase::Ready => t("Release"),
            Phase::Running => t("Stop"),
            _ => t("Start"),
        };
        let can = self.seat.is_some() && (current.is_some_and(|c| !c.1) || running);
        let foot = row![
            press(Look::Ghost, row![icon(icon::BACK, 15.0, INK3), tx(t("Back"), 14.0, 600, INK3)].spacing(6).align_y(Alignment::Center)).height(40).on_press(close),
            Space::new().width(Length::Fill),
            {
                let b = press(if self.timer.phase == Phase::Ready { Look::Ready } else { Look::Primary }, tx(label, 18.0, 650, SHEET)).height(58).width(240);
                Element::from(if can { b.on_hold(press_m, release_m) } else { b })
            },
            Space::new().width(Length::Fill),
            if self.seat.is_some() && matches!(status, "ready" | "live") { Element::from(press(Look::Danger, tx(t("Forfeit"), 14.0, 600, BAD)).height(40).on_press(forfeit)) } else { Space::new().width(80).into() },
        ]
        .align_y(Alignment::Center);
        let mut col = column![row![side(0), container(tx(format!("{} · {}", crate::challenges::label_of(&s(m, "event")), tf("first to {0}", &[&n(m, "points")])), 14.0, 600, INK3)).center_y(120), side(1)].align_y(Alignment::Center), stage, container(history).width(Length::Fill).center_x(Length::Fill), foot].spacing(14).height(Length::Fill);
        if let Some(e) = &self.error { col = col.push(tx(e.clone(), 13.5, 600, BAD)) }
        col.into()
    }
}

pub struct Page {
    list: Option<Result<Vec<Value>, String>>,
    detail: Option<Result<Value, String>>,
    open: bool,
    busy: bool,
    pub play: Option<Play>,
    drawer: Spring,
}

impl Page {
    pub fn new() -> Self { Self { list: None, detail: None, open: false, busy: false, play: None, drawer: Spring::smooth(0.0) } }

    pub fn enter(&mut self, ctx: &Ctx) -> Task<Msg> {
        if !ctx.store.signed_in() { return Task::none() }
        let api = ctx.api();
        Task::perform(spawn(move || api.get::<Value>("tournaments")), Msg::Loaded)
    }

    fn reload_detail(&self, ctx: &Ctx, id: i64) -> Task<Msg> {
        let api = ctx.api();
        Task::perform(spawn(move || api.get::<Value>(&format!("tournaments/{id}"))), Msg::Detail)
    }

    pub fn step(&mut self, dt: f32, now: Instant, ctx: &Ctx) -> bool {
        let mut moving = self.drawer.step(dt);
        if let Some(p) = &mut self.play { moving |= p.step(dt, now, ctx) }
        moving
    }

    pub fn live(&mut self, v: &Value, ctx: &Ctx) -> Task<Msg> {
        if let Some(p) = &mut self.play && let Some((id, number, event)) = p.live(v, ctx) {
            return Task::perform(spawn(move || qbix_core::scramble(&event, qbix_core::store::now_ms() ^ number as u64)), move |s| Msg::Scrambled(id, number, s));
        }
        Task::none()
    }

    pub fn update(&mut self, msg: Msg, ctx: &mut Ctx) -> Task<Msg> {
        match msg {
            Msg::Loaded(r) => self.list = Some(r.map(|v| v.as_array().cloned().unwrap_or_default()).map_err(|e| e.message())),
            Msg::Open(id) => {
                self.open = true;
                self.detail = None;
                return self.reload_detail(ctx, id);
            }
            Msg::Detail(r) => self.detail = Some(r.map_err(|e| e.message())),
            Msg::Register(id, on) => {
                self.busy = true;
                let api = ctx.api();
                return Task::perform(spawn(move || api.send::<Value>(if on { "POST" } else { "DELETE" }, &format!("tournaments/{id}/register"), &json!({}))), Msg::Done);
            }
            Msg::Withdraw(id) => {
                let api = ctx.api();
                return Task::perform(spawn(move || api.post::<Value>(&format!("tournaments/{id}/withdraw"), &json!({}))), Msg::Done);
            }
            Msg::Done(r) => {
                self.busy = false;
                if let Err(e) = r { ctx.toast(e.message()) }
                let id = self.detail.as_ref().and_then(|d| d.as_ref().ok()).map(|d| n(d, "id"));
                let mut tasks = vec![self.enter(ctx)];
                if let Some(id) = id { tasks.push(self.reload_detail(ctx, id)) }
                return Task::batch(tasks);
            }
            Msg::Drawer(o) => self.open = o,
            Msg::Play(id) => {
                self.open = false;
                self.play = Some(Play::new(id, ctx));
            }
            Msg::CloseMatch => {
                if let Some(p) = self.play.take() { p.leave(ctx) }
                return self.enter(ctx);
            }
            Msg::Press => if let Some(p) = &mut self.play { p.press(ctx) },
            Msg::Release => if let Some(p) = &mut self.play { p.release(ctx) },
            Msg::Penalty(pen) => if let Some(p) = &mut self.play { p.penalty(pen, ctx) },
            Msg::Forfeit => if let Some(p) = &self.play { p.forfeit(ctx) },
            Msg::Scrambled(id, number, text) => if let Some(p) = &self.play && p.id == id { p.scramble(ctx, number, text) },
        }
        Task::none()
    }

    pub fn key(&mut self, event: &keyboard::Event, ctx: &Ctx) {
        if let Some(p) = &mut self.play { p.key(event, ctx) } else if matches!(event, keyboard::Event::KeyPressed { key: Key::Named(Named::Escape), .. }) { self.open = false }
    }

    pub fn busy(&self) -> bool { self.play.as_ref().is_some_and(Play::busy) }

    pub fn view<'a>(&'a self, ctx: &'a Ctx) -> View<'a, Msg> {
        if let Some(p) = &self.play { return View::new(t("Tournaments"), p.view(ctx, Msg::Press, Msg::Release, Msg::Penalty, Msg::Forfeit, Msg::CloseMatch)) }
        let body: Element<'a, Msg> = if !ctx.store.signed_in() {
            container(ui::empty(icon::TROPHY, t("Tournaments need an account"), t("Sign in from the profile to register and play your matches."))).center(Length::Fill).into()
        } else {
            match &self.list {
                None => container(ui::small(t("Loading…"))).center(Length::Fill).into(),
                Some(Err(e)) => container(ui::empty(icon::WIFI_OFF, t("The tournaments could not be loaded"), e.clone())).center(Length::Fill).into(),
                Some(Ok(list)) if list.is_empty() => container(ui::empty(icon::TROPHY, t("No tournament yet"), t("A group's organisers start tournaments; join a group in Social."))).center(Length::Fill).into(),
                Some(Ok(list)) => {
                    let mut col = column![].spacing(10).max_width(900);
                    for (status, title) in [("running", "Live now"), ("open", "Open for registration"), ("finished", "Finished")] {
                        let items: Vec<&Value> = list.iter().filter(|x| x["status"] == status).collect();
                        if items.is_empty() { continue }
                        col = col.push(container(ui::label(t(title))).padding(ui::padding_top(10.0)));
                        for x in items {
                            let mine = x["myMatch"].as_i64();
                            let sub = format!("{} · {} · {}", crate::challenges::label_of(&s(x, "event")), qbix_core::i18n::plural(n(x, "players") as usize, "{0} player", "{0} players"), if status == "open" { tf("starts {0}", &[&date::with_time(n(x, "startsAt"))]) } else if status == "running" { tf("round {0} of {1}", &[&n(x, "round"), &n(x, "rounds")]) } else { x["winner"]["username"].as_str().map_or_else(String::new, |w| tf("won by {0}", &[&w])) });
                            col = col.push(row![
                                container(ui::item(Some(icon::TROPHY), s(x, "name"), Some(sub), Some(Msg::Open(n(x, "id"))))).width(Length::Fill),
                                if let Some(m) = mine { Element::from(press(Look::Primary, tx(t("Play your match"), 14.5, 650, SHEET)).height(42).on_press(Msg::Play(m))) } else if x["registered"].as_bool() == Some(true) { ui::chip(t("Registered"), OK, OK_SOFT) } else { Space::new().into() },
                            ].spacing(10).align_y(Alignment::Center));
                        }
                    }
                    ui::scroll(container(col).width(Length::Fill).center_x(Length::Fill).padding(Padding { right: 12.0, bottom: 20.0, ..Padding::ZERO })).height(Length::Fill).into()
                }
            }
        };
        let mut view = View::new(t("Tournaments"), body);
        if let Some(d) = &self.detail {
            let (title, body): (String, Element<'a, Msg>) = match d {
                Err(e) => (t("Tournament"), ui::small(e.clone()).into()),
                Ok(v) => (s(v, "name"), self.detail_view(v)),
            };
            view.drawer = Some(Drawer { open: self.open, key: d.as_ref().map(|v| n(v, "id").to_string()).unwrap_or_default(), title, sub: None, back: None, close: Msg::Drawer(false), body });
        }
        view
    }

    fn detail_view<'a>(&'a self, v: &'a Value) -> Element<'a, Msg> {
        let id = n(v, "id");
        let status = s(v, "status");
        let registered = v["registered"].as_bool() == Some(true);
        let entrants = v["entrants"].as_array().cloned().unwrap_or_default();
        let matches = v["matches"].as_array().cloned().unwrap_or_default();
        let mut col = column![
            ui::small(format!("{} · {} · {}", crate::challenges::label_of(&s(v, "event")), tf("first to {0} points", &[&n(v, "points")]), s(v, "group"))),
            ui::body(s(v, "description")),
        ]
        .spacing(14);
        if status == "open" {
            col = col.push(press(if registered { Look::Soft } else { Look::Tonal }, tx(if registered { t("Cancel my registration") } else { t("Register") }, 15.0, 650, if registered { INK2 } else { ACC_INK })).width(Length::Fill).height(48).on_press_maybe((!self.busy).then_some(Msg::Register(id, !registered))));
        } else if status == "running" && registered {
            col = col.push(press(Look::Danger, tx(t("Withdraw"), 14.5, 600, BAD)).height(40).on_press(Msg::Withdraw(id)));
        }
        col = col.push(ui::label(qbix_core::i18n::plural(entrants.len(), "{0} player", "{0} players")));
        col = col.push(row(entrants.iter().take(40).map(|e| column![ui::avatar(&s(e, "username"), 34.0), tx(s(e, "username"), 11.5, 600, INK2)].spacing(4).align_x(Alignment::Center).width(64).into())).spacing(4).wrap().vertical_spacing(8));
        if !matches.is_empty() {
            col = col.push(ui::label(t("Matches")));
            for m in matches.iter().rev().take(30) {
                let p = |i: usize| m["players"][i]["username"].as_str().unwrap_or("—").to_string();
                let sc = &m["score"]["sets"];
                col = col.push(press(Look::Ghost, row![tx(format!("{} {}", t("Round"), n(m, "round")), 12.5, 600, INK3).width(64), tx(p(0), 14.0, 600, INK).width(Length::Fill), tx(format!("{} – {}", sc[0].as_i64().unwrap_or(0), sc[1].as_i64().unwrap_or(0)), 14.0, 700, INK2), tx(p(1), 14.0, 600, INK).width(Length::Fill).align_x(Alignment::End)].spacing(8).align_y(Alignment::Center)).width(Length::Fill).height(40).radius(12.0).padding([0, 8]).on_press(Msg::Play(n(m, "id"))));
            }
        }
        ui::scroll(col).height(Length::Fill).into()
    }
}
