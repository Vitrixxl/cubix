//! The account's synchronisation: the outbox goes up a batch at a time (POST /sync), the changes since the device's
//! cursor come down (GET /sync). The interface runs the calls away from its thread; these functions say what to send
//! and fold the answers into the store.
use crate::store::{Op, Session, Solve, Store};
use serde::Deserialize;
use serde_json::{Value, json};

/// A batch of operations ready to go up, as /sync takes them.
#[derive(Clone, Debug)]
pub struct Push {
    pub ids: Vec<String>,
    pub body: Value,
}

/// The next batch: the outbox's first operations (a hundred at most) whose rows the server knows, in order. `single`
/// sends one alone (after a batch was refused, to find the one at fault).
pub fn next_push(store: &mut Store, single: bool) -> Option<Push> {
    let mut ids = vec![];
    let mut ops = vec![];
    let mut pending_sessions = std::collections::HashSet::new();
    let mut pending_solves = std::collections::HashSet::new();
    let mut orphans = vec![];
    for op in store.outbox.iter().filter(|o| o.error.is_none()) {
        if ops.len() == if single { 1 } else { 100 } { break }
        let resolved = resolve(store, op, &pending_sessions, &pending_solves);
        match resolved {
            Resolved::Ready(method, path, body) => {
                if op.kind == "session" { pending_sessions.insert(op.local); }
                if op.kind == "solve" { pending_solves.insert(op.local); }
                ids.push(op.id.clone());
                ops.push(json!({ "id": op.id, "method": method, "path": path, "body": body, "createdAt": op.created_at }));
            }
            // Its row goes up in this batch: the next one sends it.
            Resolved::Later => break,
            Resolved::Never => orphans.push(op.id.clone()),
        }
    }
    for op in store.outbox.iter_mut().filter(|o| orphans.contains(&o.id)) {
        op.error = Some("Its session or solve is gone".into());
    }
    (!ops.is_empty()).then(|| Push { ids, body: json!({ "operations": ops }) })
}

