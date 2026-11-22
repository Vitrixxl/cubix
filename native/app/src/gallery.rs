//! The components on one board, each in its states, to judge them side by side (`qbix --gallery`).
use crate::glass::{Backdrop, glass};
use crate::icon::{self, icon};
use crate::press::{Look, press, switch};
use crate::theme::*;
use iced::widget::{Space, column, container, row, stack, text};
use iced::{Alignment, Element, Length};

#[derive(Debug, Clone)]
pub enum Message {
    Toggle(usize),
    Pressed,
}

#[derive(Default)]
pub struct Gallery {
    switches: [bool; 2],
    tab: usize,
}

fn label<'a, M: 'a>(s: &'a str) -> Element<'a, M> { text(s).size(13.5).font(crate::theme::text(500)).color(INK3).into() }

fn heading<'a, M: 'a>(s: &'a str) -> Element<'a, M> { text(s).size(19.0).font(crate::theme::text(700)).color(INK).into() }

impl Gallery {
    pub fn update(&mut self, m: Message) {
        match m {
            Message::Toggle(i) if i < 2 => self.switches[i] = !self.switches[i],
            Message::Toggle(i) => self.tab = i - 2,
            Message::Pressed => {}
        }
    }

    pub fn view(&self) -> Element<'_, Message> {
        let t = |s: &'static str, c| text(s).size(15.5).font(crate::theme::text(600)).color(c);
        let states = ["Rest", "Hover", "Pressed", "Disabled"];
        let looks: [(&str, Look, iced::Color); 5] = [
            ("Primary", Look::Primary, SHEET),
            ("Tonal", Look::Tonal, ACC_INK),
            ("Soft", Look::Soft, INK),
            ("Ghost", Look::Ghost, INK2),
            ("Danger", Look::Danger, BAD),
        ];
        let mut grid = column![row![Space::new().width(110)].extend(states.iter().map(|s| container(label(s)).width(196).into())).align_y(Alignment::Center)].spacing(18);
        for (name, look, ink) in looks {
            let mut r = row![container(label(name)).width(110)].align_y(Alignment::Center);
            for (i, _) in states.iter().enumerate() {
                let content = row![icon(if look == Look::Danger { icon::TRASH } else { icon::CHECK }, 17.0, ink), t(if look == Look::Primary { "Start" } else { "Action" }, ink)].spacing(8).align_y(Alignment::Center);
                let mut b = press(look, content).height(if look == Look::Primary { 52 } else { 40 }).padding([0, 22]);
                b = match i {
                    0 => b.on_press(Message::Pressed),
                    1 => b.on_press(Message::Pressed).forced(1.0, 0.0),
                    2 => b.on_press(Message::Pressed).forced(1.0, 1.0),
                    _ => b,
                };
                r = r.push(container(b).width(196));
            }
            grid = grid.push(r);
        }

        let tabs = row(["Normal", "Cross", "F2L", "Last layer"].into_iter().enumerate().map(|(i, s)| {
            let on = self.tab == i;
            press(Look::Tab { on }, text(s).size(15.5).font(crate::theme::text(if on { 650 } else { 550 })).color(if on { ACC_INK } else { INK2 })).on_press(Message::Toggle(i + 2)).into()
        }))
        .spacing(4);

        let nav = |glyph, name: &'static str, on: bool| {
            column![
                press(Look::Nav { on }, icon(glyph, 20.0, if on { ACC } else { INK2 })).width(46).height(46).padding(0).on_press(Message::Pressed),
                text(name).size(12.5).font(crate::theme::text(if on { 700 } else { 550 })).color(if on { INK } else { INK2 })
            ]
            .spacing(6)
            .align_x(Alignment::Center)
        };
        let rail = row![nav(icon::TIMER, "Timer", true), nav(icon::TARGET, "Training", false), nav(icon::GRID, "Algs", false), nav(icon::SWORDS, "Challenges", false), nav(icon::USERS, "Social", false)].spacing(22);

        let chip = |s: &'static str, bg: iced::Color, fg: iced::Color| container(text(s).size(15.0).font(crate::theme::text(550)).color(fg)).padding([9, 18]).style(move |_| container::Style { background: Some(bg.into()), border: iced::border::rounded(99), ..container::Style::default() });
        let chips = row![chip("12.47", SOFT, INK), chip("9.84", OK_SOFT, OK), chip("14.21+", WARN_SOFT, WARN), chip("DNF", BAD_SOFT, BAD)].spacing(8);

        let switches = row![
            switch(self.switches[0], Message::Toggle(0)),
            text("Inspection").size(15.5).font(crate::theme::text(550)).color(INK),
            Space::new().width(26),
            switch(self.switches[1], Message::Toggle(1)),
            text("Sound").size(15.5).font(crate::theme::text(550)).color(INK)
        ]
        .spacing(12)
        .align_y(Alignment::Center);

        let picker = press(Look::Soft, row![text("3×3").size(15.5).font(crate::theme::text(600)).color(INK), icon(icon::CHEVRON_DOWN, 16.0, INK3)].spacing(8).align_y(Alignment::Center)).on_press(Message::Pressed).padding([0, 14]);
        let round = press(Look::Soft, icon(icon::PANEL_RIGHT, 18.0, INK2)).width(40).padding(0).on_press(Message::Pressed);
        let round_on = press(Look::Tab { on: true }, icon(icon::PANEL_RIGHT, 18.0, ACC_INK)).width(40).padding(0).on_press(Message::Pressed);

        let toast = glass(FLOAT_GLASS, row![text("Solve deleted").size(15.5).font(crate::theme::text(550)).color(INK), press(Look::Tonal, row![icon(icon::UNDO, 16.0, ACC_INK), text("Undo").size(15.0).font(crate::theme::text(650)).color(ACC_INK)].spacing(6).align_y(Alignment::Center)).height(36).padding([0, 14]).on_press(Message::Pressed)].spacing(18).align_y(Alignment::Center)).padding([10, 10]).padding(iced::Padding { left: 22.0, ..iced::Padding::from(10) });

        let sheet = glass(
            SHEET_GLASS,
            column![
                row![text("Components").size(27.0).font(crate::theme::text(700)).color(INK), Space::new().width(Length::Fill), picker, round, round_on].spacing(8).align_y(Alignment::Center),
                heading("Buttons"),
                grid,
                row![column![heading("Tabs"), tabs].spacing(14), Space::new().width(60), column![heading("Switches"), switches].spacing(14)],
                row![column![heading("Times"), chips].spacing(14), Space::new().width(60), column![heading("Toast"), toast].spacing(14)],
            ]
            .spacing(28),
        )
        .padding([30, 38])
        .width(Length::Fill)
        .height(Length::Fill);

        let side = column![
            glass(DISC_GLASS, Space::new().width(64).height(64)),
            text("Section").size(13.0).font(crate::theme::text(550)).color(INK2),
            Space::new().height(10),
            rail_column(rail),
        ]
        .spacing(8)
        .align_x(Alignment::Center);

        let page = row![container(side).width(260).center_x(260).padding([40, 0]), sheet].padding(iced::Padding { top: 14.0, right: 14.0, bottom: 14.0, left: 0.0 });
        stack![Backdrop, page].into()
    }
}

fn rail_column<'a>(r: iced::widget::Row<'a, Message>) -> Element<'a, Message> { container(r).padding([20, 0]).into() }
