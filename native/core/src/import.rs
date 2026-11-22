//! Solves from other timers' exports (src/client/lib/timerImport.ts): csTimer (backup JSON, session CSV), Twisty Timer
//! and Cubic Timer (backup), CubeTime (csTimer JSON, CSV), CubeDesk and ZKT Timer (JSON), Cubeast and acubemy (CSV),
//! Speedcuber Timer (backup) and Qbix's own export. Times are kept raw, the penalty apart; dates in ms.
use crate::time::Penalty;
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Clone, Debug)]
pub struct Imported {
    pub event: String,
    pub time_ms: u64,
    pub penalty: Penalty,
    pub scramble: Option<String>,
    pub comment: Option<String>,
    pub at: i64,
    pub session: Option<String>,
    pub splits: Option<Vec<u64>>,
    pub solution: Option<String>,
    pub moves: Option<u32>,
    pub cubes: Option<(u32, u32)>,
}

#[derive(Clone, Debug, Default)]
pub struct Import {
    pub app: String,
    pub solves: Vec<Imported>,
    pub skipped: BTreeMap<String, usize>,
    /// The file names no event: its solves carry the fallback one.
    pub needs_event: bool,
}

fn wca(id: &str) -> bool { crate::puzzles::events().iter().any(|e| e.id == id && !crate::puzzles::attempt_mode(&e.solve_mode)) }

fn cstimer_event(t: &str) -> Option<&'static str> {
    Some(match t {
        "333" => "333",
        "222so" | "222o" | "2223" => "222",
        "444wca" | "444m" | "444" | "444yj" => "444",
        "555wca" | "555" => "555",
        "666wca" | "666si" | "666p" | "666s" => "666",
        "777wca" | "777si" | "777p" | "777s" => "777",
        "333ni" | "333bld" => "333bf",
        "333oh" => "333oh",
        "clkwca" | "clkwcab" | "clk" | "clko" => "clock",
        "mgmp" | "mgmc" | "mgmo" | "mgmso" => "minx",
        "pyrso" | "pyro" | "pyrm" => "pyram",
        "skbso" | "skbo" | "skb" => "skewb",
        "sqrs" | "sq1h" | "sq1t" => "sq1",
        "444bld" => "444bf",
        "555bld" => "555bf",
        _ => return None,
    })
}

fn twisty_event(p: &str) -> Option<&'static str> {
    Some(match p {
        "222" => "222",
        "333" => "333",
        "444" => "444",
        "555" => "555",
        "666" => "666",
        "777" => "777",
        "mega" => "minx",
        "pyra" => "pyram",
        "skewb" => "skewb",
        "clock" => "clock",
        "sq1" => "sq1",
        "333oh" => "333oh",
        "333bld" => "333bf",
        "444bld" => "444bf",
        "555bld" => "555bf",
        _ => return None,
    })
}

/// A time as timers print it: "12.34", "1:02.345", "1:02:03.4".
pub fn parse_clock(text: &str) -> Option<u64> {
    let parts: Vec<&str> = text.trim().split(':').collect();
    if parts.is_empty() || parts.len() > 3 { return None }
    let secs: f64 = parts.last()?.parse().ok().filter(|s: &f64| *s >= 0.0)?;
    let mut total = secs;
    let mut mult = 60.0;
    for p in parts[..parts.len() - 1].iter().rev() {
        total += p.parse::<u64>().ok()? as f64 * mult;
        mult *= 60.0;
    }
    Some((total * 1000.0).round() as u64)
}

