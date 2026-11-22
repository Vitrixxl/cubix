//! Step practice on the 3×3 (src/shared/crossTraining.ts): a random state where one step of a method is left to
//! solve, at exactly `moves` face turns for a step with a solver, its optimal solutions found on demand. States use
//! cubing.js's pattern layout (edges UF UR UB UL DF DR DB DL FR FL BR BL; corners UFR URB UBL ULF DRF DFL DLB DBR),
//! white on U: the cube is held with white on the bottom (z2).
use scrambler::Rng;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

#[derive(Clone, Default)]
struct Pieces {
    edges: &'static [u8],
    corners: &'static [u8],
    eo: bool,
}

const fn p(edges: &'static [u8], corners: &'static [u8]) -> Pieces { Pieces { edges, corners, eo: false } }

pub struct Spec {
    pub id: &'static str,
    pub label: &'static str,
    pub method: &'static str,
    pub moves: &'static [u32],
    given: Pieces,
    goal: Vec<Pieces>,
    pairs: usize,
}

const CROSS: Pieces = p(&[0, 1, 2, 3], &[]);
const FIRST_BLOCK: Pieces = p(&[1, 8, 10], &[0, 1]);
const BLOCKS: Pieces = p(&[1, 8, 10, 3, 9, 11], &[0, 1, 2, 3]);
const BLOCK_222: Pieces = p(&[1, 2, 10], &[1]);
const F2L: Pieces = p(&[0, 1, 2, 3, 8, 9, 10, 11], &[0, 1, 2, 3]);

pub fn specs() -> &'static [Spec] {
    static S: OnceLock<Vec<Spec>> = OnceLock::new();
    S.get_or_init(|| {
        let fb_goal = vec![p(&[1, 8, 10], &[0]), p(&[1, 8, 10], &[1])];
        let none = Pieces::default();
        let eo = |edges: &'static [u8]| Pieces { edges, corners: &[], eo: true };
        vec![
            Spec { id: "cross", label: "Cross", method: "CFOP", moves: &[4, 5, 6], given: none.clone(), goal: vec![CROSS], pairs: 0 },
            Spec { id: "xcross", label: "XCross", method: "CFOP", moves: &[5, 6, 7], given: none.clone(), goal: vec![CROSS], pairs: 1 },
            Spec { id: "xxcross", label: "XXCross", method: "CFOP", moves: &[6, 7, 8], given: none.clone(), goal: vec![CROSS], pairs: 2 },
            Spec { id: "f2l-only", label: "F2L", method: "CFOP", moves: &[], given: CROSS, goal: vec![], pairs: 0 },
            Spec { id: "lsll", label: "LSLL", method: "CFOP", moves: &[], given: p(&[0, 1, 2, 3, 8, 10, 11], &[0, 1, 2]), goal: vec![], pairs: 0 },
            Spec { id: "ll", label: "Last layer", method: "CFOP", moves: &[], given: F2L, goal: vec![], pairs: 0 },
            Spec { id: "eoline", label: "EOLine", method: "ZZ", moves: &[5, 6, 7], given: none.clone(), goal: vec![eo(&[0, 2])], pairs: 0 },
            Spec { id: "eocross", label: "EOCross", method: "ZZ", moves: &[6, 7, 8], given: none.clone(), goal: vec![eo(&[0, 2]), eo(&[1, 3]), CROSS], pairs: 0 },
            Spec { id: "zbll", label: "ZBLL", method: "ZZ", moves: &[], given: Pieces { eo: true, ..F2L }, goal: vec![], pairs: 0 },
            Spec { id: "fb", label: "First block", method: "Roux", moves: &[6, 7, 8], given: none.clone(), goal: fb_goal.clone(), pairs: 0 },
            Spec { id: "sb", label: "Second block", method: "Roux", moves: &[], given: FIRST_BLOCK, goal: [fb_goal, vec![p(&[3, 9], &[3, 2]), p(&[3, 11], &[3, 2]), p(&[9, 11], &[3, 2])]].concat(), pairs: 0 },
            Spec { id: "cmll", label: "CMLL", method: "Roux", moves: &[], given: BLOCKS, goal: vec![], pairs: 0 },
            Spec { id: "2x2x2", label: "2×2×2", method: "Petrus", moves: &[5, 6, 7], given: none.clone(), goal: vec![BLOCK_222], pairs: 0 },
            Spec { id: "2x2x3", label: "2×2×3", method: "Petrus", moves: &[5, 6, 7], given: BLOCK_222, goal: vec![BLOCK_222, p(&[0, 1, 8], &[0]), p(&[0, 2, 8], &[0])], pairs: 0 },
        ]
    })
}

