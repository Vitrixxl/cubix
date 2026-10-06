//! The community: friends (a request, then a friendship once accepted), conversations between two friends or within a
//! group, and groups, which their owner and admins run. Groups also hold tournaments and battles (tournament.rs).
//!
//! The HTTP routes live under /api/social (`route`, run on the database thread). What changes reaches the open apps
//! of the accounts concerned on their coaching socket, as `{"type": "social", "kind": …}` events: the app keeps one
//! socket per account for everything live.
use crate::{
    AppState,
    accounts::now,
    api::string,
    coaching::avatar_url,
    db::{all, one, required},
    error::{ApiError, Result},
};
use rusqlite::{Connection, params};
use serde_json::{Value, json};
use std::collections::HashMap;

const UNKNOWN_USER: &str = "Unknown player";
const UNKNOWN_GROUP: &str = "Unknown group";
const UNKNOWN_CONVERSATION: &str = "Unknown conversation";
/// Messages a page of a conversation holds.
const PAGE: i64 = 100;

/// Tells every open app of these accounts.
pub fn notify(state: &AppState, users: &[String], kind: &str, mut value: Value) {
    value["type"] = json!("social");
    value["kind"] = json!(kind);
    for user in users {
        state.coaching.notify(user, value.clone());
    }
}
/// A player as the community shows them.
pub fn person(id: &Value, name: &Value, avatar: &Value) -> Value {
    json!({"id": id, "username": name, "avatar": avatar_url(avatar)})
}
pub(crate) fn trimmed(body: &Value, key: &str, min: usize, max: usize) -> Result<String> {
    let text = string(body, key, 0, max)?.trim().to_owned();
    if text.chars().count() < min {
        return Err(ApiError::validation());
    }
    Ok(text)
}
/// Optional trimmed text of at most `max` characters: empty when absent or null.
pub(crate) fn optional(body: &Value, key: &str, max: usize) -> Result<String> {
    match body.get(key) {
        None | Some(Value::Null) => Ok(String::new()),
        Some(_) => trimmed(body, key, 0, max),
    }
}
/// The `user_id` column of a query, as account ids.
pub(crate) fn user_ids(db: &Connection, sql: &str, params: impl rusqlite::Params) -> Result<Vec<String>> {
    Ok(all(db, sql, params)?.into_iter().filter_map(|r| r["user_id"].as_str().map(str::to_owned)).collect())
}
/// A signed-in account by its username.
fn account(db: &Connection, name: &str) -> Result<Value> {
    one(db, "SELECT id,username,avatar FROM users WHERE username=? COLLATE NOCASE AND password_hash IS NOT NULL", [name.trim()])?
        .ok_or_else(|| ApiError::new(404, UNKNOWN_USER))
}
fn account_by_id(db: &Connection, id: &str) -> Result<Value> {
    required(db, "SELECT id,username,avatar FROM users WHERE id=? AND password_hash IS NOT NULL", [id], UNKNOWN_USER)
}

// Friends.

