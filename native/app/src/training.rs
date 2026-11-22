//! The training: cases in a round (those picked, learned, whole sets or the recommended ones), the steps of a method
//! (the cross, an EOLine… at a set number of moves, with their optimal solutions), recognition as flash cards, and the
//! review of the cases due (spaced repetition). The cases' figures and the choice wait in the drawer.
use crate::ctx::Ctx;
use crate::diagram;
use crate::icon::{self, icon};
use crate::page::{Drawer, View};
use crate::press::{Look, press};
use crate::shell;
use crate::spring::Spring;
use crate::theme::*;
use crate::ui::{self, tx};
use iced::keyboard::{self, Key, key::Named};
use iced::widget::{Space, column, container, mouse_area, row, text};
use iced::{Alignment, Element, Length, Padding, Task};
use qbix_core::catalog::{Case, catalog};
use qbix_core::puzzles::Context;
use qbix_core::store::NewSolve;
use qbix_core::time::{Penalty, fmt_solve, fmt_time};
use qbix_core::timer::{Phase, Stop, Timer};
use qbix_core::training::{self, CaseStats};
use qbix_core::{steps, t, tf};
use std::collections::HashMap;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Kind {
    Cases,
    Steps,
    Recognition,
    Review,
    Blind,
}

#[derive(Debug, Clone)]
pub enum Msg {
    Kind(Kind),
    Press,
    Release,
    Next,
    Reveal,
    Drawer(Option<Pane>),
    Menu(bool),
    Puzzle(String),
    /// The cases of a round.
    Pool(Vec<String>),
    ToggleSet(String),
    RandomAuf,
    Penalty(Penalty),
    Delete,
    Target(String),
    Moves(u32),
    Scrambled(u64, String),
    Solutions(u64, Vec<(String, String)>),
    Knew(bool),
    Seconds(u32),
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Pane {
    Choose,
    ByCase,
}

pub struct Page {
    timer: Timer,
    current: Option<String>,
    previous: Option<String>,
    scramble: String,
    revealed: bool,
    last: Option<i64>,
    session: Option<i64>,
    asked: u64,
    solutions: Option<Vec<(String, String)>>,
    shown_at: Instant,
    known: usize,
    missed: usize,
    open: bool,
    pane: Pane,
    menu: Spring,
    menu_open: bool,
    focus: Spring,
    hold: Spring,
    ready: Spring,
    swap: Spring,
    now: Instant,
    stats: HashMap<String, CaseStats>,
    stats_revision: u64,
}

fn seed(n: u64) -> u64 { qbix_core::store::now_ms().rotate_left(13) ^ n.wrapping_mul(0x9e37_79b9_7f4a_7c15) }

impl Page {
    pub fn new(ctx: &Ctx) -> Self {
        let mut timer = Timer::new(false);
        timer.hold = Duration::from_millis(ctx.store.settings.hold_ms);
        Self {
            timer,
            current: None,
            previous: None,
            scramble: String::new(),
            revealed: false,
            last: None,
            session: None,
            asked: 0,
            solutions: None,
            shown_at: Instant::now(),
            known: 0,
            missed: 0,
            open: false,
            pane: Pane::Choose,
            menu: Spring::smooth(0.0),
            menu_open: false,
            focus: Spring::smooth(0.0),
            hold: Spring::quick(0.0),
            ready: Spring::quick(0.0),
            swap: Spring::smooth(1.0),
            now: Instant::now(),
            stats: HashMap::new(),
            stats_revision: u64::MAX,
        }
    }

    fn kind(ctx: &Ctx) -> Kind {
        match ctx.store.settings.pref("training.kind") {
            Some("steps") => Kind::Steps,
            Some("recognition") => Kind::Recognition,
            Some("review") => Kind::Review,
            Some("blind") => Kind::Blind,
            _ => Kind::Cases,
        }
    }

    fn puzzle(ctx: &Ctx) -> String { ctx.store.settings.pref("algs.puzzle").unwrap_or("333").to_string() }

    pub fn pool(ctx: &Ctx) -> Vec<String> { ctx.store.settings.training_cases.get("picked").cloned().unwrap_or_default() }

    /// The cases this round draws from: the pool, or the cases due for a review.
    fn round(&self, ctx: &Ctx) -> Vec<String> {
        match Self::kind(ctx) {
            Kind::Review => training::due_cases(&ctx.store, &self.stats, qbix_core::store::now_ms() as i64).into_iter().filter(|id| catalog().case(id).is_some_and(|c| c.puzzle() == Self::puzzle(ctx))).collect(),
            _ => Self::pool(ctx),
        }
    }

    fn target(ctx: &Ctx) -> (&'static steps::Spec, u32) {
        let kind = ctx.store.settings.pref("training.steps").unwrap_or("cross-5");
        steps::of_type(kind).unwrap_or_else(|| steps::of_type("cross-5").unwrap())
    }