pub fn spec(id: &str) -> Option<&'static Spec> { specs().iter().find(|s| s.id == id) }

/// The step and move count of a scramble type ("xcross-6", "zbll"), if it is one.
pub fn of_type(kind: &str) -> Option<(&'static Spec, u32)> {
    if let Some(s) = spec(kind) { return s.moves.is_empty().then_some((s, 0)) }
    let (target, moves) = kind.rsplit_once('-')?;
    let (s, m) = (spec(target)?, moves.parse().ok()?);
    s.moves.contains(&m).then_some((s, m))
}

pub fn has_solutions(s: &Spec) -> bool { !s.goal.is_empty() }

#[derive(Clone, Debug, PartialEq)]
pub struct State {
    pub edges: [u8; 12],
    pub eo: [u8; 12],
    pub corners: [u8; 8],
    pub co: [u8; 8],
}

impl State {
    fn solved() -> Self { Self { edges: std::array::from_fn(|i| i as u8), eo: [0; 12], corners: std::array::from_fn(|i| i as u8), co: [0; 8] } }
}

type Perm<const N: usize> = ([u8; N], [u8; N]);
struct Move {
    face: usize,
    edges: Perm<12>,
    corners: Perm<8>,
}

const FACES: [([u8; 12], [u8; 12], [u8; 8], [u8; 8]); 6] = [
    ([1, 2, 3, 0, 4, 5, 6, 7, 8, 9, 10, 11], [0; 12], [1, 2, 3, 0, 4, 5, 6, 7], [0; 8]),
    ([0, 1, 2, 3, 7, 4, 5, 6, 8, 9, 10, 11], [0; 12], [0, 1, 2, 3, 5, 6, 7, 4], [0; 8]),
    ([0, 8, 2, 3, 4, 10, 6, 7, 5, 9, 1, 11], [0; 12], [4, 0, 2, 3, 7, 5, 6, 1], [2, 1, 0, 0, 1, 0, 0, 2]),
    ([0, 1, 2, 11, 4, 5, 6, 9, 8, 3, 10, 7], [0; 12], [0, 1, 6, 2, 4, 3, 5, 7], [0, 0, 2, 1, 0, 2, 1, 0]),
    ([9, 1, 2, 3, 8, 5, 6, 7, 0, 4, 10, 11], [1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0], [3, 1, 2, 5, 0, 4, 6, 7], [1, 0, 0, 2, 2, 1, 0, 0]),
    ([0, 1, 10, 3, 4, 5, 11, 7, 8, 9, 6, 2], [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1], [0, 7, 1, 3, 4, 5, 2, 6], [0, 2, 1, 0, 0, 0, 2, 1]),
];

const PAIRS: [(u8, u8, &str); 4] = [(0, 8, "FL"), (1, 10, "BL"), (2, 11, "BR"), (3, 9, "FR")];

fn compose<const N: usize>(a: &Perm<N>, b: &Perm<N>, n: u8) -> Perm<N> { (std::array::from_fn(|i| a.0[b.0[i] as usize]), std::array::from_fn(|i| (a.1[b.0[i] as usize] + b.1[i]) % n)) }

