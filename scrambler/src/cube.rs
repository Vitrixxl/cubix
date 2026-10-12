//! The 3×3: Kociemba's two-phase search over four small distance tables (about 4 MB with the move tables, built in
//! memory in a fraction of a second), searching the cube and its inverse on the three axes at once as min2phase does.

use crate::rng::Rng;
use std::sync::OnceLock;

/// Kociemba's cubie model: cp[i] is the corner at position i and co[i] its twist, ep and eo the same for edges.
/// Corners URF UFL ULB UBR DFR DLF DBL DRB; edges UR UF UL UB DR DF DL DB FR FL BL BR.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Cube {
    pub cp: [u8; 8],
    pub co: [u8; 8],
    pub ep: [u8; 12],
    pub eo: [u8; 12],
}

pub const SOLVED: Cube = Cube { cp: [0, 1, 2, 3, 4, 5, 6, 7], co: [0; 8], ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], eo: [0; 12] };

impl Cube {
    /// self followed by m.
    #[inline(always)]
    pub fn mul(&self, m: &Cube) -> Cube {
        let mut r = SOLVED;
        for i in 0..8 {
            let p = m.cp[i] as usize;
            r.cp[i] = self.cp[p];
            r.co[i] = (self.co[p] + m.co[i]) % 3;
        }
        for i in 0..12 {
            let p = m.ep[i] as usize;
            r.ep[i] = self.ep[p];
            r.eo[i] = (self.eo[p] + m.eo[i]) & 1;
        }
        r
    }

    fn inverse(&self) -> Cube {
        let mut r = SOLVED;
        for i in 0..8 {
            r.cp[self.cp[i] as usize] = i as u8;
            r.co[self.cp[i] as usize] = (3 - self.co[i]) % 3;
        }
        for i in 0..12 {
            r.ep[self.ep[i] as usize] = i as u8;
            r.eo[self.ep[i] as usize] = self.eo[i];
        }
        r
    }

    fn twist(&self) -> usize { self.co[..7].iter().fold(0, |t, &o| t * 3 + o as usize) }
    fn flip(&self) -> usize { self.eo[..11].iter().fold(0, |f, &o| f * 2 + o as usize) }
    /// Which four positions hold the middle-layer edges, 0 when they are home.
    fn slice(&self) -> usize {
        let (mut a, mut x) = (0, 0);
        for j in (0..12).rev() {
            if self.ep[j] >= 8 {
                a += BINOM[11 - j][x + 1];
                x += 1;
            }
        }
        a
    }
    fn cperm(&self) -> usize { rank(&self.cp) }
    fn eperm(&self) -> usize { rank(&self.ep[..8]) }
    fn sperm(&self) -> usize { rank(&self.ep[8..]) }

    /// A cube from cubing.js's 3×3 pattern layout (edges UF UR UB UL DF DR DB DL FR FL BR BL, corners UFR URB UBL ULF
    /// DRF DFL DLB DBR; orientations alike), or None if it is not a solvable cube.
    pub fn from_cubing(edges: &[u8], edge_twists: &[u8], corners: &[u8], corner_twists: &[u8]) -> Option<Cube> {
        // Kociemba's position i is cubing.js's CUBING_*[i], and the other way round.
        const C: [usize; 8] = [0, 3, 2, 1, 4, 5, 6, 7];
        const E: [usize; 12] = [1, 0, 3, 2, 5, 4, 7, 6, 8, 9, 11, 10];
        let mut c = SOLVED;
        for i in 0..8 {
            c.cp[i] = C[*corners.get(C[i]).filter(|&&p| p < 8)? as usize] as u8;
            c.co[i] = *corner_twists.get(C[i]).filter(|&&o| o < 3)?;
        }
        for i in 0..12 {
            c.ep[i] = E[*edges.get(E[i]).filter(|&&p| p < 12)? as usize] as u8;
            c.eo[i] = *edge_twists.get(E[i]).filter(|&&o| o < 2)?;
        }
        let distinct = |p: &[u8]| (0..p.len()).all(|i| !p[i + 1..].contains(&p[i]));
        let solvable = distinct(&c.cp)
            && distinct(&c.ep)
            && odd(&c.cp) == odd(&c.ep)
            && c.co.iter().map(|&o| o as u32).sum::<u32>() % 3 == 0
            && c.eo.iter().map(|&o| o as u32).sum::<u32>() % 2 == 0;
        solvable.then_some(c)
    }
}

