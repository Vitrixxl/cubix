//! One-on-one races: players queue for an event, get paired with someone of a similar level among those
//! searching, then race an Ao5 on the same five scrambles. There is no rating: the level each player sends is the
//! average of their recent solves on that event, and the range accepted around it widens the longer they wait.
//! The server pairs, relays timers and chat, and keeps the score; the scrambles come from the first player.
use crate::{AppState, accounts, activity, api::string, stats};
use axum::{
    extract::{
        State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    response::Response,
};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::sync::mpsc;
use uuid::Uuid;

pub const ROUNDS: usize = 5;
/// Levels within 15% of each other are paired at once; the range widens by 3% per second of waiting.
const RANGE: f64 = 0.15;
const RANGE_PER_SECOND: f64 = 0.03;
/// After this long anyone searching the same event will do.
const ANYONE_AFTER: Duration = Duration::from_secs(30);
/// Players without a level meet each other at once, and anyone else after this long.
const UNKNOWN_AFTER: Duration = Duration::from_secs(10);
const PHASES: [&str; 4] = ["idle", "holding", "ready", "running"];
const PENALTIES: [&str; 3] = ["none", "+2", "dnf"];

type Outbox = mpsc::UnboundedSender<Value>;

struct Waiting {
    id: Uuid,
    name: String,
    /// The account behind the socket, when it sent a valid token.
    user: Option<String>,
    event: String,
    level: Option<f64>,
    since: Instant,
    tx: Outbox,
}

#[derive(Clone)]
struct Solve {
    ms: f64,
    penalty: &'static str,
}

struct Seat {
    id: Uuid,
    name: String,
    user: Option<String>,
    level: Option<f64>,
    /// None once the player has left.
    tx: Option<Outbox>,
    results: Vec<Option<Solve>>,
    rematch: bool,
}

struct Race {
    id: Uuid,
    event: String,
    seats: [Seat; 2],
    scrambles: Vec<String>,
    game: u32,
    /// Whether the current game, once over, went to the administration's statistics.
    recorded: bool,
}
impl Race {
    /// The round being raced: the first one someone has not finished.
    fn round(&self) -> usize {
        (0..ROUNDS)
            .find(|&r| self.seats.iter().any(|s| s.results[r].is_none()))
            .unwrap_or(ROUNDS)
    }
    fn over(&self) -> bool {
        self.round() == ROUNDS
    }
    fn send(&self, seat: usize, value: Value) {
        if let Some(tx) = &self.seats[seat].tx {
            let _ = tx.send(value);
        }
    }
    fn broadcast(&self, value: Value) {
        for seat in 0..2 {
            self.send(seat, value.clone());
        }
    }
    /// The finished game for the statistics, once: when a rematch starts or someone leaves.
    fn record(&mut self) -> Option<activity::Game> {
        if !self.over() || self.recorded {
            return None;
        }
        self.recorded = true;
        let player = |s: &Seat| {
            let times: Vec<_> = s
                .results
                .iter()
                .map(|r| {
                    r.as_ref()
                        .and_then(|r| stats::effective_ms(r.ms, r.penalty))
                })
                .collect();
            activity::Player {
                user: s.user.clone(),
                name: s.name.clone(),
                results: json!(s.results.iter().map(|r| r.as_ref().map(|r| json!({"ms": r.ms, "penalty": r.penalty}))).collect::<Vec<_>>()),
                ao5: stats::average(&times),
            }
        };
        let players = [player(&self.seats[0]), player(&self.seats[1])];
        // Lower wins, a DNF average loses to any time, two DNFs draw.
        let winner = match (players[0].ao5, players[1].ao5) {
            (Some(a), Some(b)) if a < b => Some(0),
            (Some(a), Some(b)) if b < a => Some(1),
            (Some(_), None) => Some(0),
            (None, Some(_)) => Some(1),
            _ => None,
        };
        Some(activity::Game {
            race: self.id.to_string(),
            game: self.game,
            event: self.event.clone(),
            players,
            winner,
        })
    }
    fn state(&self) -> Value {
        json!({
            "type": "state",
            "game": self.game,
            "scrambles": self.scrambles,
            "results": self.seats.iter().map(|s| s.results.iter().map(|r| r.as_ref().map(|r| json!({"ms": r.ms, "penalty": r.penalty}))).collect::<Vec<_>>()).collect::<Vec<_>>(),
            "rematch": self.seats.iter().map(|s| s.rematch).collect::<Vec<_>>(),
            "present": self.seats.iter().map(|s| s.tx.is_some()).collect::<Vec<_>>(),
        })
    }
}

#[derive(Default)]
struct Inner {
    queue: Vec<Waiting>,
    races: HashMap<Uuid, Race>,
    /// Race and seat of each player in a race.
    seats: HashMap<Uuid, (Uuid, usize)>,
}

#[derive(Default)]
pub struct Arena {
    inner: Mutex<Inner>,
    log: Option<activity::Log>,
}

/// How far apart two levels are, if they may meet now: a ratio, 0 for equal levels.
fn gap(a: &Waiting, b: &Waiting, now: Instant) -> Option<f64> {
    let waited = now.duration_since(a.since.min(b.since));
    match (a.level, b.level) {
        (Some(x), Some(y)) => {
            let gap = x.max(y) / x.min(y) - 1.;
            (gap <= RANGE + RANGE_PER_SECOND * waited.as_secs_f64() || waited >= ANYONE_AFTER)
                .then_some(gap)
        }
        (None, None) => Some(0.),
        // Behind every known level that could have matched.
        _ => (waited >= UNKNOWN_AFTER).then_some(f64::MAX),
    }
}

impl Arena {
    pub fn new(log: activity::Log) -> Self {
        Self {
            inner: Mutex::default(),
            log: Some(log),
        }
    }
    fn keep(&self, game: Option<activity::Game>) {
        if let (Some(log), Some(game)) = (&self.log, game) {
            log.duel(game);
        }
    }
    fn race_of<'a>(inner: &'a mut Inner, id: &Uuid) -> Option<(&'a mut Race, usize)> {
        let (race, seat) = *inner.seats.get(id)?;
        inner.races.get_mut(&race).map(|r| (r, seat))
    }
    /// Pairs the players waiting longest with the closest level they may meet.
    fn pair(inner: &mut Inner) {
        let now = Instant::now();
        inner.queue.sort_by_key(|w| w.since);
        let mut i = 0;
        while i < inner.queue.len() {
            let best = (0..inner.queue.len())
                .filter(|&j| j != i && inner.queue[j].event == inner.queue[i].event)
                .filter_map(|j| gap(&inner.queue[i], &inner.queue[j], now).map(|g| (j, g)))
                .min_by(|a, b| a.1.total_cmp(&b.1));
            let Some((j, _)) = best else {
                i += 1;
                continue;
            };
            // Remove the later index first so the earlier one stays valid.
            let second = inner.queue.remove(i.max(j));
            let first = inner.queue.remove(i.min(j));
            let id = Uuid::new_v4();
            let seat = |w: Waiting| Seat {
                id: w.id,
                name: w.name,
                user: w.user,
                level: w.level,
                tx: Some(w.tx),
                results: vec![None; ROUNDS],
                rematch: false,
            };
            let race = Race {
                id,
                recorded: false,
                event: first.event.clone(),
                seats: [seat(first), seat(second)],
                scrambles: Vec::new(),
                game: 1,
            };
            let players: Vec<_> = race
                .seats
                .iter()
                .map(|s| json!({"name": s.name, "level": s.level}))
                .collect();
            for seat in 0..2 {
                inner.seats.insert(race.seats[seat].id, (id, seat));
                race.send(
                    seat,
                    json!({"type": "match", "race": id.to_string(), "seat": seat, "host": seat == 0, "event": race.event, "players": players}),
                );
            }
            race.broadcast(race.state());
            inner.races.insert(id, race);
        }
    }
    /// Tells everyone searching how many others search the same event.
    fn status(inner: &Inner) {
        for w in &inner.queue {
            let others = inner.queue.iter().filter(|o| o.event == w.event).count() - 1;
            let _ = w.tx.send(json!({"type": "queue", "searching": others}));
        }
    }
    pub fn tick(&self) {
        let mut inner = self.inner.lock().unwrap();
        Self::pair(&mut inner);
        Self::status(&inner);
    }
    fn queue(&self, waiting: Waiting) {
        self.leave(&waiting.id);
        let mut inner = self.inner.lock().unwrap();
        let _ = waiting.tx.send(json!({"type": "queued"}));
        inner.queue.push(waiting);
        Self::pair(&mut inner);
        Self::status(&inner);
    }
    /// Out of the queue, or out of a race: the opponent is told and the race ends once both are gone.
    pub fn leave(&self, id: &Uuid) {
        let mut inner = self.inner.lock().unwrap();
        inner.queue.retain(|w| w.id != *id);
        let Some((race_id, seat)) = inner.seats.remove(id) else {
            return;
        };
        let Some(race) = inner.races.get_mut(&race_id) else {
            return;
        };
        let game = race.record();
        race.seats[seat].tx = None;
        race.seats[seat].rematch = false;
        race.send(1 - seat, json!({"type": "left"}));
        race.broadcast(race.state());
        if race.seats.iter().all(|s| s.tx.is_none()) {
            inner.races.remove(&race_id);
        }
        drop(inner);
        self.keep(game);
    }
    /// A message of a player in a race; wrong or late messages are ignored.
    fn play(&self, id: &Uuid, body: &Value) {
        let mut inner = self.inner.lock().unwrap();
        let Some((race, seat)) = Self::race_of(&mut inner, id) else {
            return;
        };
        let other = 1 - seat;
        let round = |key| {
            body[key]
                .as_u64()
                .map(|r| r as usize)
                .filter(|&r| r < ROUNDS)
        };
        let penalty = || {
            body["penalty"]
                .as_str()
                .and_then(|p| PENALTIES.iter().find(|&&v| v == p).copied())
        };
        match body["type"].as_str().unwrap_or("") {
            "scrambles" => {
                let list: Option<Vec<String>> = body["list"].as_array().and_then(|a| {
                    a.iter()
                        .map(|v| {
                            v.as_str()
                                .filter(|s| (1..=2000).contains(&s.len()))
                                .map(str::to_owned)
                        })
                        .collect()
                });
                if seat != 0 || !race.scrambles.is_empty() {
                    return;
                }
                let Some(list) = list.filter(|l| l.len() == ROUNDS) else {
                    return;
                };
                race.scrambles = list;
                race.broadcast(race.state());
            }
            "timer" => {
                if let Some(phase) = body["phase"].as_str().filter(|p| PHASES.contains(p))
                    && !race.scrambles.is_empty()
                {
                    race.send(other, json!({"type": "timer", "phase": phase}));
                }
            }
            "solve" => {
                let ms = body["ms"]
                    .as_f64()
                    .filter(|ms| ms.is_finite() && *ms > 0. && *ms < 3_600_000.);
                let (Some(r), Some(ms), Some(penalty)) = (round("round"), ms, penalty()) else {
                    return;
                };
                if race.scrambles.is_empty() || r != race.round() || race.seats[seat].results[r].is_some() {
                    return;
                }
                race.seats[seat].results[r] = Some(Solve { ms: ms.round(), penalty });
                race.broadcast(race.state());
            }
            "penalty" => {
                let (Some(r), Some(penalty)) = (round("round"), penalty()) else {
                    return;
                };
                if let Some(solve) = race.seats[seat].results[r].as_mut() {
                    solve.penalty = penalty;
                    race.broadcast(race.state());
                }
            }
            // A solve can be taken back while the round is open, to redo it on the same scramble.
            "cancel" => {
                let Some(r) = round("round") else { return };
                if race.seats[other].results[r].is_none() && race.seats[seat].results[r].take().is_some() {
                    race.send(other, json!({"type": "timer", "phase": "idle"}));
                    race.broadcast(race.state());
                }
            }
            "chat" => {
                let Some(text) = body["text"].as_str().map(str::trim).filter(|t| (1..=300).contains(&t.chars().count())) else {
                    return;
                };
                race.broadcast(json!({"type": "chat", "seat": seat, "text": text}));
            }
            "rematch" => {
                if !race.over() || race.seats[other].tx.is_none() {
                    return;
                }
                race.seats[seat].rematch = true;
                if race.seats.iter().all(|s| s.rematch) {
                    let game = race.record();
                    race.game += 1;
                    race.recorded = false;
                    race.scrambles.clear();
                    for s in &mut race.seats {
                        s.rematch = false;
                        s.results = vec![None; ROUNDS];
                    }
                    race.broadcast(race.state());
                    drop(inner);
                    self.keep(game);
                    return;
                }
                race.broadcast(race.state());
            }
            _ => {}
        }
    }
}

