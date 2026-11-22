//! The cube drawn: in 3D (its cubies in perspective, a layer turning when the player plays a move) and seen from above
//! (a last-layer case, its top and the top row of each side). Stickers are coloured by the face they belong to, in the
//! cases' scheme (yellow on top, blue in front), and greyed where a case's stage does not look.
use iced::widget::canvas::{Frame, Path};
use iced::{Color, Point, Size};
use qbix_core::cube::Cube;

const fn hex(rgb: u32) -> Color { Color::from_rgb8((rgb >> 16) as u8, (rgb >> 8) as u8, rgb as u8) }

/// The cases' scheme, by the face a sticker started on (U D F B R L): yellow top, blue front, red right.
pub const CASE: [Color; 6] = [hex(0xf5d453), hex(0xf4f1ec), hex(0x5f8fe3), hex(0x4fbf7f), hex(0xe25c62), hex(0xf79a49)];
/// A scramble's scheme, white on top and green in front, as the WCA holds it.
pub const WCA: [Color; 6] = [hex(0xf6f4ef), hex(0xf5d453), hex(0x4fbf7f), hex(0x5f8fe3), hex(0xe25c62), hex(0xf79a49)];
pub const GREY: Color = hex(0xc8cad8);
const DIM: Color = hex(0xb4b6c8);
pub const BODY: Color = hex(0x2c2f55);

/// The pieces a case shows (src/shared/cubeAppearance.ts's masks, the ones the catalogue uses).
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Mask {
    Full,
    Oll,
    Pll,
    Cmll,
    F2l,
    /// The first two layers' colours and the top's orientation.
    LastSlot,
}

impl Mask {
    pub fn for_stage(stage: &str) -> Self {
        match stage {
            "OLL" => Mask::Oll,
            "Last slot" => Mask::LastSlot,
            "PLL" | "ZBLL" | "OLLCP" | "COLL" => Mask::Pll,
            "CMLL" => Mask::Cmll,
            "F2L" => Mask::F2l,
            _ => Mask::Full,
        }
    }
    pub fn for_name(name: Option<&str>) -> Self {
        match name {
            Some("OLL") | Some("EO") => Mask::Oll,
            Some("PLL") => Mask::Pll,
            Some("CMLL") => Mask::Cmll,
            Some("F2L") => Mask::F2l,
            _ => Mask::Full,
        }
    }
}

/// Whether a stage's cases read best from above.
pub fn top_view(stage: &str) -> bool { matches!(stage, "OLL" | "PLL" | "ZBLL" | "OLLCP" | "COLL" | "CMLL" | "CLL" | "EG" | "ELL" | "TTLL" | "TCLL" | "PBL") }

/// A sticker's colour: its face's in `scheme`, or grey where `mask` hides it.
pub fn colour(scheme: &[Color; 6], mask: Mask, n: i32, pos: [i32; 3], face: u8) -> Color {
    let top = pos[1] >= n - 1;
    let real = scheme[face as usize];
    let oriented = if face == 0 { real } else { GREY };
    match mask {
        Mask::Full => real,
        Mask::Pll => if top { real } else { DIM },
        Mask::Oll => if top { oriented } else { DIM },
        Mask::LastSlot => if top { oriented } else { real },
        Mask::F2l => if top { GREY } else { real },
        Mask::Cmll => {
            let corner = pos[0].abs() >= n - 1 && pos[2].abs() >= n - 1;
            if top { if corner { real } else { GREY } } else if pos[0] == 0 { DIM } else { real }
        }
    }
}

/// The view of a 3D cube: how it is turned towards the eye, and a layer part way through a turn.
#[derive(Clone, Debug)]
pub struct View3 {
    pub yaw: f32,
    pub pitch: f32,
    /// The axis, the layers (doubled coordinates) and the angle (radians, counter-clockwise about the axis).
    pub turning: Option<(usize, Vec<i32>, f32)>,
}

impl Default for View3 {
    fn default() -> Self { Self { yaw: -0.62, pitch: 0.52, turning: None } }
}

