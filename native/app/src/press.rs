//! Everything you can press: one widget whose hover and press are springs, so each button answers the pointer at
//! once and settles smoothly; it lifts under the pointer, sinks a little when pressed, and says when it cannot be
//! pressed. `Switch` is the on/off toggle.
use crate::glass::{self, Material};
use crate::spring::Spring;
use crate::theme::*;
use iced::advanced::layout::{self, Layout};
use iced::advanced::widget::{Operation, Tree, tree};
use iced::advanced::{Clipboard, Shell, Widget, mouse, renderer, renderer::Renderer as _};
use iced::{Background, Border, Color, Element, Event, Length, Padding, Point, Rectangle, Shadow, Size, Transformation, Vector, touch, window};
use std::time::Instant;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Look {
    /// The one main action of a screen: accent glass.
    Primary,
    /// The main action, ready to go: green glass.
    Ready,
    /// A secondary action that matters: accent tint.
    Tonal,
    /// A quiet control on the sheet: soft fill.
    Soft,
    /// Nothing until the pointer comes.
    Ghost,
    /// A tab or option that can be the chosen one.
    Tab { on: bool },
    /// The rail's sections: the current one is a lens of glass.
    Nav { on: bool },
    /// A destructive action, quiet until hovered.
    Danger,
}

pub struct Press<'a, Message> {
    content: Element<'a, Message>,
    on_press: Option<Message>,
    on_down: Option<Message>,
    on_up: Option<Message>,
    look: Look,
    padding: Padding,
    width: Length,
    height: Length,
    radius: f32,
    /// For the gallery: a hover and a press shown without the pointer.
    forced: Option<(f32, f32)>,
    opacity: f32,
}

pub fn press<'a, Message>(look: Look, content: impl Into<Element<'a, Message>>) -> Press<'a, Message> {
    Press { content: content.into(), on_press: None, on_down: None, on_up: None, look, padding: Padding::from([0, 16]), width: Length::Shrink, height: Length::Fixed(40.0), radius: 99.0, forced: None, opacity: 1.0 }
}

impl<'a, Message: Clone> Press<'a, Message> {
    pub fn on_press(mut self, m: Message) -> Self {
        self.on_press = Some(m);
        self
    }
    pub fn on_press_maybe(mut self, m: Option<Message>) -> Self {
        self.on_press = m;
        self
    }
    /// Sends a message when pressed down and when let go (a hold, as the timer's start).
    pub fn on_hold(mut self, down: Message, up: Message) -> Self {
        self.on_down = Some(down);
        self.on_up = Some(up);
        self
    }
    pub fn padding(mut self, p: impl Into<Padding>) -> Self {
        self.padding = p.into();
        self
    }
    pub fn width(mut self, w: impl Into<Length>) -> Self {
        self.width = w.into();
        self
    }
    pub fn height(mut self, h: impl Into<Length>) -> Self {
        self.height = h.into();
        self
    }
    pub fn radius(mut self, r: f32) -> Self {
        self.radius = r;
        self
    }
    /// Fades the button's own surface (its content fades by its own colours).
    pub fn opacity(mut self, o: f32) -> Self {
        self.opacity = o.clamp(0.0, 1.0);
        self
    }
    pub fn forced(mut self, hover: f32, press: f32) -> Self {
        self.forced = Some((hover, press));
        self
    }
    fn enabled(&self) -> bool { self.on_press.is_some() || self.on_down.is_some() }
}

struct State {
    hover: Spring,
    press: Spring,
    down: bool,
    /// A finger's press: where it touched, and whether it has since slid away (a scroll, not a tap).
    touch: Option<(Point, bool)>,
    /// When a finger last touched: the mouse events the system makes of it are not presses of their own.
    touched: Option<Instant>,
    last: Option<Instant>,
}

impl Default for State {
    fn default() -> Self { Self { hover: Spring::quick(0.0), press: Spring::quick(0.0), down: false, touch: None, touched: None, last: None } }
}

