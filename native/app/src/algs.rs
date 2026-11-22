//! The algorithms: a puzzle's method, its steps as the page's tabs, each step's cases drawn in a grid. A case opens in
//! the drawer: its picture, its algorithm, learned or not, played on a 3D cube, its other algorithms. A step without
//! cases (an intuitive one) explains itself, with its moves.
use crate::ctx::Ctx;
use crate::diagram::{self, Player};
use crate::icon::{self, icon};
use crate::page::{Drawer, View};
use crate::press::{Look, press};
use crate::shell;
use crate::spring::Spring;
use crate::theme::*;
use crate::ui::{self, tx};
use iced::widget::{Space, canvas, column, container, row, text};
use iced::{Alignment, Element, Length, Padding, Task};
use qbix_core::catalog::{Case, catalog};
use qbix_core::methods::{self, Method, Step};
use qbix_core::{t, tf};

#[derive(Debug, Clone)]
pub enum Msg {
    Menu(bool),
    Puzzle(String),
    Method(String),
    Step(usize),
    Set(String),
    Case(String),
    Drawer(Option<Pane>),
    Learned(String, bool),
    Choose(String, String),
    Play,
    Back,
    Forward,
    Restart,
    Speed,
    Drag(f32, f32),
    DragEnd,
    Query(String),
    /// Train these cases (the app takes it to the training).
    Train(Vec<String>),
    /// Practise an intuitive step (the cross…).
    TrainSteps(String),
    /// An intuitive step marked mastered, or not.
    Mastered(String, bool),
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Pane {
    Case,
    Algs,
}

pub struct Page {
    case: Option<String>,
    pane: Pane,
    open: bool,
    player: Option<Player>,
    menu: Spring,
    menu_open: bool,
    query: String,
}

/// A case's algorithm as the player turns it: the learned one first.
fn chosen<'a>(ctx: &'a Ctx, c: &'a Case) -> Option<String> {
    ctx.store.learned.get(&c.id).and_then(|a| a.first().cloned()).or_else(|| c.algorithms.first().map(|a| a.executable()))
}

impl Page {
    pub fn new() -> Self { Self { case: None, pane: Pane::Case, open: false, player: None, menu: Spring::smooth(0.0), menu_open: false, query: String::new() } }

    fn puzzle(ctx: &Ctx) -> String { ctx.store.settings.pref("algs.puzzle").unwrap_or("333").to_string() }

