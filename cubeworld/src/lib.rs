//! The cube's world, an easter egg (desktop/renderer/CubeWorld.tsx): a 3×3 that falls, bounces and rolls in an arena,
//! turned as the player turns their smart cube (`hold`) and kicked by each of its turns (`turn`), the camera turned
//! around it with the mouse (`orbit`).
//!
//! Rust draws it on the graphics card: it writes the shaders, builds the meshes and the matrices, and makes the WebGL 2
//! calls, which the page passes on to the canvas's context one by one (the `gl_*` imports, a thin shim).
//!
//! The world's axes are the player's (x to the right, y up, z toward them), a cubie is 1 wide: the cube is 3 wide, its
//! centre 1.5 above the floor when it lies on it. Its inertia is the same about every axis (a cube's), a number.
use std::cell::RefCell;
use std::ops::{Add, Mul, Neg, Sub};

mod model;
mod scenery;
use scenery::{Collider, Item, PLAY};

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

/// A 4×4 matrix, column after column, as WebGL reads it.
type M = [f32; 16];
fn multiply(a: &M, b: &M) -> M {
    let mut m = [0.0; 16];
    for c in 0..4 {
        for r in 0..4 {
            m[c * 4 + r] = (0..4).map(|k| a[k * 4 + r] * b[c * 4 + k]).sum();
        }
    }
    m
}
fn look_at(eye: V, target: V) -> M {
    let f = (target - eye).unit();
    let s = f.cross(V(0.0, 1.0, 0.0)).unit();
    let u = s.cross(f);
    [s.0, u.0, -f.0, 0.0, s.1, u.1, -f.1, 0.0, s.2, u.2, -f.2, 0.0, -s.dot(eye), -u.dot(eye), f.dot(eye), 1.0]
}
fn perspective(fov: f32, aspect: f32, near: f32, far: f32) -> M {
    let f = 1.0 / (fov / 2.0).tan();
    let mut m = [0.0; 16];
    (m[0], m[5], m[10], m[11], m[14]) = (f / aspect, f, (far + near) / (near - far), -1.0, 2.0 * far * near / (near - far));
    m
}

const GRAVITY: f32 = 30.0;
const MASS: f32 = 1.0;
/// A solid cube's, 3 wide: m s² / 6.
const INERTIA: f32 = MASS * 9.0 / 6.0;
const HALF: f32 = 1.5;
const FRICTION: f32 = 0.6;
const BOUNCE: f32 = 0.35;
/// A turn's kick: the cube hops, and spins against the layer it turned.
const HOP: f32 = 7.0;
const RECOIL: f32 = 3.5;
/// How hard the cube follows the held cube's orientation, and how much its spin is damped toward the held one's:
/// a spring, so that gravity and what it runs into still tip it over.
const FOLLOW: f32 = 55.0;
const FOLLOW_DAMPING: f32 = 11.0;
const STEP: f32 = 1.0 / 240.0;
const TURN_SECONDS: f32 = 0.13;
const FOV: f32 = 0.85;
/// Toward the sun.
const LIGHT: V = V(-0.42, 0.8, 0.43);

/// A face turn being drawn: its layer starts `from` radians back and comes to rest.
struct Turn {
    axis: usize,
    layer: f32,
    from: f32,
    t: f32,
}

