//! The cube as the app draws it (src/shared/cubeScene.ts, `cubeShapes`), in three dimensions: a black body, its
//! corners rounded by the same curve; stickers reaching the cube's edges, a tenth apart from each other, their inner
//! corners rounded (less on a corner piece). Each layer is a slab of its own while it turns.
use super::{FLOATS, Q, V};

/// `CUBE_BODY`.
const BODY: V = V(0x12 as f32 / 255.0, 0x12 as f32 / 255.0, 0x16 as f32 / 255.0);
const H: f32 = 1.0;
/// A sticker's four corners in turn, as cubeScene.ts's `CORNERS`.
const CORNERS: [(f32, f32); 4] = [(-1.0, -1.0), (1.0, -1.0), (1.0, 1.0), (-1.0, 1.0)];

fn set(mut v: V, k: usize, x: f32) -> V {
    match k {
        0 => v.0 = x,
        1 => v.1 = x,
        _ => v.2 = x,
    }
    v
}

/// cubeScene.ts's `tipCurve`: from 0.12 back along `k` to the corner's rounded tip.
fn tip_curve(v: V, k: usize) -> [V; 7] {
    let sign = V(v.0.signum(), v.1.signum(), v.2.signum());
    let start = set(v, k, v.at(k) - sign.at(k) * 0.12);
    let control = set(v, k, v.at(k) - sign.at(k) * 3.0 * 0.024);
    let tip = v + sign * -0.024;
    std::array::from_fn(|i| {
        let t = i as f32 / 6.0;
        start * ((1.0 - t) * (1.0 - t)) + control * (2.0 * t * (1.0 - t)) + tip * (t * t)
    })
}

/// A corner of the cube itself: every coordinate on its outside.
fn outer(v: V) -> bool { [v.0, v.1, v.2].iter().all(|c| c.abs() >= H + 0.5 - 1e-4) }

/// The path round a cube's corner on the face whose plane holds axes `a` and `b`, as cubeScene.ts walks it.
fn round_corner(v: V, sa: f32, sb: f32, a: usize, b: usize, points: &mut Vec<V>) {
    let (first, last) = if sa * sb > 0.0 { (b, a) } else { (a, b) };
    points.extend(tip_curve(v, first));
    points.extend(tip_curve(v, last).iter().rev().skip(1));
}

struct Out<'a> {
    mesh: &'a mut Vec<f32>,
    pos: V,
}
impl Out<'_> {
    /// A flat polygon, as a fan from `centre`; `face` places each point on a sticker (-1 to 1 at its cell's edges).
    fn polygon(&mut self, centre: V, points: &[V], q: Q, n: V, colour: V, kind: f32, face: impl Fn(V) -> (f32, f32)) {
        let normal = q.rotate(n);
        let at = |p: V| self.pos + q.rotate(p);
        for i in 0..points.len() {
            for p in [centre, points[i], points[(i + 1) % points.len()]] {
                let w = at(p);
                let (u, v) = face(p);
                self.mesh.extend_from_slice(&[w.0, w.1, w.2, normal.0, normal.1, normal.2, colour.0, colour.1, colour.2, u, v, kind]);
            }
        }
    }
}

