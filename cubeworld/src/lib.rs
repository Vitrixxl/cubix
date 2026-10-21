//! The cube's world, an easter egg (desktop/renderer/CubeWorld.tsx): a 3×3 that falls, bounces and rolls in an arena,
//! turned as the player turns their smart cube (`hold`) and kicked by each of its turns (`turn`), drawn here into the
//! RGBA pixels the page puts on a canvas.
//!
//! The world's axes are the player's (x to the right, y up, z toward them), a cubie is 1 wide: the cube is 3 wide, its
//! centre 1.5 above the floor when it lies on it. Its inertia is the same about every axis (a cube's), a number.
use std::cell::RefCell;
use std::ops::{Add, Mul, Neg, Sub};

#[derive(Clone, Copy, Default, Debug, PartialEq)]
struct V(f32, f32, f32);
impl Add for V {
    type Output = V;
    fn add(self, o: V) -> V { V(self.0 + o.0, self.1 + o.1, self.2 + o.2) }
}
impl Sub for V {
    type Output = V;
    fn sub(self, o: V) -> V { V(self.0 - o.0, self.1 - o.1, self.2 - o.2) }
}
impl Mul<f32> for V {
    type Output = V;
    fn mul(self, k: f32) -> V { V(self.0 * k, self.1 * k, self.2 * k) }
}
impl Neg for V {
    type Output = V;
    fn neg(self) -> V { self * -1.0 }
}
impl V {
    fn dot(self, o: V) -> f32 { self.0 * o.0 + self.1 * o.1 + self.2 * o.2 }
    fn cross(self, o: V) -> V { V(self.1 * o.2 - self.2 * o.1, self.2 * o.0 - self.0 * o.2, self.0 * o.1 - self.1 * o.0) }
    fn len(self) -> f32 { self.dot(self).sqrt() }
    fn unit(self) -> V { self * (1.0 / self.len().max(1e-9)) }
    fn axis(i: usize) -> V { [V(1.0, 0.0, 0.0), V(0.0, 1.0, 0.0), V(0.0, 0.0, 1.0)][i] }
    fn at(self, i: usize) -> f32 { [self.0, self.1, self.2][i] }
}

/// A rotation, [w, x, y, z].
#[derive(Clone, Copy, Debug)]
struct Q(f32, f32, f32, f32);
impl Q {
    fn around(axis: V, angle: f32) -> Q {
        let (s, c) = (angle / 2.0).sin_cos();
        Q(c, axis.0 * s, axis.1 * s, axis.2 * s)
    }
    /// `self` after `o`.
    fn then(self, o: Q) -> Q {
        let Q(aw, ax, ay, az) = self;
        let Q(bw, bx, by, bz) = o;
        Q(
            aw * bw - ax * bx - ay * by - az * bz,
            aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
        )
    }
    fn inverse(self) -> Q { Q(self.0, -self.1, -self.2, -self.3) }
    fn unit(self) -> Q {
        let n = (self.0 * self.0 + self.1 * self.1 + self.2 * self.2 + self.3 * self.3).sqrt().max(1e-9);
        Q(self.0 / n, self.1 / n, self.2 / n, self.3 / n)
    }
    fn rotate(self, v: V) -> V {
        let u = V(self.1, self.2, self.3);
        let t = u.cross(v) * 2.0;
        v + t * self.0 + u.cross(t)
    }
    /// The rotation as one vector: its axis, as long as its angle (the short way round).
    fn vector(self) -> V {
        let q = if self.0 < 0.0 { Q(-self.0, -self.1, -self.2, -self.3) } else { self };
        let s = V(q.1, q.2, q.3).len();
        if s < 1e-7 { V(q.1, q.2, q.3) * 2.0 } else { V(q.1, q.2, q.3) * (2.0 * s.atan2(q.0) / s) }
    }
}

const GRAVITY: f32 = 30.0;
const MASS: f32 = 1.0;
/// A solid cube's, 3 wide: m s² / 6.
const INERTIA: f32 = MASS * 9.0 / 6.0;
const HALF: f32 = 1.5;
/// The arena's walls, this far from its centre.
const ARENA: f32 = 10.0;
/// How hard the cube follows the held cube's orientation, and how much its spin is damped toward the held one's.
const FOLLOW: f32 = 55.0;
const FOLLOW_DAMPING: f32 = 11.0;
const FRICTION: f32 = 0.6;
const BOUNCE: f32 = 0.35;
/// A turn's kick: the cube hops, and spins against the layer it turned.
const HOP: f32 = 7.0;
const RECOIL: f32 = 3.5;
const STEP: f32 = 1.0 / 240.0;
const TURN_SECONDS: f32 = 0.13;

