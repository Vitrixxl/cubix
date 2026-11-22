//! The session's trend and the scramble's net, drawn on canvases cached until their data changes.
use crate::theme::*;
use iced::mouse;
use iced::widget::canvas::{self, Cache, Frame, Geometry, Path, Stroke};
use iced::{Color, Point, Rectangle, Renderer, Size, Theme};

/// The solves as dots, their rolling average as a line, the best one in green.
pub struct Trend<'a> {
    pub times: &'a [Option<f64>],
    pub averages: &'a [Option<f64>],
    pub cache: &'a Cache,
}

impl<Message> canvas::Program<Message> for Trend<'_> {
    type State = ();

    fn draw(&self, _state: &(), renderer: &Renderer, _theme: &Theme, bounds: Rectangle, _cursor: mouse::Cursor) -> Vec<Geometry> {
        vec![self.cache.draw(renderer, bounds.size(), |frame: &mut Frame| {
            let kept: Vec<f64> = self.times.iter().flatten().copied().collect();
            if kept.len() < 2 { return }
            // The scale leaves out the slowest tenth, so one bad solve does not flatten the rest.
            let mut sorted = kept.clone();
            sorted.sort_by(f64::total_cmp);
            let lo = sorted[0];
            let hi = sorted[((sorted.len() as f64 * 0.9) as usize).min(sorted.len() - 1)].max(lo + 1.0);
            let (w, h) = (frame.width(), frame.height());
            let n = self.times.len();
            let x = |i: usize| 4.0 + (w - 8.0) * i as f32 / (n - 1).max(1) as f32;
            let y = |t: f64| 5.0 + (h - 10.0) * (1.0 - ((t.min(hi) - lo) / (hi - lo)) as f32);
            let best = self.times.iter().enumerate().filter_map(|(i, t)| t.map(|t| (i, t))).min_by(|a, b| a.1.total_cmp(&b.1)).map(|b| b.0);
            for (i, t) in self.times.iter().enumerate() {
                let Some(t) = t else { continue };
                if Some(i) == best { continue }
                frame.fill(&Path::circle(Point::new(x(i), y(*t)), 2.0), fade(ACC, 0.22));
            }
            let line = Path::new(|p| {
                let mut started = false;
                for (i, a) in self.averages.iter().enumerate() {
                    let Some(a) = a else { continue };
                    let pt = Point::new(x(i), y(*a));
                    if started { p.line_to(pt) } else { p.move_to(pt) }
                    started = true;
                }
            });
            frame.stroke(&line, Stroke::default().with_color(ACC).with_width(2.6).with_line_cap(canvas::LineCap::Round).with_line_join(canvas::LineJoin::Round));
            if let Some(i) = best {
                let at = Point::new(x(i), y(self.times[i].unwrap()));
                frame.fill(&Path::circle(at, 6.5), fade(OK, 0.18));
                frame.fill(&Path::circle(at, 3.6), OK);
            }
        })]
    }
}

/// The cube unfolded: U above F, L F R B in a row, D below.
pub struct Net<'a> {
    pub faces: &'a [Vec<u8>; 6],
    pub n: usize,
    pub cache: &'a Cache,
}

pub fn sticker(c: u8) -> Color {
    match c {
        0 => Color::from_rgb8(0xf7, 0xf7, 0xfc),
        1 => Color::from_rgb8(0xf5, 0xcb, 0x4b),
        2 => Color::from_rgb8(0x45, 0xb7, 0x7d),
        3 => Color::from_rgb8(0x55, 0x86, 0xeb),
        4 => Color::from_rgb8(0xe8, 0x5f, 0x55),
        _ => Color::from_rgb8(0xf5, 0x9b, 0x4f),
    }
}