/// The cube's mesh into `mesh`: placed at `pos` and turned by `body`, the layer of `turn` (axis, layer, its own
/// rotation) turning. `stickers`: 7 numbers each, its piece's centre, its normal and its colour.
pub fn cube(stickers: &[f32], turn: Option<(usize, f32, Q)>, body: Q, pos: V, mesh: &mut Vec<f32>) {
    mesh.clear();
    let mut out = Out { mesh, pos };
    let (axis, layer, spin) = turn.unwrap_or((0, 9.0, Q(1.0, 0.0, 0.0, 0.0)));
    let moving = |l: f32| (l - layer).abs() < 0.5;
    let pose = |l: f32| if moving(l) { body.then(spin) } else { body };

    // The body: one slab for each run of layers turning together or not.
    let mut slabs: Vec<(f32, f32)> = Vec::new();
    for l in [-1.0, 0.0, 1.0] {
        match slabs.last_mut() {
            Some((_, end)) if moving(*end) == moving(l) => *end = l,
            _ => slabs.push((l, l)),
        }
    }
    for (start, end) in slabs {
        let q = pose(start);
        let lo = set(V(-H - 0.5, -H - 0.5, -H - 0.5), axis, start - 0.5);
        let hi = set(V(H + 0.5, H + 0.5, H + 0.5), axis, end + 0.5);
        for f in 0..3 {
            for side in [-1.0f32, 1.0] {
                let (a, b) = ((f + 1) % 3, (f + 2) % 3);
                let plane = if side > 0.0 { hi.at(f) } else { lo.at(f) };
                let centre = set(set(set(V::default(), f, plane), a, (lo.at(a) + hi.at(a)) / 2.0), b, (lo.at(b) + hi.at(b)) / 2.0);
                let mut points = Vec::new();
                for (sa, sb) in CORNERS {
                    let v = set(set(centre, a, if sa > 0.0 { hi.at(a) } else { lo.at(a) }), b, if sb > 0.0 { hi.at(b) } else { lo.at(b) });
                    if outer(v) { round_corner(v, sa, sb, a, b, &mut points) } else { points.push(v) }
                }
                out.polygon(centre, &points, q, V::axis(f) * side, BODY, 0.0, |_| (0.0, 0.0));
            }
        }
    }

    for s in stickers.chunks_exact(7) {
        let (p, n, rgb) = (V(s[0], s[1], s[2]), V(s[3], s[4], s[5]), s[6] as u32);
        let colour = V((rgb >> 16) as f32, ((rgb >> 8) & 255) as f32, (rgb & 255) as f32) * (1.0 / 255.0);
        let f = (0..3).find(|&k| n.at(k) != 0.0).unwrap_or(0);
        let (a, b) = ((f + 1) % 3, (f + 2) % 3);
        let centre = p + n * 0.5;
        let outside = |k: usize, sign: f32| (p.at(k) + sign * 0.5).abs() >= H + 0.5 - 1e-4;
        let extent = |k: usize, sign: f32| sign * if outside(k, sign) { 0.5 } else { 0.45 };
        let corner_piece = [(a, -1.0), (a, 1.0), (b, -1.0), (b, 1.0)].iter().filter(|&&(k, s)| outside(k, s)).count() >= 2;
        let mut points = Vec::new();
        for (sa, sb) in CORNERS {
            let tip = set(set(V::default(), a, extent(a, sa)), b, extent(b, sb));
            if outside(a, sa) && outside(b, sb) {
                round_corner(centre + tip, sa, sb, a, b, &mut points);
            } else if outside(a, sa) || outside(b, sb) {
                points.push(centre + tip);
            } else {
                let radius = if corner_piece { 0.12 } else { 0.26 };
                let arc = set(set(tip, a, tip.at(a) - sa * radius), b, tip.at(b) - sb * radius);
                let from = sb.atan2(sa) - std::f32::consts::FRAC_PI_4;
                for step in 0..7 {
                    let angle = from + std::f32::consts::FRAC_PI_2 * step as f32 / 6.0;
                    points.push(centre + set(set(arc, a, arc.at(a) + angle.cos() * radius), b, arc.at(b) + angle.sin() * radius));
                }
            }
        }
        // Just off the body, so that it never shows through.
        let lift = n * 0.002;
        let points: Vec<V> = points.into_iter().map(|v| v + lift).collect();
        let face = |v: V| ((v.at(a) - centre.at(a)) * 2.0, (v.at(b) - centre.at(b)) * 2.0);
        out.polygon(centre + lift, &points, pose(p.at(axis)), n, colour, 1.0, face);
    }
    debug_assert!(out.mesh.len() % FLOATS == 0);
}
