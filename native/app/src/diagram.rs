//! A case's picture (from above, in 3D, or the catalogue's own for the other puzzles) and the player that turns an
//! algorithm on a 3D cube, move by move, the cube turned by a drag.
use crate::cube3d::{self, Mask, View3};
use crate::spring::Spring;
use iced::widget::canvas::{self, Cache, Frame, Geometry};
use iced::widget::{container, image};
use iced::{Element, Length, Point, Rectangle, Renderer, Theme, mouse};
use qbix_core::alg;
use qbix_core::catalog::Case;
use qbix_core::cube::Cube;
use std::collections::HashMap;
use std::sync::OnceLock;

mod pictures {
    include!(concat!(env!("OUT_DIR"), "/cases.rs"));
}

/// The catalogue's picture of a case of another puzzle ("/cases/sq1-shape-1.svg" → its PNG), decoded once.
fn picture(c: &Case) -> Option<image::Handle> {
    static HANDLES: OnceLock<HashMap<&'static str, image::Handle>> = OnceLock::new();
    let handles = HANDLES.get_or_init(|| pictures::CASES.iter().map(|(n, b)| (*n, image::Handle::from_bytes(*b))).collect());
    let name = c.diagram.as_deref()?.rsplit('/').next()?.trim_end_matches(".svg").trim_end_matches(".png");
    handles.get(name).cloned()
}

/// A drawing's cache by key, kept for the app's life (one per case drawn: a few thousand at most).
pub fn cache_of(key: &str) -> &'static Cache {
    thread_local! {
        static CACHES: std::cell::RefCell<HashMap<String, &'static Cache>> = std::cell::RefCell::new(HashMap::new());
    }
    CACHES.with(|c| *c.borrow_mut().entry(key.to_string()).or_insert_with(|| Box::leak(Box::new(Cache::new()))))
}

struct CaseProgram<'a> {
    setup: &'a str,
    n: usize,
    stage: &'a str,
    cache: &'a Cache,
}

impl<M> canvas::Program<M> for CaseProgram<'_> {
    type State = ();
    fn draw(&self, _: &(), renderer: &Renderer, _: &Theme, bounds: Rectangle, _: mouse::Cursor) -> Vec<Geometry> {
        vec![self.cache.draw(renderer, bounds.size(), |frame: &mut Frame| {
            let mut cube = Cube::solved(self.n);
            cube.apply(&alg::expand(self.setup));
            let mask = Mask::for_stage(self.stage);
            if cube3d::top_view(self.stage) { cube3d::draw_top(frame, bounds.size(), &cube, &cube3d::CASE, mask) } else { cube3d::draw(frame, bounds.size(), &cube, &cube3d::CASE, mask, &View3::default()) }
        })]
    }
}

/// A case's picture at `size`, drawn once into `cache`.
pub fn case<'a, M: 'a>(c: &'a Case, size: f32, cache: &'a Cache) -> Element<'a, M> {
    match c.size() {
        Some(n) => canvas::Canvas::new(CaseProgram { setup: &c.setup, n, stage: &c.stage, cache }).width(size).height(size).into(),
        None => match picture(c) {
            Some(h) => image(h).width(size).height(size).content_fit(iced::ContentFit::Contain).into(),
            None => container(crate::icon::icon(crate::icon::BOX, size * 0.4, crate::theme::INK3)).width(size).height(size).center(size).into(),
        },
    }
}

/// A picture of a cube after moves, with a mask (a method step's algorithms).
pub struct Moves<'a> {
    pub setup: String,
    pub n: usize,
    pub mask: Mask,
    pub top: bool,
    /// The WCA's scheme (white on top), the cases' otherwise.
    pub wca: bool,
    pub cache: &'a Cache,
}

impl<M> canvas::Program<M> for Moves<'_> {
    type State = ();
    fn draw(&self, _: &(), renderer: &Renderer, _: &Theme, bounds: Rectangle, _: mouse::Cursor) -> Vec<Geometry> {
        vec![self.cache.draw(renderer, bounds.size(), |frame: &mut Frame| {
            let mut cube = Cube::solved(self.n);
            cube.apply(&alg::expand(&self.setup));
            let scheme = if self.wca { &cube3d::WCA } else { &cube3d::CASE };
            if self.top { cube3d::draw_top(frame, bounds.size(), &cube, scheme, self.mask) } else { cube3d::draw(frame, bounds.size(), &cube, scheme, self.mask, &View3::default()) }
        })]
    }
}

/// An algorithm played on a cube: the case it starts from, its moves, where it is and how fast it goes.
pub struct Player {
    start: Cube,
    pub moves: Vec<String>,
    /// Moves done.
    pub at: usize,
    /// How far into the next move (0–1).
    progress: f32,
    pub playing: bool,
    pub speed: f32,
    mask: Mask,
    scheme: [iced::Color; 6],
    yaw: Spring,
    pitch: Spring,
}

impl Player {
    /// The player of `algorithm` on the cube `setup` makes (the case), at its start.
    pub fn new(n: usize, setup: &str, algorithm: &str, mask: Mask) -> Self {
        let mut start = Cube::solved(n);
        start.apply(&alg::expand(setup));
        let moves = alg::expand(algorithm).split_whitespace().map(String::from).filter(|m| alg::parse(m, n).is_some()).collect();
        let view = View3::default();
        Self { start, moves, at: 0, progress: 0.0, playing: false, speed: 1.0, mask, scheme: cube3d::CASE, yaw: Spring::smooth(view.yaw), pitch: Spring::smooth(view.pitch) }
    }