/// Pairs players whose range widened while they waited, and keeps their search counts current.
pub async fn run(arena: Arc<Arena>) {
    let mut interval = tokio::time::interval(Duration::from_secs(1));
    loop {
        interval.tick().await;
        arena.tick();
    }
}

pub async fn upgrade(State(state): State<AppState>, ws: WebSocketUpgrade) -> Response {
    ws.read_buffer_size(4096)
        .write_buffer_size(0)
        .max_write_buffer_size(65536)
        .max_message_size(16384)
        .max_frame_size(16384)
        .on_upgrade(move |socket| player(state, socket))
}

/// Signed-in players race under their username, guests under a short name of their socket.
/// The account id, guest accounts included, goes to the statistics only.
async fn name(state: &AppState, id: &Uuid, token: Option<String>) -> (String, Option<String>) {
    let user = match token {
        Some(token) => state
            .db
            .call(move |db| accounts::auth(db, &format!("Bearer {token}")))
            .await
            .ok()
            .flatten(),
        None => None,
    };
    let account = user.as_ref().and_then(|u| u["id"].as_str().map(str::to_owned));
    let name = user
        .filter(|u| !u["password_hash"].is_null())
        .and_then(|u| u["username"].as_str().map(str::to_owned))
        .unwrap_or_else(|| format!("guest-{}", &id.simple().to_string()[..4]));
    (name, account)
}