    fn steps_context(ctx: &Ctx) -> Context {
        let (s, n) = Self::target(ctx);
        Context::new("333", "standard", &if s.moves.is_empty() { s.id.to_string() } else { format!("{}-{n}", s.id) })
    }

    pub fn refresh_stats(&mut self, ctx: &Ctx) {
        if self.stats_revision != ctx.store.revision {
            self.stats = training::stats(&ctx.store);
            self.stats_revision = ctx.store.revision;
        }
    }

    /// The page shown: its stats read again, a case or a step ready.
    pub fn enter(&mut self, ctx: &mut Ctx) -> Task<Msg> {
        self.refresh_stats(ctx);
        match Self::kind(ctx) {
            Kind::Steps | Kind::Blind if self.scramble.is_empty() || self.current.is_some() => self.next(ctx),
            Kind::Cases | Kind::Review | Kind::Recognition if self.current.as_ref().is_none_or(|c| !self.round(ctx).contains(c)) => self.next(ctx),
            _ => Task::none(),
        }
    }

    fn next(&mut self, ctx: &mut Ctx) -> Task<Msg> {
        self.revealed = false;
        self.solutions = None;
        self.timer.reset();
        self.last = None;
        self.shown_at = Instant::now();
        self.asked += 1;
        self.swap.set(0.0);
        self.swap.to(1.0);
        if Self::kind(ctx) == Kind::Blind {
            self.current = None;
            let (asked, seed) = (self.asked, seed(self.asked));
            return Task::perform(crate::ctx::spawn(move || qbix_core::scramble("333bf", seed)), move |s| Msg::Scrambled(asked, s));
        }
        if Self::kind(ctx) == Kind::Steps {
            self.current = None;
            let (s, n) = Self::target(ctx);
            let (asked, seed) = (self.asked, seed(self.asked));
            return Task::perform(crate::ctx::spawn(move || steps::scramble(s, n, &mut qbix_core::Rng::new(seed))), move |s| Msg::Scrambled(asked, s));
        }
        let round = self.round(ctx);
        if round.is_empty() {
            self.current = None;
            self.scramble.clear();
            return Task::none();
        }
        let mut pick = (seed(self.asked) % round.len() as u64) as usize;
        if round.len() > 1 && self.current.as_ref() == Some(&round[pick]) { pick = (pick + 1) % round.len() }
        self.previous = self.current.take();
        self.current = Some(round[pick].clone());
        let c = catalog().case(&round[pick]).unwrap();
        let random_auf = ctx.store.settings.pref("training.auf") != Some("off");
        let (s, _) = qbix_core::scramble::case(c, seed(self.asked));
        self.scramble = if random_auf { s } else { qbix_core::alg::expand(&c.setup) };
        Task::none()
    }

    fn session(&mut self, ctx: &mut Ctx) -> i64 {
        if let Some(s) = self.session.filter(|s| ctx.store.session_row(*s).is_some()) { return s }
        let c = Context::new(&Self::puzzle(ctx), "standard", "case");
        let id = ctx.store.new_session("training", &c, Self::pool(ctx), None);
        self.session = Some(id);
        id
    }

    fn stopped(&mut self, stop: Stop, ctx: &mut Ctx) -> Task<Msg> {
        let new = NewSolve { time_ms: stop.ms, penalty: stop.penalty, scramble: Some(self.scramble.clone()), case_id: self.current.clone(), ..Default::default() };
        let id = if Self::kind(ctx) == Kind::Steps {
            let c = Self::steps_context(ctx);
            let session = ctx.store.session(&c);
            ctx.store.add(Some(session), &c, new)
        } else {
            let session = self.session(ctx);
            let c = Context::new(&Self::puzzle(ctx), "standard", "case");
            ctx.store.add(Some(session), &c, new)
        };
        self.last = Some(id);
        self.revealed = true;
        ctx.changed();
        self.refresh_stats(ctx);
        Task::none()
    }

    pub fn step(&mut self, dt: f32, now: Instant, ctx: &mut Ctx) -> (bool, Task<Msg>) {
        self.now = now;
        let mut moving = false;
        for s in [&mut self.menu, &mut self.focus, &mut self.hold, &mut self.ready, &mut self.swap] {
            moving |= s.step(dt);
        }
        let mut task = Task::none();
        if let Some(stop) = self.timer.tick(now) { task = self.stopped(stop, ctx) }
        // Recognition: the card turns over once its seconds are gone.
        if Self::kind(ctx) == Kind::Recognition && self.current.is_some() && !self.revealed {
            if now - self.shown_at >= Duration::from_secs(Self::seconds(ctx) as u64) { self.revealed = true } else { moving = true }
        }
        self.follow();
        (moving || self.timer.needs_ticks(), task)
    }

    fn seconds(ctx: &Ctx) -> u32 { ctx.store.settings.pref("training.seconds").and_then(|s| s.parse().ok()).unwrap_or(4) }

    fn follow(&mut self) {
        let phase = self.timer.phase;
        self.hold.to((phase == Phase::Holding) as u8 as f32);
        self.ready.to((phase == Phase::Ready) as u8 as f32);
        self.focus.to((phase == Phase::Running) as u8 as f32);
    }