enum Resolved {
    Ready(&'static str, String, Value),
    Later,
    Never,
}

fn resolve(store: &Store, op: &Op, pending_sessions: &std::collections::HashSet<i64>, pending_solves: &std::collections::HashSet<i64>) -> Resolved {
    let solve_id = |local: i64| match store.server_solve(local) {
        Some(id) => Ok(id),
        None if pending_solves.contains(&local) || store.outbox.iter().any(|o| o.kind == "solve" && o.local == local) => Err(Resolved::Later),
        None if local > 0 => Ok(local),
        None => Err(Resolved::Never),
    };
    let session_id = |local: i64| match store.session_row(local).and_then(|s| s.server_id) {
        Some(id) => Ok(id),
        None if pending_sessions.contains(&local) || store.outbox.iter().any(|o| o.kind == "session" && o.local == local) => Err(Resolved::Later),
        None if local > 0 => Ok(local),
        None => Err(Resolved::Never),
    };
    match op.kind.as_str() {
        "session" => Resolved::Ready("POST", "sessions".into(), op.body.clone()),
        "session-name" => match session_id(op.local) {
            Ok(id) => Resolved::Ready("PATCH", format!("sessions/{id}"), op.body.clone()),
            Err(r) => r,
        },
        "solve" => {
            let mut body = op.body.clone();
            if let Some(local) = store.get(op.local).and_then(|s| s.session_id) {
                match session_id(local) {
                    Ok(id) => body["sessionId"] = json!(id),
                    Err(r) => return r,
                }
            }
            Resolved::Ready("POST", "solves".into(), body)
        }
        "penalty" | "comment" | "solution" => match solve_id(op.local) {
            Ok(id) => Resolved::Ready("PATCH", format!("solves/{id}"), op.body.clone()),
            Err(r) => r,
        },
        "delete" => match solve_id(op.local) {
            Ok(id) => Resolved::Ready("DELETE", format!("solves/{id}"), Value::Null),
            Err(r) => r,
        },
        "learned" => Resolved::Ready("PUT", "learned".into(), op.body.clone()),
        "learning-order" => Resolved::Ready("PUT", "learning-group-order".into(), op.body.clone()),
        "journey" => Resolved::Ready("PUT", "journey".into(), op.body.clone()),
        _ => Resolved::Never,
    }
}

#[derive(Clone, Debug, Deserialize)]
pub struct PushResult {
    pub results: Vec<PushValue>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct PushValue {
    pub id: String,
    #[serde(default)]
    pub value: Value,
}

/// The server took the batch: rows learn their server ids, the operations leave the outbox.
pub fn pushed(store: &mut Store, result: PushResult) {
    for r in result.results {
        let Some(i) = store.outbox.iter().position(|o| o.id == r.id) else { continue };
        let op = store.outbox.remove(i);
        let server = r.value.get("id").and_then(Value::as_i64);
        match op.kind.as_str() {
            "session" => if let (Some(s), Some(id)) = (store.sessions.iter_mut().find(|s| s.id == op.local), server) { s.server_id = Some(id) },
            "solve" => if let (Some(s), Some(id)) = (store.solves.iter_mut().find(|s| s.id == op.local), server) { s.server_id = Some(id) },
            _ => {}
        }
    }
}

/// The batch of one operation was refused: it is marked, and the others go on.
pub fn refused(store: &mut Store, ids: &[String], message: String) {
    if let [id] = ids && let Some(op) = store.outbox.iter_mut().find(|o| &o.id == id) { op.error = Some(message) }
}

#[derive(Clone, Debug, Deserialize)]
pub struct Page {
    pub changes: Vec<Change>,
    pub cursor: i64,
    #[serde(default)]
    pub more: bool,
}

#[derive(Clone, Debug, Deserialize)]
pub struct Change {
    pub kind: String,
    pub id: i64,
    pub value: Option<Value>,
}

pub fn pull_path(store: &Store) -> String { format!("sync?after={}&learningGroups=1&journey=1", store.cursor) }

/// Folds a page of the server's changes into the store; a row with a change still waiting to go up keeps it.
pub fn merge(store: &mut Store, page: Page) {
    if page.cursor < store.cursor { return }
    let dirty = |store: &Store, kind: &str, local: i64| store.outbox.iter().any(|o| o.local == local && kind == if o.kind.starts_with("session") { "sessions" } else { "solves" } && o.kind != "learned");
    let mut changes = page.changes;
    // Sessions first: solves refer to them.
    changes.sort_by_key(|c| c.kind == "solves");
    for change in changes {
        match change.kind.as_str() {
            "sessions" => {
                let local = store.sessions.iter().find(|s| s.server_id == Some(change.id)).map_or(change.id, |s| s.id);
                if dirty(store, "sessions", local) { continue }
                store.sessions.retain(|s| s.id != local);
                if let Some(mut s) = change.value.and_then(|v| serde_json::from_value::<Session>(v).ok()) {
                    s.id = local;
                    s.server_id = Some(change.id);
                    let i = store.sessions.partition_point(|x| x.created_at <= s.created_at);
                    store.sessions.insert(i, s);
                }
            }
            "solves" => {
                let local = store.solves.iter().find(|s| s.server_id == Some(change.id)).map_or(change.id, |s| s.id);
                match change.value.and_then(|v| serde_json::from_value::<Solve>(v).ok()) {
                    Some(mut s) => {
                        if dirty(store, "solves", local) { continue }
                        s.id = local;
                        s.server_id = Some(change.id);
                        if let Some(sid) = s.session_id { s.session_id = Some(store.sessions.iter().find(|x| x.server_id == Some(sid)).map_or(sid, |x| x.id)) }
                        store.solves.retain(|x| x.id != local);
                        store.insert(s);
                    }
                    None => {
                        // A deletion on another device wins over an edit waiting here.
                        store.solves.retain(|x| x.id != local);
                        store.outbox.retain(|o| !(o.local == local && matches!(o.kind.as_str(), "penalty" | "comment" | "solution" | "delete")));
                    }
                }
            }
            "learned_cases" => {
                let Some(v) = change.value else { continue };
                let Some(case) = v.get("case_id").and_then(Value::as_str).map(String::from) else { continue };
                if store.outbox.iter().any(|o| o.kind == "learned" && o.body["caseId"] == json!(case)) { continue }
                if v.get("learned").and_then(Value::as_i64) == Some(1) {
                    let algs: Vec<String> = v.get("algs").and_then(|a| serde_json::from_value(a.clone()).ok()).or_else(|| v.get("alg").and_then(Value::as_str).map(|a| vec![a.to_string()])).unwrap_or_default();
                    store.learned.insert(case, algs);
                } else {
                    store.learned.remove(&case);
                }
            }
            "learning_group_orders" => {
                let Some(v) = change.value else { continue };
                let (Some(track), Some(groups)) = (v.get("track").and_then(Value::as_str), v.get("groups").and_then(|g| serde_json::from_value::<Vec<String>>(g.clone()).ok())) else { continue };
                if store.outbox.iter().any(|o| o.kind == "learning-order" && o.body["track"] == json!(track)) { continue }
                store.group_order.insert(track.into(), groups);
            }
            "personal_entries" => {
                let Some(v) = change.value else { continue };
                let Some(key) = v.get("key").and_then(Value::as_str) else { continue };
                if store.outbox.iter().any(|o| o.kind == "journey" && o.body["key"] == json!(key)) { continue }
                store.journey.insert(key.into(), v.get("value").cloned().unwrap_or(Value::Null));
            }
            _ => {}
        }
    }
    store.cursor = page.cursor;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::puzzles::Context;
    use crate::store::{NewSolve, User};

    #[test]
    fn pushes_in_order_and_merges() {
        let mut s = Store::memory();
        s.sign_in(User { id: "u".into(), username: "dev".into(), is_guest: false, created_at: String::new(), wca_id: None }, "t".into());
        let c = Context::default();
        let session = s.session(&c);
        let solve = s.add(Some(session), &c, NewSolve { time_ms: 9_000, ..Default::default() });
        // The solve waits for its session's id.
        let push = next_push(&mut s, false).unwrap();
        assert_eq!(push.ids.len(), 1);
        pushed(&mut s, PushResult { results: vec![PushValue { id: push.ids[0].clone(), value: json!({ "id": 40 }) }] });
        let push = next_push(&mut s, false).unwrap();
        assert_eq!(push.body["operations"][0]["body"]["sessionId"], 40);
        pushed(&mut s, PushResult { results: vec![PushValue { id: push.ids[0].clone(), value: json!({ "id": 900 }) }] });
        assert!(s.outbox.is_empty());
        assert_eq!(s.server_solve(solve), Some(900));
        // Another device's solve, and the deletion of ours.
        let page: Page = serde_json::from_value(json!({ "cursor": 5, "changes": [
            { "kind": "solves", "id": 901, "value": { "id": 901, "session_id": 40, "case_id": null, "time_ms": 8000, "penalty": "+2", "scramble": "R", "created_at": "2026-11-22T10:00:00.000Z", "puzzle_id": "333", "solve_mode": "standard", "scramble_type": "normal" } },
            { "kind": "solves", "id": 900, "value": null },
            { "kind": "learned_cases", "id": 1, "value": { "id": 1, "case_id": "OLL 27", "learned": 1, "algs": ["R U R' U R U2 R'"] } }
        ] })).unwrap();
        merge(&mut s, page);
        assert!(s.get(solve).is_none());
        assert_eq!(s.get(901).unwrap().session_id, Some(session));
        assert!(s.is_learned("OLL 27"));
        assert_eq!(s.cursor, 5);
    }
}
