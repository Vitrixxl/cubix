//! The analysis of a solve turned on a smart cube (src/client/lib/solveAnalysis.ts, its CFOP part): the solution
//! replayed on the scramble, cut where each step is done (the cross, of any colour; each F2L pair; OLL; PLL), with each
//! step's turns, time, and the pause before its first turn (recognition). Solutions are written as the web writes
//! them: turns with their time since the first, "R@0 U'@142".
use crate::cube::Cube;

pub fn read(solution: &str) -> Option<Vec<(String, Option<u64>)>> {
    let mut out = vec![];
    for w in solution.split_whitespace() {
        let (turn, at) = match w.split_once('@') {
            Some((t, a)) => (t, Some(a.parse().ok()?)),
            None => (w, None),
        };
        if !matches!(turn.chars().next(), Some('U' | 'D' | 'F' | 'B' | 'R' | 'L')) || turn.len() > 3 { return None }
        out.push((turn.to_string(), at));
    }
    (!out.is_empty()).then_some(out)
}

pub fn write(turns: &[(String, i64)]) -> String {
    let start = turns.first().map_or(0, |t| t.1);
    turns.iter().map(|(t, at)| format!("{t}@{}", (at - start).max(0))).collect::<Vec<_>>().join(" ")
}

#[derive(Clone, Debug, PartialEq)]
pub struct Step {
    pub name: String,
    /// Turns of the step (its first turn's index in the solution, and how many).
    pub first: usize,
    pub turns: usize,
    /// Its time, from the end of the step before (ms), and the pause before its first turn.
    pub ms: Option<u64>,
    pub recognition: Option<u64>,
}

const N: i32 = 3;

fn dot(a: [i32; 3], b: [i32; 3]) -> i32 { a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }

struct View {
    stickers: Vec<([i32; 3], [i32; 3], u8)>,
}

impl View {
    fn of(c: &Cube) -> Self { Self { stickers: c.stickers().collect() } }
    fn centre(&self, normal: [i32; 3]) -> u8 { self.stickers.iter().find(|(p, n, _)| *n == normal && (0..3).all(|i| p[i] == normal[i] * N)).map_or(0, |s| s.2) }
    /// Whether every sticker of the cubie at `cubie` (doubled coordinates) has its face's colour.
    fn solved(&self, cubie: [i32; 3]) -> bool {
        self.stickers.iter().filter(|(p, n, _)| (0..3).all(|i| p[i] - n[i] == cubie[i] || (n[i] != 0 && p[i] == n[i] * N && cubie[i] == n[i] * (N - 1)))).all(|(_, n, c)| *c == self.centre(*n))
    }
}

const NORMALS: [[i32; 3]; 6] = [[0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0]];

/// The cubies of a layer facing `normal` (its edges or corners) and of the middle slice around it.
fn cubies(normal: [i32; 3], depth: i32, corners: bool) -> Vec<[i32; 3]> {
    let mut out = vec![];
    for x in [-2, 0, 2] {
        for y in [-2, 0, 2] {
            for z in [-2, 0, 2] {
                let p = [x, y, z];
                if dot(p, normal) != depth * 2 { continue }
                let off = (0..3).filter(|i| normal[*i] == 0 && p[*i] != 0).count();
                if (corners && off == 2) || (!corners && off == 1) { out.push(p) }
            }
        }
    }
    out
}

fn cross(v: &View, n: [i32; 3]) -> bool { cubies(n, 1, false).iter().all(|c| v.solved(*c)) }

/// F2L pairs done around the cross on `n`: corner of the cross's layer and edge of the middle layer, slot by slot.
fn pairs(v: &View, n: [i32; 3]) -> usize {
    cubies(n, 1, true).into_iter().filter(|corner| {
        let edge = [corner[0] - n[0] * 2, corner[1] - n[1] * 2, corner[2] - n[2] * 2];
        v.solved(*corner) && v.solved(edge)
    }).count()
}

fn oll(v: &View, n: [i32; 3]) -> bool {
    let top = [-n[0], -n[1], -n[2]];
    let c = v.centre(top);
    v.stickers.iter().filter(|(_, nn, _)| *nn == top).all(|s| s.2 == c)
}

/// The steps of a CFOP solve, or None when the solution does not solve the scramble.
pub fn cfop(scramble: &str, solution: &[(String, Option<u64>)]) -> Option<Vec<Step>> {
    let mut cube = Cube::solved(3);
    cube.apply(scramble);
    let mut states = vec![View::of(&cube)];
    for (t, _) in solution {
        if !cube.apply(t) { return None }
        states.push(View::of(&cube));
    }
    if !cube.is_solved() { return None }
    // The cross: the first one done, of any colour (the one with the most pairs around it when two come together).
    let cross_at = (0..states.len()).find(|i| NORMALS.iter().any(|n| cross(&states[*i], *n)))?;
    let face = *NORMALS.iter().filter(|n| cross(&states[cross_at], **n)).max_by_key(|n| pairs(&states[cross_at], **n))?;
    let mut marks: Vec<(String, usize)> = vec![("Cross".into(), cross_at)];
    // Each pair when a pair more than ever before is in, the cross with it (an algorithm may break them for a while).
    let mut done = 0;
    for (i, s) in states.iter().enumerate().skip(cross_at) {
        let p = if cross(s, face) { pairs(s, face) } else { 0 };
        while done < p && done < 4 {
            done += 1;
            marks.push((format!("F2L {done}"), i));
        }
        if done == 4 { break }
    }
    if done < 4 { return None }
    let f2l_end = marks.last()?.1;
    let oll_at = (f2l_end..states.len()).find(|i| oll(&states[*i], face) && cross(&states[*i], face) && pairs(&states[*i], face) == 4)?;
    marks.push(("OLL".into(), oll_at));
    marks.push(("PLL".into(), states.len() - 1));
    let time = |i: usize| if i == 0 { Some(0) } else { solution[i - 1].1 };
    let mut out = vec![];
    let mut prev = 0usize;
    for (name, end) in marks {
        let turns = end - prev;
        let ms = match (time(end), time(prev)) {
            (Some(a), Some(b)) => Some(a.saturating_sub(b)),
            _ => None,
        };
        let recognition = if turns > 0 && prev > 0 { match (solution[prev].1, solution[prev - 1].1) { (Some(a), Some(b)) => Some(a.saturating_sub(b)), _ => None } } else { None };
        out.push(Step { name, first: prev, turns, ms, recognition });
        prev = end;
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cuts_a_solve_into_steps() {
        // A scramble made of a T permutation: the cross and F2L are already there, OLL is skipped, PLL solves it.
        let t = "R U R' U' R' F R2 U' R' U' R U R' F'";
        let scramble = crate::alg::invert(t);
        let solution: Vec<(String, Option<u64>)> = t.split_whitespace().enumerate().map(|(i, m)| (m.to_string(), Some(i as u64 * 100))).collect();
        let steps = cfop(&scramble, &solution).unwrap();
        assert_eq!(steps.iter().map(|s| s.turns).sum::<usize>(), 14);
        assert_eq!(steps.last().unwrap().name, "PLL");
        assert_eq!(steps.last().unwrap().turns, 14);
        assert_eq!(read("R@0 U'@142").unwrap()[1], ("U'".to_string(), Some(142)));
        assert!(cfop("R", &[("U".into(), None)]).is_none());
    }
}
