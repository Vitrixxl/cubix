//! Qbix's logic for the native app, without any interface: puzzles, scrambles, the timer, times, the store and its
//! synchronisation with the API.
pub mod achievements;
pub mod account;
pub mod alg;
pub mod analysis;
pub mod api;
pub mod bld;
pub mod catalog;
pub mod cube;
pub mod daily;
pub mod date;
pub mod i18n;
pub mod import;
pub mod live;
pub mod methods;
pub mod puzzles;
pub mod scramble;
pub mod smart;
pub mod steps;
pub mod store;
pub mod sync;
pub mod time;
pub mod training;
pub mod timer;

pub use i18n::{t, tf};
pub use scrambler::Rng;

/// A competition scramble of `event`, drawn with `seed`.
pub fn scramble(event: &str, seed: u64) -> String {
    let mut out = String::new();
    scrambler::event(event, &mut scrambler::Rng::new(seed), &mut out);
    out.trim().to_string()
}

#[cfg(test)]
mod tests {
    #[test]
    fn every_event_scrambles() {
        for e in super::puzzles::events().iter().filter(|e| !e.puzzle.starts_with('r')) {
            assert!(!super::scramble(&e.id, 7).is_empty(), "{}", e.id);
        }
        let mut c = super::cube::Cube::solved(5);
        assert!(c.apply(&super::scramble("555", 3)));
    }
}
