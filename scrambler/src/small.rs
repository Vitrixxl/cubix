//! The 2×2, the Pyraminx and the Skewb: a random state solved by an optimal search (IDA*), bounded by small tables of
//! distances over parts of the puzzle (a few thousand entries each). Their moves are cubing.js's kpuzzle definitions,
//! so the notation is the app's.

use crate::rng::Rng;
use std::collections::HashMap;
use std::sync::OnceLock;

/// The most positions of the three (the Skewb's 8 corners and 6 centers).
const N: usize = 14;

#[derive(Clone, Copy, PartialEq, Eq)]
struct State {
    p: [u8; N],
    o: [u8; N],
}

/// An orbit: its pieces, their orientations, and whether these are seen (the Skewb's centers' are not).
struct Orbit {
    n: usize,
    modulo: u8,
    seen: bool,
}

/// A turn in cubing.js's form, over every orbit's positions one after the other: position i takes the piece at
/// perm[i], its orientation plus delta[i].
struct Turn {
    name: String,
    base: usize,
    perm: [u8; N],
    delta: [u8; N],
}

/// Distances of one part of the puzzle (some orbits' pieces and orientations) to solved.
struct Part {
    pieces: Vec<usize>,
    twists: Vec<usize>,
    dist: HashMap<u64, u8>,
}

pub struct Puzzle {
    n: usize,
    modulo: [u8; N],
    turns: Vec<Turn>,
    parts: Vec<Part>,
}

impl Puzzle {
    /// `moves`: per base move, per orbit, its permutation and orientation change. `parts`: per part, the orbits whose
    /// pieces and the orbits whose orientations it follows.
    fn new(orbits: &[Orbit], moves: &[(&str, &[(&[u8], &[u8])])], parts: &[(&[usize], &[usize])]) -> Puzzle {
        let mut modulo = [1u8; N];
        let mut starts = vec![];
        let mut n = 0;
        for o in orbits {
            starts.push(n);
            for i in 0..o.n {
                modulo[n + i] = o.modulo;
            }
            n += o.n;
        }
        let mut turns = vec![];
        for (base, (name, per_orbit)) in moves.iter().enumerate() {
            let mut t = Turn { name: name.to_string(), base, perm: std::array::from_fn(|i| i as u8), delta: [0; N] };
            for (k, (perm, delta)) in per_orbit.iter().enumerate() {
                for i in 0..perm.len() {
                    t.perm[starts[k] + i] = perm[i] + starts[k] as u8;
                    t.delta[starts[k] + i] = delta[i];
                }
            }
            // Powers until the turn changes nothing seen: order 3 gives "" and "'", order 4 also "2".
            let mut powers = vec![];
            let mut cur = Turn { name: name.to_string(), base, perm: t.perm, delta: t.delta };
            loop {
                let next = Turn {
                    name: String::new(),
                    base,
                    perm: std::array::from_fn(|i| cur.perm[t.perm[i] as usize]),
                    delta: std::array::from_fn(|i| (cur.delta[t.perm[i] as usize] + t.delta[i]) % modulo[i]),
                };
                powers.push(cur);
                let identity = (0..n).all(|i| next.perm[i] as usize == i && (next.delta[i] == 0 || !seen_at(orbits, i)));
                if identity {
                    break;
                }
                cur = next;
            }
            let count = powers.len();
            for (k, mut p) in powers.into_iter().enumerate() {
                p.name = format!("{name}{}", if k == 0 { "" } else if k == count - 1 { "'" } else { "2" });
                turns.push(p);
            }
        }
        let mut puzzle = Puzzle { n, modulo, turns, parts: vec![] };
        for (pieces, twists) in parts {
            let positions = |list: &[usize]| list.iter().flat_map(|&k| starts[k]..starts[k] + orbits[k].n).collect::<Vec<_>>();
            let mut part = Part { pieces: positions(pieces), twists: positions(twists), dist: HashMap::new() };
            part.dist = puzzle.distances(&part);
            puzzle.parts.push(part);
        }
        puzzle
    }

    fn solved(&self) -> State { State { p: std::array::from_fn(|i| i as u8), o: [0; N] } }

    #[inline]
    fn apply(&self, s: &State, t: &Turn) -> State {
        let mut r = *s;
        for i in 0..self.n {
            let from = t.perm[i] as usize;
            r.p[i] = s.p[from];
            r.o[i] = (s.o[from] + t.delta[i]) % self.modulo[i];
        }
        r
    }

    #[inline]
    fn key(part: &Part, s: &State) -> u64 {
        let mut k = 0u64;
        for &i in &part.pieces {
            k = k << 4 | s.p[i] as u64;
        }
        for &i in &part.twists {
            k = k << 2 | s.o[i] as u64;
        }
        k
    }