fn moves() -> &'static [Move] {
    static M: OnceLock<Vec<Move>> = OnceLock::new();
    M.get_or_init(|| {
        let mut out = vec![];
        for (face, (ep, eo, cp, co)) in FACES.iter().enumerate() {
            let q = ((*ep, *eo), (*cp, *co));
            let mut t = q;
            for _ in 0..3 {
                out.push(Move { face, edges: t.0, corners: t.1 });
                t = (compose(&t.0, &q.0, 2), compose(&t.1, &q.1, 3));
            }
        }
        out
    })
}

fn apply(s: &State, m: &Move) -> State {
    State {
        edges: std::array::from_fn(|i| s.edges[m.edges.0[i] as usize]),
        eo: std::array::from_fn(|i| (s.eo[m.edges.0[i] as usize] + m.edges.1[i]) % 2),
        corners: std::array::from_fn(|i| s.corners[m.corners.0[i] as usize]),
        co: std::array::from_fn(|i| (s.co[m.corners.0[i] as usize] + m.corners.1[i]) % 3),
    }
}

fn redundant(face: usize, previous: Option<usize>) -> bool { previous.is_some_and(|p| face == p || (face >> 1 == p >> 1 && face < p)) }

struct Tables {
    edge: Vec<[u8; 24]>,
    corner: Vec<[u8; 24]>,
    flip: Vec<Vec<u16>>,
}

fn tables() -> &'static Tables {
    static T: OnceLock<Tables> = OnceLock::new();
    T.get_or_init(|| {
        let coord = |corners: bool| {
            moves()
                .iter()
                .map(|m| {
                    let (perm, delta, twists): (&[u8], &[u8], usize) = if corners { (&m.corners.0, &m.corners.1, 3) } else { (&m.edges.0, &m.edges.1, 2) };
                    let mut t = [0u8; 24];
                    for (to, &from) in perm.iter().enumerate() {
                        for o in 0..twists {
                            t[from as usize * twists + o] = (to * twists + (o + delta[to] as usize) % twists) as u8;
                        }
                    }
                    t
                })
                .collect()
        };
        let flip = moves().iter().map(|m| (0..4096u16).map(|mask| m.edges.0.iter().enumerate().fold(0u16, |n, (to, &from)| n | ((((mask >> from) & 1) ^ m.edges.1[to] as u16) << to))).collect()).collect();
        Tables { edge: coord(false), corner: coord(true), flip }
    })
}

fn piece_move(piece: u8, m: usize, v: u8) -> u8 { if piece < 12 { tables().edge[m][v as usize] } else { tables().corner[m][v as usize] } }
fn solved_value(piece: u8) -> u8 { if piece < 12 { piece * 2 } else { (piece - 12) * 3 } }
fn pieces_of(g: &Pieces) -> Vec<u8> { g.edges.iter().copied().chain(g.corners.iter().map(|c| c + 12)).collect() }

fn group_distances(eo: bool, pieces: &[u8]) -> Vec<u8> {
    let size = if eo { 4096 } else { 1 } * 24usize.pow(pieces.len() as u32);
    let mut table = vec![255u8; size];
    let solved = pieces.iter().fold(0usize, |k, &p| k * 24 + solved_value(p) as usize);
    table[solved] = 0;
    let mut frontier = vec![solved];
    let mut depth = 1;
    let mut values = vec![0u8; pieces.len()];
    while !frontier.is_empty() {
        let mut next = vec![];
        for &key in &frontier {
            let mut rest = key;
            for i in (0..pieces.len()).rev() {
                values[i] = (rest % 24) as u8;
                rest /= 24;
            }
            for m in 0..18 {
                let mut n = if eo { tables().flip[m][rest] as usize } else { 0 };
                for (i, &p) in pieces.iter().enumerate() {
                    n = n * 24 + piece_move(p, m, values[i]) as usize;
                }
                if table[n] == 255 {
                    table[n] = depth;
                    next.push(n);
                }
            }
        }
        frontier = next;
        depth += 1;
    }
    table
}

struct Group {
    at: Vec<usize>,
    eo: bool,
    table: &'static [u8],
}