/// Where two accounts stand: friends, a request one way or the other, or nothing.
fn relation(db: &Connection, uid: &str, other: &str) -> Result<&'static str> {
    let row = one(
        db,
        "SELECT user_id,status FROM friends WHERE (user_id=?1 AND friend_id=?2) OR (user_id=?2 AND friend_id=?1)",
        params![uid, other],
    )?;
    Ok(match row {
        None => "none",
        Some(r) if r["status"] == "accepted" => "friend",
        Some(r) if r["user_id"] == uid => "outgoing",
        Some(_) => "incoming",
    })
}
fn friends(db: &Connection, uid: &str) -> Result<Value> {
    let rows = all(
        db,
        "SELECT f.user_id,f.status,f.created_at,f.accepted_at,u.id,u.username,u.avatar FROM friends f
         JOIN users u ON u.id=CASE WHEN f.user_id=?1 THEN f.friend_id ELSE f.user_id END
         WHERE f.user_id=?1 OR f.friend_id=?1 ORDER BY u.username COLLATE NOCASE",
        [uid],
    )?;
    let (mut list, mut incoming, mut outgoing) = (vec![], vec![], vec![]);
    for r in rows {
        let mut p = person(&r["id"], &r["username"], &r["avatar"]);
        if r["status"] == "accepted" {
            p["since"] = r["accepted_at"].clone();
            list.push(p);
        } else {
            p["at"] = r["created_at"].clone();
            if r["user_id"] == uid { outgoing.push(p) } else { incoming.push(p) }
        }
    }
    Ok(json!({"friends": list, "incoming": incoming, "outgoing": outgoing}))
}
/// Asks `other` to be friends; when they already asked, the friendship is made.
fn befriend(db: &Connection, state: &AppState, user: &Value, other: &Value) -> Result<Value> {
    let (uid, oid) = (user["id"].as_str().unwrap(), other["id"].as_str().unwrap());
    if uid == oid {
        return Err(ApiError::new(400, "That is you."));
    }
    match relation(db, uid, oid)? {
        "friend" => return Err(ApiError::new(409, "You are already friends.")),
        "outgoing" => return Err(ApiError::new(409, "Your request is waiting for an answer.")),
        "incoming" => return accept(db, state, user, oid),
        _ => {}
    }
    db.execute("INSERT INTO friends(user_id,friend_id,status,created_at) VALUES(?,?,'pending',?)", params![uid, oid, now()])?;
    notify(state, &[oid.to_owned()], "request", json!({"from": person(&user["id"], &user["username"], &user["avatar"])}));
    notify(state, &[uid.to_owned()], "friends", json!({}));
    Ok(json!({"relation": "outgoing"}))
}
fn accept(db: &Connection, state: &AppState, user: &Value, other: &str) -> Result<Value> {
    let uid = user["id"].as_str().unwrap();
    let changed = db.execute(
        "UPDATE friends SET status='accepted',accepted_at=? WHERE user_id=? AND friend_id=? AND status='pending'",
        params![now(), other, uid],
    )?;
    if changed == 0 {
        return Err(ApiError::new(404, "No request from this player."));
    }
    notify(state, &[other.to_owned()], "accepted", json!({"by": person(&user["id"], &user["username"], &user["avatar"])}));
    notify(state, &[uid.to_owned()], "friends", json!({}));
    Ok(json!({"relation": "friend"}))
}

// Conversations.

/// The members of a conversation: its two friends, or its group's members (invited ones excepted).
fn participants(db: &Connection, conversation: &Value) -> Result<Vec<String>> {
    if let Some(group) = conversation["group_id"].as_i64() {
        return members(db, group);
    }
    Ok([&conversation["user_a"], &conversation["user_b"]].iter().filter_map(|v| v.as_str().map(str::to_owned)).collect())
}
/// Fails unless the two accounts are friends: only friends write to each other.
fn require_friend(db: &Connection, uid: &str, other: &str) -> Result<()> {
    if relation(db, uid, other)? != "friend" {
        return Err(ApiError::new(403, "You can write to your friends only."));
    }
    Ok(())
}
/// A conversation the account belongs to.
fn conversation(db: &Connection, id: i64, uid: &str) -> Result<Value> {
    let row = required(db, "SELECT * FROM social_conversations WHERE id=?", [id], UNKNOWN_CONVERSATION)?;
    if !participants(db, &row)?.iter().any(|p| p == uid) {
        return Err(ApiError::new(404, UNKNOWN_CONVERSATION));
    }
    Ok(row)
}
/// The conversation of two friends, created on first need.
fn direct(db: &Connection, a: &str, b: &str) -> Result<i64> {
    let (a, b) = if a < b { (a, b) } else { (b, a) };
    db.execute("INSERT OR IGNORE INTO social_conversations(user_a,user_b,updated_at) VALUES(?,?,?)", params![a, b, now()])?;
    Ok(required(db, "SELECT id FROM social_conversations WHERE user_a=? AND user_b=?", params![a, b], UNKNOWN_CONVERSATION)?["id"].as_i64().unwrap())
}
const CONVERSATIONS_SQL: &str = "SELECT c.id,c.group_id,c.user_a,c.user_b,c.updated_at,g.name group_name,
  u.id other_id,u.username other_name,u.avatar other_avatar,
  lm.body last_body,lm.sender_id last_sender,lm.created_at last_at,ls.username last_sender_name,
  (SELECT count(*) FROM social_messages x WHERE x.conversation_id=c.id AND x.sender_id!=?1
    AND x.id>COALESCE((SELECT message_id FROM social_reads r WHERE r.conversation_id=c.id AND r.user_id=?1),0)) unread,
  f.user_id IS NOT NULL friends
 FROM social_conversations c
 LEFT JOIN social_groups g ON g.id=c.group_id
 LEFT JOIN users u ON c.group_id IS NULL AND u.id=CASE WHEN c.user_a=?1 THEN c.user_b ELSE c.user_a END
 LEFT JOIN social_messages lm ON lm.id=(SELECT max(id) FROM social_messages WHERE conversation_id=c.id)
 LEFT JOIN users ls ON ls.id=lm.sender_id
 LEFT JOIN friends f ON u.id IS NOT NULL AND f.status='accepted' AND ((f.user_id=?1 AND f.friend_id=u.id) OR (f.user_id=u.id AND f.friend_id=?1))
 WHERE (c.user_a=?1 OR c.user_b=?1 OR c.group_id IN (SELECT group_id FROM group_members WHERE user_id=?1 AND role!='invited'))";
