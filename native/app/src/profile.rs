//! The profile: who you are, your records, your activity and your awards (Overview); every event's figures and history
//! (Statistics); what you learned and trained (Training); every award (Awards); your races (Battles). A guest is asked
//! to sign in here, the device keeping its solves until then.
use crate::charts::{Heat, Ring, Trend};
use crate::ctx::{Ctx, spawn};
use crate::icon::{self, icon};
use crate::page::{Drawer, View};
use crate::picker;
use crate::press::{Look, press};
use crate::shell;
use crate::spring::Spring;
use crate::theme::*;
use crate::ui::{self, tx};
use iced::widget::{Space, canvas, column, container, row};
use iced::{Alignment, Color, Element, Length, Padding, Task};
use qbix_core::account::{self, Auth, Config};
use qbix_core::achievements::{self, Award, Summary};
use qbix_core::api::ApiError;
use qbix_core::catalog::catalog;
use qbix_core::puzzles::Context;
use qbix_core::store::Solve;
use qbix_core::time::{best, fmt_time, last_average, mean, rolling};
use qbix_core::{date, t, tf};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Tab {
    Overview,
    Statistics,
    Training,
    Awards,
    Battles,
    Analysis,
}

#[derive(Debug, Clone)]
pub enum Msg {
    Tab(Tab),
    Menu(bool),
    Pick(Context),
    Name(String),
    SignIn,
    Config(Result<Config, ApiError>),
    SignedIn(Result<Auth, ApiError>),
    Category(&'static str),
    Award(String),
    Drawer(bool),
}

pub struct Page {
    config: Option<Config>,
    name: String,
    busy: bool,
    error: Option<String>,
    menu: Spring,
    menu_open: bool,
    category: &'static str,
    award: Option<String>,
    open: bool,
    summary: Option<Summary>,
    revision: u64,
    history: canvas::Cache,
    heat: canvas::Cache,
}

impl Page {
    pub fn new() -> Self {
        Self { config: None, name: String::new(), busy: false, error: None, menu: Spring::smooth(0.0), menu_open: false, category: "speed", award: None, open: false, summary: None, revision: u64::MAX, history: canvas::Cache::new(), heat: canvas::Cache::new() }
    }

    fn tab(ctx: &Ctx) -> Tab {
        match ctx.store.settings.pref("profile.tab") {
            Some("statistics") => Tab::Statistics,
            Some("training") => Tab::Training,
            Some("awards") => Tab::Awards,
            Some("battles") => Tab::Battles,
            Some("analysis") => Tab::Analysis,
            _ => Tab::Overview,
        }
    }

    fn context(ctx: &Ctx) -> Context {
        ctx.store.settings.pref("profile.context").and_then(|s| serde_json::from_str(s).ok()).unwrap_or_else(|| ctx.store.settings.context.clone())
    }

    /// The page shown: its figures read again, the server's sign-in options asked once.
    pub fn enter(&mut self, ctx: &Ctx) -> Task<Msg> {
        self.refresh(ctx);
        let mut tasks = vec![];
        if !ctx.store.signed_in() && self.config.is_none() {
            let api = ctx.api();
            tasks.push(Task::perform(spawn(move || account::config(&api)), Msg::Config));
        }
        Task::batch(tasks)
    }

    pub fn refresh(&mut self, ctx: &Ctx) {
        if self.revision != ctx.store.revision {
            self.summary = Some(achievements::compute(&ctx.store));
            self.revision = ctx.store.revision;
            self.history.clear();
            self.heat.clear();
        }
    }

    pub fn step_motion(&mut self, dt: f32) -> bool { self.menu.step(dt) }