const BINOM: [[usize; 13]; 13] = {
    let mut b = [[0; 13]; 13];
    let mut n = 0;
    while n < 13 {
        b[n][0] = 1;
        let mut k = 1;
        while k <= n {
            b[n][k] = b[n - 1][k - 1] + b[n - 1][k];
            k += 1;
        }
        n += 1;
    }
    b
};

/// The rank of a permutation (its values in order), 0 for the identity.
#[inline(always)]
fn rank(p: &[u8]) -> usize {
    let mut r = 0;
    for i in 0..p.len() {
        let smaller = p[i + 1..].iter().filter(|&&q| q < p[i]).count();
        r = r * (p.len() - i) + smaller;
    }
    r
}

pub fn odd(p: &[u8]) -> bool {
    let mut inversions = 0;
    for i in 0..p.len() {
        inversions += p[i + 1..].iter().filter(|&&q| q < p[i]).count();
    }
    inversions % 2 == 1
}

// Quarter turns of U R F D L B; opposite faces share f % 3.
const BASE: [Cube; 6] = [
    Cube { cp: [3, 0, 1, 2, 4, 5, 6, 7], co: [0; 8], ep: [3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11], eo: [0; 12] },
    Cube { cp: [4, 1, 2, 0, 7, 5, 6, 3], co: [2, 0, 0, 1, 1, 0, 0, 2], ep: [8, 1, 2, 3, 11, 5, 6, 7, 4, 9, 10, 0], eo: [0; 12] },
    Cube { cp: [1, 5, 2, 3, 0, 4, 6, 7], co: [1, 2, 0, 0, 2, 1, 0, 0], ep: [0, 9, 2, 3, 4, 8, 6, 7, 1, 5, 10, 11], eo: [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0] },
    Cube { cp: [0, 1, 2, 3, 5, 6, 7, 4], co: [0; 8], ep: [0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10, 11], eo: [0; 12] },
    Cube { cp: [0, 2, 6, 3, 4, 1, 5, 7], co: [0, 1, 2, 0, 0, 2, 1, 0], ep: [0, 1, 10, 3, 4, 5, 9, 7, 8, 2, 6, 11], eo: [0; 12] },
    Cube { cp: [0, 1, 3, 7, 4, 5, 2, 6], co: [0, 0, 1, 2, 0, 0, 2, 1], ep: [0, 1, 2, 11, 4, 5, 6, 10, 8, 9, 3, 7], eo: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1] },
];

/// The whole cube turned a third about the URF–DBL diagonal: U's axis to R's, R's to F's.
const URF3: Cube = Cube {
    cp: [0, 4, 5, 1, 3, 7, 6, 2],
    co: [1, 2, 1, 2, 2, 1, 2, 1],
    ep: [1, 8, 5, 9, 3, 11, 7, 10, 0, 4, 6, 2],
    eo: [1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1],
};

/// Phase 2 keeps the cube in <U, D, R2, L2, F2, B2>.
const PHASE2_MOVES: [usize; 10] = [0, 1, 2, 9, 10, 11, 4, 13, 7, 16];
pub const FACES: &[u8] = b"URFDLB";
/// The deepest second phase tried before a longer first phase, and the longest solution accepted.
const PHASE2_DEPTH: usize = 12;
const MAX_LENGTH: usize = 21;

/// A turn of the previous face, or of its opposite face in one fixed order, never shortens a sequence; 6: none yet.
#[inline(always)]
fn redundant(face: usize, last: usize) -> bool { last < 6 && (face == last || (face % 3 == last % 3 && face < last)) }

pub struct Tables {
    pub moves: [Cube; 18],
    in_phase2: [bool; 18],
    after: [Vec<u8>; 7],
    turned: [Cube; 3],
    back: [[u8; 18]; 3],
    twist: Vec<u16>,
    flip: Vec<u16>,
    slice: Vec<u16>,
    cperm: Vec<u16>,
    eperm: Vec<u16>,
    sperm: Vec<u16>,
    twist_slice: Vec<u8>,
    flip_slice: Vec<u8>,
    cperm_sperm: Vec<u8>,
    eperm_sperm: Vec<u8>,
}