    fn method(ctx: &Ctx) -> Option<&'static Method> {
        let p = Self::puzzle(ctx);
        let all = methods::of(&p);
        let id = ctx.store.settings.pref(&format!("algs.method.{p}")).map(String::from).unwrap_or_else(|| if p == "333" { "cfop".into() } else { all.first().map_or_else(String::new, |m| m.id.clone()) });
        all.iter().copied().find(|m| m.id == id).or_else(|| all.first().copied())
    }

    fn step_index(ctx: &Ctx) -> usize {
        let m = Self::method(ctx);
        let i: usize = m.and_then(|m| ctx.store.settings.pref(&format!("algs.step.{}", m.id))).and_then(|s| s.parse().ok()).unwrap_or_else(|| m.and_then(|m| m.steps.iter().position(|s| !s.sets.is_empty())).unwrap_or(0));
        i.min(m.map_or(0, |m| m.steps.len().saturating_sub(1)))
    }

    fn step(ctx: &Ctx) -> Option<&'static Step> { Self::method(ctx).and_then(|m| m.steps.get(Self::step_index(ctx))) }

    fn set(ctx: &Ctx) -> Option<String> {
        let step = Self::step(ctx)?;
        let chosen = ctx.store.settings.pref(&format!("algs.set.{}", step.title)).map(String::from);
        chosen.filter(|s| step.sets.contains(s)).or_else(|| step.sets.first().cloned())
    }

    /// Opens the page on a case (from the training or a search).
    pub fn show(&mut self, id: &str, ctx: &Ctx) {
        self.case = Some(id.to_string());
        self.pane = Pane::Case;
        self.open = true;
        self.load_player(ctx);
    }

    fn load_player(&mut self, ctx: &Ctx) {
        self.player = self.case.as_deref().and_then(|id| catalog().case(id)).and_then(|c| {
            let n = c.size()?;
            Some(Player::new(n, &c.setup, &chosen(ctx, c).unwrap_or_default(), crate::cube3d::Mask::for_stage(&c.stage)))
        });
    }

    pub fn step_motion(&mut self, dt: f32) -> bool {
        let mut moving = self.menu.step(dt);
        if let Some(p) = &mut self.player { moving |= p.step(dt) }
        moving
    }

    pub fn update(&mut self, msg: Msg, ctx: &mut Ctx) -> Task<Msg> {
        match msg {
            Msg::Menu(open) => {
                self.menu_open = open;
                self.menu.to(open as u8 as f32);
            }
            Msg::Puzzle(p) => {
                ctx.store.settings.set_pref("algs.puzzle", p);
                self.open = false;
                ctx.changed();
            }
            Msg::Method(m) => {
                let p = Self::puzzle(ctx);
                ctx.store.settings.set_pref(&format!("algs.method.{p}"), m);
                self.menu_open = false;
                self.menu.to(0.0);
                self.open = false;
                ctx.changed();
            }
            Msg::Step(i) => {
                if let Some(m) = Self::method(ctx) { ctx.store.settings.set_pref(&format!("algs.step.{}", m.id), i.to_string()) }
                self.query.clear();
                ctx.changed();
            }
            Msg::Set(s) => {
                if let Some(step) = Self::step(ctx) { ctx.store.settings.set_pref(&format!("algs.set.{}", step.title), s) }
                ctx.changed();
            }
            Msg::Case(id) => {
                if self.open && self.case.as_deref() == Some(&id) && self.pane == Pane::Case {
                    self.open = false;
                } else {
                    self.show(&id, ctx);
                }
            }
            Msg::Drawer(Some(p)) => {
                self.pane = p;
                self.open = true;
            }
            Msg::Drawer(None) => self.open = false,
            Msg::Learned(id, on) => {
                let algs = ctx.store.learned.get(&id).cloned().unwrap_or_default();
                ctx.store.set_learned(&id, on, algs);
                ctx.changed();
            }
            Msg::Choose(id, alg) => {
                ctx.store.set_learned(&id, true, vec![alg]);
                ctx.changed();
                self.load_player(ctx);
                self.pane = Pane::Case;
            }
            Msg::Play => if let Some(p) = &mut self.player { p.play() },
            Msg::Back => if let Some(p) = &mut self.player { p.back() },
            Msg::Forward => if let Some(p) = &mut self.player { p.forward() },
            Msg::Restart => if let Some(p) = &mut self.player { p.restart() },
            Msg::Speed => if let Some(p) = &mut self.player { p.speed = match p.speed { s if s < 0.75 => 1.0, s if s < 1.5 => 2.0, _ => 0.5 } },
            Msg::Drag(x, y) => if let Some(p) = &mut self.player { p.turn_view(x, y) },
            Msg::DragEnd => if let Some(p) = &mut self.player { p.settle_view() },
            Msg::Query(q) => self.query = q,
            Msg::Mastered(key, on) => {
                ctx.store.settings.set_pref(&key, if on { "1" } else { "" });
                ctx.changed();
            }
            Msg::Train(_) | Msg::TrainSteps(_) => {}
        }
        Task::none()
    }

    pub fn escape(&mut self) {
        if self.menu_open {
            self.menu_open = false;
            self.menu.to(0.0);
        } else {
            self.open = false;
        }
    }

    fn learned_of(ctx: &Ctx, sets: &[String]) -> (usize, usize) {
        let mut n = 0;
        let mut learned = 0;
        for s in sets {
            for c in catalog().cases_of_set(s) {
                n += 1;
                learned += ctx.store.is_learned(&c.id) as usize;
            }
        }
        (learned, n)
    }

    pub fn view<'a>(&'a self, ctx: &'a Ctx) -> View<'a, Msg> {
        let puzzle = Self::puzzle(ctx);
        let method = Self::method(ctx);
        let label = format!("{}{}", t(&qbix_core::puzzles::puzzle(&puzzle).label), method.map_or_else(String::new, |m| format!(" · {}", t(&m.name))));
        let step_i = Self::step_index(ctx);
        let body: Element<'a, Msg> = match (method, Self::step(ctx)) {
            (Some(_), Some(step)) if !self.query.trim().is_empty() => self.search(ctx, &puzzle, step),
            (Some(_), Some(step)) if !step.sets.is_empty() => self.cases(ctx, step),
            (Some(_), Some(step)) => self.explain(ctx, step, &puzzle),
            _ => container(ui::empty(icon::GRID, t("No method yet"), t("This puzzle's algorithms are coming."))).center(Length::Fill).into(),
        };
        let mut view = View::new(t("Algs"), body);
        if let Some(m) = method {
            view.tabs = m.steps.iter().enumerate().map(|(i, s)| {
                let (l, n) = Self::learned_of(ctx, &s.sets);
                let done = n == 0 && ctx.store.settings.pref(&format!("course.{puzzle}.{}", s.title)) == Some("1");
                let name = if n > 0 && !ctx.phone && m.steps.len() < 7 { format!("{} {l}/{n}", t(&s.title)) } else if done { format!("{} ✓", t(&s.title)) } else { t(&s.title) };
                (name, Msg::Step(i), i == step_i)
            }).collect();
        }
        view.tools = vec![
            crate::picker::button(label, self.menu_open, 1.0, Msg::Menu(!self.menu_open)),
            press(if self.open { Look::Tab { on: true } } else { Look::Soft }, icon(if ctx.phone { icon::PANEL_BOTTOM } else { icon::PANEL_RIGHT }, 18.0, if self.open { ACC_INK } else { INK2 })).width(40).padding(0).on_press_maybe(self.case.as_ref().map(|_| Msg::Drawer(if self.open { None } else { Some(Pane::Case) }))).into(),
        ];
        view.drawer = self.drawer(ctx);
        if self.menu.value > 0.002 {
            let right = if ctx.phone { 16.0 } else { 14.0 + (392.0 + 12.0) * ctx.drawer + 36.0 + 48.0 };
            view.overlay = Some(shell::popover(self.menu_view(ctx, &puzzle), self.menu.value, Msg::Menu(false), if ctx.phone { 70.0 } else { 96.0 }, right));
        }
        view
    }

    fn menu_view<'a>(&'a self, ctx: &'a Ctx, puzzle: &str) -> Element<'a, Msg> {
        let puzzles = qbix_core::puzzles::puzzles().iter().filter(|p| p.relay.is_empty() && !methods::of(&p.id).is_empty());
        let left = column(puzzles.map(|p| {
            let on = p.id == puzzle;
            press(Look::Tab { on }, row![tx(t(&p.label), 15.0, if on { 650 } else { 550 }, if on { ACC_INK } else { INK }), Space::new().width(Length::Fill)]).width(Length::Fill).height(38).radius(13.0).padding([0, 13]).on_press(Msg::Puzzle(p.id.clone())).into()
        }))
        .spacing(2)
        .width(170);
        let current = Self::method(ctx).map(|m| m.id.clone());
        let right = column(methods::of(puzzle).into_iter().map(|m| {
            let on = current.as_deref() == Some(&m.id);
            press(Look::Tab { on }, column![tx(t(&m.name), 15.0, if on { 650 } else { 600 }, if on { ACC_INK } else { INK }), tx(t(&m.level), 12.5, 500, INK3)].spacing(1).width(Length::Fill)).width(Length::Fill).height(50).radius(14.0).padding([0, 13]).on_press(Msg::Method(m.id.clone())).into()
        }))
        .spacing(2)
        .width(230);
        row![column![ui::label(t("Puzzle")), left].spacing(10), column![ui::label(t("Method")), right].spacing(10)].spacing(14).padding(8).into()
    }

    fn card<'a>(&'a self, ctx: &'a Ctx, c: &'a Case, size: f32) -> Element<'a, Msg> {
        let learned = ctx.store.is_learned(&c.id);
        let on = self.open && self.case.as_deref() == Some(c.id.as_str());
        let picture = diagram::case(c, size, diagram::cache_of(&format!("case:{}", c.id)));
        let name = row![tx(c.title().to_string(), 13.5, 650, if on { ACC_INK } else { INK }), if learned { Element::from(icon(icon::CHECK, 13.0, OK)) } else { Space::new().into() }].spacing(4).align_y(Alignment::Center);
        let detail = c.detail().map_or_else(|| Element::from(Space::new().height(0)), |d| tx(d.to_string(), 12.0, 500, INK3).into());
        press(Look::Tab { on }, column![picture, name, detail].spacing(6).align_x(Alignment::Center).width(size + 16.0)).height(Length::Shrink).padding([10, 6]).radius(20.0).on_press(Msg::Case(c.id.clone())).into()
    }

    fn cases<'a>(&'a self, ctx: &'a Ctx, step: &'static Step) -> Element<'a, Msg> {
        let set = Self::set(ctx).unwrap_or_default();
        let size = if ctx.phone { 74.0 } else { 92.0 };
        let mut col = column![].spacing(18);
        let mut head = row![].spacing(10).align_y(Alignment::Center);
        if step.sets.len() > 1 {
            head = head.push(container(ui::pills(step.sets.iter().filter_map(|s| catalog().set(s)).map(|s| (t(&s.label), Msg::Set(s.id.clone()), s.id == set)).collect())).width(Length::Fill));
        } else if let Some(s) = catalog().set(&set) {
            head = head.push(container(ui::small(t(&s.description))).width(Length::Fill));
        }
        if !ctx.phone { head = head.push(ui::field(&t("Search a case or an algorithm"), &self.query, Msg::Query).width(280).padding([8, 14])) }
        col = col.push(head);
        let groups = catalog().groups(&set);
        let many = groups.len() > 1;
        let mut grid = column![].spacing(14);
        for (group, cases) in groups {
            if many { grid = grid.push(ui::label(t(&group))) }
            grid = grid.push(row(cases.into_iter().map(|c| self.card(ctx, c, size))).spacing(6).wrap().vertical_spacing(6));
        }
        col = col.push(ui::scroll(grid.padding(Padding { right: 14.0, bottom: 20.0, ..Padding::ZERO })).height(Length::Fill));
        let ids: Vec<String> = catalog().cases_of_set(&set).map(|c| c.id.clone()).collect();
        let learning: Vec<String> = ids.iter().filter(|id| ctx.store.is_learned(id)).cloned().collect();
        let label = catalog().set(&set).map_or_else(String::new, |s| t(&s.label));
        let (train, what) = if learning.is_empty() { (ids, tf("all {0} cases, in a round", &[&catalog().cases_of_set(&set).count()])) } else { (learning, t("the cases you learned, in a round")) };
        col = col.push(column![press(Look::Primary, tx(tf("Train {0}", &[&label]), 18.0, 650, SHEET)).height(58).width(if ctx.phone { Length::Fill } else { Length::Fixed(260.0) }).on_press(Msg::Train(train)), ui::small(what)].spacing(10).align_x(Alignment::Center).width(Length::Fill));
        col.height(Length::Fill).into()
    }

    fn search<'a>(&'a self, ctx: &'a Ctx, puzzle: &str, _step: &'static Step) -> Element<'a, Msg> {
        let found = catalog().search(puzzle, self.query.trim());
        let size = if ctx.phone { 74.0 } else { 92.0 };
        let head = row![container(ui::small(qbix_core::i18n::plural(found.len(), "{0} case", "{0} cases"))).width(Length::Fill), ui::field(&t("Search a case or an algorithm"), &self.query, Msg::Query).width(280).padding([8, 14])].align_y(Alignment::Center);
        let grid: Element<'a, Msg> = if found.is_empty() { container(ui::empty(icon::SEARCH, t("Nothing found"), t("Try a case's name (Sune, T, OLL 21) or a few moves."))).center(Length::Fill).into() } else { ui::scroll(row(found.into_iter().map(|c| self.card(ctx, c, size))).spacing(6).wrap().vertical_spacing(6)).height(Length::Fill).into() };
        column![head, grid].spacing(18).height(Length::Fill).into()
    }

    /// A step without cases: what to do, its moves on cubes, its tips.
    fn explain<'a>(&'a self, ctx: &'a Ctx, step: &'static Step, puzzle: &str) -> Element<'a, Msg> {
        let n = qbix_core::puzzles::puzzle(puzzle).cube_size;
        let mask = crate::cube3d::Mask::for_name(step.mask.as_deref());
        let alg_card = |a: &'static qbix_core::methods::MethodAlg, key: String| -> Element<'a, Msg> {
            let picture: Element<'a, Msg> = match n {
                Some(n) => {
                    let setup = a.setup.clone().unwrap_or_else(|| qbix_core::alg::invert(&a.alg));
                    canvas(diagram::Moves { setup, n, mask, top: matches!(mask, crate::cube3d::Mask::Oll | crate::cube3d::Mask::Pll), wca: false, cache: diagram::cache_of(&key) }).width(84).height(84).into()
                }
                None => Space::new().width(0).into(),
            };
            let mut words = column![tx(t(&a.name), 15.5, 650, INK), tx(a.alg.clone(), 16.0, 600, ACC_INK)].spacing(4).width(Length::Fill);
            if let Some(note) = &a.note { words = words.push(ui::small(t(note))) }
            if !a.alternatives.is_empty() { words = words.push(ui::small(format!("{} {}", t("Also:"), a.alternatives.join(" · ")))) }
            ui::well(row![picture, words].spacing(16).align_y(Alignment::Center)).width(Length::Fill).into()
        };
        let mut col = column![text(t(&step.text)).size(16.0).font(crate::theme::text(500)).color(INK2).line_height(1.45)].spacing(16).max_width(860);
        if !step.algs.is_empty() {
            col = col.push(ui::h3(t("Algorithms")));
            for (i, a) in step.algs.iter().enumerate() {
                col = col.push(alg_card(a, format!("step:{}:{}:{i}", puzzle, step.title)));
            }
        }
        if !step.help.is_empty() {
            col = col.push(ui::h3(t("Moves that help")));
            for (i, a) in step.help.iter().enumerate() {
                col = col.push(alg_card(a, format!("help:{}:{}:{i}", puzzle, step.title)));
            }
        }
        if !step.tips.is_empty() {
            col = col.push(ui::h3(t("Tips")));
            for tip in &step.tips {
                col = col.push(row![icon(icon::SPARKLES, 15.0, ACC), text(t(tip)).size(15.0).font(crate::theme::text(500)).color(INK2)].spacing(10));
            }
        }
        if let Some(m) = &step.missing { col = col.push(ui::small(t(m))) }
        let key = format!("course.{puzzle}.{}", step.title);
        let mastered = ctx.store.settings.pref(&key) == Some("1");
        col = col.push(ui::item(Some(if mastered { icon::DONE } else { icon::CIRCLE }), if mastered { t("Mastered") } else { t("Not mastered yet") }, Some(if mastered { t("Press to unmark it") } else { t("Mark it once you do it without thinking") }), Some(Msg::Mastered(key, !mastered))));
        let mut page = column![ui::scroll(container(col).width(Length::Fill).center_x(Length::Fill).padding(Padding { right: 14.0, bottom: 24.0, ..Padding::ZERO })).height(Length::Fill)].spacing(14);
        if step.train.as_deref() == Some("cross") {
            page = page.push(container(press(Look::Primary, tx(tf("Practise the {0}", &[&t(&step.title).to_lowercase()]), 18.0, 650, SHEET)).height(58).width(260).on_press(Msg::TrainSteps("cross-5".into()))).center_x(Length::Fill));
        }
        page.height(Length::Fill).into()
    }

    fn drawer<'a>(&'a self, ctx: &'a Ctx) -> Option<Drawer<'a, Msg>> {
        let c = catalog().case(self.case.as_deref()?)?;
        let (title, back, body) = match self.pane {
            Pane::Case => (c.title().to_string(), None, self.case_view(ctx, c)),
            Pane::Algs => (t("Other algorithms"), Some(Msg::Drawer(Some(Pane::Case))), self.algs_view(ctx, c)),
        };
        let sub = Some(c.detail().map_or_else(|| format!("{} · {}", t(&c.set_label), t(&c.group)), |d| format!("{d} · {}", t(&c.set_label))));
        Some(Drawer { open: self.open, key: format!("{}:{:?}", c.id, self.pane), title, sub, back, close: Msg::Drawer(None), body })
    }

    fn case_view<'a>(&'a self, ctx: &'a Ctx, c: &'a Case) -> Element<'a, Msg> {
        let learned = ctx.store.is_learned(&c.id);
        let alg = chosen(ctx, c).unwrap_or_default();
        let picture: Element<'a, Msg> = match &self.player {
            Some(p) => p.view(if ctx.phone { 200.0 } else { 236.0 }, Msg::Drag, Msg::DragEnd),
            None => diagram::case(c, 200.0, diagram::cache_of(&format!("case:{}", c.id))),
        };
        let controls: Element<'a, Msg> = match &self.player {
            Some(p) => {
                let b = |g, m: Msg| press(Look::Soft, icon(g, 17.0, INK2)).width(42).height(42).padding(0).on_press(m);
                let speed = format!("{}×", p.speed);
                row![b(icon::RESET, Msg::Restart), b(icon::PREVIOUS, Msg::Back), press(Look::Primary, icon(if p.playing { icon::PAUSE } else { icon::PLAY }, 19.0, SHEET)).width(54).height(46).padding(0).on_press(Msg::Play), b(icon::NEXT, Msg::Forward), press(Look::Soft, tx(speed, 13.5, 650, INK2)).width(48).height(42).padding(0).on_press(Msg::Speed)].spacing(6).align_y(Alignment::Center).into()
            }
            None => Space::new().into(),
        };
        let moves: Element<'a, Msg> = match &self.player {
            Some(p) => row(p.moves.iter().enumerate().map(|(i, m)| tx(m.clone(), 20.0, 650, if i < p.at { ACC_INK } else if i == p.at && p.playing { INK } else { INK2 }).into())).spacing(7).wrap().vertical_spacing(4).into(),
            None => tx(alg.clone(), 20.0, 650, INK).into(),
        };
        let mut info = column![].spacing(4);
        if let Some(p) = &c.probability { info = info.push(ui::small(tf("Probability {0}", &[p]))) }
        if let Some(n) = &c.notes { info = info.push(ui::small(t(n))) }
        let others = c.algorithms.len().saturating_sub(1);
        column![
            container(picture).width(Length::Fill).center_x(Length::Fill),
            container(controls).width(Length::Fill).center_x(Length::Fill),
            container(moves).width(Length::Fill).center_x(Length::Fill).padding([4, 0]),
            info,
            column![
                ui::item(Some(if learned { icon::DONE } else { icon::CIRCLE }), if learned { t("Learned") } else { t("Not learned yet") }, Some(if learned { t("Press to unmark it") } else { t("Mark it once you know it by heart") }), Some(Msg::Learned(c.id.clone(), !learned))),
                ui::item(Some(icon::LIST), t("Other algorithms"), Some(qbix_core::i18n::plural(others, "{0} more", "{0} more")), (others > 0).then_some(Msg::Drawer(Some(Pane::Algs)))),
            ]
            .spacing(2),
            ui::fill(),
            press(Look::Tonal, row![icon(icon::TARGET, 17.0, ACC_INK), tx(t("Train this case"), 15.5, 650, ACC_INK)].spacing(8).align_y(Alignment::Center)).width(Length::Fill).height(52).on_press(Msg::Train(vec![c.id.clone()])),
        ]
        .spacing(14)
        .height(Length::Fill)
        .into()
    }

    fn algs_view<'a>(&'a self, ctx: &'a Ctx, c: &'a Case) -> Element<'a, Msg> {
        let current = chosen(ctx, c).unwrap_or_default();
        let list = column(c.algorithms.iter().map(|a| {
            let on = a.executable() == current;
            let mut meta = vec![];
            if let Some(v) = a.votes { meta.push(tf("{0} votes", &[&v])) }
            meta.push(tf("{0} moves", &[&qbix_core::alg::move_count(&a.alg)]));
            if let Some(g) = &a.generator { meta.push(g.clone()) }
            press(Look::Tab { on }, row![column![tx(a.display(), 16.0, 650, if on { ACC_INK } else { INK }), ui::small(meta.join(" · "))].spacing(3).width(Length::Fill), if on { Element::from(icon(icon::CHECK, 16.0, ACC_INK)) } else { Space::new().into() }].align_y(Alignment::Center))
                .width(Length::Fill)
                .height(Length::Shrink)
                .padding([10, 14])
                .radius(16.0)
                .on_press(Msg::Choose(c.id.clone(), a.executable()))
                .into()
        }))
        .spacing(4);
        column![ui::small(t("Choose the one you use: it is the one shown, played and trained.")), ui::scroll(list).height(Length::Fill)].spacing(14).height(Length::Fill).into()
    }
}