fn conversation_dto(row: &Value, uid: &str) -> Value {
    let group = row["group_id"].as_i64();
    // Two players may write while they are friends; a group's members always.
    let open = group.is_some() || row["friends"] == 1;
    json!({
        "id": row["id"],
        "kind": if group.is_some() { "group" } else { "direct" },
        "with": if group.is_none() { person(&row["other_id"], &row["other_name"], &row["other_avatar"]) } else { Value::Null },
        "group": group.map(|g| json!({"id": g, "name": row["group_name"]})),
        "lastMessage": if row["last_body"].is_null() { Value::Null } else {
            json!({"body": row["last_body"], "at": row["last_at"], "mine": row["last_sender"] == uid, "from": row["last_sender_name"]})
        },
        "unread": row["unread"],
        "updatedAt": row["updated_at"],
        "open": open,
    })
}
fn conversations(db: &Connection, uid: &str) -> Result<Value> {
    let rows = all(db, &format!("{CONVERSATIONS_SQL} ORDER BY c.updated_at DESC"), [uid])?;
    Ok(json!(rows.iter().map(|r| conversation_dto(r, uid)).collect::<Vec<_>>()))
}
fn conversation_view(db: &Connection, id: i64, uid: &str) -> Result<Value> {
    let row = required(db, &format!("{CONVERSATIONS_SQL} AND c.id=?2"), params![uid, id], UNKNOWN_CONVERSATION)?;
    Ok(conversation_dto(&row, uid))
}
/// Messages of others the account has not read, in all its conversations.
fn unread(db: &Connection, uid: &str) -> Result<i64> {
    Ok(one(
        db,
        "SELECT count(*) n FROM social_messages m JOIN social_conversations c ON c.id=m.conversation_id
         LEFT JOIN social_reads r ON r.conversation_id=c.id AND r.user_id=?1
         WHERE m.sender_id!=?1 AND m.id>COALESCE(r.message_id,0)
           AND (c.user_a=?1 OR c.user_b=?1 OR c.group_id IN (SELECT group_id FROM group_members WHERE user_id=?1 AND role!='invited'))",
        [uid],
    )?
    .and_then(|r| r["n"].as_i64())
    .unwrap_or(0))
}
const MESSAGE_SQL: &str = "SELECT m.id,m.sender_id,m.body,m.created_at,u.username,u.avatar FROM social_messages m JOIN users u ON u.id=m.sender_id";
fn message_dto(row: &Value) -> Value {
    json!({"id": row["id"], "senderId": row["sender_id"], "sender": person(&row["sender_id"], &row["username"], &row["avatar"]), "body": row["body"], "createdAt": row["created_at"]})
}
/// Writes in a conversation and brings the message to the open apps of its members.
pub fn post(db: &Connection, state: &AppState, conversation: &Value, user: &Value, body: &str) -> Result<Value> {
    let (id, uid, at) = (conversation["id"].as_i64().unwrap(), user["id"].as_str().unwrap(), now());
    db.execute("INSERT INTO social_messages(conversation_id,sender_id,body,created_at) VALUES(?,?,?,?)", params![id, uid, body, at])?;
    let message_id = db.last_insert_rowid();
    db.execute("UPDATE social_conversations SET updated_at=? WHERE id=?", params![at, id])?;
    read(db, id, uid, message_id)?;
    let message = message_dto(&required(db, &format!("{MESSAGE_SQL} WHERE m.id=?"), [message_id], UNKNOWN_CONVERSATION)?);
    let group = conversation["group_id"].as_i64();
    let title = match group {
        Some(g) => one(db, "SELECT name FROM social_groups WHERE id=?", [g])?.map(|r| r["name"].clone()).unwrap_or(Value::Null),
        None => user["username"].clone(),
    };
    notify(state, &participants(db, conversation)?, "message", json!({"conversation": id, "message": message, "title": title}));
    Ok(message)
}
fn read(db: &Connection, conversation: i64, uid: &str, message: i64) -> Result<()> {
    db.execute(
        "INSERT INTO social_reads(conversation_id,user_id,message_id) VALUES(?1,?2,?3)
         ON CONFLICT(conversation_id,user_id) DO UPDATE SET message_id=max(message_id,excluded.message_id)",
        params![conversation, uid, message],
    )?;
    Ok(())
}

