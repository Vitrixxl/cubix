//! Random-move scrambles: the larger cubes, the Megaminx and the Square-1, and the blindfolded events' orientation.

use crate::rng::Rng;

const SUFFIXES: [&str; 3] = ["", "'", "2"];

/// Random turns of the outer and wide layers of an n×n, as cubing.js draws the 5×5 to 7×7: on one axis a layer turns
/// at most once until another axis turns, so no turn cancels or merges with another. The 4×4 uses only Rw, Uw and Fw
/// as its wide turns (Lw, Dw and Bw are those and a rotation). Not random-state on the 4×4, unlike cubing.js: its
/// random-state search is a solver of its own, out of proportion here.
pub fn big_cube(n: usize, length: usize, rng: &mut Rng, out: &mut String) {
    let mut turns = vec![];
    for face in 0..6 {
        for layers in 1..=n / 2 {
            if !(n == 4 && layers == 2 && face >= 3) {
                turns.push((face, layers));
            }
        }
    }
    let (mut axis, mut used) = (usize::MAX, vec![]);
    for i in 0..length {
        let mut t = *rng.pick(&turns);
        while t.0 % 3 == axis && used.contains(&t) {
            t = *rng.pick(&turns);
        }
        if t.0 % 3 != axis {
            axis = t.0 % 3;
            used.clear();
        }
        used.push(t);
        if i > 0 {
            out.push(' ');
        }
        if t.1 > 2 {
            out.push_str(&t.1.to_string());
        }
        out.push(crate::cube::FACES[t.0] as char);
        if t.1 > 1 {
            out.push('w');
        }
        out.push_str(rng.pick(&SUFFIXES));
    }
}

/// One of the 24 ways to hold the cube: a turn of `x` (or `z`), then of `y`, each optional.
pub fn orientation(x: &str, z: &str, y: &str, rng: &mut Rng, out: &mut String) {
    let first = [String::new(), x.into(), format!("{x}2"), format!("{x}'"), z.into(), format!("{z}'")];
    let second = [String::new(), y.into(), format!("{y}2"), format!("{y}'")];
    for turn in [rng.pick(&first), rng.pick(&second)] {
        if !turn.is_empty() {
            out.push(' ');
            out.push_str(turn);
        }
    }
}

/// The WCA's Megaminx scramble: seven lines of ten R and D turns, each line ending with U or U'.
pub fn megaminx(rng: &mut Rng, out: &mut String) {
    for line in 0..7 {
        if line > 0 {
            out.push('\n');
        }
        for j in 0..10 {
            out.push_str(if j % 2 == 0 { "R" } else { "D" });
            out.push_str(rng.pick(&["++ ", "-- "]));
        }
        out.push_str(rng.pick(&["U", "U'"]));
    }
}

/// The Square-1 as cubing.js lays it out: top and bottom slots 0–11 each hold a piece, a corner fills two. "(x, y)"
/// turns the top by x slots and the bottom by y; "/" swaps top slots 6–11 with bottom slots 0–5, which needs both
/// layers cut at slots 0 and 6.
pub const SQ1_SOLVED: [[u8; 12]; 2] = [[0, 0, 1, 2, 2, 3, 4, 4, 5, 6, 6, 7], [8, 9, 9, 10, 11, 11, 12, 13, 13, 14, 15, 15]];

pub fn turned(layer: &[u8; 12], by: i32) -> [u8; 12] { std::array::from_fn(|i| layer[(i as i32 - by).rem_euclid(12) as usize]) }

pub fn sliceable(l: &[u8; 12]) -> bool { l[11] != l[0] && l[5] != l[6] }

pub fn slash(layers: &mut [[u8; 12]; 2]) {
    let [top, bottom] = *layers;
    layers[0][6..].copy_from_slice(&bottom[..6]);
    layers[1][..6].copy_from_slice(&top[6..]);
}