/// Rows of a delimited text: quotes with doubled or backslashed quotes, newlines inside quotes.
pub fn parse_delimited(text: &str, sep: char, backslash: bool) -> Vec<Vec<String>> {
    let mut rows = vec![];
    let mut row = vec![];
    let mut field = String::new();
    let mut quoted = false;
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if quoted {
            if backslash && c == '\\' && chars.get(i + 1) == Some(&'"') || c == '"' && chars.get(i + 1) == Some(&'"') {
                field.push('"');
                i += 1;
            } else if c == '"' {
                quoted = false;
            } else {
                field.push(c);
            }
        } else if c == '"' && field.is_empty() {
            quoted = true;
        } else if c == sep {
            row.push(std::mem::take(&mut field));
        } else if c == '\n' || c == '\r' {
            if c == '\r' && chars.get(i + 1) == Some(&'\n') { i += 1 }
            row.push(std::mem::take(&mut field));
            rows.push(std::mem::take(&mut row));
        } else {
            field.push(c);
        }
        i += 1;
    }
    if !field.is_empty() || !row.is_empty() {
        row.push(field);
        rows.push(row);
    }
    rows.into_iter().filter(|r: &Vec<String>| r.iter().any(|f| !f.trim().is_empty())).collect()
}

fn text(v: Option<&Value>) -> Option<String> {
    match v? {
        Value::Null => None,
        Value::String(s) => Some(s.trim().to_string()).filter(|s| !s.is_empty() && s != "null"),
        other => Some(other.to_string()),
    }
}

fn opt(s: &str) -> Option<String> { Some(s.trim().to_string()).filter(|s| !s.is_empty()) }

fn skip(skipped: &mut BTreeMap<String, usize>, reason: &str) { *skipped.entry(reason.into()).or_default() += 1 }

fn plain(event: &str, time_ms: u64, penalty: Penalty, scramble: Option<String>, comment: Option<String>, at: i64, session: Option<String>) -> Imported { Imported { event: event.into(), time_ms, penalty, scramble, comment, at, session, splits: None, solution: None, moves: None, cubes: None } }

/// "2023-10-05 12:00:00" in local time, or an RFC 3339 date.
fn date(value: &str) -> Option<i64> {
    use chrono::{Local, NaiveDateTime, TimeZone};
    let v = value.trim();
    for f in ["%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%S"] {
        if let Ok(d) = NaiveDateTime::parse_from_str(v, f) { return Local.from_local_datetime(&d).earliest().map(|t| t.timestamp_millis()) }
    }
    crate::date::parse(&v.replace(" UTC", "Z").replacen(' ', "T", 1)).or_else(|| crate::date::parse(v))
}

fn printed(v: &str) -> Option<(u64, Penalty)> {
    let v = v.trim();
    if let Some(rest) = v.strip_prefix("DNF").or_else(|| v.strip_prefix("dnf")) {
        let inner = rest.trim_start_matches('(').trim_end_matches(')');
        return Some((parse_clock(inner).unwrap_or(0), Penalty::Dnf));
    }
    match v.strip_suffix('+') {
        Some(t) => parse_clock(t).map(|ms| (ms.saturating_sub(2000), Penalty::Plus2)),
        None => parse_clock(v).map(|ms| (ms, Penalty::None)),
    }
}

fn records(rows: &[Vec<String>]) -> Vec<BTreeMap<String, String>> {
    let Some(head) = rows.first() else { return vec![] };
    rows[1..].iter().map(|r| head.iter().enumerate().map(|(i, h)| (h.trim().to_string(), r.get(i).cloned().unwrap_or_default())).collect()).collect()
}

fn parse_json_str(v: &Value) -> Value { if let Value::String(s) = v { serde_json::from_str(s).unwrap_or(Value::Null) } else { v.clone() } }

