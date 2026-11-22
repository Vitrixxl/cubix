//! The frame every page sits in. On the desktop: the rail on the left, the sheet in the middle, the drawer on the
//! right. On a phone: the sheet, the tab bar under it, the drawer rising from the bottom. Places never change: the
//! title at the top left, the puzzle at the top right, the main action at the bottom in the middle.
use crate::glass::{Backdrop, Material, glass};
use crate::icon::{self, icon};
use crate::page::{Drawer, View};
use crate::press::{Look, press};
use crate::theme::*;
use crate::ui::{self, tx};
use iced::widget::{Space, column, container, float, mouse_area, opaque, row, scrollable, stack, tooltip};
use iced::{Alignment, Element, Length, Padding, Vector};
use qbix_core::t;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Section {
    Timer,
    Training,
    Algs,
    Challenges,
    Social,
    Profile,
    Settings,
    Help,
    Devices,
}

pub const MAIN: [(Section, char, &str); 5] = [(Section::Timer, icon::TIMER, "Timer"), (Section::Training, icon::TARGET, "Training"), (Section::Algs, icon::GRID, "Algs"), (Section::Challenges, icon::SWORDS, "Challenges"), (Section::Social, icon::USERS, "Social")];

/// The shell's motion, owned by the app.
pub struct Motion {
    pub drawer: f32,
    pub content: f32,
    pub enter: f32,
    pub toast: f32,
}

pub struct Frame<'a, M> {
    pub section: Section,
    pub view: View<'a, M>,
    pub motion: Motion,
    pub phone: bool,
    pub user: String,
    pub signed_in: bool,
    pub toast: Option<(String, Option<M>)>,
    pub go: fn(Section) -> M,
    pub sync: Option<(char, String)>,
}