    pub fn busy(&self) -> bool { matches!(self.timer.phase, Phase::Running | Phase::Holding | Phase::Ready) }

    pub fn update(&mut self, msg: Msg, ctx: &mut Ctx) -> Task<Msg> {
        let now = Instant::now();
        self.now = now;
        let mut task = Task::none();
        match msg {
            Msg::Kind(k) => {
                ctx.store.settings.set_pref("training.kind", match k { Kind::Cases => "cases", Kind::Steps => "steps", Kind::Recognition => "recognition", Kind::Review => "review", Kind::Blind => "blind" });
                ctx.changed();
                self.current = None;
                self.scramble.clear();
                task = self.enter(ctx);
            }
            Msg::Press if self.menu_open || Self::kind(ctx) == Kind::Recognition => {}
            Msg::Press => {
                if self.timer.phase == Phase::Stopped && self.revealed && self.timer.phase != Phase::Running {
                    // After a solve, a press goes on to the next case, then holds.
                    task = self.next(ctx);
                }
                if let Some(stop) = self.timer.press(now) { task = self.stopped(stop, ctx) }
            }
            Msg::Release => {
                if let Some(stop) = self.timer.release(now) { task = self.stopped(stop, ctx) }
            }
            Msg::Next => task = self.next(ctx),
            Msg::Reveal => {
                self.revealed = !self.revealed;
                if Self::kind(ctx) == Kind::Steps && self.solutions.is_none() {
                    let (s, _) = Self::target(ctx);
                    let (asked, scramble) = (self.asked, self.scramble.clone());
                    task = Task::perform(crate::ctx::spawn(move || steps::solutions(&scramble, s, 4)), move |r| Msg::Solutions(asked, r));
                }
            }
            Msg::Drawer(Some(p)) if self.open && self.pane == p => self.open = false,
            Msg::Drawer(Some(p)) => {
                self.pane = p;
                self.open = true;
            }
            Msg::Drawer(None) => self.open = false,
            Msg::Menu(open) => {
                self.menu_open = open;
                self.menu.to(open as u8 as f32);
            }
            Msg::Puzzle(p) => {
                ctx.store.settings.set_pref("algs.puzzle", p);
                self.menu_open = false;
                self.menu.to(0.0);
                ctx.changed();
            }
            Msg::Pool(ids) => {
                ctx.store.settings.training_cases.insert("picked".into(), ids);
                self.session = None;
                ctx.changed();
                self.current = None;
                task = self.next(ctx);
            }
            Msg::ToggleSet(set) => {
                let mut pool = Self::pool(ctx);
                let ids: Vec<String> = catalog().cases_of_set(&set).map(|c| c.id.clone()).collect();
                if ids.iter().all(|id| pool.contains(id)) { pool.retain(|id| !ids.contains(id)) } else {
                    let new: Vec<String> = ids.into_iter().filter(|id| !pool.contains(id)).collect();
                    pool.extend(new)
                }
                return self.update(Msg::Pool(pool), ctx);
            }
            Msg::RandomAuf => {
                let off = ctx.store.settings.pref("training.auf") == Some("off");
                ctx.store.settings.set_pref("training.auf", if off { "on" } else { "off" });
                ctx.changed();
            }
            Msg::Penalty(p) => {
                if let Some(id) = self.last && let Some(s) = ctx.store.get(id) {
                    let p = if s.penalty == p { Penalty::None } else { p };
                    ctx.store.set_penalty(id, p);
                    ctx.changed();
                    self.refresh_stats(ctx);
                }
            }
            Msg::Delete => {
                if let Some(id) = self.last.take() {
                    ctx.store.remove(id);
                    ctx.changed();
                    self.refresh_stats(ctx);
                    ctx.toast(t("Solve deleted"));
                }
            }
            Msg::Target(id) => {
                let s = steps::spec(&id).unwrap();
                let kind = if s.moves.is_empty() { id } else { format!("{id}-{}", s.moves[s.moves.len() / 2]) };
                ctx.store.settings.set_pref("training.steps", kind);
                ctx.changed();
                task = self.next(ctx);
            }
            Msg::Moves(n) => {
                let (s, _) = Self::target(ctx);
                ctx.store.settings.set_pref("training.steps", format!("{}-{n}", s.id));
                ctx.changed();
                task = self.next(ctx);
            }
            Msg::Scrambled(asked, s) => {
                if asked == self.asked {
                    self.scramble = s;
                    self.swap.set(0.0);
                    self.swap.to(1.0);
                }
            }
            Msg::Solutions(asked, r) => if asked == self.asked { self.solutions = Some(r) },
            Msg::Knew(k) => {
                if k { self.known += 1 } else { self.missed += 1 }
                task = self.next(ctx);
            }
            Msg::Seconds(s) => {
                ctx.store.settings.set_pref("training.seconds", s.to_string());
                ctx.changed();
            }
        }
        self.follow();
        task
    }

