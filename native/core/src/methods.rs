//! The solving methods (src/shared/methods.ts, exported to data/methods.json by data/export-methods.ts): each step of
//! a method, its explanation, the catalogue's sets holding its cases and the algorithms the catalogue does not hold.
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::OnceLock;

#[derive(Clone, Debug, Deserialize)]
pub struct MethodAlg {
    pub name: String,
    pub alg: String,
    #[serde(default)]
    pub alternatives: Vec<String>,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub detail: Option<String>,
    #[serde(default)]
    pub setup: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct Step {
    pub title: String,
    pub text: String,
    #[serde(default)]
    pub sets: Vec<String>,
    #[serde(default)]
    pub algs: Vec<MethodAlg>,
    #[serde(default)]
    pub mask: Option<String>,
    #[serde(default)]
    pub tips: Vec<String>,
    #[serde(default)]
    pub missing: Option<String>,
    #[serde(default)]
    pub train: Option<String>,
    #[serde(default)]
    pub help: Vec<MethodAlg>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct Method {
    pub id: String,
    pub name: String,
    pub level: String,
    pub summary: String,
    pub steps: Vec<Step>,
}

#[derive(Deserialize)]
struct All {
    methods: HashMap<String, Vec<Method>>,
    bld: HashMap<String, Vec<Method>>,
}

fn all() -> &'static All {
    static A: OnceLock<All> = OnceLock::new();
    A.get_or_init(|| serde_json::from_str(include_str!("../data/methods.json")).expect("methods.json"))
}

/// The methods of a puzzle, then its blindfolded ones.
pub fn of(puzzle: &str) -> Vec<&'static Method> { all().methods.get(puzzle).into_iter().flatten().chain(all().bld.get(puzzle).into_iter().flatten()).collect() }

pub fn get(puzzle: &str, id: &str) -> Option<&'static Method> { of(puzzle).into_iter().find(|m| m.id == id) }

#[cfg(test)]
mod tests {
    #[test]
    fn reads_the_methods() {
        let cfop = super::get("333", "cfop").unwrap();
        assert_eq!(cfop.steps[2].sets, ["oll"]);
        assert!(super::of("333").iter().any(|m| m.id == "m2"));
        for m in super::of("333") {
            for s in &m.steps {
                for set in &s.sets {
                    assert!(crate::catalog::catalog().set(set).is_some(), "{set}");
                }
            }
        }
    }
}
