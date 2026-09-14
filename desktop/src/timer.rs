use crate::theme::Theme;
use gpui::{prelude::*, *};
use std::time::{Duration, Instant};
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Phase {
    Idle,
    Holding,
    Ready,
    Running,
}
pub struct Stopped(pub f64);
pub struct PhaseChanged;
impl EventEmitter<PhaseChanged> for Timer {}
pub struct Timer {
    pub phase: Phase,
    pub enabled: bool,
    pub elapsed: f64,
    start: Instant,
    pub theme: Theme,
    pub font_size: f32,
    pub compact: bool,
    epoch: u64,
}
impl EventEmitter<Stopped> for Timer {}
impl Timer {
    pub fn new() -> Self {
        Self {
            phase: Phase::Idle,
            enabled: true,
            elapsed: 0.,
            start: Instant::now(),
            theme: Theme::new("t3-code", false),
            font_size: 89.6,
            compact: false,
            epoch: 0,
        }
    }
    pub fn reset(&mut self, cx: &mut Context<Self>) {
        self.phase = Phase::Idle;
        cx.emit(PhaseChanged);
        self.elapsed = 0.;
        self.epoch += 1;
        cx.notify();
    }
    pub fn press(&mut self, cx: &mut Context<Self>) {
        if !self.enabled && self.phase != Phase::Running {
            return;
        }
        if self.phase == Phase::Running {
            self.elapsed = self.start.elapsed().as_secs_f64() * 1000.;
            self.phase = Phase::Idle;
            cx.emit(PhaseChanged);
            self.epoch += 1;
            cx.emit(Stopped(self.elapsed));
            cx.notify();
        } else if self.phase == Phase::Idle {
            self.phase = Phase::Holding;
            self.epoch += 1;
            let epoch = self.epoch;
            cx.notify();
            cx.spawn(async move |this, cx| {
                cx.background_executor()
                    .timer(Duration::from_millis(300))
                    .await;
                let _ = this.update(cx, |s, cx| {
                    if s.epoch == epoch && s.phase == Phase::Holding {
                        s.phase = Phase::Ready;
                        cx.notify();
                    }
                });
            })
            .detach();
        }
    }
    pub fn release(&mut self, cx: &mut Context<Self>) {
        if self.phase == Phase::Ready {
            self.phase = Phase::Running;
            cx.emit(PhaseChanged);
            self.start = Instant::now();
            self.epoch += 1;
            let epoch = self.epoch;
            cx.notify();
            cx.spawn(async move |this, cx| {
                loop {
                    cx.background_executor()
                        .timer(Duration::from_millis(16))
                        .await;
                    let keep = this
                        .update(cx, |s, cx| {
                            if s.phase != Phase::Running || s.epoch != epoch {
                                return false;
                            }
                            s.elapsed = s.start.elapsed().as_secs_f64() * 1000.;
                            cx.notify();
                            true
                        })
                        .unwrap_or(false);
                    if !keep {
                        break;
                    }
                }
            })
            .detach();
        } else if self.phase == Phase::Holding {
            self.phase = Phase::Idle;
            cx.emit(PhaseChanged);
            self.epoch += 1;
            cx.notify();
        }
    }
}
pub fn time(ms: f64) -> String {
    if !ms.is_finite() {
        return "DNF".into();
    }
    let ms = ms.max(0.);
    let minutes = (ms / 60000.).floor() as u64;
    let seconds = (ms % 60000.) / 1000.;
    if minutes > 0 {
        format!("{minutes}:{seconds:05.2}")
    } else {
        format!("{seconds:.2}")
    }
}
impl Render for Timer {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let color = match self.phase {
            Phase::Holding => self.theme.danger,
            Phase::Ready => self.theme.good,
            _ => self.theme.accent,
        };
        let hint = if !self.enabled {
            "Select cases to begin"
        } else {
            match self.phase {
                Phase::Holding => "Keep holding…",
                Phase::Ready => "Release to start",
                Phase::Running => {
                    if self.compact {
                        "Tap to stop"
                    } else {
                        "Any key to stop"
                    }
                }
                _ => {
                    if self.compact {
                        "Hold, then release to start"
                    } else {
                        "Hold Space, release to start"
                    }
                }
            }
        };
        div()
            .id("timer")
            .w_full()
            .flex()
            .flex_col()
            .items_center()
            .pt(px(38.))
            .pb(px(8.))
            .cursor_pointer()
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(|s, _, _, cx| {
                    if s.compact || s.phase == Phase::Running {
                        s.press(cx);
                    }
                }),
            )
            .on_mouse_up(MouseButton::Left, cx.listener(|s, _, _, cx| s.release(cx)))
            .child(
                div()
                    .flex()
                    .font_family("Geist Mono")
                    .font_weight(FontWeight(550.))
                    .text_size(px(self.font_size))
                    .line_height(px(self.font_size * 1.1))
                    .text_color(color)
                    .children(
                        (if matches!(self.phase, Phase::Holding | Phase::Ready) {
                            "0.00".to_owned()
                        } else {
                            time(self.elapsed)
                        })
                        .chars()
                        .map(|ch| {
                            div()
                                .flex_none()
                                .w(px(self.font_size * 0.5601))
                                .child(ch.to_string())
                        }),
                    ),
            )
            .child(
                div()
                    .mt(px(if self.compact { 6. } else { 10. }))
                    .h(px(20.))
                    .text_size(px(if self.compact { 12. } else { 13. }))
                    .text_color(self.theme.muted)
                    .child(hint),
            )
    }
}
