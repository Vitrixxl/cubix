//! Small native 3D viewport. Geometry is projected into GPUI's canvas; states
//! and move definitions come from the shared, tested TypeScript cube model.
use gpui::{prelude::*, *};
use serde::Deserialize;
use std::{f32::consts::FRAC_PI_2, sync::{Arc, OnceLock}, time::Instant};

const YAW: f32 = std::f32::consts::FRAC_PI_4;
/// Stickerless speedcube: coloured pieces run to the cube edge and meet at
/// hairline seams over a dark core, with no black rim around each sticker.
const CORE: u32 = 0x121216;
const SEAM: f32 = 0.05;
/// Corner radius of centres, and of edges on their centre side, in piece units.
const ROUND: f32 = 0.26;
/// Softer radius for the inner tip of corner pieces.
const CORNER_ROUND: f32 = 0.12;
/// Rounded cube vertices: the rounding starts this far along each cube edge
/// and pulls the point where the three colours meet inwards by `TIP_DEPTH`
/// on every axis. `TIP` must stay above `3 * TIP_DEPTH`.
const TIP: f32 = 0.12;
const TIP_DEPTH: f32 = 0.024;
const ARC_STEPS: usize = 6;
const PITCH: f32 = 0.55;
type V = [f32; 3];

#[derive(Clone, Deserialize)]
pub struct Move {
    axis: usize,
    layers: Vec<f32>,
    q: u8,
}
#[derive(Clone, Deserialize)]
pub struct Scene {
    size: usize,
    colors: Vec<u32>,
    states: Vec<Vec<usize>>,
    moves: Vec<Move>,
    /// Final pose from the default camera, shared by every static thumbnail so
    /// case lists do not re-project the whole cube on each animation frame.
    #[serde(skip)]
    thumbnail: OnceLock<Arc<Vec<Polygon>>>,
}
impl Scene {
    pub fn from_value(value: &serde_json::Value) -> Option<Arc<Self>> {
        let scene: Self = serde_json::from_value(value.clone()).ok()?;
        let count = 6 * scene.size * scene.size;
        if !(2..=7).contains(&scene.size)
            || scene.colors.len() != count
            || scene.states.len() != scene.moves.len() + 1
            || scene
                .states
                .iter()
                .any(|s| s.len() != count || s.iter().any(|i| *i >= count))
            || scene
                .moves
                .iter()
                .any(|m| m.axis > 2 || !(1..=3).contains(&m.q))
        {
            return None;
        }
        Some(Arc::new(scene))
    }
    fn duration(&self) -> f32 {
        self.size.max(3) as f32
    }
    fn frame(&self, seconds: f32) -> (usize, f32) {
        let progress = (seconds / self.duration()).clamp(0., 1.) * self.moves.len() as f32;
        let index = (progress.floor() as usize).min(self.moves.len());
        let fraction = progress.fract();
        (index, fraction * fraction * (3. - 2. * fraction))
    }
}

