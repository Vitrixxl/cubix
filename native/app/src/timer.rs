//! The timer: the scramble, the time, three numbers and the button. The session, every solve, one solve's detail and
//! the sessions wait in the drawer. Blindfolded solves split the memorisation, Fewest Moves gets its hour and its
//! written solution, Multi-Blind its cubes. Every motion is a spring.
use crate::charts::{Net, Trend};
use crate::ctx::{Ctx, ToastAction};
use crate::icon::{self, icon};
use crate::page::{Drawer, View};
use crate::picker;
use crate::press::{Look, press};
use crate::shell;
use crate::spring::Spring;
use crate::theme::*;
use crate::ui::{self, tx};
use iced::keyboard::{self, Key, key::Named};
use iced::widget::{Space, canvas, column, container, float, mouse_area, row, stack, text};
use iced::{Alignment, Color, Element, Length, Padding, Task, Vector};
use qbix_core::puzzles::Context;
use qbix_core::store::{NewSolve, Solve, Store};
use qbix_core::time::{Penalty, best, fmt_solve, fmt_time, last_average, mean, rolling};
use qbix_core::timer::{INSPECTION, Phase, Stop, Timer};
use qbix_core::{date, t, tf};
use std::time::{Duration, Instant};

#[derive(Debug, Clone)]
pub enum Msg {
    Press,
    Release,
    Scrambled(u64, String),
    Next,
    Penalty(i64, Penalty),
    Delete(i64),
    Drawer(Option<Pane>),
    Menu(bool),
    Pick(Context),
    Comment(String),
    SaveComment,
    NewSession,
    Switch(i64),
    Rename(String),
    SaveName,
    DeleteSession(i64),
    // Fewest Moves.
    Solution(String),
    Submit,
    GiveUp,
    StartAttempt,
    // Multi-Blind.
    Cubes(String),
    Solved(String),
    SaveMulti,
    Share(i64),
    Shared(Result<serde_json::Value, qbix_core::api::ApiError>),
    // Comp sim: a WCA round of its own session.
    Comp(bool),
    StartRound,
    EndRound,
    // Typing times instead of timing them.
    Typed(String),
    SaveTyped,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Pane {
    Session,
    Solves,
    Solve(i64),
    Sessions,
}

pub struct Page {
    timer: Timer,
    scramble: String,
    previous: String,
    asked: u64,
    seed: u64,
    pane: Pane,
    open: bool,
    menu: Spring,
    menu_open: bool,
    focus: Spring,
    swap: Spring,
    hold: Spring,
    ready: Spring,
    pub removed: Option<Solve>,
    comment: Option<(i64, String)>,
    name: Option<String>,
    /// Blindfolded: the moment the memorisation ended, within the solve.
    memo: Option<u64>,
    /// Timed in phases: the end of each phase but the last.
    splits: Vec<u64>,
    /// Fewest Moves: the attempt's start, the solution being written.
    fmc: Option<Instant>,
    solution: String,
    /// Multi-Blind: the cubes attempted, their scrambles, and the solve waiting for its count.
    cubes: String,
    multi: Option<Stop>,
    solved: String,
    typed: String,
    /// A smart cube: the scramble is on it, the solve's first turn, its turns.
    /// Comp sim: the round's session and the session it replaced.
    round: Option<(i64, Option<i64>)>,
    smart_ready: bool,
    smart_start: i64,
    smart_solution: Vec<(String, i64)>,
    now: Instant,
    trend: canvas::Cache,
    net: canvas::Cache,
}

fn seed() -> u64 { qbix_core::store::now_ms().rotate_left(17) ^ 0x9e37_79b9_7f4a_7c15 }

impl Page {
    pub fn new(ctx: &Ctx) -> (Self, Task<Msg>) {
        let mut timer = Timer::new(ctx.store.settings.inspection);
        timer.hold = Duration::from_millis(ctx.store.settings.hold_ms);
        let mut page = Self {
            timer,
            scramble: String::new(),
            previous: String::new(),
            asked: 0,
            seed: seed(),
            pane: Pane::Session,
            open: false,
            menu: Spring::smooth(0.0),
            menu_open: false,
            focus: Spring::smooth(0.0),
            swap: Spring::smooth(1.0),
            hold: Spring::quick(0.0),
            ready: Spring::quick(0.0),
            removed: None,
            comment: None,
            name: None,
            memo: None,
            splits: vec![],
            fmc: None,
            solution: String::new(),
            cubes: "2".into(),
            multi: None,
            solved: String::new(),
            typed: String::new(),
            round: None,
            smart_ready: false,
            smart_start: 0,
            smart_solution: vec![],
            now: Instant::now(),
            trend: canvas::Cache::new(),
            net: canvas::Cache::new(),
        };
        match std::env::var("QBIX_STATE").as_deref() {
            Ok("session") => page.open = true,
            Ok("solves") => (page.open, page.pane) = (true, Pane::Solves),
            Ok("sessions") => (page.open, page.pane) = (true, Pane::Sessions),
            Ok("menu") => {
                page.menu_open = true;
                page.menu.set(1.0);
            }
            _ => {}
        }
        let task = page.next_scramble(ctx);
        (page, task)
    }

    fn context(ctx: &Ctx) -> &Context { &ctx.store.settings.context }

    fn mode(ctx: &Ctx) -> &str { &ctx.store.settings.context.solve_mode }

    fn session(ctx: &mut Ctx) -> i64 {
        let c = ctx.store.settings.context.clone();
        ctx.store.session(&c)
    }

    fn current_session(&self, store: &Store) -> Option<i64> { store.current_session(&store.settings.context) }

    /// Draws the next scramble away from the interface's thread (the 3×3's tables take a moment the first time).
    fn next_scramble(&mut self, ctx: &Ctx) -> Task<Msg> {
        self.asked += 1;
        let (asked, c, seed) = (self.asked, Self::context(ctx).clone(), self.seed ^ qbix_core::store::now_ms().rotate_left(23) ^ self.asked);
        let count: usize = if c.solve_mode == "multi-blind" { self.cubes.parse().unwrap_or(2).clamp(2, 60) } else { 1 };
        Task::perform(crate::ctx::spawn(move || {
            let one = |s: u64| qbix_core::scramble::practice(&c, s).unwrap_or_else(|| qbix_core::scramble(&qbix_core::scramble::competition_event(&c), s));
            if count == 1 { one(seed) } else { (0..count as u64).map(|i| one(seed.wrapping_add(i * 7919))).collect::<Vec<_>>().join("\n") }
        }), move |s| Msg::Scrambled(asked, s))
    }

    pub fn step(&mut self, dt: f32, now: Instant, ctx: &mut Ctx) -> (bool, Task<Msg>) {
        self.now = now;
        let mut moving = false;
        for s in [&mut self.menu, &mut self.focus, &mut self.swap, &mut self.hold, &mut self.ready] {
            moving |= s.step(dt);
        }
        let mut task = Task::none();
        if let Some(stop) = self.timer.tick(now) { task = self.stopped(stop, ctx) }
        self.follow();
        (moving || self.timer.needs_ticks() || self.fmc.is_some(), task)
    }

    fn values(&self, store: &Store) -> Vec<Option<f64>> { self.current_session(store).map_or_else(Vec::new, |s| store.solves_of(s).map(Solve::value).collect()) }

