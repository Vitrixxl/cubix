//! The pieces every page is built of: text in the app's sizes, numbers with their label, chips, list rows, fields,
//! empty states and tooltips. A page says what it shows; these say how.
use crate::icon::{self, icon};
use crate::press::{Look, press};
use crate::theme::*;
use iced::widget::{Space, Text, column, container, row, text, text_input, tooltip};
use iced::{Alignment, Color, Element, Length, Padding};

/// Text at `size` and `weight`, in `color`.
pub fn tx<'a>(s: impl text::IntoFragment<'a>, size: f32, weight: u16, color: Color) -> Text<'a> { text(s).size(size).font(crate::theme::text(weight)).color(color) }

/// A page's title.
pub fn h1<'a>(s: impl text::IntoFragment<'a>) -> Text<'a> { tx(s, 27.0, 700, INK) }
/// A drawer's or a dialog's title.
pub fn h2<'a>(s: impl text::IntoFragment<'a>) -> Text<'a> { tx(s, 23.0, 700, INK) }
/// A block's title in a page.
pub fn h3<'a>(s: impl text::IntoFragment<'a>) -> Text<'a> { tx(s, 18.0, 700, INK) }
/// Running text.
pub fn body<'a>(s: impl text::IntoFragment<'a>) -> Text<'a> { tx(s, 15.5, 500, INK) }
/// Text that says less: under a title, beside a number.
pub fn small<'a>(s: impl text::IntoFragment<'a>) -> Text<'a> { tx(s, 13.5, 500, INK3) }
/// The label over a block.
pub fn label<'a>(s: impl text::IntoFragment<'a>) -> Text<'a> { tx(s, 14.5, 600, INK2) }

/// A number over what it is.
pub fn stat<'a, M: 'a>(value: String, what: String, size: f32, colour: Color) -> Element<'a, M> {
    column![tx(value, size, 600, colour), tx(what, 13.5 + (size - 22.0).max(0.0) * 0.2, 500, INK3)].spacing(2).align_x(Alignment::Center).into()
}

/// A pill of colour around a short text.
pub fn chip<'a, M: 'a>(s: impl text::IntoFragment<'a>, fg: Color, bg: Color) -> Element<'a, M> {
    container(tx(s, 13.5, 600, fg)).padding([4, 11]).style(move |_| container::Style { background: Some(bg.into()), border: iced::border::rounded(99), ..Default::default() }).into()
}

/// A block of soft fill (on the sheet).
pub fn well<'a, M: 'a>(content: impl Into<Element<'a, M>>) -> container::Container<'a, M> {
    container(content).padding(16).style(|_| container::Style { background: Some(fade(INK, 0.04).into()), border: iced::border::rounded(20), ..Default::default() })
}

/// A row to press: an icon, a title and what it says, an arrow.
pub fn item<'a, M: Clone + 'a>(glyph: Option<char>, title: String, sub: Option<String>, on: Option<M>) -> Element<'a, M> {
    let mut r = row![].spacing(14).align_y(Alignment::Center);
    if let Some(g) = glyph {
        r = r.push(container(icon(g, 18.0, ACC_INK)).width(38).height(38).center(38).style(|_| container::Style { background: Some(fade(ACC, 0.10).into()), border: iced::border::rounded(99), ..Default::default() }));
    }
    let mut words = column![tx(title, 15.5, 600, INK)].spacing(2).width(Length::Fill);
    if let Some(s) = sub { words = words.push(small(s)) }
    r = r.push(words);
    if on.is_some() { r = r.push(icon(icon::CHEVRON_RIGHT, 17.0, INK3)) }
    press(Look::Ghost, r).width(Length::Fill).height(if glyph.is_some() { 60 } else { 52 }).radius(18.0).padding([0, 12]).on_press_maybe(on).into()
}

/// A line of text to type in, in the app's style.
pub fn field<'a, M: Clone + 'a>(placeholder: &str, value: &str, on_input: impl Fn(String) -> M + 'a) -> text_input::TextInput<'a, M> {
    text_input(placeholder, value).on_input(on_input).size(15.5).font(crate::theme::text(500)).padding([11, 16]).style(|_, status| {
        let focused = matches!(status, text_input::Status::Focused { .. });
        text_input::Style {
            background: fade(INK, if focused { 0.035 } else { 0.055 }).into(),
            border: iced::Border { radius: 14.0.into(), width: if focused { 1.5 } else { 0.0 }, color: fade(ACC, 0.6) },
            icon: INK3,
            placeholder: fade(INK3, 0.8),
            value: INK,
            selection: fade(ACC, 0.25),
        }
    })
}

/// What a page says when it has nothing to show yet.
pub fn empty<'a, M: 'a>(glyph: char, title: String, sub: String) -> Element<'a, M> {
    column![container(icon(glyph, 26.0, ACC_INK)).width(64).height(64).center(64).style(|_| container::Style { background: Some(fade(ACC, 0.09).into()), border: iced::border::rounded(99), ..Default::default() }), tx(title, 18.0, 700, INK), tx(sub, 14.5, 500, INK3).align_x(Alignment::Center)]
        .spacing(10)
        .align_x(Alignment::Center)
        .max_width(380)
        .into()
}

/// A tooltip in the app's style.
pub fn hint<'a, M: 'a>(content: impl Into<Element<'a, M>>, tip: String, side: tooltip::Position) -> Element<'a, M> {
    tooltip(content, container(tx(tip, 13.5, 550, SHEET)).padding([7, 12]).style(|_| container::Style { background: Some(fade(INK, 0.92).into()), border: iced::border::rounded(10), ..Default::default() }), side).gap(10).into()
}

/// A small round avatar with the first letter of a name.
pub fn avatar<'a, M: 'a>(name: &str, size: f32) -> Element<'a, M> {
    let letter = name.chars().next().map(|c| c.to_uppercase().to_string()).unwrap_or_else(|| "?".into());
    let hue = name.bytes().fold(0u32, |h, b| h.wrapping_mul(31).wrapping_add(b as u32));
    let tones = [ACC, hex_c(0x2f7d9b), hex_c(0x9b4f8a), hex_c(0x3d8a5c), hex_c(0xb0662a), hex_c(0x6a55b5)];
    let tone = tones[hue as usize % tones.len()];
    container(tx(letter, size * 0.42, 700, SHEET)).width(size).height(size).center(size).style(move |_| container::Style { background: Some(tone.into()), border: iced::border::rounded(size), ..Default::default() }).into()
}

const fn hex_c(rgb: u32) -> Color { Color::from_rgb8((rgb >> 16) as u8, (rgb >> 8) as u8, rgb as u8) }

/// A row of tab pills: the page's pages, the chosen one marked.
pub fn tabs<'a, M: Clone + 'a>(items: Vec<(String, M, bool)>) -> Element<'a, M> {
    row(items.into_iter().map(|(name, m, on)| press(Look::Tab { on }, tx(name, 15.0, if on { 650 } else { 550 }, if on { ACC_INK } else { INK2 })).height(38).padding([0, 15]).on_press(m).into())).spacing(2).into()
}