// Groups.

/// The account's place in a group: owner, admin, member or invited; an error when it has none.
pub fn role(db: &Connection, group: i64, uid: &str) -> Result<String> {
    one(db, "SELECT role FROM group_members WHERE group_id=? AND user_id=?", params![group, uid])?
        .and_then(|r| r["role"].as_str().map(str::to_owned))
        .ok_or_else(|| ApiError::new(404, UNKNOWN_GROUP))
}
/// Fails unless the account is in the group, or runs it when `organise`.
pub fn member(db: &Connection, group: i64, uid: &str, organise: bool) -> Result<String> {
    let role = role(db, group, uid)?;
    if role == "invited" {
        return Err(ApiError::new(404, UNKNOWN_GROUP));
    }
    if organise && role == "member" {
        return Err(ApiError::new(403, "Only the group's owner and admins can do that."));
    }
    Ok(role)
}
pub fn members(db: &Connection, group: i64) -> Result<Vec<String>> {
    user_ids(db, "SELECT user_id FROM group_members WHERE group_id=? AND role!='invited'", [group])
}
fn group_summary(row: &Value) -> Value {
    json!({"id": row["id"], "name": row["name"], "description": row["description"], "members": row["members"], "role": row["role"], "createdAt": row["created_at"]})
}
fn groups(db: &Connection, uid: &str) -> Result<(Vec<Value>, Vec<Value>)> {
    let rows = all(
        db,
        "SELECT g.*,m.role,(SELECT count(*) FROM group_members x WHERE x.group_id=g.id AND x.role!='invited') members,
         i.username invited_by FROM social_groups g JOIN group_members m ON m.group_id=g.id AND m.user_id=?
         LEFT JOIN users i ON i.id=m.invited_by ORDER BY g.name COLLATE NOCASE",
        [uid],
    )?;
    let (mut joined, mut invited) = (vec![], vec![]);
    for r in rows {
        let mut g = group_summary(&r);
        if r["role"] == "invited" {
            g["invitedBy"] = r["invited_by"].clone();
            invited.push(g);
        } else {
            joined.push(g);
        }
    }
    Ok((joined, invited))
}
fn group(db: &Connection, id: i64, uid: &str) -> Result<Value> {
    let role = member(db, id, uid, false)?;
    let row = required(db, "SELECT * FROM social_groups WHERE id=?", [id], UNKNOWN_GROUP)?;
    let people = all(
        db,
        "SELECT m.role,m.joined_at,u.id,u.username,u.avatar FROM group_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=?
         ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'member' THEN 2 ELSE 3 END,u.username COLLATE NOCASE",
        [id],
    )?;
    let conversation = one(db, "SELECT id FROM social_conversations WHERE group_id=?", [id])?.map(|r| r["id"].clone()).unwrap_or(Value::Null);
    Ok(json!({
        "id": id,
        "name": row["name"],
        "description": row["description"],
        "ownerId": row["owner_id"],
        "createdAt": row["created_at"],
        "role": role,
        "conversationId": conversation,
        "members": people.iter().map(|p| {
            let mut v = person(&p["id"], &p["username"], &p["avatar"]);
            v["role"] = p["role"].clone();
            v["joinedAt"] = p["joined_at"].clone();
            v
        }).collect::<Vec<_>>(),
        "tournaments": crate::tournament::list(db, Some(id), uid)?,
        "battles": crate::tournament::battles(db, id)?,
    }))
}
fn create_group(db: &mut Connection, state: &AppState, uid: &str, body: &Value) -> Result<Value> {
    let name = trimmed(body, "name", 2, 40)?;
    let description = optional(body, "description", 300)?;
    let at = now();
    let tx = db.transaction()?;
    tx.execute("INSERT INTO social_groups(name,description,owner_id,created_at) VALUES(?,?,?,?)", params![name, description, uid, at])?;
    let id = tx.last_insert_rowid();
    tx.execute("INSERT INTO group_members(group_id,user_id,role,joined_at) VALUES(?,?,'owner',?)", params![id, uid, at])?;
    tx.execute("INSERT INTO social_conversations(group_id,updated_at) VALUES(?,?)", params![id, at])?;
    tx.commit()?;
    notify(state, &[uid.to_owned()], "groups", json!({}));
    group(db, id, uid)
}
/// Tells the group's members (and the invited, with `invited`) that it changed.
pub fn changed(db: &Connection, state: &AppState, id: i64, invited: bool) -> Result<()> {
    let users = if invited { user_ids(db, "SELECT user_id FROM group_members WHERE group_id=?", [id])? } else { members(db, id)? };
    notify(state, &users, "group", json!({"group": id}));
    Ok(())
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
    if user["password_hash"].is_null() {
        return Err(ApiError::new(403, "Sign in to meet other players."));
    }
    let uid = user["id"].as_str().unwrap();
    let number = |s: &str| s.parse::<i64>().map_err(|_| ApiError::validation());
    match (method, parts) {
        // Everything the community page opens with.
        ("GET", ["me"]) => {
            let (joined, invited) = groups(db, uid)?;
            let mut value = friends(db, uid)?;
            value["groups"] = json!(joined);
            value["invitations"] = json!(invited);
            value["unread"] = json!(unread(db, uid)?);
            Ok(value)
        }
        ("GET", ["users"]) => {
            let q = query.get("q").map(|q| q.trim().to_lowercase()).unwrap_or_default();
            if q.is_empty() || q.chars().count() > 24 {
                return Ok(json!([]));
            }
            let pattern = format!("{}%", q.replace(['%', '_', '\\'], ""));
            let rows = all(
                db,
                "SELECT id,username,avatar FROM users WHERE password_hash IS NOT NULL AND id!=? AND username LIKE ? ORDER BY length(username),username LIMIT 12",
                params![uid, pattern],
            )?;
            Ok(json!(rows.iter().map(|r| {
                let mut p = person(&r["id"], &r["username"], &r["avatar"]);
                p["relation"] = json!(relation(db, uid, r["id"].as_str().unwrap()).unwrap_or("none"));
                p
            }).collect::<Vec<_>>()))
        }
        ("POST", ["friends"]) => {
            let other = account(db, string(body, "username", 1, 24)?)?;
            befriend(db, state, user, &other)
        }
        ("POST", ["friends", id, "accept"]) => accept(db, state, user, id),
        // Declines a request, takes one back, or ends a friendship.
        ("DELETE", ["friends", id]) => {
            let gone = db.execute("DELETE FROM friends WHERE (user_id=?1 AND friend_id=?2) OR (user_id=?2 AND friend_id=?1)", params![uid, id])?;
            if gone == 0 {
                return Err(ApiError::new(404, UNKNOWN_USER));
            }
            notify(state, &[uid.to_owned(), (*id).to_owned()], "friends", json!({}));
            Ok(json!({"relation": "none"}))
        }
        ("GET", ["conversations"]) => conversations(db, uid),
        ("POST", ["conversations"]) => {
            let other = account_by_id(db, string(body, "userId", 1, 64)?)?;
            let oid = other["id"].as_str().unwrap();
            require_friend(db, uid, oid)?;
            let id = direct(db, uid, oid)?;
            conversation_view(db, id, uid)
        }
        ("GET", ["conversations", id]) => {
            let id = number(id)?;
            conversation(db, id, uid)?;
            conversation_view(db, id, uid)
        }
        ("GET", ["conversations", id, "messages"]) => {
            let id = number(id)?;
            conversation(db, id, uid)?;
            let before = query.get("before").map(|b| number(b)).transpose()?.unwrap_or(i64::MAX);
            let mut rows = all(db, &format!("{MESSAGE_SQL} WHERE m.conversation_id=? AND m.id<? ORDER BY m.id DESC LIMIT ?"), params![id, before, PAGE])?;
            rows.reverse();
            Ok(json!(rows.iter().map(message_dto).collect::<Vec<_>>()))
        }
        ("POST", ["conversations", id, "messages"]) => {
            let row = conversation(db, number(id)?, uid)?;
            if let (None, Some(a), Some(b)) = (row["group_id"].as_i64(), row["user_a"].as_str(), row["user_b"].as_str()) {
                require_friend(db, uid, if a == uid { b } else { a })?;
            }
            let text = trimmed(body, "body", 1, 1000)?;
            post(db, state, &row, user, &text)
        }
        ("POST", ["conversations", id, "read"]) => {
            let id = number(id)?;
            conversation(db, id, uid)?;
            let last = one(db, "SELECT max(id) id FROM social_messages WHERE conversation_id=?", [id])?.and_then(|r| r["id"].as_i64()).unwrap_or(0);
            read(db, id, uid, last)?;
            Ok(json!({"unread": unread(db, uid)?}))
        }
        ("POST", ["groups"]) => create_group(db, state, uid, body),
        ("GET", ["groups", id]) => group(db, number(id)?, uid),
        ("PUT", ["groups", id]) => {
            let id = number(id)?;
            member(db, id, uid, true)?;
            let name = trimmed(body, "name", 2, 40)?;
            let description = trimmed(body, "description", 0, 300)?;
            db.execute("UPDATE social_groups SET name=?,description=? WHERE id=?", params![name, description, id])?;
            changed(db, state, id, true)?;
            group(db, id, uid)
        }
        ("DELETE", ["groups", id]) => {
            let id = number(id)?;
            if member(db, id, uid, true)? != "owner" {
                return Err(ApiError::new(403, "Only the group's owner can delete it."));
            }
            let users = user_ids(db, "SELECT user_id FROM group_members WHERE group_id=?", [id])?;
            db.execute("DELETE FROM social_groups WHERE id=?", [id])?;
            notify(state, &users, "groups", json!({"deleted": id}));
            Ok(json!({"ok": true}))
        }
        ("POST", ["groups", id, "invite"]) => {
            let id = number(id)?;
            member(db, id, uid, true)?;
            let other = account(db, string(body, "username", 1, 24)?)?;
            let oid = other["id"].as_str().unwrap();
            if one(db, "SELECT 1 FROM group_members WHERE group_id=? AND user_id=?", params![id, oid])?.is_some() {
                return Err(ApiError::new(409, "This player is already in the group, or invited."));
            }
            db.execute("INSERT INTO group_members(group_id,user_id,role,invited_by,joined_at) VALUES(?,?,'invited',?,?)", params![id, oid, uid, now()])?;
            let name = required(db, "SELECT name FROM social_groups WHERE id=?", [id], UNKNOWN_GROUP)?["name"].clone();
            notify(state, &[oid.to_owned()], "invitation", json!({"group": id, "name": name, "from": user["username"]}));
            changed(db, state, id, false)?;
            group(db, id, uid)
        }
        ("POST", ["groups", id, "join"]) => {
            let id = number(id)?;
            if role(db, id, uid)? != "invited" {
                return Err(ApiError::new(409, "You are already in this group."));
            }
            db.execute("UPDATE group_members SET role='member',joined_at=? WHERE group_id=? AND user_id=?", params![now(), id, uid])?;
            changed(db, state, id, true)?;
            notify(state, &[uid.to_owned()], "groups", json!({}));
            group(db, id, uid)
        }
        ("POST", ["groups", id, "members", member_id, "role"]) => {
            let id = number(id)?;
            if member(db, id, uid, true)? != "owner" {
                return Err(ApiError::new(403, "Only the group's owner can name admins."));
            }
            let next = string(body, "role", 1, 16)?;
            if !["admin", "member"].contains(&next) {
                return Err(ApiError::validation());
            }
            let changed_rows = db.execute(
                "UPDATE group_members SET role=? WHERE group_id=? AND user_id=? AND role IN ('admin','member')",
                params![next, id, member_id],
            )?;
            if changed_rows == 0 {
                return Err(ApiError::new(404, UNKNOWN_USER));
            }
            changed(db, state, id, false)?;
            group(db, id, uid)
        }
        // Leaving the group, declining an invitation, or (for its owner and admins) removing someone.
        ("DELETE", ["groups", id, "members", member_id]) => {
            let id = number(id)?;
            let mine = role(db, id, uid)?;
            let theirs = role(db, id, member_id)?;
            let own = *member_id == uid;
            if theirs == "owner" && own {
                return Err(ApiError::new(409, "The owner cannot leave: delete the group instead."));
            }
            if theirs == "owner" {
                return Err(ApiError::new(409, "The owner cannot be removed."));
            }
            if !own && (mine == "member" || mine == "invited" || (mine == "admin" && theirs == "admin")) {
                return Err(ApiError::new(403, "Only the group's owner and admins can remove members."));
            }
            changed(db, state, id, true)?;
            db.execute("DELETE FROM group_members WHERE group_id=? AND user_id=?", params![id, member_id])?;
            notify(state, &[(*member_id).to_owned()], "groups", json!({"left": id}));
            if own { Ok(json!({"ok": true})) } else { group(db, id, uid) }
        }
        _ => Err(ApiError::new(404, "Unknown community route")),
    }
}
