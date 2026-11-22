//! The timer, independent of any input (src/client/lib/practiceTimer.ts): keys, touches and devices call it with the
//! moment they happened, and the app calls `tick` every frame while `needs_ticks`.
use crate::time::{Penalty, to_hundredths};
use std::time::{Duration, Instant};

pub const HOLD: Duration = Duration::from_millis(300);
/// WCA inspection: 15 seconds, then a +2 until 17, a DNF after (regulations A3a1, A3d1).
pub const INSPECTION: Duration = Duration::from_secs(15);
pub const INSPECTION_DNF: Duration = Duration::from_secs(17);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase {
    Idle,
    Inspecting,
    Holding,
    Ready,
    Running,
    Stopped,
}

/// A solve the timer ended: its time to the hundredth and the penalty of its inspection.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Stop {
    pub ms: u64,
    pub penalty: Penalty,
}

#[derive(Debug)]
pub struct Timer {
    pub phase: Phase,
    pub inspection: bool,
    /// How long a hold lasts before the timer is ready.
    pub hold: Duration,
    started: Option<Instant>,
    inspected: Option<Instant>,
    held: Option<Instant>,
    elapsed: u64,
    penalty: Penalty,
}

impl Timer {
    pub fn new(inspection: bool) -> Self {
        Self { phase: Phase::Idle, inspection, hold: HOLD, started: None, inspected: None, held: None, elapsed: 0, penalty: Penalty::None }
    }

    /// A key pressed (not a repeat), a touch down: stops a running solve, begins an inspection, or holds.
    pub fn press(&mut self, at: Instant) -> Option<Stop> {
        match self.phase {
            Phase::Running => Some(self.stop(at)),
            Phase::Idle | Phase::Stopped if self.inspection => {
                self.phase = Phase::Inspecting;
                self.inspected = Some(at);
                self.elapsed = 0;
                self.penalty = Penalty::None;
                None
            }
            Phase::Idle | Phase::Stopped | Phase::Inspecting => {
                self.phase = Phase::Holding;
                self.held = Some(at);
                None
            }
            Phase::Holding | Phase::Ready => None,
        }
    }

    /// The key or the touch let go: a hold long enough starts the solve, a short one goes back to rest.
    pub fn release(&mut self, at: Instant) -> Option<Stop> {
        match self.phase {
            Phase::Holding => {
                self.phase = self.rest();
                None
            }
            Phase::Ready => self.start(at),
            _ => None,
        }
    }

    /// Lets go of a hold without starting (the pointer left the stage, the window lost focus).
    pub fn cancel(&mut self) {
        if matches!(self.phase, Phase::Holding | Phase::Ready) { self.phase = self.rest() }
    }

    /// Moves time on: a hold becomes ready, an inspection past 17 seconds ends the attempt as a DNF.
    pub fn tick(&mut self, at: Instant) -> Option<Stop> {
        if self.phase == Phase::Holding && self.held.is_some_and(|h| at - h >= self.hold) { self.phase = Phase::Ready }
        if self.inspected.is_some_and(|i| at - i > INSPECTION_DNF) && matches!(self.phase, Phase::Inspecting | Phase::Holding | Phase::Ready) {
            return Some(self.expire());
        }
        None
    }

    /// Whether the timer changes on its own and wants `tick` every frame.
    pub fn needs_ticks(&self) -> bool { matches!(self.phase, Phase::Inspecting | Phase::Holding | Phase::Ready | Phase::Running) }

    /// The time shown: the running time, or the last one.
    pub fn elapsed(&self, at: Instant) -> u64 {
        match (self.phase, self.started) {
            (Phase::Running, Some(s)) => to_hundredths((at - s).as_millis() as u64),
            _ => self.elapsed,
        }
    }

    /// Whole seconds of inspection gone, while one runs.
    pub fn inspection_elapsed(&self, at: Instant) -> Option<Duration> {
        self.inspected.filter(|_| matches!(self.phase, Phase::Inspecting | Phase::Holding | Phase::Ready)).map(|i| at - i)
    }

    pub fn reset(&mut self) {
        let hold = self.hold;
        *self = Self::new(self.inspection);
        self.hold = hold;
    }

    fn rest(&self) -> Phase { if self.inspected.is_some() { Phase::Inspecting } else { Phase::Idle } }

    fn start(&mut self, at: Instant) -> Option<Stop> {
        self.penalty = match self.inspected.map(|i| at - i) {
            Some(d) if d > INSPECTION_DNF => return Some(self.expire()),
            Some(d) if d > INSPECTION => Penalty::Plus2,
            _ => Penalty::None,
        };
        self.inspected = None;
        self.phase = Phase::Running;
        self.started = Some(at);
        None
    }

    fn stop(&mut self, at: Instant) -> Stop {
        self.elapsed = self.elapsed(at);
        self.phase = Phase::Stopped;
        Stop { ms: self.elapsed, penalty: self.penalty }
    }

    fn expire(&mut self) -> Stop {
        self.inspected = None;
        self.elapsed = 0;
        self.penalty = Penalty::Dnf;
        self.phase = Phase::Stopped;
        Stop { ms: 0, penalty: Penalty::Dnf }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const MS: fn(u64) -> Duration = Duration::from_millis;

    #[test]
    fn hold_release_stop() {
        let t0 = Instant::now();
        let mut t = Timer::new(false);
        t.press(t0);
        t.tick(t0 + MS(100));
        assert_eq!(t.phase, Phase::Holding);
        assert_eq!(t.release(t0 + MS(150)), None);
        assert_eq!(t.phase, Phase::Idle, "a short hold goes back to rest");
        t.press(t0 + MS(200));
        t.tick(t0 + MS(520));
        assert_eq!(t.phase, Phase::Ready);
        t.release(t0 + MS(600));
        assert_eq!(t.phase, Phase::Running);
        assert_eq!(t.press(t0 + MS(12_947)), Some(Stop { ms: 12_340, penalty: Penalty::None }));
        assert_eq!(t.release(t0 + MS(13_000)), None, "the stop's release does not start again");
        assert_eq!(t.phase, Phase::Stopped);
    }

    #[test]
    fn inspection_penalties() {
        let t0 = Instant::now();
        let mut t = Timer::new(true);
        t.press(t0);
        assert_eq!(t.phase, Phase::Inspecting);
        t.press(t0 + MS(15_500));
        t.tick(t0 + MS(15_900));
        t.release(t0 + MS(16_000));
        assert_eq!(t.press(t0 + MS(26_000)), Some(Stop { ms: 10_000, penalty: Penalty::Plus2 }));

        let mut t = Timer::new(true);
        t.press(t0);
        assert_eq!(t.tick(t0 + MS(17_001)), Some(Stop { ms: 0, penalty: Penalty::Dnf }));
        assert!(!t.needs_ticks());
    }
}