pub fn frame<'a, M: Clone + 'a>(f: Frame<'a, M>) -> Element<'a, M> {
    let Frame { section, view, motion, phone, user, signed_in, toast, go, sync } = f;
    let a = view.chrome;
    let mut layers: Vec<Element<'a, M>> = vec![Backdrop.into()];
    let View { title, tabs, tools, body, drawer, overlay, .. } = view;
    let avatar = |size: f32| -> Element<'a, M> {
        let on = section == Section::Profile;
        let inner: Element<'a, M> = if signed_in { ui::avatar(&user, size) } else { container(icon(icon::USER, size * 0.45, INK2)).width(size).height(size).center(size).into() };
        press(if on { Look::Nav { on: true } } else { Look::Ghost }, inner).width(size + 4.0).height(size + 4.0).padding(0).opacity(a).on_press(go(Section::Profile)).into()
    };

    // The body arrives from below and out of the sheet's white.
    let e = motion.enter.clamp(0.0, 1.0);
    let body: Element<'a, M> = stack![
        float(container(body).width(Length::Fill).height(Length::Fill)).translate(move |_, _| Vector::new(0.0, 16.0 * (1.0 - e))),
        container(Space::new()).width(Length::Fill).height(Length::Fill).style(move |_| container::Style { background: Some(fade(SHEET, (1.0 - e) * 0.92).into()), ..Default::default() }),
    ]
    .into();

    let tools_row = row(tools).spacing(8).align_y(Alignment::Center);
    let tabs_el: Element<'a, M> = if tabs.is_empty() { Space::new().into() } else { ui::tabs(tabs.into_iter().map(|(n, m, on)| (n, m, on)).collect()) };

    if phone {
        // The rail's tools live behind the profile on a phone: its header reaches them.
        let mut tools_row = tools_row;
        if matches!(section, Section::Profile | Section::Settings | Section::Help | Section::Devices) {
            for (g, s) in [(icon::BLUETOOTH, Section::Devices), (icon::HELP, Section::Help), (icon::SETTINGS, Section::Settings)] {
                let on = section == s;
                tools_row = tools_row.push(press(if on { Look::Tab { on: true } } else { Look::Soft }, icon(g, 18.0, if on { ACC_INK } else { INK2 })).width(40).padding(0).on_press(go(s)));
            }
        }
        let head = column![row![avatar(36.0), ui::tx(title, 25.0, 700, fade(INK, a)), Space::new().width(Length::Fill), tools_row].spacing(10).align_y(Alignment::Center).height(44), scrollable(tabs_el).direction(scrollable::Direction::Horizontal(scrollable::Scrollbar::hidden()))].spacing(10);
        let sheet = glass(SHEET_GLASS, column![head, body].spacing(8).height(Length::Fill)).padding(Padding { top: 16.0, right: 16.0, bottom: 18.0, left: 16.0 }).width(Length::Fill).height(Length::Fill);
        // The sections float under the sheet in a capsule of the same glass, the current one on a lens, as on the rail.
        let bar = row(MAIN.iter().map(|&(s, g, name)| {
            let on = section == s;
            let cell = column![icon(g, 21.0, fade(if on { ACC } else { INK2 }, a)), tx(t(name), 10.5, if on { 750 } else { 600 }, fade(if on { INK } else { INK3 }, a))].spacing(2).align_x(Alignment::Center);
            press(Look::Nav { on }, cell).width(Length::Fill).height(52).padding(0).on_press(go(s)).into()
        }))
        .spacing(2);
        let (top, bottom) = if cfg!(target_os = "android") { (34.0, 22.0) } else { (10.0, 10.0) };
        let bar = glass(Material { radius: 99.0, ..SHEET_GLASS }, bar).padding(5).width(Length::Fill);
        layers.push(column![container(sheet).padding(Padding { top, right: 8.0, bottom: 8.0, left: 8.0 }).height(Length::Fill), container(bar).padding(Padding { top: 0.0, right: 14.0, bottom, left: 14.0 })].into());
        if let Some(d) = drawer { layers.push(bottom_sheet(d, motion.drawer, motion.content)) }
    } else {
        let head = row![ui::h1(title).color(fade(INK, a)), tabs_el, Space::new().width(Length::Fill), tools_row].spacing(18).align_y(Alignment::Center).height(44);
        let sheet = glass(SHEET_GLASS, column![head, body].spacing(10).height(Length::Fill)).padding([28, 36]).width(Length::Fill).height(Length::Fill);
        let rail = rail(section, a, avatar(44.0), go, sync);
        let side: Element<'a, M> = match drawer {
            Some(d) => side_drawer(d, motion.drawer, motion.content),
            None => Space::new().width(0).into(),
        };
        layers.push(row![rail, sheet, side].padding(Padding { top: 14.0, right: 14.0, bottom: 14.0, left: 0.0 }).into());
    }
    if let Some((text, action)) = toast && motion.toast > 0.002 { layers.push(toast_layer(text, action, motion.toast, phone)) }
    if let Some(o) = overlay { layers.push(o) }
    stack(layers).into()
}

fn rail<'a, M: Clone + 'a>(section: Section, a: f32, avatar: Element<'a, M>, go: fn(Section) -> M, sync: Option<(char, String)>) -> Element<'a, M> {
    let logo = column((0..3).map(|r| row((0..3).map(|c| container(Space::new()).width(7).height(7).style(move |_| container::Style { background: Some(fade(if r == 0 && c == 2 { ACC } else { INK }, a).into()), border: iced::border::rounded(2.2), ..Default::default() }).into())).spacing(2.5).into())).spacing(2.5);
    let mut col = column![container(logo).padding(Padding { top: 10.0, bottom: 22.0, ..Padding::ZERO })].spacing(14).align_x(Alignment::Center);
    for &(s, g, name) in &MAIN {
        let on = section == s;
        col = col.push(column![press(Look::Nav { on }, icon(g, 20.0, fade(if on { ACC } else { INK2 }, a))).width(46).height(46).padding(0).opacity(a).on_press(go(s)), tx(t(name), 12.5, if on { 700 } else { 550 }, fade(if on { INK } else { INK3 }, a))].spacing(6).align_x(Alignment::Center));
    }
    col = col.push(Space::new().height(Length::Fill));
    if let Some((g, tip)) = sync { col = col.push(ui::hint(container(icon(g, 16.0, fade(INK3, a))).width(40).height(28).center_x(40), tip, tooltip::Position::Right)) }
    let tool = |glyph, s: Section, tip: &str| -> Element<'a, M> {
        let on = section == s;
        ui::hint(press(if on { Look::Tab { on: true } } else { Look::Ghost }, icon(glyph, 19.0, fade(if on { ACC_INK } else { INK2 }, a))).width(40).height(40).padding(0).opacity(a).on_press(go(s)), t(tip), tooltip::Position::Right)
    };
    col = col.push(tool(icon::BLUETOOTH, Section::Devices, "Smart cubes and timers"));
    col = col.push(tool(icon::HELP, Section::Help, "Guides"));
    col = col.push(tool(icon::SETTINGS, Section::Settings, "Settings"));
    col = col.push(Space::new().height(6));
    col = col.push(ui::hint(avatar, t("Profile"), tooltip::Position::Right));
    container(col).width(92).height(Length::Fill).padding(Padding { top: 10.0, bottom: 4.0, ..Padding::ZERO }).align_x(Alignment::Center).into()
}