fn cstimer(data: &Value) -> Import {
    let mut out = Import::default();
    let props = parse_json_str(data.get("properties").unwrap_or(&Value::Null));
    let sessions = parse_json_str(props.get("sessionData").unwrap_or(&Value::Null));
    let cube_time = sessions.as_object().is_some_and(|m| m.values().any(|s| s["name"].as_str().is_some_and(|n| n.starts_with("CubeTime Export"))));
    for (key, list) in data.as_object().into_iter().flatten() {
        let Some(n) = key.strip_prefix("session").filter(|n| n.chars().all(|c| c.is_ascii_digit()) && !n.is_empty()) else { continue };
        let meta = &sessions[n];
        let kind = meta["opt"]["scrType"].as_str().or(meta["scrType"].as_str()).or(meta["scr"].as_str()).unwrap_or("333");
        let event = cstimer_event(kind);
        let name = meta["name"].as_str().map(String::from).or_else(|| meta["name"].as_i64().map(|x| x.to_string())).unwrap_or_else(|| crate::i18n::tf("Session {0}", &[&n]));
        let name = if cube_time { name.trim_start_matches("CubeTime Export - ").to_string() } else { name };
        for solve in parse_json_str(list).as_array().into_iter().flatten() {
            let Some(event) = event else {
                skip(&mut out.skipped, "events Qbix does not practise");
                continue;
            };
            let result = solve[0].as_array().cloned().unwrap_or_default();
            let (Some(time), Some(at)) = (result.get(1).and_then(Value::as_f64), solve[3].as_f64()) else {
                skip(&mut out.skipped, "unreadable solves");
                continue;
            };
            let p = result.first().and_then(Value::as_f64).unwrap_or(0.0);
            let mut s = plain(event, time.round() as u64, if p < 0.0 { Penalty::Dnf } else if p > 0.0 { Penalty::Plus2 } else { Penalty::None }, text(solve.get(1)), text(solve.get(2)), (at * 1000.0) as i64, Some(name.clone()));
            if result.len() > 2 { s.splits = Some(result[2..].iter().rev().filter_map(Value::as_f64).map(|x| x as u64).collect()) }
            out.solves.push(s);
        }
    }
    out.app = if cube_time { "CubeTime".into() } else { "csTimer".into() };
    out
}

fn twisty(rows: &[Vec<String>], app: &str) -> Import {
    let mut out = Import { app: app.into(), ..Default::default() };
    for r in rows.iter().skip(1) {
        let get = |i: usize| r.get(i).map(String::as_str).unwrap_or("");
        let penalty = get(5).parse::<i64>().unwrap_or(0) % 100;
        if penalty == 10 { continue }
        let Some(event) = twisty_event(get(0)) else {
            skip(&mut out.skipped, "events Qbix does not practise");
            continue;
        };
        let (Ok(ms), Ok(at)) = (get(2).parse::<f64>(), get(3).parse::<f64>()) else {
            skip(&mut out.skipped, "unreadable solves");
            continue;
        };
        let ms = ms as u64;
        out.solves.push(plain(event, if penalty == 1 { ms.saturating_sub(2000) } else { ms }, match penalty { 1 => Penalty::Plus2, 2 => Penalty::Dnf, _ => Penalty::None }, opt(get(4)), opt(get(6)), at as i64, opt(get(1))));
    }
    out
}

fn cstimer_csv(rows: &[Vec<String>], fallback: &str) -> Import {
    let mut out = Import { app: "csTimer".into(), needs_event: true, ..Default::default() };
    for r in records(rows) {
        match (printed(r.get("Time").map(String::as_str).unwrap_or("")), date(r.get("Date").map(String::as_str).unwrap_or(""))) {
            (Some((ms, p)), Some(at)) => out.solves.push(plain(fallback, ms, p, r.get("Scramble").and_then(|s| opt(s)), r.get("Comment").and_then(|s| opt(s)), at, None)),
            _ => skip(&mut out.skipped, "unreadable solves"),
        }
    }
    out
}

fn cube_time_csv(source: &str, fallback: &str) -> Import {
    let mut out = Import { app: "CubeTime".into(), needs_event: true, ..Default::default() };
    for line in source.lines().skip(1) {
        if line.trim().is_empty() { continue }
        // Time, the quoted comment, the scramble, and the date at the end of the line.
        let parsed = (|| {
            let (time, rest) = line.split_once(',')?;
            let rest = rest.strip_prefix('"')?;
            let mut end = 0;
            let b = rest.as_bytes();
            while end < b.len() {
                if b[end] == b'"' && b.get(end + 1) == Some(&b'"') { end += 2; continue }
                if b[end] == b'"' { break }
                end += 1;
            }
            let comment = rest[..end].replace("\"\"", "\"");
            let after = rest.get(end + 2..)?;
            let (scramble, when) = after.rsplit_once(',')?;
            let at = chrono::DateTime::parse_from_str(when.trim(), "%Y-%m-%d %H:%M:%S %z").ok()?.timestamp_millis();
            Some((time.parse::<f64>().ok()?, comment, scramble.to_string(), at))
        })();
        match parsed {
            Some((t, c, s, at)) => out.solves.push(plain(fallback, (t * 1000.0).round() as u64, Penalty::None, opt(&s), opt(&c), at, None)),
            None => skip(&mut out.skipped, "unreadable solves"),
        }
    }
    out
}

