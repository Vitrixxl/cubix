//! What the app keeps on the device: the account, its sessions, solves and learned cases in the API's own shapes, the
//! changes waiting to go up (the outbox) and the device's settings. One JSON file, written atomically.
//!
//! Rows have a local id; those that reached the server also have its id (`server_id`). A guest's rows stay local and
//! go up, once, when an account signs in.
use crate::puzzles::Context;
use crate::time::{Penalty, effective};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

fn standard() -> String { "standard".into() }
fn normal() -> String { "normal".into() }
fn cube() -> String { "333".into() }

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Solve {
    pub id: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub server_id: Option<i64>,
    #[serde(default)]
    pub session_id: Option<i64>,
    #[serde(default)]
    pub case_id: Option<String>,
    pub time_ms: u64,
    pub penalty: Penalty,
    #[serde(default)]
    pub scramble: Option<String>,
    #[serde(default)]
    pub comment: Option<String>,
    #[serde(default)]
    pub solution: Option<String>,
    #[serde(default)]
    pub memo_ms: Option<u64>,
    #[serde(default)]
    pub splits: Option<Vec<u64>>,
    #[serde(default)]
    pub moves: Option<u32>,
    #[serde(default)]
    pub cubes_solved: Option<u32>,
    #[serde(default)]
    pub cubes_attempted: Option<u32>,
    #[serde(default = "cube")]
    pub puzzle_id: String,
    #[serde(default = "standard")]
    pub solve_mode: String,
    #[serde(default = "normal")]
    pub scramble_type: String,
    pub created_at: String,
}

impl Solve {
    /// The solve's result in milliseconds (None: DNF). Fewest Moves counts its moves, Multi-Blind its points.
    pub fn value(&self) -> Option<f64> {
        match self.solve_mode.as_str() {
            "fewest-moves" => if self.penalty == Penalty::Dnf { None } else { self.moves.map(|m| m as f64 * 1000.0) },
            "multi-blind" => {
                let (s, a) = (self.cubes_solved? as i64, self.cubes_attempted? as i64);
                let points = s - (a - s);
                if self.penalty == Penalty::Dnf || points < 0 || (points == 0 && s < 2) { None } else { effective(self.time_ms, self.penalty) }
            }
            _ => effective(self.time_ms, self.penalty),
        }
    }
    pub fn context(&self) -> Context { Context::new(&self.puzzle_id, &self.solve_mode, &self.scramble_type) }
    pub fn at(&self) -> i64 { crate::date::parse(&self.created_at).unwrap_or(0) }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Session {
    pub id: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub server_id: Option<i64>,
    /// "playground" (the timer) or "training".
    pub mode: String,
    #[serde(default)]
    pub case_ids: Vec<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default = "cube")]
    pub puzzle_id: String,
    #[serde(default = "standard")]
    pub solve_mode: String,
    #[serde(default = "normal")]
    pub scramble_type: String,
    pub created_at: String,
}

impl Session {
    pub fn context(&self) -> Context { Context::new(&self.puzzle_id, &self.solve_mode, &self.scramble_type) }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub username: String,
    #[serde(rename = "isGuest", default)]
    pub is_guest: bool,
    #[serde(rename = "createdAt", default)]
    pub created_at: String,
    #[serde(rename = "wcaId", default)]
    pub wca_id: Option<String>,
}

/// A change waiting to reach the server: the API call it becomes, and the local row it is about.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Op {
    pub id: String,
    /// session, session-name, solve, penalty, comment, solution, delete, learned, learning-order, journey.
    pub kind: String,
    pub local: i64,
    pub body: Value,
    pub created_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub context: Context,
    /// The scramble type each puzzle was last practised with on the timer.
    pub inspection: bool,
    pub language: String,
    /// The server the account lives on.
    pub server: String,
    /// The timer: hold this long before it starts (ms); the time shown while running (or a placeholder).
    pub hold_ms: u64,
    pub hide_running: bool,
    /// Sounds at the inspection's 8 and 12 seconds.
    pub inspection_voice: bool,
    /// The training: how the cases come (random, the least practised first, the slowest first, due for review).
    pub training_order: String,
    pub training_cases: BTreeMap<String, Vec<String>>,
    /// Cube colours, the default scheme otherwise (white top, green front).
    pub cube_colours: Option<[String; 6]>,
    pub smart_cube: Option<String>,
    pub reminders: bool,
    pub onboarded: bool,
    /// Where each page was left (the method shown, the set chosen…), by key.
    pub prefs: BTreeMap<String, String>,
}

