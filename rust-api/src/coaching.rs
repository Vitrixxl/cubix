//! Coaching: players apply to coach (the administration approves them), coaches publish a profile and their weekly
//! hours, players book one of the slots those hours offer, talk with their coach and meet them in a video call.
//! Payment comes later: a booking is confirmed at once and keeps the price shown when it was made.
//!
//! The HTTP routes live under /api/coaching (`route`, run on the database thread). The socket /api/coaching/live
//! pushes chat messages and booking changes to every open app of an account, and relays the WebRTC signalling of a
//! session's call between its coach and student; the media itself goes peer to peer.
//!
//! Pictures and videos sent in a conversation are posted raw to /api/coaching/conversations/{id}/media (`upload`)
//! and kept as files beside the database; only the two parties of the conversation fetch them back (`media`).
use crate::{
    AppState, accounts,
    accounts::{DAY_MS, now},
    api::string,
    db::{all, one, required},
    error::{ApiError, Result},
};
use axum::{
    Json,
    body::{Body, Bytes},
    extract::{
        Path, State, WebSocketUpgrade,
        ws::{CloseFrame, Message, WebSocket},
    },
    http::{HeaderMap, header},
    response::{IntoResponse, Response},
};
use jiff::{Timestamp, civil::Date, tz::TimeZone};
use rusqlite::{Connection, params};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::Mutex,
    time::{Duration, Instant},
};
use tokio::sync::mpsc;
use uuid::Uuid;

