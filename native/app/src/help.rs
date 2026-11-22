//! The guides (src/client/lib/guides.ts, exported to core/data/guides.json): their list on the left, the one open on
//! the right, in the interface's language.
use crate::ctx::Ctx;
use crate::icon::{self, icon};
use crate::page::View;
use crate::press::{Look, press};
use crate::theme::*;
use crate::ui::{self, tx};
use iced::widget::{column, container, row, text};
use iced::{Alignment, Element, Length, Padding, Task};
use qbix_core::t;
use serde::Deserialize;
use serde_json::Value;
use std::sync::OnceLock;

#[derive(Deserialize)]
struct Guide {
    id: String,
    name: String,
    heading: String,
    blocks: Vec<Value>,
}

fn guides() -> &'static [Guide] {
    static G: OnceLock<Vec<Guide>> = OnceLock::new();
    G.get_or_init(|| serde_json::from_str(include_str!("../../core/data/guides.json")).unwrap_or_default())
}

#[derive(Debug, Clone)]
pub enum Msg {
    Open(String),
}

pub struct Page {
    open: String,
}

impl Page {
    pub fn new() -> Self { Self { open: "overviewGuide".into() } }

    pub fn update(&mut self, msg: Msg, _ctx: &mut Ctx) -> Task<Msg> {
        let Msg::Open(id) = msg;
        self.open = id;
        Task::none()
    }

    pub fn view<'a>(&'a self, ctx: &'a Ctx) -> View<'a, Msg> {
        let list = column(guides().iter().map(|g| {
            let on = g.id == self.open;
            press(Look::Tab { on }, row![tx(t(&g.name), 15.0, if on { 650 } else { 550 }, if on { ACC_INK } else { INK2 }), iced::widget::Space::new().width(Length::Fill)]).width(Length::Fill).height(40).radius(14.0).padding([0, 14]).on_press(Msg::Open(g.id.clone())).into()
        }))
        .spacing(2)
        .width(if ctx.phone { Length::Fill } else { Length::Fixed(240.0) });
        let guide = guides().iter().find(|g| g.id == self.open).or(guides().first());
        let content: Element<'a, Msg> = match guide {
            Some(g) => {
                let mut col = column![ui::h2(t(&g.heading))].spacing(16).max_width(760);
                for b in &g.blocks {
                    col = col.push(block(b));
                }
                ui::scroll(container(col).padding(Padding { right: 16.0, bottom: 30.0, ..Padding::ZERO })).height(Length::Fill).into()
            }
            None => ui::small(t("No guide")).into(),
        };
        let content: Element<'a, Msg> = if self.open == "shortcuts" {
            let key = |k: &str, what: &str| -> Element<'a, Msg> { row![container(ui::kbd(k.to_string())).width(110), ui::body(t(what))].spacing(14).align_y(Alignment::Center).into() };
            column![
                ui::h2(t("Keyboard shortcuts")),
                key("Space", "Hold, then release to start"),
                key(&t("Any key"), "Stop the solve"),
                key("Esc", "Cancel a hold, close a panel or a menu"),
                key("Ctrl Z", "Bring back a deleted solve"),
                key("S", "Open or close the session"),
                key("E", "Choose the puzzle"),
                key("N", "New scramble (in the training: the next case)"),
                key("H", "Show the case and its algorithm (training)"),
            ]
            .spacing(16)
            .into()
        } else { content };
        let list = column![list, press(Look::Tab { on: self.open == "shortcuts" }, row![tx(t("Keyboard shortcuts"), 15.0, if self.open == "shortcuts" { 650 } else { 550 }, if self.open == "shortcuts" { ACC_INK } else { INK2 }), iced::widget::Space::new().width(Length::Fill)]).width(Length::Fill).height(40).radius(14.0).padding([0, 14]).on_press(Msg::Open("shortcuts".into()))].spacing(2).width(if ctx.phone { Length::Fill } else { Length::Fixed(240.0) });
        let body: Element<'a, Msg> = if ctx.phone { column![ui::scroll(list).height(160), content].spacing(16).into() } else { row![list, content].spacing(36).height(Length::Fill).into() };
        View::new(t("Guides"), body)
    }
}

fn inline(parts: &[Value]) -> String {
    parts
        .iter()
        .map(|p| match p {
            Value::String(s) => t(s),
            Value::Object(o) => o.get("text").or(o.get("strong")).and_then(Value::as_str).map(t).unwrap_or_default(),
            _ => String::new(),
        })
        .collect()
}

fn paragraph<'a>(s: String) -> Element<'a, Msg> { text(s).size(16.0).font(crate::theme::text(500)).color(INK2).line_height(1.5).into() }

fn block<'a>(b: &Value) -> Element<'a, Msg> {
    if let Some(h) = b.get("h").and_then(Value::as_str) { return container(ui::h3(t(h))).padding(ui::padding_top(10.0)).into() }
    if let Some(p) = b.get("p").and_then(Value::as_array) { return paragraph(inline(p)) }
    if let Some(items) = b.get("ol").and_then(Value::as_array) {
        return column(items.iter().enumerate().map(|(i, s)| row![container(tx((i + 1).to_string(), 12.5, 700, SHEET)).width(22).height(22).center(22).style(|_| container::Style { background: Some(INK.into()), border: iced::border::rounded(99), ..Default::default() }), paragraph(t(s.as_str().unwrap_or("")))].spacing(12).into())).spacing(10).into();
    }
    if let (Some(q), Some(a)) = (b.get("q").and_then(Value::as_str), b.get("a").and_then(Value::as_str)) {
        return ui::well(column![row![icon(icon::HELP, 16.0, ACC_INK), tx(t(q), 15.5, 650, INK)].spacing(10).align_y(Alignment::Center), paragraph(t(a))].spacing(8)).width(Length::Fill).into();
    }
    if let Some(cards) = b.get("cards").and_then(Value::as_array) {
        return column(cards.iter().map(|c| ui::well(column![tx(t(c.get("h").and_then(Value::as_str).unwrap_or("")), 16.0, 700, INK), paragraph(t(c.get("p").and_then(Value::as_str).unwrap_or("")))].spacing(6)).width(Length::Fill).into())).spacing(10).into();
    }
    ui::small(String::new()).into()
}
