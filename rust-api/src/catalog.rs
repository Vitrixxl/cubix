use serde_json::{Value, json};
use std::collections::HashMap;
pub struct Catalog {
    pub cases: Value,
    pub sets: Value,
    pub moves: Value,
    pub by_id: HashMap<String, Value>,
}
impl Catalog {
    pub fn load() -> Self {
        let docs = [
            include_str!("../../data/f2l.json"),
            include_str!("../../data/f2l-advanced.json"),
            include_str!("../../data/f2l-expert.json"),
            include_str!("../../data/2look-oll.json"),
            include_str!("../../data/oll.json"),
            include_str!("../../data/2look-pll.json"),
            include_str!("../../data/pll.json"),
        ];
        let mut sets: Vec<Value> =
            serde_json::from_str(include_str!("../catalog-sets.json")).expect("set metadata");
        let mut cases = Vec::new();
        for (set, source) in sets.iter_mut().zip(docs) {
            let doc: Value = serde_json::from_str(source).expect("algorithm data");
            let entries = doc["cases"].as_array().expect("cases");
            set["count"] = json!(entries.len());
            for c in entries {
                let mut algorithms = c["algorithms"].clone();
                for alg in algorithms.as_array_mut().expect("algorithms") {
                    alg.as_object_mut().unwrap().remove("verified");
                }
                let mut entry = json!({"id":c["id"],"name":c["name"],"stage":set["stage"],"set":set["id"],"setLabel":set["label"],
                    "group":c["group"],"setup":c["setup"],"setups_alt":c.get("setups_alt").unwrap_or(&json!([])),"algorithms":algorithms});
                for key in ["subgroup", "probability"] {
                    if let Some(v) = c
                        .get(key)
                        .filter(|v| !v.is_null() && **v != "" && **v != 0 && **v != false)
                    {
                        entry[key] = v.clone();
                    }
                }
                cases.push(entry);
            }
        }
        let base_sets = sets.clone();
        let base_cases = cases.clone();
        let extra: Value = serde_json::from_str(include_str!("../../data/multi-cube.json"))
            .expect("multi-cube catalog");
        sets.extend(extra["sets"].as_array().unwrap().iter().cloned());
        cases.extend(extra["cases"].as_array().unwrap().iter().cloned());
        let niche: Value = serde_json::from_str(include_str!("../../data/niche-catalog.json"))
            .expect("niche puzzle catalog");
        sets.extend(niche["sets"].as_array().unwrap().iter().cloned());
        cases.extend(niche["cases"].as_array().unwrap().iter().cloned());
        for size in 4..=7 {
            for set in &base_sets {
                let mut value = set.clone();
                value["cube_size"] = json!(size);
                value["id"] = json!(format!("{size}x{size}-{}", set["id"].as_str().unwrap()));
                value["description"] = json!(format!(
                    "After centers and edges are reduced: {}",
                    set["description"].as_str().unwrap()
                ));
                sets.push(value);
            }
            for case in &base_cases {
                let mut value = case.clone();
                value["cube_size"] = json!(size);
                value["id"] = json!(format!("{size}x{size} {}", case["id"].as_str().unwrap()));
                value["set"] = json!(format!("{size}x{size}-{}", case["set"].as_str().unwrap()));
                value["setup"] = json!(reduced_alg(case["setup"].as_str().unwrap(), size));
                value["setups_alt"] = json!(
                    case["setups_alt"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .map(|a| reduced_alg(a.as_str().unwrap(), size))
                        .collect::<Vec<_>>()
                );
                for alg in value["algorithms"].as_array_mut().unwrap() {
                    for key in ["alg", "gen"] {
                        if let Some(text) = alg[key].as_str() {
                            alg[key] = json!(reduced_alg(text, size));
                        }
                    }
                }
                cases.push(value);
            }
        }
        Self {
            by_id: cases
                .iter()
                .map(|c| (c["id"].as_str().unwrap().to_owned(), c.clone()))
                .collect(),
            cases: json!(cases),
            sets: json!(sets),
            moves: serde_json::from_str(include_str!("../../data/moves.json")).expect("moves"),
        }
    }
}

/// Expand a reduced 3×3 wide turn to all layers except the opposite outer face.
fn reduced_alg(alg: &str, size: i32) -> String {
    let mut chars = alg.chars().peekable();
    let mut out = String::new();
    while let Some(c) = chars.next() {
        if "udfbrl".contains(c) || ("UDFBRL".contains(c) && chars.peek() == Some(&'w')) {
            if c.is_uppercase() {
                chars.next();
            }
            out.push_str(&format!("{}{}w", size - 1, c.to_ascii_uppercase()));
        } else {
            out.push(c);
        }
    }
    out
}