/// What the page's WebGL shim gives (CubeWorld.tsx): shaders, programs and buffers named by numbers.
#[cfg(target_arch = "wasm32")]
mod gl {
    #[link(wasm_import_module = "gl")]
    unsafe extern "C" {
        fn gl_shader(fragment: u32, source: *const u8, len: usize) -> u32;
        fn gl_program(vertex: u32, fragment: u32) -> u32;
        fn gl_buffer() -> u32;
        fn gl_frame(width: u32, height: u32);
        fn gl_uniform(program: u32, name: *const u8, len: usize, x: f32, y: f32, z: f32, w: f32);
        fn gl_matrix(program: u32, name: *const u8, len: usize, m: *const f32);
        fn gl_upload(buffer: u32, vertices: *const f32, floats: usize);
        fn gl_draw(program: u32, buffer: u32, floats: usize);
    }
    pub fn program(vertex: &str, fragment: &str) -> u32 {
        unsafe { gl_program(gl_shader(0, vertex.as_ptr(), vertex.len()), gl_shader(1, fragment.as_ptr(), fragment.len())) }
    }
    pub fn buffer() -> u32 { unsafe { gl_buffer() } }
    pub fn frame(width: usize, height: usize) { unsafe { gl_frame(width as u32, height as u32) } }
    pub fn uniform(program: u32, name: &str, v: [f32; 4]) { unsafe { gl_uniform(program, name.as_ptr(), name.len(), v[0], v[1], v[2], v[3]) } }
    pub fn matrix(program: u32, name: &str, m: &super::M) { unsafe { gl_matrix(program, name.as_ptr(), name.len(), m.as_ptr()) } }
    pub fn upload(buffer: u32, vertices: &[f32]) { unsafe { gl_upload(buffer, vertices.as_ptr(), vertices.len()) } }
    pub fn draw(program: u32, buffer: u32, floats: usize) { unsafe { gl_draw(program, buffer, floats) } }
}
/// Off the web (the tests), nothing is drawn.
#[cfg(not(target_arch = "wasm32"))]
mod gl {
    pub fn program(_: &str, _: &str) -> u32 { 0 }
    pub fn buffer() -> u32 { 0 }
    pub fn frame(_: usize, _: usize) {}
    pub fn uniform(_: u32, _: &str, _: [f32; 4]) {}
    pub fn matrix(_: u32, _: &str, _: &super::M) {}
    pub fn upload(_: u32, _: &[f32]) {}
    pub fn draw(_: u32, _: u32, _: usize) {}
}

/// Every mesh's vertices: position, normal, colour, then the place on its face (-1 to 1) and its kind (0 a cubie's
/// plastic, 1 a sticker, the others scenery.rs's).
const FLOATS: usize = 12;

const VERTEX: &str = "#version 300 es
layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec3 a_color;
layout(location = 3) in vec3 a_face;
uniform mat4 u_vp;
uniform vec4 u_time;
out vec3 v_pos; out vec3 v_normal; out vec3 v_color; out vec3 v_face;
void main() {
  vec3 p = a_pos;
  // Leaves and flowers in the wind, more the higher they are.
  if (a_face.z > 3.5 && a_face.z < 4.5) {
    float t = u_time.x * 1.4 + a_pos.x * 0.21 + a_pos.z * 0.17;
    p += vec3(sin(t), 0.0, cos(t * 0.8)) * 0.035 * max(a_pos.y, 0.0);
  }
  v_pos = p; v_normal = a_normal; v_color = a_color; v_face = a_face;
  gl_Position = u_vp * vec4(p, 1.0);
}";

/// The sky and the haze the floor fades into, shared by the shaders.
const SKY: &str = "
uniform vec4 u_light;
const vec3 HORIZON = vec3(0.8, 0.88, 0.97);
vec3 sky(vec3 d) {
  float up = max(d.y, 0.0);
  vec3 c = mix(HORIZON, vec3(0.27, 0.5, 0.9), pow(up, 0.6));
  float sun = max(dot(d, u_light.xyz), 0.0);
  return c + vec3(1.0, 0.92, 0.75) * (pow(sun, 900.0) * 4.0 + pow(sun, 16.0) * 0.22);
}
vec3 haze(vec3 c, float distance) { return mix(c, HORIZON, 1.0 - exp(-distance * 0.0075)); }
";

const SKY_VERTEX: &str = "#version 300 es
layout(location = 0) in vec3 a_pos;
out vec2 v_clip;
void main() { v_clip = a_pos.xy; gl_Position = vec4(a_pos.xy, 0.99999, 1.0); }";

fn sky_fragment() -> String {
    format!(
        "#version 300 es
precision highp float;
in vec2 v_clip;
uniform vec4 u_right, u_up, u_forward;
out vec4 o;
{SKY}
void main() {{
  vec3 d = normalize(u_forward.xyz + u_right.xyz * v_clip.x * u_right.w + u_up.xyz * v_clip.y * u_up.w);
  o = vec4(sky(d), 1.0);
}}"
    )
}