fn qbix(data: &Value) -> Import {
    let mut out = Import { app: "Qbix".into(), ..Default::default() };
    let names: BTreeMap<String, String> = data["sessions"].as_array().into_iter().flatten().map(|s| (s["id"].to_string(), s["name"].as_str().unwrap_or("").to_string())).collect();
    for s in data["solves"].as_array().into_iter().flatten() {
        if !s["case_id"].is_null() {
            skip(&mut out.skipped, "training solves");
            continue;
        }
        let Some(event) = crate::puzzles::event_of(s["puzzle_id"].as_str().unwrap_or("333"), s["solve_mode"].as_str().unwrap_or("standard")) else {
            skip(&mut out.skipped, "events Qbix does not practise");
            continue;
        };
        let (Some(ms), Some(at)) = (s["time_ms"].as_u64(), s["created_at"].as_str().and_then(crate::date::parse)) else {
            skip(&mut out.skipped, "unreadable solves");
            continue;
        };
        let session = (!s["session_id"].is_null()).then(|| names.get(&s["session_id"].to_string()).cloned().filter(|n| !n.is_empty()).unwrap_or_else(|| s["session_id"].to_string()));
        out.solves.push(Imported {
            event: event.id.clone(),
            time_ms: ms,
            penalty: serde_json::from_value(s["penalty"].clone()).unwrap_or_default(),
            scramble: text(s.get("scramble")),
            comment: text(s.get("comment")),
            at,
            session,
            splits: serde_json::from_value(s["splits"].clone()).ok(),
            solution: s["solution"].as_str().map(String::from),
            moves: s["moves"].as_u64().map(|m| m as u32),
            cubes: s["cubes_attempted"].as_u64().map(|a| (s["cubes_solved"].as_u64().unwrap_or(0) as u32, a as u32)),
        });
    }
    out
}

fn cubedesk(data: &Value, app: &str) -> Import {
    let mut out = Import { app: app.into(), ..Default::default() };
    let names: BTreeMap<String, String> = data["sessions"].as_array().into_iter().flatten().map(|s| (s["id"].as_str().unwrap_or("").to_string(), s["name"].as_str().unwrap_or("").to_string())).collect();
    for s in data["solves"].as_array().into_iter().flatten() {
        if !s["trainer_name"].is_null() && s["session_id"].is_null() { continue }
        let kind = s["cube_type"].as_str().unwrap_or("");
        let event = if kind == "333bl" { "333bf".to_string() } else if wca(kind) { kind.to_string() } else {
            skip(&mut out.skipped, "events Qbix does not practise");
            continue;
        };
        let raw = s["raw_time"].as_f64().or(s["time"].as_f64());
        let at = s["started_at"].as_f64().or(s["ended_at"].as_f64()).map(|x| x as i64).or_else(|| s["created_at"].as_str().and_then(crate::date::parse));
        let (Some(raw), Some(at)) = (raw.filter(|r| *r >= 0.0), at) else {
            skip(&mut out.skipped, "unreadable solves");
            continue;
        };
        let p = if s["dnf"].as_bool() == Some(true) { Penalty::Dnf } else if s["plus_two"].as_bool() == Some(true) { Penalty::Plus2 } else { Penalty::None };
        out.solves.push(plain(&event, (raw * 1000.0).round() as u64, p, text(s.get("scramble")), text(s.get("notes")), at, s["session_id"].as_str().and_then(|id| names.get(id).cloned())));
    }
    out
}