struct Solver {
    tracked: Vec<u8>,
    groups: Vec<Group>,
    options: Vec<Group>,
    k: usize,
}

fn table_of(eo: bool, pieces: &[u8]) -> &'static [u8] {
    static T: OnceLock<Mutex<HashMap<(bool, Vec<u8>), &'static [u8]>>> = OnceLock::new();
    let mut map = T.get_or_init(Default::default).lock().unwrap();
    map.entry((eo, pieces.to_vec())).or_insert_with(|| Box::leak(group_distances(eo, pieces).into_boxed_slice()))
}

fn solver(s: &Spec) -> Solver {
    let mut tracked: Vec<u8> = vec![];
    let mut group = |g: &Pieces| {
        let pieces = pieces_of(g);
        for &p in &pieces {
            if !tracked.contains(&p) { tracked.push(p) }
        }
        Group { at: pieces.iter().map(|p| tracked.iter().position(|t| t == p).unwrap() + 1).collect(), eo: g.eo, table: table_of(g.eo, &pieces) }
    };
    let groups = s.goal.iter().map(&mut group).collect();
    let options = if s.pairs > 0 { PAIRS.iter().map(|(c, e, _)| group(&Pieces { edges: Box::leak(Box::new([*e])), corners: Box::leak(Box::new([*c])), eo: false })).collect() } else { vec![] };
    Solver { tracked, groups, options, k: s.pairs }
}

fn coords(sv: &Solver, st: &State) -> Vec<u16> {
    let mut c = vec![st.eo.iter().enumerate().fold(0u16, |m, (i, &o)| m | ((o as u16) << i))];
    for &piece in &sv.tracked {
        if piece < 12 {
            let at = st.edges.iter().position(|&e| e == piece).unwrap();
            c.push((at * 2 + st.eo[at] as usize) as u16);
        } else {
            let at = st.corners.iter().position(|&x| x == piece - 12).unwrap();
            c.push((at * 3 + st.co[at] as usize) as u16);
        }
    }
    c
}

fn turn(sv: &Solver, c: &[u16], m: usize) -> Vec<u16> {
    let mut n = Vec::with_capacity(c.len());
    n.push(tables().flip[m][c[0] as usize]);
    for (i, &p) in sv.tracked.iter().enumerate() {
        n.push(piece_move(p, m, c[i + 1] as u8) as u16);
    }
    n
}

fn distance(g: &Group, c: &[u16]) -> u8 { g.table[g.at.iter().fold(if g.eo { c[0] as usize } else { 0 }, |k, &i| k * 24 + c[i] as usize)] }
fn solved_options(sv: &Solver, c: &[u16]) -> Vec<usize> { sv.options.iter().enumerate().filter(|(_, g)| distance(g, c) == 0).map(|(i, _)| i).collect() }
fn is_solved(sv: &Solver, c: &[u16]) -> bool { sv.groups.iter().all(|g| distance(g, c) == 0) && solved_options(sv, c).len() >= sv.k }

fn bound(sv: &Solver, c: &[u16]) -> u8 {
    let most = sv.groups.iter().map(|g| distance(g, c)).max().unwrap_or(0);
    if sv.k == 0 { return most }
    let mut d: Vec<u8> = sv.options.iter().map(|g| distance(g, c)).collect();
    d.sort();
    most.max(d[sv.k - 1])
}

fn search(sv: &Solver, c: &[u16], depth: u8, visit: &mut dyn FnMut(&[usize], &[u16]) -> bool, path: &mut Vec<usize>, previous: Option<usize>) -> bool {
    if depth == 0 { return is_solved(sv, c) && visit(path, c) }
    if bound(sv, c) > depth { return false }
    for m in 0..18 {
        let face = moves()[m].face;
        if redundant(face, previous) { continue }
        path.push(m);
        let stop = search(sv, &turn(sv, c, m), depth - 1, visit, path, Some(face));
        path.pop();
        if stop { return true }
    }
    false
}

