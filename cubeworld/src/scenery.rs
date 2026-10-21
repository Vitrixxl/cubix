//! The world around the cube, made once from a seed: a meadow the cube roams (flat, `PLAY` wide), hills rising beyond
//! it to mountains, a lake, trees, rocks, bushes, flowers and clouds; the trunks and rocks stand in the cube's way
//! (`Collider`).
use super::{FLOATS, LIGHT, V};

/// How far from the middle the cube may roam: the ground is flat this far and a little beyond.
pub const PLAY: f32 = 42.0;
const FLAT: f32 = 48.0;
/// The lake's middle (x, z) and its radius, and its water's height.
const LAKE: (f32, f32, f32) = (74.0, -28.0, 22.0);
const WATER: f32 = -0.9;
/// The ground's grid, this many units between its points, this far out.
const GRID: f32 = 2.0;
const EXTENT: f32 = 210.0;

/// What a face is, for the shaders: its kind in the last of a vertex's numbers.
pub const GROUND: f32 = 2.0;
const WATER_KIND: f32 = 3.0;
/// Leaves and flowers, which the wind moves.
const LEAVES: f32 = 4.0;
const CLOUD: f32 = 5.0;
const SOLID: f32 = 6.0;

/// Something the cube runs into: a ball, or a trunk (a ball sliding up its axis from the ground to `trunk`).
pub struct Collider {
    pub centre: V,
    pub radius: f32,
    pub trunk: f32,
}

pub struct Rng(pub u32);
impl Rng {
    pub fn next(&mut self) -> f32 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 17;
        self.0 ^= self.0 << 5;
        self.0 as f32 / u32::MAX as f32
    }
    fn range(&mut self, a: f32, b: f32) -> f32 { a + (b - a) * self.next() }
}