impl Settings {
    pub fn pref(&self, key: &str) -> Option<&str> { self.prefs.get(key).map(String::as_str) }
    pub fn set_pref(&mut self, key: &str, value: impl Into<String>) { self.prefs.insert(key.into(), value.into()); }
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            context: Context::default(),
            inspection: false,
            language: String::new(),
            server: "https://cubix.vitrixxl.fr".into(),
            hold_ms: 300,
            hide_running: false,
            inspection_voice: false,
            training_order: "random".into(),
            training_cases: BTreeMap::new(),
            cube_colours: None,
            smart_cube: None,
            reminders: false,
            onboarded: false,
            prefs: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Store {
    pub settings: Settings,
    pub user: Option<User>,
    pub token: Option<String>,
    /// Oldest first.
    pub sessions: Vec<Session>,
    /// Oldest first (by `created_at`, then as they came).
    pub solves: Vec<Solve>,
    /// Learned cases and the algorithms they were learned with (empty: none chosen).
    pub learned: BTreeMap<String, Vec<String>>,
    /// The order of the learning groups of each track (F2L, OLL, PLL).
    pub group_order: BTreeMap<String, Vec<String>>,
    /// The account's personal entries (the onboarding's answers, goals…), by key.
    pub journey: BTreeMap<String, Value>,
    pub outbox: Vec<Op>,
    pub cursor: i64,
    /// The current timer session of each context, by its key.
    pub current: BTreeMap<String, i64>,
    next: i64,
    #[serde(skip)]
    path: Option<PathBuf>,
    #[serde(skip)]
    pub revision: u64,
}

pub fn now_ms() -> u64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64) }

/// A fresh identifier for an operation, unique enough across devices.
fn op_id() -> String {
    use std::hash::{BuildHasher, Hasher};
    let mut h = std::collections::hash_map::RandomState::new().build_hasher();
    h.write_u64(now_ms());
    let a = h.finish();
    h.write_u64(a);
    format!("{:016x}{:016x}", a, h.finish())
}

/// Where the app keeps its file: `QBIX_DATA_DIR`, or the user's data directory.
pub fn default_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("QBIX_DATA_DIR") { return dir.into() }
    let base = std::env::var_os("XDG_DATA_HOME").map(PathBuf::from).or_else(|| std::env::var_os("HOME").map(|h| Path::new(&h).join(".local/share")));
    base.unwrap_or_else(|| ".".into()).join("qbix")
}

pub fn context_key(c: &Context) -> String { format!("{}:{}:{}", c.puzzle, c.solve_mode, c.scramble_type) }

/// What a new solve holds besides its time.
#[derive(Clone, Debug, Default)]
pub struct NewSolve {
    pub time_ms: u64,
    pub penalty: Penalty,
    pub scramble: Option<String>,
    pub case_id: Option<String>,
    pub memo_ms: Option<u64>,
    pub splits: Option<Vec<u64>>,
    pub moves: Option<u32>,
    pub cubes: Option<(u32, u32)>,
    pub solution: Option<String>,
    pub comment: Option<String>,
    pub at: Option<i64>,
}

impl Store {
    /// Reads the store in `dir`, or starts an empty one there; a file it cannot read is kept aside, not overwritten.
    pub fn open(dir: &Path) -> Self {
        let path = dir.join("qbix.json");
        let mut store = match std::fs::read(&path) {
            Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_else(|_| {
                let _ = std::fs::rename(&path, dir.join(format!("qbix.unreadable-{}.json", now_ms())));
                Store::default()
            }),
            Err(_) => Store::default(),
        };
        store.path = Some(path);
        store
    }

    /// A store kept in memory only (tests, previews).
    pub fn memory() -> Self { Self::default() }