fn least(sv: &Solver, st: &State, limit: u8) -> Option<u8> {
    let c = coords(sv, st);
    (bound(sv, &c)..=limit).find(|&d| search(sv, &c, d, &mut |_, _| true, &mut vec![], None))
}

fn shuffle<T>(v: &mut [T], rng: &mut Rng) {
    for i in (1..v.len()).rev() {
        v.swap(i, rng.below(i + 1));
    }
}

fn odd(p: &[u8]) -> bool { (0..p.len()).map(|i| p[i + 1..].iter().filter(|&&b| b < p[i]).count()).sum::<usize>() % 2 == 1 }

fn random_state(fixed: &Pieces, rng: &mut Rng) -> State {
    let free_e: Vec<usize> = (0..12).filter(|i| !fixed.edges.contains(&(*i as u8))).collect();
    let free_c: Vec<usize> = (0..8).filter(|i| !fixed.corners.contains(&(*i as u8))).collect();
    let mut st = State::solved();
    let mut e: Vec<u8> = free_e.iter().map(|&i| i as u8).collect();
    shuffle(&mut e, rng);
    for (i, &piece) in e.iter().enumerate() {
        st.edges[free_e[i]] = piece;
    }
    let mut c: Vec<u8> = free_c.iter().map(|&i| i as u8).collect();
    shuffle(&mut c, rng);
    for (i, &piece) in c.iter().enumerate() {
        st.corners[free_c[i]] = piece;
    }
    if odd(&st.edges) != odd(&st.corners) { st.edges.swap(free_e[0], free_e[1]) }
    if !fixed.eo {
        for &i in &free_e {
            st.eo[i] = rng.below(2) as u8;
        }
    }
    for &i in &free_c {
        st.co[i] = rng.below(3) as u8;
    }
    let (le, lc) = (*free_e.last().unwrap(), *free_c.last().unwrap());
    let se: u8 = st.eo.iter().sum::<u8>() - st.eo[le];
    st.eo[le] = (2 - se % 2) % 2;
    let sc: u32 = st.co.iter().map(|&x| x as u32).sum::<u32>() - st.co[lc] as u32;
    st.co[lc] = ((3 - sc % 3) % 3) as u8;
    st
}

fn merge(all: &[&Pieces]) -> Pieces {
    Pieces { edges: Box::leak(all.iter().flat_map(|p| p.edges.iter().copied()).collect::<Vec<_>>().into_boxed_slice()), corners: Box::leak(all.iter().flat_map(|p| p.corners.iter().copied()).collect::<Vec<_>>().into_boxed_slice()), eo: all.iter().any(|p| p.eo) }
}

fn keeps(face: usize, g: &Pieces) -> bool {
    let m = &moves()[face * 3];
    g.edges.iter().all(|&e| m.edges.0[e as usize] == e && m.edges.1[e as usize] == 0) && g.corners.iter().all(|&c| m.corners.0[c as usize] == c && m.corners.1[c as usize] == 0)
}

/// A random state where the step is left to solve (see the module).
pub fn pattern(s: &Spec, count: u32, rng: &mut Rng) -> State {
    if s.goal.is_empty() || s.moves.is_empty() { return random_state(&s.given, rng) }
    let sv = solver(s);
    let choices: Vec<usize> = (0..18).filter(|&m| keeps(moves()[m].face, &s.given)).collect();
    loop {
        let mut pairs = PAIRS.to_vec();
        shuffle(&mut pairs, rng);
        let solved_pairs: Vec<Pieces> = pairs[..s.pairs].iter().map(|(c, e, _)| Pieces { edges: Box::leak(Box::new([*e])), corners: Box::leak(Box::new([*c])), eo: false }).collect();
        let mut parts: Vec<&Pieces> = vec![&s.given];
        parts.extend(s.goal.iter());
        parts.extend(solved_pairs.iter());
        let mut st = random_state(&merge(&parts), rng);
        let mut previous = None;
        for _ in 0..count {
            let allowed: Vec<usize> = choices.iter().copied().filter(|&m| !redundant(moves()[m].face, previous)).collect();
            let m = allowed[rng.below(allowed.len())];
            st = apply(&st, &moves()[m]);
            previous = Some(moves()[m].face);
        }
        if least(&sv, &st, count as u8) == Some(count as u8) { return st }
    }
}

