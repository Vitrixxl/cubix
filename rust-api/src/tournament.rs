//! Tournaments and battles: two players race on the same scrambles, a solve at a time. The faster one takes the solve
//! (a DNF loses to any time; a tie, or two DNFs, gives nothing); `points` solves take a set, `sets` sets the match.
//!
//! A tournament is a single-elimination bracket. Players register until it starts, at its date (or when its organiser
//! starts it); they are then drawn at random, byes going to the first drawn when they are not a power of two. A round
//! opens once every match of the one before is over: everyone waits for everyone. A tournament without a group is open
//! to every account and run by the administration; a group's is run by its owner and admins, for its members. A battle
//! is a single match launched in a conversation: in a group, against one member or whoever accepts it; between two
//! friends, against the other. Battles and a group's tournaments show in their conversation as cards.
//!
//! The HTTP routes live under /api/tournaments and /api/matches (`route`, on the database thread). Matches are played
//! on the socket /api/matches/live (`upgrade`): the players' solves, their timers' phases, and whoever watches.
//! Everything is kept in the database as it happens, so a match survives a restart; who is connected is not.
use crate::{
    AppState, accounts,
    accounts::now,
    api::string,
    db::{all, one, required},
    error::{ApiError, Result},
    social::{self, notify, person},
};
use axum::{
    extract::{
        State, WebSocketUpgrade,
        ws::{Message, Utf8Bytes, WebSocket},
    },
    response::Response,
};
use rand::seq::SliceRandom;
use rusqlite::{Connection, params};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::duel::{PENALTIES, PHASES};
const UNKNOWN_TOURNAMENT: &str = "Unknown tournament";
const UNKNOWN_MATCH: &str = "Unknown match";

/// A player's time on a solve with its penalty: None for a DNF (the rule of `stats::effective_ms`).
pub fn effective(ms: i64, penalty: &str) -> Option<i64> {
    crate::stats::effective_ms(ms as f64, penalty).map(|t| t as i64)
}

/// Where a match stands after its solves.
#[derive(Debug, Default, PartialEq)]
pub struct Score {
    pub sets: [i64; 2],
    /// Solves won in the set under way.
    pub points: [i64; 2],
    /// The seat that won the match.
    pub winner: Option<usize>,
    /// Who took each solve counted (None for a tie).
    pub solves: Vec<Option<usize>>,
}
/// The score of solves given in order, each as both players' times (outer None: not solved yet, inner None: DNF).
/// Counting stops at the first solve still open, and once the match is won.
pub fn score(points: i64, sets: i64, solves: &[[Option<Option<i64>>; 2]]) -> Score {
    let mut score = Score::default();
    for solve in solves {
        let [Some(a), Some(b)] = *solve else { break };
        if score.winner.is_some() {
            break;
        }
        let taken = match (a, b) {
            (Some(a), Some(b)) if a < b => Some(0),
            (Some(a), Some(b)) if b < a => Some(1),
            (Some(_), None) => Some(0),
            (None, Some(_)) => Some(1),
            _ => None,
        };
        score.solves.push(taken);
        if let Some(seat) = taken {
            score.points[seat] += 1;
            if score.points[seat] >= points {
                score.sets[seat] += 1;
                score.points = [0, 0];
                if score.sets[seat] >= sets {
                    score.winner = Some(seat);
                }
            }
        }
    }
    score
}

/// The single-elimination bracket of `players` (in draw order): the pairs of the first round, each slot's two seats,
/// byes (None) going to the first drawn. Its size is the power of two at or above the count.
pub fn bracket(players: &[String]) -> (u32, Vec<[Option<String>; 2]>) {
    let size = players.len().max(2).next_power_of_two();
    let mut seeded: Vec<Option<String>> = players.iter().cloned().map(Some).collect();
    seeded.resize(size, None);
    let pairs = (0..size / 2).map(|k| [seeded[k].clone(), seeded[size - 1 - k].clone()]).collect();
    (size.trailing_zeros(), pairs)
}

/// What a match of two seats becomes: played (`ready`) with both, won by the one there (a bye), or `empty`.
fn outcome(a: &Option<String>, b: &Option<String>, empty: &'static str) -> (&'static str, Option<String>) {
    match (a, b) {
        (Some(_), Some(_)) => ("ready", None),
        (Some(p), None) | (None, Some(p)) => ("done", Some(p.clone())),
        _ => (empty, None),
    }
}
/// Whether a match is to be played or under way.
fn playing(row: &Value) -> bool {
    ["ready", "live"].contains(&row["status"].as_str().unwrap_or(""))
}

// Matches.

const MATCH_SQL: &str = "SELECT m.*,a.username a_name,a.avatar a_avatar,b.username b_name,b.avatar b_avatar,t.name tournament_name,
  g.name group_name,c.username creator_name,(SELECT conversation_id FROM social_messages x WHERE x.match_id=m.id LIMIT 1) conversation_id
 FROM matches m
 LEFT JOIN users a ON a.id=m.player_a LEFT JOIN users b ON b.id=m.player_b LEFT JOIN users c ON c.id=m.created_by
 LEFT JOIN tournaments t ON t.id=m.tournament_id LEFT JOIN social_groups g ON g.id=m.group_id";