fn smart_csv(rows: &[Vec<String>], app: &str) -> Import {
    let mut out = Import { app: app.into(), ..Default::default() };
    for r in records(rows) {
        let g = |k: &str| r.get(k).map(String::as_str).unwrap_or("");
        let ms = g(if app == "Cubeast" { "time" } else { "total_time" }).parse::<f64>().ok();
        let (Some(ms), Some(at)) = (ms, date(g("date"))) else {
            skip(&mut out.skipped, "unreadable solves");
            continue;
        };
        let plus = g("one_turn_away_two_second_penalty") == "true" || g("inspection_two_second_penalty") == "true";
        out.solves.push(plain("333", ms.round() as u64, if g("dnf") == "true" { Penalty::Dnf } else if plus { Penalty::Plus2 } else { Penalty::None }, opt(g("scramble")), opt(g("description")), at, opt(g("session_name"))));
    }
    out
}

fn stif(source: &str) -> Import {
    let mut out = Import { app: "Speedcuber Timer".into(), ..Default::default() };
    for line in source.lines().filter(|l| !l.trim().is_empty()) {
        let Ok(a) = serde_json::from_str::<Value>(line) else {
            skip(&mut out.skipped, "unreadable solves");
            continue;
        };
        let event = a["event"]["id"].as_str().unwrap_or("");
        if !wca(event) {
            skip(&mut out.skipped, "events Qbix does not practise");
            continue;
        }
        let penalties: Vec<&str> = a["infractions"].as_array().into_iter().flatten().filter_map(|i| i["penalty"].as_str()).collect();
        let (Some(stop), Some(start)) = (a["timerStop"].as_f64(), a["timerStart"].as_f64()) else {
            skip(&mut out.skipped, "unreadable solves");
            continue;
        };
        if penalties.contains(&"DNS") {
            skip(&mut out.skipped, "unreadable solves");
            continue;
        }
        let scramble = match &a["solutions"][0]["scramble"] {
            Value::Array(list) => Some(list.iter().filter_map(Value::as_str).collect::<Vec<_>>().join(" ")),
            v => text(Some(v)),
        };
        out.solves.push(plain(event, (stop - start).round() as u64, if penalties.contains(&"DNF") { Penalty::Dnf } else if penalties.contains(&"+2") { Penalty::Plus2 } else { Penalty::None }, scramble, text(a.get("comment")), start as i64, None));
    }
    out
}

pub const APPS: [&str; 9] = ["csTimer", "Twisty Timer", "Cubic Timer", "CubeTime", "CubeDesk", "ZKT Timer", "Cubeast", "acubemy", "Speedcuber Timer"];

/// Reads another timer's export; `fallback` is the event of files that do not tell it.
pub fn read(source: &str, fallback: &str) -> Result<Import, String> {
    let body = source.trim_start_matches('\u{feff}').trim_start();
    let first = body.lines().next().unwrap_or("");
    if body.starts_with('{') {
        match serde_json::from_str::<Value>(body) {
            Ok(data) => {
                if data["app"] == "Qbix" && data["solves"].is_array() { return Ok(qbix(&data)) }
                if data.as_object().is_some_and(|o| o.keys().any(|k| k.starts_with("session") && k[7..].chars().all(|c| c.is_ascii_digit()) && k.len() > 7)) { return Ok(cstimer(&data)) }
                if let Some(list) = data["solves"].as_array() { return Ok(cubedesk(&data, if list.iter().any(|s| s.get("scramble_subset").is_some() || s.get("is_virtual_cube").is_some()) { "ZKT Timer" } else { "CubeDesk" })) }
                if !data["timerStart"].is_null() { return Ok(stif(body)) }
            }
            Err(_) if first.contains("\"timerStart\"") => return Ok(stif(body)),
            Err(_) => return Err(crate::i18n::t("This file could not be read.")),
        }
    }
    if first.starts_with("Puzzle,Category,Time(millis),Date(millis),Scramble,Penalty,Comment") { return Ok(twisty(&parse_delimited(body, ';', false), "Twisty Timer")) }
    if first.starts_with("\"Puzzle\";\"Category\";\"Time(millis)\"") { return Ok(twisty(&parse_delimited(body, ';', true), "Cubic Timer")) }
    if first.starts_with("No.;Time;Comment;Scramble;Date") { return Ok(cstimer_csv(&parse_delimited(body, ';', false), fallback)) }
    if first.starts_with("Time,Comment,Scramble,Date") { return Ok(cube_time_csv(body, fallback)) }
    if first.starts_with("id,date,dnf,time,") { return Ok(smart_csv(&parse_delimited(body, ',', false), "Cubeast")) }
    if first.starts_with("solve_id,date,total_time,") { return Ok(smart_csv(&parse_delimited(body, ',', false), "acubemy")) }
    Err(crate::i18n::tf("This file is not an export Qbix knows. Export from {0}.", &[&APPS.join(", ")]))
}

