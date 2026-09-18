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
    /// Casual timing: the hint says the time will not be recorded.
    pub unsaved: bool,
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
            unsaved: false,
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
/// A time typed by hand, in ms. Bare digits read from the right like csTimer ("1234" → 12.34,
/// "12345" → 1:23.45); otherwise "12.34", "1:23.45" or "1:02:03.4". Mirrors `parseTypedTime`.
pub fn parse_typed(text: &str) -> Option<f64> {
    let value = text.trim().replacen(',', ".", 1);
    let digits = |s: &str| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit());
    let ms = if digits(&value) {
        let n: u64 = value.parse().ok()?;
        (n / 1_000_000 * 3600 + n / 10_000 % 100 * 60 + n / 100 % 100) * 1000 + n % 100 * 10
    } else {
        let (whole, fraction) = value.split_once('.').unwrap_or((&value, ""));
        let mut units: Vec<&str> = whole.split(':').collect();
        let seconds = units.pop()?;
        if units.len() > 2
            || units.iter().any(|unit| !digits(unit))
            || !(seconds.is_empty() || digits(seconds))
            || !(fraction.is_empty() || digits(fraction))
            || seconds.is_empty() && fraction.is_empty()
        {
            return None;
        }
        let mut total: u64 = 0;
        for unit in units.iter().copied().chain([if seconds.is_empty() { "0" } else { seconds }]) {
            total = total.checked_mul(60)?.checked_add(unit.parse().ok()?)?;
        }
        let millis: u64 = format!("{:0<3.3}", fraction).parse().ok()?;
        total.checked_mul(1000)?.checked_add(millis)?
    };
    (ms > 0 && ms < 36_000_000).then_some(ms as f64)
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
                _ if self.unsaved => {
                    if self.compact {
                        "Not saved · hold, then release to start"
                    } else {
                        "Not saved · hold Space, release to start"
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
#[cfg(test)]
mod tests {
    use super::parse_typed;

    #[test]
    fn typed_times() {
        for (text, ms) in [
            ("1234", 12340.),
            ("90", 900.),
            ("12345", 83450.),
            ("1020345", 3723450.),
            ("12.34", 12340.),
            (" 12,3 ", 12300.),
            (".5", 500.),
            ("9.8765", 9876.),
            ("1:23.45", 83450.),
            ("1:5", 65000.),
            ("1:02:03.4", 3723400.),
        ] {
            assert_eq!(parse_typed(text), Some(ms), "{text}");
        }
        for text in ["", "0", "0.00", ".", "1:", ":5", "12.3.4", "abc", "-5", "99999999999"] {
            assert_eq!(parse_typed(text), None, "{text}");
        }
    }
}