fn smoothstep(a: f32, b: f32, x: f32) -> f32 {
    let t = ((x - a) / (b - a)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}
fn hash(x: i32, z: i32) -> f32 {
    let mut h = (x as u32).wrapping_mul(374_761_393) ^ (z as u32).wrapping_mul(668_265_263);
    h = (h ^ (h >> 13)).wrapping_mul(1_274_126_177);
    (h ^ (h >> 16)) as f32 / u32::MAX as f32
}
fn noise(x: f32, z: f32) -> f32 {
    let (ix, iz) = (x.floor() as i32, z.floor() as i32);
    let (fx, fz) = (x - x.floor(), z - z.floor());
    let (sx, sz) = (fx * fx * (3.0 - 2.0 * fx), fz * fz * (3.0 - 2.0 * fz));
    let top = hash(ix, iz) + (hash(ix + 1, iz) - hash(ix, iz)) * sx;
    let bottom = hash(ix, iz + 1) + (hash(ix + 1, iz + 1) - hash(ix, iz + 1)) * sx;
    top + (bottom - top) * sz
}
fn fbm(x: f32, z: f32) -> f32 { (0..4).map(|o| noise(x * (1 << o) as f32, z * (1 << o) as f32) / (2 << o) as f32).sum::<f32>() * 1.07 }

fn lake(x: f32, z: f32) -> f32 { 1.0 - smoothstep(LAKE.2 * 0.5, LAKE.2, ((x - LAKE.0).powi(2) + (z - LAKE.1).powi(2)).sqrt()) }

/// The ground's height: flat where the cube roams, hills then mountains farther out, the lake's hollow.
pub fn height(x: f32, z: f32) -> f32 {
    let d = (x * x + z * z).sqrt();
    let hills = (fbm(x * 0.025, z * 0.025) - 0.3).max(0.0) * 18.0 * smoothstep(FLAT, FLAT + 50.0, d);
    let mountains = smoothstep(120.0, 200.0, d) * (12.0 + fbm(x * 0.012 + 9.0, z * 0.012) * 60.0);
    (hills + mountains) * (1.0 - lake(x, z)) - lake(x, z) * 4.0
}

fn ground_colour(x: f32, z: f32, h: f32, slope: f32) -> V {
    let n = fbm(x * 0.08 + 3.0, z * 0.08);
    let grass = V(0.33, 0.6, 0.25) + (V(0.55, 0.68, 0.28) - V(0.33, 0.6, 0.25)) * smoothstep(0.35, 0.75, n);
    let mut c = grass;
    c = c + (V(0.86, 0.79, 0.56) - c) * smoothstep(WATER + 1.4, WATER + 0.4, h);
    c = c + (V(0.5, 0.48, 0.47) - c) * smoothstep(0.45, 0.75, slope).max(smoothstep(18.0, 30.0, h));
    c + (V(0.96, 0.97, 1.0) - c) * smoothstep(38.0, 46.0, h + n * 6.0)
}

pub enum Item {
    Pine(V, f32),
    Round(V, f32),
    Rock(V, f32),
    Bush(V, f32),
    Flower(V, V),
    Cloud(V, f32),
}

/// Where everything stands, and what the cube runs into.
pub fn scatter(rng: &mut Rng) -> (Vec<Item>, Vec<Collider>) {
    let (mut items, mut colliders) = (Vec::new(), Vec::new());
    let at = |rng: &mut Rng, near: f32, far: f32| {
        let (a, d) = (rng.range(0.0, std::f32::consts::TAU), near + (far - near) * rng.next().sqrt());
        let (x, z) = (a.cos() * d, a.sin() * d);
        V(x, height(x, z), z)
    };
    for k in 0..520 {
        let p = at(rng, 22.0, 190.0);
        if p.1 < WATER + 0.8 || p.1 > 30.0 || lake(p.0, p.2) > 0.0 {
            continue;
        }
        let size = rng.range(0.8, 1.35);
        items.push(if k % 3 == 0 || p.1 > 12.0 { Item::Pine(p, size) } else { Item::Round(p, size) });
        colliders.push(Collider { centre: p, radius: 0.32 * size + 0.08, trunk: 2.5 * size });
    }
    for _ in 0..70 {
        let p = at(rng, 12.0, 120.0);
        if lake(p.0, p.2) > 0.3 {
            continue;
        }
        let size = rng.range(0.5, 1.6);
        items.push(Item::Rock(p, size));
        colliders.push(Collider { centre: p, radius: size * 0.9, trunk: 0.0 });
    }
    for _ in 0..140 {
        let p = at(rng, 5.0, 110.0);
        if lake(p.0, p.2) == 0.0 {
            items.push(Item::Bush(p, rng.range(0.5, 1.0)));
        }
    }
    const PETALS: [V; 5] = [V(1.0, 1.0, 1.0), V(1.0, 0.85, 0.25), V(0.95, 0.45, 0.65), V(0.6, 0.55, 1.0), V(1.0, 0.55, 0.3)];
    for _ in 0..1800 {
        let p = at(rng, 3.0, 80.0);
        if lake(p.0, p.2) == 0.0 && noise(p.0 * 0.07, p.2 * 0.07) > 0.45 {
            items.push(Item::Flower(p, PETALS[(rng.next() * 5.0) as usize % 5]));
        }
    }
    for _ in 0..30 {
        let p = at(rng, 30.0, 320.0);
        items.push(Item::Cloud(V(p.0, rng.range(55.0, 85.0), p.2), rng.range(4.0, 9.0)));
    }
    (items, colliders)
}

/// Triangles with one normal each (the low-poly look), or the ground's smooth ones.
struct Mesh(Vec<f32>);
impl Mesh {
    fn vertex(&mut self, p: V, n: V, c: V, kind: f32) { self.0.extend_from_slice(&[p.0, p.1, p.2, n.0, n.1, n.2, c.0, c.1, c.2, 0.0, 0.0, kind]) }
    fn triangle(&mut self, a: V, b: V, c: V, colour: V, kind: f32) {
        let n = (b - a).cross(c - a).unit();
        for p in [a, b, c] {
            self.vertex(p, n, colour, kind);
        }
    }
    /// A prism or a cone (`top` 0) standing on `base`.
    fn prism(&mut self, base: V, radius: f32, top: f32, height: f32, sides: usize, colour: V, kind: f32, turn: f32) {
        let ring = |r: f32, y: f32, i: usize| {
            let a = turn + i as f32 / sides as f32 * std::f32::consts::TAU;
            base + V(a.cos() * r, y, a.sin() * r)
        };
        for i in 0..sides {
            let (a0, a1, b0, b1) = (ring(radius, 0.0, i), ring(radius, 0.0, i + 1), ring(top, height, i), ring(top, height, i + 1));
            let out = |p: V, q: V, r: V| {
                let n = (q - p).cross(r - p);
                let mid = (p + q + r) * (1.0 / 3.0) - base;
                if n.dot(V(mid.0, 0.0, mid.2)) < 0.0 { (p, r, q) } else { (p, q, r) }
            };
            let (p, q, r) = out(a0, a1, b0);
            self.triangle(p, q, r, colour, kind);
            if top > 0.0 {
                let (p, q, r) = out(a1, b1, b0);
                self.triangle(p, q, r, colour, kind);
            }
        }
    }
    /// A lumpy ball (an icosahedron, its points pushed about), scaled along each axis.
    fn blob(&mut self, centre: V, scale: V, colour: V, kind: f32, rng: &mut Rng, lumps: f32) {
        let t = (1.0 + 5.0f32.sqrt()) / 2.0;
        let mut points = [
            V(-1.0, t, 0.0), V(1.0, t, 0.0), V(-1.0, -t, 0.0), V(1.0, -t, 0.0),
            V(0.0, -1.0, t), V(0.0, 1.0, t), V(0.0, -1.0, -t), V(0.0, 1.0, -t),
            V(t, 0.0, -1.0), V(t, 0.0, 1.0), V(-t, 0.0, -1.0), V(-t, 0.0, 1.0),
        ];
        for p in &mut points {
            let r = 1.0 + (rng.next() - 0.5) * lumps;
            let u = p.unit() * r;
            *p = centre + V(u.0 * scale.0, u.1 * scale.1, u.2 * scale.2);
        }
        const FACES: [[usize; 3]; 20] = [
            [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
            [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
        ];
        for [a, b, c] in FACES {
            let shade = 0.92 + rng.next() * 0.16;
            let (pa, pb, pc) = (points[a], points[b], points[c]);
            let n = (pb - pa).cross(pc - pa);
            let (pb, pc) = if n.dot((pa + pb + pc) * (1.0 / 3.0) - centre) < 0.0 { (pc, pb) } else { (pb, pc) };
            self.triangle(pa, pb, pc, colour * shade, kind);
        }
    }
}

/// Everything around the cube, as one mesh drawn once.
pub fn build(items: &[Item], rng: &mut Rng) -> Vec<f32> {
    let mut m = Mesh(Vec::with_capacity(4_000_000));
    // The shade under the trees, toward where the sun is not.
    let away = V(-LIGHT.0 / LIGHT.1, 0.0, -LIGHT.2 / LIGHT.1);
    let shades: Vec<(f32, f32, f32)> = items
        .iter()
        .filter_map(|item| match item {
            Item::Round(p, s) | Item::Pine(p, s) => Some((p.0 + away.0 * 3.0 * s, p.2 + away.2 * 3.0 * s, 2.4 * s)),
            _ => None,
        })
        .collect();
    let cells = (EXTENT / GRID) as i32;
    let point = |i: i32, j: i32| {
        let (x, z) = (i as f32 * GRID, j as f32 * GRID);
        let h = height(x, z);
        let n = V(height(x - 0.5, z) - height(x + 0.5, z), 1.0, height(x, z - 0.5) - height(x, z + 0.5)).unit();
        let mut c = ground_colour(x, z, h, 1.0 - n.1);
        for &(sx, sz, r) in &shades {
            let d = ((x - sx).powi(2) + (z - sz).powi(2)).sqrt();
            if d < r {
                c = c * (1.0 - 0.35 * smoothstep(r, r * 0.3, d));
            }
        }
        (V(x, h, z), n, c)
    };
    let rows: Vec<Vec<(V, V, V)>> = (-cells..=cells).map(|j| (-cells..=cells).map(|i| point(i, j)).collect()).collect();
    for j in 0..rows.len() - 1 {
        for i in 0..rows.len() - 1 {
            let (a, b, c, d) = (rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]);
            for v in [a, c, b, a, d, c] {
                m.vertex(v.0, v.1, v.2, GROUND);
            }
        }
    }
    let r = LAKE.2 * 1.1;
    let water = |x: f32, z: f32| V(LAKE.0 + x * r, WATER, LAKE.1 + z * r);
    for (x, z) in [(-1.0, -1.0), (1.0, 1.0), (1.0, -1.0), (-1.0, -1.0), (-1.0, 1.0), (1.0, 1.0)] {
        m.vertex(water(x, z), V(0.0, 1.0, 0.0), V(0.1, 0.35, 0.5), WATER_KIND);
    }
    let trunk = V(0.42, 0.28, 0.18);
    for item in items {
        match *item {
            Item::Pine(p, s) => {
                let green = V(0.16, 0.42, 0.27) * rng.range(0.85, 1.15);
                m.prism(p - V(0.0, 0.3, 0.0), 0.3 * s, 0.22 * s, 2.0 * s, 6, trunk, SOLID, 0.0);
                for (k, y) in [1.4f32, 2.9, 4.2].into_iter().enumerate() {
                    let w = (2.2 - k as f32 * 0.55) * s;
                    m.prism(p + V(0.0, y * s, 0.0), w, 0.0, 2.6 * s, 7, green * (1.0 + k as f32 * 0.08), LEAVES, rng.next() * 3.0);
                }
            }
            Item::Round(p, s) => {
                let green = [V(0.3, 0.58, 0.22), V(0.42, 0.62, 0.2), V(0.25, 0.5, 0.25), V(0.85, 0.55, 0.2)][(rng.next() * 4.0) as usize % 4];
                m.prism(p - V(0.0, 0.3, 0.0), 0.32 * s, 0.24 * s, 3.0 * s, 6, trunk, SOLID, 0.0);
                m.blob(p + V(0.0, 4.2 * s, 0.0), V(2.3, 2.0, 2.3) * s, green, LEAVES, rng, 0.35);
                m.blob(p + V(0.9 * s, 3.4 * s, 0.5 * s), V(1.4, 1.2, 1.4) * s, green * 1.08, LEAVES, rng, 0.35);
            }
            Item::Rock(p, s) => m.blob(p + V(0.0, s * 0.25, 0.0), V(1.1, 0.75, 0.95) * s, V(0.55, 0.54, 0.56) * rng.range(0.85, 1.1), SOLID, rng, 0.5),
            Item::Bush(p, s) => m.blob(p + V(0.0, s * 0.45, 0.0), V(1.1, 0.75, 1.1) * s, V(0.27, 0.52, 0.22) * rng.range(0.85, 1.15), LEAVES, rng, 0.4),
            Item::Flower(p, colour) => {
                m.prism(p, 0.03, 0.03, 0.35, 3, V(0.3, 0.55, 0.2), LEAVES, 0.0);
                m.blob(p + V(0.0, 0.42, 0.0), V(0.12, 0.08, 0.12), colour, LEAVES, rng, 0.2);
            }
            Item::Cloud(p, s) => {
                for k in 0..5 {
                    let o = V(rng.range(-1.6, 1.6), rng.range(-0.3, 0.4), rng.range(-0.8, 0.8)) * s;
                    let r = s * rng.range(0.6, 1.0) * if k == 0 { 1.3 } else { 1.0 };
                    m.blob(p + o, V(r, r * 0.55, r * 0.8), V(1.0, 1.0, 1.0), CLOUD, rng, 0.25);
                }
            }
        }
    }
    debug_assert!(m.0.len() % FLOATS == 0);
    m.0
}