fn add(a: V, b: V) -> V {
    [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}
fn scale(a: V, f: f32) -> V {
    [a[0] * f, a[1] * f, a[2] * f]
}
fn rotate(mut v: V, axis: usize, angle: f32) -> V {
    let (s, c) = angle.sin_cos();
    let a = (axis + 1) % 3;
    let b = (axis + 2) % 3;
    (v[a], v[b]) = (c * v[a] - s * v[b], s * v[a] + c * v[b]);
    v
}
fn camera(v: V, yaw: f32, pitch: f32) -> V {
    rotate(rotate(v, 1, -yaw), 0, pitch)
}

// U, D, F, B, R, L in the same row-major order as shared/cube.ts.
fn geometry(size: usize, face: usize, row: usize, col: usize) -> (V, V) {
    let h = (size - 1) as f32 / 2.;
    let (r, c) = (row as f32, col as f32);
    match face {
        0 => ([c - h, h, r - h], [0., 1., 0.]),
        1 => ([c - h, -h, h - r], [0., -1., 0.]),
        2 => ([c - h, h - r, h], [0., 0., 1.]),
        3 => ([h - c, h - r, -h], [0., 0., -1.]),
        4 => ([h, h - r, h - c], [1., 0., 0.]),
        _ => ([-h, h - r, c - h], [-1., 0., 0.]),
    }
}
/// Seam between two faces near a cube vertex: a curve from the cube edge that
/// runs along axis `k` to the pulled-in tip, tangent to the edge at its start
/// and perpendicular to the cube diagonal at the tip. The three faces of a
/// corner share these curves, so their colours still meet without a gap.
fn tip_curve(vertex: V, k: usize) -> impl Iterator<Item = V> {
    let sign = vertex.map(f32::signum);
    let (mut start, mut control) = (vertex, vertex);
    start[k] -= sign[k] * TIP;
    control[k] -= sign[k] * 3. * TIP_DEPTH;
    let tip = add(vertex, scale(sign, -TIP_DEPTH));
    (0..=ARC_STEPS).map(move |step| {
        let t = step as f32 / ARC_STEPS as f32;
        add(
            add(scale(start, (1. - t) * (1. - t)), scale(control, 2. * t * (1. - t))),
            scale(tip, t * t),
        )
    })
}

/// Screen-space polygon in cube units, already in paint order.
struct Polygon {
    points: Vec<[f32; 2]>,
    color: u32,
    /// Open hairline instead of a filled shape.
    line: bool,
}

/// Convex hull (Andrew's monotone chain) of the projected corners of a box,
/// so a rigid block is painted as one seamless silhouette instead of many
/// abutting quads whose anti-aliased edges leave hairlines and gaps.
fn hull(mut points: Vec<[f32; 2]>) -> Vec<[f32; 2]> {
    points.sort_by(|a, b| a[0].total_cmp(&b[0]).then(a[1].total_cmp(&b[1])));
    points.dedup();
    if points.len() < 3 {
        return points;
    }
    let cross = |o: [f32; 2], a: [f32; 2], b: [f32; 2]| {
        (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    };
    let chain = |iter: &mut dyn Iterator<Item = &[f32; 2]>| {
        let mut out: Vec<[f32; 2]> = Vec::new();
        for p in iter {
            while out.len() >= 2 && cross(out[out.len() - 2], out[out.len() - 1], *p) <= 0. {
                out.pop();
            }
            out.push(*p);
        }
        out.pop();
        out
    };
    let mut lower = chain(&mut points.iter());
    let upper = chain(&mut points.iter().rev());
    lower.extend(upper);
    lower
}

fn polygons(scene: &Scene, seconds: f32, yaw: f32, pitch: f32) -> Vec<Polygon> {
    let (index, fraction) = scene.frame(seconds);
    let state = &scene.states[index];
    let h = (scene.size - 1) as f32 / 2.;
    // A move splits the cube into rigid slabs along its axis: the turning
    // layers and the resting ones. Between moves the whole cube is one block.
    let movement = scene.moves.get(index).filter(|_| fraction > 0.);
    let axis = movement.map_or(0, |m| m.axis);
    let moving = |layer: usize| {
        movement.is_some_and(|m| m.layers.contains(&(layer as f32 - h)))
    };
    let angle = movement.map_or(0., |m| {
        fraction * FRAC_PI_2 * if m.q == 3 { -1. } else { m.q as f32 }
    });
    let pose = |v: V, turning: bool| {
        camera(if turning { rotate(v, axis, angle) } else { v }, yaw, pitch)
    };
    let mut slabs: Vec<(usize, usize, bool)> = Vec::new();
    for layer in 0..scene.size {
        match slabs.last_mut() {
            Some((_, end, turning)) if *turning == moving(layer) => *end = layer,
            _ => slabs.push((layer, layer, moving(layer))),
        }
    }
    // Slabs are separated by planes normal to the axis, so painting them from
    // the far side of that axis to the near side is an exact occlusion order.
    let mut direction = [0.; 3];
    direction[axis] = 1.;
    let facing = camera(direction, yaw, pitch)[2];
    slabs.sort_by(|a, b| (a.0 as f32 * facing).total_cmp(&(b.0 as f32 * facing)));

    let area = scene.size * scene.size;
    let mut faces = Vec::new();
    for (start, end, turning) in slabs {
        let mut lo = [-h - 0.5; 3];
        let mut hi = [h + 0.5; 3];
        lo[axis] = start as f32 - h - 0.5;
        hi[axis] = end as f32 - h + 0.5;
        // Box corners that are cube vertices follow the rounded tip, so the
        // dark core never pokes out past the coloured pieces.
        let corners = (0..8)
            .flat_map(|i| {
                let pick = |k: usize| if i >> k & 1 == 0 { lo[k] } else { hi[k] };
                let v = [pick(0), pick(1), pick(2)];
                if v.iter().all(|c| c.abs() >= h + 0.5 - 0.0001) {
                    (0..3).flat_map(|k| tip_curve(v, k)).collect()
                } else {
                    vec![v]
                }
            })
            .map(|v| {
                let w = pose(v, turning);
                [w[0], w[1]]
            })
            .collect();
        faces.push(Polygon {
            points: hull(corners),
            color: CORE,
            line: false,
        });
        let mut edges = Vec::new();
        for (slot, origin) in state.iter().enumerate() {
            let (p, n) = geometry(
                scene.size,
                slot / area,
                slot % area / scene.size,
                slot % scene.size,
            );
            let layer = (p[axis] + h).round() as usize;
            if layer < start || layer > end || pose(n, turning)[2] <= 0.0001 {
                continue;
            }
            let normal_axis = n.iter().position(|v| *v != 0.).unwrap();
            let center = add(p, scale(n, 0.5));
            // Pull back from neighbouring pieces only; stay flush with the cube edge.
            let extent = |k: usize, sign: f32| {
                let mut e = [0.; 3];
                let outside = (p[k] + sign * 0.5).abs() >= h + 0.5 - 0.0001;
                e[k] = sign * if outside { 0.5 } else { 0.5 - SEAM };
                e
            };
            let (a, b) = ((normal_axis + 1) % 3, (normal_axis + 2) % 3);
            let outside = |k: usize, sign: f32| (p[k] + sign * 0.5).abs() >= h + 0.5 - 0.0001;
            // Every corner that touches no cube edge is rounded: all four on a
            // centre, the centre side of an edge, and the inner tip of a corner
            // piece, which only gets a softer radius.
            let sides = [(a, -1.), (a, 1.), (b, -1.), (b, 1.)];
            let is_corner = sides.iter().filter(|&&(k, sign)| outside(k, sign)).count() >= 2;
            let mut points = Vec::new();
            for (sa, sb) in [(-1., -1.), (1., -1.), (1., 1.), (-1., 1.)] {
                let tip = add(extent(a, sa), extent(b, sb));
                if outside(a, sa) && outside(b, sb) {
                    // Cube vertex: in along one shared seam, out along the other.
                    let (first, last) = if sa * sb > 0. { (b, a) } else { (a, b) };
                    let vertex = add(center, tip);
                    let seam_in = tip_curve(vertex, first);
                    let seam_out: Vec<V> = tip_curve(vertex, last).collect();
                    for v in seam_in.chain(seam_out.into_iter().rev().skip(1)) {
                        let w = pose(v, turning);
                        points.push([w[0], w[1]]);
                    }
                    continue;
                }
                if outside(a, sa) || outside(b, sb) {
                    let w = pose(add(center, tip), turning);
                    points.push([w[0], w[1]]);
                    continue;
                }
                let radius = if is_corner { CORNER_ROUND } else { ROUND };
                let mut arc_center = tip;
                arc_center[a] -= sa * radius;
                arc_center[b] -= sb * radius;
                let start = f32::atan2(sb, sa) - std::f32::consts::FRAC_PI_4;
                for step in 0..=ARC_STEPS {
                    let (sin, cos) = (start + FRAC_PI_2 * step as f32 / ARC_STEPS as f32).sin_cos();
                    let mut v = arc_center;
                    v[a] += cos * radius;
                    v[b] += sin * radius;
                    let w = pose(add(center, v), turning);
                    points.push([w[0], w[1]]);
                }
            }
            faces.push(Polygon {
                points,
                color: scene.colors[*origin],
                line: false,
            });
            // Where two colours of one piece meet on a cube edge, a hairline
            // separates them. The face with the lower axis draws the shared edge.
            for (k, along) in [(a, b), (b, a)] {
                for sign in [-1., 1.] {
                    let mut neighbour = [0.; 3];
                    neighbour[k] = sign;
                    if k < normal_axis || !outside(k, sign) || pose(neighbour, turning)[2] <= 0.0001 {
                        continue;
                    }
                    let end = |side: f32| {
                        let v = add(center, add(extent(k, sign), extent(along, side)));
                        if outside(along, side) {
                            tip_curve(v, along).collect()
                        } else {
                            vec![v]
                        }
                    };
                    edges.push(Polygon {
                        points: end(-1.)
                            .into_iter()
                            .rev()
                            .chain(end(1.))
                            .map(|v| {
                                let w = pose(v, turning);
                                [w[0], w[1]]
                            })
                            .collect(),
                        color: CORE,
                        line: true,
                    });
                }
            }
        }
        faces.extend(edges);
    }
    faces
}

pub fn drawing(scene: Arc<Scene>, seconds: f32, yaw: f32, pitch: f32) -> impl IntoElement {
    let faces = if seconds >= scene.duration() && yaw == YAW && pitch == PITCH {
        scene
            .thumbnail
            .get_or_init(|| Arc::new(polygons(&scene, seconds, yaw, pitch)))
            .clone()
    } else {
        Arc::new(polygons(&scene, seconds, yaw, pitch))
    };
    canvas(
        |_, _, _| (),
        move |bounds, _, window, _| {
            let unit =
                f32::from(bounds.size.width.min(bounds.size.height)) / (scene.size as f32 * 1.95);
            for polygon in faces.iter() {
                let mut path = if polygon.line {
                    PathBuilder::stroke(px(1.))
                } else {
                    PathBuilder::fill()
                };
                for (i, v) in polygon.points.iter().enumerate() {
                    let p = point(
                        bounds.center().x + px(v[0] * unit),
                        bounds.center().y - px(v[1] * unit),
                    );
                    if i == 0 {
                        path.move_to(p);
                    } else {
                        path.line_to(p);
                    }
                }
                if !polygon.line {
                    path.close();
                }
                if let Ok(path) = path.build() {
                    window.paint_path(path, rgb(polygon.color));
                }
            }
        },
    )
    .size_full()
}
pub fn thumbnail(scene: Arc<Scene>) -> impl IntoElement {
    let duration = scene.duration();
    drawing(scene, duration, YAW, PITCH)
}

pub struct CubeView {
    scene: Option<Arc<Scene>>,
    started: Option<Instant>,
    yaw: f32,
    pitch: f32,
    drag: Option<Point<Pixels>>,
}
impl CubeView {
    pub fn new() -> Self {
        Self {
            scene: None,
            started: None,
            yaw: YAW,
            pitch: PITCH,
            drag: None,
        }
    }
    pub fn load(&mut self, scene: Option<Arc<Scene>>, cx: &mut Context<Self>) {
        self.scene = scene;
        self.started = None;
        self.yaw = YAW;
        self.pitch = PITCH;
        cx.notify();
    }
    pub fn replay(&mut self, cx: &mut Context<Self>) {
        self.started = None;
        self.yaw = YAW;
        self.pitch = PITCH;
        cx.notify();
    }
}
impl Render for CubeView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let mut node = div()
            .id("cube-viewport")
            .size_full()
            .cursor_pointer()
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(|s, e: &MouseDownEvent, _, cx| {
                    s.drag = Some(e.position);
                    cx.stop_propagation();
                }),
            )
            .on_mouse_up(MouseButton::Left, cx.listener(|s, _, _, _| s.drag = None))
            .on_mouse_up_out(MouseButton::Left, cx.listener(|s, _, _, _| s.drag = None))
            .on_mouse_move(cx.listener(|s, e: &MouseMoveEvent, _, cx| {
                if let Some(last) = s.drag {
                    s.yaw -= f32::from(e.position.x - last.x) * 0.012;
                    s.pitch = (s.pitch + f32::from(e.position.y - last.y) * 0.012).clamp(-1.4, 1.4);
                    s.drag = Some(e.position);
                    cx.notify();
                }
            }));
        if let Some(scene) = &self.scene {
            let seconds = self
                .started
                .get_or_insert_with(Instant::now)
                .elapsed()
                .as_secs_f32();
            if seconds < scene.duration() && !scene.moves.is_empty() {
                window.request_animation_frame();
            }
            node = node.child(drawing(scene.clone(), seconds, self.yaw, self.pitch));
        }
        node
    }
}