fn rotate(v: [f32; 3], axis: usize, a: f32) -> [f32; 3] {
    let (s, c) = a.sin_cos();
    let [x, y, z] = v;
    match axis {
        0 => [x, y * c - z * s, y * s + z * c],
        1 => [x * c + z * s, y, -x * s + z * c],
        _ => [x * c - y * s, x * s + y * c, z],
    }
}

/// Draws `cube` in 3D, filling `size`.
pub fn draw(frame: &mut Frame, size: Size, cube: &Cube, scheme: &[Color; 6], mask: Mask, view: &View3) {
    let n = cube.n as i32;
    let nf = n as f32;
    // Doubled coordinates to the unit cube: half size 1.
    let unit = 1.0 / nf;
    let eye = |p: [f32; 3]| rotate(rotate(p, 1, view.yaw), 0, view.pitch);
    let scale = size.width.min(size.height) * 0.30;
    let centre = Point::new(size.width / 2.0, size.height / 2.0);
    let project = |p: [f32; 3]| {
        let k = 5.5 / (5.5 - p[2]);
        Point::new(centre.x + p[0] * scale * k, centre.y - p[1] * scale * k)
    };
    let turn = |p: [f32; 3], cubie: [i32; 3]| match &view.turning {
        Some((axis, layers, angle)) if layers.contains(&cubie[*axis]) => rotate(p, *axis, *angle),
        _ => p,
    };
    struct Quad {
        depth: f32,
        points: Vec<Point>,
        fill: Color,
    }
    let mut quads: Vec<Quad> = vec![];
    let light = {
        let l = [-0.35f32, 0.8, 0.5];
        let m = (l[0] * l[0] + l[1] * l[1] + l[2] * l[2]).sqrt();
        [l[0] / m, l[1] / m, l[2] / m]
    };
    let shade = |c: Color, normal: [f32; 3], amount: f32| {
        let d = (normal[0] * light[0] + normal[1] * light[1] + normal[2] * light[2]).max(0.0);
        let k = 1.0 - amount + amount * (0.55 + 0.45 * d);
        Color { r: c.r * k, g: c.g * k, b: c.b * k, a: c.a }
    };
    // A face's outline, its corners rounded: the corners of the square (±h on u and v) cut by `r`.
    let face = |cubie: [i32; 3], centre: [f32; 3], u: [f32; 3], v: [f32; 3], h: f32, r: f32| -> Vec<Point> {
        let mut pts = vec![];
        let corners = [(1.0, 1.0), (-1.0, 1.0), (-1.0, -1.0), (1.0, -1.0)];
        for (i, (cu, cv)) in corners.iter().enumerate() {
            let start = std::f32::consts::FRAC_PI_2 * i as f32;
            for k in 0..=3 {
                let a = start + std::f32::consts::FRAC_PI_2 * k as f32 / 3.0;
                let (du, dv) = (cu * (h - r) + r * a.cos(), cv * (h - r) + r * a.sin());
                let p = [centre[0] + u[0] * du + v[0] * dv, centre[1] + u[1] * du + v[1] * dv, centre[2] + u[2] * du + v[2] * dv];
                pts.push(project(eye(turn(p, cubie))));
            }
        }
        pts
    };
    let axes = |axis: usize| -> ([f32; 3], [f32; 3]) {
        let mut u = [0.0; 3];
        let mut v = [0.0; 3];
        u[(axis + 1) % 3] = 1.0;
        v[(axis + 2) % 3] = 1.0;
        (u, v)
    };
    // The cubies: those on the surface, each a dark body.
    let mut cubies = vec![];
    for x in (-(n - 1)..=n - 1).step_by(2) {
        for y in (-(n - 1)..=n - 1).step_by(2) {
            for z in (-(n - 1)..=n - 1).step_by(2) {
                if x.abs() == n - 1 || y.abs() == n - 1 || z.abs() == n - 1 { cubies.push([x, y, z]) }
            }
        }
    }
    for c in &cubies {
        let cf = [c[0] as f32 * unit, c[1] as f32 * unit, c[2] as f32 * unit];
        for axis in 0..3 {
            for sign in [-1.0f32, 1.0] {
                let mut normal = [0.0; 3];
                normal[axis] = sign;
                let rn = eye(turn(normal, *c));
                if rn[2] <= 0.0 { continue }
                let mut centre = cf;
                centre[axis] += sign * unit;
                let (u, v) = axes(axis);
                let depth = eye(turn(centre, *c))[2];
                quads.push(Quad { depth, points: face(*c, centre, u, v, unit * 0.995, unit * 0.18), fill: shade(BODY, rn, 0.5) });
            }
        }
    }
    for (pos, normal, colour_of) in cube.stickers() {
        let axis = normal.iter().position(|v| *v != 0).unwrap();
        let mut cubie = pos;
        cubie[axis] = normal[axis] * (n - 1);
        let rn = eye(turn(normal.map(|v| v as f32), cubie));
        if rn[2] <= 0.0 { continue }
        let mut centre = [pos[0] as f32 * unit, pos[1] as f32 * unit, pos[2] as f32 * unit];
        centre[axis] += normal[axis] as f32 * 0.004;
        let (u, v) = axes(axis);
        let depth = eye(turn(centre, cubie))[2] + 0.001;
        let fill = shade(colour(scheme, mask, n, pos, colour_of), rn, 0.32);
        quads.push(Quad { depth, points: face(cubie, centre, u, v, unit * 0.88, unit * 0.28), fill });
    }
    quads.sort_by(|a, b| a.depth.total_cmp(&b.depth));
    for q in quads {
        let path = Path::new(|b| {
            b.move_to(q.points[0]);
            for p in &q.points[1..] {
                b.line_to(*p);
            }
            b.close();
        });
        frame.fill(&path, q.fill);
    }
}

