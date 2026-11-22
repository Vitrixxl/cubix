//! Blindfolded memo on the 3×3 (src/client/lib/bld.ts): the scramble traced from its buffers (UF for edges, UFR for
//! corners) in the Speffz letter scheme, edges then corners. A cycle break goes to the unsolved piece with the lowest
//! letter; a piece in place but flipped or twisted is noted apart; an odd count of corner targets is parity.
use crate::cube::Cube;

/// Facelets of the net (U L F R B D, as `Cube::net`) of each corner, its U/D sticker first then clockwise.
const CORNERS: [[(usize, usize); 3]; 8] = [
    [(0, 8), (2, 2), (3, 0)], // UFR
    [(0, 6), (1, 2), (2, 0)], // UFL
    [(0, 0), (4, 2), (1, 0)], // UBL
    [(0, 2), (3, 2), (4, 0)], // UBR
    [(5, 2), (3, 6), (2, 8)], // DFR
    [(5, 0), (2, 6), (1, 8)], // DFL
    [(5, 6), (1, 6), (4, 8)], // DBL
    [(5, 8), (4, 6), (3, 8)], // DBR
];

/// Facelets of each edge, its U/D (or F/B for the middle layer) sticker first.
const EDGES: [[(usize, usize); 2]; 12] = [
    [(0, 7), (2, 1)], // UF
    [(0, 5), (3, 1)], // UR
    [(0, 1), (4, 1)], // UB
    [(0, 3), (1, 1)], // UL
    [(5, 1), (2, 7)], // DF
    [(5, 5), (3, 7)], // DR
    [(5, 7), (4, 7)], // DB
    [(5, 3), (1, 7)], // DL
    [(2, 5), (3, 3)], // FR
    [(2, 3), (1, 5)], // FL
    [(4, 3), (3, 5)], // BR
    [(4, 5), (1, 3)], // BL
];