#[cfg(test)]
mod tests {
    use super::{FRAC_PI_2, Move, Scene, rotate};
    #[test]
    fn animation_duration_scales_with_cube_size_independent_of_move_count() {
        for (size, duration) in [(2, 3.), (3, 3.), (4, 4.), (5, 5.), (6, 6.), (7, 7.)] {
            for count in [1, 7, 22, 100] {
                let scene = Scene {
                    size,
                    colors: vec![],
                    states: vec![],
                    moves: vec![
                        Move {
                            axis: 0,
                            layers: vec![1.],
                            q: 3
                        };
                        count
                    ],
                    thumbnail: Default::default(),
                };
                assert_eq!(scene.duration(), duration);
                assert_eq!(scene.frame(0.), (0, 0.));
                assert!(scene.frame(duration - 0.001).0 < count);
                assert_eq!(scene.frame(duration), (count, 0.));
                assert_eq!(scene.frame(30.), (count, 0.));
            }
        }
    }
    #[test]
    fn quarter_turns_follow_shared_coordinate_system() {
        let v = rotate([1., 1., 1.], 0, -FRAC_PI_2);
        for (actual, expected) in v.into_iter().zip([1., 1., -1.]) {
            assert!((actual - expected).abs() < 0.0001);
        }
    }
}
