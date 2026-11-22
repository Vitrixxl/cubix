//! The practice's scrambles (src/client/lib/practiceScrambleCore.ts): the WCA's for the normal type, random moves on
//! a few faces, one orbit of the 3×3, a step left to solve, or a case of the catalogue.
use crate::puzzles::{Context, event_of, puzzle};
use crate::{alg, catalog, cube, steps};
use scrambler::Rng;

/// The scramble types the timer offers (the step ones belong to the training).
pub fn timer_types(puzzle_id: &str, mode: &str) -> Vec<String> { crate::puzzles::scramble_types(puzzle_id, mode).into_iter().filter(|t| !t.starts_with("cross1-") && steps::of_type(t).is_none()).collect() }

fn random_moves(faces: &[&str], suffixes: &[&str], length: usize, rng: &mut Rng) -> String {
    let mut previous = "";
    let mut out = vec![];
    for _ in 0..length {
        let options: Vec<&&str> = faces.iter().filter(|f| **f != previous).collect();
        let face = **rng.pick(&options);
        previous = face;
        out.push(format!("{face}{}", rng.pick(suffixes)));
    }
    out.join(" ")
}

/// A random case of a set, its setup turned upright and followed by a random turn of the top.
pub fn case_setup(set: &str, rng: &mut Rng) -> Option<String> {
    let cases: Vec<&catalog::Case> = catalog::catalog().cases_of_set(set).filter(|c| c.size() == Some(3)).collect();
    if cases.is_empty() { return None }
    let c = rng.pick(&cases);
    Some(upright_setup(&c.setup))
}

/// A setup followed by the rotation that brings the cube back upright.
pub fn upright_setup(setup: &str) -> String {
    let setup = alg::expand(setup);
    let mut cube = cube::Cube::solved(3);
    cube.apply(&setup);
    format!("{setup} {}", alg::upright(&cube).unwrap_or_default()).trim().to_string()
}

pub fn competition_event(c: &Context) -> String { event_of(&c.puzzle, &c.solve_mode).map_or_else(|| c.puzzle.clone(), |e| e.id.clone()) }

/// A scramble for `context`, drawn from `seed`; None for a type the device cannot draw.
pub fn practice(c: &Context, seed: u64) -> Option<String> {
    let mut rng = Rng::new(seed);
    let p = puzzle(&c.puzzle);
    if !p.relay.is_empty() { return Some(p.relay.iter().map(|e| crate::scramble(e, rng.next())).collect::<Vec<_>>().join("\n")) }
    let size = p.cube_size;
    let kind = c.scramble_type.as_str();
    let faces_all = ["R", "L", "U", "D", "F", "B"];
    Some(match kind {
        "normal" => crate::scramble(&competition_event(c), seed),
        _ if kind.starts_with("2gen-") || kind.starts_with("3gen-") => {
            let faces: Vec<String> = kind.split('-').nth(1)?.to_uppercase().chars().map(String::from).collect();
            let faces: Vec<&str> = faces.iter().map(String::as_str).collect();
            random_moves(&faces, &["", "'", "2"], if size == Some(2) { 15 } else { 25 }, &mut rng)
        }
        "half-turns" => random_moves(&faces_all, &["2"], if size == Some(2) { 15 } else { 30 }, &mut rng),
        "outer-turns" => random_moves(&faces_all, &["", "'", "2"], [0, 0, 11, 22, 40, 60, 80, 100][size?.min(7)], &mut rng),
        "edges-only" | "corners-only" => {
            let mut out = String::new();
            scrambler::orbit(kind == "corners-only", &mut rng, &mut out);
            out.trim().to_string()
        }
        "last-layer" => format!("{} {} {}", case_setup("oll", &mut rng)?, case_setup("pll", &mut rng)?, rng.pick(&alg::AUFS)).trim().to_string(),
        "oll" | "pll" | "f2l" => format!("{} {}", case_setup(kind, &mut rng)?, rng.pick(&alg::AUFS)).trim().to_string(),
        _ => {
            let (spec, moves) = steps::of_type(kind)?;
            steps::scramble(spec, moves, &mut rng)
        }
    })
}

/// A case's scramble for the training: its setup (or one of its others), shown after a random turn of the top on a
/// cube. Returns the scramble and that turn.
pub fn case(c: &catalog::Case, seed: u64) -> (String, String) {
    let mut rng = Rng::new(seed);
    let mut setups = vec![c.setup.clone()];
    setups.extend(c.setups_alt.iter().cloned());
    let setup = rng.pick(&setups).clone();
    if c.size().is_none() { return (setup, String::new()) }
    let auf = rng.pick(&alg::AUFS).to_string();
    (alg::combine_auf(&alg::expand(&setup), &auf), auf)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_type_scrambles() {
        for p in crate::puzzles::puzzles() {
            for t in &p.scrambles {
                if t.starts_with("cross1-") { continue }
                let c = Context::new(&p.id, "standard", t);
                let s = practice(&c, 11).unwrap_or_else(|| panic!("{} {t}", p.id));
                assert!(!s.is_empty(), "{} {t}", p.id);
                if let Some(n) = p.cube_size {
                    let mut cube = cube::Cube::solved(n);
                    assert!(s.lines().all(|l| cube.apply(l)), "{} {t}: {s}", p.id);
                }
            }
        }
        let sune = catalog::catalog().case("OLL 27").unwrap();
        let (s, _) = case(sune, 3);
        let mut cube = cube::Cube::solved(3);
        assert!(cube.apply(&s));
    }
}