async fn player(state: AppState, mut socket: WebSocket) {
    let id = Uuid::new_v4();
    let (tx, mut rx) = mpsc::unbounded_channel::<Value>();
    let mut player_name: Option<(String, Option<String>)> = None;
    // A burst of 30 messages, then 3 a second: a solve takes a handful, chat a few more.
    let (mut tokens, mut at) = (30., Instant::now());
    // Clients ping every 20 seconds; a silent socket is gone.
    let idle = tokio::time::sleep(Duration::from_secs(60));
    tokio::pin!(idle);
    loop {
        tokio::select! {
            _ = &mut idle => break,
            outgoing = rx.recv() => {
                let Some(value) = outgoing else { break };
                if socket.send(Message::Text(value.to_string().into())).await.is_err() { break; }
            }
            incoming = socket.recv() => {
                let Some(Ok(message)) = incoming else { break };
                let text = match message {
                    Message::Text(t) => t,
                    Message::Close(_) => break,
                    Message::Ping(_) | Message::Pong(_) => continue,
                    _ => break,
                };
                idle.as_mut().reset(tokio::time::Instant::now() + Duration::from_secs(60));
                tokens = (tokens + at.elapsed().as_secs_f64() * 3.).min(30.);
                at = Instant::now();
                if tokens < 1. { continue; }
                tokens -= 1.;
                let Ok(body) = serde_json::from_str::<Value>(&text) else { break };
                match body["type"].as_str().unwrap_or("") {
                    "ping" => { let _ = tx.send(json!({"type": "pong"})); }
                    "queue" => {
                        let Ok(event) = string(&body, "event", 1, 16) else { continue };
                        if !event.bytes().all(|b| b.is_ascii_alphanumeric()) { continue; }
                        let level = body["level"].as_f64().filter(|l| l.is_finite() && *l > 0. && *l < 3_600_000.);
                        if player_name.is_none() {
                            let token = string(&body, "token", 1, 128).ok().map(str::to_owned);
                            player_name = Some(name(&state, &id, token).await);
                        }
                        state.duel.queue(Waiting {
                            id, name: player_name.clone().unwrap().0, user: player_name.clone().unwrap().1, event: event.to_owned(), level, since: Instant::now(), tx: tx.clone(),
                        });
                    }
                    "leave" => state.duel.leave(&id),
                    _ => state.duel.play(&id, &body),
                }
            }
        }
    }
    state.duel.leave(&id);
}

