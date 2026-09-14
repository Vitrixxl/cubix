//! Small native 3D viewport. Geometry is projected into GPUI's canvas; states
//! and move definitions come from the shared, tested TypeScript cube model.
use gpui::{prelude::*, *};
use serde::Deserialize;
use std::{f32::consts::FRAC_PI_2, sync::Arc, time::Instant};

const DURATION: f32 = 3.0;
const YAW: f32 = std::f32::consts::FRAC_PI_4;
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
    fn frame(&self, seconds: f32) -> (usize, f32) {
        let progress = (seconds / DURATION).clamp(0., 1.) * self.moves.len() as f32;
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
struct Polygon {
    vertices: [V; 4],
    depth: f32,
    color: u32,
}

fn polygons(scene: &Scene, seconds: f32, yaw: f32, pitch: f32) -> Vec<Polygon> {
    let (index, fraction) = scene.frame(seconds);
    let state = &scene.states[index];
    let movement = scene.moves.get(index);
    let pose = |v: V, p: V| {
        let v = if let Some(m) = movement.filter(|m| m.layers.contains(&p[m.axis])) {
            rotate(
                v,
                m.axis,
                fraction * FRAC_PI_2 * if m.q == 3 { -1. } else { m.q as f32 },
            )
        } else {
            v
        };
        camera(v, yaw, pitch)
    };
    let mut faces = Vec::new();
    let mut quad = |p: V, n: V, half: f32, offset: f32, color: u32| {
        if pose(n, p)[2] <= 0.0001 {
            return;
        }
        let axis = n.iter().position(|v| *v != 0.).unwrap();
        let mut u = [0.; 3];
        u[(axis + 1) % 3] = half;
        let mut v = [0.; 3];
        v[(axis + 2) % 3] = half;
        let center = add(p, scale(n, offset));
        let vertices = [(-1., -1.), (1., -1.), (1., 1.), (-1., 1.)]
            .map(|(a, b)| pose(add(center, add(scale(u, a), scale(v, b))), p));
        let depth = vertices.iter().map(|v| v[2]).sum::<f32>() / 4.;
        faces.push(Polygon {
            vertices,
            depth,
            color,
        });
    };
    // Closed cubies provide the dark interior exposed during slice rotations.
    let h = (scene.size - 1) as f32 / 2.;
    for x in 0..scene.size {
        for y in 0..scene.size {
            for z in 0..scene.size {
                let p = [x as f32 - h, y as f32 - h, z as f32 - h];
                for face in 0..6 {
                    let (_, n) = geometry(scene.size, face, 0, 0);
                    quad(p, n, 0.49, 0.49, 0x101015);
                }
            }
        }
    }
    for (slot, origin) in state.iter().enumerate() {
        let area = scene.size * scene.size;
        let (p, n) = geometry(
            scene.size,
            slot / area,
            slot % area / scene.size,
            slot % scene.size,
        );
        quad(p, n, 0.435, 0.501, scene.colors[*origin]);
    }
    faces.sort_by(|a, b| a.depth.total_cmp(&b.depth));
    faces
}

pub fn drawing(scene: Arc<Scene>, seconds: f32, yaw: f32, pitch: f32) -> impl IntoElement {
    canvas(
        |_, _, _| (),
        move |bounds, _, window, _| {
            let unit =
                f32::from(bounds.size.width.min(bounds.size.height)) / (scene.size as f32 * 1.95);
            for polygon in polygons(&scene, seconds, yaw, pitch) {
                let mut path = PathBuilder::fill();
                for (i, v) in polygon.vertices.iter().enumerate() {
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
                path.close();
                if let Ok(path) = path.build() {
                    window.paint_path(path, rgb(polygon.color));
                }
            }
        },
    )
    .size_full()
}
pub fn thumbnail(scene: Arc<Scene>) -> impl IntoElement {
    drawing(scene, DURATION, YAW, PITCH)
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
            if seconds < DURATION && !scene.moves.is_empty() {
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
    fn animation_finishes_at_three_seconds_independent_of_move_count() {
        for count in [1, 7, 22, 100] {
            let scene = Scene {
                size: 3,
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
            };
            assert_eq!(scene.frame(0.), (0, 0.));
            assert!(scene.frame(2.999).0 < count);
            assert_eq!(scene.frame(3.), (count, 0.));
            assert_eq!(scene.frame(30.), (count, 0.));
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
