//! Algorithms as text (src/shared/cube.ts): moves read in any size of cube, groups expanded, inverted, mirrored, and
//! the turn of the top (AUF) a case is shown with.

/// One move: the axis it turns about (x right, y up, z front), its layers on doubled coordinates, and its counter-
/// clockwise quarter turns about the axis.
#[derive(Clone, Debug, PartialEq)]
pub struct Move {
    pub axis: usize,
    pub layers: Vec<i32>,
    pub quarters: u8,
}

/// Reads one move: R, R', R2, R2', R3, Rw, r, 3Rw, 2R, M, E, S, x, y, z.
pub fn parse(token: &str, n: usize) -> Option<Move> {
    let digits: String = token.chars().take_while(|c| c.is_ascii_digit()).collect();
    let rest = &token[digits.len()..];
    let mut chars = rest.chars();
    let letter = chars.next()?;
    let mut tail: &str = chars.as_str();
    let wide_w = tail.starts_with('w');
    if wide_w { tail = &tail[1..] }
    let (count, prime) = {
        let t = tail.trim_end_matches('\'');
        let prime = tail.ends_with('\'');
        let t2 = if let Some(x) = t.strip_suffix('\'') { x } else { t };
        let count: u8 = if t2.is_empty() { 1 } else { t2.parse().ok().filter(|c| (1..=3).contains(c))? };
        (count, prime)
    };
    if tail.len() > 3 { return None }
    let (axis, sign, kind) = match letter {
        'R' | 'r' => (0, 1, 'f'),
        'L' | 'l' => (0, -1, 'f'),
        'U' | 'u' => (1, 1, 'f'),
        'D' | 'd' => (1, -1, 'f'),
        'F' | 'f' => (2, 1, 'f'),
        'B' | 'b' => (2, -1, 'f'),
        'M' => (0, -1, 's'),
        'E' => (1, -1, 's'),
        'S' => (2, 1, 's'),
        'x' => (0, 1, 'r'),
        'y' => (1, 1, 'r'),
        'z' => (2, 1, 'r'),
        _ => return None,
    };
    let ni = n as i32;
    let all: Vec<i32> = (0..ni).map(|i| ni - 1 - 2 * i).collect();
    let layers = match kind {
        'r' => all.clone(),
        's' => all[1..all.len().saturating_sub(1).max(1)].to_vec(),
        _ => {
            let wide = wide_w || letter.is_ascii_lowercase();
            let depth: usize = if digits.is_empty() { if wide { 2 } else { 1 } } else { digits.parse().ok()? };
            if depth < 1 || depth > n { return None }
            if wide { all[..depth].iter().map(|v| sign * v).collect() } else { vec![sign * all[depth - 1]] }
        }
    };
    if !digits.is_empty() && kind != 'f' { return None }
    // Clockwise seen from the face it names: a negative quarter about an axis pointing at it.
    let clockwise = (count % 4) as i32;
    let q = if prime { -clockwise } else { clockwise };
    let quarters = (if sign > 0 { -q } else { q }).rem_euclid(4) as u8;
    Some(Move { axis, layers, quarters })
}