/// The Speffz letter of a facelet: faces U L F R B D get A–D, E–H… clockwise from the top left.
pub fn letter(face: usize, i: usize, corner: bool) -> char {
    let order: [usize; 4] = if corner { [0, 2, 8, 6] } else { [1, 5, 7, 3] };
    let k = order.iter().position(|x| *x == i).unwrap_or(0);
    (b'A' + (face * 4 + k) as u8) as char
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Part {
    pub targets: Vec<char>,
    /// Pieces in place but flipped or twisted.
    pub turned: Vec<char>,
    pub parity: bool,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Memo {
    pub edges: Part,
    pub corners: Part,
}

/// The pieces' home of each facelet: for every piece slot and sticker, the (slot, sticker) its sticker belongs to.
fn homes<const K: usize>(net: &[Vec<u8>; 6], pieces: &[[(usize, usize); K]], centre: &[u8; 6]) -> Vec<[(usize, usize); K]> {
    // A piece is told by its colours; the colour of each face is its centre's.
    let face_of = |colour: u8| centre.iter().position(|c| *c == colour).unwrap_or(0);
    pieces
        .iter()
        .map(|slot| {
            let faces: Vec<usize> = slot.iter().map(|(f, i)| face_of(net[*f][*i])).collect();
            let mut out = [(0usize, 0usize); K];
            for (home, h) in pieces.iter().enumerate() {
                let home_faces: Vec<usize> = h.iter().map(|(f, _)| *f).collect();
                for r in 0..K {
                    if (0..K).all(|k| faces[(k + r) % K] == home_faces[k]) {
                        for k in 0..K {
                            out[(k + r) % K] = (home, k);
                        }
                        return out;
                    }
                }
            }
            out
        })
        .collect()
}

fn trace<const K: usize>(net: &[Vec<u8>; 6], pieces: &[[(usize, usize); K]], centre: &[u8; 6], buffer: usize) -> Part {
    let corner = K == 3;
    let homes = homes(net, pieces, centre);
    let letter_of = |slot: usize, k: usize| {
        let (f, i) = pieces[slot][k];
        letter(f, i, corner)
    };
    let solved = |slot: usize| homes[slot][0] == (slot, 0) && (0..K).all(|k| homes[slot][k] == (slot, k));
    let in_place = |slot: usize| homes[slot][0].0 == slot;
    let mut part = Part::default();
    let mut done = vec![false; pieces.len()];
    done[buffer] = true;
    for (s, d) in done.iter_mut().enumerate() {
        if solved(s) { *d = true }
    }
    // Flipped or twisted in place: noted apart, out of the cycles.
    for s in 0..pieces.len() {
        if s != buffer && in_place(s) && !solved(s) {
            done[s] = true;
            let k = if corner { (0..K).find(|k| homes[s][*k].1 == 0).unwrap_or(0) } else { (0..K).min_by_key(|k| letter_of(s, *k)).unwrap_or(0) };
            part.turned.push(letter_of(s, k));
        }
    }
    let mut cur = (buffer, 0usize);
    let mut cycle_start: Option<usize> = None;
    for _ in 0..64 {
        let next = homes[cur.0][cur.1];
        let back_to_buffer = next.0 == buffer;
        let back_to_start = cycle_start == Some(next.0);
        if back_to_buffer || back_to_start {
            if back_to_start {
                // The broken cycle ends on its piece again.
                part.targets.push(letter_of(next.0, next.1));
            }
            // A new cycle: the unsolved piece with the lowest letter.
            let open: Option<(usize, usize)> = (0..pieces.len()).filter(|s| !done[*s]).flat_map(|s| (0..K).map(move |k| (s, k))).min_by_key(|(s, k)| letter_of(*s, *k));
            let Some(start) = open else { break };
            part.targets.push(letter_of(start.0, start.1));
            done[start.0] = true;
            cycle_start = Some(start.0);
            cur = start;
            continue;
        }
        part.targets.push(letter_of(next.0, next.1));
        done[next.0] = true;
        cur = next;
    }
    part.parity = corner && part.targets.len() % 2 == 1;
    part
}

/// The memo of a scrambled 3×3 (white on top, green in front).
pub fn memo(scramble: &str) -> Memo {
    let mut cube = Cube::solved(3);
    cube.apply(scramble);
    // Wide turns and rotations at the end of a blindfolded scramble move the centres: turn it back.
    if let Some(r) = crate::alg::upright(&cube) { cube.apply(&r); }
    let net = cube.net();
    let centre: [u8; 6] = std::array::from_fn(|f| net[f][4]);
    Memo { edges: trace(&net, &EDGES, &centre, 0), corners: trace(&net, &CORNERS, &centre, 0) }
}

/// Letters in pairs: "AB CD E".
pub fn pairs(letters: &[char]) -> Vec<String> { letters.chunks(2).map(|c| c.iter().collect()).collect() }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn traces_simple_cases() {
        assert_eq!(memo(""), Memo::default());
        // A U turn cycles the top edges: UF holds UR's piece… Speffz with buffer C (UF).
        // An R2 swaps UR and DR, FR and BR (two broken cycles), UFR with DBR and UBR with DFR.
        let m = memo("R2");
        assert_eq!(m.edges.targets.iter().collect::<String>(), "BVBJTJ", "{:?}", m.edges);
        assert_eq!(m.corners.targets.iter().collect::<String>(), "WBVB", "{:?}", m.corners);
        assert!(!m.corners.parity);
        // T permutation: UR↔UL edges (a cycle break), UFR↔UBR corners: parity.
        let t = memo("R U R' U' R' F R2 U' R' U' R U R' F'");
        assert_eq!(t.edges.targets.iter().collect::<String>(), "BDB", "{:?}", t.edges);
        assert_eq!(t.corners.targets.iter().collect::<String>(), "B", "{:?}", t.corners);
        assert!(t.corners.parity);
    }
}