/// Draws a last-layer case from above: the top face and, around it, the top row of each side.
pub fn draw_top(frame: &mut Frame, size: Size, cube: &Cube, scheme: &[Color; 6], mask: Mask) {
    let n = cube.n;
    let net = cube.net();
    let side = size.width.min(size.height);
    // The grid takes n cells, each strip a third of a cell, with a small gap.
    let cell = side / (n as f32 + 0.9);
    let strip = cell * 0.36;
    let gap = cell * 0.09;
    let origin = Point::new((size.width - cell * n as f32) / 2.0, (size.height - cell * n as f32) / 2.0);
    let m = n as i32 - 1;
    let sticker = |frame: &mut Frame, x: f32, y: f32, w: f32, h: f32, c: Color| {
        let r = (w.min(h) * 0.22).min(5.0);
        frame.fill(&Path::rounded_rectangle(Point::new(x + gap / 2.0, y + gap / 2.0), Size::new(w - gap, h - gap), r.into()), c);
    };
    let ni = n as i32;
    let tone = |face_colour: u8, pos: [i32; 3]| colour(scheme, mask, ni, pos, face_colour);
    for row in 0..n {
        for col in 0..n {
            let c = net[0][row * n + col];
            let pos = [(col as i32) * 2 - m, ni, (row as i32) * 2 - m];
            sticker(frame, origin.x + col as f32 * cell, origin.y + row as f32 * cell, cell, cell, tone(c, pos));
        }
    }
    let total = cell * n as f32;
    for i in 0..n {
        let f = i as f32 * cell;
        // Back (B's top row seen from above runs right to left), left, right, front.
        let b = net[4][n - 1 - i];
        sticker(frame, origin.x + f, origin.y - strip - gap * 0.2, cell, strip, tone(b, [0, m, -m]));
        let l = net[1][i];
        sticker(frame, origin.x - strip - gap * 0.2, origin.y + f, strip, cell, tone(l, [-m, m, 0]));
        let r = net[3][n - 1 - i];
        sticker(frame, origin.x + total + gap * 0.2, origin.y + f, strip, cell, tone(r, [m, m, 0]));
        let fr = net[2][i];
        sticker(frame, origin.x + f, origin.y + total + gap * 0.2, cell, strip, tone(fr, [0, m, m]));
    }
}
