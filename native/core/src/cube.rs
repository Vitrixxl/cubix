//! An N×N×N cube as its stickers, turned by a scramble's moves: what the scramble preview draws. Each sticker keeps
//! its place and the face it looks at, on doubled coordinates (-(N-1)..=N-1, faces at ±N), so every move is one
//! quarter rotation of the stickers on its layers.

/// Face colours, the order of the web's `k-f0…5`: white, yellow, green, blue, red, orange.
pub const WHITE: u8 = 0;
pub const YELLOW: u8 = 1;
pub const GREEN: u8 = 2;
pub const BLUE: u8 = 3;
pub const RED: u8 = 4;
pub const ORANGE: u8 = 5;

#[derive(Clone, Copy, Debug)]
struct Sticker {
    pos: [i32; 3],
    normal: [i32; 3],
    colour: u8,
}

#[derive(Clone, Debug)]
pub struct Cube {
    pub n: usize,
    stickers: Vec<Sticker>,
}

/// The six faces: their normal (x right, y up, z front) and colour, held white on top and green in front.
pub const FACES: [([i32; 3], u8); 6] = [([0, 1, 0], WHITE), ([0, -1, 0], YELLOW), ([0, 0, 1], GREEN), ([0, 0, -1], BLUE), ([1, 0, 0], RED), ([-1, 0, 0], ORANGE)];

/// A quarter turn about `axis`, counter-clockwise seen from its positive side.
fn quarter(v: [i32; 3], axis: usize) -> [i32; 3] {
    let [x, y, z] = v;
    match axis {
        0 => [x, -z, y],
        1 => [z, y, -x],
        _ => [-y, x, z],
    }
}

impl Cube {
    pub fn solved(n: usize) -> Self {
        let m = n as i32 - 1;
        let mut stickers = Vec::with_capacity(6 * n * n);
        for (normal, colour) in FACES {
            let axis = normal.iter().position(|c| *c != 0).unwrap();
            for a in (-m..=m).step_by(2) {
                for b in (-m..=m).step_by(2) {
                    let mut pos = [0; 3];
                    let (u, v) = ((axis + 1) % 3, (axis + 2) % 3);
                    pos[axis] = normal[axis] * n as i32;
                    pos[u] = a;
                    pos[v] = b;
                    stickers.push(Sticker { pos, normal, colour });
                }
            }
        }
        Self { n, stickers }
    }

    /// Applies a scramble in WCA notation (R, U', F2, Rw, 3Rw, 2R, x, y2…). Returns false on a move it cannot read,
    /// which leaves the moves before it applied.
    pub fn apply(&mut self, scramble: &str) -> bool { scramble.split_whitespace().all(|m| self.turn(m)) }

    fn turn(&mut self, mv: &str) -> bool {
        let Some(m) = crate::alg::parse(mv, self.n) else { return false };
        self.turn_layers(m.axis, &m.layers, m.quarters);
        true
    }

    /// Turns the layers (doubled coordinates along `axis`) by `quarters` counter-clockwise quarters about the axis.
    pub fn turn_layers(&mut self, axis: usize, layers: &[i32], quarters: u8) {
        let n = self.n as i32;
        for s in &mut self.stickers {
            // A sticker on the face plane itself belongs to the outer layer.
            let c = s.pos[axis].clamp(-(n - 1), n - 1);
            if !layers.contains(&c) { continue }
            for _ in 0..quarters {
                s.pos = quarter(s.pos, axis);
                s.normal = quarter(s.normal, axis);
            }
        }
    }

    /// Each sticker: where it sits (doubled coordinates, faces at ±N), the way it faces, its colour.
    pub fn stickers(&self) -> impl Iterator<Item = ([i32; 3], [i32; 3], u8)> + '_ { self.stickers.iter().map(|s| (s.pos, s.normal, s.colour)) }