/// The resting, hovered and pressed fills of a look drawn as a quad; None for the glass looks.
fn fills(look: Look) -> Option<(Color, Color, Color)> {
    Some(match look {
        // Veils of ink or accent rather than fixed pastels: they keep their contrast on glass of any tint.
        Look::Tonal => (fade(ACC, 0.11), fade(ACC, 0.17), fade(ACC, 0.24)),
        Look::Soft => (fade(INK, 0.055), fade(INK, 0.09), fade(INK, 0.14)),
        Look::Ghost | Look::Nav { on: false } => (fade(INK, 0.0), fade(INK, 0.065), fade(INK, 0.11)),
        Look::Tab { on: true } => (fade(ACC, 0.12), fade(ACC, 0.16), fade(ACC, 0.22)),
        Look::Tab { on: false } => (fade(INK, 0.0), fade(INK, 0.055), fade(INK, 0.10)),
        Look::Danger => (fade(BAD, 0.0), fade(BAD, 0.10), fade(BAD, 0.16)),
        Look::Primary | Look::Ready | Look::Nav { on: true } => return None,
    })
}

fn material(look: Look) -> Material {
    match look {
        Look::Ready => READY_GLASS,
        Look::Nav { .. } => DISC_GLASS,
        _ => ACCENT_GLASS,
    }
}

impl<'a, Message: Clone> Widget<Message, iced::Theme, iced::Renderer> for Press<'a, Message> {
    fn tag(&self) -> tree::Tag { tree::Tag::of::<State>() }
    fn state(&self) -> tree::State { tree::State::new(State::default()) }
    fn children(&self) -> Vec<Tree> { vec![Tree::new(&self.content)] }
    fn diff(&self, tree: &mut Tree) { tree.diff_children(std::slice::from_ref(&self.content)) }
    fn size(&self) -> Size<Length> { Size::new(self.width, self.height) }

    fn layout(&mut self, tree: &mut Tree, renderer: &iced::Renderer, limits: &layout::Limits) -> layout::Node {
        // The content takes its own size (not the button's fixed height) and sits in the middle.
        let limits = limits.width(self.width).height(self.height);
        let content = self.content.as_widget_mut().layout(&mut tree.children[0], renderer, &limits.shrink(self.padding).loose());
        let s = content.size();
        let size = limits.resolve(self.width, self.height, Size::new(s.width + self.padding.x(), s.height + self.padding.y()));
        layout::Node::with_children(size, vec![content.move_to(Point::new((size.width - s.width) / 2.0, (size.height - s.height) / 2.0))])
    }

    fn operate(&mut self, tree: &mut Tree, layout: Layout<'_>, renderer: &iced::Renderer, operation: &mut dyn Operation) {
        self.content.as_widget_mut().operate(&mut tree.children[0], layout.children().next().unwrap(), renderer, operation)
    }