/// A face turn being drawn: its layer starts `from` radians back and comes to rest.
struct Turn {
    axis: usize,
    layer: f32,
    from: f32,
    t: f32,
}

struct World {
    width: usize,
    height: usize,
    pixels: Vec<u8>,
    depth: Vec<f32>,
    /// 54 stickers, 7 numbers each: the cubie's centre, the sticker's normal (in the cube's own axes) and its colour,
    /// 0xRRGGBB. The page writes them (`stickers`).
    stickers: [f32; 54 * 7],
    pos: V,
    vel: V,
    q: Q,
    spin: V,
    /// How the player holds their cube, and how fast they turn it.
    held: Option<Q>,
    held_spin: V,
    since_held: f32,
    turn: Option<Turn>,
    look: V,
    rest: f32,
    seed: u32,
}

impl World {
    fn new() -> World {
        World {
            width: 0,
            height: 0,
            pixels: Vec::new(),
            depth: Vec::new(),
            stickers: [0.0; 54 * 7],
            pos: V(0.0, 16.0, 0.0),
            vel: V(0.0, 0.0, 0.0),
            q: Q::around(V(1.0, 0.0, 1.0).unit(), 0.5),
            spin: V(2.0, 1.0, -1.5),
            held: None,
            held_spin: V::default(),
            since_held: 0.0,
            turn: None,
            look: V(0.0, 1.5, 0.0),
            rest: 0.0,
            seed: 0x9e37_79b9,
        }
    }

    fn random(&mut self) -> f32 {
        self.seed ^= self.seed << 13;
        self.seed ^= self.seed >> 17;
        self.seed ^= self.seed << 5;
        self.seed as f32 / u32::MAX as f32
    }

    fn push(&mut self, impulse: V, at: V) {
        self.vel = self.vel + impulse * (1.0 / MASS);
        self.spin = self.spin + at.cross(impulse) * (1.0 / INERTIA);
    }

    fn step(&mut self, dt: f32) {
        self.vel.1 -= GRAVITY * dt;
        if let Some(held) = self.held {
            let error = held.then(self.q.inverse()).vector();
            let torque = error * FOLLOW + (self.held_spin - self.spin) * FOLLOW_DAMPING;
            self.spin = self.spin + torque * (dt / INERTIA);
        }
        self.vel = self.vel * (1.0 - 0.1 * dt);
        self.spin = self.spin * (1.0 - 0.3 * dt);
        self.pos = self.pos + self.vel * dt;
        let w = self.spin;
        let dq = Q(0.0, w.0, w.1, w.2).then(self.q);
        self.q = Q(self.q.0 + dq.0 * dt / 2.0, self.q.1 + dq.1 * dt / 2.0, self.q.2 + dq.2 * dt / 2.0, self.q.3 + dq.3 * dt / 2.0).unit();
        self.collide();
    }

    /// Each corner against the floor and the walls: an impulse stopping it going in, with friction along the surface.
    fn collide(&mut self) {
        const PLANES: [(V, f32); 5] = [
            (V(0.0, 1.0, 0.0), 0.0),
            (V(1.0, 0.0, 0.0), -ARENA),
            (V(-1.0, 0.0, 0.0), -ARENA),
            (V(0.0, 0.0, 1.0), -ARENA),
            (V(0.0, 0.0, -1.0), -ARENA),
        ];
        for pass in 0..3 {
            for corner in 0..8 {
                let local = V(
                    if corner & 1 == 0 { -HALF } else { HALF },
                    if corner & 2 == 0 { -HALF } else { HALF },
                    if corner & 4 == 0 { -HALF } else { HALF },
                );
                let r = self.q.rotate(local);
                for (n, offset) in PLANES {
                    let gap = n.dot(self.pos + r) - offset;
                    if gap >= 0.0 {
                        continue;
                    }
                    self.pos = self.pos + n * (-gap * 0.4);
                    let going = (self.vel + self.spin.cross(r)).dot(n);
                    if going >= 0.0 {
                        continue;
                    }
                    let rn = r.cross(n);
                    let bounce = if pass == 0 && going < -3.0 { BOUNCE } else { 0.0 };
                    let j = -(1.0 + bounce) * going / (1.0 / MASS + rn.dot(rn) / INERTIA);
                    self.push(n * j, r);
                    let v = self.vel + self.spin.cross(r);
                    let slide = v - n * v.dot(n);
                    let speed = slide.len();
                    if speed > 1e-5 {
                        let t = slide * (1.0 / speed);
                        let rt = r.cross(t);
                        let jt = (speed / (1.0 / MASS + rt.dot(rt) / INERTIA)).min(FRICTION * j);
                        self.push(t * -jt, r);
                    }
                }
            }
        }
    }