    pub fn key(&mut self, event: keyboard::Event, ctx: &mut Ctx) -> Task<Msg> {
        let now = Instant::now();
        let mut task = Task::none();
        match event {
            keyboard::Event::KeyPressed { repeat: true, .. } => {}
            keyboard::Event::KeyPressed { key: Key::Named(Named::Escape), .. } => {
                if self.menu_open { return self.update(Msg::Menu(false), ctx) }
                if self.timer.phase == Phase::Running { if let Some(stop) = self.timer.press(now) { task = self.stopped(stop, ctx) } } else if matches!(self.timer.phase, Phase::Holding | Phase::Ready) { self.timer.cancel() } else { self.open = false }
            }
            keyboard::Event::KeyPressed { key, .. } => {
                if self.timer.phase == Phase::Running {
                    if let Some(stop) = self.timer.press(now) { task = self.stopped(stop, ctx) }
                } else if Self::kind(ctx) == Kind::Recognition {
                    match key.as_ref() {
                        Key::Named(Named::Space) => return self.update(if self.revealed { Msg::Knew(true) } else { Msg::Reveal }, ctx),
                        Key::Named(Named::Backspace) | Key::Character("x") => return self.update(Msg::Knew(false), ctx),
                        _ => {}
                    }
                } else if key == Key::Named(Named::Space) {
                    return self.update(Msg::Press, ctx);
                } else if key.as_ref() == Key::Character("n") || key == Key::Named(Named::Enter) {
                    return self.update(Msg::Next, ctx);
                } else if key.as_ref() == Key::Character("h") {
                    return self.update(Msg::Reveal, ctx);
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

    fn chrome(&self) -> f32 { 1.0 - self.focus.value.clamp(0.0, 1.0) }

    pub fn view<'a>(&'a self, ctx: &'a Ctx) -> View<'a, Msg> {
        let kind = Self::kind(ctx);
        let a = self.chrome();
        let due = training::due_cases(&ctx.store, &self.stats, qbix_core::store::now_ms() as i64).len();
        let body: Element<'a, Msg> = match kind {
            Kind::Steps => self.steps_view(ctx),
            Kind::Blind => self.blind_view(ctx),
            Kind::Recognition => self.recognition_view(ctx),
            _ if self.current.is_none() => self.empty_view(ctx),
            _ => self.cases_view(ctx),
        };
        let mut view = View::new(t("Training"), body);
        view.chrome = a;
        view.tabs = vec![(t("Cases"), Msg::Kind(Kind::Cases), kind == Kind::Cases), (t("Steps"), Msg::Kind(Kind::Steps), kind == Kind::Steps), (t("Recognition"), Msg::Kind(Kind::Recognition), kind == Kind::Recognition), (if due > 0 { format!("{} · {due}", t("Review")) } else { t("Review") }, Msg::Kind(Kind::Review), kind == Kind::Review), (t("Blind"), Msg::Kind(Kind::Blind), kind == Kind::Blind)];
        let puzzle = Self::puzzle(ctx);
        if !matches!(kind, Kind::Steps | Kind::Blind) {
            view.tools.push(crate::picker::button(t(&qbix_core::puzzles::puzzle(&puzzle).label), self.menu_open, a, Msg::Menu(!self.menu_open)));
            view.tools.push(press(if self.open { Look::Tab { on: true } } else { Look::Soft }, icon(if ctx.phone { icon::PANEL_BOTTOM } else { icon::PANEL_RIGHT }, 18.0, fade(if self.open { ACC_INK } else { INK2 }, a))).width(40).padding(0).opacity(a).on_press(Msg::Drawer(Some(if self.open { self.pane } else { Pane::ByCase }))).into());
            view.drawer = Some(self.drawer(ctx));
        }
        if self.menu.value > 0.002 {
            let right = if ctx.phone { 16.0 } else { 14.0 + (392.0 + 12.0) * ctx.drawer + 36.0 + 48.0 };
            let items = column(qbix_core::puzzles::puzzles().iter().filter(|p| p.relay.is_empty() && catalog().sets_of(&p.id).next().is_some()).map(|p| {
                let on = p.id == puzzle;
                press(Look::Tab { on }, tx(t(&p.label), 15.0, if on { 650 } else { 550 }, if on { ACC_INK } else { INK })).width(Length::Fill).height(38).radius(13.0).padding([0, 13]).on_press(Msg::Puzzle(p.id.clone())).into()
            }))
            .spacing(2)
            .width(200);
            view.overlay = Some(shell::popover(column![ui::label(t("Puzzle")), items].spacing(10).padding(8), self.menu.value, Msg::Menu(false), if ctx.phone { 70.0 } else { 96.0 }, right));
        }
        view
    }

    fn empty_view<'a>(&'a self, ctx: &'a Ctx) -> Element<'a, Msg> {
        let (title, sub) = match Self::kind(ctx) {
            Kind::Review => (t("Nothing to review today"), t("The cases you learned come back here when they are due, sooner when they go badly.")),
            _ => (t("Choose your cases"), t("Train the cases you learned, whole sets, or those you are slowest at.")),
        };
        let mut col = column![ui::empty(icon::TARGET, title, sub)].spacing(26).align_x(Alignment::Center);
        if Self::kind(ctx) != Kind::Review { col = col.push(press(Look::Primary, tx(t("Choose cases"), 18.0, 650, SHEET)).height(58).width(260).on_press(Msg::Drawer(Some(Pane::Choose)))) }
        container(col).center(Length::Fill).into()
    }

    fn stage_time<'a>(&'a self, ctx: &'a Ctx) -> Element<'a, Msg> {
        let running = matches!(self.timer.phase, Phase::Running | Phase::Holding | Phase::Ready);
        let digits = if running { fmt_time(Some(self.timer.elapsed(self.now) as f64)) } else { self.last.and_then(|id| ctx.store.get(id)).map_or("0.00".into(), |s| fmt_solve(s.time_ms, s.penalty)) };
        let colour = mix(mix(INK, WARN, self.hold.value), OK, self.ready.value);
        text(digits).size(if ctx.phone { 92.0 } else { 140.0 }).font(display(400)).color(colour).line_height(1.1).into()
    }

    fn go<'a>(&'a self, ctx: &'a Ctx) -> Element<'a, Msg> {
        let label = match self.timer.phase {
            Phase::Holding => t("Keep holding"),
            Phase::Ready => t("Release"),
            Phase::Running => t("Stop"),
            Phase::Stopped => t("Next case"),
            _ => t("Start"),
        };
        let look = if self.timer.phase == Phase::Ready { Look::Ready } else { Look::Primary };
        let a = self.chrome();
        column![
            press(look, tx(label, 18.5, 650, SHEET)).height(60).width(if ctx.phone { Length::Fill } else { Length::Fixed(248.0) }).on_hold(Msg::Press, Msg::Release),
            row![tx(t("hold Space to start · N for the next case"), 13.5, 500, fade(INK3, a))].spacing(10),
        ]
        .spacing(12)
        .align_x(Alignment::Center)
        .width(Length::Fill)
        .into()
    }

    fn fixes<'a>(&'a self, ctx: &'a Ctx) -> Element<'a, Msg> {
        let Some(s) = self.last.and_then(|id| ctx.store.get(id)) else { return Space::new().height(34).into() };
        let fix = |label: &'static str, p: Penalty| {
            let on = s.penalty == p;
            press(Look::Tab { on }, tx(label, 14.5, if on { 650 } else { 550 }, if on { ACC_INK } else { INK2 })).height(34).padding([0, 14]).on_press(Msg::Penalty(p))
        };
        row![fix("+2", Penalty::Plus2), fix("DNF", Penalty::Dnf), press(Look::Danger, row![icon(icon::TRASH, 15.0, BAD), tx(t("Delete"), 14.5, 550, BAD)].spacing(6).align_y(Alignment::Center)).height(34).padding([0, 14]).on_press(Msg::Delete)].spacing(4).into()
    }

    fn cases_view<'a>(&'a self, ctx: &'a Ctx) -> Element<'a, Msg> {
        let a = self.chrome();
        let Some(c) = self.current.as_deref().and_then(|id| catalog().case(id)) else { return Space::new().into() };
        let scramble = text(self.scramble.clone()).size(if ctx.phone { 19.0 } else { 24.0 }).font(crate::theme::text(500)).color(fade(INK2, a * self.swap.value.clamp(0.0, 1.0))).align_x(Alignment::Center).width(Length::Fill);
        let reveal: Element<'a, Msg> = if self.revealed {
            let alg = ctx.store.learned.get(&c.id).and_then(|v| v.first().cloned()).or_else(|| c.algorithms.first().map(|x| x.display())).unwrap_or_default();
            let st = self.stats.get(&c.id);
            row![
                diagram::case(c, 84.0, diagram::cache_of(&format!("case:{}", c.id))),
                column![tx(format!("{}{}", c.title(), c.detail().map_or_else(String::new, |d| format!(" · {d}"))), 16.0, 700, INK), tx(alg, 18.0, 650, ACC_INK), ui::small(st.map_or_else(|| t("First attempt"), |s| tf("{0} attempts · mean {1} · best {2}", &[&s.count, &fmt_time(s.mean), &fmt_time(s.best)])))].spacing(4)
            ]
            .spacing(16)
            .align_y(Alignment::Center)
            .into()
        } else {
            press(Look::Ghost, row![icon(icon::EYE, 15.0, fade(INK3, a)), tx(t("Show the case and its algorithm"), 13.5, 550, fade(INK3, a))].spacing(6).align_y(Alignment::Center)).height(32).padding([0, 12]).opacity(a).on_press(Msg::Reveal).into()
        };
        let round = self.round(ctx).len();
        let header = row![
            ui::small(if Self::kind(ctx) == Kind::Review { qbix_core::i18n::plural(round, "{0} case due", "{0} cases due") } else { qbix_core::i18n::plural(round, "{0} case in the round", "{0} cases in the round") }),
            Space::new().width(Length::Fill),
            press(Look::Tab { on: ctx.store.settings.pref("training.auf") != Some("off") }, tx(t("Random AUF"), 13.5, 600, INK2)).height(32).padding([0, 12]).opacity(a).on_press(Msg::RandomAuf),
            press(Look::Soft, row![icon(icon::SLIDERS, 15.0, INK2), tx(t("Change"), 13.5, 600, INK2)].spacing(6).align_y(Alignment::Center)).height(32).padding([0, 12]).opacity(a).on_press(Msg::Drawer(Some(Pane::Choose))),
        ]
        .spacing(8)
        .align_y(Alignment::Center);
        let stage = mouse_area(container(column![container(scramble).max_width(760), self.stage_time(ctx), self.fixes(ctx), ui::gap(18.0), reveal].align_x(Alignment::Center)).width(Length::Fill).height(Length::Fill).center(Length::Fill)).on_press(Msg::Press).on_release(Msg::Release);
        column![header, stage, self.go(ctx)].height(Length::Fill).into()
    }

    fn steps_view<'a>(&'a self, ctx: &'a Ctx) -> Element<'a, Msg> {
        let a = self.chrome();
        let (spec, n) = Self::target(ctx);
        let mut targets = column![].spacing(8);
        for method in ["CFOP", "ZZ", "Roux", "Petrus"] {
            let items: Vec<(String, Msg, bool)> = steps::specs().iter().filter(|s| s.method == method).map(|s| (t(s.label), Msg::Target(s.id.to_string()), s.id == spec.id)).collect();
            targets = targets.push(row![tx(method, 13.5, 650, INK3).width(62), ui::pills(items)].spacing(10).align_y(Alignment::Center));
        }
        let moves: Element<'a, Msg> = if spec.moves.is_empty() { ui::small(t("A random state of the step's pieces.")).into() } else { row![tx(t("Moves"), 13.5, 650, INK3).width(62), ui::pills(spec.moves.iter().map(|m| (m.to_string(), Msg::Moves(*m), *m == n)).collect())].spacing(10).align_y(Alignment::Center).into() };
        let setup = column![targets, moves].spacing(8);
        let scramble = text(if self.scramble.is_empty() { t("Generating a scramble") } else { self.scramble.clone() }).size(if ctx.phone { 19.0 } else { 24.0 }).font(crate::theme::text(500)).color(fade(INK2, a * self.swap.value.clamp(0.0, 1.0))).align_x(Alignment::Center).width(Length::Fill);
        let reveal: Element<'a, Msg> = match (&self.solutions, self.revealed) {
            (Some(list), true) if steps::has_solutions(spec) => column(list.iter().map(|(m, slot)| row![tx(steps::held(m), 17.0, 650, ACC_INK), if slot.is_empty() { Element::from(Space::new()) } else { ui::chip(slot.clone(), INK2, fade(INK, 0.06)) }].spacing(10).align_y(Alignment::Center).into())).spacing(6).align_x(Alignment::Center).into(),
            (None, true) if steps::has_solutions(spec) => ui::small(t("Searching the shortest solutions…")).into(),
            _ if steps::has_solutions(spec) => press(Look::Ghost, row![icon(icon::EYE, 15.0, fade(INK3, a)), tx(t("Show the shortest solutions"), 13.5, 550, fade(INK3, a))].spacing(6).align_y(Alignment::Center)).height(32).padding([0, 12]).opacity(a).on_press(Msg::Reveal).into(),
            _ => Space::new().into(),
        };
        let hint = ui::small(t("White on the bottom, green in front: the solutions are written as you hold the cube."));
        let stage = mouse_area(container(column![container(scramble).max_width(760), self.stage_time(ctx), self.fixes(ctx), ui::gap(12.0), reveal].align_x(Alignment::Center)).width(Length::Fill).height(Length::Fill).center(Length::Fill)).on_press(Msg::Press).on_release(Msg::Release);
        let label = if self.timer.phase == Phase::Stopped { t("Next scramble") } else { String::new() };
        let _ = label;
        column![setup, stage, container(hint).width(Length::Fill).center_x(Length::Fill), ui::gap(8.0), self.go(ctx)].height(Length::Fill).into()
    }

