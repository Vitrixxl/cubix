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