    fn advance(&mut self, dt: f32) {
        let dt = dt.clamp(0.0, 0.05);
        self.since_held += dt;
        if self.since_held > 0.15 {
            self.held_spin = self.held_spin * 0.8;
        }
        if let Some(turn) = &mut self.turn {
            turn.t += dt / TURN_SECONDS;
            if turn.t >= 1.0 {
                self.turn = None;
            }
        }
        self.rest += dt;
        while self.rest >= STEP {
            self.rest -= STEP;
            self.step(STEP);
        }
        // Behind the cube, it looks a little lazily.
        let to = V(self.pos.0 * 0.6, 1.5 + (self.pos.1 - 1.5).max(0.0) * 0.25, self.pos.2 * 0.4);
        self.look = self.look + (to - self.look) * (1.0 - (-dt * 4.0).exp());
    }

    fn render(&mut self) {
        let (w, h) = (self.width, self.height);
        if w == 0 || h == 0 {
            return;
        }
        let eye = self.look + V(0.0, 7.0, 14.0);
        let fwd = (self.look - eye).unit();
        let right = fwd.cross(V(0.0, 1.0, 0.0)).unit();
        let up = right.cross(fwd);
        let focal = h as f32 * 0.5 / (25.0f32.to_radians()).tan();
        let (cx, cy) = (w as f32 / 2.0, h as f32 / 2.0);
        self.background(eye, fwd, right, up, focal);
        self.depth.iter_mut().for_each(|d| *d = 0.0);

        let light = V(-0.45, 1.0, 0.6).unit();
        let project = |p: V| -> Option<(f32, f32, f32)> {
            let d = p - eye;
            let z = d.dot(fwd);
            if z < 0.1 {
                return None;
            }
            Some((cx + d.dot(right) / z * focal, cy - d.dot(up) / z * focal, 1.0 / z))
        };
        let turn = self.turn.as_ref().map(|t| {
            let e = 1.0 - (1.0 - t.t.min(1.0)).powi(3);
            (t.axis, t.layer, Q::around(V::axis(t.axis), t.from * (1.0 - e)))
        });
        // A cubie's own turn, then the cube's.
        let place = |centre: V| -> Q {
            match turn {
                Some((axis, layer, q)) if (centre.at(axis) - layer).abs() < 0.5 => self.q.then(q),
                _ => self.q,
            }
        };
        let mut quads: Vec<([V; 4], V, u32)> = Vec::with_capacity(26 * 6 + 54);
        let face = |centre: V, n: V, half: f32, out: f32| -> [V; 4] {
            let u = if n.0.abs() > 0.5 { V(0.0, 1.0, 0.0) } else { V(1.0, 0.0, 0.0) };
            let v = n.cross(u);
            let c = centre + n * out;
            [c + (u + v) * half, c + (u - v) * half, c - (u + v) * half, c - (u - v) * half]
        };
        for i in 0..27 {
            let centre = V((i % 3) as f32 - 1.0, ((i / 3) % 3) as f32 - 1.0, (i / 9) as f32 - 1.0);
            if centre == V::default() {
                continue;
            }
            let q = place(centre);
            for axis in 0..3 {
                for sign in [-1.0, 1.0] {
                    let n = V::axis(axis) * sign;
                    let corners = face(centre, n, 0.49, 0.49).map(|c| self.pos + q.rotate(c));
                    quads.push((corners, q.rotate(n), 0x16161c));
                }
            }
        }
        for s in self.stickers.chunks_exact(7) {
            let (centre, n) = (V(s[0], s[1], s[2]), V(s[3], s[4], s[5]));
            let q = place(centre);
            let corners = face(centre, n, 0.42, 0.495).map(|c| self.pos + q.rotate(c));
            quads.push((corners, q.rotate(n), s[6] as u32));
        }
        for (corners, n, rgb) in quads {
            let middle = (corners[0] + corners[2]) * 0.5;
            if n.dot(middle - eye) >= 0.0 {
                continue;
            }
            let shade = 0.42 + 0.58 * n.dot(light).max(0.0);
            let colour = [(rgb >> 16) as f32 * shade, ((rgb >> 8) & 255) as f32 * shade, (rgb & 255) as f32 * shade].map(|c| c.min(255.0) as u8);
            let Some(p) = corners.iter().map(|&c| project(c)).collect::<Option<Vec<_>>>() else { continue };
            self.triangle(p[0], p[1], p[2], colour);
            self.triangle(p[0], p[2], p[3], colour);
        }
    }

