//! Coaching: players apply to coach (the administration approves them), coaches publish a profile and their weekly
//! hours, players book one of the slots those hours offer, talk with their coach and meet them in a video call.
//! Payment comes later: a booking is confirmed at once and keeps the price shown when it was made.
//!
//! The HTTP routes live under /api/coaching (`route`, run on the database thread). The socket /api/coaching/live
//! pushes chat messages and booking changes to every open app of an account, and relays the WebRTC signalling of a
//! session's call between its coach and student; the media itself goes peer to peer.
use crate::{
    AppState, accounts,
    accounts::{DAY_MS, now},
    api::string,
    db::{all, one, required},
    error::{ApiError, Result},
};
use axum::{
    extract::{
        State, WebSocketUpgrade,
        ws::{CloseFrame, Message, WebSocket},
    },
    response::Response,
};
use jiff::{Timestamp, civil::Date, tz::TimeZone};
use rusqlite::{Connection, params};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    sync::Mutex,
    time::{Duration, Instant},
};
use tokio::sync::mpsc;
use uuid::Uuid;

const MINUTE: i64 = 60_000;
/// Slots are offered from an hour ahead, four weeks out.
const NOTICE: i64 = 60 * MINUTE;
const HORIZON_DAYS: i64 = 28;
/// The session lengths a coach may choose, in minutes.
pub const LENGTHS: [i64; 5] = [30, 45, 60, 90, 120];
/// The call opens a quarter of an hour before the session and stays open half an hour after it.
const EARLY: i64 = 15 * MINUTE;
const LATE: i64 = 30 * MINUTE;
const UNKNOWN_COACH: &str = "Unknown coach";
const UNKNOWN_BOOKING: &str = "Unknown session";
const UNKNOWN_CONVERSATION: &str = "Unknown conversation";