fn match_row(db: &Connection, id: i64) -> Result<Value> {
    required(db, &format!("{MATCH_SQL} WHERE m.id=?"), [id], UNKNOWN_MATCH)
}
fn seat_of(row: &Value, uid: &str) -> Option<usize> {
    if row["player_a"] == uid {
        Some(0)
    } else if row["player_b"] == uid {
        Some(1)
    } else {
        None
    }
}
fn players_of(row: &Value) -> Vec<String> {
    [&row["player_a"], &row["player_b"]].iter().filter_map(|v| v.as_str().map(str::to_owned)).collect()
}
fn solves(db: &Connection, id: i64) -> Result<Vec<Value>> {
    all(db, "SELECT * FROM match_solves WHERE match_id=? ORDER BY number", [id])
}
fn times(rows: &[Value]) -> Vec<[Option<Option<i64>>; 2]> {
    rows.iter()
        .map(|r| {
            let side = |ms: &str, penalty: &str| r[ms].as_i64().map(|ms| effective(ms, r[penalty].as_str().unwrap_or("none")));
            [side("a_ms", "a_penalty"), side("b_ms", "b_penalty")]
        })
        .collect()
}
fn match_score(row: &Value, rows: &[Value]) -> Score {
    score(row["points"].as_i64().unwrap_or(1), row["sets"].as_i64().unwrap_or(1), &times(rows))
}
/// A match as the apps show it; `full` adds every solve with its scramble.
fn match_dto(db: &Connection, row: &Value, full: bool) -> Result<Value> {
    Ok(match_value(row, &solves(db, row["id"].as_i64().unwrap())?, full))
}
/// Matches with their solves, all loaded at once: `sql` selects them (from `MATCH_SQL`).
fn match_list(db: &Connection, sql: &str, params: impl rusqlite::Params + Copy) -> Result<Vec<Value>> {
    let matches = all(db, &format!("{MATCH_SQL} {sql}"), params)?;
    let mut by_match: HashMap<i64, Vec<Value>> = HashMap::new();
    let ids = matches.iter().filter_map(|m| m["id"].as_i64()).map(|id| id.to_string()).collect::<Vec<_>>().join(",");
    for row in all(db, &format!("SELECT * FROM match_solves WHERE match_id IN ({ids}) ORDER BY match_id,number"), [])? {
        by_match.entry(row["match_id"].as_i64().unwrap_or(0)).or_default().push(row);
    }
    Ok(matches.iter().map(|m| match_value(m, by_match.get(&m["id"].as_i64().unwrap_or(0)).map_or(&[][..], Vec::as_slice), false)).collect())
}
fn match_value(row: &Value, rows: &[Value], full: bool) -> Value {
    let id = row["id"].as_i64().unwrap();
    let s = match_score(row, rows);
    let player = |id: &Value, name: &Value, avatar: &Value| if id.is_null() { Value::Null } else { person(id, name, avatar) };
    let won = [0, 1].map(|seat| s.solves.iter().filter(|w| **w == Some(seat)).count());
    let mut value = json!({
        "id": id,
        "tournamentId": row["tournament_id"],
        "tournament": row["tournament_name"],
        "groupId": row["group_id"],
        "group": row["group_name"],
        // The conversation whose card shows the battle.
        "conversationId": row["conversation_id"],
        "round": row["round"],
        "slot": row["slot"],
        "event": row["event"],
        "points": row["points"],
        "sets": row["sets"],
        "status": row["status"],
        "winner": row["winner"],
        "forfeit": row["forfeit"] == 1,
        "players": [player(&row["player_a"], &row["a_name"], &row["a_avatar"]), player(&row["player_b"], &row["b_name"], &row["b_avatar"])],
        // Sets won, solves won in the set under way, and solves won in all.
        "score": {"sets": s.sets, "points": s.points, "solves": won},
        "solved": rows.len(),
        "createdBy": row["created_by"],
        "creator": row["creator_name"],
        "createdAt": row["created_at"],
        "startedAt": row["started_at"],
        "finishedAt": row["finished_at"],
    });
    if full {
        value["solves"] = json!(rows.iter().enumerate().map(|(i, r)| {
            let side = |ms: &str, penalty: &str| if r[ms].is_null() { Value::Null } else { json!({"ms": r[ms], "penalty": r[penalty]}) };
            json!({"number": r["number"], "scramble": r["scramble"], "results": [side("a_ms", "a_penalty"), side("b_ms", "b_penalty")], "winner": s.solves.get(i).cloned().flatten()})
        }).collect::<Vec<_>>());
    }
    value
}
/// Whether the account may see the match: a group's for its members, a battle between two friends for them, an open
/// tournament's for everyone signed in.
fn visible(db: &Connection, row: &Value, uid: &str) -> Result<()> {
    if let Some(group) = row["group_id"].as_i64() {
        social::member(db, group, uid, false).map_err(|_| ApiError::new(404, UNKNOWN_MATCH))?;
    } else if row["tournament_id"].is_null() && seat_of(row, uid).is_none() {
        return Err(ApiError::new(404, UNKNOWN_MATCH));
    }
    Ok(())
}
/// Tells the players of a match, and the members of its group (whose conversation shows it), where it now stands.
fn announce(db: &Connection, state: &AppState, row: &Value, status: &str) -> Result<()> {
    let players = players_of(row);
    let mut users = players.clone();
    if let Some(group) = row["group_id"].as_i64() {
        users.extend(social::members(db, group)?);
        users.sort();
        users.dedup();
    }
    notify(
        state,
        &users,
        "match",
        json!({"match": row["id"], "status": status, "players": players, "tournament": row["tournament_name"], "round": row["round"], "group": row["group_name"], "groupId": row["group_id"]}),
    );
    Ok(())
}
/// A battle as its card in a conversation shows it.
pub fn match_card(db: &Connection, id: i64) -> Result<Value> {
    match_dto(db, &match_row(db, id)?, false)
}
/// A tournament as its card in a conversation shows it, for the account `uid` when known.
pub fn tournament_card(db: &Connection, id: i64, uid: Option<&str>) -> Result<Value> {
    tournament_dto(db, &tournament_row(db, id)?, uid)
}
/// Closes a match: its winner (a seat), whether it was given rather than raced; a tournament's goes on.
fn finish(db: &Connection, state: &AppState, row: &Value, winner: usize, forfeit: bool) -> Result<()> {
    let id = row["id"].as_i64().unwrap();
    let user = if winner == 0 { &row["player_a"] } else { &row["player_b"] };
    db.execute(
        "UPDATE matches SET status='done',winner=?,forfeit=?,finished_at=? WHERE id=? AND status IN ('ready','live')",
        params![user.as_str(), forfeit as i64, now(), id],
    )?;
    announce(db, state, row, "done")?;
    if let Some(tournament) = row["tournament_id"].as_i64() {
        advance(db, state, tournament)?;
        changed(db, state, &tournament_row(db, tournament)?)?;
    } else if let Some(group) = row["group_id"].as_i64() {
        social::changed(db, state, group, false)?;
    }
    Ok(())
}
/// Sends the match as it stands to whoever has it open.
fn publish(db: &Connection, state: &AppState, id: i64) -> Result<()> {
    let row = match_row(db, id)?;
    state.matches.publish(id, match_dto(db, &row, true)?);
    Ok(())
}
/// Recounts a match after a change of its solves, and closes it once someone won.
fn settle(db: &Connection, state: &AppState, id: i64) -> Result<()> {
    let row = match_row(db, id)?;
    if let Some(winner) = match_score(&row, &solves(db, id)?).winner
        && playing(&row)
    {
        finish(db, state, &row, winner, false)?;
    }
    publish(db, state, id)
}
/// What a player does in a match, from its socket; wrong or late moves are ignored.
fn play(db: &Connection, state: &AppState, id: i64, seat: usize, body: &Value) -> Result<()> {
    let row = match_row(db, id)?;
    if !playing(&row) {
        return Ok(());
    }
    let rows = solves(db, id)?;
    let last = rows.last();
    let number = body["number"].as_i64().unwrap_or(0);
    let side = if seat == 0 { "a" } else { "b" };
    let open = |r: &Value| r["a_ms"].is_null() || r["b_ms"].is_null();
    match body["type"].as_str().unwrap_or("") {
        // The scramble of the next solve, from the first player's app (or the second's when the first is away).
        "scramble" => {
            let Some(text) = body["text"].as_str().map(str::trim).filter(|t| (1..=2000).contains(&t.len())) else { return Ok(()) };
            if number != rows.len() as i64 + 1 || last.is_some_and(open) || match_score(&row, &rows).winner.is_some() {
                return Ok(());
            }
            db.execute("INSERT OR IGNORE INTO match_solves(match_id,number,scramble) VALUES(?,?,?)", params![id, number, text])?;
            if row["status"] == "ready" {
                db.execute("UPDATE matches SET status='live',started_at=? WHERE id=?", params![now(), id])?;
                announce(db, state, &row, "live")?;
            }
            publish(db, state, id)
        }
        "solve" => {
            let ms = body["ms"].as_f64().filter(|ms| ms.is_finite() && *ms > 0. && *ms < 3_600_000.);
            let (Some(ms), Some(last)) = (ms, last) else { return Ok(()) };
            if last["number"].as_i64() != Some(number) || !last[format!("{side}_ms")].is_null() {
                return Ok(());
            }
            db.execute(
                &format!("UPDATE match_solves SET {side}_ms=?,{side}_penalty='none' WHERE match_id=? AND number=?"),
                params![ms.round() as i64, id, number],
            )?;
            settle(db, state, id)
        }
        // A penalty on the player's own latest solve, while the match is on.
        "penalty" => {
            let Some(penalty) = body["penalty"].as_str().filter(|p| PENALTIES.contains(p)) else { return Ok(()) };
            let Some(last) = last.filter(|l| l["number"].as_i64() == Some(number) && !l[format!("{side}_ms")].is_null()) else { return Ok(()) };
            db.execute(
                &format!("UPDATE match_solves SET {side}_penalty=? WHERE match_id=? AND number=?"),
                params![penalty, id, last["number"].as_i64()],
            )?;
            settle(db, state, id)
        }
        // A solve taken back to redo it on the same scramble, until the other player solved it too.
        "cancel" => {
            let Some(last) = last.filter(|l| l["number"].as_i64() == Some(number) && open(l)) else { return Ok(()) };
            db.execute(
                &format!("UPDATE match_solves SET {side}_ms=NULL,{side}_penalty=NULL WHERE match_id=? AND number=?"),
                params![id, last["number"].as_i64()],
            )?;
            publish(db, state, id)
        }
        "forfeit" => {
            finish(db, state, &row, 1 - seat, true)?;
            publish(db, state, id)
        }
        _ => Ok(()),
    }
}