    fn update(&mut self, tree: &mut Tree, event: &Event, layout: Layout<'_>, cursor: mouse::Cursor, _renderer: &iced::Renderer, _clipboard: &mut dyn Clipboard, shell: &mut Shell<'_, Message>, _viewport: &Rectangle) {
        let enabled = self.enabled();
        let state = tree.state.downcast_mut::<State>();
        let over = enabled && cursor.is_over(layout.bounds());
        let before = (state.hover.target, state.press.target);
        if matches!(event, Event::Touch(_)) { state.touched = Some(Instant::now()) }
        match event {
            Event::Touch(touch::Event::FingerMoved { position, .. }) if state.touch.is_some() => {
                if let Some((at, slid)) = &mut state.touch && at.distance(*position) > 12.0 { *slid = true }
            }
            Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left)) | Event::Touch(touch::Event::FingerPressed { .. }) if over || (enabled && cursor.land().is_over(layout.bounds())) => {
                state.down = true;
                if let Event::Touch(touch::Event::FingerPressed { position, .. }) = event { state.touch = Some((*position, false)) }
                if let Some(m) = self.on_down.clone() { shell.publish(m) }
                shell.capture_event();
            }
            Event::Mouse(mouse::Event::ButtonReleased(mouse::Button::Left)) | Event::Touch(touch::Event::FingerLifted { .. }) if state.down => {
                state.down = false;
                // A finger lifted leaves no cursor: where it was lifted says whether it stayed on the button.
                let lifted_over = match event {
                    // A finger: a tap unless it slid away (the cursor of a lifted finger is not reliable in a scroll).
                    Event::Touch(touch::Event::FingerLifted { .. }) => enabled && state.touch.take().is_some_and(|t| !t.1),
                    _ => over,
                };
                if let Some(m) = self.on_up.clone() { shell.publish(m) }
                if lifted_over && let Some(m) = self.on_press.clone() { shell.publish(m) }
                shell.capture_event();
            }
            Event::Touch(touch::Event::FingerLost { .. }) => {
                state.down = false;
                state.touch = None;
            }
            Event::Window(window::Event::RedrawRequested(now)) => {
                let dt = state.last.map_or(1.0 / 120.0, |l| (*now - l).as_secs_f32());
                let moving = state.hover.step(dt) | state.press.step(dt);
                state.last = moving.then_some(*now);
                if moving { shell.request_redraw() }
            }
            _ => {}
        }
        // No hover on a phone: a finger leaves its cursor where it lifted, lighting what is there.
        state.hover.to(if over && !cfg!(target_os = "android") { 1.0 } else { 0.0 });
        state.press.to(if state.down && over { 1.0 } else { 0.0 });
        if (state.hover.target, state.press.target) != before {
            state.last = None;
            shell.request_redraw();
        }
    }

    fn mouse_interaction(&self, _tree: &Tree, layout: Layout<'_>, cursor: mouse::Cursor, _viewport: &Rectangle, _renderer: &iced::Renderer) -> mouse::Interaction {
        if !cursor.is_over(layout.bounds()) { mouse::Interaction::None } else if self.enabled() { mouse::Interaction::Pointer } else { mouse::Interaction::NotAllowed }
    }

    fn draw(&self, tree: &Tree, renderer: &mut iced::Renderer, theme: &iced::Theme, style: &renderer::Style, layout: Layout<'_>, cursor: mouse::Cursor, viewport: &Rectangle) {
        let state = tree.state.downcast_ref::<State>();
        let (h, p) = self.forced.unwrap_or((state.hover.value, state.press.value));
        let b = layout.bounds();
        // Pressed, the button sinks: 3% smaller around its centre.
        let s = 1.0 - 0.03 * p;
        let c = b.center();
        let scaled = Rectangle { x: c.x - b.width * s / 2.0, y: c.y - b.height * s / 2.0, width: b.width * s, height: b.height * s };
        let radius = self.radius.min(b.height / 2.0) * s;
        // What cannot be pressed says so: half its strength, and no answer to the pointer.
        let disabled = !self.enabled() && self.forced.is_none();
        let strength = if disabled { 0.45 } else { 1.0 } * self.opacity;
        match fills(self.look) {
            None => {
                let m = Material { radius, ..material(self.look) };
                glass::draw_pane(renderer, &m, scaled, cursor, h, p, strength);
            }
            Some((rest, hover, pressed)) => {
                let fill = fade(mix(mix(rest, hover, h), pressed, p), strength);
                if fill.a > 0.001 {
                    renderer.fill_quad(renderer::Quad { bounds: scaled, border: Border { radius: radius.into(), ..Border::default() }, shadow: Shadow::default(), snap: false }, Background::Color(fill));
                }
            }
        }
        let t = Transformation::translate(c.x, c.y) * Transformation::scale(s) * Transformation::translate(-c.x, -c.y);
        let content = layout.children().next().unwrap();
        renderer.with_layer(*viewport, |r| {
            r.with_transformation(t, |r| {
                let style = if disabled { renderer::Style { text_color: fade(INK3, 0.6) } } else { *style };
                self.content.as_widget().draw(&tree.children[0], r, theme, &style, content, cursor, viewport)
            })
        });
    }
}