/// Optional trimmed text of at most `max` characters, empty when absent.
fn text(body: &Value, key: &str, max: usize) -> Result<String> {
    match body.get(key) {
        None | Some(Value::Null) => Ok(String::new()),
        Some(_) => Ok(string(body, key, 0, max)?.trim().to_owned()),
    }
}
/// A list of short distinct words (events, languages).
fn words(body: &Value, key: &str, items: usize, max: usize) -> Result<Vec<String>> {
    let Some(value) = body.get(key) else { return Ok(Vec::new()) };
    let list = value.as_array().filter(|l| l.len() <= items).ok_or_else(ApiError::validation)?;
    let mut out: Vec<String> = Vec::new();
    for item in list {
        let word = item
            .as_str()
            .map(str::trim)
            .filter(|w| (1..=max).contains(&w.chars().count()))
            .ok_or_else(ApiError::validation)?;
        if !out.iter().any(|w| w == word) {
            out.push(word.to_owned());
        }
    }
    Ok(out)
}
fn events(body: &Value) -> Result<Vec<String>> {
    let list = words(body, "events", 24, 16)?;
    if list.iter().any(|e| !e.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')) {
        return Err(ApiError::validation());
    }
    Ok(list)
}
/// A JSON list stored as text.
fn parsed(value: &Value) -> Value {
    value.as_str().and_then(|s| serde_json::from_str(s).ok()).unwrap_or_else(|| json!([]))
}
fn flag(value: &Value) -> bool {
    value.as_i64() == Some(1)
}
fn ice_servers() -> Value {
    std::env::var("CUBIX_ICE_SERVERS")
        .ok()
        .and_then(|v| serde_json::from_str::<Value>(&v).ok())
        .filter(Value::is_array)
        .unwrap_or_else(|| json!([{"urls": ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"]}]))
}

/// A coach with their rating and how much they have coached.
const COACH_SQL: &str = "SELECT c.*,u.username,
 (SELECT avg(rating) FROM coach_reviews r WHERE r.coach_id=c.user_id) rating,
 (SELECT count(*) FROM coach_reviews r WHERE r.coach_id=c.user_id) reviews,
 (SELECT count(*) FROM coach_bookings b WHERE b.coach_id=c.user_id AND b.status='booked' AND b.ends_at<=?1) sessions,
 (SELECT count(DISTINCT student_id) FROM coach_bookings b WHERE b.coach_id=c.user_id AND b.status='booked') students
 FROM coaches c JOIN users u ON u.id=c.user_id";

/// The public face of a coach; `own` adds what only the coach sees (their hours as they entered them).
fn coach_dto(row: &Value, own: bool) -> Value {
    let mut value = json!({
        "id": row["user_id"], "username": row["username"], "headline": row["headline"], "bio": row["bio"],
        "events": parsed(&row["events"]), "languages": parsed(&row["languages"]), "priceCents": row["price_cents"],
        "sessionMinutes": row["session_minutes"], "timezone": row["timezone"], "accepting": flag(&row["accepting"]),
        "active": flag(&row["active"]), "rating": row["rating"], "reviews": row["reviews"], "sessions": row["sessions"],
        "students": row["students"], "since": row["created_at"],
    });
    if own {
        value["windows"] = parsed(&row["windows"]);
        value["daysOff"] = parsed(&row["days_off"]);
    }
    value
}
fn coach_row(db: &Connection, id: &str) -> Result<Option<Value>> {
    one(db, &format!("{COACH_SQL} WHERE c.user_id=?2"), params![now(), id])
}
/// The caller's own coach profile, while the administration keeps it active.
fn own_coach(db: &Connection, uid: &str) -> Result<Value> {
    coach_row(db, uid)?
        .filter(|c| flag(&c["active"]))
        .ok_or_else(|| ApiError::new(403, "Only coaches can do this."))
}

/// One weekly opening: a weekday (0 = Monday) and minutes of the day.
struct Window {
    weekday: i8,
    start: i64,
    end: i64,
}
fn windows(coach: &Value) -> Vec<Window> {
    parsed(&coach["windows"])
        .as_array()
        .map(|list| {
            list.iter()
                .filter_map(|w| {
                    Some(Window {
                        weekday: w["weekday"].as_i64()? as i8,
                        start: w["start"].as_i64()?,
                        end: w["end"].as_i64()?,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}
/// The coach's sessions still to come or under way, which no new booking may overlap.
fn busy(db: &Connection, coach: &str, from: i64) -> Result<Vec<(i64, i64)>> {
    Ok(all(
        db,
        "SELECT starts_at,ends_at FROM coach_bookings WHERE coach_id=? AND status='booked' AND ends_at>?",
        params![coach, from],
    )?
    .iter()
    .map(|r| (r["starts_at"].as_i64().unwrap_or(0), r["ends_at"].as_i64().unwrap_or(0)))
    .collect())
}
/// The free slots of a coach from `from` for `days` days: each opening of their week, cut into sessions, on the
/// coach's own clock (so a change of daylight saving time keeps their hours), minus days off, booked sessions and
/// anything sooner than the notice. Sorted, as `(start, end)` in milliseconds.
fn free_slots(coach: &Value, busy: &[(i64, i64)], from: i64, days: i64) -> Vec<(i64, i64)> {
    let Ok(tz) = TimeZone::get(coach["timezone"].as_str().unwrap_or("UTC")) else { return Vec::new() };
    let Ok(start) = Timestamp::from_millisecond(from) else { return Vec::new() };
    let minutes = coach["session_minutes"].as_i64().filter(|m| LENGTHS.contains(m)).unwrap_or(60);
    let openings = windows(coach);
    let off: HashSet<String> = parsed(&coach["days_off"])
        .as_array()
        .map(|l| l.iter().filter_map(|d| d.as_str().map(str::to_owned)).collect())
        .unwrap_or_default();
    let (earliest, latest) = (from + NOTICE, from + days * DAY_MS);
    let mut day = start.to_zoned(tz.clone()).date();
    let mut out = Vec::new();
    for _ in 0..=days {
        if !off.contains(&day.to_string()) {
            let weekday = day.weekday().to_monday_zero_offset();
            for w in openings.iter().filter(|w| w.weekday == weekday) {
                let mut m = w.start;
                while m + minutes <= w.end {
                    if let Ok(at) = day.at((m / 60) as i8, (m % 60) as i8, 0, 0).to_zoned(tz.clone()) {
                        let s = at.timestamp().as_millisecond();
                        let e = s + minutes * MINUTE;
                        if s >= earliest && s < latest && !busy.iter().any(|&(a, b)| a < e && s < b) {
                            out.push((s, e));
                        }
                    }
                    m += minutes;
                }
            }
        }
        match day.tomorrow() {
            Ok(next) => day = next,
            Err(_) => break,
        }
    }
    out.sort_unstable();
    out.dedup();
    out
}
fn slot_dto(slots: &[(i64, i64)]) -> Value {
    json!(slots.iter().map(|(s, e)| json!({"start": s, "end": e})).collect::<Vec<_>>())
}

const BOOKING_SQL: &str = "SELECT b.*,cu.username coach_name,su.username student_name,r.rating,r.comment review_comment,
 cv.id conversation_id FROM coach_bookings b JOIN users cu ON cu.id=b.coach_id JOIN users su ON su.id=b.student_id
 LEFT JOIN coach_reviews r ON r.booking_id=b.id
 LEFT JOIN coach_conversations cv ON cv.coach_id=b.coach_id AND cv.student_id=b.student_id";
/// A session as one of its two parties sees it.
fn booking_dto(row: &Value, uid: &str) -> Value {
    let coach = row["coach_id"].as_str() == Some(uid);
    json!({
        "id": row["id"], "role": if coach { "coach" } else { "student" },
        "coachId": row["coach_id"], "coachName": row["coach_name"],
        "studentId": row["student_id"], "studentName": row["student_name"],
        "with": if coach { json!({"id": row["student_id"], "username": row["student_name"]}) } else { json!({"id": row["coach_id"], "username": row["coach_name"]}) },
        "startsAt": row["starts_at"], "endsAt": row["ends_at"], "status": row["status"], "note": row["note"],
        "priceCents": row["price_cents"], "createdAt": row["created_at"], "cancelledAt": row["cancelled_at"],
        "cancelledByMe": row["cancelled_by"].as_str() == Some(uid),
        "review": if row["rating"].is_null() { Value::Null } else { json!({"rating": row["rating"], "comment": row["review_comment"]}) },
        "conversationId": row["conversation_id"],
    })
}
fn booking_row(db: &Connection, id: &str, uid: &str) -> Result<Value> {
    required(
        db,
        &format!("{BOOKING_SQL} WHERE b.id=?1 AND (b.coach_id=?2 OR b.student_id=?2)"),
        params![id, uid],
        UNKNOWN_BOOKING,
    )
}

const CONVERSATION_SQL: &str = "SELECT cv.*,cu.username coach_name,su.username student_name,
 (SELECT body FROM coach_messages m WHERE m.conversation_id=cv.id ORDER BY m.id DESC LIMIT 1) last_body,
 (SELECT created_at FROM coach_messages m WHERE m.conversation_id=cv.id ORDER BY m.id DESC LIMIT 1) last_at,
 (SELECT sender_id FROM coach_messages m WHERE m.conversation_id=cv.id ORDER BY m.id DESC LIMIT 1) last_sender,
 (SELECT count(*) FROM coach_messages m WHERE m.conversation_id=cv.id AND m.sender_id!=?1 AND m.read_at IS NULL) unread
 FROM coach_conversations cv JOIN users cu ON cu.id=cv.coach_id JOIN users su ON su.id=cv.student_id";
fn conversation_dto(row: &Value, uid: &str) -> Value {
    let coach = row["coach_id"].as_str() == Some(uid);
    json!({
        "id": row["id"], "role": if coach { "coach" } else { "student" },
        "coachId": row["coach_id"], "studentId": row["student_id"],
        "with": if coach { json!({"id": row["student_id"], "username": row["student_name"]}) } else { json!({"id": row["coach_id"], "username": row["coach_name"]}) },
        "lastMessage": if row["last_at"].is_null() { Value::Null } else { json!({"body": row["last_body"], "at": row["last_at"], "mine": row["last_sender"].as_str() == Some(uid)}) },
        "unread": row["unread"], "updatedAt": row["updated_at"],
        // The coach's private notes on the student never reach the student.
        "note": if coach { row["note"].clone() } else { Value::Null },
    })
}
fn conversation_row(db: &Connection, id: &str, uid: &str) -> Result<Value> {
    let id: i64 = id.parse().map_err(|_| ApiError::validation())?;
    required(
        db,
        &format!("{CONVERSATION_SQL} WHERE cv.id=?2 AND (cv.coach_id=?1 OR cv.student_id=?1)"),
        params![uid, id],
        UNKNOWN_CONVERSATION,
    )
}
/// The conversation of a coach and a student, created on first need.
fn conversation_between(db: &Connection, coach: &str, student: &str) -> Result<i64> {
    db.execute(
        "INSERT OR IGNORE INTO coach_conversations(coach_id,student_id,updated_at) VALUES(?,?,?)",
        params![coach, student, now()],
    )?;
    Ok(required(
        db,
        "SELECT id FROM coach_conversations WHERE coach_id=? AND student_id=?",
        params![coach, student],
        UNKNOWN_CONVERSATION,
    )?["id"]
        .as_i64()
        .unwrap_or(0))
}
fn unread(db: &Connection, uid: &str) -> Result<i64> {
    Ok(one(
        db,
        "SELECT count(*) n FROM coach_messages m JOIN coach_conversations cv ON cv.id=m.conversation_id
         WHERE (cv.coach_id=?1 OR cv.student_id=?1) AND m.sender_id!=?1 AND m.read_at IS NULL",
        [uid],
    )?
    .and_then(|r| r["n"].as_i64())
    .unwrap_or(0))
}
fn application_dto(row: &Value) -> Value {
    json!({
        "id": row["id"], "userId": row["user_id"], "username": row["username"], "email": row["email"],
        "events": parsed(&row["events"]), "experience": row["experience"], "message": row["message"],
        "status": row["status"], "createdAt": row["created_at"], "decidedAt": row["decided_at"],
    })
}

pub fn route(
    db: &mut Connection,
    state: &AppState,
    method: &str,
    parts: &[&str],
    query: &HashMap<String, String>,
    body: &Value,
    user: &Value,
) -> Result<Value> {
    let uid = user["id"].as_str().unwrap_or_default();
    match (method, parts) {
        ("GET", ["me"]) => {
            let application = one(
                db,
                "SELECT a.*,u.username FROM coach_applications a JOIN users u ON u.id=a.user_id WHERE a.user_id=? ORDER BY a.id DESC LIMIT 1",
                [uid],
            )?;
            Ok(json!({
                "coach": coach_row(db, uid)?.map(|c| coach_dto(&c, true)),
                "application": application.as_ref().map(application_dto),
                "unread": unread(db, uid)?,
                "iceServers": ice_servers(),
                "lengths": LENGTHS,
            }))
        }
        ("POST", ["application"]) => {
            if coach_row(db, uid)?.is_some_and(|c| flag(&c["active"])) {
                return Err(ApiError::new(409, "You are already a coach."));
            }
            if one(db, "SELECT id FROM coach_applications WHERE user_id=? AND status='pending'", [uid])?.is_some() {
                return Err(ApiError::new(409, "Your application is already being reviewed."));
            }
            let email = string(body, "email", 3, 254)?.trim().to_owned();
            let valid = email.split_once('@').is_some_and(|(name, domain)| {
                !name.is_empty() && domain.contains('.') && !domain.starts_with('.') && !domain.ends_with('.')
            }) && !email.chars().any(char::is_whitespace);
            if !valid {
                return Err(ApiError::new(422, "Enter a valid e-mail address."));
            }
            let experience = text(body, "experience", 1000)?;
            let message = text(body, "message", 2000)?;
            if message.is_empty() {
                return Err(ApiError::new(422, "Tell us a little about how you would coach."));
            }
            db.execute(
                "INSERT INTO coach_applications(user_id,email,events,experience,message,created_at) VALUES(?,?,?,?,?,?)",
                params![uid, email, json!(events(body)?).to_string(), experience, message, now()],
            )?;
            let row = required(
                db,
                "SELECT a.*,u.username FROM coach_applications a JOIN users u ON u.id=a.user_id WHERE a.id=last_insert_rowid()",
                [],
                "Unknown application",
            )?;
            Ok(application_dto(&row))
        }
        ("GET", ["coaches"]) => {
            let at = now();
            let rows = all(db, &format!("{COACH_SQL} WHERE c.active=1 ORDER BY rating IS NULL, rating DESC, sessions DESC, u.username LIMIT 200"), [at])?;
            let mut list = Vec::new();
            for row in rows {
                let slots = if flag(&row["accepting"]) {
                    free_slots(&row, &busy(db, row["user_id"].as_str().unwrap_or(""), at)?, at, HORIZON_DAYS)
                } else {
                    Vec::new()
                };
                let mut value = coach_dto(&row, false);
                value["nextSlot"] = slots.first().map_or(Value::Null, |(s, _)| json!(s));
                value["openSlots"] = json!(slots.len());
                list.push(value);
            }
            Ok(json!(list))
        }
        ("GET", ["coaches", id]) => {
            let row = coach_row(db, id)?
                .filter(|c| flag(&c["active"]) || *id == uid)
                .ok_or_else(|| ApiError::new(404, UNKNOWN_COACH))?;
            let reviews = all(
                db,
                "SELECT r.rating,r.comment,r.created_at,u.username FROM coach_reviews r JOIN users u ON u.id=r.student_id
                 WHERE r.coach_id=? ORDER BY r.created_at DESC LIMIT 100",
                [id],
            )?;
            let mut counts = [0i64; 5];
            for r in all(db, "SELECT rating,count(*) n FROM coach_reviews WHERE coach_id=? GROUP BY rating", [id])? {
                if let Some(i) = r["rating"].as_i64().filter(|v| (1..=5).contains(v)) {
                    counts[(i - 1) as usize] = r["n"].as_i64().unwrap_or(0);
                }
            }
            let mut value = coach_dto(&row, false);
            value["reviewList"] = json!(reviews.iter().map(|r| json!({"rating": r["rating"], "comment": r["comment"], "at": r["created_at"], "username": r["username"]})).collect::<Vec<_>>());
            value["ratingCounts"] = json!(counts);
            Ok(value)
        }
        ("GET", ["coaches", id, "slots"]) => {
            let row = coach_row(db, id)?.filter(|c| flag(&c["active"])).ok_or_else(|| ApiError::new(404, UNKNOWN_COACH))?;
            let days = match query.get("days") {
                None => HORIZON_DAYS,
                Some(v) => v.parse::<i64>().ok().filter(|d| (1..=HORIZON_DAYS).contains(d)).ok_or_else(ApiError::validation)?,
            };
            let at = now();
            let slots = if flag(&row["accepting"]) { free_slots(&row, &busy(db, id, at)?, at, days) } else { Vec::new() };
            Ok(json!({"timezone": row["timezone"], "sessionMinutes": row["session_minutes"], "priceCents": row["price_cents"], "accepting": flag(&row["accepting"]), "slots": slot_dto(&slots)}))
        }
        ("PUT", ["profile"]) => {
            own_coach(db, uid)?;
            let price = body.get("priceCents").map_or(Some(0), Value::as_i64).filter(|p| (0..=100_000).contains(p)).ok_or_else(ApiError::validation)?;
            let accepting = body.get("accepting").map_or(Some(true), Value::as_bool).ok_or_else(ApiError::validation)?;
            db.execute(
                "UPDATE coaches SET headline=?,bio=?,events=?,languages=?,price_cents=?,accepting=? WHERE user_id=?",
                params![
                    text(body, "headline", 80)?,
                    text(body, "bio", 2000)?,
                    json!(events(body)?).to_string(),
                    json!(words(body, "languages", 10, 24)?).to_string(),
                    price,
                    accepting as i64,
                    uid
                ],
            )?;
            Ok(coach_dto(&own_coach(db, uid)?, true))
        }
        ("PUT", ["availability"]) => {
            own_coach(db, uid)?;
            let timezone = string(body, "timezone", 1, 64)?;
            if TimeZone::get(timezone).is_err() {
                return Err(ApiError::new(422, "Unknown time zone."));
            }
            let minutes = body["sessionMinutes"].as_i64().filter(|m| LENGTHS.contains(m)).ok_or_else(ApiError::validation)?;
            let list = body["windows"].as_array().filter(|l| l.len() <= 60).ok_or_else(ApiError::validation)?;
            let mut openings = Vec::new();
            for w in list {
                let (Some(weekday), Some(start), Some(end)) = (w["weekday"].as_i64(), w["start"].as_i64(), w["end"].as_i64()) else {
                    return Err(ApiError::validation());
                };
                if !(0..=6).contains(&weekday) || start % 15 != 0 || end % 15 != 0 || !(0 <= start && start < end && end <= 1440) {
                    return Err(ApiError::validation());
                }
                openings.push(json!({"weekday": weekday, "start": start, "end": end}));
            }
            openings.sort_by_key(|w| (w["weekday"].as_i64(), w["start"].as_i64()));
            let mut off = Vec::new();
            for day in body.get("daysOff").and_then(Value::as_array).filter(|l| l.len() <= 400).ok_or_else(ApiError::validation)? {
                let day = day.as_str().and_then(|d| d.parse::<Date>().ok()).ok_or_else(ApiError::validation)?;
                off.push(day.to_string());
            }
            off.sort();
            off.dedup();
            db.execute(
                "UPDATE coaches SET timezone=?,session_minutes=?,windows=?,days_off=? WHERE user_id=?",
                params![timezone, minutes, json!(openings).to_string(), json!(off).to_string(), uid],
            )?;
            Ok(coach_dto(&own_coach(db, uid)?, true))
        }
        ("GET", ["bookings"]) => Ok(json!(
            all(db, &format!("{BOOKING_SQL} WHERE b.coach_id=?1 OR b.student_id=?1 ORDER BY b.starts_at DESC LIMIT 500"), [uid])?
                .iter()
                .map(|r| booking_dto(r, uid))
                .collect::<Vec<_>>()
        )),
        ("POST", ["bookings"]) => {
            let coach_id = string(body, "coachId", 1, 64)?;
            let start = body["start"].as_i64().ok_or_else(ApiError::validation)?;
            let note = text(body, "note", 1000)?;
            if coach_id == uid {
                return Err(ApiError::new(422, "You cannot book yourself."));
            }
            let coach = coach_row(db, coach_id)?.filter(|c| flag(&c["active"])).ok_or_else(|| ApiError::new(404, UNKNOWN_COACH))?;
            if !flag(&coach["accepting"]) {
                return Err(ApiError::new(409, "This coach is not taking bookings right now."));
            }
            let at = now();
            let Some(&(starts, ends)) = free_slots(&coach, &busy(db, coach_id, at)?, at, HORIZON_DAYS).iter().find(|(s, _)| *s == start) else {
                return Err(ApiError::new(409, "This slot is no longer available."));
            };
            if one(
                db,
                "SELECT id FROM coach_bookings WHERE (student_id=?1 OR coach_id=?1) AND status='booked' AND starts_at<?3 AND ?2<ends_at",
                params![uid, starts, ends],
            )?
            .is_some()
            {
                return Err(ApiError::new(409, "You already have a session at that time."));
            }
            let id = Uuid::new_v4().to_string();
            db.execute(
                "INSERT INTO coach_bookings(id,coach_id,student_id,starts_at,ends_at,note,price_cents,created_at) VALUES(?,?,?,?,?,?,?,?)",
                params![id, coach_id, uid, starts, ends, note, coach["price_cents"].as_i64().unwrap_or(0), at],
            )?;
            conversation_between(db, coach_id, uid)?;
            for party in [coach_id, uid] {
                state.coaching.notify(party, json!({"type": "bookings"}));
            }
            Ok(booking_dto(&booking_row(db, &id, uid)?, uid))
        }
        ("POST", ["bookings", id, "cancel"]) => {
            let row = booking_row(db, id, uid)?;
            if row["status"] != "booked" {
                return Err(ApiError::new(409, "This session is already cancelled."));
            }
            if row["ends_at"].as_i64().unwrap_or(0) <= now() {
                return Err(ApiError::new(409, "This session is over."));
            }
            db.execute(
                "UPDATE coach_bookings SET status='cancelled',cancelled_at=?,cancelled_by=? WHERE id=?",
                params![now(), uid, id],
            )?;
            for key in ["coach_id", "student_id"] {
                state.coaching.notify(row[key].as_str().unwrap_or(""), json!({"type": "bookings"}));
            }
            Ok(booking_dto(&booking_row(db, id, uid)?, uid))
        }
        ("POST", ["bookings", id, "review"]) => {
            let row = booking_row(db, id, uid)?;
            if row["student_id"].as_str() != Some(uid) {
                return Err(ApiError::new(403, "Only the student reviews a session."));
            }
            if row["status"] != "booked" || row["ends_at"].as_i64().unwrap_or(i64::MAX) > now() {
                return Err(ApiError::new(409, "You can review a session once it is over."));
            }
            let rating = body["rating"].as_i64().filter(|r| (1..=5).contains(r)).ok_or_else(ApiError::validation)?;
            let comment = text(body, "comment", 1000)?;
            db.execute(
                "INSERT INTO coach_reviews(booking_id,coach_id,student_id,rating,comment,created_at) VALUES(?,?,?,?,?,?)
                 ON CONFLICT(booking_id) DO UPDATE SET rating=excluded.rating,comment=excluded.comment,created_at=excluded.created_at",
                params![id, row["coach_id"].as_str(), uid, rating, comment, now()],
            )?;
            Ok(booking_dto(&booking_row(db, id, uid)?, uid))
        }
        ("GET", ["conversations"]) => Ok(json!(
            all(db, &format!("{CONVERSATION_SQL} WHERE cv.coach_id=?1 OR cv.student_id=?1 ORDER BY cv.updated_at DESC LIMIT 300"), [uid])?
                .iter()
                .map(|r| conversation_dto(r, uid))
                .collect::<Vec<_>>()
        )),
        ("POST", ["conversations"]) => {
            // A player opens the conversation with a coach; coaches answer in the ones opened with them.
            let coach_id = string(body, "coachId", 1, 64)?;
            if coach_id == uid {
                return Err(ApiError::new(422, "You cannot message yourself."));
            }
            coach_row(db, coach_id)?.filter(|c| flag(&c["active"])).ok_or_else(|| ApiError::new(404, UNKNOWN_COACH))?;
            let id = conversation_between(db, coach_id, uid)?;
            Ok(conversation_dto(&conversation_row(db, &id.to_string(), uid)?, uid))
        }
        ("GET", ["conversations", id, "messages"]) => {
            let conversation = conversation_row(db, id, uid)?;
            let before = match query.get("before") {
                None => i64::MAX,
                Some(v) => v.parse::<i64>().map_err(|_| ApiError::validation())?,
            };
            let mut rows = all(
                db,
                "SELECT id,sender_id,body,created_at,read_at FROM coach_messages WHERE conversation_id=? AND id<? ORDER BY id DESC LIMIT 200",
                params![conversation["id"].as_i64(), before],
            )?;
            rows.reverse();
            Ok(json!(rows.iter().map(message_dto).collect::<Vec<_>>()))
        }
        ("POST", ["conversations", id, "messages"]) => {
            let conversation = conversation_row(db, id, uid)?;
            let text = string(body, "body", 1, 2000)?.trim().to_owned();
            if text.is_empty() {
                return Err(ApiError::validation());
            }
            let at = now();
            let cid = conversation["id"].as_i64().unwrap_or(0);
            db.execute(
                "INSERT INTO coach_messages(conversation_id,sender_id,body,created_at) VALUES(?,?,?,?)",
                params![cid, uid, text, at],
            )?;
            db.execute("UPDATE coach_conversations SET updated_at=? WHERE id=?", params![at, cid])?;
            let message = message_dto(&required(
                db,
                "SELECT id,sender_id,body,created_at,read_at FROM coach_messages WHERE id=last_insert_rowid()",
                [],
                "Unknown message",
            )?);
            let event = json!({"type": "message", "conversation": cid, "message": message, "from": user["username"]});
            for key in ["coach_id", "student_id"] {
                state.coaching.notify(conversation[key].as_str().unwrap_or(""), event.clone());
            }
            Ok(message)
        }
        ("POST", ["conversations", id, "read"]) => {
            let conversation = conversation_row(db, id, uid)?;
            let cid = conversation["id"].as_i64().unwrap_or(0);
            let read = db.execute(
                "UPDATE coach_messages SET read_at=? WHERE conversation_id=? AND sender_id!=? AND read_at IS NULL",
                params![now(), cid, uid],
            )?;
            if read > 0 {
                state.coaching.notify(uid, json!({"type": "read", "conversation": cid}));
            }
            Ok(json!({"ok": true, "read": read, "unread": unread(db, uid)?}))
        }
        ("PUT", ["conversations", id, "note"]) => {
            let conversation = conversation_row(db, id, uid)?;
            if conversation["coach_id"].as_str() != Some(uid) {
                return Err(ApiError::new(403, "Only the coach keeps notes."));
            }
            db.execute(
                "UPDATE coach_conversations SET note=? WHERE id=?",
                params![text(body, "note", 4000)?, conversation["id"].as_i64()],
            )?;
            Ok(conversation_dto(&conversation_row(db, id, uid)?, uid))
        }
        ("GET", ["dashboard"]) => dashboard(db, uid),
        _ => Err(ApiError::new(404, "Not found")),
    }
}
fn message_dto(row: &Value) -> Value {
    json!({"id": row["id"], "senderId": row["sender_id"], "body": row["body"], "createdAt": row["created_at"], "readAt": row["read_at"]})
}

/// What a coach plans with: the coming weeks (sessions, hours, expected income, free slots), the next sessions and
/// every student.
fn dashboard(db: &Connection, uid: &str) -> Result<Value> {
    let coach = own_coach(db, uid)?;
    let at = now();
    let booked = all(
        db,
        &format!("{BOOKING_SQL} WHERE b.coach_id=?1 AND b.status='booked' AND b.ends_at>?2 ORDER BY b.starts_at"),
        params![uid, at],
    )?;
    let open = if flag(&coach["accepting"]) { free_slots(&coach, &busy(db, uid, at)?, at, HORIZON_DAYS) } else { Vec::new() };
    let weeks: Vec<Value> = (0..4)
        .map(|w| {
            let (from, to) = (at + w * 7 * DAY_MS, at + (w + 1) * 7 * DAY_MS);
            let sessions: Vec<&Value> = booked.iter().filter(|b| (from..to).contains(&b["starts_at"].as_i64().unwrap_or(0))).collect();
            json!({
                "from": from, "to": to, "sessions": sessions.len(),
                "minutes": sessions.iter().map(|b| (b["ends_at"].as_i64().unwrap_or(0) - b["starts_at"].as_i64().unwrap_or(0)) / MINUTE).sum::<i64>(),
                "incomeCents": sessions.iter().map(|b| b["price_cents"].as_i64().unwrap_or(0)).sum::<i64>(),
                "openSlots": open.iter().filter(|(s, _)| (from..to).contains(s)).count(),
            })
        })
        .collect();
    let students = all(
        db,
        "SELECT u.id,u.username,cv.id conversation_id,cv.note,
          (SELECT count(*) FROM coach_bookings b WHERE b.coach_id=?1 AND b.student_id=u.id AND b.status='booked' AND b.ends_at<=?2) done,
          (SELECT count(*) FROM coach_bookings b WHERE b.coach_id=?1 AND b.student_id=u.id AND b.status='booked' AND b.ends_at>?2) upcoming,
          (SELECT min(starts_at) FROM coach_bookings b WHERE b.coach_id=?1 AND b.student_id=u.id AND b.status='booked' AND b.ends_at>?2) next_at,
          (SELECT max(starts_at) FROM coach_bookings b WHERE b.coach_id=?1 AND b.student_id=u.id AND b.status='booked' AND b.ends_at<=?2) last_at,
          (SELECT avg(rating) FROM coach_reviews r WHERE r.coach_id=?1 AND r.student_id=u.id) rating,
          (SELECT count(*) FROM coach_messages m WHERE m.conversation_id=cv.id AND m.sender_id!=?1 AND m.read_at IS NULL) unread
         FROM coach_conversations cv JOIN users u ON u.id=cv.student_id WHERE cv.coach_id=?1
         ORDER BY next_at IS NULL, next_at, cv.updated_at DESC",
        params![uid, at],
    )?;
    Ok(json!({
        "coach": coach_dto(&coach, true),
        "weeks": weeks,
        "openSlots": open.len(),
        "upcoming": booked.iter().take(30).map(|b| booking_dto(b, uid)).collect::<Vec<_>>(),
        "students": students.iter().map(|s| json!({
            "id": s["id"], "username": s["username"], "conversationId": s["conversation_id"], "note": s["note"],
            "done": s["done"], "upcoming": s["upcoming"], "nextAt": s["next_at"], "lastAt": s["last_at"],
            "rating": s["rating"], "unread": s["unread"],
        })).collect::<Vec<_>>(),
    }))
}

/// The administration's view (`/api/admin/coaching`): every application, latest first, and every coach.
pub fn admin_overview(db: &Connection) -> Result<Value> {
    let applications = all(
        db,
        "SELECT a.*,u.username FROM coach_applications a JOIN users u ON u.id=a.user_id
         ORDER BY a.status!='pending', a.created_at DESC LIMIT 300",
        [],
    )?;
    let coaches = all(db, &format!("{COACH_SQL} ORDER BY c.active DESC, u.username"), [now()])?;
    let upcoming = all(
        db,
        "SELECT coach_id,count(*) n FROM coach_bookings WHERE status='booked' AND ends_at>? GROUP BY coach_id",
        [now()],
    )?;
    Ok(json!({
        "applications": applications.iter().map(application_dto).collect::<Vec<_>>(),
        "coaches": coaches.iter().map(|c| {
            let mut value = coach_dto(c, false);
            value["upcoming"] = json!(upcoming.iter().find(|u| u["coach_id"] == c["user_id"]).and_then(|u| u["n"].as_i64()).unwrap_or(0));
            value
        }).collect::<Vec<_>>(),
        "pending": applications.iter().filter(|a| a["status"] == "pending").count(),
    }))
}
/// Approves (making the account a coach) or rejects a pending application.
pub fn decide(db: &mut Connection, id: i64, approve: bool) -> Result<Value> {
    let tx = db.transaction()?;
    let application = required(&tx, "SELECT * FROM coach_applications WHERE id=?", [id], "Unknown application")?;
    if application["status"] != "pending" {
        return Err(ApiError::new(409, "This application was already answered."));
    }
    tx.execute(
        "UPDATE coach_applications SET status=?,decided_at=? WHERE id=?",
        params![if approve { "approved" } else { "rejected" }, now(), id],
    )?;
    let user = application["user_id"].as_str().unwrap_or_default().to_owned();
    if approve {
        enable(&tx, &user, application["events"].as_str())?;
    }
    tx.commit()?;
    Ok(json!({"ok": true, "userId": user}))
}
fn enable(db: &Connection, user: &str, events: Option<&str>) -> Result<()> {
    db.execute(
        "INSERT INTO coaches(user_id,events,created_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET active=1",
        params![user, events.unwrap_or("[]"), now()],
    )?;
    Ok(())
}
/// Turns an account into a coach (or back), without an application.
pub fn set_active(db: &Connection, user: &str, active: bool) -> Result<Value> {
    required(db, "SELECT id FROM users WHERE id=?", [user], "Unknown account")?;
    if active {
        enable(db, user, None)?;
    } else {
        db.execute("UPDATE coaches SET active=0 WHERE user_id=?", [user])?;
    }
    Ok(json!({"ok": true}))
}

type Outbox = mpsc::UnboundedSender<Value>;
#[derive(Default)]
struct Inner {
    /// Every open coaching socket of each account.
    sockets: HashMap<String, HashMap<Uuid, Outbox>>,
    /// Who is in each session's call: the account and the socket it joined from.
    calls: HashMap<String, Vec<(String, Uuid)>>,
}
/// The open apps and the calls under way.
#[derive(Default)]
pub struct Rooms(Mutex<Inner>);
impl Inner {
    fn send(&self, user: &str, socket: Uuid, value: Value) {
        if let Some(tx) = self.sockets.get(user).and_then(|s| s.get(&socket)) {
            let _ = tx.send(value);
        }
    }
    fn notify(&self, user: &str, value: &Value) {
        for tx in self.sockets.get(user).into_iter().flat_map(|s| s.values()) {
            let _ = tx.send(value.clone());
        }
    }
    fn leave(&mut self, booking: &str, socket: Uuid) {
        let Some(members) = self.calls.get_mut(booking) else { return };
        let Some(i) = members.iter().position(|(_, s)| *s == socket) else { return };
        let (user, _) = members.remove(i);
        let rest = members.clone();
        if rest.is_empty() {
            self.calls.remove(booking);
        }
        for (other, socket) in rest {
            self.send(&other, socket, json!({"type": "peer", "booking": booking, "present": false}));
            self.notify(&other, &json!({"type": "presence", "booking": booking, "user": user, "inCall": false}));
        }
    }
}
impl Rooms {
    /// Tells every open app of the account.
    pub fn notify(&self, user: &str, value: Value) {
        self.0.lock().unwrap().notify(user, &value);
    }
    fn add(&self, user: &str, socket: Uuid, tx: Outbox) {
        self.0.lock().unwrap().sockets.entry(user.to_owned()).or_default().insert(socket, tx);
    }
    fn remove(&self, user: &str, socket: Uuid) {
        let mut inner = self.0.lock().unwrap();
        let bookings: Vec<String> = inner
            .calls
            .iter()
            .filter(|(_, m)| m.iter().any(|(_, s)| *s == socket))
            .map(|(b, _)| b.clone())
            .collect();
        for booking in bookings {
            inner.leave(&booking, socket);
        }
        if let Some(sockets) = inner.sockets.get_mut(user) {
            sockets.remove(&socket);
            if sockets.is_empty() {
                inner.sockets.remove(user);
            }
        }
    }
    /// Enters a session's call. The same account joining from another app takes its place there; whoever is
    /// already in learns that the other party arrived, and the newcomer whether someone waits.
    fn join(&self, booking: &str, user: &str, socket: Uuid) {
        let mut inner = self.0.lock().unwrap();
        let members = inner.calls.entry(booking.to_owned()).or_default();
        let replaced: Vec<Uuid> = members.iter().filter(|(u, s)| u == user && *s != socket).map(|(_, s)| *s).collect();
        members.retain(|(u, _)| u != user);
        members.push((user.to_owned(), socket));
        let others: Vec<(String, Uuid)> = members.iter().filter(|(u, _)| u != user).cloned().collect();
        for old in replaced {
            inner.send(user, old, json!({"type": "ended", "booking": booking, "reason": "elsewhere"}));
        }
        for (other, s) in &others {
            inner.send(other, *s, json!({"type": "peer", "booking": booking, "present": true}));
        }
        inner.send(user, socket, json!({"type": "joined", "booking": booking, "peer": !others.is_empty()}));
    }
    fn leave(&self, booking: &str, socket: Uuid) {
        self.0.lock().unwrap().leave(booking, socket);
    }
    /// Passes an offer, answer or ICE candidate to the other party of the call.
    fn relay(&self, booking: &str, socket: Uuid, data: Value) {
        let inner = self.0.lock().unwrap();
        let Some(members) = inner.calls.get(booking) else { return };
        let Some((user, _)) = members.iter().find(|(_, s)| *s == socket) else { return };
        for (other, s) in members.iter().filter(|(u, _)| u != user) {
            inner.send(other, *s, json!({"type": "signal", "booking": booking, "data": data}));
        }
    }
    /// Tells the other party's apps that someone waits in the call, so they can offer to join.
    fn ring(&self, other: &str, booking: &str, from: &str) {
        self.notify(other, json!({"type": "presence", "booking": booking, "user": from, "inCall": true}));
    }
}

pub async fn upgrade(State(state): State<AppState>, ws: WebSocketUpgrade) -> Response {
    // Offers and answers carry a whole session description: a few kilobytes, rarely more than 16.
    ws.read_buffer_size(16384)
        .write_buffer_size(0)
        .max_write_buffer_size(262_144)
        .max_message_size(65536)
        .max_frame_size(65536)
        .on_upgrade(move |socket| client(state, socket))
}
async fn close(socket: &mut WebSocket, code: u16, reason: &'static str) {
    let _ = socket.send(Message::Close(Some(CloseFrame { code, reason: reason.into() }))).await;
}
/// Whether the account may be in the session's call now: one of its two parties, the session not cancelled, from a
/// quarter of an hour before it until half an hour after. Returns the other party.
async fn callable(state: &AppState, booking: String, uid: String) -> Result<String> {
    state
        .db
        .call(move |db| {
            let row = one(
                db,
                "SELECT coach_id,student_id,starts_at,ends_at,status FROM coach_bookings WHERE id=?1 AND (coach_id=?2 OR student_id=?2)",
                params![booking, uid],
            )?
            .ok_or_else(|| ApiError::new(404, UNKNOWN_BOOKING))?;
            if row["status"] != "booked" {
                return Err(ApiError::new(409, "This session was cancelled."));
            }
            let at = now();
            if at < row["starts_at"].as_i64().unwrap_or(0) - EARLY {
                return Err(ApiError::new(409, "The call opens 15 minutes before the session."));
            }
            if at > row["ends_at"].as_i64().unwrap_or(0) + LATE {
                return Err(ApiError::new(409, "This session is over."));
            }
            let other = if row["coach_id"].as_str() == Some(&uid) { &row["student_id"] } else { &row["coach_id"] };
            Ok(other.as_str().unwrap_or_default().to_owned())
        })
        .await
}
/// One open app: it signs in with its token, then hears about messages and bookings, and joins calls.
async fn client(state: AppState, mut socket: WebSocket) {
    let id = Uuid::new_v4();
    let (tx, mut rx) = mpsc::unbounded_channel::<Value>();
    let mut account: Option<(String, String)> = None;
    // A call starts with a burst of ICE candidates; then a few messages a second.
    let (mut tokens, mut at) = (200., Instant::now());
    let idle = tokio::time::sleep(Duration::from_secs(10));
    tokio::pin!(idle);
    loop {
        tokio::select! {
            _ = &mut idle => { close(&mut socket, 4001, "Idle").await; break; }
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
                    _ => { close(&mut socket, 1008, "Invalid message").await; break; }
                };
                tokens = (tokens + at.elapsed().as_secs_f64() * 20.).min(200.);
                at = Instant::now();
                if tokens < 1. { close(&mut socket, 1008, "Message rate limit exceeded").await; break; }
                tokens -= 1.;
                let Ok(body) = serde_json::from_str::<Value>(&text) else { close(&mut socket, 1008, "Invalid message").await; break };
                let kind = body["type"].as_str().unwrap_or("");
                let Some((uid, username)) = account.clone() else {
                    // The first message signs in.
                    let token = string(&body, "token", 1, 128).ok().map(|t| format!("Bearer {t}"));
                    let user = match (kind, token) {
                        ("auth", Some(token)) => state.db.call(move |db| accounts::auth(db, &token)).await.ok().flatten(),
                        _ => None,
                    };
                    let Some(user) = user.filter(|u| !u["password_hash"].is_null()) else { close(&mut socket, 4001, "Please sign in again.").await; break };
                    let uid = user["id"].as_str().unwrap_or_default().to_owned();
                    state.coaching.add(&uid, id, tx.clone());
                    account = Some((uid, user["username"].as_str().unwrap_or_default().to_owned()));
                    idle.as_mut().reset(tokio::time::Instant::now() + Duration::from_secs(60));
                    let _ = tx.send(json!({"type": "ready"}));
                    continue;
                };
                idle.as_mut().reset(tokio::time::Instant::now() + Duration::from_secs(60));
                let booking = string(&body, "booking", 1, 64).ok().map(str::to_owned);
                match (kind, booking) {
                    ("ping", _) => { let _ = tx.send(json!({"type": "pong"})); }
                    ("join", Some(booking)) => match callable(&state, booking.clone(), uid.clone()).await {
                        Ok(other) => {
                            state.coaching.join(&booking, &uid, id);
                            state.coaching.ring(&other, &booking, &username);
                        }
                        Err(error) => { let _ = tx.send(json!({"type": "ended", "booking": booking, "reason": error.message})); }
                    },
                    ("leave", Some(booking)) => state.coaching.leave(&booking, id),
                    ("signal", Some(booking)) if body["data"].is_object() => state.coaching.relay(&booking, id, body["data"].clone()),
                    _ => {}
                }
            }
        }
    }
    if let Some((uid, _)) = account {
        state.coaching.remove(&uid, id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn coach(windows: Value, off: Value, tz: &str) -> Value {
        json!({"timezone": tz, "session_minutes": 60, "windows": windows.to_string(), "days_off": off.to_string()})
    }
    fn ms(text: &str) -> i64 {
        text.parse::<Timestamp>().unwrap().as_millisecond()
    }
    #[test]
    fn slots_follow_the_coach_clock() {
        // Monday 2026-10-05 08:00 UTC; Paris is UTC+2 until 25 October, then UTC+1.
        let from = ms("2026-10-05T08:00:00Z");
        let c = coach(json!([{"weekday": 0, "start": 18 * 60, "end": 20 * 60}]), json!([]), "Europe/Paris");
        let slots = free_slots(&c, &[], from, 28);
        assert_eq!(slots[0], (ms("2026-10-05T16:00:00Z"), ms("2026-10-05T17:00:00Z")));
        assert_eq!(slots[1].0, ms("2026-10-05T17:00:00Z"));
        // After the change the same 18:00 is an hour later in UTC.
        assert!(slots.contains(&(ms("2026-10-26T17:00:00Z"), ms("2026-10-26T18:00:00Z"))));
        assert_eq!(slots.len(), 8);
    }
    #[test]
    fn notice_days_off_and_bookings_remove_slots() {
        let from = ms("2026-10-05T16:30:00Z");
        let c = coach(json!([{"weekday": 0, "start": 18 * 60, "end": 21 * 60}]), json!(["2026-10-12"]), "Europe/Paris");
        let busy = [(ms("2026-10-19T17:00:00Z"), ms("2026-10-19T18:00:00Z"))];
        let slots = free_slots(&c, &busy, from, 21);
        // 5 Oct: 18:00 and 19:00 Paris are within the hour of notice; 20:00 stays. 12 Oct is off. 19 Oct loses 19:00.
        let days: Vec<i64> = slots.iter().map(|s| s.0).collect();
        assert_eq!(days, vec![ms("2026-10-05T18:00:00Z"), ms("2026-10-19T16:00:00Z"), ms("2026-10-19T18:00:00Z")]);
    }
}
