//! The app's scrambles, drawn on the device (offline too): the `ScrambleEngine` of
//! src/client/lib/practiceScrambleCore.ts, built to WebAssembly (scrambler/build.ts). Random-state for the 2×2, 3×3,
//! Pyraminx, Skewb and Clock; random moves for the larger cubes, the Megaminx and the Square-1.

mod cube;
mod moves;
mod rng;
mod small;

pub use rng::Rng;

/// Writes a competition scramble of `event` (as cubing.js's randomScrambleForEvent), or returns false if unknown.
pub fn event(id: &str, rng: &mut Rng, out: &mut String) -> bool {
    let random333 = |rng: &mut Rng, out: &mut String| cube::write(&cube::solve(&cube::random_cube(rng, true, true)), out);
    match id {
        "222" => small::scramble222(rng, out),
        "333" | "333oh" => random333(rng, out),
        "333fm" => cube::fewest_moves(&cube::random_cube(rng, true, true), out),
        // One cube of a Multi-Blind attempt: a 3×3 blindfolded scramble (the app asks one per cube).
        "333bf" | "333mbf" => {
            random333(rng, out);
            moves::orientation("Rw", "Fw", "Uw", rng, out);
        }
        "444" => moves::big_cube(4, 40, rng, out),
        "444bf" => {
            moves::big_cube(4, 40, rng, out);
            moves::orientation("x", "z", "y", rng, out);
        }
        "555" => moves::big_cube(5, 60, rng, out),
        "555bf" => {
            moves::big_cube(5, 60, rng, out);
            moves::orientation("3Rw", "3Fw", "3Uw", rng, out);
        }
        "666" => moves::big_cube(6, 80, rng, out),
        "777" => moves::big_cube(7, 100, rng, out),
        "sq1" => moves::square1(rng, out),
        "pyram" => small::scramble_pyraminx(rng, out),
        "skewb" => small::scramble_skewb(rng, out),
        "minx" => moves::megaminx(rng, out),
        "clock" => moves::clock(rng, out),
        _ => return false,
    }
    true
}

/// A random-state scramble of the 3×3's edges (or corners) alone, the rest solved.
pub fn orbit(corners: bool, rng: &mut Rng, out: &mut String) {
    cube::write(&cube::solve(&cube::random_cube(rng, !corners, corners)), out)
}

/// The scramble reaching a 3×3 state given in cubing.js's pattern layout, or false if it is not a solvable cube. The
/// same state always gives the same scramble.
pub fn pattern(edges: &[u8], edge_twists: &[u8], corners: &[u8], corner_twists: &[u8], out: &mut String) -> bool {
    match cube::Cube::from_cubing(edges, edge_twists, corners, corner_twists) {
        Some(c) => {
            cube::write(&cube::solve(&c), out);
            true
        }
        None => false,
    }
}

/// Builds the 3×3's tables now rather than with the first scramble.
pub fn prepare() { cube::tables(); }

/// The WebAssembly interface, without bindings: the caller seeds, writes its input at io(), calls, and reads the
/// scramble back from io() (the call returns its length, -1 for an error).
#[cfg(target_arch = "wasm32")]
mod wasm {
    use super::*;
    use std::cell::RefCell;

    thread_local! {
        static STATE: RefCell<(Rng, String)> = const { RefCell::new((Rng::new(0x9e3779b97f4a7c15), String::new())) };
    }
    static mut IO: [u8; 4096] = [0; 4096];

    fn io_bytes() -> &'static mut [u8; 4096] { unsafe { &mut *std::ptr::addr_of_mut!(IO) } }