/// Everything around the cube (scenery.rs): lit by the sky and the sun, the ground with fine grass and the cube's
/// shadow (rays toward the sun against its box, a few for a soft edge) and the dark under it, the lake rippling.
fn scene_fragment() -> String {
    format!(
        "#version 300 es
precision highp float;
in vec3 v_pos; in vec3 v_normal; in vec3 v_color; in vec3 v_face;
uniform vec4 u_eye, u_cube, u_ax, u_ay, u_az, u_time;
out vec4 o;
{SKY}
float blocked(vec3 p, vec3 d) {{
  vec3 l = p - u_cube.xyz;
  vec3 ro = vec3(dot(l, u_ax.xyz), dot(l, u_ay.xyz), dot(l, u_az.xyz));
  vec3 rd = vec3(dot(d, u_ax.xyz), dot(d, u_ay.xyz), dot(d, u_az.xyz));
  vec3 inv = 1.0 / (rd + 1e-6);
  vec3 a = (-{HALF:.1} - ro) * inv, b = ({HALF:.1} - ro) * inv;
  vec3 near = min(a, b), far = max(a, b);
  float t0 = max(max(near.x, near.y), near.z), t1 = min(min(far.x, far.y), far.z);
  return t1 > max(t0, 0.0) ? 1.0 : 0.0;
}}
float hash(vec2 p) {{ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }}
float noise(vec2 p) {{
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}}
void main() {{
  vec3 n = normalize(v_normal), v = normalize(u_eye.xyz - v_pos), l = u_light.xyz;
  float kind = v_face.z, far = distance(v_pos, u_eye.xyz);
  if (kind > 2.5 && kind < 3.5) {{
    float t = u_time.x;
    vec3 w = normalize(vec3(sin(v_pos.x * 0.9 + t * 1.3) * 0.05 + sin(v_pos.z * 1.7 + t * 1.9) * 0.03, 1.0, cos(v_pos.z * 0.8 - t * 1.1) * 0.05));
    float fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(w, v), 0.0), 5.0);
    vec3 c = mix(vec3(0.07, 0.3, 0.42), sky(reflect(-v, w)), fresnel) + vec3(1.0, 0.95, 0.85) * pow(max(dot(w, normalize(l + v)), 0.0), 300.0) * 2.0;
    o = vec4(haze(c, far), 1.0);
    return;
  }}
  vec3 base = v_color;
  if (kind > 1.5 && kind < 2.5) {{
    float g = noise(v_pos.xz * 2.3) * 0.5 + noise(v_pos.xz * 0.6) * 0.5;
    base *= mix(0.86, 1.12, g);
  }}
  float sun = max(dot(n, l), 0.0);
  if (distance(v_pos.xz, u_cube.xz) < 16.0) {{
    // A spiral of rays, turned at random from one pixel to the next: a fine grain rather than layered copies.
    float shade = 0.0, spin = hash(gl_FragCoord.xy) * 6.2832;
    for (int k = 0; k < 12; k++) {{
      float a = spin + float(k) * 2.39996;
      shade += blocked(v_pos + n * 0.02, normalize(l + vec3(cos(a), 0.0, sin(a)) * 0.05 * sqrt((float(k) + 0.5) / 12.0)));
    }}
    sun *= 1.0 - shade / 12.0;
  }}
  vec3 ambient = mix(vec3(0.36, 0.36, 0.3), vec3(0.6, 0.7, 0.92), n.y * 0.5 + 0.5);
  vec3 c = base * (ambient * 0.62 + vec3(1.0, 0.94, 0.82) * sun * 0.82);
  if (kind > 4.5 && kind < 5.5) c = mix(vec3(0.82, 0.86, 0.95), vec3(1.0), clamp(sun * 0.6 + n.y * 0.3, 0.0, 1.0));
  if (kind > 1.5 && kind < 2.5) {{
    float height = max(u_cube.y - {HALF:.1}, 0.0);
    c *= 1.0 - (1.0 - smoothstep(0.0, 2.6 + height * 0.3, length(v_pos.xz - u_cube.xz))) * 0.35 / (1.0 + height * 0.3);
  }}
  o = vec4(haze(c, far), 1.0);
}}"
    )
}