    pub fn update(&mut self, msg: Msg, ctx: &mut Ctx) -> Task<Msg> {
        match msg {
            Msg::Tab(tab) => {
                ctx.store.settings.set_pref("profile.tab", match tab { Tab::Overview => "overview", Tab::Statistics => "statistics", Tab::Training => "training", Tab::Awards => "awards", Tab::Battles => "battles", Tab::Analysis => "analysis" });
                ctx.changed();
                self.open = false;
                return self.enter(ctx);
            }
            Msg::Menu(open) => {
                self.menu_open = open;
                self.menu.to(open as u8 as f32);
            }
            Msg::Pick(c) => {
                ctx.store.settings.set_pref("profile.context", serde_json::to_string(&c).unwrap_or_default());
                ctx.changed();
                self.history.clear();
            }
            Msg::Name(n) => {
                self.name = n.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_').take(24).collect();
                self.error = None;
            }
            Msg::SignIn => {
                if self.name.len() < 3 || self.busy { return Task::none() }
                self.busy = true;
                let (api, name) = (ctx.api(), self.name.clone());
                return Task::perform(spawn(move || account::dev_login(&api, &name)), Msg::SignedIn);
            }
            Msg::Config(r) => self.config = r.ok(),
            Msg::SignedIn(r) => {
                self.busy = false;
                match r {
                    Ok(auth) if !auth.user.is_guest => {
                        let name = auth.user.username.clone();
                        ctx.store.sign_in(auth.user, auth.token);
                        ctx.pull = true;
                        ctx.changed();
                        ctx.toast(tf("Signed in as {0}", &[&name]));
                    }
                    Ok(_) => self.error = Some(t("Sign in with a registered account.")),
                    Err(e) => self.error = Some(e.message()),
                }
            }
            Msg::Category(c) => self.category = c,
            Msg::Award(id) => {
                self.award = Some(id);
                self.open = true;
            }
            Msg::Drawer(open) => self.open = open,
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

    pub fn view<'a>(&'a self, ctx: &'a Ctx) -> View<'a, Msg> {
        let tab = Self::tab(ctx);
        let body: Element<'a, Msg> = match tab {
            Tab::Overview => self.overview(ctx),
            Tab::Statistics => self.statistics(ctx),
            Tab::Training => self.training(ctx),
            Tab::Awards => self.awards(ctx),
            Tab::Battles => self.battles(ctx),
            Tab::Analysis => self.analysis(ctx),
        };
        let mut view = View::new(t("Profile"), body);
        view.tabs = [(Tab::Overview, "Overview"), (Tab::Statistics, "Statistics"), (Tab::Training, "Training"), (Tab::Awards, "Awards"), (Tab::Battles, "Battles"), (Tab::Analysis, "Analysis")].into_iter().map(|(k, n)| (t(n), Msg::Tab(k), k == tab)).collect();
        if tab == Tab::Statistics {
            let c = Self::context(ctx);
            view.tools.push(picker::button(c.label(), self.menu_open, 1.0, Msg::Menu(!self.menu_open)));
            if self.menu.value > 0.002 {
                let right = if ctx.phone { 16.0 } else { 14.0 + (392.0 + 12.0) * ctx.drawer + 36.0 };
                view.overlay = Some(shell::popover(picker::menu(&c, Msg::Pick), self.menu.value, Msg::Menu(false), if ctx.phone { 70.0 } else { 96.0 }, right));
            }
        }
        if let Some(a) = self.award.as_ref().and_then(|id| self.summary.as_ref()?.awards.iter().find(|a| &a.id == id)) {
            view.drawer = Some(Drawer { open: self.open, key: a.id.clone(), title: a.title.clone(), sub: Some(a.group.clone()), back: None, close: Msg::Drawer(false), body: award_detail(a) });
        }
        view
    }

    fn sign_in<'a>(&'a self, ctx: &'a Ctx) -> Element<'a, Msg> {
        let dev = self.config.as_ref().is_some_and(|c| c.dev);
        let mut col = column![row![icon(icon::CLOUD, 22.0, ACC_INK), ui::h3(t("Sign in to keep your times everywhere"))].spacing(12).align_y(Alignment::Center), ui::small(t("Your solves stay on this device until then; signing in sends them up and brings back those of your other devices."))].spacing(12);
        if dev {
            col = col.push(row![ui::field(&t("Username"), &self.name, Msg::Name).on_submit(Msg::SignIn).width(Length::Fill), press(Look::Primary, tx(if self.busy { t("Signing in…") } else { t("Sign in") }, 15.5, 650, SHEET)).height(46).padding([0, 24]).on_press_maybe((self.name.len() >= 3 && !self.busy).then_some(Msg::SignIn))].spacing(10).align_y(Alignment::Center));
        } else if self.config.is_some() {
            col = col.push(ui::small(t("To sign in, open Qbix on the web, then come back: this server signs in with Google or the WCA there.")));
        } else {
            col = col.push(ui::small(tf("Connecting to {0}…", &[&ctx.store.settings.server])));
        }
        if let Some(e) = &self.error { col = col.push(tx(e.clone(), 14.0, 600, BAD)) }
        ui::well(col).padding(22).width(Length::Fill).into()
    }

    fn overview<'a>(&'a self, ctx: &'a Ctx) -> Element<'a, Msg> {
        let summary = self.summary.as_ref();
        let xp = summary.map_or(0, |s| s.xp);
        let (lvl, into, span) = achievements::level(xp);
        let (current, longest) = achievements::streak(&ctx.store);
        let name = ctx.username();
        let who = row![
            ui::avatar(&name, if ctx.phone { 58.0 } else { 74.0 }),
            column![
                tx(name.clone(), if ctx.phone { 24.0 } else { 30.0 }, 700, INK),
                row![tx(tf("Level {0}", &[&lvl]), 15.0, 650, ACC_INK), icon(icon::FLAME, 15.0, if current > 0 { WARN } else { INK3 }), tx(if current > 0 { tf("{0}-day streak", &[&current]) } else { tf("Longest streak {0} days", &[&longest]) }, 15.0, 550, INK2)].spacing(8).align_y(Alignment::Center),
                container(ui::bar(into as f32 / span as f32, ACC, 6.0)).width(220),
            ]
            .spacing(6),
        ]
        .spacing(18)
        .align_y(Alignment::Center);

        // The records of the event practised most.
        let c = ctx.store.settings.context.clone();
        let standard: Vec<Option<f64>> = ctx.store.solves_in(&Context::new(&c.puzzle, &c.solve_mode, "normal")).filter(|s| s.case_id.is_none()).map(Solve::value).collect();
        let best_of = |n: usize| rolling(&standard, n).into_iter().flatten().reduce(f64::min);
        let records = row![ui::stat(fmt_time(best(&standard)), t("best single"), 27.0, OK), ui::stat(fmt_time(best_of(5)), t("best ao5"), 27.0, INK), ui::stat(fmt_time(best_of(12)), t("best ao12"), 27.0, INK), ui::stat(standard.len().to_string(), t("solves"), 27.0, INK)].spacing(if ctx.phone { 26 } else { 56 });

        let mut days: HashMap<i64, usize> = HashMap::new();
        for s in &ctx.store.solves {
            *days.entry(date::day(s.at())).or_default() += 1;
        }
        let weeks = if ctx.phone { 16 } else { 22 };
        let active = days.len();
        let heat = canvas(Heat { days, today: date::today(), weeks, cache: &self.heat }).width(Length::Fill).height(if ctx.phone { 120 } else { 150 });
        

        let recent: Vec<&Award> = summary.map_or_else(Vec::new, |s| {
            let mut v: Vec<&Award> = s.awards.iter().filter(|a| a.unlocked).collect();
            v.sort_by_key(|a| std::cmp::Reverse(a.unlocked_at.unwrap_or(0)));
            let mut next: Vec<&Award> = s.awards.iter().filter(|a| !a.unlocked && a.ratio > 0.0).collect();
            next.sort_by(|a, b| b.ratio.total_cmp(&a.ratio));
            v.truncate(3);
            v.extend(next.into_iter().take(4 - v.len().min(4)));
            v
        });
        let awards = column(recent.into_iter().map(|a| self.award_row(a))).spacing(4);
        let mut col = column![].spacing(28).max_width(1100);
        if !ctx.store.signed_in() { col = col.push(self.sign_in(ctx)) }
        col = col.push(who);
        col = col.push(container(records).width(Length::Fill).center_x(Length::Fill));
        let activity = column![row![ui::label(t("Activity")), Space::new().width(Length::Fill), ui::small(qbix_core::i18n::plural(active, "{0} day practised", "{0} days practised"))], heat].spacing(12).width(Length::Fill);
        let awards_block = column![row![ui::label(t("Awards")), Space::new().width(Length::Fill), ui::small(tf("{0} of {1}", &[&summary.map_or(0, |s| s.unlocked), &summary.map_or(0, |s| s.awards.len())]))], awards].spacing(12).width(Length::Fill);
        col = col.push(if ctx.phone { Element::from(column![activity, awards_block].spacing(28)) } else { row![activity, awards_block].spacing(36).into() });
        ui::scroll(container(col).width(Length::Fill).center_x(Length::Fill).padding(Padding { top: 8.0, right: 12.0, bottom: 24.0, left: 0.0 })).height(Length::Fill).into()
    }

    fn award_row<'a>(&'a self, a: &'a Award) -> Element<'a, Msg> {
        let colour = if a.unlocked { ACC } else { INK3 };
        let badge = container(stack_ring(a.ratio as f32, colour, a.badge.clone(), a.unlocked)).width(48).height(48);
        press(Look::Ghost, row![badge, column![tx(a.title.clone(), 15.0, 650, if a.unlocked { INK } else { INK2 }), ui::small(a.detail.clone())].spacing(2).width(Length::Fill), tx(format!("{} XP", a.xp), 13.0, 650, if a.unlocked { ACC_INK } else { INK3 })].spacing(14).align_y(Alignment::Center)).width(Length::Fill).height(64).radius(18.0).padding([0, 10]).on_press(Msg::Award(a.id.clone())).into()
    }

    fn statistics<'a>(&'a self, ctx: &'a Ctx) -> Element<'a, Msg> {
        let c = Self::context(ctx);
        let solves: Vec<&Solve> = ctx.store.solves_in(&c).filter(|s| s.case_id.is_none()).collect();
        if solves.is_empty() { return container(ui::empty(icon::CHART, t("No times yet"), tf("Your {0} solves will be counted here.", &[&c.label()]))).center(Length::Fill).into() }
        let values: Vec<Option<f64>> = solves.iter().map(|s| s.value()).collect();
        let best_of = |n: usize| rolling(&values, n).into_iter().flatten().reduce(f64::min);
        let cell = |v: String, l: String, colour: Color| container(ui::stat(v, l, 24.0, colour)).width(Length::Fill).center_x(Length::Fill);
        let grid = column![
            row![cell(values.len().to_string(), t("solves"), INK), cell(fmt_time(best(&values)), t("best single"), OK), cell(fmt_time(mean(&values)), t("mean"), INK), cell(fmt_time(values.iter().flatten().copied().reduce(f64::max)), t("worst"), INK)],
            row![cell(fmt_time(best_of(5)), t("best ao5"), INK), cell(fmt_time(best_of(12)), t("best ao12"), INK), cell(fmt_time(best_of(50)), t("best ao50"), INK), cell(fmt_time(best_of(100)), t("best ao100"), INK)],
            row![cell(fmt_time(last_average(&values, 5)), t("current ao5"), INK2), cell(fmt_time(last_average(&values, 12)), t("current ao12"), INK2), cell(fmt_time(last_average(&values, 100)), t("current ao100"), INK2), cell(values.iter().filter(|v| v.is_none()).count().to_string(), "DNF".into(), BAD)],
        ]
        .spacing(22);
        let n = values.len();
        let chart = canvas(OwnedTrend { times: values.clone(), averages: rolling(&values, if n > 200 { 50 } else { 12.min(n.max(3)) }), cache: &self.history }).width(Length::Fill).height(220);
        // Sessions, newest first.
        let mut sessions: Vec<(i64, Vec<&Solve>)> = vec![];
        for s in &solves {
            let key = s.session_id.unwrap_or(0);
            match sessions.iter_mut().find(|x| x.0 == key) {
                Some(x) => x.1.push(s),
                None => sessions.push((key, vec![s])),
            }
        }
        sessions.reverse();
        let list = column(sessions.into_iter().take(30).map(|(id, list)| {
            let v: Vec<Option<f64>> = list.iter().map(|s| s.value()).collect();
            let ao5 = rolling(&v, 5).into_iter().flatten().reduce(f64::min);
            row![
                column![tx(crate::timer::session_title(&ctx.store, Some(id)), 15.0, 650, INK), ui::small(date::short(list[0].at()))].spacing(2).width(Length::Fill),
                ui::stat(list.len().to_string(), t("solves"), 17.0, INK2),
                container(ui::stat(fmt_time(best(&v)), t("best"), 17.0, OK)).width(90),
                container(ui::stat(fmt_time(ao5), t("best ao5"), 17.0, INK)).width(90),
                container(ui::stat(fmt_time(mean(&v)), t("mean"), 17.0, INK)).width(90),
            ]
            .spacing(16)
            .align_y(Alignment::Center)
            .into()
        }))
        .spacing(14);
        let col = column![grid, column![ui::label(t("History")), chart].spacing(12), column![ui::label(t("Sessions")), list].spacing(14)].spacing(30).max_width(1100);
        ui::scroll(container(col).width(Length::Fill).center_x(Length::Fill).padding(Padding { top: 8.0, right: 12.0, bottom: 24.0, left: 0.0 })).height(Length::Fill).into()
    }

    fn training<'a>(&'a self, ctx: &'a Ctx) -> Element<'a, Msg> {
        let stats = qbix_core::training::stats(&ctx.store);
        let puzzle = ctx.store.settings.pref("algs.puzzle").unwrap_or("333").to_string();
        let mut col = column![].spacing(10).max_width(980);
        for stage in catalog().stages(&puzzle) {
            col = col.push(ui::label(t(&stage)));
            for s in catalog().sets_of(&puzzle).filter(|s| s.stage == stage) {
                let ids: Vec<&str> = catalog().cases_of_set(&s.id).map(|c| c.id.as_str()).collect();
                let learned = ids.iter().filter(|i| ctx.store.is_learned(i)).count();
                let trained: Vec<&qbix_core::training::CaseStats> = ids.iter().filter_map(|i| stats.get(*i)).collect();
                let attempts: usize = trained.iter().map(|x| x.count).sum();
                let means: Vec<Option<f64>> = trained.iter().map(|x| x.mean).collect();
                col = col.push(
                    row![
                        column![tx(t(&s.label), 15.0, 650, INK), ui::small(if attempts > 0 { tf("{0} attempts · mean {1}", &[&attempts, &fmt_time(mean(&means))]) } else { t("Not trained yet") })].spacing(2).width(Length::FillPortion(3)),
                        container(ui::bar(learned as f32 / ids.len().max(1) as f32, if learned == ids.len() { OK } else { ACC }, 8.0)).width(Length::FillPortion(3)),
                        tx(format!("{learned}/{}", ids.len()), 14.5, 650, INK2).width(70),
                    ]
                    .spacing(18)
                    .align_y(Alignment::Center)
                    .height(52),
                );
            }
        }
        ui::scroll(container(col).width(Length::Fill).center_x(Length::Fill).padding(Padding { top: 8.0, right: 12.0, bottom: 24.0, left: 0.0 })).height(Length::Fill).into()
    }

    fn awards<'a>(&'a self, ctx: &'a Ctx) -> Element<'a, Msg> {
        let Some(summary) = &self.summary else { return Space::new().into() };
        let (lvl, into, span) = achievements::level(summary.xp);
        let cats: [(&'static str, &str); 5] = [("speed", "Speed"), ("average", "Average"), ("volume", "Volume"), ("knowledge", "Knowledge"), ("dedication", "Dedication")];
        let head = row![
            column![tx(tf("Level {0}", &[&lvl]), 22.0, 700, INK), ui::small(tf("{0} XP · {1} to the next level", &[&summary.xp, &(span - into)]))].spacing(2),
            Space::new().width(Length::Fill),
            ui::pills(cats.iter().map(|(id, name)| (t(name), Msg::Category(id), *id == self.category)).collect()),
        ]
        .spacing(16)
        .align_y(Alignment::Center);
        let mut groups: Vec<(String, Vec<&Award>)> = vec![];
        for a in summary.awards.iter().filter(|a| a.category == self.category) {
            match groups.iter_mut().find(|g| g.0 == a.group) {
                Some(g) => g.1.push(a),
                None => groups.push((a.group.clone(), vec![a])),
            }
        }
        let mut col = column![].spacing(16);
        for (group, list) in groups {
            let done = list.iter().filter(|a| a.unlocked).count();
            col = col.push(row![ui::label(group), ui::small(format!("{done}/{}", list.len()))].spacing(10).align_y(Alignment::Center));
            col = col.push(row(list.into_iter().map(|a| {
                let colour = if a.unlocked { ACC } else { INK3 };
                press(Look::Ghost, column![container(stack_ring(a.ratio as f32, colour, a.badge.clone(), a.unlocked)).width(64).height(64), tx(a.title.clone(), 13.0, 600, if a.unlocked { INK } else { INK3 }).align_x(Alignment::Center)].spacing(6).align_x(Alignment::Center).width(104)).height(Length::Shrink).padding([10, 4]).radius(18.0).on_press(Msg::Award(a.id.clone())).into()
            })).spacing(4).wrap().vertical_spacing(4));
        }
        let _ = ctx;
        column![head, ui::scroll(col.padding(Padding { right: 12.0, bottom: 24.0, ..Padding::ZERO })).height(Length::Fill)].spacing(22).height(Length::Fill).into()
    }

    /// The solves turned on a smart cube, cut into their CFOP steps: each step's mean, then each solve.
    fn analysis<'a>(&'a self, ctx: &'a Ctx) -> Element<'a, Msg> {
        let solves: Vec<(&Solve, Vec<qbix_core::analysis::Step>)> = ctx.store.solves.iter().rev().filter(|s| s.puzzle_id == "333" && s.case_id.is_none()).filter_map(|s| {
            let turns = qbix_core::analysis::read(s.solution.as_deref()?)?;
            Some((s, qbix_core::analysis::cfop(s.scramble.as_deref()?, &turns)?))
        }).take(100).collect();
        if solves.is_empty() { return container(ui::empty(icon::ACTIVITY, t("No smart cube solve yet"), t("Solve on a connected cube from the timer: each solve is cut into its cross, F2L pairs, OLL and PLL."))).center(Length::Fill).into() }
        let names = ["Cross", "F2L 1", "F2L 2", "F2L 3", "F2L 4", "OLL", "PLL"];
        let means = row(names.iter().map(|n| {
            let ms: Vec<Option<f64>> = solves.iter().map(|(_, st)| st.iter().find(|x| x.name == *n).and_then(|x| x.ms).map(|m| m as f64)).collect();
            let turns: Vec<f64> = solves.iter().filter_map(|(_, st)| st.iter().find(|x| x.name == *n).map(|x| x.turns as f64)).collect();
            container(column![ui::stat(fmt_time(mean(&ms)), t(n), 20.0, INK), ui::small(tf("{0} turns", &[&format!("{:.1}", turns.iter().sum::<f64>() / turns.len().max(1) as f64)]))].spacing(2).align_x(Alignment::Center)).width(Length::Fill).center_x(Length::Fill).into()
        }));
        let list = column(solves.iter().take(40).map(|(s, steps)| {
            let total = s.time_ms.max(1) as f32;
            let bars = row(steps.iter().map(|st| {
                let w = st.ms.unwrap_or(0) as f32 / total;
                let colour = match st.name.as_str() { "Cross" => ACC, "OLL" => WARN, "PLL" => OK, _ => ACC_INK };
                container(Space::new()).width(Length::FillPortion((w * 1000.0) as u16 + 1)).height(10).style(move |_| container::Style { background: Some(fade(colour, 0.75).into()), border: iced::border::rounded(4), ..Default::default() }).into()
            })).spacing(2);
            let tps = steps.iter().map(|x| x.turns).sum::<usize>() as f64 / (s.time_ms.max(1) as f64 / 1000.0);
            column![row![tx(crate::timer::fmt_solve_of(s), 15.5, 700, INK), ui::small(date::with_time(s.at())), Space::new().width(Length::Fill), ui::small(tf("{0} TPS", &[&format!("{tps:.1}")]))].spacing(10).align_y(Alignment::Center), bars, ui::small(steps.iter().map(|x| format!("{} {}", t(&x.name), fmt_time(x.ms.map(|m| m as f64)))).collect::<Vec<_>>().join(" · "))].spacing(6).into()
        }))
        .spacing(18);
        let col = column![ui::label(qbix_core::i18n::plural(solves.len(), "{0} smart cube solve", "{0} smart cube solves")), means, ui::label(t("Latest smart cube solves")), list].spacing(20).max_width(1000);
        ui::scroll(container(col).width(Length::Fill).center_x(Length::Fill).padding(Padding { top: 8.0, right: 12.0, bottom: 24.0, left: 0.0 })).height(Length::Fill).into()
    }

    fn battles<'a>(&'a self, ctx: &'a Ctx) -> Element<'a, Msg> {
        let list = crate::challenges::Page::records(ctx);
        if list.is_empty() { return container(ui::empty(icon::SWORDS, t("No race yet"), t("Face someone in Challenges: your races show here."))).center(Length::Fill).into() }
        let (w, l) = (list.iter().filter(|r| r.result == "win").count(), list.iter().filter(|r| r.result == "loss").count());
        let rows = column(list.into_iter().map(|r| {
            let colour = match r.result.as_str() { "win" => OK, "loss" => BAD, _ => INK2 };
            let mark = match r.result.as_str() { "win" => "W", "loss" => "L", _ => "D" };
            row![
                container(tx(mark, 14.0, 700, SHEET)).width(30).height(30).center(30).style(move |_| container::Style { background: Some(colour.into()), border: iced::border::rounded(99), ..Default::default() }),
                ui::avatar(&r.opponent, 34.0),
                column![tx(r.opponent.clone(), 15.0, 650, INK), ui::small(format!("{} · {}", crate::challenges::label_of(&r.event), date::with_time(r.at)))].spacing(2).width(Length::Fill),
                tx(format!("{} – {}", fmt_time(qbix_core::time::average_of(&r.mine)), fmt_time(qbix_core::time::average_of(&r.theirs))), 16.0, 700, INK2),
            ]
            .spacing(12)
            .align_y(Alignment::Center)
            .into()
        }))
        .spacing(12);
        let col = column![row![ui::stat(w.to_string(), t("won"), 26.0, OK), ui::stat(l.to_string(), t("lost"), 26.0, BAD)].spacing(48), rows].spacing(24).max_width(800).align_x(Alignment::Center);
        ui::scroll(container(col).width(Length::Fill).center_x(Length::Fill).padding(Padding { top: 8.0, right: 12.0, bottom: 24.0, left: 0.0 })).height(Length::Fill).into()
    }
}

/// A badge: its progress as a ring, the goal it reads inside.
fn stack_ring<'a>(ratio: f32, colour: Color, badge: String, unlocked: bool) -> Element<'a, Msg> {
    let inside = container(tx(badge, 13.5, 700, if unlocked { SHEET } else { INK2 })).width(Length::Fill).height(Length::Fill).center(Length::Fill).padding(8);
    iced::widget::stack![
        canvas(Ring { ratio, colour }).width(Length::Fill).height(Length::Fill),
        container(container(Space::new()).width(Length::Fill).height(Length::Fill).style(move |_| container::Style { background: Some((if unlocked { colour } else { fade(INK, 0.05) }).into()), border: iced::border::rounded(99), ..Default::default() })).padding(8).width(Length::Fill).height(Length::Fill),
        inside,
    ]
    .into()
}

fn award_detail<'a>(a: &'a Award) -> Element<'a, Msg> {
    column![
        container(container(stack_ring(a.ratio as f32, if a.unlocked { ACC } else { INK3 }, a.badge.clone(), a.unlocked)).width(110).height(110)).width(Length::Fill).center_x(Length::Fill),
        ui::body(a.description.clone()),
        ui::small(a.detail.clone()),
        tx(if a.unlocked { a.unlocked_at.map_or_else(|| t("Unlocked"), |at| tf("Unlocked on {0}", &[&date::short(at)])) } else { tf("{0}% of the way", &[&((a.ratio * 100.0).round() as i32)]) }, 15.0, 650, if a.unlocked { OK } else { INK2 }),
        tx(format!("{} XP", a.xp), 15.0, 650, ACC_INK),
    ]
    .spacing(16)
    .into()
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