    /// The sky, and the floor with its tiles, the cube's shadow and the haze far off: a ray per pixel.
    fn background(&mut self, eye: V, fwd: V, right: V, up: V, focal: f32) {
        let (w, h) = (self.width, self.height);
        let shadow_radius = 2.4 + self.pos.1 * 0.12;
        let shadow_strength = 0.5 / (1.0 + (self.pos.1 - HALF).max(0.0) * 0.25);
        let (sky_top, horizon) = (V(34.0, 30.0, 84.0), V(255.0, 176.0, 196.0));
        for y in 0..h {
            let row = fwd + up * ((h as f32 / 2.0 - y as f32) / focal);
            for x in 0..w {
                let d = row + right * ((x as f32 - w as f32 / 2.0) / focal);
                let colour = if d.1 < 0.0 {
                    let t = -eye.1 / d.1;
                    let (px, pz) = (eye.0 + d.0 * t, eye.2 + d.2 * t);
                    let mut c = if px.abs() > ARENA || pz.abs() > ARENA {
                        V(126.0, 104.0, 168.0)
                    } else if px.abs() > ARENA - 0.25 || pz.abs() > ARENA - 0.25 {
                        V(255.0, 255.0, 255.0)
                    } else if ((px / 2.0).floor() + (pz / 2.0).floor()) as i32 & 1 == 0 {
                        V(240.0, 234.0, 255.0)
                    } else {
                        V(210.0, 200.0, 246.0)
                    };
                    let (dx, dz) = (px - self.pos.0, pz - self.pos.2);
                    let near = 1.0 - (dx * dx + dz * dz) / (shadow_radius * shadow_radius);
                    if near > 0.0 {
                        c = c * (1.0 - shadow_strength * near.min(1.0).sqrt());
                    }
                    let haze = 1.0 - (-t * 0.018).exp();
                    c + (horizon - c) * haze
                } else {
                    let k = (d.1 / d.len()).min(1.0).sqrt();
                    horizon + (sky_top - horizon) * k
                };
                let i = (y * w + x) * 4;
                self.pixels[i..i + 4].copy_from_slice(&[colour.0 as u8, colour.1 as u8, colour.2 as u8, 255]);
            }
        }
    }

    /// A flat triangle, kept where it is nearer than what is drawn (depth is 1/z, larger nearer).
    fn triangle(&mut self, a: (f32, f32, f32), b: (f32, f32, f32), c: (f32, f32, f32), rgb: [u8; 3]) {
        let area = (b.0 - a.0) * (c.1 - a.1) - (b.1 - a.1) * (c.0 - a.0);
        if area.abs() < 1e-6 {
            return;
        }
        let (w, h) = (self.width as f32, self.height as f32);
        let x0 = a.0.min(b.0).min(c.0).floor().max(0.0) as usize;
        let x1 = a.0.max(b.0).max(c.0).ceil().min(w) as usize;
        let y0 = a.1.min(b.1).min(c.1).floor().max(0.0) as usize;
        let y1 = a.1.max(b.1).max(c.1).ceil().min(h) as usize;
        let edge = |p: (f32, f32, f32), q: (f32, f32, f32), x: f32, y: f32| (q.0 - p.0) * (y - p.1) - (q.1 - p.1) * (x - p.0);
        for y in y0..y1 {
            for x in x0..x1 {
                let (px, py) = (x as f32 + 0.5, y as f32 + 0.5);
                let (l0, l1, l2) = (edge(b, c, px, py) / area, edge(c, a, px, py) / area, edge(a, b, px, py) / area);
                if l0 < 0.0 || l1 < 0.0 || l2 < 0.0 {
                    continue;
                }
                let z = l0 * a.2 + l1 * b.2 + l2 * c.2;
                let i = y * self.width + x;
                if z > self.depth[i] {
                    self.depth[i] = z;
                    self.pixels[i * 4..i * 4 + 3].copy_from_slice(&rgb);
                }
            }
        }
    }
}

thread_local! {
    static WORLD: RefCell<World> = RefCell::new(World::new());
}