#[cfg(test)]
mod tests {
    use super::*;
    fn waiting(level: Option<f64>, waited: u64) -> Waiting {
        Waiting {
            id: Uuid::new_v4(),
            name: String::new(),
            user: None,
            event: "333".into(),
            level,
            since: Instant::now() - Duration::from_secs(waited),
            tx: mpsc::unbounded_channel().0,
        }
    }
    #[test]
    fn range_widens_with_waiting() {
        let now = Instant::now();
        assert!(gap(&waiting(Some(10_000.), 0), &waiting(Some(11_000.), 0), now).is_some());
        assert!(gap(&waiting(Some(10_000.), 0), &waiting(Some(20_000.), 0), now).is_none());
        assert!(gap(&waiting(Some(10_000.), 34), &waiting(Some(20_000.), 0), now).is_some());
        assert!(gap(&waiting(Some(10_000.), 31), &waiting(Some(60_000.), 0), now).is_some());
        assert!(gap(&waiting(None, 0), &waiting(None, 0), now).is_some());
        assert!(gap(&waiting(None, 0), &waiting(Some(9_000.), 0), now).is_none());
        assert!(gap(&waiting(None, 11), &waiting(Some(9_000.), 0), now).is_some());
    }
    #[test]
    fn closest_level_first() {
        let mut inner = Inner::default();
        inner.queue = vec![waiting(Some(10_000.), 2), waiting(Some(30_000.), 1), waiting(Some(10_500.), 0)];
        let (slow, close) = (inner.queue[1].id, inner.queue[2].id);
        Arena::pair(&mut inner);
        assert_eq!(inner.queue.len(), 1);
        assert_eq!(inner.queue[0].id, slow);
        assert!(inner.seats.contains_key(&close));
    }
}