    fn last<'a>(&self, store: &'a Store) -> Option<&'a Solve> { self.current_session(store).and_then(|s| store.solves_of(s).next_back()) }

    fn stopped(&mut self, stop: Stop, ctx: &mut Ctx) -> Task<Msg> {
        if Self::mode(ctx) == "multi-blind" {
            // The cubes solved are asked before the attempt is saved.
            self.multi = Some(stop);
            self.solved.clear();
            return Task::none();
        }
        let memo = self.memo.take().filter(|_| Self::mode(ctx) == "blindfolded");
        let splits = (!self.splits.is_empty()).then(|| std::mem::take(&mut self.splits));
        self.save(ctx, NewSolve { time_ms: stop.ms, penalty: stop.penalty, scramble: Some(self.scramble.clone()), memo_ms: memo, splits, ..Default::default() })
    }

    fn save(&mut self, ctx: &mut Ctx, new: NewSolve) -> Task<Msg> {
        let session = Self::session(ctx);
        let c = Self::context(ctx).clone();
        ctx.store.add(Some(session), &c, new);
        ctx.changed();
        self.trend.clear();
        self.next_scramble(ctx)
    }

    fn follow(&mut self) {
        let phase = self.timer.phase;
        self.hold.to(if phase == Phase::Holding { 1.0 } else { 0.0 });
        self.ready.to(if phase == Phase::Ready { 1.0 } else { 0.0 });
        self.focus.to(if phase == Phase::Running { 1.0 } else { 0.0 });
    }

    /// A press while the solve runs: a blindfolded solve's first one ends the memorisation.
    fn press(&mut self, ctx: &mut Ctx, now: Instant) -> Task<Msg> {
        if self.timer.phase == Phase::Running && Self::mode(ctx) == "blindfolded" && self.memo.is_none() {
            self.memo = Some(self.timer.elapsed(now));
            return Task::none();
        }
        // Timed in phases: each press before the last phase marks the end of one.
        let phases: usize = ctx.store.settings.pref("timer.phases").and_then(|p| p.parse().ok()).unwrap_or(1);
        if self.timer.phase == Phase::Running && self.splits.len() + 1 < phases {
            self.splits.push(self.timer.elapsed(now));
            return Task::none();
        }
        if !matches!(self.timer.phase, Phase::Running) {
            self.memo = None;
            self.splits.clear();
        }
        match self.timer.press(now) {
            Some(stop) => self.stopped(stop, ctx),
            None => Task::none(),
        }
    }

    fn attempt_mode(ctx: &Ctx) -> bool { Self::mode(ctx) == "fewest-moves" }

    pub fn update(&mut self, msg: Msg, ctx: &mut Ctx) -> Task<Msg> {
        let now = Instant::now();
        self.now = now;
        let mut task = Task::none();
        match msg {
            Msg::Press if !self.menu_open && self.multi.is_none() && !Self::attempt_mode(ctx) => task = self.press(ctx, now),
            Msg::Press => {}
            Msg::Release => {
                if let Some(stop) = self.timer.release(now) { task = self.stopped(stop, ctx) }
            }
            Msg::Scrambled(asked, s) => {
                if asked == self.asked {
                    self.previous = std::mem::replace(&mut self.scramble, s);
                    self.swap.set(0.0);
                    self.swap.to(1.0);
                    self.net.clear();
                }
            }
            Msg::Next => task = self.next_scramble(ctx),
            Msg::Penalty(id, p) => {
                if let Some(s) = ctx.store.get(id) {
                    let p = if s.penalty == p { Penalty::None } else { p };
                    ctx.store.set_penalty(id, p);
                    ctx.changed();
                    self.trend.clear();
                }
            }
            Msg::Delete(id) => {
                self.removed = ctx.store.remove(id);
                ctx.changed();
                self.trend.clear();
                if self.pane == Pane::Solve(id) { self.pane = Pane::Solves }
                ctx.toast_with(t("Solve deleted"), ToastAction::UndoDelete);
                if self.last(&ctx.store).is_none() || self.timer.phase == Phase::Stopped { self.timer.reset() }
            }
            Msg::Drawer(Some(p)) if self.open && self.pane == p => self.open = false,
            Msg::Drawer(Some(p)) => {
                self.pane = p;
                self.open = true;
                self.comment = None;
                self.name = None;
            }
            Msg::Drawer(None) => self.open = false,
            Msg::Menu(open) => {
                self.menu_open = open;
                self.menu.to(if open { 1.0 } else { 0.0 });
            }
            Msg::Pick(c) => {
                let changed = c != *Self::context(ctx);
                ctx.store.settings.context = c;
                Self::session(ctx);
                ctx.changed();
                // The menu stays open while the puzzle changes its options; a scramble type closes it.
                if changed {
                    self.timer.reset();
                    self.fmc = None;
                    self.multi = None;
                    self.trend.clear();
                    task = self.next_scramble(ctx);
                }
            }
            Msg::Comment(s) => {
                if let Some(c) = &mut self.comment { c.1 = s } else if let Pane::Solve(id) = self.pane { self.comment = Some((id, s)) }
            }
            Msg::SaveComment => {
                if let Some((id, c)) = self.comment.take() {
                    ctx.store.set_comment(id, Some(c));
                    ctx.changed();
                }
            }
            Msg::NewSession => {
                let c = Self::context(ctx).clone();
                ctx.store.new_session("playground", &c, vec![], None);
                ctx.changed();
                self.trend.clear();
                self.timer.reset();
                ctx.toast(t("New session"));
            }
            Msg::Switch(id) => {
                let key = qbix_core::store::context_key(Self::context(ctx));
                ctx.store.current.insert(key, id);
                ctx.changed();
                self.trend.clear();
                self.timer.reset();
                self.pane = Pane::Session;
            }
            Msg::Rename(s) => self.name = Some(s),
            Msg::SaveName => {
                if let (Some(name), Some(id)) = (self.name.take(), self.current_session(&ctx.store)) {
                    ctx.store.rename_session(id, Some(name));
                    ctx.changed();
                }
            }
            Msg::DeleteSession(id) => {
                ctx.store.delete_session(id);
                Self::session(ctx);
                ctx.changed();
                self.trend.clear();
                self.timer.reset();
                ctx.toast(t("Session deleted"));
            }
            Msg::StartAttempt => {
                self.fmc = Some(now);
                self.solution.clear();
            }
            Msg::Solution(s) => self.solution = s,
            Msg::Submit | Msg::GiveUp => {
                let Some(start) = self.fmc.take() else { return Task::none() };
                let moves = fmc_count(&self.scramble, &self.solution);
                let dnf = matches!(msg, Msg::GiveUp) || moves.is_none() || now - start > Duration::from_secs(3600);
                let new = NewSolve { time_ms: (now - start).as_millis() as u64, penalty: if dnf { Penalty::Dnf } else { Penalty::None }, scramble: Some(self.scramble.clone()), moves: moves.map(|m| m as u32), solution: (!self.solution.trim().is_empty()).then(|| self.solution.trim().to_string()), ..Default::default() };
                self.solution.clear();
                task = self.save(ctx, new);
            }
            Msg::Cubes(s) => {
                self.cubes = s.chars().filter(char::is_ascii_digit).take(2).collect();
                if self.timer.phase != Phase::Running && self.cubes.parse::<usize>().is_ok_and(|n| (2..=60).contains(&n)) { task = self.next_scramble(ctx) }
            }
            Msg::Solved(s) => self.solved = s.chars().filter(char::is_ascii_digit).take(2).collect(),
            Msg::SaveMulti => {
                let (Some(stop), Ok(solved)) = (self.multi, self.solved.parse::<u32>()) else { return Task::none() };
                let attempted = self.scramble.lines().count() as u32;
                if solved > attempted { return Task::none() }
                self.multi = None;
                task = self.save(ctx, NewSolve { time_ms: stop.ms, penalty: stop.penalty, scramble: Some(self.scramble.clone()), cubes: Some((solved, attempted)), ..Default::default() });
            }
            Msg::Comp(on) => {
                ctx.store.settings.set_pref("timer.tab", if on { "comp" } else { "practice" });
                ctx.changed();
                if !on { return self.update(Msg::EndRound, ctx) }
            }
            Msg::StartRound => {
                let c = Self::context(ctx).clone();
                let previous = self.current_session(&ctx.store);
                let name = tf("Comp {0}", &[&date::short(qbix_core::store::now_ms() as i64)]);
                let id = ctx.store.new_session("playground", &c, vec![], Some(name));
                self.round = Some((id, previous));
                self.timer.reset();
                // A round is inspected, as in competition.
                self.timer.inspection = true;
                self.trend.clear();
                ctx.changed();
                task = self.next_scramble(ctx);
            }
            Msg::EndRound => {
                if let Some((_, previous)) = self.round.take() && let Some(p) = previous {
                    let key = qbix_core::store::context_key(Self::context(ctx));
                    ctx.store.current.insert(key, p);
                    ctx.changed();
                }
                self.timer.inspection = ctx.store.settings.inspection;
                self.timer.reset();
                self.trend.clear();
            }
            Msg::Share(server) => {
                let api = ctx.api();
                return Task::perform(crate::ctx::spawn(move || api.post::<serde_json::Value>(&format!("solves/{server}/share"), &serde_json::json!({}))), Msg::Shared);
            }
            Msg::Shared(r) => match r {
                Ok(v) => {
                    let link = format!("{}/s/{}", ctx.store.settings.server, v["token"].as_str().unwrap_or(""));
                    ctx.toast(t("Link copied: anyone can open it"));
                    return iced::clipboard::write(link);
                }
                Err(e) => ctx.toast(e.message()),
            },
            Msg::Typed(s) => self.typed = s,
            Msg::SaveTyped => {
                if let Some((ms, penalty)) = parse_typed(&self.typed) {
                    self.typed.clear();
                    task = self.save(ctx, NewSolve { time_ms: ms, penalty, scramble: Some(self.scramble.clone()), ..Default::default() });
                }
            }
        }
        self.follow();
        task
    }