    fn distances(&self, part: &Part) -> HashMap<u64, u8> {
        let start = self.solved();
        let mut dist = HashMap::from([(Self::key(part, &start), 0u8)]);
        let mut frontier = vec![start];
        let mut depth = 0;
        while !frontier.is_empty() {
            depth += 1;
            let mut next = vec![];
            for s in &frontier {
                for t in &self.turns {
                    let n = self.apply(s, t);
                    dist.entry(Self::key(part, &n)).or_insert_with(|| {
                        next.push(n);
                        depth
                    });
                }
            }
            frontier = next;
        }
        dist
    }

    #[inline]
    fn bound(&self, s: &State) -> usize { self.parts.iter().map(|p| p.dist[&Self::key(p, s)] as usize).max().unwrap_or(0) }

    fn search(&self, s: &State, depth: usize, last: usize, path: &mut Vec<usize>) -> bool {
        let bound = self.bound(s);
        if bound > depth {
            return false;
        }
        // The parts together cover everything seen: all of them solved is the puzzle solved.
        if depth == 0 {
            return true;
        }
        for (i, t) in self.turns.iter().enumerate() {
            if t.base == last {
                continue;
            }
            path.push(i);
            if self.search(&self.apply(s, t), depth - 1, t.base, path) {
                return true;
            }
            path.pop();
        }
        false
    }

    /// The shortest turns reaching `s` from solved.
    fn scramble_to(&self, s: &State) -> Vec<&Turn> {
        let mut path = vec![];
        let mut depth = self.bound(s);
        while !self.search(s, depth, usize::MAX, &mut path) {
            depth += 1;
        }
        // The scramble is the solution backwards, each turn the other way (the power's mirror in its base's list).
        path.iter()
            .rev()
            .map(|&i| {
                let t = &self.turns[i];
                let first = self.turns.iter().position(|u| u.base == t.base).unwrap();
                let count = self.turns.iter().filter(|u| u.base == t.base).count();
                &self.turns[first + count - 1 - (i - first)]
            })
            .collect()
    }
}

fn seen_at(orbits: &[Orbit], i: usize) -> bool {
    let mut start = 0;
    for o in orbits {
        if i < start + o.n {
            return o.seen;
        }
        start += o.n;
    }
    true
}

/// Draws states until one is at least `min` turns from solved, and writes its scramble.
fn scramble(p: &Puzzle, min: usize, rng: &mut Rng, draw: impl Fn(&mut Rng) -> State, out: &mut String) {
    loop {
        let turns = p.scramble_to(&draw(rng));
        if turns.len() >= min {
            for (i, t) in turns.iter().enumerate() {
                if i > 0 {
                    out.push(' ');
                }
                out.push_str(&t.name);
            }
            return;
        }
    }
}

// From cubing.js: `puzzles[id].kpuzzle()`, each move applied to the solved pattern.

fn cube222() -> &'static Puzzle {
    static P: OnceLock<Puzzle> = OnceLock::new();
    P.get_or_init(|| {
        Puzzle::new(
            &[Orbit { n: 8, modulo: 3, seen: true }],
            &[
                ("U", &[(&[1, 2, 3, 0, 4, 5, 6, 7], &[0, 0, 0, 0, 0, 0, 0, 0])]),
                ("R", &[(&[4, 0, 2, 3, 7, 5, 6, 1], &[2, 1, 0, 0, 1, 0, 0, 2])]),
                ("F", &[(&[3, 1, 2, 5, 0, 4, 6, 7], &[1, 0, 0, 2, 2, 1, 0, 0])]),
            ],
            &[(&[0], &[]), (&[], &[0])],
        )
    })
}

/// A random 2×2: U, R and F never move the corner at position 6; the others take any places and any twists adding up
/// to a multiple of 3.
pub fn scramble222(rng: &mut Rng, out: &mut String) {
    scramble(cube222(), 4, rng, |rng| {
        let mut s = cube222().solved();
        let mut pieces = [0, 1, 2, 3, 4, 5, 7];
        rng.shuffle(&mut pieces);
        let mut twists = [0u8; 7];
        rng.twists(&mut twists, 3);
        for (k, &i) in [0, 1, 2, 3, 4, 5, 7].iter().enumerate() {
            s.p[i] = pieces[k];
            s.o[i] = twists[k];
        }
        s
    }, out)
}

fn pyraminx() -> &'static Puzzle {
    static P: OnceLock<Puzzle> = OnceLock::new();
    P.get_or_init(|| {
        // Edges, then the axial pieces under the tips (the tips are drawn apart).
        Puzzle::new(
            &[Orbit { n: 6, modulo: 2, seen: true }, Orbit { n: 4, modulo: 3, seen: true }],
            &[
                ("U", &[(&[5, 0, 2, 3, 4, 1], &[0, 0, 0, 0, 0, 0]), (&[0, 1, 2, 3], &[1, 0, 0, 0])]),
                ("L", &[(&[4, 1, 0, 3, 2, 5], &[0, 0, 1, 0, 1, 0]), (&[0, 1, 2, 3], &[0, 0, 0, 1])]),
                ("R", &[(&[0, 1, 3, 5, 4, 2], &[0, 0, 0, 0, 0, 0]), (&[0, 1, 2, 3], &[0, 0, 1, 0])]),
                ("B", &[(&[0, 3, 2, 4, 1, 5], &[0, 1, 0, 0, 1, 0]), (&[0, 1, 2, 3], &[0, 1, 0, 0])]),
            ],
            &[(&[0], &[0]), (&[], &[1])],
        )
    })
}