impl<'a, Message: Clone + 'a> From<Press<'a, Message>> for Element<'a, Message> {
    fn from(p: Press<'a, Message>) -> Self { Element::new(p) }
}

/// An on/off switch whose knob glides to its side.
pub struct Switch<Message> {
    on: bool,
    on_toggle: Option<Message>,
}

pub fn switch<Message>(on: bool, on_toggle: Message) -> Switch<Message> { Switch { on, on_toggle: Some(on_toggle) } }

struct SwitchState {
    knob: Spring,
    hover: Spring,
    last: Option<Instant>,
    seen: Option<bool>,
}

impl<Message: Clone> Widget<Message, iced::Theme, iced::Renderer> for Switch<Message> {
    fn tag(&self) -> tree::Tag { tree::Tag::of::<SwitchState>() }
    fn state(&self) -> tree::State { tree::State::new(SwitchState { knob: Spring::quick(if self.on { 1.0 } else { 0.0 }), hover: Spring::quick(0.0), last: None, seen: Some(self.on) }) }
    fn size(&self) -> Size<Length> { Size::new(Length::Fixed(46.0), Length::Fixed(28.0)) }
    fn layout(&mut self, _tree: &mut Tree, _renderer: &iced::Renderer, limits: &layout::Limits) -> layout::Node { layout::atomic(limits, 46.0, 28.0) }

    fn update(&mut self, tree: &mut Tree, event: &Event, layout: Layout<'_>, cursor: mouse::Cursor, _renderer: &iced::Renderer, _clipboard: &mut dyn Clipboard, shell: &mut Shell<'_, Message>, _viewport: &Rectangle) {
        let state = tree.state.downcast_mut::<SwitchState>();
        let over = cursor.is_over(layout.bounds());
        if state.seen != Some(self.on) {
            state.seen = Some(self.on);
            state.knob.to(if self.on { 1.0 } else { 0.0 });
            state.last = None;
            shell.request_redraw();
        }
        let hover = over && !cfg!(target_os = "android");
        if state.hover.target != hover as u8 as f32 {
            state.hover.to(hover as u8 as f32);
            state.last = None;
            shell.request_redraw();
        }
        match event {
            Event::Mouse(mouse::Event::ButtonPressed(mouse::Button::Left)) | Event::Touch(touch::Event::FingerPressed { .. }) if over => {
                if let Some(m) = self.on_toggle.clone() { shell.publish(m) }
                shell.capture_event();
            }
            Event::Window(window::Event::RedrawRequested(now)) => {
                let dt = state.last.map_or(1.0 / 120.0, |l| (*now - l).as_secs_f32());
                let moving = state.knob.step(dt) | state.hover.step(dt);
                state.last = moving.then_some(*now);
                if moving { shell.request_redraw() }
            }
            _ => {}
        }
    }

    fn mouse_interaction(&self, _tree: &Tree, layout: Layout<'_>, cursor: mouse::Cursor, _viewport: &Rectangle, _renderer: &iced::Renderer) -> mouse::Interaction {
        if cursor.is_over(layout.bounds()) { mouse::Interaction::Pointer } else { mouse::Interaction::None }
    }

    fn draw(&self, tree: &Tree, renderer: &mut iced::Renderer, _theme: &iced::Theme, _style: &renderer::Style, layout: Layout<'_>, _cursor: mouse::Cursor, _viewport: &Rectangle) {
        let state = tree.state.downcast_ref::<SwitchState>();
        let (k, h) = (state.knob.value, state.hover.value);
        let b = layout.bounds();
        // Off, a veil of ink that reads on any glass; on, the accent.
        let track = mix(fade(INK, 0.14 + 0.06 * h), mix(ACC, ACC_INK, 0.25 * h), k);
        renderer.fill_quad(renderer::Quad { bounds: b, border: Border { radius: 14.0.into(), ..Border::default() }, ..renderer::Quad::default() }, Background::Color(track));
        let d = 22.0;
        let x = b.x + 3.0 + (b.width - d - 6.0) * k;
        renderer.fill_quad(
            renderer::Quad {
                bounds: Rectangle { x, y: b.y + 3.0, width: d, height: d },
                border: Border { radius: (d / 2.0).into(), ..Border::default() },
                shadow: Shadow { color: Color { a: 0.22, ..INK }, offset: Vector::new(0.0, 1.5), blur_radius: 4.0 },
                snap: false,
            },
            Background::Color(SHEET),
        );
    }
}

impl<'a, Message: Clone + 'a> From<Switch<Message>> for Element<'a, Message> {
    fn from(s: Switch<Message>) -> Self { Element::new(s) }
}