fn drawer_head<'a, M: Clone + 'a>(title: String, sub: Option<String>, back: Option<M>, close: M, f: f32) -> Element<'a, M> {
    let mut r = row![].spacing(10).align_y(Alignment::Center);
    if let Some(b) = back { r = r.push(press(Look::Soft, icon(icon::BACK, 17.0, fade(INK2, f))).width(40).padding(0).on_press(b)) }
    r = r.push(column![ui::h2(title).color(fade(INK, f)), tx(sub.unwrap_or_default(), 14.0, 500, fade(INK3, f))].spacing(0).width(Length::Fill));
    r.push(press(Look::Soft, icon(icon::CLOSE, 17.0, fade(INK2, f))).width(40).padding(0).on_press(close)).into()
}

const DRAWER: f32 = 392.0;

fn side_drawer<'a, M: Clone + 'a>(d: Drawer<'a, M>, open: f32, content: f32) -> Element<'a, M> {
    let w = open.max(0.0);
    if w <= 0.002 { return Space::new().width(0).into() }
    let c = (content * w).clamp(0.0, 1.0);
    let f = c * c;
    let inner = column![drawer_head(d.title, d.sub, d.back, d.close, f), stack![d.body, container(Space::new()).width(Length::Fill).height(Length::Fill).style(move |_| container::Style { background: Some(fade(SHEET, (1.0 - f) * 0.9).into()), ..Default::default() })]].spacing(22).height(Length::Fill);
    let body = float(container(inner).width(DRAWER - 56.0).height(Length::Fill)).translate(move |_, _| Vector::new(28.0 * (1.0 - c), 0.0));
    let pane = glass(SHEET_GLASS, body).padding(28).width(DRAWER * w).height(Length::Fill).opacity(w.min(1.0));
    container(pane).padding(Padding { left: 12.0 * w, ..Padding::ZERO }).clip(true).into()
}

fn bottom_sheet<'a, M: Clone + 'a>(d: Drawer<'a, M>, open: f32, content: f32) -> Element<'a, M> {
    let o = open.clamp(0.0, 1.2);
    if o <= 0.002 { return Space::new().into() }
    let c = (content * o).clamp(0.0, 1.0);
    let close = d.close.clone();
    let scrim = mouse_area(container(Space::new()).width(Length::Fill).height(Length::Fill).style(move |_| container::Style { background: Some(fade(INK, 0.22 * o.min(1.0)).into()), ..Default::default() })).on_press(close);
    let grab = container(Space::new()).width(44).height(5).style(|_| container::Style { background: Some(fade(INK, 0.16).into()), border: iced::border::rounded(9), ..Default::default() });
    let inner = column![container(grab).width(Length::Fill).center_x(Length::Fill), drawer_head(d.title, d.sub, d.back, d.close, c), d.body].spacing(16).height(Length::Fill);
    let pane = opaque(glass(BOTTOM_GLASS, inner).padding(Padding { top: 12.0, right: 20.0, bottom: 28.0, left: 20.0 }).width(Length::Fill).height(Length::FillPortion(6)));
    let placed = column![Space::new().height(Length::FillPortion(2)), pane];
    let moved = float(placed).translate(move |_, viewport| Vector::new(0.0, viewport.height * 0.8 * (1.0 - o)));
    stack![scrim, moved].into()
}

fn toast_layer<'a, M: Clone + 'a>(text: String, action: Option<M>, t: f32, phone: bool) -> Element<'a, M> {
    let t = t.clamp(0.0, 1.0);
    let mut content = row![tx(text, 15.5, 550, fade(INK, t))].spacing(18).align_y(Alignment::Center);
    let has_action = action.is_some();
    if let Some(m) = action { content = content.push(press(Look::Tonal, row![icon(icon::UNDO, 16.0, fade(ACC_INK, t)), tx(qbix_core::t("Undo"), 15.0, 650, fade(ACC_INK, t))].spacing(6).align_y(Alignment::Center)).height(36).padding([0, 14]).on_press(m)) }
    let body = glass(FLOAT_GLASS, content).padding(Padding { top: 8.0, right: if has_action { 8.0 } else { 22.0 }, bottom: 8.0, left: 22.0 }).opacity(t);
    let body = float(opaque(body)).translate(move |_, _| Vector::new(0.0, 18.0 * (1.0 - t))).scale(0.96 + 0.04 * t);
    container(body).width(Length::Fill).height(Length::Fill).align_x(Alignment::Center).align_y(Alignment::End).padding(Padding { bottom: if phone { 110.0 } else { 120.0 }, ..Padding::ZERO }).into()
}

/// A menu floating at a place of the window, closed by a press outside it.
pub fn popover<'a, M: Clone + 'a>(content: impl Into<Element<'a, M>>, m: f32, close: M, top: f32, right: f32) -> Element<'a, M> {
    let m = m.clamp(0.0, 1.0);
    let panel = glass(FLOAT_GLASS, content).padding(10).opacity(m);
    let panel = float(opaque(panel)).scale(0.94 + 0.06 * m).translate(move |_, _| Vector::new(0.0, -10.0 * (1.0 - m)));
    let placed = container(panel).width(Length::Fill).height(Length::Fill).align_x(Alignment::End).padding(Padding { top, right, ..Padding::ZERO });
    stack![mouse_area(Space::new().width(Length::Fill).height(Length::Fill)).on_press(close), placed].into()
}

/// A dialog in the middle of the window, over a veil.
pub fn dialog<'a, M: Clone + 'a>(content: impl Into<Element<'a, M>>, m: f32, close: M, width: f32) -> Element<'a, M> {
    let m = m.clamp(0.0, 1.0);
    let scrim = mouse_area(container(Space::new()).width(Length::Fill).height(Length::Fill).style(move |_| container::Style { background: Some(fade(INK, 0.20 * m).into()), ..Default::default() })).on_press(close);
    let panel = glass(DIALOG_GLASS, container(content).max_width(width)).padding(26).opacity(m);
    let panel = float(opaque(panel)).scale(0.95 + 0.05 * m).translate(move |_, _| Vector::new(0.0, 14.0 * (1.0 - m)));
    stack![scrim, container(panel).width(Length::Fill).height(Length::Fill).center(Length::Fill).padding(16)].into()
}

/// The sync's state for the rail: an icon and what it means.
pub fn sync_badge(state: &crate::ctx::SyncState, pending: usize) -> Option<(char, String)> {
    use crate::ctx::SyncState::*;
    Some(match state {
        Local => return None,
        Syncing => (icon::REFRESH, t("Synchronizing…")),
        Synced if pending == 0 => (icon::CLOUD, t("Synchronized")),
        Synced | Offline => (icon::CLOUD_OFF, qbix_core::tf("Offline · {0} changes waiting", &[&pending])),
        SignIn => (icon::ALERT, t("Sign in again to synchronize")),
        Error(e) => (icon::ALERT, e.clone()),
    })
}