/// How each move changes a coordinate, found by turning one cube of each value.
fn move_table(moves: &[Cube; 18], size: usize, list: &[usize], coord: fn(&Cube) -> usize) -> Vec<u16> {
    let mut table = vec![0u16; size * list.len()];
    let mut seen = vec![false; size];
    let mut reps = vec![SOLVED];
    seen[coord(&SOLVED)] = true;
    let mut i = 0;
    while i < reps.len() {
        let from = coord(&reps[i]);
        for (mi, &m) in list.iter().enumerate() {
            let n = reps[i].mul(&moves[m]);
            let to = coord(&n);
            table[from * list.len() + mi] = to as u16;
            if !seen[to] {
                seen[to] = true;
                reps.push(n);
            }
        }
        i += 1;
    }
    table
}

/// Breadth-first distances over two coordinates at once: the search's lower bounds.
fn prune_table(na: usize, nb: usize, a: &[u16], b: &[u16], moves: usize) -> Vec<u8> {
    let mut dist = vec![255u8; na * nb];
    dist[0] = 0;
    let mut queue = vec![0u32];
    let mut i = 0;
    while i < queue.len() {
        let q = queue[i] as usize;
        let (x, y, d) = (q / nb, q % nb, dist[q]);
        for m in 0..moves {
            let j = a[x * moves + m] as usize * nb + b[y * moves + m] as usize;
            if dist[j] == 255 {
                dist[j] = d + 1;
                queue.push(j as u32);
            }
        }
        i += 1;
    }
    dist
}

fn build() -> Tables {
    let mut moves = [SOLVED; 18];
    for f in 0..6 {
        moves[f * 3] = BASE[f];
        moves[f * 3 + 1] = moves[f * 3].mul(&BASE[f]);
        moves[f * 3 + 2] = moves[f * 3 + 1].mul(&BASE[f]);
    }
    let mut in_phase2 = [false; 18];
    for &m in &PHASE2_MOVES {
        in_phase2[m] = true;
    }
    let after = std::array::from_fn(|l| (0..18u8).filter(|&m| !redundant(m as usize / 3, (l + 6) % 7)).collect());
    let turned = [SOLVED, URF3, URF3.mul(&URF3)];
    let mut back = [[0u8; 18]; 3];
    for k in 0..3 {
        let inv = turned[k].inverse();
        for m in 0..18 {
            let target = inv.mul(&moves[m]).mul(&turned[k]);
            back[k][m] = (0..18).find(|&n| moves[n] == target).expect("urf3 maps turns to turns") as u8;
        }
    }
    let all: Vec<usize> = (0..18).collect();
    let (twist, flip, slice) = (move_table(&moves, 2187, &all, Cube::twist), move_table(&moves, 2048, &all, Cube::flip), move_table(&moves, 495, &all, Cube::slice));
    let (cperm, eperm, sperm) = (move_table(&moves, 40320, &PHASE2_MOVES, Cube::cperm), move_table(&moves, 40320, &PHASE2_MOVES, Cube::eperm), move_table(&moves, 24, &PHASE2_MOVES, Cube::sperm));
    Tables {
        twist_slice: prune_table(2187, 495, &twist, &slice, 18),
        flip_slice: prune_table(2048, 495, &flip, &slice, 18),
        cperm_sperm: prune_table(40320, 24, &cperm, &sperm, 10),
        eperm_sperm: prune_table(40320, 24, &eperm, &sperm, 10),
        moves, in_phase2, after, turned, back, twist, flip, slice, cperm, eperm, sperm,
    }
}

static TABLES: OnceLock<Tables> = OnceLock::new();

pub fn tables() -> &'static Tables { TABLES.get_or_init(build) }

struct Solver<'a> {
    t: &'a Tables,
    max: usize,
    path: [u8; 64],
    n: usize,
    // cubes[k]: the start after path[..k], known up to cubes[known]; phase 1's solutions share most of their turns.
    cubes: [Cube; 64],
    known: usize,
}