    /// Blindfolded memo: a scramble, its memo in Speffz letter pairs once asked, edges from UF then corners from UFR.
    fn blind_view<'a>(&'a self, ctx: &'a Ctx) -> Element<'a, Msg> {
        let a = self.chrome();
        let scramble = text(if self.scramble.is_empty() { t("Generating a scramble") } else { self.scramble.clone() }).size(if ctx.phone { 19.0 } else { 24.0 }).font(crate::theme::text(500)).color(fade(INK2, a)).align_x(Alignment::Center).width(Length::Fill);
        let memo: Element<'a, Msg> = if self.revealed && !self.scramble.is_empty() {
            let m = qbix_core::bld::memo(&self.scramble);
            let part = |title: String, p: &qbix_core::bld::Part, buffer: &str| -> Element<'a, Msg> {
                let pairs = qbix_core::bld::pairs(&p.targets);
                let mut col = column![row![tx(title, 15.0, 700, INK), ui::small(tf("buffer {0}", &[&buffer]))].spacing(10).align_y(Alignment::Center), row(pairs.into_iter().map(|pr| ui::chip(pr, ACC_INK, fade(ACC, 0.1)))).spacing(6).wrap().vertical_spacing(6)].spacing(8);
                if !p.turned.is_empty() { col = col.push(ui::small(tf("In place, turned: {0}", &[&p.turned.iter().collect::<String>()]))) }
                if p.parity { col = col.push(tx(t("Parity"), 14.0, 700, WARN)) }
                col.into()
            };
            column![part(t("Edges"), &m.edges, "UF"), part(t("Corners"), &m.corners, "UFR")].spacing(18).max_width(620).into()
        } else {
            press(Look::Tonal, row![icon(icon::EYE, 16.0, ACC_INK), tx(t("Show the memo"), 15.0, 650, ACC_INK)].spacing(8).align_y(Alignment::Center)).height(46).on_press(Msg::Reveal).into()
        };
        let net: Element<'a, Msg> = if self.scramble.is_empty() { Space::new().into() } else {
            let mut cube = qbix_core::cube::Cube::solved(3);
            cube.apply(&self.scramble);
            let setup = format!("{} {}", self.scramble, qbix_core::alg::upright(&cube).unwrap_or_default());
            iced::widget::canvas(crate::diagram::Moves { setup, n: 3, mask: crate::cube3d::Mask::Full, top: false, wca: true, cache: crate::diagram::cache_of(&format!("bld:{}", self.asked)) }).width(170).height(170).into()
        };
        column![
            container(column![tx(t("Speffz letters, white on top and green in front"), 13.5, 600, INK3), scramble, net, memo].spacing(18).align_x(Alignment::Center).max_width(820)).width(Length::Fill).height(Length::Fill).center(Length::Fill),
            container(press(Look::Primary, tx(t("Next scramble"), 18.0, 650, SHEET)).height(58).width(if ctx.phone { Length::Fill } else { Length::Fixed(248.0) }).on_press(Msg::Next)).width(Length::Fill).center_x(Length::Fill),
        ]
        .height(Length::Fill)
        .into()
    }

    fn recognition_view<'a>(&'a self, ctx: &'a Ctx) -> Element<'a, Msg> {
        let Some(c) = self.current.as_deref().and_then(|id| catalog().case(id)) else { return self.empty_view(ctx) };
        let seconds = Self::seconds(ctx);
        let gone = (self.now - self.shown_at).as_secs_f32() / seconds as f32;
        let picture = diagram::case(c, if ctx.phone { 180.0 } else { 240.0 }, diagram::cache_of(&format!("case:{}", c.id)));
        let answer: Element<'a, Msg> = if self.revealed {
            let alg = ctx.store.learned.get(&c.id).and_then(|v| v.first().cloned()).or_else(|| c.algorithms.first().map(|x| x.display())).unwrap_or_default();
            column![tx(format!("{}{}", c.title(), c.detail().map_or_else(String::new, |d| format!(" · {d}"))), 22.0, 700, INK), tx(alg, 20.0, 650, ACC_INK)].spacing(6).align_x(Alignment::Center).into()
        } else {
            container(ui::bar(1.0 - gone, ACC, 6.0)).width(240).into()
        };
        let actions: Element<'a, Msg> = if self.revealed {
            row![press(Look::Danger, tx(t("Missed it"), 16.0, 650, BAD)).height(54).width(180).on_press(Msg::Knew(false)), press(Look::Primary, tx(t("Knew it"), 17.0, 650, SHEET)).height(58).width(220).on_press(Msg::Knew(true))].spacing(12).align_y(Alignment::Center).into()
        } else {
            press(Look::Primary, tx(t("Show the answer"), 17.0, 650, SHEET)).height(58).width(248).on_press(Msg::Reveal).into()
        };
        let speed = row![tx(t("Seconds per case"), 13.5, 600, INK3), ui::pills([2u32, 4, 8].iter().map(|s| (s.to_string(), Msg::Seconds(*s), *s == seconds)).collect())].spacing(10).align_y(Alignment::Center);
        let score = ui::small(tf("{0} known · {1} missed", &[&self.known, &self.missed]));
        column![
            row![score, Space::new().width(Length::Fill), speed, press(Look::Soft, row![icon(icon::SLIDERS, 15.0, INK2), tx(t("Change"), 13.5, 600, INK2)].spacing(6).align_y(Alignment::Center)).height(32).padding([0, 12]).on_press(Msg::Drawer(Some(Pane::Choose)))].spacing(10).align_y(Alignment::Center),
            container(column![picture, answer].spacing(22).align_x(Alignment::Center)).center(Length::Fill),
            container(actions).width(Length::Fill).center_x(Length::Fill),
            container(ui::small(t("Space shows the answer, then counts it known; Backspace, missed."))).width(Length::Fill).center_x(Length::Fill).padding(ui::padding_top(10.0)),
        ]
        .height(Length::Fill)
        .into()
    }

    fn drawer<'a>(&'a self, ctx: &'a Ctx) -> Drawer<'a, Msg> {
        let (title, body) = match self.pane {
            Pane::Choose => (t("Choose cases"), self.choose_view(ctx)),
            Pane::ByCase => (t("By case"), self.by_case_view(ctx)),
        };
        let sub = Some(qbix_core::i18n::plural(Self::pool(ctx).len(), "{0} case chosen", "{0} cases chosen"));
        Drawer { open: self.open, key: format!("{:?}", self.pane), title, sub, back: None, close: Msg::Drawer(None), body }
    }

    fn choose_view<'a>(&'a self, ctx: &'a Ctx) -> Element<'a, Msg> {
        let puzzle = Self::puzzle(ctx);
        let pool = Self::pool(ctx);
        let learned: Vec<String> = catalog().cases.iter().filter(|c| c.puzzle() == puzzle && ctx.store.is_learned(&c.id)).map(|c| c.id.clone()).collect();
        let recommended: Vec<String> = training::recommend(&ctx.store, &self.stats, 8).into_iter().map(|r| r.0).collect();
        let quick = column![
            ui::item(Some(icon::DONE), t("All learned cases"), Some(qbix_core::i18n::plural(learned.len(), "{0} case", "{0} cases")), (!learned.is_empty()).then(|| Msg::Pool(learned.clone()))),
            ui::item(Some(icon::TRENDING_UP), t("Recommended"), Some(if recommended.is_empty() { t("No recommendation yet") } else { t("Your slowest learned cases") }), (!recommended.is_empty()).then(|| Msg::Pool(recommended.clone()))),
        ]
        .spacing(2);
        let mut sets = column![].spacing(4);
        for stage in catalog().stages(&puzzle) {
            let list: Vec<_> = catalog().sets_of(&puzzle).filter(|s| s.stage == stage).collect();
            sets = sets.push(ui::label(t(&stage)));
            for s in list {
                let ids: Vec<&Case> = catalog().cases_of_set(&s.id).collect();
                let chosen = ids.iter().filter(|c| pool.contains(&c.id)).count();
                let on = chosen == ids.len() && chosen > 0;
                let sub = if chosen > 0 && !on { tf("{0} of {1}", &[&chosen, &ids.len()]) } else { qbix_core::i18n::plural(ids.len(), "{0} case", "{0} cases") };
                sets = sets.push(press(Look::Tab { on }, row![column![tx(t(&s.label), 15.0, 650, if on { ACC_INK } else { INK }), ui::small(sub)].spacing(2).width(Length::Fill), icon(if on { icon::DONE } else { icon::CIRCLE }, 17.0, if on { ACC_INK } else { INK3 })].align_y(Alignment::Center)).width(Length::Fill).height(54).radius(16.0).padding([0, 14]).on_press(Msg::ToggleSet(s.id.clone())));
            }
        }
        column![quick, ui::scroll(sets.padding(Padding { right: 10.0, ..Padding::ZERO })).height(Length::Fill), press(Look::Soft, tx(t("Clear the choice"), 14.5, 600, INK2)).width(Length::Fill).height(46).on_press_maybe((!pool.is_empty()).then(|| Msg::Pool(vec![])))].spacing(16).height(Length::Fill).into()
    }

    fn by_case_view<'a>(&'a self, ctx: &'a Ctx) -> Element<'a, Msg> {
        let mut rows: Vec<(&Case, Option<&CaseStats>)> = self.round(ctx).iter().filter_map(|id| catalog().case(id)).map(|c| (c, self.stats.get(&c.id))).collect();
        if rows.is_empty() { return container(ui::empty(icon::CHART, t("No attempt yet"), t("Each case's figures show here once trained."))).center(Length::Fill).into() }
        rows.sort_by(|a, b| b.1.and_then(|s| s.mean).unwrap_or(f64::MAX).total_cmp(&a.1.and_then(|s| s.mean).unwrap_or(f64::MAX)));
        let list = column(rows.into_iter().map(|(c, s)| {
            row![
                diagram::case(c, 44.0, diagram::cache_of(&format!("small:{}", c.id))),
                column![tx(c.title().to_string(), 14.5, 650, INK), ui::small(s.map_or_else(|| t("Not trained yet"), |s| tf("{0} attempts · best {1}", &[&s.count, &fmt_time(s.best)])))].spacing(2).width(Length::Fill),
                tx(fmt_time(s.and_then(|s| s.mean)), 16.0, 650, INK),
            ]
            .spacing(12)
            .align_y(Alignment::Center)
            .into()
        }))
        .spacing(10);
        ui::scroll(list.padding(Padding { right: 10.0, ..Padding::ZERO })).height(Length::Fill).into()
    }
}