impl<Message> canvas::Program<Message> for Net<'_> {
    type State = ();

    fn draw(&self, _state: &(), renderer: &Renderer, _theme: &Theme, bounds: Rectangle, _cursor: mouse::Cursor) -> Vec<Geometry> {
        vec![self.cache.draw(renderer, bounds.size(), |frame: &mut Frame| {
            let n = self.n as f32;
            let gap = 4.0;
            // Four faces across, three down, with a gap between faces.
            let cell = ((frame.width() - 3.0 * gap) / (4.0 * n)).min((frame.height() - 2.0 * gap) / (3.0 * n));
            let face = cell * n;
            let ox = (frame.width() - (4.0 * face + 3.0 * gap)) / 2.0;
            let oy = (frame.height() - (3.0 * face + 2.0 * gap)) / 2.0;
            let at = [(1.0, 0.0), (0.0, 1.0), (1.0, 1.0), (2.0, 1.0), (3.0, 1.0), (1.0, 2.0)];
            let inset = (cell * 0.07).max(0.6);
            for (f, (fx, fy)) in at.iter().enumerate() {
                let x0 = ox + fx * (face + gap);
                let y0 = oy + fy * (face + gap);
                for (i, c) in self.faces[f].iter().enumerate() {
                    let (col, row) = ((i % self.n) as f32, (i / self.n) as f32);
                    let p = Point::new(x0 + col * cell + inset, y0 + row * cell + inset);
                    let s = Size::new(cell - 2.0 * inset, cell - 2.0 * inset);
                    let path = Path::rounded_rectangle(p, s, (cell * 0.22).into());
                    frame.fill(&path, sticker(*c));
                    if *c == 0 { frame.stroke(&path, Stroke::default().with_color(fade(INK3, 0.28)).with_width(0.8)) }
                }
            }
        })]
    }
}

/// The days practised, week by week: one column a week, Monday on top, darker for more solves.
pub struct Heat<'a> {
    /// Solves per day, by day number (`date::day`).
    pub days: std::collections::HashMap<i64, usize>,
    pub today: i64,
    pub weeks: usize,
    pub cache: &'a Cache,
}

impl<Message> canvas::Program<Message> for Heat<'_> {
    type State = ();

    fn draw(&self, _state: &(), renderer: &Renderer, _theme: &Theme, bounds: Rectangle, _cursor: mouse::Cursor) -> Vec<Geometry> {
        vec![self.cache.draw(renderer, bounds.size(), |frame: &mut Frame| {
            let gap = 3.0;
            let cell = ((frame.width() - gap * (self.weeks as f32 - 1.0)) / self.weeks as f32).min((frame.height() - gap * 6.0) / 7.0);
            // Days since the common era: the first one (day 1) was a Monday.
            let weekday = (self.today - 1).rem_euclid(7);
            let last_monday = self.today - weekday;
            let most = self.days.values().copied().max().unwrap_or(1).max(1) as f32;
            for w in 0..self.weeks {
                for d in 0..7 {
                    let day = last_monday - 7 * (self.weeks - 1 - w) as i64 + d as i64;
                    if day > self.today { continue }
                    let n = self.days.get(&day).copied().unwrap_or(0) as f32;
                    let colour = if n == 0.0 { fade(INK, 0.06) } else { fade(ACC, 0.25 + 0.75 * (n / most).sqrt()) };
                    let p = Point::new(w as f32 * (cell + gap), d as f32 * (cell + gap));
                    frame.fill(&Path::rounded_rectangle(p, Size::new(cell, cell), (cell * 0.28).into()), colour);
                }
            }
        })]
    }
}

/// A ring filled to `ratio`, an award's progress.
pub struct Ring {
    pub ratio: f32,
    pub colour: Color,
}

impl<Message> canvas::Program<Message> for Ring {
    type State = ();

    fn draw(&self, _state: &(), renderer: &Renderer, _theme: &Theme, bounds: Rectangle, _cursor: mouse::Cursor) -> Vec<Geometry> {
        let mut frame = Frame::new(renderer, bounds.size());
        let c = Point::new(bounds.width / 2.0, bounds.height / 2.0);
        let r = bounds.width.min(bounds.height) / 2.0 - 3.0;
        frame.stroke(&Path::circle(c, r), Stroke::default().with_color(fade(INK, 0.08)).with_width(4.0));
        if self.ratio > 0.0 {
            let arc = Path::new(|b| {
                b.arc(canvas::path::Arc { center: c, radius: r, start_angle: iced::Radians(-std::f32::consts::FRAC_PI_2), end_angle: iced::Radians(-std::f32::consts::FRAC_PI_2 + std::f32::consts::TAU * self.ratio.min(1.0)) });
            });
            frame.stroke(&arc, Stroke::default().with_color(self.colour).with_width(4.0).with_line_cap(canvas::LineCap::Round));
        }
        vec![frame.into_geometry()]
    }
}