const MINUTE: i64 = 60_000;
/// Slots are offered from an hour ahead, four weeks out.
const NOTICE: i64 = 60 * MINUTE;
const HORIZON_DAYS: i64 = 28;
const CANCELLATION_POLICY: &str = "24h-v1";
const CANCELLATION_ERROR: &str = "Sessions cannot be cancelled in the final 24 hours before they start.";
fn cancellation_open(starts_at: i64, at: i64) -> bool {
    starts_at.saturating_sub(at) > DAY_MS
}
/// The session lengths a coach may choose, in minutes.
pub const LENGTHS: [i64; 5] = [30, 45, 60, 90, 120];
/// The call opens a quarter of an hour before the session and stays open half an hour after it.
const EARLY: i64 = 15 * MINUTE;
const LATE: i64 = 30 * MINUTE;
const UNKNOWN_COACH: &str = "Unknown coach";
const UNKNOWN_BOOKING: &str = "Unknown session";
const UNKNOWN_CONVERSATION: &str = "Unknown conversation";
const UNKNOWN_MEDIA: &str = "Unknown picture or video";
/// The largest video a message carries; pictures stop at `IMAGE_MAX`.
pub const MEDIA_MAX: usize = 64 * 1024 * 1024;
const IMAGE_MAX: usize = 10 * 1024 * 1024;

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
const COACH_SQL: &str = "SELECT c.*,u.username,u.avatar,
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
        "students": row["students"], "since": row["created_at"], "avatar": avatar_url(&row["avatar"]),
        "newStudents": flag(&row["new_students"]),
    });
    if own {
        value["windows"] = parsed(&row["windows"]);
        value["daysOff"] = parsed(&row["days_off"]);
        value["overrides"] = parsed(&row["overrides"]);
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

/// One weekly opening: a weekday (0 = Monday) and minutes of the day, repeated from `from` until `until` (the whole
/// days, both included) or for good.
struct Window {
    weekday: i8,
    start: i64,
    end: i64,
    from: Option<Date>,
    until: Option<Date>,
}
fn date(value: &Value) -> Option<Date> {
    value.as_str().and_then(|d| d.parse().ok())
}
/// `start` and `end` of an hour range: quarter hours of one day, the end after the start.
fn minutes_of_day(value: &Value) -> Option<(i64, i64)> {
    let (start, end) = (value["start"].as_i64()?, value["end"].as_i64()?);
    (start % 15 == 0 && end % 15 == 0 && 0 <= start && start < end && end <= 1440).then_some((start, end))
}
/// A date given as YYYY-MM-DD, or nothing when the key is absent or null.
fn optional_date(value: &Value, key: &str) -> Result<Option<Date>> {
    match &value[key] {
        Value::Null => Ok(None),
        other => date(other).map(Some).ok_or_else(ApiError::validation),
    }
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
                        from: date(&w["from"]),
                        until: date(&w["until"]),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}
/// One day's exception to the weekly hours: extra hours (`open`) or hours taken back, in minutes of that day.
struct Override {
    date: Date,
    start: i64,
    end: i64,
    open: bool,
}
fn overrides(coach: &Value) -> Vec<Override> {
    parsed(&coach["overrides"])
        .as_array()
        .map(|list| {
            list.iter()
                .filter_map(|o| Some(Override { date: date(&o["date"])?, start: o["start"].as_i64()?, end: o["end"].as_i64()?, open: o["open"].as_bool()? }))
                .collect()
        })
        .unwrap_or_default()
}
/// The hours a coach is open on a day, in minutes of that day, sorted and apart: the weekly openings in force that
/// day and its extra hours, less the hours taken back. None on a day off.
fn hours_on(day: Date, openings: &[Window], changes: &[Override], off: &HashSet<String>) -> Vec<(i64, i64)> {
    if off.contains(&day.to_string()) {
        return Vec::new();
    }
    let weekday = day.weekday().to_monday_zero_offset();
    let mut open: Vec<(i64, i64)> = openings
        .iter()
        .filter(|w| w.weekday == weekday && w.from.is_none_or(|f| f <= day) && w.until.is_none_or(|u| day <= u))
        .map(|w| (w.start, w.end))
        .chain(changes.iter().filter(|o| o.open && o.date == day).map(|o| (o.start, o.end)))
        .collect();
    open.sort_unstable();
    let mut merged: Vec<(i64, i64)> = Vec::new();
    for (s, e) in open {
        match merged.last_mut() {
            Some(last) if s <= last.1 => last.1 = last.1.max(e),
            _ => merged.push((s, e)),
        }
    }
    for o in changes.iter().filter(|o| !o.open && o.date == day) {
        merged = merged
            .into_iter()
            .flat_map(|(s, e)| [(s, e.min(o.start)), (s.max(o.end), e)])
            .filter(|(s, e)| s < e)
            .collect();
    }
    merged
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
/// The free slots of a coach from `from` for `days` days: each day's open hours (`hours_on`), cut into sessions, on
/// the coach's own clock (so a change of daylight saving time keeps their hours), minus booked sessions and anything
/// sooner than the notice. Sorted, as `(start, end)` in milliseconds.
pub(crate) fn free_slots(coach: &Value, busy: &[(i64, i64)], from: i64, days: i64) -> Vec<(i64, i64)> {
    let Ok(tz) = TimeZone::get(coach["timezone"].as_str().unwrap_or("UTC")) else { return Vec::new() };
    let Ok(start) = Timestamp::from_millisecond(from) else { return Vec::new() };
    let minutes = coach["session_minutes"].as_i64().filter(|m| LENGTHS.contains(m)).unwrap_or(60);
    let openings = windows(coach);
    let changes = overrides(coach);
    let off: HashSet<String> = parsed(&coach["days_off"])
        .as_array()
        .map(|l| l.iter().filter_map(|d| d.as_str().map(str::to_owned)).collect())
        .unwrap_or_default();
    let (earliest, latest) = (from + NOTICE, from + days * DAY_MS);
    let mut day = start.to_zoned(tz.clone()).date();
    let mut out = Vec::new();
    for _ in 0..=days {
        for (start, end) in hours_on(day, &openings, &changes, &off) {
            let mut m = start;
            while m + minutes <= end {
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

const BOOKING_SQL: &str = "SELECT b.*,cu.username coach_name,su.username student_name,cu.avatar coach_avatar,su.avatar student_avatar,r.rating,r.comment review_comment,
 cv.id conversation_id FROM coach_bookings b JOIN users cu ON cu.id=b.coach_id JOIN users su ON su.id=b.student_id
 LEFT JOIN coach_reviews r ON r.booking_id=b.id
 LEFT JOIN coach_conversations cv ON cv.coach_id=b.coach_id AND cv.student_id=b.student_id";
/// The other party of a session or a conversation row (with `coach_*` and `student_*` columns).
fn party(row: &Value, uid: &str) -> Value {
    let other = if row["coach_id"].as_str() == Some(uid) { "student" } else { "coach" };
    json!({"id": row[&format!("{other}_id")], "username": row[&format!("{other}_name")], "avatar": avatar_url(&row[&format!("{other}_avatar")])})
}
/// A session as one of its two parties sees it.
fn booking_dto(row: &Value, uid: &str) -> Value {
    let coach = row["coach_id"].as_str() == Some(uid);
    json!({
        "id": row["id"], "role": if coach { "coach" } else { "student" },
        "coachId": row["coach_id"], "coachName": row["coach_name"],
        "studentId": row["student_id"], "studentName": row["student_name"],
        "with": party(row, uid),
        "startsAt": row["starts_at"], "endsAt": row["ends_at"], "status": row["status"], "note": row["note"],
        "priceCents": row["price_cents"], "createdAt": row["created_at"], "cancelledAt": row["cancelled_at"],
        "cancelledByMe": row["cancelled_by"].as_str() == Some(uid),
        "review": if row["rating"].is_null() { Value::Null } else { json!({"rating": row["rating"], "comment": row["review_comment"]}) },
        "conversationId": row["conversation_id"],
        "proposal": if row["proposed_start"].is_null() { Value::Null } else { json!({"start": row["proposed_start"], "end": row["proposed_end"]}) },
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

const CONVERSATION_SQL: &str = "SELECT cv.*,cu.username coach_name,su.username student_name,cu.avatar coach_avatar,su.avatar student_avatar,
 last.body last_body,last.created_at last_at,last.sender_id last_sender,last.media_type last_media,
 (SELECT count(*) FROM coach_messages m WHERE m.conversation_id=cv.id AND m.sender_id!=?1 AND m.read_at IS NULL) unread,
 EXISTS(SELECT 1 FROM coach_bookings b WHERE b.coach_id=cv.coach_id AND b.student_id=cv.student_id) booked
 FROM coach_conversations cv JOIN users cu ON cu.id=cv.coach_id JOIN users su ON su.id=cv.student_id
 LEFT JOIN coach_messages last ON last.id=(SELECT m.id FROM coach_messages m WHERE m.conversation_id=cv.id ORDER BY m.id DESC LIMIT 1)";
fn conversation_dto(row: &Value, uid: &str) -> Value {
    let coach = row["coach_id"].as_str() == Some(uid);
    json!({
        "id": row["id"], "role": if coach { "coach" } else { "student" },
        "coachId": row["coach_id"], "studentId": row["student_id"],
        "with": party(row, uid),
        "lastMessage": if row["last_at"].is_null() { Value::Null } else { json!({"body": row["last_body"], "media": row["last_media"], "at": row["last_at"], "mine": row["last_sender"].as_str() == Some(uid)}) },
        "unread": row["unread"], "updatedAt": row["updated_at"],
        // Messages open once the student booked the coach.
        "open": flag(&row["booked"]),
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
                value["practice"] = practice(db, row["user_id"].as_str().unwrap_or(""), 1)?;
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
            value["practice"] = practice(db, id, 6)?;
            value["history"] = history(db, id)?;
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
            // Someone new sees no slot while the coach keeps to the students they have.
            let welcome = flag(&row["new_students"]) || coached(db, id, uid)?;
            let slots = if welcome { slots } else { Vec::new() };
            Ok(json!({"timezone": row["timezone"], "sessionMinutes": row["session_minutes"], "priceCents": row["price_cents"], "accepting": flag(&row["accepting"]), "welcome": welcome, "slots": slot_dto(&slots)}))
        }
        ("PUT", ["profile"]) => {
            own_coach(db, uid)?;
            let price = body.get("priceCents").map_or(Some(0), Value::as_i64).filter(|p| (0..=100_000).contains(p)).ok_or_else(ApiError::validation)?;
            let accepting = body.get("accepting").map_or(Some(true), Value::as_bool).ok_or_else(ApiError::validation)?;
            let newcomers = body.get("newStudents").map_or(Some(true), Value::as_bool).ok_or_else(ApiError::validation)?;
            db.execute(
                "UPDATE coaches SET headline=?,bio=?,events=?,languages=?,price_cents=?,accepting=?,new_students=? WHERE user_id=?",
                params![
                    text(body, "headline", 80)?,
                    text(body, "bio", 2000)?,
                    json!(events(body)?).to_string(),
                    json!(words(body, "languages", 10, 24)?).to_string(),
                    price,
                    accepting as i64,
                    newcomers as i64,
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
            let list = body["windows"].as_array().filter(|l| l.len() <= 200).ok_or_else(ApiError::validation)?;
            let mut openings = Vec::new();
            for w in list {
                let (Some(weekday), Some((start, end))) = (w["weekday"].as_i64(), minutes_of_day(w)) else {
                    return Err(ApiError::validation());
                };
                let (from, until) = (optional_date(w, "from")?, optional_date(w, "until")?);
                if !(0..=6).contains(&weekday) || from.zip(until).is_some_and(|(f, u)| f > u) {
                    return Err(ApiError::validation());
                }
                let mut opening = json!({"weekday": weekday, "start": start, "end": end});
                if let Some(f) = from {
                    opening["from"] = json!(f.to_string());
                }
                if let Some(u) = until {
                    opening["until"] = json!(u.to_string());
                }
                openings.push(opening);
            }
            openings.sort_by_key(|w| (w["weekday"].as_i64(), w["start"].as_i64()));
            let mut changes = Vec::new();
            for o in body.get("overrides").and_then(Value::as_array).map(Vec::as_slice).unwrap_or_default().iter().take(1000) {
                let (Some(day), Some((start, end)), Some(open)) = (date(&o["date"]), minutes_of_day(o), o["open"].as_bool()) else {
                    return Err(ApiError::validation());
                };
                changes.push(json!({"date": day.to_string(), "start": start, "end": end, "open": open}));
            }
            changes.sort_by(|a, b| (a["date"].as_str(), a["start"].as_i64()).cmp(&(b["date"].as_str(), b["start"].as_i64())));
            let mut off = Vec::new();
            for day in body.get("daysOff").and_then(Value::as_array).filter(|l| l.len() <= 400).ok_or_else(ApiError::validation)? {
                let day = day.as_str().and_then(|d| d.parse::<Date>().ok()).ok_or_else(ApiError::validation)?;
                off.push(day.to_string());
            }
            off.sort();
            off.dedup();
            db.execute(
                "UPDATE coaches SET timezone=?,session_minutes=?,windows=?,days_off=?,overrides=? WHERE user_id=?",
                params![timezone, minutes, json!(openings).to_string(), json!(off).to_string(), json!(changes).to_string(), uid],
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
            if body["cancellationPolicy"].as_str() != Some(CANCELLATION_POLICY) {
                return Err(ApiError::new(422, "Please read and accept the cancellation policy before booking."));
            }
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
            if !flag(&coach["new_students"]) && !coached(db, coach_id, uid)? {
                return Err(ApiError::new(403, format!("{} is not taking new students right now.", coach["username"].as_str().unwrap_or("This coach"))));
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
                "INSERT INTO coach_bookings(id,coach_id,student_id,starts_at,ends_at,note,price_cents,created_at,cancellation_policy,cancellation_policy_accepted_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                params![id, coach_id, uid, starts, ends, note, coach["price_cents"].as_i64().unwrap_or(0), at, CANCELLATION_POLICY, at],
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
            let at = now();
            if row["ends_at"].as_i64().unwrap_or(0) <= at {
                return Err(ApiError::new(409, "This session is over."));
            }
            if !cancellation_open(row["starts_at"].as_i64().unwrap_or(0), at) {
                return Err(ApiError::new(409, CANCELLATION_ERROR));
            }
            db.execute(
                "UPDATE coach_bookings SET status='cancelled',cancelled_at=?,cancelled_by=?,proposed_start=NULL,proposed_end=NULL WHERE id=?",
                params![at, uid, id],
            )?;
            for key in ["coach_id", "student_id"] {
                state.coaching.notify(row[key].as_str().unwrap_or(""), json!({"type": "bookings"}));
            }
            Ok(booking_dto(&booking_row(db, id, uid)?, uid))
        }
        ("POST", ["bookings", id, "propose"]) => {
            // The coach offers another time for a coming session (or takes the offer back with `start: null`).
            let row = booking_row(db, id, uid)?;
            if row["coach_id"].as_str() != Some(uid) {
                return Err(ApiError::new(403, "Only the coach offers another time."));
            }
            if row["status"] != "booked" || row["ends_at"].as_i64().unwrap_or(0) <= now() {
                return Err(ApiError::new(409, "This session can no longer be moved."));
            }
            let proposal = match body.get("start") {
                None | Some(Value::Null) => None,
                Some(start) => {
                    let start = start.as_i64().ok_or_else(ApiError::validation)?;
                    let end = start + row["ends_at"].as_i64().unwrap_or(0) - row["starts_at"].as_i64().unwrap_or(0);
                    if start < now() + NOTICE {
                        return Err(ApiError::new(422, "Offer a time at least an hour from now."));
                    }
                    if start == row["starts_at"].as_i64().unwrap_or(0) {
                        return Err(ApiError::new(422, "That is the time of the session already."));
                    }
                    clash(db, &row, start, end)?;
                    Some((start, end))
                }
            };
            db.execute(
                "UPDATE coach_bookings SET proposed_start=?,proposed_end=? WHERE id=?",
                params![proposal.map(|p| p.0), proposal.map(|p| p.1), id],
            )?;
            for key in ["coach_id", "student_id"] {
                state.coaching.notify(row[key].as_str().unwrap_or(""), json!({"type": "bookings"}));
            }
            Ok(booking_dto(&booking_row(db, id, uid)?, uid))
        }
        ("POST", ["bookings", id, "answer"]) => {
            // The student takes the time the coach offered, or keeps the session where it was.
            let row = booking_row(db, id, uid)?;
            if row["student_id"].as_str() != Some(uid) {
                return Err(ApiError::new(403, "Only the student answers an offer."));
            }
            let (Some(start), Some(end)) = (row["proposed_start"].as_i64(), row["proposed_end"].as_i64()) else {
                return Err(ApiError::new(409, "The coach took this offer back."));
            };
            if row["status"] != "booked" {
                return Err(ApiError::new(409, "This session is cancelled."));
            }
            let accept = body["accept"].as_bool().ok_or_else(ApiError::validation)?;
            if accept {
                if start <= now() {
                    return Err(ApiError::new(409, "This time has passed."));
                }
                clash(db, &row, start, end)?;
                db.execute(
                    "UPDATE coach_bookings SET starts_at=?,ends_at=?,proposed_start=NULL,proposed_end=NULL WHERE id=?",
                    params![start, end, id],
                )?;
            } else {
                db.execute("UPDATE coach_bookings SET proposed_start=NULL,proposed_end=NULL WHERE id=?", [id])?;
            }
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
            // A player who booked a coach (even a session cancelled since) opens their conversation; coaches answer in the
            // ones opened with them.
            let coach_id = string(body, "coachId", 1, 64)?;
            if coach_id == uid {
                return Err(ApiError::new(422, "You cannot message yourself."));
            }
            let coach = coach_row(db, coach_id)?.filter(|c| flag(&c["active"])).ok_or_else(|| ApiError::new(404, UNKNOWN_COACH))?;
            if !coached(db, coach_id, uid)? {
                return Err(ApiError::new(403, format!("Book a session with {} to write to them.", coach["username"].as_str().unwrap_or("this coach"))));
            }
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
                &format!("SELECT {MESSAGE_COLUMNS} FROM coach_messages WHERE conversation_id=? AND id<? ORDER BY id DESC LIMIT 200"),
                params![conversation["id"].as_i64(), before],
            )?;
            rows.reverse();
            Ok(json!(rows.iter().map(message_dto).collect::<Vec<_>>()))
        }
        ("POST", ["conversations", id, "messages"]) => {
            let conversation = writable(db, id, uid)?;
            let text = string(body, "body", 1, 2000)?.trim().to_owned();
            if text.is_empty() {
                return Err(ApiError::validation());
            }
            post(db, state, &conversation, user, &text, None)
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
                params![text(body, "note", 20000)?, conversation["id"].as_i64()],
            )?;
            Ok(conversation_dto(&conversation_row(db, id, uid)?, uid))
        }
        ("GET", ["dashboard"]) => dashboard(db, uid),
        ("GET", ["people", id]) => person(db, uid, id),
        _ => Err(ApiError::new(404, "Not found")),
    }
}
const MESSAGE_COLUMNS: &str = "id,sender_id,body,created_at,read_at,media_id,media_type,media_size,media_name";
fn message_dto(row: &Value) -> Value {
    let media = if row["media_id"].is_null() {
        Value::Null
    } else {
        json!({"id": row["media_id"], "type": row["media_type"], "size": row["media_size"], "name": row["media_name"]})
    };
    json!({"id": row["id"], "senderId": row["sender_id"], "body": row["body"], "createdAt": row["created_at"], "readAt": row["read_at"], "media": media})
}
/// A picture or a video attached to a message: its file's name under `media_dir`, type, size and original name.
struct Media {
    id: String,
    kind: &'static str,
    size: usize,
    name: String,
}
/// Adds a message to the conversation and brings it to the open apps of both parties.
fn post(db: &Connection, state: &AppState, conversation: &Value, user: &Value, text: &str, media: Option<&Media>) -> Result<Value> {
    let at = now();
    let cid = conversation["id"].as_i64().unwrap_or(0);
    db.execute(
        "INSERT INTO coach_messages(conversation_id,sender_id,body,created_at,media_id,media_type,media_size,media_name) VALUES(?,?,?,?,?,?,?,?)",
        params![cid, user["id"].as_str(), text, at, media.map(|m| &m.id), media.map(|m| m.kind), media.map(|m| m.size as i64), media.map(|m| &m.name)],
    )?;
    db.execute("UPDATE coach_conversations SET updated_at=? WHERE id=?", params![at, cid])?;
    let message = message_dto(&required(
        db,
        &format!("SELECT {MESSAGE_COLUMNS} FROM coach_messages WHERE id=last_insert_rowid()"),
        [],
        "Unknown message",
    )?);
    let event = json!({"type": "message", "conversation": cid, "message": message, "from": user["username"]});
    for key in ["coach_id", "student_id"] {
        state.coaching.notify(conversation[key].as_str().unwrap_or(""), event.clone());
    }
    Ok(message)
}

/// `CUBIX_MEDIA_DIR`, or a `coaching-media` directory beside the SQLite database, so the files outlive the container.
fn media_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("CUBIX_MEDIA_DIR").filter(|d| !d.is_empty()) {
        return PathBuf::from(dir);
    }
    let db = std::env::var("CUBIX_DB").unwrap_or_else(|_| "cubix.db".into());
    PathBuf::from(db).parent().map(|p| p.join("coaching-media")).unwrap_or_else(|| PathBuf::from("coaching-media"))
}
/// The type of a picture or a video, read from its first bytes rather than taken from the sender's word.
fn sniff(bytes: &[u8]) -> Option<&'static str> {
    let at = |offset: usize, magic: &[u8]| bytes.get(offset..offset + magic.len()) == Some(magic);
    Some(if at(0, b"\xFF\xD8\xFF") {
        "image/jpeg"
    } else if at(0, b"\x89PNG\r\n\x1a\n") {
        "image/png"
    } else if at(0, b"GIF87a") || at(0, b"GIF89a") {
        "image/gif"
    } else if at(0, b"RIFF") && at(8, b"WEBP") {
        "image/webp"
    } else if at(4, b"ftypavif") {
        "image/avif"
    } else if at(4, b"ftypqt  ") {
        "video/quicktime"
    } else if at(4, b"ftyp") && !(at(8, b"heic") || at(8, b"heix") || at(8, b"mif1") || at(8, b"msf1")) {
        "video/mp4"
    } else if at(0, b"\x1A\x45\xDF\xA3") {
        "video/webm"
    } else {
        return None;
    })
}
/// The account of an `Authorization: Bearer …` header.
fn signed_in(db: &Connection, headers: &HeaderMap) -> Result<Value> {
    let authorization = headers.get(header::AUTHORIZATION).and_then(|v| v.to_str().ok()).unwrap_or("");
    accounts::auth(db, authorization)?
        .filter(|u| !u["password_hash"].is_null())
        .ok_or_else(|| ApiError::new(401, "Please sign in again."))
}
/// `POST /api/coaching/conversations/{id}/media`: a picture or a video as the whole body, sent as a message of its own.
/// Its original name may come URI-encoded in `X-File-Name`.
pub async fn upload(State(state): State<AppState>, Path(id): Path<String>, headers: HeaderMap, bytes: Bytes) -> Response {
    send_media(state, id, headers, bytes).await.map(Json).into_response()
}
async fn send_media(state: AppState, id: String, headers: HeaderMap, bytes: Bytes) -> Result<Value> {
    let kind = sniff(&bytes).ok_or_else(|| ApiError::new(415, "Send a picture (JPEG, PNG, GIF, WebP, AVIF) or a video (MP4, MOV, WebM)."))?;
    if kind.starts_with("image/") && bytes.len() > IMAGE_MAX {
        return Err(ApiError::new(413, "Pictures are limited to 10 MB."));
    }
    let name: String = headers
        .get("x-file-name")
        .and_then(|v| v.to_str().ok())
        .map(|v| percent_encoding::percent_decode_str(v).decode_utf8_lossy().trim().chars().filter(|c| !c.is_control()).take(120).collect())
        .unwrap_or_default();
    // Only a party to the conversation leaves a file on the disk.
    let (user, conversation) = state
        .db
        .call(move |db| {
            let user = signed_in(db, &headers)?;
            let conversation = writable(db, &id, user["id"].as_str().unwrap_or(""))?;
            Ok((user, conversation))
        })
        .await?;
    let media = Media { id: Uuid::new_v4().to_string(), kind, size: bytes.len(), name };
    let dir = media_dir();
    tokio::fs::create_dir_all(&dir).await.map_err(ApiError::internal)?;
    let path = dir.join(&media.id);
    tokio::fs::write(&path, &bytes).await.map_err(ApiError::internal)?;
    let copy = state.clone();
    let sent = state.db.call(move |db| post(db, &copy, &conversation, &user, "", Some(&media))).await;
    if sent.is_err() {
        let _ = tokio::fs::remove_file(&path).await;
    }
    sent
}
/// `GET /api/coaching/media/{id}`: a picture or a video of a conversation, for its two parties only.
pub async fn media(State(state): State<AppState>, Path(id): Path<String>, headers: HeaderMap) -> Response {
    let found = async {
        // A UUID names the file: nothing else reaches the disk.
        let id = Uuid::parse_str(&id).map_err(|_| ApiError::new(404, UNKNOWN_MEDIA))?.to_string();
        let key = id.clone();
        let kind = state
            .db
            .call(move |db| {
                let user = signed_in(db, &headers)?;
                let row = required(
                    db,
                    "SELECT m.media_type FROM coach_messages m JOIN coach_conversations cv ON cv.id=m.conversation_id
                     WHERE m.media_id=?1 AND (cv.coach_id=?2 OR cv.student_id=?2)",
                    params![key, user["id"].as_str()],
                    UNKNOWN_MEDIA,
                )?;
                Ok(row["media_type"].as_str().unwrap_or("application/octet-stream").to_owned())
            })
            .await?;
        let file = tokio::fs::File::open(media_dir().join(&id)).await.map_err(|_| ApiError::new(404, UNKNOWN_MEDIA))?;
        let size = file.metadata().await.map_err(ApiError::internal)?.len();
        Ok::<_, ApiError>((
            [(header::CONTENT_TYPE, kind), (header::CONTENT_LENGTH, size.to_string()), (header::X_CONTENT_TYPE_OPTIONS, "nosniff".into())],
            Body::from_stream(tokio_util::io::ReaderStream::new(file)),
        ))
    };
    found.await.into_response()
}
/// `CUBIX_AVATAR_DIR`, or an `avatars` directory beside the SQLite database.
fn avatar_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("CUBIX_AVATAR_DIR").filter(|d| !d.is_empty()) {
        return PathBuf::from(dir);
    }
    media_dir().with_file_name("avatars")
}
const AVATAR_MAX: usize = 2 * 1024 * 1024;
/// `PUT /api/coaching/avatar`: the account's picture as the whole body (the app sends it square and small);
/// `DELETE` takes it away. Answers the new picture's address.
pub async fn set_avatar(State(state): State<AppState>, method: axum::http::Method, headers: HeaderMap, bytes: Bytes) -> Response {
    replace_avatar(state, method == axum::http::Method::DELETE, headers, bytes).await.map(Json).into_response()
}
async fn replace_avatar(state: AppState, remove: bool, headers: HeaderMap, bytes: Bytes) -> Result<Value> {
    let file = if remove {
        None
    } else {
        let kind = sniff(&bytes).filter(|k| k.starts_with("image/") && *k != "image/gif").ok_or_else(|| ApiError::new(415, "Use a JPEG, PNG, WebP or AVIF picture."))?;
        if bytes.len() > AVATAR_MAX {
            return Err(ApiError::new(413, "Pictures are limited to 2 MB."));
        }
        // The type travels in the name, so serving it needs no lookup.
        Some(format!("{}.{}", Uuid::new_v4(), kind.trim_start_matches("image/")))
    };
    let user = state.db.call(move |db| signed_in(db, &headers)).await?;
    let dir = avatar_dir();
    if let Some(name) = &file {
        tokio::fs::create_dir_all(&dir).await.map_err(ApiError::internal)?;
        tokio::fs::write(dir.join(name), &bytes).await.map_err(ApiError::internal)?;
    }
    let uid = user["id"].as_str().unwrap_or_default().to_owned();
    let stored = file.clone();
    state.db.call(move |db| Ok(db.execute("UPDATE users SET avatar=? WHERE id=?", params![stored, uid])?)).await?;
    if let Some(old) = user["avatar"].as_str() {
        let _ = tokio::fs::remove_file(dir.join(old)).await;
    }
    Ok(json!({"avatar": avatar_url(&json!(file))}))
}
/// Removes an account's picture file (the account is going).
pub(crate) async fn forget_avatar(file: &str) {
    if !file.contains(['/', '\\']) {
        let _ = tokio::fs::remove_file(avatar_dir().join(file)).await;
    }
}
/// `GET /api/avatars/{file}`: a picture of an account, for anyone signed in or not, like its username.
pub async fn avatar(Path(file): Path<String>) -> Response {
    let found = async {
        let (id, ext) = file.split_once('.').ok_or_else(|| ApiError::new(404, "Unknown picture"))?;
        let kind = match ext {
            "jpeg" => "image/jpeg",
            "png" => "image/png",
            "webp" => "image/webp",
            "avif" => "image/avif",
            _ => return Err(ApiError::new(404, "Unknown picture")),
        };
        Uuid::parse_str(id).map_err(|_| ApiError::new(404, "Unknown picture"))?;
        let bytes = tokio::fs::read(avatar_dir().join(&file)).await.map_err(|_| ApiError::new(404, "Unknown picture"))?;
        Ok::<_, ApiError>(([(header::CONTENT_TYPE, kind), (header::X_CONTENT_TYPE_OPTIONS, "nosniff")], bytes))
    };
    found.await.into_response()
}
/// Removes the files no message refers to any more: their conversation or one of its parties went.
pub fn sweep_media(db: &Connection) -> Result<()> {
    let Ok(entries) = std::fs::read_dir(media_dir()) else { return Ok(()) };
    let mut kept = db.prepare("SELECT 1 FROM coach_messages WHERE media_id=?")?;
    for entry in entries.flatten() {
        let name = entry.file_name();
        if let Some(name) = name.to_str()
            && Uuid::parse_str(name).is_ok()
            && !kept.exists([name])?
        {
            let _ = std::fs::remove_file(entry.path());
        }
    }
    Ok(())
}

/// Someone the caller coaches or is coached by: who they are, the sessions they had together, the coach's notes
/// (for the coach only) and how they practise: timer solves per puzzle with the best single and the last Ao5.
fn person(db: &Connection, uid: &str, id: &str) -> Result<Value> {
    let conversation = one(
        db,
        "SELECT * FROM coach_conversations WHERE (coach_id=?1 AND student_id=?2) OR (coach_id=?2 AND student_id=?1)",
        params![uid, id],
    )?
    .ok_or_else(|| ApiError::new(404, "Unknown person"))?;
    let user = required(db, "SELECT id,username,avatar,created_at FROM users WHERE id=?", [id], "Unknown person")?;
    let coach = conversation["coach_id"].as_str() == Some(uid);
    let sessions: Vec<Value> = all(
        db,
        &format!("{BOOKING_SQL} WHERE (b.coach_id=?1 AND b.student_id=?2) OR (b.coach_id=?2 AND b.student_id=?1) ORDER BY b.starts_at DESC LIMIT 100"),
        params![uid, id],
    )?
    .iter()
    .map(|b| booking_dto(b, uid))
    .collect();
    Ok(json!({
        "id": user["id"], "username": user["username"], "since": user["created_at"], "avatar": avatar_url(&user["avatar"]),
        "role": if coach { "student" } else { "coach" }, "conversationId": conversation["id"],
        "note": if coach { conversation["note"].clone() } else { Value::Null },
        "sessions": sessions,
        "practice": practice(db, id, 6)?,
        "history": history(db, id)?,
    }))
}

/// What the coach follows a student's progress with: their solves per day over the last 53 weeks, their last 50 timer
/// solves per puzzle (oldest first, null for a DNF) with the last Ao12, and the cases they learned.
fn history(db: &Connection, id: &str) -> Result<Value> {
    let since = Timestamp::from_millisecond(now() - 371 * DAY_MS).map(|t| t.to_string()).unwrap_or_default();
    let days: Vec<Value> = all(
        db,
        "SELECT substr(created_at,1,10) day,count(*) n FROM solves WHERE user_id=? AND created_at>=? GROUP BY day ORDER BY day",
        params![id, since],
    )?
    .iter()
    .map(|r| json!([r["day"], r["n"]]))
    .collect();
    let mut puzzles = serde_json::Map::new();
    for row in all(db, "SELECT DISTINCT puzzle_id FROM solves WHERE user_id=? AND case_id IS NULL AND solve_mode='standard'", [id])? {
        let puzzle = row["puzzle_id"].as_str().unwrap_or_default();
        if !crate::practice::is_puzzle(puzzle) {
            continue;
        }
        let mut recent: Vec<Option<f64>> = all(
            db,
            "SELECT time_ms,penalty FROM solves WHERE user_id=? AND case_id IS NULL AND solve_mode='standard' AND puzzle_id=? ORDER BY created_at DESC,id DESC LIMIT 50",
            params![id, puzzle],
        )?
        .iter()
        .map(crate::stats::effective)
        .collect();
        let ao12 = if recent.len() >= 12 { crate::stats::average(&recent[..12]) } else { None };
        recent.reverse();
        puzzles.insert(puzzle.to_owned(), json!({"ao12": ao12, "recent": recent}));
    }
    let learned: Vec<Value> = all(db, "SELECT case_id FROM learned_cases WHERE user_id=? AND learned=1", [id])?.iter().map(|r| r["case_id"].clone()).collect();
    Ok(json!({"days": days, "puzzles": puzzles, "learned": learned}))
}

/// How someone practises: their solves, the days they solved on this month, the cases they learned, and their timer
/// solves per puzzle (the `top` most solved) with the best single and the last Ao5. A best time they gave at sign-up
/// stands while no solve beats it.
fn practice(db: &Connection, id: &str, top: i64) -> Result<Value> {
    let effective = crate::stats::EFFECTIVE_MS_SQL;
    let month_ago = Timestamp::from_millisecond(now() - 30 * DAY_MS).map(|t| t.to_string()).unwrap_or_default();
    let totals = required(
        db,
        "SELECT count(*) solves, count(DISTINCT CASE WHEN created_at>=?2 THEN substr(created_at,1,10) END) active_days, max(created_at) last_at
         FROM solves WHERE user_id=?1",
        params![id, month_ago],
        "Unknown person",
    )?;
    let declared = crate::journey::declared_bests(db, id)?;
    let mut puzzles = Vec::new();
    for row in all(
        db,
        &format!("SELECT puzzle_id,count(*) solves,min({effective}) best FROM solves WHERE user_id=? AND case_id IS NULL AND solve_mode='standard' GROUP BY puzzle_id ORDER BY solves DESC LIMIT ?"),
        params![id, top],
    )? {
        let puzzle = row["puzzle_id"].as_str().unwrap_or_default();
        if !crate::practice::is_puzzle(puzzle) {
            continue;
        }
        let last: Vec<Option<f64>> = all(
            db,
            "SELECT time_ms,penalty FROM solves WHERE user_id=? AND case_id IS NULL AND solve_mode='standard' AND puzzle_id=? ORDER BY created_at DESC,id DESC LIMIT 5",
            params![id, puzzle],
        )?
        .iter()
        .map(crate::stats::effective)
        .collect();
        let best = match (row["best"].as_f64(), declared.get(puzzle)) {
            (Some(b), Some(&d)) => Some(b.min(d)),
            (b, d) => b.or(d.copied()),
        };
        puzzles.push(json!({"puzzle": puzzle, "solves": row["solves"], "best": best, "ao5": if last.len() == 5 { crate::stats::average(&last) } else { None }}));
    }
    // Puzzles known from sign-up but never timed here still show their best.
    for (puzzle, best) in &declared {
        if (puzzles.len() as i64) < top && !puzzles.iter().any(|p| p["puzzle"] == puzzle.as_str()) {
            puzzles.push(json!({"puzzle": puzzle, "solves": 0, "best": best, "ao5": null}));
        }
    }
    let learned = one(db, "SELECT count(*) n FROM learned_cases WHERE user_id=? AND learned=1", [id])?.map(|r| r["n"].clone()).unwrap_or(json!(0));
    Ok(json!({"solves": totals["solves"], "activeDays": totals["active_days"], "lastAt": totals["last_at"], "learned": learned, "puzzles": puzzles}))
}
/// Whether the student had a session with the coach (any, even cancelled): coaches closed to new students still
/// take theirs.
fn coached(db: &Connection, coach: &str, student: &str) -> Result<bool> {
    Ok(one(db, "SELECT 1 FROM coach_bookings WHERE coach_id=? AND student_id=? LIMIT 1", params![coach, student])?.is_some())
}
/// A conversation the account may write in: only once its student booked the coach.
fn writable(db: &Connection, id: &str, uid: &str) -> Result<Value> {
    let conversation = conversation_row(db, id, uid)?;
    if !coached(db, conversation["coach_id"].as_str().unwrap_or(""), conversation["student_id"].as_str().unwrap_or(""))? {
        return Err(ApiError::new(403, "Messages open once a session is booked."));
    }
    Ok(conversation)
}
/// Fails when another session of the coach or of the student overlaps `start..end`.
fn clash(db: &Connection, booking: &Value, start: i64, end: i64) -> Result<()> {
    let taken = one(
        db,
        "SELECT coach_id FROM coach_bookings WHERE id!=?1 AND status='booked' AND starts_at<?4 AND ?3<ends_at AND (coach_id IN (?2,?5) OR student_id IN (?2,?5))",
        params![booking["id"].as_str(), booking["coach_id"].as_str(), start, end, booking["student_id"].as_str()],
    )?;
    match taken {
        Some(_) => Err(ApiError::new(409, "Another session already takes that time.")),
        None => Ok(()),
    }
}
/// Where an account's picture is fetched from, or null without one.
pub(crate) fn avatar_url(file: &Value) -> Value {
    file.as_str().map_or(Value::Null, |f| json!(format!("/api/avatars/{f}")))
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
        "SELECT u.id,u.username,u.avatar,cv.id conversation_id,cv.note,
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
            "id": s["id"], "username": s["username"], "avatar": avatar_url(&s["avatar"]), "conversationId": s["conversation_id"], "note": s["note"],
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
    /// The two accounts of each call under way, so whoever waits hears when the other one opens or closes the app.
    parties: HashMap<String, [String; 2]>,
    /// The username of each account that joined a call, to tell the other party who waits.
    names: HashMap<String, String>,
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
    /// Takes a socket out of a call; the one left in hears why: "left" (on purpose) or "lost" (the app went away).
    fn leave(&mut self, booking: &str, socket: Uuid, reason: &str) {
        let Some(members) = self.calls.get_mut(booking) else { return };
        let Some(i) = members.iter().position(|(_, s)| *s == socket) else { return };
        let (user, _) = members.remove(i);
        let rest = members.clone();
        if rest.is_empty() {
            self.calls.remove(booking);
            self.parties.remove(booking);
        }
        for (other, socket) in rest {
            self.send(&other, socket, json!({"type": "peer", "booking": booking, "present": false, "reason": reason}));
            self.notify(&other, &json!({"type": "presence", "booking": booking, "user": user, "inCall": false}));
        }
    }
}
impl Inner {
    /// Tells whoever waits in a call for `user` that their app opened or closed; an app that opens hears who waits.
    fn online(&self, user: &str, online: bool) {
        for (booking, members) in &self.calls {
            if !self.parties.get(booking).is_some_and(|p| p.iter().any(|u| u == user)) || members.iter().any(|(u, _)| u == user) {
                continue;
            }
            for (other, socket) in members {
                self.send(other, *socket, json!({"type": "online", "booking": booking, "online": online}));
                if online {
                    let name = self.names.get(other).cloned().unwrap_or_default();
                    self.notify(user, &json!({"type": "presence", "booking": booking, "user": name, "inCall": true}));
                }
            }
        }
    }
}
impl Rooms {
    /// Tells every open app of the account.
    pub fn notify(&self, user: &str, value: Value) {
        self.0.lock().unwrap().notify(user, &value);
    }
    fn add(&self, user: &str, socket: Uuid, tx: Outbox) {
        let mut inner = self.0.lock().unwrap();
        let first = !inner.sockets.contains_key(user);
        inner.sockets.entry(user.to_owned()).or_default().insert(socket, tx);
        if first {
            inner.online(user, true);
        }
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
            inner.leave(&booking, socket, "lost");
        }
        if let Some(sockets) = inner.sockets.get_mut(user) {
            sockets.remove(&socket);
            if sockets.is_empty() {
                inner.sockets.remove(user);
                inner.online(user, false);
            }
        }
    }
    /// Enters a session's call. The same account joining from another app takes its place there; whoever is
    /// already in learns that the other party arrived, and the newcomer whether someone waits, or else whether the
    /// other party (`other`) has the app open at all.
    fn join(&self, booking: &str, user: &str, name: &str, other: &str, socket: Uuid) {
        let mut inner = self.0.lock().unwrap();
        inner.names.insert(user.to_owned(), name.to_owned());
        inner.parties.insert(booking.to_owned(), [user.to_owned(), other.to_owned()]);
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
        let online = inner.sockets.contains_key(other);
        inner.send(user, socket, json!({"type": "joined", "booking": booking, "peer": !others.is_empty(), "online": online}));
    }
    fn leave(&self, booking: &str, socket: Uuid) {
        self.0.lock().unwrap().leave(booking, socket, "left");
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
                            state.coaching.join(&booking, &uid, &username, &other, id);
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
    #[test]
    fn cancellation_closes_exactly_twenty_four_hours_before_start() {
        let at = 1_800_000_000_000;
        assert!(cancellation_open(at + DAY_MS + 1, at));
        assert!(!cancellation_open(at + DAY_MS, at));
        assert!(!cancellation_open(at + DAY_MS - 1, at));
        assert!(!cancellation_open(at, at));
        assert!(!cancellation_open(at - 1, at));
    }
    fn coach(windows: Value, off: Value, tz: &str) -> Value {
        json!({"timezone": tz, "session_minutes": 60, "windows": windows.to_string(), "days_off": off.to_string(), "overrides": "[]"})
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
    #[test]
    fn rules_in_force_extra_hours_and_hours_taken_back() {
        // Mondays 18:00–21:00 from 12 October until 26 October only; Tuesday 6 October gets 10:00–12:00 once; on
        // Monday 19 October 19:00–20:00 is taken back; extra hours overlapping the rule do not double the slots.
        let from = ms("2026-10-05T00:00:00Z");
        let mut c = coach(json!([{"weekday": 0, "start": 18 * 60, "end": 21 * 60, "from": "2026-10-12", "until": "2026-10-26"}]), json!([]), "UTC");
        c["overrides"] = json!([
            {"date": "2026-10-06", "start": 600, "end": 720, "open": true},
            {"date": "2026-10-19", "start": 19 * 60, "end": 20 * 60, "open": false},
            {"date": "2026-10-12", "start": 17 * 60, "end": 19 * 60, "open": true}
        ])
        .to_string()
        .into();
        let starts: Vec<i64> = free_slots(&c, &[], from, 35).iter().map(|s| s.0).collect();
        assert_eq!(
            starts,
            vec![
                ms("2026-10-06T10:00:00Z"),
                ms("2026-10-06T11:00:00Z"),
                ms("2026-10-12T17:00:00Z"),
                ms("2026-10-12T18:00:00Z"),
                ms("2026-10-12T19:00:00Z"),
                ms("2026-10-12T20:00:00Z"),
                ms("2026-10-19T18:00:00Z"),
                ms("2026-10-19T20:00:00Z"),
                ms("2026-10-26T18:00:00Z"),
                ms("2026-10-26T19:00:00Z"),
                ms("2026-10-26T20:00:00Z"),
            ]
        );
    }
}