/// Adds the solves to the store, each session of the file a session of its own; solves already there (same event,
/// moment and time) are left out. Returns how many were added.
pub fn apply(store: &mut crate::store::Store, import: &Import) -> usize {
    let mut sessions: BTreeMap<(String, Option<String>), i64> = BTreeMap::new();
    let mut added = 0;
    let mut solves = import.solves.clone();
    solves.sort_by_key(|s| s.at);
    for s in solves {
        let Some(e) = crate::puzzles::event(&s.event) else { continue };
        let c = crate::puzzles::Context::new(&e.puzzle, &e.solve_mode, "normal");
        let iso = crate::date::iso(s.at);
        if store.solves.iter().any(|x| x.created_at == iso && x.time_ms == s.time_ms && x.puzzle_id == c.puzzle && x.solve_mode == c.solve_mode) { continue }
        let key = (s.event.clone(), s.session.clone());
        let session = *sessions.entry(key).or_insert_with(|| store.new_session("playground", &c, vec![], Some(s.session.clone().unwrap_or_else(|| format!("{} {}", import.app, crate::i18n::t("import"))))));
        store.add(Some(session), &c, crate::store::NewSolve { time_ms: s.time_ms, penalty: s.penalty, scramble: s.scramble, comment: s.comment, splits: s.splits, solution: s.solution, moves: s.moves, cubes: s.cubes, at: Some(s.at), ..Default::default() });
        added += 1;
    }
    added
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_usual_exports() {
        let cs = r#"{"session1":[[[0,12340],"R U",""  ,1700000000],[[-1,9000],"F","bad",1700000100],[[2000,11000],"U","",1700000200]],"properties":{"sessionData":"{\"1\":{\"name\":\"Main\",\"opt\":{\"scrType\":\"333\"}}}"}}"#;
        let r = read(cs, "333").unwrap();
        assert_eq!(r.app, "csTimer");
        assert_eq!(r.solves.len(), 3);
        assert_eq!(r.solves[1].penalty, Penalty::Dnf);
        assert_eq!(r.solves[0].session.as_deref(), Some("Main"));
        let tw = "Puzzle,Category,Time(millis),Date(millis),Scramble,Penalty,Comment\n333;Normal;14340;1700000000000;R U;1;\n";
        let r = read(tw, "333").unwrap();
        assert_eq!((r.solves[0].time_ms, r.solves[0].penalty), (12340, Penalty::Plus2));
        let csv = "No.;Time;Comment;Scramble;Date;P.1\n1;12.34;;R U;2023-10-05 12:00:00;12.34\n2;DNF(9.00);;F;2023-10-05 12:01:00;9\n";
        let r = read(csv, "444").unwrap();
        assert!(r.needs_event);
        assert_eq!(r.solves.len(), 2);
        assert_eq!(r.solves[0].event, "444");
        let mut store = crate::store::Store::memory();
        assert_eq!(apply(&mut store, &r), 2);
        assert_eq!(apply(&mut store, &r), 0, "importing twice adds nothing twice");
        assert_eq!(parse_clock("1:02.345"), Some(62_345));
        assert!(read("hello", "333").is_err());
    }
}