// Tournaments.

/// Tournaments with their group, winner and count of players; `extra` adds columns.
fn tournament_sql(extra: &str) -> String {
    format!(
        "SELECT t.*,g.name group_name,w.username winner_name,w.avatar winner_avatar,
          (SELECT count(*) FROM tournament_players p WHERE p.tournament_id=t.id) players{extra}
         FROM tournaments t LEFT JOIN social_groups g ON g.id=t.group_id LEFT JOIN users w ON w.id=t.winner_id"
    )
}
fn tournament_row(db: &Connection, id: i64) -> Result<Value> {
    required(db, &format!("{} WHERE t.id=?", tournament_sql("")), [id], UNKNOWN_TOURNAMENT)
}
fn tournament_dto(db: &Connection, t: &Value, uid: Option<&str>) -> Result<Value> {
    let id = t["id"].as_i64().unwrap();
    let mut value = json!({
        "id": id,
        "name": t["name"],
        "description": t["description"],
        "event": t["event"],
        "groupId": t["group_id"],
        "group": t["group_name"],
        "startsAt": t["starts_at"],
        "points": t["points"],
        "sets": t["sets"],
        "maxPlayers": t["max_players"],
        "status": t["status"],
        "round": t["round"],
        "rounds": t["rounds"],
        "players": t["players"],
        "winner": if t["winner_id"].is_null() { Value::Null } else { person(&t["winner_id"], &t["winner_name"], &t["winner_avatar"]) },
        "createdAt": t["created_at"],
        "startedAt": t["started_at"],
        "finishedAt": t["finished_at"],
    });
    if t.get("registered").is_some() {
        // Read along with the list (`list`).
        value["registered"] = json!(t["registered"] == 1);
        value["myMatch"] = t["my_match"].clone();
    } else if let Some(uid) = uid {
        value["registered"] = json!(one(db, "SELECT 1 FROM tournament_players WHERE tournament_id=? AND user_id=?", params![id, uid])?.is_some());
        // The player's match to play now, if any.
        value["myMatch"] = one(
            db,
            "SELECT id FROM matches WHERE tournament_id=?1 AND status IN ('ready','live') AND (player_a=?2 OR player_b=?2)",
            params![id, uid],
        )?
        .map(|r| r["id"].clone())
        .unwrap_or(Value::Null);
    }
    Ok(value)
}
/// The tournaments of a group, or every account's (`None`): the coming and running ones first, by date, then the past.
pub fn list(db: &Connection, group: Option<i64>, uid: &str) -> Result<Value> {
    // Whether the account is registered, and its match to play, read with each tournament.
    let mine = ",EXISTS(SELECT 1 FROM tournament_players p WHERE p.tournament_id=t.id AND p.user_id=?2) registered,
      (SELECT id FROM matches m WHERE m.tournament_id=t.id AND m.status IN ('ready','live') AND (m.player_a=?2 OR m.player_b=?2)) my_match";
    // Every account's tournaments come with those of the account's groups.
    let scope = if group.is_some() { "t.group_id IS ?1" } else { "(t.group_id IS NULL OR t.group_id IN (SELECT group_id FROM group_members WHERE user_id=?2 AND role!='invited'))" };
    let rows = all(
        db,
        &format!("{} WHERE {scope} ORDER BY CASE WHEN t.status IN ('open','running') THEN 0 ELSE 1 END,
          CASE WHEN t.status IN ('open','running') THEN t.starts_at ELSE -t.starts_at END LIMIT 100", tournament_sql(mine)),
        params![group, uid],
    )?;
    Ok(json!(rows.iter().map(|t| tournament_dto(db, t, Some(uid))).collect::<Result<Vec<_>>>()?))
}
/// Whether the account runs this tournament: the owner or an admin of its group.
fn organises(db: &Connection, t: &Value, uid: &str) -> bool {
    t["group_id"].as_i64().is_some_and(|g| social::member(db, g, uid, true).is_ok())
}
pub fn detail(db: &Connection, id: i64, uid: Option<&str>) -> Result<Value> {
    let t = tournament_row(db, id)?;
    if let (Some(group), Some(uid)) = (t["group_id"].as_i64(), uid) {
        social::member(db, group, uid, false).map_err(|_| ApiError::new(404, UNKNOWN_TOURNAMENT))?;
    }
    let mut value = tournament_dto(db, &t, uid)?;
    let players = all(
        db,
        "SELECT p.seed,p.registered_at,p.withdrawn,u.id,u.username,u.avatar FROM tournament_players p JOIN users u ON u.id=p.user_id
         WHERE p.tournament_id=? ORDER BY p.seed IS NULL,p.seed,p.registered_at",
        [id],
    )?;
    value["entrants"] = json!(players.iter().map(|p| {
        let mut v = person(&p["id"], &p["username"], &p["avatar"]);
        v["seed"] = p["seed"].clone();
        v["registeredAt"] = p["registered_at"].clone();
        v["withdrawn"] = json!(p["withdrawn"] == 1);
        v
    }).collect::<Vec<_>>());
    value["matches"] = json!(match_list(db, "WHERE m.tournament_id=? ORDER BY m.round,m.slot", [id])?);
    value["canManage"] = json!(uid.is_some_and(|uid| organises(db, &t, uid)));
    Ok(value)
}
fn number(body: &Value, key: &str, min: i64, max: i64) -> Result<i64> {
    body[key].as_i64().filter(|n| (min..=max).contains(n)).ok_or_else(ApiError::validation)
}
/// The format shared by tournaments and battles: the event, solves to take a set, sets to take the match.
fn format(body: &Value) -> Result<(String, i64, i64)> {
    let event = string(body, "event", 1, 16)?;
    if !crate::practice::is_event(event) {
        return Err(ApiError::validation());
    }
    Ok((event.to_owned(), number(body, "points", 1, 15)?, number(body, "sets", 1, 9)?))
}
/// A new tournament: the administration's (no group) or a group's, by one of its organisers.
pub fn create(db: &Connection, state: &AppState, body: &Value, group: Option<i64>, by: Option<&str>) -> Result<Value> {
    let name = social::trimmed(body, "name", 2, 60)?;
    let description = social::optional(body, "description", 500)?;
    let (event, points, sets) = format(body)?;
    let starts = number(body, "startsAt", now() - 60_000, now() + 365 * accounts::DAY_MS)?;
    let cap = match body.get("maxPlayers") {
        None | Some(Value::Null) => None,
        Some(_) => Some(number(body, "maxPlayers", 2, 256)?),
    };
    db.execute(
        "INSERT INTO tournaments(name,description,event,group_id,created_by,starts_at,points,sets,max_players,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
        params![name, description, event, group, by, starts, points, sets, cap, now()],
    )?;
    let id = db.last_insert_rowid();
    if let Some(group) = group {
        notify(state, &social::members(db, group)?, "tournament", json!({"tournament": id, "group": group, "created": true}));
        // Its card in the group's conversation, from its organiser.
        if let Some(by) = by {
            let author = required(db, "SELECT id,username,avatar FROM users WHERE id=?", [by], UNKNOWN_TOURNAMENT)?;
            social::post(db, state, &social::group_conversation(db, group)?, &author, "", social::Card { tournament_id: Some(id), ..Default::default() })?;
        }
    }
    detail(db, id, by)
}
fn register(db: &Connection, state: &AppState, id: i64, uid: &str, join: bool) -> Result<Value> {
    let t = tournament_row(db, id)?;
    if let Some(group) = t["group_id"].as_i64() {
        social::member(db, group, uid, false).map_err(|_| ApiError::new(404, UNKNOWN_TOURNAMENT))?;
    }
    if t["status"] != "open" {
        return Err(ApiError::new(409, "Registration is closed: the tournament has started."));
    }
    if join {
        if t["max_players"].as_i64().is_some_and(|cap| t["players"].as_i64().unwrap_or(0) >= cap) {
            return Err(ApiError::new(409, "The tournament is full."));
        }
        db.execute("INSERT OR IGNORE INTO tournament_players(tournament_id,user_id,registered_at) VALUES(?,?,?)", params![id, uid, now()])?;
    } else {
        db.execute("DELETE FROM tournament_players WHERE tournament_id=? AND user_id=?", params![id, uid])?;
    }
    changed(db, state, &t)?;
    detail(db, id, Some(uid))
}
fn entrants(db: &Connection, id: i64) -> Result<Vec<String>> {
    social::user_ids(db, "SELECT user_id FROM tournament_players WHERE tournament_id=?", [id])
}
/// Tells those who follow a tournament (its players, and its group) that it changed.
fn changed(db: &Connection, state: &AppState, t: &Value) -> Result<()> {
    let id = t["id"].as_i64().unwrap();
    let mut users = entrants(db, id)?;
    if let Some(group) = t["group_id"].as_i64() {
        users.extend(social::members(db, group)?);
        users.sort();
        users.dedup();
    }
    notify(state, &users, "tournament", json!({"tournament": id}));
    Ok(())
}
/// Starts a tournament: draws its players into the bracket, or cancels it with fewer than two.
pub fn start(db: &mut Connection, state: &AppState, id: i64) -> Result<()> {
    let t = tournament_row(db, id)?;
    if t["status"] != "open" {
        return Err(ApiError::new(409, "This tournament has already started."));
    }
    let mut players = entrants(db, id)?;
    if players.len() < 2 {
        db.execute("UPDATE tournaments SET status='cancelled',finished_at=? WHERE id=?", params![now(), id])?;
        return changed(db, state, &t);
    }
    players.shuffle(&mut rand::thread_rng());
    let (rounds, pairs) = bracket(&players);
    let (at, event, points, sets) = (now(), t["event"].clone(), t["points"].clone(), t["sets"].clone());
    let tx = db.transaction()?;
    for (seed, player) in players.iter().enumerate() {
        tx.execute("UPDATE tournament_players SET seed=? WHERE tournament_id=? AND user_id=?", params![seed as i64 + 1, id, player])?;
    }
    for round in 1..=rounds {
        for slot in 0..(pairs.len() >> (round - 1)) {
            let [a, b] = if round == 1 { pairs[slot].clone() } else { [None, None] };
            // A bye: the player goes through at once.
            let (status, winner) = outcome(&a, &b, "waiting");
            tx.execute(
                "INSERT INTO matches(tournament_id,group_id,round,slot,event,points,sets,player_a,player_b,status,winner,created_at,finished_at)
                 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                params![id, t["group_id"].as_i64(), round, slot as i64, event.as_str(), points.as_i64(), sets.as_i64(), a, b, status, winner, at, (status == "done").then_some(at)],
            )?;
        }
    }
    tx.execute("UPDATE tournaments SET status='running',round=1,rounds=?,started_at=? WHERE id=?", params![rounds, at, id])?;
    tx.commit()?;
    ready(db, state, id, 1)?;
    advance(db, state, id)?;
    changed(db, state, &t)
}
/// Tells the players of a round's matches that theirs can be played.
fn ready(db: &Connection, state: &AppState, id: i64, round: i64) -> Result<()> {
    for m in all(db, &format!("{MATCH_SQL} WHERE m.tournament_id=? AND m.round=? AND m.status='ready'"), params![id, round])? {
        announce(db, state, &m, "ready")?;
    }
    Ok(())
}
/// Opens the next round once every match of the current one is over, and closes the tournament after its final.
/// Its callers tell those who follow the tournament (`changed`), once.
pub fn advance(db: &Connection, state: &AppState, id: i64) -> Result<()> {
    loop {
        let t = tournament_row(db, id)?;
        if t["status"] != "running" {
            return Ok(());
        }
        let (round, rounds) = (t["round"].as_i64().unwrap_or(1), t["rounds"].as_i64().unwrap_or(1));
        let matches = all(db, "SELECT * FROM matches WHERE tournament_id=? AND round=? ORDER BY slot", params![id, round])?;
        if matches.iter().any(|m| !["done", "cancelled"].contains(&m["status"].as_str().unwrap_or(""))) {
            return Ok(());
        }
        if round >= rounds {
            let winner = matches.first().map(|m| m["winner"].clone()).unwrap_or(Value::Null);
            db.execute("UPDATE tournaments SET status='finished',winner_id=?,finished_at=? WHERE id=?", params![winner.as_str(), now(), id])?;
            return Ok(());
        }
        let gone = social::user_ids(db, "SELECT user_id FROM tournament_players WHERE tournament_id=? AND withdrawn=1", [id])?;
        let gone = |p: &Option<String>| p.as_ref().is_some_and(|u| gone.contains(u));
        for pair in matches.chunks(2) {
            let slot = pair[0]["slot"].as_i64().unwrap_or(0) / 2;
            let [a, b] = [pair.first(), pair.get(1)].map(|m| m.and_then(|m| m["winner"].as_str().map(str::to_owned)));
            // A player who gave up stays in the bracket, the match given to the other.
            let (status, winner, forfeit) = match (gone(&a), gone(&b)) {
                (true, false) if b.is_some() => ("done", b.clone(), true),
                (false, true) if a.is_some() => ("done", a.clone(), true),
                (true, _) | (_, true) => ("cancelled", None, false),
                _ => {
                    let (status, winner) = outcome(&a, &b, "cancelled");
                    (status, winner, false)
                }
            };
            db.execute(
                "UPDATE matches SET player_a=?,player_b=?,status=?,winner=?,forfeit=?,finished_at=? WHERE tournament_id=? AND round=? AND slot=?",
                params![a, b, status, winner, forfeit as i64, (status != "ready").then_some(now()), id, round + 1, slot],
            )?;
        }
        db.execute("UPDATE tournaments SET round=? WHERE id=?", params![round + 1, id])?;
        ready(db, state, id, round + 1)?;
    }
}
/// Cancels a tournament that has not finished: its matches stop where they are.
/// A player gives up: before the start, their registration goes; once under way, their match under way goes to their
/// opponent and every later one too.
fn withdraw(db: &Connection, state: &AppState, id: i64, uid: &str) -> Result<Value> {
    let t = tournament_row(db, id)?;
    if one(db, "SELECT 1 FROM tournament_players WHERE tournament_id=? AND user_id=?", params![id, uid])?.is_none() {
        return Err(ApiError::new(404, UNKNOWN_TOURNAMENT));
    }
    match t["status"].as_str().unwrap_or("") {
        "open" => return register(db, state, id, uid, false),
        "running" => {}
        _ => return Err(ApiError::new(409, "This tournament is over.")),
    }
    db.execute("UPDATE tournament_players SET withdrawn=1 WHERE tournament_id=? AND user_id=?", params![id, uid])?;
    let playing = one(db, "SELECT id FROM matches WHERE tournament_id=?1 AND status IN ('ready','live') AND (player_a=?2 OR player_b=?2)", params![id, uid])?;
    if let Some(m) = playing.and_then(|r| r["id"].as_i64()) {
        let row = match_row(db, m)?;
        finish(db, state, &row, 1 - seat_of(&row, uid).unwrap_or(0), true)?;
        publish(db, state, m)?;
    } else {
        changed(db, state, &t)?;
    }
    detail(db, id, Some(uid))
}
/// What the account is in the middle of, which the app keeps it in until it is over or given up: a battle ready or
/// under way, else a tournament under way it is still in.
pub fn current(db: &Connection, uid: &str) -> Result<Value> {
    let battle = one(
        db,
        "SELECT id FROM matches WHERE tournament_id IS NULL AND status IN ('ready','live') AND (player_a=?1 OR player_b=?1) ORDER BY id DESC LIMIT 1",
        [uid],
    )?;
    let tournament = one(
        db,
        "SELECT t.id FROM tournaments t JOIN tournament_players p ON p.tournament_id=t.id AND p.user_id=?1
         WHERE t.status='running' AND p.withdrawn=0 AND NOT EXISTS (SELECT 1 FROM matches m WHERE m.tournament_id=t.id
           AND m.status IN ('done','cancelled') AND (m.player_a=?1 OR m.player_b=?1) AND (m.winner IS NULL OR m.winner!=?1))
         ORDER BY t.started_at LIMIT 1",
        [uid],
    )?;
    Ok(json!({"match": battle.map(|r| r["id"].clone()), "tournament": tournament.map(|r| r["id"].clone())}))
}
pub fn cancel(db: &Connection, state: &AppState, id: i64) -> Result<()> {
    let t = tournament_row(db, id)?;
    if !["open", "running"].contains(&t["status"].as_str().unwrap_or("")) {
        return Err(ApiError::new(409, "This tournament is over."));
    }
    db.execute("UPDATE tournaments SET status='cancelled',finished_at=? WHERE id=?", params![now(), id])?;
    db.execute("UPDATE matches SET status='cancelled' WHERE tournament_id=? AND status NOT IN ('done','cancelled')", [id])?;
    changed(db, state, &t)
}
/// Gives a match to one of its players (a no-show, a player gone): `winner` is their account.
pub fn award(db: &Connection, state: &AppState, id: i64, winner: &str) -> Result<Value> {
    let row = match_row(db, id)?;
    let seat = seat_of(&row, winner).ok_or_else(ApiError::validation)?;
    if !playing(&row) {
        return Err(ApiError::new(409, "This match cannot be decided now."));
    }
    finish(db, state, &row, seat, true)?;
    publish(db, state, id)?;
    match_dto(db, &match_row(db, id)?, true)
}
/// Starts every tournament whose date has come.
pub fn due(db: &mut Connection, state: &AppState) -> Result<()> {
    let ids: Vec<i64> = all(db, "SELECT id FROM tournaments WHERE status='open' AND starts_at<=?", [now()])?
        .iter()
        .filter_map(|r| r["id"].as_i64())
        .collect();
    for id in ids {
        start(db, state, id)?;
    }
    Ok(())
}
/// The administration's view: every tournament open to all, the latest first, with its entrants.
pub fn admin_list(db: &Connection) -> Result<Value> {
    let rows = all(db, &format!("{} WHERE t.group_id IS NULL ORDER BY t.starts_at DESC LIMIT 200", tournament_sql("")), [])?;
    Ok(json!(rows.iter().map(|t| tournament_dto(db, t, None)).collect::<Result<Vec<_>>>()?))
}
pub fn delete(db: &Connection, state: &AppState, id: i64) -> Result<Value> {
    let t = tournament_row(db, id)?;
    let users = entrants(db, id)?;
    db.execute("DELETE FROM tournaments WHERE id=?", [id])?;
    notify(state, &users, "tournament", json!({"tournament": id, "deleted": true}));
    if let Some(group) = t["group_id"].as_i64() {
        social::changed(db, state, group, false)?;
    }
    Ok(json!({"ok": true}))
}

// Battles.

/// A group's latest battles, the ones under way first.
pub fn battles(db: &Connection, group: i64) -> Result<Value> {
    Ok(json!(match_list(
        db,
        "WHERE m.group_id=? AND m.tournament_id IS NULL ORDER BY CASE WHEN m.status IN ('waiting','ready','live') THEN 0 ELSE 1 END,m.created_at DESC LIMIT 30",
        [group],
    )?))
}
/// A new battle, waiting for its opponent; its card goes to the conversation it was launched from.
fn battle(db: &Connection, state: &AppState, user: &Value, body: &Value) -> Result<Value> {
    let uid = user["id"].as_str().unwrap();
    // Where it is launched: a conversation, a group's or two friends', or a group by its id.
    let conversation = match body.get("conversationId") {
        Some(_) => social::conversation(db, number(body, "conversationId", 1, i64::MAX)?, uid)?,
        None => {
            let group = number(body, "groupId", 1, i64::MAX)?;
            social::member(db, group, uid, false)?;
            social::group_conversation(db, group)?
        }
    };
    let group = conversation["group_id"].as_i64();
    let (event, points, sets) = format(body)?;
    let opponent = match group {
        Some(group) => match body.get("opponentId") {
            None | Some(Value::Null) => None,
            Some(_) => {
                let other = string(body, "opponentId", 1, 64)?;
                if other == uid || social::member(db, group, other, false).is_err() {
                    return Err(ApiError::new(422, "Pick a member of the group."));
                }
                Some(other.to_owned())
            }
        },
        // Between two friends, against the other.
        None => {
            let other = [&conversation["user_a"], &conversation["user_b"]].into_iter().filter_map(Value::as_str).find(|u| *u != uid).unwrap_or_default().to_owned();
            social::require_friend(db, uid, &other)?;
            Some(other)
        }
    };
    db.execute(
        "INSERT INTO matches(group_id,event,points,sets,player_a,player_b,status,created_by,created_at) VALUES(?,?,?,?,?,?,'waiting',?,?)",
        params![group, event, points, sets, uid, opponent, uid, now()],
    )?;
    let id = db.last_insert_rowid();
    social::post(db, state, &conversation, user, "", social::Card { match_id: Some(id), ..Default::default() })?;
    let row = match_row(db, id)?;
    let challenged = match (&opponent, group) {
        (Some(o), _) => vec![o.clone()],
        (None, Some(group)) => social::members(db, group).unwrap_or_default(),
        (None, None) => vec![],
    };
    let others: Vec<String> = challenged.into_iter().filter(|u| u != uid).collect();
    notify(
        state,
        &others,
        "battle",
        json!({"match": id, "group": group, "groupName": row["group_name"], "conversation": conversation["id"], "from": row["creator_name"], "open": row["player_b"].is_null()}),
    );
    if let Some(group) = group {
        social::changed(db, state, group, false)?;
    }
    match_dto(db, &row, false)
}

pub fn route(
    db: &mut Connection,
    state: &AppState,
    method: &str,
    parts: &[&str],
    body: &Value,
    user: &Value,
) -> Result<Value> {
    if user["password_hash"].is_null() {
        return Err(ApiError::new(403, "Sign in to play tournaments."));
    }
    let uid = user["id"].as_str().unwrap();
    let id = |s: &str| s.parse::<i64>().map_err(|_| ApiError::validation());
    match (method, parts) {
        ("GET", ["tournaments"]) => list(db, None, uid),
        // A group's tournament, by one of its organisers.
        ("POST", ["tournaments"]) => {
            let group = number(body, "groupId", 1, i64::MAX)?;
            social::member(db, group, uid, true)?;
            create(db, state, body, Some(group), Some(uid))
        }
        ("GET", ["tournaments", t]) => detail(db, id(t)?, Some(uid)),
        ("POST", ["tournaments", t, "register"]) => register(db, state, id(t)?, uid, true),
        ("DELETE", ["tournaments", t, "register"]) => register(db, state, id(t)?, uid, false),
        ("POST", ["tournaments", t, "withdraw"]) => withdraw(db, state, id(t)?, uid),
        ("GET", ["competition"]) => current(db, uid),
        ("POST", ["tournaments", t, action @ ("start" | "cancel")]) => {
            let t_id = id(t)?;
            if !organises(db, &tournament_row(db, t_id)?, uid) {
                return Err(ApiError::new(403, "Only the group's owner and admins run its tournaments."));
            }
            if *action == "start" { start(db, state, t_id)? } else { cancel(db, state, t_id)? }
            detail(db, t_id, Some(uid))
        }
        ("POST", ["matches"]) => battle(db, state, user, body),
        ("GET", ["matches", m]) => {
            let row = match_row(db, id(m)?)?;
            visible(db, &row, uid)?;
            match_dto(db, &row, true)
        }
        // A battle taken up: by the member challenged, or by anyone in the group when it is open to all.
        ("POST", ["matches", m, "accept"]) => {
            let row = match_row(db, id(m)?)?;
            visible(db, &row, uid)?;
            if !row["tournament_id"].is_null() || row["status"] != "waiting" || row["player_a"] == uid || !(row["player_b"].is_null() || row["player_b"] == uid) {
                return Err(ApiError::new(409, "This battle cannot be accepted."));
            }
            db.execute("UPDATE matches SET player_b=?,status='ready' WHERE id=?", params![uid, row["id"].as_i64()])?;
            let row = match_row(db, row["id"].as_i64().unwrap())?;
            announce(db, state, &row, "ready")?;
            if let Some(group) = row["group_id"].as_i64() {
                social::changed(db, state, group, false)?;
            }
            match_dto(db, &row, false)
        }
        // A battle withdrawn by its challenger, or declined by the member challenged, before it starts.
        ("DELETE", ["matches", m]) => {
            let row = match_row(db, id(m)?)?;
            if !row["tournament_id"].is_null() || seat_of(&row, uid).is_none() || !["waiting", "ready"].contains(&row["status"].as_str().unwrap_or("")) {
                return Err(ApiError::new(409, "This battle cannot be called off."));
            }
            db.execute("UPDATE matches SET status='cancelled',finished_at=? WHERE id=?", params![now(), row["id"].as_i64()])?;
            announce(db, state, &row, "cancelled")?;
            if let Some(group) = row["group_id"].as_i64() {
                social::changed(db, state, group, false)?;
            }
            Ok(json!({"ok": true}))
        }
        // A group's organisers give a match of its tournament to a player (a no-show).
        ("POST", ["matches", m, "award"]) => {
            let row = match_row(db, id(m)?)?;
            let t = row["tournament_id"].as_i64().map(|t| tournament_row(db, t)).transpose()?;
            if !t.is_some_and(|t| organises(db, &t, uid)) {
                return Err(ApiError::new(403, "Only the group's owner and admins decide its matches."));
            }
            award(db, state, row["id"].as_i64().unwrap(), string(body, "winner", 1, 64)?)
        }
        _ => Err(ApiError::new(404, "Unknown tournament route")),
    }
}

/// Starts the tournaments whose date has come, every few seconds.
pub async fn run(state: AppState) {
    let mut interval = tokio::time::interval(Duration::from_secs(5));
    loop {
        interval.tick().await;
        let copy = state.clone();
        if let Err(error) = state.db.call(move |db| due(db, &copy)).await {
            eprintln!("Tournaments: {}", error.message);
        }
    }
}

// The live match socket.

/// Messages already serialised: one state goes to every viewer of a match as the same shared text.
type Outbox = mpsc::UnboundedSender<Utf8Bytes>;
fn text(value: &Value) -> Utf8Bytes {
    value.to_string().into()
}
struct Viewer {
    id: Uuid,
    seat: Option<usize>,
    tx: Outbox,
}
#[derive(Default)]
struct Room {
    viewers: Vec<Viewer>,
    /// The match as last sent, to send again when someone comes or goes.
    last: Option<Value>,
}
/// Who has each match open.
#[derive(Default)]
pub struct Live(Mutex<HashMap<i64, Room>>);
impl Live {
    fn send(room: &mut Room, value: Value) {
        let mut value = value;
        value["present"] = json!([0, 1].map(|seat| room.viewers.iter().any(|v| v.seat == Some(seat))));
        let message = text(&json!({"type": "state", "match": value}));
        room.last = Some(value);
        for viewer in &room.viewers {
            let _ = viewer.tx.send(message.clone());
        }
    }
    /// The match changed: everyone who has it open hears.
    pub fn publish(&self, id: i64, value: Value) {
        let mut rooms = self.0.lock().unwrap();
        if let Some(room) = rooms.get_mut(&id) {
            Self::send(room, value);
        }
    }
    fn join(&self, id: i64, viewer: Viewer, value: Value) {
        let mut rooms = self.0.lock().unwrap();
        let room = rooms.entry(id).or_default();
        room.viewers.push(viewer);
        Self::send(room, value);
    }
    fn leave(&self, id: i64, viewer: Uuid) {
        let mut rooms = self.0.lock().unwrap();
        let Some(room) = rooms.get_mut(&id) else { return };
        let seat = room.viewers.iter().find(|v| v.id == viewer).and_then(|v| v.seat);
        room.viewers.retain(|v| v.id != viewer);
        if room.viewers.is_empty() {
            rooms.remove(&id);
        } else if let Some(last) = room.last.clone() {
            let message = seat.map(|seat| text(&json!({"type": "timer", "seat": seat, "phase": "idle"})));
            Self::send(room, last);
            if let Some(message) = message {
                for v in &room.viewers {
                    let _ = v.tx.send(message.clone());
                }
            }
        }
    }
    /// A player's timer phase, to everyone else watching.
    fn relay(&self, id: i64, from: Uuid, seat: usize, phase: &str) {
        let rooms = self.0.lock().unwrap();
        let message = text(&json!({"type": "timer", "seat": seat, "phase": phase}));
        for viewer in rooms.get(&id).into_iter().flat_map(|r| r.viewers.iter()).filter(|v| v.id != from) {
            let _ = viewer.tx.send(message.clone());
        }
    }
}

pub async fn upgrade(State(state): State<AppState>, ws: WebSocketUpgrade) -> Response {
    ws.read_buffer_size(4096)
        .write_buffer_size(0)
        .max_write_buffer_size(262_144)
        .max_message_size(16384)
        .max_frame_size(16384)
        .on_upgrade(move |socket| client(state, socket))
}

/// One open match: the first message names it and signs in; players then play, others watch.
async fn client(state: AppState, mut socket: WebSocket) {
    let viewer = Uuid::new_v4();
    let (tx, mut rx) = mpsc::unbounded_channel::<Utf8Bytes>();
    let mut joined: Option<(i64, Option<usize>)> = None;
    let (mut tokens, mut at) = (30., Instant::now());
    let idle = tokio::time::sleep(Duration::from_secs(60));
    tokio::pin!(idle);
    loop {
        tokio::select! {
            _ = &mut idle => break,
            outgoing = rx.recv() => {
                let Some(value) = outgoing else { break };
                if socket.send(Message::Text(value)).await.is_err() { break; }
            }
            incoming = socket.recv() => {
                let Some(Ok(message)) = incoming else { break };
                let body = match message {
                    Message::Text(t) => t,
                    Message::Close(_) => break,
                    Message::Ping(_) | Message::Pong(_) => continue,
                    _ => break,
                };
                idle.as_mut().reset(tokio::time::Instant::now() + Duration::from_secs(60));
                tokens = (tokens + at.elapsed().as_secs_f64() * 5.).min(30.);
                at = Instant::now();
                if tokens < 1. { continue; }
                tokens -= 1.;
                let Ok(body) = serde_json::from_str::<Value>(&body) else { break };
                let kind = body["type"].as_str().unwrap_or("");
                match (kind, joined) {
                    ("ping", _) => { let _ = tx.send(text(&json!({"type": "pong"}))); }
                    ("join", None) => {
                        let token = string(&body, "token", 1, 128).ok().map(|t| format!("Bearer {t}"));
                        let Some(id) = body["match"].as_i64() else { break };
                        let opened = state.db.call(move |db| {
                            let user = accounts::signed_in(db, &token.unwrap_or_default())?;
                            let uid = user["id"].as_str().unwrap_or_default().to_owned();
                            let row = match_row(db, id)?;
                            visible(db, &row, &uid)?;
                            Ok((seat_of(&row, &uid), match_dto(db, &row, true)?))
                        }).await;
                        match opened {
                            Ok((seat, value)) => {
                                state.matches.join(id, Viewer { id: viewer, seat, tx: tx.clone() }, value);
                                joined = Some((id, seat));
                            }
                            Err(error) => { let _ = tx.send(text(&json!({"type": "error", "message": error.message}))); }
                        }
                    }
                    ("timer", Some((id, Some(seat)))) => {
                        if let Some(phase) = body["phase"].as_str().filter(|p| PHASES.contains(p)) {
                            state.matches.relay(id, viewer, seat, phase);
                        }
                    }
                    (_, Some((id, Some(seat)))) => {
                        let copy = state.clone();
                        if let Err(error) = state.db.call(move |db| play(db, &copy, id, seat, &body)).await {
                            let _ = tx.send(text(&json!({"type": "error", "message": error.message})));
                        }
                    }
                    _ => {}
                }
            }
        }
    }
    if let Some((id, _)) = joined {
        state.matches.leave(id, viewer);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn t(ms: i64) -> Option<Option<i64>> {
        Some(Some(ms))
    }
    const DNF: Option<Option<i64>> = Some(None);
    #[test]
    fn solves_make_sets_and_sets_the_match() {
        // First to 2 solves takes a set, first to 2 sets the match.
        let solves = [[t(9000), t(9500)], [t(9900), t(9800)], [t(8000), DNF], [t(9000), t(9000)], [DNF, DNF], [t(8000), t(8100)], [t(8000), t(8100)]];
        let s = score(2, 2, &solves);
        assert_eq!(s.solves, vec![Some(0), Some(1), Some(0), None, None, Some(0), Some(0)]);
        assert_eq!(s.sets, [2, 0]);
        assert_eq!(s.winner, Some(0));
        // Nothing after an unfinished solve, nor after the match is won.
        let s = score(2, 2, &[[t(9000), None], [t(1), t(2)]]);
        assert_eq!((s.points, s.solves.len()), ([0, 0], 0));
        let s = score(1, 1, &[[t(2), t(1)], [t(1), t(2)]]);
        assert_eq!((s.winner, s.solves.len()), (Some(1), 1));
    }
    #[test]
    fn brackets_give_byes_to_the_first_drawn() {
        let names: Vec<String> = (0..5).map(|i| format!("p{i}")).collect();
        let (rounds, pairs) = bracket(&names);
        assert_eq!(rounds, 3);
        assert_eq!(pairs.len(), 4);
        // Three byes, never two byes together.
        assert_eq!(pairs.iter().filter(|p| p[1].is_none()).count(), 3);
        assert!(pairs.iter().all(|p| p[0].is_some()));
        assert_eq!(pairs[3], [Some("p3".into()), Some("p4".into())]);
        assert_eq!(bracket(&names[..2]).0, 1);
    }
}