    /// The colour at the centre of each face, U D F B R L (odd cubes; the corner of the face otherwise).
    pub fn centres(&self) -> [u8; 6] {
        let n = self.n as i32;
        let m = if n % 2 == 1 { 0 } else { 1 };
        FACES.map(|(normal, _)| {
            let axis = normal.iter().position(|c| *c != 0).unwrap();
            self.stickers.iter().find(|s| s.normal == normal && (0..3).all(|i| if i == axis { true } else { s.pos[i] == m })).map_or(0, |s| s.colour)
        })
    }

    pub fn is_solved(&self) -> bool { self.net().iter().all(|f| f.iter().all(|s| *s == f[0])) }

    /// The colour of the sticker facing `normal` at `pos`.
    pub fn at(&self, pos: [i32; 3], normal: [i32; 3]) -> Option<u8> { self.stickers.iter().find(|s| s.pos == pos && s.normal == normal).map(|s| s.colour) }

    /// Colours every sticker from a net (as `net` gives it).
    pub fn set_net(&mut self, faces: &[Vec<u8>; 6]) {
        let m = self.n as i32 - 1;
        let n = self.n as i32;
        let order: [[i32; 3]; 6] = [[0, 1, 0], [-1, 0, 0], [0, 0, 1], [1, 0, 0], [0, 0, -1], [0, -1, 0]];
        for s in &mut self.stickers {
            let Some(f) = order.iter().position(|o| *o == s.normal) else { continue };
            let [x, y, z] = s.pos;
            let (col, row) = match f {
                0 => (x + m, z + m),
                1 => (z + m, m - y),
                2 => (x + m, m - y),
                3 => (m - z, m - y),
                4 => (m - x, m - y),
                _ => (x + m, m - z),
            };
            if let Some(c) = faces[f].get((row / 2 * n + col / 2) as usize) { s.colour = *c }
        }
    }

    /// The cube unfolded: for each face, U L F R B D, its stickers row by row as seen in the net (U above F, D below).
    pub fn net(&self) -> [Vec<u8>; 6] {
        let n = self.n as i32;
        let m = n - 1;
        let order: [[i32; 3]; 6] = [[0, 1, 0], [-1, 0, 0], [0, 0, 1], [1, 0, 0], [0, 0, -1], [0, -1, 0]];
        let mut out: [Vec<u8>; 6] = Default::default();
        for (f, normal) in order.iter().enumerate() {
            let mut grid = vec![0u8; (n * n) as usize];
            for s in self.stickers.iter().filter(|s| s.normal == *normal) {
                let [x, y, z] = s.pos;
                let (col, row) = match f {
                    0 => (x + m, z + m),     // U: back row first
                    1 => (z + m, m - y),     // L: back on the left
                    2 => (x + m, m - y),     // F
                    3 => (m - z, m - y),     // R: front on the left
                    4 => (m - x, m - y),     // B
                    _ => (x + m, m - z),     // D: front row first
                };
                grid[(row / 2 * n + col / 2) as usize] = s.colour;
            }
            out[f] = grid;
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn solved(c: &Cube) -> bool { c.net().iter().all(|f| f.iter().all(|s| *s == f[0])) }

    #[test]
    fn moves_cycle_back() {
        let mut c = Cube::solved(3);
        for _ in 0..6 { assert!(c.apply("R U R' U'")) }
        assert!(solved(&c));
        let mut c = Cube::solved(4);
        assert!(c.apply("Rw U2 3Fw' x y2 2R"));
        assert!(!solved(&c));
        assert!(c.apply("2R' y2 x' 3Fw U2 Rw'"));
        assert!(solved(&c));
    }

    #[test]
    fn r_brings_the_front_up() {
        let mut c = Cube::solved(3);
        c.apply("R");
        let net = c.net();
        // U's right column is green now, F's right column yellow.
        assert_eq!([net[0][2], net[0][5], net[0][8]], [GREEN; 3]);
        assert_eq!([net[2][2], net[2][5], net[2][8]], [YELLOW; 3]);
        assert_eq!(net[0][0], WHITE);
        let mut c = Cube::solved(3);
        c.apply("U");
        // U turns the front row to the left: F's top row shows what was on R.
        assert_eq!(c.net()[2][0..3], [RED; 3]);
    }
}
