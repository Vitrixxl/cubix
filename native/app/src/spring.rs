//! A damped spring: every animation of the app is one, so a motion changed halfway carries on from where it is, at
//! the speed it had, instead of jumping or restarting.

#[derive(Clone, Copy, Debug)]
pub struct Spring {
    pub value: f32,
    velocity: f32,
    pub target: f32,
    stiffness: f32,
    damping: f32,
}

impl Spring {
    /// Stiffness and damping ratio (1 is critical: no overshoot; below it, a small settle).
    pub const fn with(value: f32, stiffness: f32, ratio: f32) -> Self {
        // 2·ratio·√k, with √k by Newton's method for a const fn.
        let mut s = stiffness / 2.0;
        let mut i = 0;
        while i < 12 {
            s = 0.5 * (s + stiffness / s);
            i += 1;
        }
        Self { value, velocity: 0.0, target: value, stiffness, damping: 2.0 * ratio * s }
    }

    /// Surfaces that move (drawer, menus, focus): smooth, a hint of settle.
    pub const fn smooth(value: f32) -> Self { Self::with(value, 210.0, 0.88) }

    /// Hover and press: quick and firm.
    pub const fn quick(value: f32) -> Self { Self::with(value, 620.0, 0.92) }

    pub fn to(&mut self, target: f32) { self.target = target }

    pub fn set(&mut self, value: f32) {
        self.value = value;
        self.target = value;
        self.velocity = 0.0;
    }

    pub fn settled(&self) -> bool { self.value == self.target && self.velocity == 0.0 }

    /// Moves on by `dt` seconds; returns whether it still moves.
    pub fn step(&mut self, dt: f32) -> bool {
        if self.settled() { return false }
        let mut left = dt.min(1.0 / 20.0);
        while left > 0.0 {
            let h = left.min(1.0 / 480.0);
            let force = -self.stiffness * (self.value - self.target) - self.damping * self.velocity;
            self.velocity += force * h;
            self.value += self.velocity * h;
            left -= h;
        }
        if (self.value - self.target).abs() < 0.0004 && self.velocity.abs() < 0.004 {
            self.value = self.target;
            self.velocity = 0.0;
        }
        !self.settled()
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn settles_on_target() {
        let mut s = super::Spring::smooth(0.0);
        s.to(1.0);
        let mut frames = 0;
        while s.step(1.0 / 120.0) {
            frames += 1;
            assert!(s.value < 1.08, "overshoots by {}", s.value - 1.0);
        }
        assert_eq!(s.value, 1.0);
        assert!(frames < 120, "takes {frames} frames");
    }
}
