use super::*;

/// Navigation stores locations, never copies of mutable API data.
#[derive(Clone, PartialEq)]
pub(super) struct Location {
    page: String,
    case: String,
    profile: String,
    peer: String,
    profile_mode: String,
    profile_filter: (String, String, String),
    editing: bool,
    profile_case: bool,
}
impl Cubix {
    pub(super) fn location(&self) -> Location {
        Location {
            page: self.page.clone(),
            case: self.case_id.clone(),
            profile: self.profile_user.clone(),
            peer: self.peer.clone(),
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
        self.profile_user = next.profile;
        self.peer = next.peer;
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