    /// A turn of the connected cube: the solve starts on the first turn once the scramble is on the cube, stops when
    /// the cube is solved, its turns kept as its solution.
    pub fn smart_turn(&mut self, turn: &str, at: i64, ctx: &mut Ctx) {
        if Self::context(ctx).puzzle != "333" || Self::attempt_mode(ctx) { return }
        let Some(cube) = &ctx.smart.cube else { return };
        let now = Instant::now();
        match self.timer.phase {
            Phase::Running => {
                self.smart_solution.push((turn.to_string(), at));
                if cube.is_solved() {
                    if let Some(stop) = self.timer.press(now) {
                        let ms = (at - self.smart_start).max(0) as u64;
                        let solution = Some(qbix_core::analysis::write(&self.smart_solution));
                        self.smart_solution.clear();
                        let _ = self.save(ctx, NewSolve { time_ms: qbix_core::time::to_hundredths(ms.max(stop.ms.min(ms + 50))), penalty: stop.penalty, scramble: Some(self.scramble.clone()), solution, ..Default::default() });
                        let _ = ms;
                    }
                }
            }
            Phase::Idle | Phase::Stopped if self.smart_ready => {
                // The scramble was on the cube: this turn starts the solve.
                self.smart_ready = false;
                self.smart_start = at;
                self.smart_solution = vec![(turn.to_string(), at)];
                self.timer.hold = Duration::ZERO;
                self.timer.press(now);
                self.timer.release(now);
                self.timer.hold = Duration::from_millis(ctx.store.settings.hold_ms);
            }
            _ => {
                let mut target = qbix_core::cube::Cube::solved(3);
                target.apply(&self.scramble);
                self.smart_ready = cube.net() == target.net();
                if self.smart_ready { ctx.toast(t("Scrambled: the first turn starts the timer")) }
            }
        }
        self.follow();
    }

    /// A deleted solve comes back.
    pub fn undo(&mut self, ctx: &mut Ctx) {
        if let Some(solve) = self.removed.take() {
            ctx.store.restore(solve);
            ctx.changed();
            self.trend.clear();
        }
    }

    pub fn key(&mut self, event: keyboard::Event, ctx: &mut Ctx) -> Task<Msg> {
        let now = Instant::now();
        let mut task = Task::none();
        let attempt = Self::attempt_mode(ctx) || self.multi.is_some();
        match event {
            keyboard::Event::KeyPressed { repeat: true, .. } => {}
            keyboard::Event::KeyPressed { key: Key::Named(Named::Escape), .. } => {
                if self.menu_open {
                    return self.update(Msg::Menu(false), ctx);
                } else if self.timer.phase == Phase::Running {
                    task = self.press(ctx, now);
                } else if matches!(self.timer.phase, Phase::Holding | Phase::Ready) {
                    self.timer.cancel();
                } else if self.open {
                    self.open = false;
                }
            }
            keyboard::Event::KeyPressed { key, modifiers, .. } => {
                if self.timer.phase == Phase::Running {
                    // Any key stops a solve (or ends a blindfolded one's memorisation).
                    task = self.press(ctx, now);
                } else if self.menu_open || attempt {
                } else if key == Key::Named(Named::Space) {
                    task = self.press(ctx, now);
                } else if modifiers.command() && key.as_ref() == Key::Character("z") {
                    self.undo(ctx);
                } else if !modifiers.command() && !modifiers.alt() {
                    match key.as_ref() {
                        Key::Character("s") => return self.update(Msg::Drawer(Some(Pane::Session)), ctx),
                        Key::Character("e") => return self.update(Msg::Menu(true), ctx),
                        Key::Character("n") => return self.update(Msg::Next, ctx),
                        _ => {}
                    }
                }
            }
            keyboard::Event::KeyReleased { key: Key::Named(Named::Space), .. } => {
                if let Some(stop) = self.timer.release(now) { task = self.stopped(stop, ctx) }
            }
            _ => {}
        }
        self.follow();
        task
    }

    /// Whether the timer is in the middle of something a page change would lose.
    pub fn busy(&self) -> bool { matches!(self.timer.phase, Phase::Running | Phase::Inspecting | Phase::Holding | Phase::Ready) || self.fmc.is_some() }

    pub fn set_inspection(&mut self, on: bool, hold_ms: u64) {
        self.timer.inspection = on;
        self.timer.hold = Duration::from_millis(hold_ms);
    }

    fn chrome(&self) -> f32 { 1.0 - self.focus.value.clamp(0.0, 1.0) }

