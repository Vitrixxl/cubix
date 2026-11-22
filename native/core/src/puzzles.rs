//! The puzzles, events, solve modes and scramble types, from data/puzzles.json (the registry the web and the phone
//! read too).
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Puzzle {
    pub id: String,
    pub label: String,
    pub cube_size: Option<usize>,
    pub scrambles: Vec<String>,
    #[serde(default)]
    pub relay: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct Labelled {
    pub id: String,
    pub label: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub id: String,
    pub label: String,
    pub puzzle: String,
    pub solve_mode: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Registry {
    puzzles: Vec<Puzzle>,
    scrambles: Vec<Labelled>,
    solve_modes: Vec<Labelled>,
    events: Vec<Event>,
}

fn registry() -> &'static Registry {
    static R: OnceLock<Registry> = OnceLock::new();
    R.get_or_init(|| serde_json::from_str(include_str!("../../../data/puzzles.json")).expect("data/puzzles.json"))
}

pub fn puzzles() -> &'static [Puzzle] { &registry().puzzles }
pub fn events() -> &'static [Event] { &registry().events }
pub fn solve_modes() -> &'static [Labelled] { &registry().solve_modes }

pub fn puzzle(id: &str) -> &'static Puzzle { puzzles().iter().find(|p| p.id == id).unwrap_or(&puzzles()[1]) }
pub fn event(id: &str) -> Option<&'static Event> { events().iter().find(|e| e.id == id) }
pub fn event_of(puzzle: &str, mode: &str) -> Option<&'static Event> { events().iter().find(|e| e.puzzle == puzzle && e.solve_mode == mode) }

pub fn scramble_label(id: &str) -> &str {
    if id == "case" { return "Algorithm case" }
    registry().scrambles.iter().find(|s| s.id == id).map_or(id, |s| s.label.as_str())
}

pub fn mode_label(id: &str) -> &str { solve_modes().iter().find(|m| m.id == id).map_or(id, |m| m.label.as_str()) }

/// Fewest Moves and Multi-Blind: an attempt gives a result other than a time alone.
pub fn attempt_mode(mode: &str) -> bool { matches!(mode, "fewest-moves" | "multi-blind") }

/// What is practised: a puzzle, a way of solving it and the kind of scramble.
#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Context {
    pub puzzle: String,
    pub solve_mode: String,
    pub scramble_type: String,
}

impl Default for Context {
    fn default() -> Self { Self { puzzle: "333".into(), solve_mode: "standard".into(), scramble_type: "normal".into() } }
}

impl Context {
    pub fn new(puzzle: &str, solve_mode: &str, scramble_type: &str) -> Self { Self { puzzle: puzzle.into(), solve_mode: solve_mode.into(), scramble_type: scramble_type.into() } }

    /// The event's name ("3×3 One-Handed"), with the scramble type when it is not the normal one.
    pub fn label(&self) -> String {
        let base = event_of(&self.puzzle, &self.solve_mode).map_or_else(|| format!("{} {}", puzzle(&self.puzzle).label, mode_label(&self.solve_mode)), |e| e.label.clone());
        if self.scramble_type == "normal" { base } else { format!("{base} · {}", scramble_label(&self.scramble_type)) }
    }

    /// The event's short name: the puzzle, and the mode when it is not standard.
    pub fn event_id(&self) -> String { event_of(&self.puzzle, &self.solve_mode).map_or_else(|| self.puzzle.clone(), |e| e.id.clone()) }

    pub fn cube_size(&self) -> Option<usize> { puzzle(&self.puzzle).cube_size }

    /// A context the app can practise: a known puzzle, its scramble types, an event for its solve mode.
    pub fn valid(&self) -> bool {
        let p = puzzle(&self.puzzle);
        p.id == self.puzzle && (self.solve_mode == "standard" || event_of(&self.puzzle, &self.solve_mode).is_some()) && (self.scramble_type == "case" || scramble_types(&self.puzzle, &self.solve_mode).contains(&self.scramble_type))
    }
}

pub fn scramble_types(puzzle_id: &str, mode: &str) -> Vec<String> { if attempt_mode(mode) { vec!["normal".into()] } else { puzzle(puzzle_id).scrambles.clone() } }

/// The solve modes a puzzle has events for.
pub fn modes_of(puzzle_id: &str) -> Vec<&'static str> { events().iter().filter(|e| e.puzzle == puzzle_id).map(|e| e.solve_mode.as_str()).collect() }

/// How a round of the event is counted: average of 5, mean of 3 or best of 3.
pub fn round_format(event: &str) -> &'static str {
    if matches!(event, "666" | "777" | "333fm") { "mo3" } else if event.ends_with("bf") { "bo3" } else { "ao5" }
}