/// The cube, as flat as the app draws it: its colours barely shaded by the light, a thin line of the body along its
/// edges where two stickers meet.
fn cube_fragment() -> String {
    format!(
        "#version 300 es
precision highp float;
in vec3 v_pos; in vec3 v_normal; in vec3 v_color; in vec3 v_face;
uniform vec4 u_eye;
out vec4 o;
{SKY}
void main() {{
  vec3 n = normalize(v_normal), v = normalize(u_eye.xyz - v_pos), l = u_light.xyz;
  vec3 base = v_color;
  if (v_face.z > 0.5) {{
    float e = max(abs(v_face.x), abs(v_face.y)), w = fwidth(e);
    base = mix(base, vec3(0.071, 0.071, 0.086), smoothstep(1.0 - w * 1.5, 1.0 - w * 0.5, e));
  }}
  vec3 c = base * (0.74 + 0.26 * max(dot(n, l), 0.0) + 0.05 * n.y);
  c += vec3(0.06) * pow(max(dot(n, normalize(l + v)), 0.0), 40.0);
  o = vec4(haze(c, distance(v_pos, u_eye.xyz)), 1.0);
}}"
    )
}

/// The programs and buffers, made on the first frame.
struct Gpu {
    sky: u32,
    scene: u32,
    cube: u32,
    buffers: [u32; 3],
    /// The scenery's numbers, uploaded once.
    scenery: usize,
}

struct World {
    width: usize,
    height: usize,
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
    /// The camera: where it looks, and from which side (about the vertical, then above the floor).
    look: V,
    yaw: f32,
    pitch: f32,
    rest: f32,
    time: f32,
    items: Vec<Item>,
    colliders: Vec<Collider>,
    gpu: Option<Gpu>,
    mesh: Vec<f32>,
}