    pub fn view<'a>(&'a self, ctx: &'a Ctx) -> View<'a, Msg> {
        let a = self.chrome();
        let c = Self::context(ctx);
        let drawer_on = self.open;
        let tools: Vec<Element<'a, Msg>> = vec![
            picker::button(c.label(), self.menu_open, a, Msg::Menu(!self.menu_open)),
            ui::hint(press(if drawer_on { Look::Tab { on: true } } else { Look::Soft }, icon(if ctx.phone { icon::PANEL_BOTTOM } else { icon::PANEL_RIGHT }, 18.0, fade(if drawer_on { ACC_INK } else { INK2 }, a))).width(40).padding(0).opacity(a).on_press(Msg::Drawer(Some(Pane::Session))), t("Session"), iced::widget::tooltip::Position::Bottom),
        ];
        let comp = ctx.store.settings.pref("timer.tab") == Some("comp") && !Self::attempt_mode(ctx);
        let body: Element<'a, Msg> = if Self::attempt_mode(ctx) { self.fewest_moves(ctx) } else if comp { self.comp_view(ctx) } else { self.stage(ctx) };
        let mut view = View::new(t("Timer"), body);
        if !Self::attempt_mode(ctx) { view.tabs = vec![(t("Practice"), Msg::Comp(false), !comp), (t("Comp sim"), Msg::Comp(true), comp)] }
        view.tools = tools;
        view.chrome = a;
        view.drawer = Some(self.drawer(ctx));
        if self.menu.value > 0.002 {
            let right = if ctx.phone { 16.0 } else { 14.0 + (392.0 + 12.0) * ctx.drawer + 36.0 + 48.0 };
            let top = if ctx.phone { 70.0 } else { 14.0 + 28.0 + 44.0 + 10.0 };
            view.overlay = Some(shell::popover(picker::menu(c, Msg::Pick), self.menu.value, Msg::Menu(false), top, right));
        }
        view
    }

    /// Comp sim: the round's attempts at the top, its result once they are in.
    fn comp_view<'a>(&'a self, ctx: &'a Ctx) -> Element<'a, Msg> {
        let event = Self::context(ctx).event_id();
        let format = qbix_core::puzzles::round_format(&event);
        let count = if format == "ao5" { 5 } else { 3 };
        let Some((session, _)) = self.round else {
            let all: Vec<Option<f64>> = ctx.store.solves_in(Self::context(ctx)).map(Solve::value).collect();
            let record = if format == "ao5" { rolling(&all, 5).into_iter().flatten().reduce(f64::min) } else { best(&all) };
            return container(column![
                ui::empty(icon::TROPHY, t("A round, as in competition"), tf("{0} attempts with the WCA's inspection, then your result: {1}.", &[&count, &format])),
                ui::small(tf("Your record: {0}", &[&fmt_time(record)])),
                press(Look::Primary, tx(t("Start the round"), 18.0, 650, SHEET)).height(58).width(260).on_press(Msg::StartRound),
            ].spacing(22).align_x(Alignment::Center)).center(Length::Fill).into();
        };
        let solves: Vec<&Solve> = ctx.store.solves_of(session).collect();
        let values: Vec<Option<f64>> = solves.iter().map(|s| s.value()).collect();
        let cells = row((0..count).map(|i| {
            let v = solves.get(i).map_or("·".into(), |s| fmt_solve_of(s));
            let on = i == solves.len();
            container(column![ui::small(tf("Attempt {0}", &[&(i + 1)])), tx(v, 18.0, 700, if on { ACC_INK } else { INK })].spacing(2).align_x(Alignment::Center)).width(Length::Fill).padding(10).style(move |_| container::Style { background: Some(fade(if on { ACC } else { INK }, if on { 0.08 } else { 0.04 }).into()), border: iced::border::rounded(16), ..Default::default() }).into()
        }))
        .spacing(8);
        if solves.len() >= count {
            let average = if format == "ao5" { qbix_core::time::average_of(&values[..5]) } else if values.iter().any(Option::is_none) { None } else { mean(&values) };
            let result = if format == "bo3" { best(&values) } else { average };
            let earlier: Vec<Option<f64>> = ctx.store.solves_in(Self::context(ctx)).filter(|s| s.session_id != Some(session)).map(Solve::value).collect();
            let record = if format == "ao5" { rolling(&earlier, 5).into_iter().flatten().reduce(f64::min) } else { best(&earlier) };
            let versus = match (result, record) {
                (Some(r), Some(rec)) if r < rec => (tf("{0} faster than your record", &[&fmt_time(Some(rec - r))]), OK),
                (Some(r), Some(rec)) => (tf("{0} slower than your record", &[&fmt_time(Some(r - rec))]), INK3),
                _ => (String::new(), INK3),
            };
            return column![
                cells,
                container(column![ui::small(t(if format == "bo3" { "Best" } else if format == "ao5" { "Average of 5" } else { "Mean of 3" })), text(fmt_time(result)).size(110.0).font(display(400)).color(INK), tx(versus.0, 16.0, 650, versus.1), ui::small(tf("Best single {0}", &[&fmt_time(best(&values))]))].spacing(8).align_x(Alignment::Center)).center(Length::Fill),
                row![press(Look::Soft, tx(t("Back to practice"), 15.5, 600, INK2)).height(52).padding([0, 22]).on_press(Msg::Comp(false)), press(Look::Primary, tx(t("Another round"), 17.0, 650, SHEET)).height(58).width(240).on_press(Msg::StartRound)].spacing(12).align_y(Alignment::Center),
            ]
            .spacing(16)
            .align_x(Alignment::Center)
            .height(Length::Fill)
            .into();
        }
        column![cells, self.stage(ctx)].spacing(12).height(Length::Fill).into()
    }

    fn stage<'a>(&'a self, ctx: &'a Ctx) -> Element<'a, Msg> {
        let stage = mouse_area(container(self.centre(ctx)).width(Length::Fill).height(Length::Fill).center(Length::Fill)).on_press(Msg::Press).on_release(Msg::Release);
        column![stage, self.foot(ctx)].height(Length::Fill).into()
    }

    fn scramble_text<'a>(&self, s: &str, alpha: f32, ctx: &Ctx) -> Element<'a, Msg> {
        let long = s.len() > 180;
        let size = if ctx.phone { if long { 13.5 } else { 19.5 } } else if long { 16.0 } else if s.len() > 90 { 20.0 } else { 24.0 };
        text(s.to_string()).size(size).font(crate::theme::text(500)).color(fade(INK2, alpha)).align_x(Alignment::Center).width(Length::Fill).into()
    }

    fn centre<'a>(&'a self, ctx: &'a Ctx) -> Element<'a, Msg> {
        let a = self.chrome();
        let s = self.swap.value.clamp(0.0, 1.0);
        let multi = Self::mode(ctx) == "multi-blind";
        let scrambles: Element<'a, Msg> = if multi {
            let n = self.scramble.lines().count();
            column![tx(tf("{0} cubes, {0} scrambles", &[&n]), 18.0, 600, fade(INK2, a)), tx(t("The scrambles are in the session drawer."), 14.0, 500, fade(INK3, a))].spacing(4).align_x(Alignment::Center).into()
        } else {
            stack![float(self.scramble_text(&self.previous, (1.0 - s) * a, ctx)).translate(move |_, _| Vector::new(0.0, -10.0 * s)), float(self.scramble_text(&self.scramble, s * a, ctx)).translate(move |_, _| Vector::new(0.0, 12.0 * (1.0 - s)))].into()
        };
        let scrambles = container(scrambles).max_width(820).height(if ctx.phone { 120 } else { 110 }).align_y(Alignment::Center);

        // The time: the running time, the inspection's countdown, or the last solve.
        let running = matches!(self.timer.phase, Phase::Running | Phase::Holding | Phase::Ready);
        let (digits, colour) = match self.timer.inspection_elapsed(self.now) {
            Some(gone) => {
                let left = INSPECTION.as_secs() as i64 - gone.as_secs() as i64;
                (if left > 0 { left.to_string() } else if left > -2 { "+2".into() } else { "DNF".into() }, if left > 3 { INK } else { WARN })
            }
            None if self.timer.phase == Phase::Running && ctx.store.settings.hide_running => (t("Solving"), INK),
            None if running => (fmt_time(Some(self.timer.elapsed(self.now) as f64)), INK),
            None => (self.last(&ctx.store).map_or("0.00".into(), |l| fmt_solve(l.time_ms, l.penalty)), INK),
        };
        let colour = mix(mix(colour, WARN, self.hold.value), OK, self.ready.value);
        let size = if ctx.phone { 104.0 } else { 176.0 };
        let time = text(digits).size(size).font(display(400)).color(colour).line_height(1.1);
        let memo: Element<'a, Msg> = match (self.memo, Self::mode(ctx) == "blindfolded" && self.timer.phase == Phase::Running) {
            (Some(m), true) => tx(tf("Memorised in {0}", &[&fmt_time(Some(m as f64))]), 15.0, 600, OK).into(),
            (None, true) => tx(t("Any key when memorised"), 15.0, 600, INK3).into(),
            _ if self.timer.phase == Phase::Running && !self.splits.is_empty() => tx(self.splits.iter().enumerate().map(|(i, s)| format!("{} {}", tf("Phase {0}", &[&(i + 1)]), fmt_time(Some(*s as f64)))).collect::<Vec<_>>().join(" · "), 15.0, 600, INK3).into(),
            _ => Space::new().height(0).into(),
        };

        let values = self.values(&ctx.store);
        let format = qbix_core::puzzles::round_format(&Self::context(ctx).event_id());
        let numbers: Vec<(String, Option<f64>, Color)> = if format == "ao5" { vec![("ao5".into(), last_average(&values, 5), INK), ("ao12".into(), last_average(&values, 12), INK), (t("best"), best(&values), OK)] } else { vec![("mo3".into(), mo3(&values), INK), (t("mean"), mean(&values), INK), (t("best"), best(&values), OK)] };
        let stats = row(numbers.into_iter().map(|(label, v, c)| ui::stat(fmt_time(v), label, if ctx.phone { 23.0 } else { 27.0 }, fade(c, a)))).spacing(if ctx.phone { 38 } else { 64 });

        // Corrections of the last solve, while it is the one shown.
        let last = self.last(&ctx.store).filter(|_| matches!(self.timer.phase, Phase::Idle | Phase::Stopped));
        let actions: Element<'a, Msg> = match last {
            Some(l) if self.multi.is_none() => {
                let fix = |label: &'static str, p: Penalty| {
                    let on = l.penalty == p;
                    press(Look::Tab { on }, tx(label, 14.5, if on { 650 } else { 550 }, fade(if on { ACC_INK } else { INK2 }, a))).height(34).padding([0, 14]).opacity(a).on_press(Msg::Penalty(l.id, p))
                };
                row![
                    fix("+2", Penalty::Plus2),
                    fix("DNF", Penalty::Dnf),
                    press(Look::Ghost, row![icon(icon::PENCIL, 15.0, fade(INK2, a)), tx(t("Note"), 14.5, 550, fade(INK2, a))].spacing(6).align_y(Alignment::Center)).height(34).padding([0, 14]).opacity(a).on_press(Msg::Drawer(Some(Pane::Solve(l.id)))),
                    press(Look::Danger, row![icon(icon::TRASH, 15.0, fade(BAD, a)), tx(t("Delete"), 14.5, 550, fade(BAD, a))].spacing(6).align_y(Alignment::Center)).height(34).padding([0, 14]).opacity(a).on_press(Msg::Delete(l.id))
                ]
                .spacing(4)
                .into()
            }
            _ => Space::new().height(34).into(),
        };
        if let Some(stop) = self.multi {
            let attempted = self.scramble.lines().count();
            let ok = self.solved.parse::<usize>().is_ok_and(|s| s <= attempted);
            let ask = column![
                text(fmt_time(Some(stop.ms as f64))).size(size * 0.7).font(display(400)).color(INK),
                ui::body(tf("How many of the {0} cubes are solved?", &[&attempted])),
                row![ui::field("0", &self.solved, Msg::Solved).on_submit(Msg::SaveMulti).width(90), press(Look::Primary, tx(t("Save"), 16.0, 650, SHEET)).height(46).padding([0, 26]).on_press_maybe(ok.then_some(Msg::SaveMulti))].spacing(10).align_y(Alignment::Center),
            ]
            .spacing(16)
            .align_x(Alignment::Center);
            return ask.into();
        }
        column![scrambles, time, memo, actions, Space::new().height(if ctx.phone { 18 } else { 28 }), stats].align_x(Alignment::Center).into()
    }

    fn foot<'a>(&'a self, ctx: &'a Ctx) -> Element<'a, Msg> {
        let a = self.chrome();
        let phase = self.timer.phase;
        if self.multi.is_some() { return Space::new().height(0).into() }
        let bld = Self::mode(ctx) == "blindfolded";
        let (label, look) = match phase {
            Phase::Holding => (t("Keep holding"), Look::Primary),
            Phase::Ready => (t("Release"), Look::Ready),
            Phase::Running if bld && self.memo.is_none() => (t("Memorised"), Look::Primary),
            Phase::Running => (t("Stop"), Look::Primary),
            _ => (t("Start"), Look::Primary),
        };
        let go = press(look, tx(label, 18.5, 650, SHEET)).height(60).width(if ctx.phone { Length::Fill } else { Length::Fixed(248.0) }).on_hold(Msg::Press, Msg::Release);
        let hint = match phase {
            Phase::Inspecting => t("Inspection · hold Space to start"),
            Phase::Holding => t("Keep holding…"),
            Phase::Ready => t("Release to start"),
            Phase::Running => t("Any key to stop"),
            _ if self.timer.inspection => t("Space starts the inspection"),
            _ if ctx.phone => t("or hold anywhere"),
            _ => t("or hold Space"),
        };
        let mut line = row![tx(hint, 13.5, 500, fade(INK3, a))].spacing(10).align_y(Alignment::Center);
        line = line.push(press(Look::Ghost, row![icon(icon::REFRESH, 15.0, fade(INK3, a)), tx(t("New scramble"), 13.5, 550, fade(INK3, a))].spacing(6).align_y(Alignment::Center)).height(30).padding([0, 12]).opacity(a).on_press_maybe((a > 0.5).then_some(Msg::Next)));
        if Self::mode(ctx) == "multi-blind" && !matches!(phase, Phase::Running) {
            line = line.push(row![tx(t("Cubes"), 13.5, 550, fade(INK3, a)), ui::field("2", &self.cubes, Msg::Cubes).width(64).padding([5, 10])].spacing(6).align_y(Alignment::Center));
        }
        if matches!(phase, Phase::Idle | Phase::Stopped) && !ctx.phone {
            line = line.push(ui::field(&t("Type a time"), &self.typed, Msg::Typed).on_submit(Msg::SaveTyped).width(130).padding([5, 12]).size(13.5));
        }
        let f = self.focus.value;
        let go = float(go).scale(1.0 - 0.04 * f).translate(move |_, _| Vector::new(0.0, 6.0 * f));
        column![go, line].spacing(12).align_x(Alignment::Center).width(Length::Fill).into()
    }

    /// Fewest Moves: an hour to find the shortest solution, written then counted.
    fn fewest_moves<'a>(&'a self, ctx: &'a Ctx) -> Element<'a, Msg> {
        let scramble = container(self.scramble_text(&self.scramble, 1.0, ctx)).max_width(820);
        match self.fmc {
            None => {
                let values = self.values(&ctx.store);
                let stats = row![ui::stat(fmt_moves(mean_moves(&values)), t("mean"), 27.0, INK), ui::stat(fmt_moves(best(&values)), t("best"), 27.0, OK)].spacing(64);
                column![
                    ui::fill(),
                    scramble,
                    ui::gap(18.0),
                    ui::body(t("One hour to find the shortest solution, written in the outer turns, wide turns and rotations.")).color(INK3).align_x(Alignment::Center),
                    ui::gap(26.0),
                    stats,
                    ui::fill(),
                    press(Look::Primary, tx(t("Start the attempt"), 18.5, 650, SHEET)).height(60).width(280).on_press(Msg::StartAttempt),
                    ui::gap(12.0),
                    press(Look::Ghost, row![icon(icon::REFRESH, 15.0, INK3), tx(t("New scramble"), 13.5, 550, INK3)].spacing(6).align_y(Alignment::Center)).height(30).padding([0, 12]).on_press(Msg::Next),
                ]
                .align_x(Alignment::Center)
                .width(Length::Fill)
                .height(Length::Fill)
                .into()
            }
            Some(start) => {
                let left = 3600i64 - (self.now - start).as_secs() as i64;
                let moves = fmc_count(&self.scramble, &self.solution);
                let state: (String, Color) = match moves {
                    Some(n) => (tf("{0} moves · solves the cube", &[&n]), OK),
                    None if self.solution.trim().is_empty() => (t("Write your solution"), INK3),
                    None => (t("This does not solve the cube yet"), WARN),
                };
                column![
                    tx(format!("{}:{:02}", left.max(0) / 60, left.max(0) % 60), 64.0, 400, if left < 300 { WARN } else { INK }).font(display(400)),
                    scramble,
                    ui::gap(20.0),
                    ui::field(&t("Your solution: R U R' F…"), &self.solution, Msg::Solution).on_submit(Msg::Submit).width(Length::Fixed(620.0)).size(19.0),
                    tx(state.0, 15.0, 600, state.1),
                    ui::fill(),
                    row![press(Look::Danger, tx(t("Give up (DNF)"), 15.0, 600, BAD)).height(44).padding([0, 18]).on_press(Msg::GiveUp), press(Look::Primary, tx(t("Submit"), 18.0, 650, SHEET)).height(56).width(220).on_press_maybe(moves.map(|_| Msg::Submit))].spacing(14).align_y(Alignment::Center),
                ]
                .spacing(12)
                .align_x(Alignment::Center)
                .width(Length::Fill)
                .height(Length::Fill)
                .into()
            }
        }
    }

    fn drawer<'a>(&'a self, ctx: &'a Ctx) -> Drawer<'a, Msg> {
        let session = self.current_session(&ctx.store);
        let n = session.map_or(0, |s| ctx.store.solves_of(s).count());
        let (title, sub, back, body): (String, Option<String>, Option<Msg>, Element<'a, Msg>) = match self.pane {
            Pane::Session => (session_title(&ctx.store, session), Some(qbix_core::i18n::plural(n, "{0} solve", "{0} solves")), None, self.session_view(ctx)),
            Pane::Solves => (t("All solves"), Some(n.to_string()), Some(Msg::Drawer(Some(Pane::Session))), self.solves_view(ctx)),
            Pane::Solve(id) => (ctx.store.get(id).map_or_else(|| t("Solve"), |s| fmt_solve_of(s)), ctx.store.get(id).map(|s| date::with_time(s.at())), Some(Msg::Drawer(Some(Pane::Solves))), self.solve_view(id, ctx)),
            Pane::Sessions => (t("Sessions"), Some(Self::context(ctx).label()), Some(Msg::Drawer(Some(Pane::Session))), self.sessions_view(ctx)),
        };
        Drawer { open: self.open, key: format!("{:?}", self.pane), title, sub, back, close: Msg::Drawer(None), body }
    }

    fn session_view<'a>(&'a self, ctx: &'a Ctx) -> Element<'a, Msg> {
        let values = self.values(&ctx.store);
        let n = values.len();
        let stat = |label: &'static str, v: Option<f64>| container(ui::stat(fmt_time(v), t(label), 22.0, INK)).width(Length::Fill).center_x(Length::Fill);
        let best_value = best(&values);
        let solves: Vec<&Solve> = self.current_session(&ctx.store).map_or_else(Vec::new, |s| ctx.store.solves_of(s).rev().take(8).collect());
        let chip = |s: &Solve| {
            let (bg, fg) = match s.penalty {
                Penalty::Dnf => (BAD_SOFT, BAD),
                Penalty::Plus2 => (WARN_SOFT, WARN),
                _ if s.value() == best_value => (OK_SOFT, OK),
                _ => (fade(INK, 0.055), INK),
            };
            press(Look::Ghost, container(tx(fmt_solve_of(s), 15.0, 550, fg)).width(Length::Fill).height(38).center(Length::Fill).style(move |_| container::Style { background: Some(bg.into()), border: iced::border::rounded(99), ..Default::default() })).width(Length::Fill).height(38).padding(0).on_press(Msg::Drawer(Some(Pane::Solve(s.id))))
        };
        let chips = column(solves.chunks(4).map(|c| row(c.iter().map(|s| chip(s).into())).spacing(8).into())).spacing(8);
        let trend: Element<'a, Msg> = if n >= 2 {
            canvas(OwnedTrend { times: values.clone(), averages: rolling(&values, 12.min(n.max(3))), cache: &self.trend }).width(Length::Fill).height(96).into()
        } else {
            container(ui::small(t("Two solves draw a trend"))).height(96).center_y(96).into()
        };
        let net: Element<'a, Msg> = match Self::context(ctx).cube_size() {
            Some(size) if Self::mode(ctx) != "multi-blind" => {
                let mut cube = qbix_core::cube::Cube::solved(size);
                cube.apply(&self.scramble);
                canvas(OwnedNet { faces: cube.net(), n: size, cache: &self.net }).width(220).height(140).into()
            }
            _ if Self::mode(ctx) == "multi-blind" => ui::scroll(column(self.scramble.lines().enumerate().map(|(i, l)| row![tx(format!("{}", i + 1), 13.5, 600, INK3).width(26), tx(l.to_string(), 13.5, 500, INK2)].into())).spacing(6)).height(140).into(),
            _ => ui::small(t("No preview for this puzzle yet")).into(),
        };
        let three = if qbix_core::puzzles::round_format(&Self::context(ctx).event_id()) == "ao5" { row![stat("ao50", last_average(&values, 50)), stat("ao100", last_average(&values, 100)), stat("mean", mean(&values))] } else { row![stat("best", best_value), stat("mean", mean(&values)), stat("solves", Some(n as f64 * 1000.0)).width(Length::Fill)] };
        column![
            three,
            column![ui::label(t("Trend")), trend].spacing(10),
            column![ui::label(t("Last solves")), if solves.is_empty() { Element::from(ui::small(t("No times yet"))) } else { chips.into() }].spacing(12),
            column![ui::label(t("Scramble")), container(net).width(Length::Fill).height(140).center_x(Length::Fill)].spacing(10),
            ui::fill(),
            row![
                press(Look::Soft, row![icon(icon::LAYERS, 16.0, INK2), tx(t("Sessions"), 15.0, 600, INK2)].spacing(8).align_y(Alignment::Center)).width(Length::Fill).height(50).on_press(Msg::Drawer(Some(Pane::Sessions))),
                press(Look::Tonal, row![icon(icon::LIST, 17.0, ACC_INK), tx(t("All solves"), 15.0, 650, ACC_INK)].spacing(8).align_y(Alignment::Center)).width(Length::Fill).height(50).on_press(Msg::Drawer(Some(Pane::Solves))),
            ]
            .spacing(8),
        ]
        .spacing(24)
        .height(Length::Fill)
        .into()
    }

    fn solves_view<'a>(&'a self, ctx: &'a Ctx) -> Element<'a, Msg> {
        let values = self.values(&ctx.store);
        let ao5 = rolling(&values, 5);
        let solves: Vec<&Solve> = self.current_session(&ctx.store).map_or_else(Vec::new, |s| ctx.store.solves_of(s).collect());
        if solves.is_empty() { return container(ui::empty(icon::TIMER, t("No times yet"), t("Your solves of this session will be listed here."))).center(Length::Fill).into() }
        let rows = column(solves.iter().enumerate().rev().take(1000).map(|(i, s)| {
            let colour = match s.penalty {
                Penalty::Dnf => BAD,
                Penalty::Plus2 => WARN,
                _ => INK,
            };
            press(Look::Ghost, row![tx(format!("{}", i + 1), 13.5, 500, INK3).width(40), tx(fmt_solve_of(s), 16.0, 600, colour), if s.comment.is_some() { Element::from(icon(icon::PENCIL, 13.0, INK3)) } else { Space::new().into() }, Space::new().width(Length::Fill), tx(ao5[i].map_or(String::new(), |v| format!("ao5 {}", fmt_time(Some(v)))), 13.5, 500, INK3)].spacing(8).align_y(Alignment::Center))
                .width(Length::Fill)
                .height(40)
                .radius(12.0)
                .padding([0, 10])
                .on_press(Msg::Drawer(Some(Pane::Solve(s.id))))
                .into()
        }));
        ui::scroll(rows.padding(Padding { right: 12.0, ..Padding::ZERO })).height(Length::Fill).into()
    }

    fn solve_view<'a>(&'a self, id: i64, ctx: &'a Ctx) -> Element<'a, Msg> {
        let Some(s) = ctx.store.get(id) else { return ui::small(t("This solve was deleted.")).into() };
        let fix = |label: &'static str, p: Penalty| {
            let on = s.penalty == p;
            press(Look::Tab { on }, tx(label, 14.5, if on { 650 } else { 550 }, if on { ACC_INK } else { INK2 })).height(36).padding([0, 16]).on_press(Msg::Penalty(id, p))
        };
        let comment = self.comment.as_ref().filter(|c| c.0 == id).map_or_else(|| s.comment.clone().unwrap_or_default(), |c| c.1.clone());
        let editing = self.comment.as_ref().is_some_and(|c| c.0 == id);
        let mut details = column![].spacing(6);
        if let Some(m) = s.memo_ms { details = details.push(ui::small(tf("Memorisation {0} · execution {1}", &[&fmt_time(Some(m as f64)), &fmt_time(Some(s.time_ms.saturating_sub(m) as f64))]))) }
        if let Some(m) = s.moves { details = details.push(ui::small(tf("{0} moves", &[&m]))) }
        if let (Some(a), Some(b)) = (s.cubes_solved, s.cubes_attempted) { details = details.push(ui::small(tf("{0} of {1} cubes solved", &[&a, &b]))) }
        if let Some(sp) = &s.splits {
            let mut last = 0;
            let phases: Vec<String> = sp.iter().chain(std::iter::once(&s.time_ms)).enumerate().map(|(i, end)| {
                let d = end.saturating_sub(last);
                last = *end;
                format!("{} {}", tf("Phase {0}", &[&(i + 1)]), fmt_time(Some(d as f64)))
            }).collect();
            details = details.push(ui::small(phases.join(" · ")));
        }
        if let Some(sol) = &s.solution {
            let turns = qbix_core::analysis::read(sol);
            let steps = turns.as_ref().and_then(|tr| qbix_core::analysis::cfop(s.scramble.as_deref().unwrap_or(""), tr));
            match steps {
                Some(st) => details = details.push(ui::small(st.iter().map(|x| format!("{} {}", t(&x.name), fmt_time(x.ms.map(|m| m as f64)))).collect::<Vec<_>>().join(" · "))),
                None => details = details.push(ui::small(sol.split_whitespace().map(|w| w.split('@').next().unwrap_or("")).collect::<Vec<_>>().join(" "))),
            }
        }
        column![
            row![fix("OK", Penalty::None), fix("+2", Penalty::Plus2), fix("DNF", Penalty::Dnf)].spacing(4),
            details,
            column![ui::label(t("Scramble")), tx(s.scramble.clone().unwrap_or_default(), 15.0, 500, INK2)].spacing(8),
            column![ui::label(t("Note")), ui::field(&t("Add a note"), &comment, Msg::Comment).on_submit(Msg::SaveComment), if editing { Element::from(press(Look::Tonal, tx(t("Save the note"), 14.5, 650, ACC_INK)).height(36).on_press(Msg::SaveComment)) } else { Space::new().into() }].spacing(8),
            ui::fill(),
            press(Look::Soft, row![icon(icon::SHARE, 16.0, INK2), tx(t("Share a link to this solve"), 15.0, 600, INK2)].spacing(8).align_y(Alignment::Center)).width(Length::Fill).height(48).on_press_maybe(s.server_id.filter(|_| ctx.store.signed_in()).map(Msg::Share)),
            press(Look::Danger, row![icon(icon::TRASH, 16.0, BAD), tx(t("Delete solve"), 15.0, 600, BAD)].spacing(8).align_y(Alignment::Center)).width(Length::Fill).height(48).on_press(Msg::Delete(id)),
        ]
        .spacing(22)
        .height(Length::Fill)
        .into()
    }

    fn sessions_view<'a>(&'a self, ctx: &'a Ctx) -> Element<'a, Msg> {
        let c = Self::context(ctx);
        let current = self.current_session(&ctx.store);
        let sessions: Vec<_> = ctx.store.sessions_of("playground", c).rev().collect();
        let name = self.name.clone().unwrap_or_else(|| current.and_then(|id| ctx.store.session_row(id)).and_then(|s| s.name.clone()).unwrap_or_default());
        let list = column(sessions.into_iter().map(|s| {
            let values: Vec<Option<f64>> = ctx.store.solves_of(s.id).map(Solve::value).collect();
            let on = Some(s.id) == current;
            let title = session_title(&ctx.store, Some(s.id));
            let sub = format!("{} · {} {} · {} {}", qbix_core::i18n::plural(values.len(), "{0} solve", "{0} solves"), t("best"), fmt_time(best(&values)), t("mean"), fmt_time(mean(&values)));
            press(Look::Tab { on }, row![column![tx(title, 15.5, if on { 700 } else { 600 }, if on { ACC_INK } else { INK }), ui::small(sub)].spacing(2).width(Length::Fill), if on { Element::from(icon(icon::CHECK, 16.0, ACC_INK)) } else { Space::new().into() }].align_y(Alignment::Center)).width(Length::Fill).height(60).radius(16.0).padding([0, 14]).on_press(Msg::Switch(s.id)).into()
        }))
        .spacing(4);
        column![
            column![ui::label(t("Name of this session")), row![ui::field(&t("Session name"), &name, Msg::Rename).on_submit(Msg::SaveName), press(Look::Tonal, icon(icon::CHECK, 17.0, ACC_INK)).width(44).padding(0).on_press_maybe(self.name.as_ref().map(|_| Msg::SaveName))].spacing(8).align_y(Alignment::Center)].spacing(8),
            ui::scroll(list).height(Length::Fill),
            row![
                press(Look::Danger, row![icon(icon::TRASH, 15.0, BAD), tx(t("Delete"), 14.5, 600, BAD)].spacing(6).align_y(Alignment::Center)).height(50).padding([0, 16]).on_press_maybe(current.map(Msg::DeleteSession)),
                press(Look::Tonal, row![icon(icon::PLUS, 17.0, ACC_INK), tx(t("New session"), 15.0, 650, ACC_INK)].spacing(8).align_y(Alignment::Center)).width(Length::Fill).height(50).on_press(Msg::NewSession),
            ]
            .spacing(8),
        ]
        .spacing(20)
        .height(Length::Fill)
        .into()
    }
}