/// A random Pyraminx: its edges in an even permutation with an even number flipped, its axial pieces at any twist,
/// then each tip turned at random.
pub fn scramble_pyraminx(rng: &mut Rng, out: &mut String) {
    scramble(pyraminx(), 6, rng, |rng| {
        let mut s = pyraminx().solved();
        let mut edges = [0, 1, 2, 3, 4, 5];
        rng.shuffle(&mut edges);
        if crate::cube::odd(&edges) {
            edges.swap(0, 1);
        }
        s.p[..6].copy_from_slice(&edges);
        rng.twists(&mut s.o[..6], 2);
        for i in 6..10 {
            s.o[i] = rng.below(3) as u8;
        }
        s
    }, out);
    for tip in ["u", "l", "r", "b"] {
        match rng.below(3) {
            1 => out.push_str(&format!(" {tip}")),
            2 => out.push_str(&format!(" {tip}'")),
            _ => {}
        }
    }
}

fn skewb() -> &'static Puzzle {
    static P: OnceLock<Puzzle> = OnceLock::new();
    P.get_or_init(|| {
        Puzzle::new(
            &[Orbit { n: 8, modulo: 3, seen: true }, Orbit { n: 6, modulo: 4, seen: false }],
            &[
                ("R", &[(&[0, 2, 7, 3, 4, 5, 6, 1], &[0, 2, 2, 0, 0, 1, 0, 2]), (&[0, 2, 5, 3, 4, 1], &[0, 0, 3, 0, 0, 1])]),
                ("U", &[(&[1, 7, 2, 3, 4, 5, 6, 0], &[2, 2, 0, 0, 0, 0, 1, 2]), (&[0, 1, 2, 5, 3, 4], &[0, 0, 0, 3, 0, 1])]),
                ("L", &[(&[7, 1, 0, 3, 4, 5, 6, 2], &[2, 0, 2, 0, 1, 0, 0, 2]), (&[4, 1, 0, 3, 2, 5], &[1, 0, 1, 0, 2, 0])]),
                ("B", &[(&[0, 1, 2, 3, 6, 4, 5, 7], &[0, 0, 0, 0, 2, 2, 2, 1]), (&[0, 1, 4, 3, 5, 2], &[0, 0, 0, 0, 1, 3])]),
            ],
            &[(&[0], &[0]), (&[1], &[])],
        )
    })
}

/// A random Skewb: a long random walk, which reaches every state as often as any other to within a hair (the walk is
/// 30 times the puzzle's diameter), then solved optimally.
pub fn scramble_skewb(rng: &mut Rng, out: &mut String) {
    let p = skewb();
    scramble(p, 7, rng, |rng| {
        let mut s = p.solved();
        for _ in 0..330 {
            s = p.apply(&s, &p.turns[rng.below(p.turns.len())]);
        }
        // The centers' orientation is not seen, nor searched.
        for i in 8..14 {
            s.o[i] = 0;
        }
        s
    }, out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn play(p: &Puzzle, scramble: &str) -> State {
        let mut s = p.solved();
        for name in scramble.split(' ') {
            let t = p.turns.iter().find(|t| t.name == name).unwrap_or_else(|| panic!("{name}"));
            s = p.apply(&s, t);
        }
        s
    }

    #[test]
    fn scrambles_reach_optimal_states() {
        let mut rng = Rng::new(7);
        for (p, f, min) in [(cube222(), scramble222 as fn(&mut Rng, &mut String), 4), (skewb(), scramble_skewb, 7)] {
            for _ in 0..200 {
                let mut out = String::new();
                f(&mut rng, &mut out);
                let n = out.split(' ').count();
                assert!((min..=11).contains(&n), "{out}");
                // The scramble's state is that many turns away: its optimal solution is as long.
                assert_eq!(p.scramble_to(&play(p, &out)).len(), n, "{out}");
            }
        }
        for _ in 0..200 {
            let mut out = String::new();
            scramble_pyraminx(&mut rng, &mut out);
            let core: Vec<&str> = out.split(' ').filter(|m| m.chars().next().unwrap().is_uppercase()).collect();
            assert!((6..=11).contains(&core.len()), "{out}");
            assert_eq!(pyraminx().scramble_to(&play(pyraminx(), &core.join(" "))).len(), core.len(), "{out}");
        }
    }
}