    fn answer(f: impl FnOnce(&mut Rng, &mut String) -> bool) -> isize {
        STATE.with_borrow_mut(|(rng, out)| {
            out.clear();
            if !f(rng, out) {
                return -1;
            }
            io_bytes()[..out.len()].copy_from_slice(out.as_bytes());
            out.len() as isize
        })
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn io() -> *mut u8 { std::ptr::addr_of_mut!(IO) as *mut u8 }

    #[unsafe(no_mangle)]
    pub extern "C" fn seed(a: u32, b: u32) { STATE.with_borrow_mut(|(rng, _)| *rng = Rng::new((a as u64) << 32 | b as u64)) }

    #[unsafe(no_mangle)]
    pub extern "C" fn warm() { prepare() }

    /// The event's name is at io(), `len` bytes.
    #[unsafe(no_mangle)]
    pub extern "C" fn scramble_event(len: usize) -> isize {
        let id = String::from_utf8_lossy(&io_bytes()[..len.min(16)]).into_owned();
        answer(|rng, out| event(&id, rng, out))
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn scramble_orbit(corners: u32) -> isize {
        answer(|rng, out| {
            orbit(corners != 0, rng, out);
            true
        })
    }

    /// The state is at io(): edges (12), their twists (12), corners (8), their twists (8).
    #[unsafe(no_mangle)]
    pub extern "C" fn scramble_pattern() -> isize {
        let input: [u8; 40] = io_bytes()[..40].try_into().unwrap();
        answer(|_, out| pattern(&input[..12], &input[12..24], &input[24..32], &input[32..], out))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use cube::{Cube, FACES, SOLVED};

    fn play(s: &str) -> Cube {
        let t = cube::tables();
        let mut c = SOLVED;
        for token in s.split(' ') {
            let f = FACES.iter().position(|&x| x == token.as_bytes()[0]).unwrap();
            let k = ["", "2", "'"].iter().position(|&x| x == &token[1..]).unwrap();
            c = c.mul(&t.moves[f * 3 + k]);
        }
        c
    }

    #[test]
    fn scrambles_reach_their_states() {
        let mut rng = Rng::new(11);
        for _ in 0..300 {
            let c = cube::random_cube(&mut rng, true, true);
            let mut out = String::new();
            cube::write(&cube::solve(&c), &mut out);
            assert_eq!(play(&out), c, "{out}");
            assert!(out.split(' ').count() <= 21, "{out}");
        }
    }

    #[test]
    fn orbits_leave_the_other_alone() {
        let mut rng = Rng::new(12);
        for corners in [false, true] {
            for _ in 0..50 {
                let mut out = String::new();
                orbit(corners, &mut rng, &mut out);
                let c = play(&out);
                if corners {
                    assert_eq!((c.ep, c.eo), (SOLVED.ep, SOLVED.eo), "{out}");
                } else {
                    assert_eq!((c.cp, c.co), (SOLVED.cp, SOLVED.co), "{out}");
                }
            }
        }
    }

    #[test]
    fn every_event() {
        let mut rng = Rng::new(13);
        for id in ["222", "333", "333oh", "333bf", "333fm", "333mbf", "444", "444bf", "555", "555bf", "666", "777", "sq1", "pyram", "skewb", "minx", "clock"] {
            let mut out = String::new();
            assert!(event(id, &mut rng, &mut out) && !out.is_empty(), "{id}");
        }
        assert!(!event("fto", &mut rng, &mut String::new()));
    }

    #[test]
    fn fewest_moves_scrambles_are_padded_without_merging() {
        let mut rng = Rng::new(14);
        let axis = |turn: &str| FACES.iter().position(|&x| x == turn.as_bytes()[0]).unwrap() % 3;
        for _ in 0..200 {
            let c = cube::random_cube(&mut rng, true, true);
            let mut out = String::new();
            cube::fewest_moves(&c, &mut out);
            let inner = out.strip_prefix("R' U' F ").and_then(|s| s.strip_suffix(" R' U' F")).expect(&out);
            assert_eq!(play(inner), c, "{out}");
            let turns: Vec<&str> = inner.split(' ').collect();
            assert!(axis(turns[0]) != 2 && axis(turns[turns.len() - 1]) != 1, "{out}");
        }
    }

    #[test]
    fn clock_scrambles_follow_tnoodle() {
        let mut rng = Rng::new(15);
        let mut seen = std::collections::HashSet::new();
        for _ in 0..500 {
            let mut out = String::new();
            event("clock", &mut rng, &mut out);
            let words: Vec<&str> = out.split(' ').collect();
            assert_eq!(words.len(), 15, "{out}");
            assert_eq!(words[9], "y2");
            for w in words.iter().filter(|w| **w != "y2") {
                let pins = w.trim_end_matches(|c: char| c.is_ascii_digit() || c == '+' || c == '-');
                let amount = &w[pins.len()..];
                let n: i32 = amount[..amount.len() - 1].parse().unwrap();
                let turn = if amount.ends_with('+') { n } else { -n };
                assert!((-5..=6).contains(&turn) && !(n == 0 && amount.ends_with('-')), "{out}");
                seen.insert(turn);
            }
        }
        assert_eq!(seen.len(), 12);
    }

    #[test]
    fn unsolvable_patterns_are_refused() {
        let edges: Vec<u8> = (0..12).collect();
        let corners: Vec<u8> = (0..8).collect();
        let mut flipped = [0u8; 12];
        flipped[0] = 1;
        assert!(!pattern(&edges, &flipped, &corners, &[0; 8], &mut String::new()));
        let mut swapped = edges.clone();
        swapped.swap(0, 1);
        assert!(!pattern(&swapped, &[0; 12], &corners, &[0; 8], &mut String::new()));
        let mut out = String::new();
        assert!(pattern(&edges, &[0; 12], &corners, &[0; 8], &mut out) && out.is_empty());
    }
}