/// A session's name: its own, or its first day.
pub fn session_title(store: &Store, id: Option<i64>) -> String {
    let Some(s) = id.and_then(|id| store.session_row(id)) else { return t("Session") };
    s.name.clone().unwrap_or_else(|| tf("Session of {0}", &[&date::short(store.solves_of(s.id).next().map_or_else(|| date::parse(&s.created_at).unwrap_or(0), |x| x.at()))]))
}

/// A solve's result as shown: its time, its moves (Fewest Moves), its cubes (Multi-Blind).
pub fn fmt_solve_of(s: &Solve) -> String {
    match s.solve_mode.as_str() {
        "fewest-moves" if s.penalty != Penalty::Dnf => s.moves.map_or_else(|| "DNF".into(), |m| m.to_string()),
        "multi-blind" if s.penalty != Penalty::Dnf => match (s.cubes_solved, s.cubes_attempted) {
            (Some(a), Some(b)) if s.value().is_some() => format!("{a}/{b} {}", fmt_time(Some(s.time_ms as f64))),
            _ => "DNF".into(),
        },
        _ => fmt_solve(s.time_ms, s.penalty),
    }
}

fn fmt_moves(v: Option<f64>) -> String { v.map_or("–".into(), |m| format!("{:.2}", m / 1000.0).trim_end_matches('0').trim_end_matches('.').to_string()) }