    pub fn play(&mut self) {
        if self.at >= self.moves.len() {
            self.at = 0;
            self.progress = 0.0;
        }
        self.playing = !self.playing;
    }

    pub fn forward(&mut self) {
        self.playing = false;
        if self.progress > 0.0 { self.progress = 0.0; self.at = (self.at + 1).min(self.moves.len()) } else if self.at < self.moves.len() { self.at += 1 }
    }

    pub fn back(&mut self) {
        self.playing = false;
        self.progress = 0.0;
        self.at = self.at.saturating_sub(1);
    }

    pub fn restart(&mut self) {
        self.playing = false;
        self.progress = 0.0;
        self.at = 0;
    }

    /// Moves time on; whether it still moves.
    pub fn step(&mut self, dt: f32) -> bool {
        let turning = self.yaw.step(dt) | self.pitch.step(dt);
        if !self.playing { return turning }
        // A quarter turn in about a third of a second at speed 1, a little pause between moves.
        self.progress += dt * 2.6 * self.speed;
        if self.progress >= 1.18 {
            self.progress = 0.0;
            self.at += 1;
            if self.at >= self.moves.len() {
                self.playing = false;
                return turning;
            }
        }
        true
    }

    fn state(&self) -> (Cube, View3) {
        let mut cube = self.start.clone();
        for m in &self.moves[..self.at.min(self.moves.len())] {
            cube.apply(m);
        }
        let mut view = View3 { yaw: self.yaw.value, pitch: self.pitch.value, turning: None };
        if self.at < self.moves.len() && self.progress > 0.0 && let Some(m) = alg::parse(&self.moves[self.at], cube.n) {
            let p = self.progress.min(1.0);
            // Eased in and out.
            let e = p * p * (3.0 - 2.0 * p);
            let quarters = match m.quarters { 3 => -1.0, q => q as f32 };
            view.turning = Some((m.axis, m.layers, quarters * std::f32::consts::FRAC_PI_2 * e));
        }
        (cube, view)
    }

    pub fn turn_view(&mut self, dyaw: f32, dpitch: f32) {
        self.yaw.set(self.yaw.value + dyaw);
        self.pitch.set((self.pitch.value + dpitch).clamp(-1.3, 1.3));
    }

    /// Back to the usual angle.
    pub fn settle_view(&mut self) {
        let v = View3::default();
        let turns = ((self.yaw.value - v.yaw) / std::f32::consts::TAU).round();
        self.yaw.to(v.yaw + turns * std::f32::consts::TAU);
        self.pitch.to(v.pitch);
    }

    pub fn view<'a, M: 'a>(&'a self, size: f32, on_drag: impl Fn(f32, f32) -> M + 'a, on_release: M) -> Element<'a, M>
    where
        M: Clone,
    {
        let (cube, view) = self.state();
        canvas::Canvas::new(PlayerProgram { cube, view, mask: self.mask, scheme: self.scheme, on_drag: Box::new(on_drag), on_release }).width(Length::Fixed(size)).height(Length::Fixed(size)).into()
    }
}

struct PlayerProgram<'a, M> {
    cube: Cube,
    view: View3,
    mask: Mask,
    scheme: [iced::Color; 6],
    on_drag: Box<dyn Fn(f32, f32) -> M + 'a>,
    on_release: M,
}

#[derive(Default)]
struct Drag {
    from: Option<Point>,
}

impl<M: Clone> canvas::Program<M> for PlayerProgram<'_, M> {
    type State = Drag;

    fn update(&self, state: &mut Drag, event: &iced::Event, bounds: Rectangle, cursor: mouse::Cursor) -> Option<canvas::Action<M>> {
        use iced::{Event, touch};
        match event {
            Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left)) | Event::Touch(touch::Event::FingerPressed { .. }) => {
                let p = cursor.position_in(bounds)?;
                state.from = Some(p);
                Some(canvas::Action::capture())
            }
            Event::Mouse(mouse::Event::CursorMoved { .. }) | Event::Touch(touch::Event::FingerMoved { .. }) => {
                let from = state.from?;
                let p = cursor.position().map(|p| Point::new(p.x - bounds.x, p.y - bounds.y))?;
                state.from = Some(p);
                let k = 3.0 / bounds.width.max(1.0);
                Some(canvas::Action::publish((self.on_drag)((p.x - from.x) * k, (p.y - from.y) * k)).and_capture())
            }
            Event::Mouse(mouse::Event::ButtonReleased(mouse::Button::Left)) | Event::Touch(touch::Event::FingerLifted { .. }) => {
                state.from.take()?;
                Some(canvas::Action::publish(self.on_release.clone()))
            }
            _ => None,
        }
    }

    fn draw(&self, _: &Drag, renderer: &Renderer, _: &Theme, bounds: Rectangle, _: mouse::Cursor) -> Vec<Geometry> {
        let mut frame = Frame::new(renderer, bounds.size());
        cube3d::draw(&mut frame, bounds.size(), &self.cube, &self.scheme, self.mask, &self.view);
        vec![frame.into_geometry()]
    }

    fn mouse_interaction(&self, state: &Drag, bounds: Rectangle, cursor: mouse::Cursor) -> mouse::Interaction {
        if state.from.is_some() { mouse::Interaction::Grabbing } else if cursor.is_over(bounds) { mouse::Interaction::Grab } else { mouse::Interaction::None }
    }
}