impl Solver<'_> {
    fn phase1(&mut self, twist: usize, flip: usize, slice: usize, depth: usize, n: usize, last: usize) -> bool {
        let t = self.t;
        let d = depth as u8;
        if t.twist_slice[twist * 495 + slice] > d || t.flip_slice[flip * 495 + slice] > d {
            return false;
        }
        if depth == 0 {
            // Ending on a phase 2 turn, a shorter first phase reaches the same group.
            return (n == 0 || !t.in_phase2[self.path[n - 1] as usize]) && self.to_phase2(n);
        }
        for &mv in &t.after[(last + 1) % 7] {
            let m = mv as usize;
            self.path[n] = mv;
            self.known = self.known.min(n);
            if self.phase1(t.twist[twist * 18 + m] as usize, t.flip[flip * 18 + m] as usize, t.slice[slice * 18 + m] as usize, depth - 1, n + 1, m / 3) {
                return true;
            }
        }
        false
    }

    fn to_phase2(&mut self, n: usize) -> bool {
        while self.known < n {
            self.cubes[self.known + 1] = self.cubes[self.known].mul(&self.t.moves[self.path[self.known] as usize]);
            self.known += 1;
        }
        let c = self.cubes[n];
        let (cp, ep, sp) = (c.cperm(), c.eperm(), c.sperm());
        let last = if n > 0 { self.path[n - 1] as usize / 3 } else { 6 };
        (0..=(self.max - n).min(PHASE2_DEPTH)).any(|depth| self.phase2(cp, ep, sp, depth, n, last))
    }

    #[allow(clippy::too_many_arguments)]
    fn phase2(&mut self, cp: usize, ep: usize, sp: usize, depth: usize, n: usize, last: usize) -> bool {
        let t = self.t;
        let d = depth as u8;
        if t.cperm_sperm[cp * 24 + sp] > d || t.eperm_sperm[ep * 24 + sp] > d {
            return false;
        }
        if depth == 0 {
            self.n = n;
            return true;
        }
        for (i, &m) in PHASE2_MOVES.iter().enumerate() {
            if redundant(m / 3, last) {
                continue;
            }
            self.path[n] = m as u8;
            if self.phase2(t.cperm[cp * 10 + i] as usize, t.eperm[ep * 10 + i] as usize, t.sperm[sp * 10 + i] as usize, depth - 1, n + 1, m / 3) {
                return true;
            }
        }
        false
    }
}

/// The turns reaching `c` from solved (face·3 + quarter, half or counter-clockwise turn), at most 21 when it can:
/// the first solution found among c and its inverse, each seen with U, R and F on top. Deterministic: the same cube
/// always gives the same turns (the daily scramble relies on it).
pub fn solve(c: &Cube) -> Vec<u8> {
    let t = tables();
    let mut s = Solver { t, max: MAX_LENGTH, path: [0; 64], n: 0, cubes: [SOLVED; 64], known: 0 };
    let mut starts = [SOLVED; 6];
    for k in 0..3 {
        let inv = t.turned[k].inverse();
        for (i, x) in [*c, c.inverse()].iter().enumerate() {
            starts[k * 2 + i] = t.turned[k].mul(x).mul(&inv);
        }
    }
    loop {
        for depth in 0..=s.max {
            for (v, start) in starts.iter().enumerate() {
                s.cubes[0] = *start;
                s.known = 0;
                if !s.phase1(start.twist(), start.flip(), start.slice(), depth, 0, 6) {
                    continue;
                }
                let (k, inverse) = (v / 2, v % 2 == 1);
                let mut out = vec![0u8; s.n];
                for i in 0..s.n {
                    let m = t.back[k][s.path[i] as usize];
                    // A solution of c, backwards and each turn the other way, makes c; one of its inverse makes c.
                    if inverse { out[i] = m } else { out[s.n - 1 - i] = m - m % 3 + 2 - m % 3 }
                }
                return out;
            }
        }
        s.max += 1;
    }
}

pub fn write(turns: &[u8], out: &mut String) {
    for (i, &m) in turns.iter().enumerate() {
        if i > 0 {
            out.push(' ');
        }
        out.push(FACES[m as usize / 3] as char);
        out.push_str(["", "2", "'"][m as usize % 3]);
    }
}

/// A uniformly random cube whose edges (or corners) are all random or all solved.
pub fn random_cube(rng: &mut Rng, edges: bool, corners: bool) -> Cube {
    let mut c = SOLVED;
    if edges {
        rng.shuffle(&mut c.ep);
    }
    if corners {
        rng.shuffle(&mut c.cp);
    }
    // Both permutations share their parity on a real cube.
    if odd(&c.cp) != odd(&c.ep) {
        if edges { c.ep.swap(0, 1) } else { c.cp.swap(0, 1) }
    }
    if corners {
        rng.twists(&mut c.co, 3);
    }
    if edges {
        rng.twists(&mut c.eo, 2);
    }
    c
}