fn mean_moves(values: &[Option<f64>]) -> Option<f64> { mean(values) }

/// The mean of the last three (Fewest Moves, the big cubes).
fn mo3(values: &[Option<f64>]) -> Option<f64> {
    if values.len() < 3 { return None }
    let last = &values[values.len() - 3..];
    if last.iter().any(Option::is_none) { return None }
    Some(last.iter().flatten().sum::<f64>() / 3.0)
}

/// The move count of a Fewest Moves solution, when it solves the scramble (rotations do not count).
pub fn fmc_count(scramble: &str, solution: &str) -> Option<usize> {
    let solution = qbix_core::alg::expand(solution);
    if solution.is_empty() || solution.len() > 400 { return None }
    let mut cube = qbix_core::cube::Cube::solved(3);
    if !cube.apply(scramble) || !cube.apply(&solution) { return None }
    let upright = qbix_core::alg::upright(&cube)?;
    cube.apply(&upright);
    cube.is_solved().then(|| solution.split_whitespace().filter(|m| !m.starts_with(['x', 'y', 'z'])).count())
}

/// A time typed by hand: "12.34", "1:02.30", "12.34+", "DNF".
pub fn parse_typed(s: &str) -> Option<(u64, Penalty)> {
    let s = s.trim();
    if s.eq_ignore_ascii_case("dnf") { return Some((0, Penalty::Dnf)) }
    let (s, penalty) = match s.strip_suffix('+') {
        Some(rest) => (rest, Penalty::Plus2),
        None => (s, Penalty::None),
    };
    let (minutes, seconds) = match s.split_once(':') {
        Some((m, sec)) => (m.parse::<u64>().ok()?, sec),
        None => (0, s),
    };
    let secs: f64 = if seconds.contains('.') { seconds.parse().ok()? } else if seconds.len() > 2 && minutes == 0 {
        // "1234" is 12.34, as competition timers are typed.
        seconds.parse::<f64>().ok()? / 100.0
    } else {
        seconds.parse().ok()?
    };
    let ms = ((minutes as f64 * 60.0 + secs) * 1000.0).round() as u64;
    (ms > 0 && ms < 24 * 3600 * 1000).then_some((qbix_core::time::to_hundredths(ms), penalty))
}