/// Space that takes what is left.
pub fn fill<'a, M: 'a>() -> Element<'a, M> { Space::new().width(Length::Fill).height(Length::Fill).into() }

pub fn gap<'a, M: 'a>(h: f32) -> Element<'a, M> { Space::new().height(h).into() }

/// A key on the keyboard.
pub fn kbd<'a, M: 'a>(k: String) -> Element<'a, M> {
    container(tx(k, 13.5, 650, INK2)).padding([5, 10]).style(|_| container::Style { background: Some(fade(INK, 0.06).into()), border: iced::border::rounded(8), ..Default::default() }).into()
}

/// A horizontal bar filled to `ratio`.
pub fn bar<'a, M: 'a>(ratio: f32, colour: Color, height: f32) -> Element<'a, M> {
    let r = ratio.clamp(0.0, 1.0);
    container(row![container(Space::new()).width(Length::FillPortion((r * 1000.0) as u16 + 1)).height(height).style(move |_| container::Style { background: Some(colour.into()), border: iced::border::rounded(height), ..Default::default() }), Space::new().width(Length::FillPortion(((1.0 - r) * 1000.0) as u16 + 1))])
        .width(Length::Fill)
        .style(move |_| container::Style { background: Some(fade(INK, 0.07).into()), border: iced::border::rounded(height), ..Default::default() })
        .into()
}

pub fn padding_top(top: f32) -> Padding { Padding { top, ..Padding::ZERO } }

/// A vertical scroll in the app's style: a slim bar that shows only on its rail.
pub fn scroll<'a, M: 'a>(content: impl Into<Element<'a, M>>) -> iced::widget::Scrollable<'a, M> {
    iced::widget::scrollable(content).width(Length::Fill).direction(iced::widget::scrollable::Direction::Vertical(iced::widget::scrollable::Scrollbar::new().width(5).scroller_width(5).margin(2))).style(|_, status| {
        use iced::widget::scrollable::{Rail, Scroller, Status, Style};
        let active = matches!(status, Status::Hovered { .. } | Status::Dragged { .. });
        let rail = Rail { background: None, border: iced::Border::default(), scroller: Scroller { background: fade(INK, if active { 0.28 } else { 0.12 }).into(), border: iced::border::rounded(4) } };
        Style { container: container::Style::default(), vertical_rail: rail, horizontal_rail: rail, gap: None, auto_scroll: iced::widget::scrollable::AutoScroll { background: fade(SHEET, 0.9).into(), border: iced::border::rounded(99), shadow: iced::Shadow::default(), icon: INK2 } }
    })
}

/// Pills that wrap onto the next line.
pub fn pills<'a, M: Clone + 'a>(items: Vec<(String, M, bool)>) -> Element<'a, M> {
    row(items.into_iter().map(|(name, m, on)| press(Look::Tab { on }, tx(name, 14.5, if on { 650 } else { 550 }, if on { ACC_INK } else { INK2 })).height(34).padding([0, 13]).on_press(m).into())).spacing(4).wrap().vertical_spacing(4).into()
}