impl World {
    fn new() -> World {
        let (items, colliders) = scenery::scatter(&mut scenery::Rng(0x9e37_79b9));
        World {
            width: 0,
            height: 0,
            stickers: [0.0; 54 * 7],
            pos: V(0.0, 9.0, 0.0),
            vel: V(0.0, 0.0, 0.0),
            q: Q::around(V(1.0, 0.0, 1.0).unit(), 0.5),
            spin: V(2.0, 1.0, -1.5),
            held: None,
            held_spin: V::default(),
            since_held: 0.0,
            turn: None,
            look: V(0.0, 1.5, 0.0),
            // As the app shows a held cube (`CUBE_YAW`, `CUBE_PITCH` of src/shared/cubeScene.ts).
            yaw: std::f32::consts::FRAC_PI_4,
            pitch: 0.55,
            rest: 0.0,
            time: 0.0,
            items,
            colliders,
            gpu: None,
            mesh: Vec::new(),
        }
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

    /// An impulse at `r` (from the cube's centre) stopping it going into a surface of normal `n`, `gap` deep, with
    /// friction along it.
    fn contact(&mut self, r: V, n: V, gap: f32, bounce: bool) {
        self.pos = self.pos + n * (-gap * 0.4);
        let going = (self.vel + self.spin.cross(r)).dot(n);
        if going >= 0.0 {
            return;
        }
        let rn = r.cross(n);
        let bounce = if bounce && going < -3.0 { BOUNCE } else { 0.0 };
        let j = -(1.0 + bounce) * going / (1.0 / MASS + rn.dot(rn) * (1.0 / INERTIA));
        self.push(n * j, r);
        let v = self.vel + self.spin.cross(r);
        let slide = v - n * v.dot(n);
        let speed = slide.len();
        if speed > 1e-5 {
            let t = slide * (1.0 / speed);
            let rt = r.cross(t);
            let jt = (speed / (1.0 / MASS + rt.dot(rt) * (1.0 / INERTIA))).min(FRICTION * j);
            self.push(t * -jt, r);
        }
    }

    /// Each corner against the ground and the meadow's edge, the cube's box against the trunks and rocks near it.
    fn collide(&mut self) {
        for pass in 0..3 {
            for corner in 0..8 {
                let local = V(
                    if corner & 1 == 0 { -HALF } else { HALF },
                    if corner & 2 == 0 { -HALF } else { HALF },
                    if corner & 4 == 0 { -HALF } else { HALF },
                );
                let r = self.q.rotate(local);
                let p = self.pos + r;
                if p.1 < 0.0 {
                    self.contact(r, V(0.0, 1.0, 0.0), p.1, pass == 0);
                }
                let out = (p.0 * p.0 + p.2 * p.2).sqrt();
                if out > PLAY {
                    self.contact(r, V(-p.0 / out, 0.0, -p.2 / out), PLAY - out, pass == 0);
                }
            }
            for k in 0..self.colliders.len() {
                let Collider { centre, radius, trunk } = self.colliders[k];
                if (centre.0 - self.pos.0).abs() > radius + 2.7 || (centre.2 - self.pos.2).abs() > radius + 2.7 {
                    continue;
                }
                let c = if trunk > 0.0 { V(centre.0, self.pos.1.clamp(centre.1, centre.1 + trunk), centre.2) } else { centre };
                let local = self.q.inverse().rotate(c - self.pos);
                let nearest = self.pos + self.q.rotate(V(local.0.clamp(-HALF, HALF), local.1.clamp(-HALF, HALF), local.2.clamp(-HALF, HALF)));
                let apart = nearest - c;
                let d = apart.len();
                if d < radius {
                    let n = if d > 1e-4 { apart * (1.0 / d) } else { V(self.pos.0 - c.0, 0.0, self.pos.2 - c.2).unit() };
                    self.contact(nearest - self.pos, n, d - radius, pass == 0);
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
        self.time += dt;
        while self.rest >= STEP {
            self.rest -= STEP;
            self.step(STEP);
        }
        // It follows the cube a little lazily.
        let to = V(self.pos.0, 1.5 + (self.pos.1 - 1.5).max(0.0) * 0.5, self.pos.2);
        self.look = self.look + (to - self.look) * (1.0 - (-dt * 4.0).exp());
    }

    /// The cube as the app draws it (model.rs), the layer turning as it is drawn.
    fn build_cube(&mut self) {
        let turn = self.turn.as_ref().map(|t| {
            let e = 1.0 - (1.0 - t.t.min(1.0)).powi(3);
            (t.axis, t.layer, Q::around(V::axis(t.axis), t.from * (1.0 - e)))
        });
        model::cube(&self.stickers, turn, self.q, self.pos, &mut self.mesh);
    }

    fn render(&mut self) {
        if self.width == 0 || self.height == 0 {
            return;
        }
        let items = &self.items;
        let gpu = self.gpu.get_or_insert_with(|| {
            let buffers = [gl::buffer(), gl::buffer(), gl::buffer()];
            let scenery = scenery::build(items, &mut scenery::Rng(0x85eb_ca6b));
            gl::upload(buffers[1], &scenery);
            Gpu {
                sky: gl::program(SKY_VERTEX, &sky_fragment()),
                scene: gl::program(VERTEX, &scene_fragment()),
                cube: gl::program(VERTEX, &cube_fragment()),
                buffers,
                scenery: scenery.len(),
            }
        });
        let (sky, scene, cube, buffers, scenery) = (gpu.sky, gpu.scene, gpu.cube, gpu.buffers, gpu.scenery);
        let aspect = self.width as f32 / self.height as f32;
        let eye = self.look + V(self.yaw.sin() * self.pitch.cos(), self.pitch.sin(), self.yaw.cos() * self.pitch.cos()) * 16.0;
        let vp = multiply(&perspective(FOV, aspect, 0.2, 800.0), &look_at(eye, self.look));
        let light = LIGHT.unit();
        let (forward, tan) = ((self.look - eye).unit(), (FOV / 2.0).tan());
        let right = forward.cross(V(0.0, 1.0, 0.0)).unit();
        let up = right.cross(forward);
        let v4 = |v: V, w: f32| [v.0, v.1, v.2, w];
        gl::frame(self.width, self.height);

        for program in [sky, scene, cube] {
            gl::uniform(program, "u_light", v4(light, 0.0));
            gl::uniform(program, "u_eye", v4(eye, 0.0));
            gl::uniform(program, "u_time", [self.time, 0.0, 0.0, 0.0]);
            gl::matrix(program, "u_vp", &vp);
        }
        gl::uniform(sky, "u_right", v4(right, tan * aspect));
        gl::uniform(sky, "u_up", v4(up, tan));
        gl::uniform(sky, "u_forward", v4(forward, 0.0));
        let mut screen = [0.0; FLOATS * 3];
        for (k, (x, y)) in [(-1.0, -1.0), (3.0, -1.0), (-1.0, 3.0)].into_iter().enumerate() {
            (screen[k * FLOATS], screen[k * FLOATS + 1]) = (x, y);
        }
        gl::upload(buffers[0], &screen);
        gl::draw(sky, buffers[0], screen.len());

        gl::uniform(scene, "u_cube", v4(self.pos, 0.0));
        for (k, name) in ["u_ax", "u_ay", "u_az"].into_iter().enumerate() {
            gl::uniform(scene, name, v4(self.q.rotate(V::axis(k)), 0.0));
        }
        gl::draw(scene, buffers[1], scenery);

        self.build_cube();
        gl::upload(buffers[2], &self.mesh);
        gl::draw(cube, buffers[2], self.mesh.len());
    }
}

thread_local! {
    static WORLD: RefCell<World> = RefCell::new(World::new());
}

/// The canvas's size, in pixels.
#[unsafe(no_mangle)]
pub extern "C" fn resize(width: u32, height: u32) { WORLD.with_borrow_mut(|w| (w.width, w.height) = (width as usize, height as usize)) }

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

/// The camera turned around the cube by a drag of the mouse, in radians.
#[unsafe(no_mangle)]
pub extern "C" fn orbit(yaw: f32, pitch: f32) {
    WORLD.with_borrow_mut(|w| {
        w.yaw -= yaw;
        w.pitch = (w.pitch + pitch).clamp(0.08, 1.35);
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
        assert!(w.pos.0.hypot(w.pos.2) < PLAY);
    }

    #[test]
    fn the_cube_follows_how_the_player_holds_theirs_whatever_the_camera() {
        let mut w = World::new();
        let held = Q::around(V(0.0, 1.0, 0.0), 0.7);
        w.held = Some(held);
        w.yaw = 0.3;
        settle(&mut w, 6.0);
        assert!(held.then(w.q.inverse()).vector().len() < 0.1, "{:?}", w.q);
    }

    #[test]
    fn trees_stop_it() {
        let mut w = World::new();
        let tree = w.colliders.iter().find(|c| c.trunk > 0.0 && c.centre.0.hypot(c.centre.2) < 30.0).map(|c| c.centre).unwrap();
        // Rolled hard at the trunk from 8 away.
        let toward = V(1.0, 0.0, 0.3).unit();
        (w.pos, w.q, w.spin) = (tree - toward * 8.0 + V(0.0, HALF, 0.0), Q::around(V(0.0, 1.0, 0.0), 0.0), V::default());
        w.vel = toward * 20.0;
        let mut nearest = f32::MAX;
        for _ in 0..120 {
            w.advance(1.0 / 60.0);
            nearest = nearest.min((w.pos.0 - tree.0).hypot(w.pos.2 - tree.2));
        }
        assert!(nearest > HALF, "went through the trunk: {nearest}");
    }

    #[test]
    fn a_turn_makes_it_hop_and_turns_its_layer() {
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
            assert!(!w.mesh.is_empty() && w.mesh.len() % (3 * FLOATS) == 0);
        });
    }
}