/// Groups expanded: "(R U R' U')2" → four moves twice, "(R U)'" → "U' R'", brackets as parentheses.
pub fn expand(alg: &str) -> String {
    let mut s = alg.replace('[', "(").replace(']', ")");
    for _ in 0..100 {
        let Some(close) = s.find(')') else { break };
        let Some(open) = s[..close].rfind('(') else { break };
        let inner = s[open + 1..close].to_string();
        let after = &s[close + 1..];
        let count: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
        let prime = after[count.len()..].starts_with('\'');
        let n: usize = count.parse().unwrap_or(1);
        let body = if prime { invert(&inner) } else { inner.trim().to_string() };
        let end = close + 1 + count.len() + prime as usize;
        s = format!("{} {} {}", &s[..open], vec![body; n].join(" "), &s[end..]);
    }
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn split_token(token: &str) -> (String, String, u8, bool) {
    let digits: String = token.chars().take_while(|c| c.is_ascii_digit()).collect();
    let rest = &token[digits.len()..];
    let mut chars = rest.chars();
    let letter = chars.next().map(String::from).unwrap_or_default();
    let mut tail = chars.as_str();
    let w = tail.starts_with('w');
    if w { tail = &tail[1..] }
    let prime = tail.contains('\'');
    let n = tail.trim_matches('\'').parse::<u8>().unwrap_or(1);
    (format!("{digits}{letter}{}", if w { "w" } else { "" }), letter, n, prime)
}

pub fn invert_token(token: &str) -> String {
    let (base, _, n, prime) = split_token(token);
    match n % 4 {
        2 => format!("{base}2"),
        0 => base,
        3 => if prime { format!("{base}'") } else { base },
        _ => if prime { base } else { format!("{base}'") },
    }
}

pub fn invert(alg: &str) -> String { expand(alg).split_whitespace().rev().map(invert_token).collect::<Vec<_>>().join(" ") }

/// The algorithm seen in a mirror on the M slice: R and L swap, every turn goes the other way but M and x.
pub fn mirror(alg: &str) -> String {
    expand(alg)
        .split_whitespace()
        .map(|t| {
            let (base, letter, _, _) = split_token(t);
            let swapped = match letter.as_str() { "R" => "L", "L" => "R", "r" => "l", "l" => "r", l => l }.to_string();
            let mapped = t.replacen(&letter, &swapped, 1);
            let _ = base;
            if matches!(letter.as_str(), "M" | "x") { mapped } else { invert_token(&mapped) }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// The algorithm's length, rotations not counted.
pub fn move_count(alg: &str) -> usize { expand(alg).split_whitespace().filter(|m| !m.starts_with(['x', 'y', 'z'])).count() }

pub const AUFS: [&str; 4] = ["", "U", "U2", "U'"];

fn u_quarters(token: &str) -> Option<u8> { parse(token, 3).filter(|m| m.axis == 1 && m.layers == [2]).map(|m| m.quarters) }

fn u_of(q: u8) -> &'static str { ["", "U'", "U2", "U"][q as usize % 4] }

/// A setup followed by a turn of the top, merged with its last U turn.
pub fn combine_auf(setup: &str, auf: &str) -> String {
    let mut tokens: Vec<String> = expand(setup).split_whitespace().map(String::from).collect();
    let Some(aq) = u_quarters(auf) else { return tokens.join(" ") };
    if let Some(lq) = tokens.last().and_then(|t| u_quarters(t)) {
        tokens.pop();
        let q = (lq + aq) % 4;
        if q != 0 { tokens.push(u_of(q).into()) }
        return tokens.join(" ");
    }
    tokens.push(auf.into());
    tokens.join(" ")
}

/// An algorithm made to start from its case shown after `auf`: the turn undoing it merged into its first U turns.
pub fn compensate_auf(alg: &str, auf: &str) -> String {
    let clean = alg.split_whitespace().collect::<Vec<_>>().join(" ");
    let Some(mut q) = u_quarters(&invert(auf)) else { return clean };
    let mut rest: Vec<&str> = clean.split_whitespace().collect();
    while let Some(first) = rest.first() {
        let Some(fq) = u_quarters(first) else { break };
        q = (q + fq) % 4;
        rest.remove(0);
    }
    let lead = u_of(q);
    [lead.to_string(), rest.join(" ")].into_iter().filter(|s| !s.is_empty()).collect::<Vec<_>>().join(" ")
}

/// The rotation bringing a cube's centres back to white on top and green in front, if it has centres.
pub fn upright(cube: &crate::cube::Cube) -> Option<String> {
    let want = crate::cube::Cube::solved(cube.n).centres();
    for a in ["", "x", "x2", "x'", "z", "z'"] {
        for b in ["", "y", "y2", "y'"] {
            let alg = format!("{a} {b}");
            let mut c = cube.clone();
            c.apply(&alg);
            if c.centres() == want { return Some(alg.split_whitespace().collect::<Vec<_>>().join(" ")) }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cube::Cube;

    #[test]
    fn expands_inverts_mirrors() {
        assert_eq!(expand("(R U R' U')2"), "R U R' U' R U R' U'");
        assert_eq!(expand("[R U]'"), "U' R'");
        assert_eq!(invert("R U2 F'"), "F U2 R'");
        assert_eq!(mirror("R U R'"), "L' U' L");
        assert_eq!(combine_auf("R U R' U", "U2"), "R U R' U'");
        assert_eq!(compensate_auf("U R U' R'", "U"), "R U' R'");
        let mut c = Cube::solved(3);
        c.apply("R U r' M2 E S' x y' z2 R3 U2'");
        let undo = invert("R U r' M2 E S' x y' z2 R3 U2'");
        c.apply(&undo);
        assert!(c.is_solved());
        let mut c = Cube::solved(3);
        c.apply("R U x y");
        assert_eq!(upright(&c).as_deref().map(|r| { let mut d = c.clone(); d.apply(r); d.centres() == Cube::solved(3).centres() }), Some(true));
    }
}
