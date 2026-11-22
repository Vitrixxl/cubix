//! The smart cubes: finding one, connecting it (its address asked when it cannot be read), and the cube as it turns,
//! live. Once connected, the timer and the training follow it.
use crate::ble::Command;
use crate::ctx::Ctx;
use crate::cube3d::{self, Mask, View3};
use crate::icon::{self, icon};
use crate::page::View;
use crate::press::{Look, press};
use crate::theme::*;
use crate::ui::{self, tx};
use iced::widget::canvas::{self, Cache, Frame, Geometry};
use iced::widget::{column, container, row};
use iced::{Alignment, Element, Length, Rectangle, Renderer, Task, Theme, mouse};
use qbix_core::{t, tf};

#[derive(Debug, Clone)]
pub enum Msg {
    Scan,
    Connect(String),
    Mac(String),
    SendMac,
    Disconnect,
    Solved,
}

pub struct Page {
    mac: String,
    cache: Cache,
    drawn: u64,
}

struct Live<'a> {
    cube: &'a qbix_core::cube::Cube,
    cache: &'a Cache,
}

impl<M> canvas::Program<M> for Live<'_> {
    type State = ();
    fn draw(&self, _: &(), renderer: &Renderer, _: &Theme, bounds: Rectangle, _: mouse::Cursor) -> Vec<Geometry> {
        vec![self.cache.draw(renderer, bounds.size(), |f: &mut Frame| cube3d::draw(f, bounds.size(), self.cube, &cube3d::WCA, Mask::Full, &View3::default()))]
    }
}

impl Page {
    pub fn new() -> Self { Self { mac: String::new(), cache: Cache::new(), drawn: u64::MAX } }

    pub fn refresh(&mut self, ctx: &Ctx) {
        if self.drawn != ctx.smart.revision {
            self.drawn = ctx.smart.revision;
            self.cache.clear();
        }
    }

    pub fn update(&mut self, msg: Msg, ctx: &mut Ctx) -> Task<Msg> {
        let Some(ble) = ctx.ble.clone() else { return Task::none() };
        match msg {
            Msg::Scan => {
                ctx.smart.scanning = true;
                ctx.smart.error = None;
                ble.send(Command::Scan);
            }
            Msg::Connect(id) => ble.send(Command::Connect(id)),
            Msg::Mac(m) => self.mac = m,
            Msg::SendMac => ble.send(Command::Mac(self.mac.clone())),
            Msg::Disconnect => ble.send(Command::Disconnect),
            Msg::Solved => {
                ctx.smart.cube = Some(qbix_core::cube::Cube::solved(3));
                ctx.smart.revision += 1;
            }
        }
        Task::none()
    }

    pub fn view<'a>(&'a self, ctx: &'a Ctx) -> View<'a, Msg> {
        let sm = &ctx.smart;
        let body: Element<'a, Msg> = if let (Some(name), Some(cube)) = (&sm.name, &sm.cube) {
            let battery = sm.battery.map_or_else(String::new, |b| format!("{b}%"));
            column![
                container(canvas::Canvas::new(Live { cube, cache: &self.cache }).width(320).height(320)).width(Length::Fill).center_x(Length::Fill),
                column![tx(name.clone(), 22.0, 700, INK), ui::small(tf("Battery {0} · {1} turns", &[&battery, &sm.turns.len()]))].spacing(4).align_x(Alignment::Center),
                ui::small(t("Turn it: the cube here follows. The timer starts on the first turn after the scramble and stops when it is solved.")).align_x(Alignment::Center),
                row![press(Look::Soft, tx(t("It is solved"), 15.0, 600, INK2)).height(46).on_press(Msg::Solved), press(Look::Danger, tx(t("Disconnect"), 15.0, 600, BAD)).height(46).on_press(Msg::Disconnect)].spacing(10),
            ]
            .spacing(18)
            .align_x(Alignment::Center)
            .max_width(620)
            .into()
        } else if let Some((name, guess)) = &sm.need_mac {
            column![
                ui::h2(tf("{0}'s address", &[name])),
                ui::small(t("This cube encrypts its messages with its Bluetooth address, which the system could not read. It is written in the cube's app, or under its battery cover.")),
                row![ui::field(guess.as_deref().unwrap_or("AA:BB:CC:DD:EE:FF"), &self.mac, Msg::Mac).on_submit(Msg::SendMac).width(Length::Fill), press(Look::Primary, tx(t("Connect"), 15.0, 650, SHEET)).height(46).on_press(Msg::SendMac)].spacing(10).align_y(Alignment::Center),
            ]
            .spacing(16)
            .max_width(560)
            .into()
        } else {
            let mut col = column![ui::empty(icon::BLUETOOTH, t("Connect a smart cube"), t("GAN, MoYu WeiLong AI, QiYi, Giiker, Xiaomi, GoCube and Rubik's Connected: turn it on, then search."))].spacing(18).align_x(Alignment::Center).max_width(560);
            if let Some(e) = &sm.error { col = col.push(tx(e.clone(), 14.0, 600, BAD)) }
            if let Some(c) = &sm.connecting { col = col.push(ui::small(tf("Connecting to {0}…", &[c]))) }
            for (id, name) in &sm.found {
                col = col.push(ui::item(Some(icon::BOX), name.clone(), Some(t("Press to connect")), Some(Msg::Connect(id.clone()))));
            }
            col = col.push(press(Look::Primary, row![icon(icon::BLUETOOTH, 18.0, SHEET), tx(if sm.scanning { t("Searching…") } else { t("Search for cubes") }, 17.0, 650, SHEET)].spacing(10).align_y(Alignment::Center)).height(56).width(260).on_press(Msg::Scan));
            col.into()
        };
        View::new(t("Smart cubes"), container(body).center(Length::Fill))
    }
}