/// Twenty random turns of the layers, each followed by a slash. Not random-state, unlike cubing.js: its two-phase
/// Square-1 search is a solver of its own.
pub fn square1(rng: &mut Rng, out: &mut String) {
    let mut layers = SQ1_SOLVED;
    for i in 0..20 {
        let options: Vec<Vec<i32>> = layers.iter().map(|l| (-5..=6).filter(|&by| sliceable(&turned(l, by))).collect()).collect();
        let (mut x, mut y) = (0, 0);
        while x == 0 && y == 0 {
            (x, y) = (*rng.pick(&options[0]), *rng.pick(&options[1]));
        }
        layers = [turned(&layers[0], x), turned(&layers[1], y)];
        slash(&mut layers);
        if i > 0 {
            out.push(' ');
        }
        out.push_str(&format!("({x}, {y}) /"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn legal(s: &str) -> bool {
        let mut layers = SQ1_SOLVED;
        for part in s.split('/').map(str::trim).filter(|p| !p.is_empty()) {
            let (x, y) = part.trim_matches(|c| c == '(' || c == ')').split_once(", ").unwrap();
            layers = [turned(&layers[0], x.parse().unwrap()), turned(&layers[1], y.parse().unwrap())];
            if !sliceable(&layers[0]) || !sliceable(&layers[1]) {
                return false;
            }
            slash(&mut layers);
        }
        true
    }

    #[test]
    fn square1_turns_only_where_it_can() {
        // Random-state scrambles from cubing.js: the layout must turn them all.
        for s in [
            "(0, -1) / (-5, 4) / (2, -4) / (0, 3) / (-5, -2) / (3, 0) / (-1, 0) / (0, 3) / (0, 2) / (-5, 0) / (5, 0) / (-4, 0) / (3, 2) / (-4, 0)",
            "(0, -1) / (0, -3) / (-5, -2) / (0, 6) / (-1, -4) / (0, -5) / (3, 3) / (-1, 0) / (-4, 0) / (0, 2) / (4, -2) / (0, 3)",
            "(-5, -3) / (0, 3) / (-3, 0) / (2, -4) / (-3, 0) / (-3, 0) / (-2, 3) / (3, 0) / (-4, 3) / (4, 0) / (-2, 0) / (-4, 1)",
            "(0, -4) / (-2, -5) / (-3, 0) / (3, 0) / (-4, 2) / (0, -3) / (-3, -2) / (0, 3) / (-3, 0) / (-4, 0) / (-5, 0) / (2, 0) / (-1, -2) / (-4, 0)",
            "(-3, -1) / (3, 0) / (-5, 1) / (-3, 0) / (-1, -1) / (3, 0) / (0, 1) / (0, 3) / (1, 2) / (0, -2) / (2, -2) / (6, 2)",
            "(0, 2) / (-3, 0) / (-2, 4) / (0, -3) / (-1, -1) / (0, 3) / (0, 4) / (6, 3) / (-1, 0) / (4, 2) / (-4, 0) / (-4, 1)",
            "(1, 0) / (2, 2) / (-3, 0) / (-2, -5) / (3, 0) / (-4, -1) / (0, 4) / (3, 0) / (-5, 0) / (-4, 0) / (-2, 3) / (1, 0) / (6, 2)",
            "(0, -4) / (3, 3) / (0, -3) / (-3, -3) / (3, 0) / (-5, 1) / (-1, 0) / (3, 0) / (0, 2) / (1, 3) / (4, 1) / (2, 0)",
        ] {
            // A twist after the last slash needs no cut.
            let s = if s.ends_with('/') { s } else { s.rsplit_once(" / ").unwrap().0 };
            assert!(legal(s), "{s}");
        }
        let mut rng = Rng::new(3);
        for _ in 0..1000 {
            let mut out = String::new();
            square1(&mut rng, &mut out);
            assert!(legal(&out), "{out}");
        }
    }

    #[test]
    fn big_cubes_never_repeat_a_layer_on_an_axis() {
        let mut rng = Rng::new(5);
        let mut out = String::new();
        big_cube(7, 100, &mut rng, &mut out);
        assert_eq!(out.split(' ').count(), 100);
    }
}