struct OwnedTrend<'a> {
    times: Vec<Option<f64>>,
    averages: Vec<Option<f64>>,
    cache: &'a canvas::Cache,
}

impl canvas::Program<Msg> for OwnedTrend<'_> {
    type State = ();
    fn draw(&self, state: &(), renderer: &iced::Renderer, theme: &iced::Theme, bounds: iced::Rectangle, cursor: iced::mouse::Cursor) -> Vec<canvas::Geometry> {
        canvas::Program::<Msg>::draw(&Trend { times: &self.times, averages: &self.averages, cache: self.cache }, state, renderer, theme, bounds, cursor)
    }
}

struct OwnedNet<'a> {
    faces: [Vec<u8>; 6],
    n: usize,
    cache: &'a canvas::Cache,
}

impl canvas::Program<Msg> for OwnedNet<'_> {
    type State = ();
    fn draw(&self, state: &(), renderer: &iced::Renderer, theme: &iced::Theme, bounds: iced::Rectangle, cursor: iced::mouse::Cursor) -> Vec<canvas::Geometry> {
        canvas::Program::<Msg>::draw(&Net { faces: &self.faces, n: self.n, cache: self.cache }, state, renderer, theme, bounds, cursor)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_typed_times_and_counts_solutions() {
        assert_eq!(parse_typed("12.34"), Some((12_340, Penalty::None)));
        assert_eq!(parse_typed("1:02.3"), Some((62_300, Penalty::None)));
        assert_eq!(parse_typed("1234"), Some((12_340, Penalty::None)));
        assert_eq!(parse_typed("9.99+"), Some((9_990, Penalty::Plus2)));
        assert_eq!(parse_typed("dnf"), Some((0, Penalty::Dnf)));
        assert_eq!(parse_typed("abc"), None);
        assert_eq!(fmc_count("R U", "U' R'"), Some(2));
        assert_eq!(fmc_count("R U", "U R"), None);
    }
}