    // ponytail: the whole file is written again at each change (a few ms for thousands of solves); a journal of
    // changes if histories grow to hundreds of thousands.
    pub fn save(&mut self) -> std::io::Result<()> {
        self.revision += 1;
        let Some(path) = &self.path else { return Ok(()) };
        if let Some(dir) = path.parent() { std::fs::create_dir_all(dir)? }
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_vec(self)?)?;
        std::fs::rename(tmp, path)
    }

    pub fn signed_in(&self) -> bool { self.user.as_ref().is_some_and(|u| !u.is_guest) && self.token.is_some() }

    fn id(&mut self) -> i64 {
        self.next += 1;
        -self.next
    }

    fn queue(&mut self, kind: &str, local: i64, body: Value) {
        if !self.signed_in() { return }
        // Only the latest learning mark of a case, order of a track or entry of a key needs to go up.
        let same = |op: &Op| match kind {
            "learned" => op.kind == kind && op.error.is_none() && op.body["caseId"] == body["caseId"],
            "learning-order" => op.kind == kind && op.body["track"] == body["track"],
            "journey" => op.kind == kind && op.body["key"] == body["key"],
            _ => false,
        };
        self.outbox.retain(|op| !same(op));
        self.outbox.push(Op { id: op_id(), kind: kind.into(), local, body, created_at: crate::date::iso(now_ms() as i64), error: None });
    }

    fn session_body(s: &Session) -> Value {
        let mut body = json!({ "mode": s.mode, "caseIds": s.case_ids, "puzzle": s.puzzle_id, "solveMode": s.solve_mode, "scrambleType": s.scramble_type });
        if let Some(name) = &s.name { body["name"] = json!(name) }
        body
    }

    fn solve_body(s: &Solve) -> Value {
        let mut body = json!({ "sessionId": s.session_id, "caseId": s.case_id, "timeMs": s.time_ms, "penalty": s.penalty, "scramble": s.scramble, "comment": s.comment, "puzzle": s.puzzle_id, "solveMode": s.solve_mode, "scrambleType": s.scramble_type });
        if let Some(v) = &s.solution { body["solution"] = json!(v) }
        if let Some(v) = s.memo_ms { body["memoMs"] = json!(v) }
        if let Some(v) = &s.splits { body["splits"] = json!(v) }
        if let Some(v) = s.moves { body["moves"] = json!(v) }
        if let (Some(a), Some(b)) = (s.cubes_solved, s.cubes_attempted) {
            body["cubesSolved"] = json!(a);
            body["cubesAttempted"] = json!(b);
        }
        body
    }

    /// A new session of `mode` for `context`, made the current one of its context when it is the timer's.
    pub fn new_session(&mut self, mode: &str, context: &Context, case_ids: Vec<String>, name: Option<String>) -> i64 {
        let id = self.id();
        let session = Session { id, server_id: None, mode: mode.into(), case_ids, name, puzzle_id: context.puzzle.clone(), solve_mode: context.solve_mode.clone(), scramble_type: context.scramble_type.clone(), created_at: crate::date::iso(now_ms() as i64) };
        let body = Self::session_body(&session);
        self.sessions.push(session);
        self.queue("session", id, body);
        if mode == "playground" { self.current.insert(context_key(context), id); }
        id
    }

    /// The timer session of `context` solves go to: the current one, or its latest, made when there is none.
    pub fn session(&mut self, context: &Context) -> i64 {
        let key = context_key(context);
        if let Some(&id) = self.current.get(&key) && self.session_row(id).is_some() { return id }
        if let Some(s) = self.sessions.iter().rev().find(|s| s.mode == "playground" && s.context() == *context) {
            let id = s.id;
            self.current.insert(key, id);
            return id;
        }
        self.new_session("playground", context, vec![], None)
    }

    /// The timer session of `context` shown now: the current one, or its latest; None before any.
    pub fn current_session(&self, context: &Context) -> Option<i64> {
        self.current.get(&context_key(context)).copied().filter(|id| self.session_row(*id).is_some()).or_else(|| self.sessions.iter().rev().find(|s| s.mode == "playground" && s.context() == *context).map(|s| s.id))
    }

    pub fn sessions_of<'a>(&'a self, mode: &'a str, context: &'a Context) -> impl DoubleEndedIterator<Item = &'a Session> { self.sessions.iter().filter(move |s| s.mode == mode && s.context() == *context) }

    pub fn rename_session(&mut self, id: i64, name: Option<String>) {
        let name = name.map(|n| n.trim().chars().take(60).collect::<String>()).filter(|n| !n.is_empty());
        if let Some(s) = self.sessions.iter_mut().find(|s| s.id == id) {
            s.name = name.clone();
            self.queue("session-name", id, json!({ "name": name }));
        }
    }

    pub fn add(&mut self, session: Option<i64>, context: &Context, new: NewSolve) -> i64 {
        let id = self.id();
        let solve = Solve {
            id,
            server_id: None,
            session_id: session,
            case_id: new.case_id,
            time_ms: new.time_ms,
            penalty: new.penalty,
            scramble: new.scramble,
            comment: new.comment,
            solution: new.solution,
            memo_ms: new.memo_ms,
            splits: new.splits,
            moves: new.moves,
            cubes_solved: new.cubes.map(|c| c.0),
            cubes_attempted: new.cubes.map(|c| c.1),
            puzzle_id: context.puzzle.clone(),
            solve_mode: context.solve_mode.clone(),
            scramble_type: context.scramble_type.clone(),
            created_at: crate::date::iso(new.at.unwrap_or(now_ms() as i64)),
        };
        let body = Self::solve_body(&solve);
        self.insert(solve);
        self.queue("solve", id, body);
        id
    }

    /// Puts a solve in its place in time.
    pub fn insert(&mut self, solve: Solve) {
        let i = self.solves.partition_point(|s| s.created_at <= solve.created_at);
        self.solves.insert(i, solve);
    }

    pub fn session_row(&self, id: i64) -> Option<&Session> { self.sessions.iter().find(|s| s.id == id) }

    /// The solves of a session, oldest first.
    pub fn solves_of(&self, session: i64) -> impl DoubleEndedIterator<Item = &Solve> { self.solves.iter().filter(move |s| s.session_id == Some(session)) }

    /// Every solve of a context (the timer's and the training's apart), oldest first.
    pub fn solves_in<'a>(&'a self, context: &'a Context) -> impl DoubleEndedIterator<Item = &'a Solve> { self.solves.iter().filter(move |s| s.puzzle_id == context.puzzle && s.solve_mode == context.solve_mode && s.scramble_type == context.scramble_type) }

    pub fn get(&self, id: i64) -> Option<&Solve> { self.solves.iter().rev().find(|s| s.id == id) }

    fn get_mut(&mut self, id: i64) -> Option<&mut Solve> { self.solves.iter_mut().rev().find(|s| s.id == id) }

    pub fn set_penalty(&mut self, id: i64, penalty: Penalty) {
        if let Some(s) = self.get_mut(id) {
            s.penalty = penalty;
            self.queue("penalty", id, json!({ "penalty": penalty }));
        }
    }

    pub fn set_comment(&mut self, id: i64, comment: Option<String>) {
        let comment = comment.map(|c| c.trim().to_string()).filter(|c| !c.is_empty());
        if let Some(s) = self.get_mut(id) {
            s.comment = comment.clone();
            self.queue("comment", id, json!({ "comment": comment }));
        }
    }

    pub fn set_solution(&mut self, id: i64, solution: Option<String>) {
        if let Some(s) = self.get_mut(id) {
            s.solution = solution.clone();
            self.queue("solution", id, json!({ "solution": solution }));
        }
    }

    pub fn remove(&mut self, id: i64) -> Option<Solve> {
        let solve = self.solves.remove(self.solves.iter().rposition(|s| s.id == id)?);
        // A solve that never went up just leaves the outbox.
        if solve.server_id.is_none() && self.outbox.iter().any(|op| op.kind == "solve" && op.local == id) {
            self.outbox.retain(|op| op.local != id);
        } else {
            self.outbox.retain(|op| !(op.local == id && matches!(op.kind.as_str(), "penalty" | "comment" | "solution")));
            self.queue("delete", id, Value::Null);
        }
        Some(solve)
    }

    /// Puts back a removed solve, as a new one for the server.
    pub fn restore(&mut self, solve: Solve) {
        let id = solve.id;
        self.outbox.retain(|op| !(op.local == id && op.kind == "delete"));
        let mut solve = solve;
        let pending = solve.server_id.is_some() && !self.outbox.iter().any(|op| op.local == id);
        if solve.server_id.is_some() && !pending {
            // The deletion went up already: it comes back as a new solve.
            solve.server_id = None;
        }
        if solve.server_id.is_none() {
            let body = Self::solve_body(&solve);
            self.queue("solve", id, body);
        }
        // Back in its place, before the solves made in the same millisecond after it.
        let i = self.solves.partition_point(|s| s.created_at < solve.created_at);
        self.solves.insert(i, solve);
    }

    pub fn delete_session(&mut self, id: i64) {
        let ids: Vec<i64> = self.solves_of(id).map(|s| s.id).collect();
        for s in ids {
            self.remove(s);
        }
        self.sessions.retain(|s| s.id != id);
        self.current.retain(|_, v| *v != id);
    }

    pub fn is_learned(&self, case: &str) -> bool { self.learned.contains_key(case) }

    pub fn set_learned(&mut self, case: &str, learned: bool, algs: Vec<String>) {
        if learned { self.learned.insert(case.into(), algs.clone()); } else { self.learned.remove(case); }
        let mut body = json!({ "caseId": case, "learned": learned });
        if learned && !algs.is_empty() { body["algs"] = json!(algs) }
        self.queue("learned", 0, body);
    }

    pub fn set_group_order(&mut self, track: &str, groups: Vec<String>) {
        self.group_order.insert(track.into(), groups.clone());
        self.queue("learning-order", 0, json!({ "track": track, "groups": groups }));
    }

    pub fn set_journey(&mut self, key: &str, value: Value) {
        self.journey.insert(key.into(), value.clone());
        self.queue("journey", 0, json!({ "key": key, "value": value }));
    }

    /// An account signed in: the guest's rows go up with it, and the account's come down at the next pull.
    pub fn sign_in(&mut self, user: User, token: String) {
        let switching = self.user.as_ref().is_some_and(|u| u.id != user.id && !u.is_guest);
        if switching { self.clear_account() }
        self.user = Some(user);
        self.token = Some(token);
        // The guest's sessions first: their solves refer to them.
        let sessions: Vec<Session> = self.sessions.iter().filter(|s| s.server_id.is_none()).cloned().collect();
        for s in &sessions {
            if !self.outbox.iter().any(|op| op.local == s.id) { self.queue("session", s.id, Self::session_body(s)) }
        }
        let solves: Vec<Solve> = self.solves.iter().filter(|s| s.server_id.is_none()).cloned().collect();
        for s in &solves {
            if !self.outbox.iter().any(|op| op.local == s.id) { self.queue("solve", s.id, Self::solve_body(s)) }
        }
        let learned: Vec<(String, Vec<String>)> = self.learned.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
        for (case, algs) in learned {
            self.set_learned(&case, true, algs);
        }
    }

    fn clear_account(&mut self) {
        self.sessions.clear();
        self.solves.clear();
        self.learned.clear();
        self.group_order.clear();
        self.journey.clear();
        self.outbox.clear();
        self.current.clear();
        self.cursor = 0;
    }

    /// Signs out: the account's rows leave the device (they are on the server), the settings stay.
    pub fn sign_out(&mut self) {
        self.user = None;
        self.token = None;
        self.clear_account();
    }

    // The synchronisation's side (sync.rs drives the network).

    pub fn server_session(&self, local: Option<i64>) -> Option<Option<i64>> {
        match local {
            None => Some(None),
            Some(id) => self.session_row(id).map_or(if id > 0 { Some(Some(id)) } else { None }, |s| s.server_id.map(Some)),
        }
    }

    pub fn server_solve(&self, local: i64) -> Option<i64> { self.get(local).and_then(|s| s.server_id) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_and_undoes() {
        let dir = std::env::temp_dir().join(format!("qbix-store-{}", now_ms()));
        let mut s = Store::open(&dir);
        let c = Context::default();
        let session = s.session(&c);
        let a = s.add(Some(session), &c, NewSolve { time_ms: 12_340, scramble: Some("R U".into()), ..Default::default() });
        let b = s.add(Some(session), &c, NewSolve { time_ms: 11_000, penalty: Penalty::Plus2, ..Default::default() });
        let removed = s.remove(a).unwrap();
        s.restore(removed);
        assert_eq!(s.solves_of(session).map(|x| x.id).collect::<Vec<_>>(), [a, b]);
        s.save().unwrap();
        let back = Store::open(&dir);
        assert_eq!(back.solves.len(), 2);
        assert_eq!(back.get(b).unwrap().penalty, Penalty::Plus2);
        assert_eq!(back.get(b).unwrap().value(), Some(13_000.0));
        assert!(back.outbox.is_empty(), "a guest queues nothing");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_guest_goes_up_on_sign_in() {
        let mut s = Store::memory();
        let c = Context::default();
        let session = s.session(&c);
        s.add(Some(session), &c, NewSolve { time_ms: 9_000, ..Default::default() });
        s.sign_in(User { id: "u".into(), username: "dev".into(), is_guest: false, created_at: String::new(), wca_id: None }, "t".into());
        assert_eq!(s.outbox.iter().map(|o| o.kind.as_str()).collect::<Vec<_>>(), ["session", "solve"]);
    }
}
