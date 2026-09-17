use super::*;

/// Navigation stores locations, never copies of mutable API data.
#[derive(Clone, PartialEq)]
pub(super) struct Location {
    page: String,
    case: String,
    profile_mode: String,
    profile_filter: (String, String, String),
    editing: bool,
    profile_case: bool,
}
/// Horizontal trackpad travel since the fingers last paused, so one swipe navigates once.
#[derive(Default)]
pub(super) struct Swipe {
    x: f32,
    y: f32,
    last: Option<std::time::Instant>,
    fired: bool,
}
/// Fingers must travel about this far sideways (in scroll pixels) before the history moves.
const SWIPE_DISTANCE: f32 = 200.;
/// A pause this long between scroll frames starts a fresh swipe.
const SWIPE_GAP: std::time::Duration = std::time::Duration::from_millis(250);

impl Cubix {
    /// Two fingers sliding sideways on the trackpad walk the history: left goes back, right goes
    /// forward. Only continuous (pixel) deltas count, so a mouse wheel never navigates, and a
    /// mostly vertical swipe is left to the scroll containers.
    pub(super) fn swipe(
        &mut self,
        event: &ScrollWheelEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let ScrollDelta::Pixels(delta) = event.delta else {
            return;
        };
        let now = std::time::Instant::now();
        if self
            .swipe
            .last
            .is_none_or(|last| now.duration_since(last) > SWIPE_GAP)
        {
            self.swipe = Swipe::default();
        }
        self.swipe.last = Some(now);
        self.swipe.x += f32::from(delta.x);
        self.swipe.y += f32::from(delta.y);
        if self.swipe.fired
            || self.swipe.x.abs() < SWIPE_DISTANCE
            || self.swipe.x.abs() < self.swipe.y.abs() * 1.5
        {
            return;
        }
        self.swipe.fired = true;
        // With natural scrolling the delta follows the content, so fingers moving left give a positive x.
        self.travel(self.swipe.x > 0., window, cx);
    }
    pub(super) fn location(&self) -> Location {
        Location {
            page: self.page.clone(),
            case: self.case_id.clone(),
            profile_mode: self.profile_mode.clone(),
            profile_filter: self.profile_filter.clone(),
            editing: self.editing,
            profile_case: self.overlay == "profileCase",
        }
    }
    pub(super) fn record_navigation(&mut self, previous: Location) {
        if previous != self.location() {
            self.back_stack.push(previous);
            if self.back_stack.len() > 200 {
                self.back_stack.remove(0);
            }
            self.forward_stack.clear();
        }
    }
    pub(super) fn travel(&mut self, back: bool, window: &mut Window, cx: &mut Context<Self>) {
        if self.timer.read(cx).phase != Phase::Idle || self.saving {
            return;
        }
        // Transient menus close before navigating, just as Escape does.
        if !self.overlay.is_empty() && self.overlay != "profileCase" {
            self.overlay.clear();
            cx.notify();
            return;
        }
        let next = if back {
            self.back_stack.pop()
        } else {
            self.forward_stack.pop()
        };
        let Some(next) = next else {
            return;
        };
        let current = self.location();
        if back {
            self.forward_stack.push(current);
        } else {
            self.back_stack.push(current);
        }
        self.page = next.page;
        self.case_id = next.case;
        self.profile_mode = next.profile_mode;
        self.profile_filter = next.profile_filter;
        self.editing = next.editing;
        self.overlay = if next.profile_case {
            "profileCase".into()
        } else {
            String::new()
        };
        self.show_cases = self.page == "training" && self.width >= 1024.;
        self.show_times = self.show_cases;
        self.error.clear();
        self.refresh();
        self.focus.focus(window);
        cx.notify();
    }
}
