//! The algorithm catalogue (data/catalog.json): sets of cases for every puzzle, each case with the setup that shows
//! it and its algorithms.
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::OnceLock;

#[derive(Clone, Debug, Deserialize)]
pub struct Alg {
    pub alg: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub votes: Option<i32>,
    #[serde(default)]
    pub stm: Option<u32>,
    #[serde(default)]
    #[serde(rename = "gen")]
    pub generator: Option<String>,
    #[serde(default)]
    pub youtube: Option<String>,
    /// The turn of the top to make before the algorithm, from the case as its setup shows it.
    #[serde(default)]
    pub pre_auf: Option<String>,
}

impl Alg {
    /// As the player reads it: "(U) R U R'".
    pub fn display(&self) -> String { self.pre_auf.as_ref().map_or_else(|| self.alg.clone(), |p| format!("({p}) {}", self.alg)) }
    /// As it is turned.
    pub fn executable(&self) -> String { self.pre_auf.as_ref().map_or_else(|| self.alg.clone(), |p| format!("{p} {}", self.alg)) }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Case {
    pub id: String,
    pub name: String,
    pub stage: String,
    pub set: String,
    pub set_label: String,
    pub group: String,
    #[serde(default)]
    pub subgroup: Option<String>,
    pub setup: String,
    #[serde(default, rename = "setups_alt")]
    pub setups_alt: Vec<String>,
    pub algorithms: Vec<Alg>,
    #[serde(default, rename = "puzzle_id")]
    puzzle_id: Option<String>,
    #[serde(default, rename = "cube_size")]
    cube_size: Option<usize>,
    #[serde(default)]
    pub probability: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
    /// The catalogue's picture of a case of another puzzle.
    #[serde(default)]
    pub diagram: Option<String>,
}

impl Case {
    pub fn puzzle(&self) -> String { self.puzzle_id.clone().unwrap_or_else(|| self.cube_size.unwrap_or(3).to_string().repeat(3)) }
    pub fn size(&self) -> Option<usize> { if self.puzzle_id.is_some() { None } else { Some(self.cube_size.unwrap_or(3)) } }

    /// Ids built from the set ("Square-1 SHAPE 3") say less than the name.
    fn built(&self) -> bool { self.id != self.name && (self.id.ends_with(&format!(" {}", self.name)) || ["Square-1 ", "Pyraminx ", "Skewb ", "Megaminx "].iter().any(|p| self.id.starts_with(p))) }
    /// "OLL 21", "PLL T", or the name where the id is built.
    pub fn title(&self) -> &str { if self.built() { &self.name } else { &self.id } }
    /// "21", "T".
    pub fn short(&self) -> String { if self.built() { self.name.clone() } else { self.id.split_once(' ').map_or(self.id.clone(), |(_, r)| r.to_string()) } }
    /// The name beside the id ("H Shape"), none when it is the id.
    pub fn detail(&self) -> Option<&str> { (self.name != self.id && !self.built()).then_some(self.name.as_str()) }
}

#[derive(Clone, Debug, Deserialize)]
pub struct Set {
    pub id: String,
    pub label: String,
    pub stage: String,
    pub description: String,
    pub count: usize,
    #[serde(default, rename = "puzzle_id")]
    puzzle_id: Option<String>,
    #[serde(default, rename = "cube_size")]
    cube_size: Option<usize>,
}

impl Set {
    pub fn puzzle(&self) -> String { self.puzzle_id.clone().unwrap_or_else(|| self.cube_size.unwrap_or(3).to_string().repeat(3)) }
}

#[derive(Deserialize)]
struct Raw {
    sets: Vec<Set>,
    cases: Vec<Case>,
}

pub struct Catalog {
    pub sets: Vec<Set>,
    pub cases: Vec<Case>,
    by_id: HashMap<String, usize>,
}

pub fn catalog() -> &'static Catalog {
    static C: OnceLock<Catalog> = OnceLock::new();
    C.get_or_init(|| {
        let raw: Raw = serde_json::from_str(include_str!("../../../data/catalog.json")).expect("data/catalog.json");
        let by_id = raw.cases.iter().enumerate().map(|(i, c)| (c.id.clone(), i)).collect();
        Catalog { sets: raw.sets, cases: raw.cases, by_id }
    })
}

impl Catalog {
    pub fn case(&self, id: &str) -> Option<&Case> { self.by_id.get(id).map(|&i| &self.cases[i]) }
    pub fn set(&self, id: &str) -> Option<&Set> { self.sets.iter().find(|s| s.id == id) }
    pub fn sets_of<'a>(&'a self, puzzle: &'a str) -> impl Iterator<Item = &'a Set> { self.sets.iter().filter(move |s| s.puzzle() == puzzle) }
    pub fn cases_of_set<'a>(&'a self, set: &'a str) -> impl Iterator<Item = &'a Case> { self.cases.iter().filter(move |c| c.set == set) }
    /// The stages of a puzzle's sets, in their order.
    pub fn stages(&self, puzzle: &str) -> Vec<String> {
        let mut out: Vec<String> = vec![];
        for s in self.sets_of(puzzle) {
            if !out.contains(&s.stage) { out.push(s.stage.clone()) }
        }
        out
    }
    /// The groups of a set's cases, in order, with their cases.
    pub fn groups<'a>(&'a self, set: &str) -> Vec<(String, Vec<&'a Case>)> {
        let mut out: Vec<(String, Vec<&Case>)> = vec![];
        for c in self.cases.iter().filter(|c| c.set == set) {
            match out.iter_mut().find(|g| g.0 == c.group) {
                Some(g) => g.1.push(c),
                None => out.push((c.group.clone(), vec![c])),
            }
        }
        out
    }
    /// Cases whose id, name or algorithms hold `query`.
    pub fn search<'a>(&'a self, puzzle: &str, query: &str) -> Vec<&'a Case> {
        let q = query.to_lowercase();
        let moves = q.replace(['(', ')', '[', ']'], "");
        self.cases.iter().filter(|c| c.puzzle() == puzzle && (c.id.to_lowercase().contains(&q) || c.name.to_lowercase().contains(&q) || (moves.len() > 2 && c.algorithms.iter().any(|a| a.alg.to_lowercase().replace(['(', ')', '[', ']'], "").contains(&moves))))).take(200).collect()
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn reads_the_catalogue() {
        let c = super::catalog();
        assert!(c.cases.len() > 4000);
        let sune = c.case("OLL 27").unwrap();
        assert_eq!(sune.set, "oll");
        assert!(c.sets_of("333").any(|s| s.id == "pll"));
        assert!(c.sets_of("444").any(|s| s.id == "4x4-parity"));
        for case in c.cases.iter().filter(|c| c.size().is_some()) {
            let mut cube = crate::cube::Cube::solved(case.size().unwrap());
            assert!(cube.apply(&crate::alg::expand(&case.setup)), "{}: {}", case.id, case.setup);
        }
    }
}
