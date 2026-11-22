//! The daily scramble (src/client/lib/daily.ts): one a day per puzzle, the same on every device, drawn from a
//! generator seeded by the UTC date and the puzzle (cyrb53, then mulberry32, as the web draws it).
use serde::Deserialize;

/// The day of the daily scramble: the UTC date.
pub fn today() -> String { crate::date::iso(crate::store::now_ms() as i64)[..10].to_string() }

/// A seeded generator: `below(n)` draws in 0..n exactly as the web's does.
struct Seeded(u32);

impl Seeded {
    fn new(seed: &str) -> Self {
        let (mut h1, mut h2) = (0xdeadbeefu32, 0x41c6ce57u32);
        for c in seed.encode_utf16() {
            h1 = (h1 ^ c as u32).wrapping_mul(2654435761);
            h2 = (h2 ^ c as u32).wrapping_mul(1597334677);
        }
        let a = (h1 ^ (h1 >> 16)).wrapping_mul(2246822507) ^ (h2 ^ (h2 >> 13)).wrapping_mul(3266489909);
        Self(a)
    }

    fn below(&mut self, n: f64) -> u64 {
        self.0 = self.0.wrapping_add(0x6d2b79f5);
        let a = self.0;
        let mut t = (a ^ (a >> 15)).wrapping_mul(1 | a);
        t = t.wrapping_add((t ^ (t >> 7)).wrapping_mul(61 | t)) ^ t;
        (((t ^ (t >> 14)) as f64 / 4294967296.0) * n).floor() as u64
    }
}

fn shuffle(p: &mut [u8], s: &mut Seeded) {
    for i in (1..p.len()).rev() {
        let j = s.below((i + 1) as f64) as usize;
        p.swap(i, j);
    }
}

fn odd(p: &[u8]) -> bool { (0..p.len()).map(|i| p[i + 1..].iter().filter(|&&b| b < p[i]).count()).sum::<usize>() % 2 == 1 }

fn twists(count: usize, m: u8, s: &mut Seeded) -> Vec<u8> {
    let mut list: Vec<u8> = (0..count - 1).map(|_| s.below(m as f64) as u8).collect();
    let sum: u32 = list.iter().map(|&x| x as u32).sum();
    list.push(((m as u32 - sum % m as u32) % m as u32) as u8);
    list
}

/// The day's scramble of a puzzle.
pub fn scramble(day: &str, event: &str) -> String {
    let mut s = Seeded::new(&format!("qbix-daily:{day}:{event}"));
    let mut out = String::new();
    if event == "333" {
        let mut edges: Vec<u8> = (0..12).collect();
        shuffle(&mut edges, &mut s);
        let mut corners: Vec<u8> = (0..8).collect();
        shuffle(&mut corners, &mut s);
        if odd(&edges) != odd(&corners) { edges.swap(0, 1) }
        let eo = twists(12, 2, &mut s);
        let co = twists(8, 3, &mut s);
        scrambler::pattern(&edges, &eo, &corners, &co, &mut out);
    } else {
        let a = s.below(4294967296.0);
        let b = s.below(4294967296.0);
        scrambler::event(event, &mut scrambler::Rng::new(a << 32 | b), &mut out);
    }
    out.trim().to_string()
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Place {
    pub rank: u32,
    pub beats: u32,
    pub time_ms: f64,
    pub penalty: crate::time::Penalty,
    #[serde(default)]
    pub verified: bool,
    #[serde(default)]
    pub cancellable: bool,
}

#[derive(Clone, Debug, Deserialize)]
pub struct Buckets {
    pub from: f64,
    pub width: f64,
    pub counts: Vec<u32>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Board {
    pub day: String,
    pub total: u32,
    #[serde(default)]
    pub dnf: u32,
    pub buckets: Buckets,
    pub mine: Option<Place>,
    pub placed: Option<Place>,
    #[serde(default)]
    pub ranked: Option<bool>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Day {
    pub day: String,
    pub rank: u32,
    pub time_ms: f64,
    pub penalty: crate::time::Penalty,
    pub total: u32,
}

#[cfg(test)]
mod tests {
    #[test]
    fn the_same_every_time() {
        let a = super::scramble("2026-11-22", "333");
        assert_eq!(a, super::scramble("2026-11-22", "333"));
        assert_ne!(a, super::scramble("2026-11-23", "333"));
        assert!(!super::scramble("2026-11-22", "pyram").is_empty());
    }
}
#[cfg(test)]
mod parity {
    /// The web's daily scramble of that day (src/client/lib/daily.ts with the WebAssembly scrambler).
    #[test]
    fn matches_the_web() { assert_eq!(super::scramble("2026-11-22", "333"), "U2 F2 U2 R2 F2 R2 B' R2 D2 R2 F2 U2 L' B U2 F D' L2 F R2") }
}