/// Sizes the picture and gives where its pixels are, RGBA row by row.
#[unsafe(no_mangle)]
pub extern "C" fn resize(width: u32, height: u32) -> *mut u8 {
    WORLD.with_borrow_mut(|w| {
        (w.width, w.height) = (width as usize, height as usize);
        w.pixels = vec![255; w.width * w.height * 4];
        w.depth = vec![0.0; w.width * w.height];
        w.pixels.as_mut_ptr()
    })
}

/// Where the page writes the stickers (`World::stickers`).
#[unsafe(no_mangle)]
pub extern "C" fn stickers() -> *mut f32 { WORLD.with_borrow_mut(|w| w.stickers.as_mut_ptr()) }

/// A face turn, the stickers already written as it leaves them: the layer at `layer` along `axis` (0 x, 1 y, 2 z)
/// turned `angle` radians, right-handed about the axis.
#[unsafe(no_mangle)]
pub extern "C" fn turn(axis: u32, layer: f32, angle: f32) {
    WORLD.with_borrow_mut(|w| {
        let axis = (axis as usize).min(2);
        w.turn = Some(Turn { axis, layer, from: -angle, t: 0.0 });
        let world_axis = w.q.rotate(V::axis(axis));
        w.spin = w.spin - world_axis * (RECOIL * angle.signum());
        if w.pos.1 < HALF * 1.8 {
            w.vel = w.vel + V(0.0, HOP, 0.0) - world_axis * (layer * 1.5);
        }
    })
}

/// How the player holds their cube now (`Quaternion` of src/client/lib/smartCube.ts).
#[unsafe(no_mangle)]
pub extern "C" fn hold(qw: f32, qx: f32, qy: f32, qz: f32) {
    WORLD.with_borrow_mut(|w| {
        let q = Q(qw, qx, qy, qz).unit();
        if let Some(before) = w.held {
            let seen = q.then(before.inverse()).vector() * (1.0 / w.since_held.max(1.0 / 60.0));
            w.held_spin = w.held_spin + (seen - w.held_spin) * 0.5;
        }
        w.held = Some(q);
        w.since_held = 0.0;
    })
}

/// A tap: the cube jumps and spins.
#[unsafe(no_mangle)]
pub extern "C" fn poke() {
    WORLD.with_borrow_mut(|w| {
        let (a, b, c, d) = (w.random(), w.random(), w.random(), w.random());
        w.vel = w.vel + V((a - 0.5) * 6.0, 13.0, (b - 0.5) * 6.0);
        w.spin = w.spin + V(c - 0.5, d - 0.5, a - b).unit() * 9.0;
    })
}

/// Moves the world on by `dt` seconds and draws it.
#[unsafe(no_mangle)]
pub extern "C" fn frame(dt: f32) {
    WORLD.with_borrow_mut(|w| {
        w.advance(dt);
        w.render();
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settle(w: &mut World, seconds: f32) {
        for _ in 0..(seconds * 60.0) as usize {
            w.advance(1.0 / 60.0);
        }
    }

    #[test]
    fn a_dropped_cube_comes_to_rest_on_the_floor() {
        let mut w = World::new();
        settle(&mut w, 8.0);
        assert!((w.pos.1 - HALF).abs() < 0.05, "rests at {:?}", w.pos);
        assert!(w.vel.len() < 0.05 && w.spin.len() < 0.05, "still moving: {:?} {:?}", w.vel, w.spin);
        assert!(w.pos.0.abs() < ARENA && w.pos.2.abs() < ARENA);
    }

    #[test]
    fn the_cube_follows_how_the_player_holds_theirs() {
        let mut w = World::new();
        let held = Q::around(V(0.0, 1.0, 0.0), 0.7);
        w.held = Some(held);
        settle(&mut w, 6.0);
        assert!(held.then(w.q.inverse()).vector().len() < 0.1, "{:?}", w.q);
    }

    #[test]
    fn a_turn_makes_it_hop_and_draws_it() {
        resize(64, 48);
        for _ in 0..360 {
            frame(1.0 / 60.0);
        }
        let before = WORLD.with_borrow(|w| w.pos.1);
        turn(1, 1.0, -std::f32::consts::FRAC_PI_2);
        for _ in 0..9 {
            frame(1.0 / 60.0);
        }
        WORLD.with_borrow(|w| {
            assert!(w.pos.1 > before + 0.3, "{} then {}", before, w.pos.1);
            // The cube covers the middle of the picture.
            assert!(w.depth[24 * 64 + 32] > 0.0);
        });
    }
}