const NAMES: [&str; 6] = ["U", "D", "R", "L", "F", "B"];
const SUFFIX: [&str; 3] = ["", "2", "'"];

fn move_name(m: usize) -> String { format!("{}{}", NAMES[moves()[m].face], SUFFIX[m % 3]) }

/// The state after face turns.
pub fn after(scramble: &str) -> Option<State> {
    let mut st = State::solved();
    for token in scramble.split_whitespace() {
        let token = token.replace("2'", "2");
        let m = (0..18).find(|&m| move_name(m) == token)?;
        st = apply(&st, &moves()[m]);
    }
    Some(st)
}

/// A scramble reaching a step's random state, as the solver writes it.
pub fn scramble(s: &Spec, count: u32, rng: &mut Rng) -> String {
    let st = pattern(s, count, rng);
    let mut out = String::new();
    scrambler::pattern(&st.edges, &st.eo, &st.corners, &st.co, &mut out);
    out.trim().to_string()
}

/// Optimal solutions of the step, different pairs first (moves, slot names), written with white on U.
pub fn solutions(scramble: &str, s: &Spec, limit: usize) -> Vec<(String, String)> {
    if s.goal.is_empty() { return vec![] }
    let Some(st) = after(scramble) else { return vec![] };
    let sv = solver(s);
    let start = coords(&sv, &st);
    let mut found: Vec<(String, String)> = vec![];
    let mut depth = bound(&sv, &start);
    while depth <= 12 && found.is_empty() {
        search(&sv, &start, depth, &mut |path, end| {
            let moves = path.iter().map(|&m| move_name(m)).collect::<Vec<_>>().join(" ");
            let pairs = solved_options(&sv, end);
            let choices: Vec<Vec<usize>> = match sv.k {
                2 => pairs.iter().enumerate().flat_map(|(i, &a)| pairs[i + 1..].iter().map(move |&b| vec![a, b])).collect(),
                1 => pairs.iter().map(|&a| vec![a]).collect(),
                _ => vec![vec![]],
            };
            for c in choices {
                found.push((moves.clone(), c.iter().map(|&i| PAIRS[i].2).collect::<Vec<_>>().join(" + ")));
            }
            found.len() >= limit * 3
        }, &mut vec![], None);
        depth += 1;
    }
    let mut first: Vec<(String, String)> = vec![];
    for f in &found {
        if !first.iter().any(|g| g.1 == f.1) { first.push(f.clone()) }
    }
    let rest: Vec<_> = found.iter().filter(|f| !first.contains(f)).cloned().collect();
    first.into_iter().chain(rest).take(limit).collect()
}

/// Face turns seen with the cube turned over with z2: U and D swap, R and L swap.
pub fn held(moves: &str) -> String { moves.chars().map(|c| match c { 'U' => 'D', 'D' => 'U', 'R' => 'L', 'L' => 'R', c => c }).collect() }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crosses_come_at_their_count() {
        let mut rng = Rng::new(5);
        for kind in ["cross-5", "xcross-6", "eoline-6", "fb-7", "2x2x3-6"] {
            let (s, n) = of_type(kind).unwrap();
            let scr = scramble(s, n, &mut rng);
            assert!(!scr.is_empty());
            let sols = solutions(&scr, s, 2);
            assert!(!sols.is_empty(), "{kind}");
            assert_eq!(sols[0].0.split_whitespace().count(), n as usize, "{kind}: {}", sols[0].0);
        }
        let (s, _) = of_type("zbll").unwrap();
        assert!(!scramble(s, 0, &mut rng).is_empty());
    }
}
