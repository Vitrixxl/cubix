use crate::{
    AppState, accounts,
    api::{optional_positive_int, string},
    db::{all, one, required},
    error::{ApiError, Result},
};
use axum::{
    extract::{
        ConnectInfo, State, WebSocketUpgrade,
        ws::{CloseFrame, Message, WebSocket},
    },
    response::Response,
};
use rusqlite::{Connection, params};
use serde_json::{Value, json};
use std::{collections::HashMap, sync::Mutex, time::Duration};
use tokio::sync::mpsc;
use uuid::Uuid;

/// Invalidation messages are coalesced in bounded queues and indexed by participant.
#[derive(Default)]
pub struct Hub(Mutex<HashMap<String, HashMap<Uuid, mpsc::Sender<()>>>>);
impl Hub {
    fn add(&self, user: String, id: Uuid, tx: mpsc::Sender<()>) {
        self.0
            .lock()
            .unwrap()
            .entry(user)
            .or_default()
            .insert(id, tx);
    }
    fn remove(&self, user: &str, id: &Uuid) {
        let mut map = self.0.lock().unwrap();
        if let Some(sockets) = map.get_mut(user) {
            sockets.remove(id);
            if sockets.is_empty() {
                map.remove(user);
            }
        }
    }
    pub fn notify(&self, users: &[&str]) {
        let map = self.0.lock().unwrap();
        for user in users {
            if let Some(sockets) = map.get(*user) {
                for tx in sockets.values() {
                    let _ = tx.try_send(());
                }
            }
        }
    }
}
pub fn friendship(db: &Connection, a: &str, b: &str) -> Result<Option<Value>> {
    let (first, second) = if a < b { (a, b) } else { (b, a) };
    one(
        db,
        "SELECT * FROM friendships WHERE user_a=? AND user_b=?",
        params![first, second],
    )
}
pub fn friends(db: &Connection, user: &str) -> Result<Value> {
    Ok(json!(all(db,"SELECT f.*,u.username,u.id AS peer FROM friendships f JOIN users u ON u.id=CASE WHEN f.user_a=? THEN f.user_b ELSE f.user_a END WHERE f.user_a=? OR f.user_b=? ORDER BY u.username",params![user,user,user])?
        .iter().map(|f|json!({"id":f["id"],"userId":f["peer"],"username":f["username"],"status":f["status"],"incoming":f["requested_by"]!=user})).collect::<Vec<_>>()))
}
pub fn own_solve(db: &Connection, id: i64, user: &str) -> Result<Option<Value>> {
    one(
        db,
        "SELECT id,session_id,case_id,time_ms,penalty,scramble,created_at FROM solves WHERE id=? AND user_id=?",
        params![id, user],
    )
}
fn message_dto(row: Value) -> Result<Value> {
    let solve = match row["solve_snapshot"].as_str() {
        Some(s) => serde_json::from_str(s).map_err(ApiError::internal)?,
        None => Value::Null,
    };
    Ok(
        json!({"id":row["id"],"senderId":row["sender_id"],"recipientId":row["recipient_id"],"text":row["text"],"solve":solve,"createdAt":row["created_at"]}),
    )
}
pub fn accepted(db: &Connection, user: &str, peer: &str) -> Result<()> {
    if friendship(db, user, peer)?.is_none_or(|f| f["status"] != "accepted") {
        return Err(ApiError::new(
            403,
            "Accept the friend request before chatting.",
        ));
    }
    Ok(())
}
pub fn messages(db: &Connection, user: &str, peer: &str, before: i64) -> Result<Value> {
    accepted(db, user, peer)?;
    let mut rows = all(
        db,
        "SELECT * FROM chat_messages WHERE ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)) AND id<? ORDER BY id DESC LIMIT 50",
        params![user, peer, peer, user, before],
    )?;
    rows.reverse();
    Ok(json!(
        rows.into_iter()
            .map(message_dto)
            .collect::<Result<Vec<_>>>()?
    ))
}
pub fn persist(db: &Connection, hub: &Hub, user: &str, peer: &str, body: &Value) -> Result<Value> {
    let text = string(body, "text", 0, 2000)?.trim();
    let client_id = string(body, "clientId", 1, 64)?;
    Uuid::parse_str(client_id).map_err(|_| ApiError::validation())?;
    let solve_id = optional_positive_int(body, "solveId")?;
    accepted(db, user, peer)?;
    if let Some(previous) = one(
        db,
        "SELECT * FROM chat_messages WHERE sender_id=? AND client_id=?",
        params![user, client_id],
    )? {
        if previous["recipient_id"] != peer {
            return Err(ApiError::new(409, "Message identifier already used."));
        }
        return message_dto(previous);
    }
    if text.is_empty() && solve_id.is_none() {
        return Err(ApiError::new(400, "Write a message or attach a time."));
    }
    let solve = match solve_id {
        Some(id) => Some(
            own_solve(db, id, user)?
                .ok_or_else(|| ApiError::new(404, "You can only share your own times."))?,
        ),
        None => None,
    };
    let recent = required(
        db,
        "SELECT count(*) AS count FROM chat_messages WHERE sender_id=? AND created_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 minute')",
        [user],
        "Count unavailable",
    )?;
    if recent["count"].as_i64().unwrap_or(0) >= 60 {
        return Err(ApiError::new(
            429,
            "Too many messages. Please wait a moment.",
        ));
    }
    let row = required(
        db,
        "INSERT INTO chat_messages(sender_id,recipient_id,text,solve_snapshot,client_id) VALUES(?,?,?,?,?) RETURNING *",
        params![user, peer, text, solve.map(|v| v.to_string()), client_id],
        "Message unavailable",
    )?;
    hub.notify(&[user, peer]);
    message_dto(row)
}
pub async fn upgrade(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<std::net::SocketAddr>,
    headers: axum::http::HeaderMap,
    ws: WebSocketUpgrade,
) -> Response {
    let ip = state.traffic.ip(peer.ip(), &headers);
    ws.read_buffer_size(4096)
        .write_buffer_size(0)
        .max_write_buffer_size(32768)
        .max_message_size(16384)
        .max_frame_size(16384)
        .on_upgrade(move |socket| live(state, socket, ip))
}
async fn send(socket: &mut WebSocket, value: Value) -> bool {
    socket
        .send(Message::Text(value.to_string().into()))
        .await
        .is_ok()
}
async fn close(socket: &mut WebSocket) {
    let _ = socket
        .send(Message::Close(Some(CloseFrame {
            code: 4001,
            reason: "Session expired".into(),
        })))
        .await;
}
async fn authenticated(state: &AppState, token: String) -> Result<Value> {
    let user = state
        .db
        .call(move |db| accounts::signed_in(db, &token))
        .await?;
    if user["password_hash"].is_null() {
        return Err(ApiError::new(
            403,
            "Create an account to chat with friends.",
        ));
    }
    Ok(user)
}
async fn live(state: AppState, mut socket: WebSocket, ip: std::net::IpAddr) {
    let id = Uuid::new_v4();
    let mut user_id: Option<String> = None;
    let mut token = String::new();
    let (tx, mut rx) = mpsc::channel(1);
    let deadline = tokio::time::sleep(Duration::from_secs(5));
    tokio::pin!(deadline);
    loop {
        tokio::select! {
            _=&mut deadline=>{close(&mut socket).await; break;}
            notification=rx.recv(),if user_id.is_some()=>{
                if notification.is_none() { break; }
                if authenticated(&state,token.clone()).await.is_err() { close(&mut socket).await; break; }
                if !send(&mut socket,json!({"type":"changed"})).await { break; }
            }
            incoming=socket.recv()=>{
                let Some(Ok(message))=incoming else {break};
                if !state.traffic.allow(ip,"/api/social/live",true) {
                    let _=socket.send(Message::Close(Some(CloseFrame {code:1008,reason:"Message rate limit exceeded".into()}))).await;
                    break;
                }
                let text=match message {Message::Text(t)=>t,Message::Close(_)=>break,Message::Ping(_)|Message::Pong(_)=>continue,_=>{close(&mut socket).await;break}};
                let Ok(body)=serde_json::from_str::<Value>(&text) else {close(&mut socket).await;break};
                let kind=body["type"].as_str().unwrap_or("");
                if !["auth","ping","send"].contains(&kind) {close(&mut socket).await;break;}
                if kind=="auth" && user_id.is_none() {
                    let Ok(value)=string(&body,"token",1,128) else {close(&mut socket).await;break};
                    token=format!("Bearer {value}");
                }
                let Ok(user)=authenticated(&state,token.clone()).await else {close(&mut socket).await;break};
                let uid=user["id"].as_str().unwrap().to_owned();
                if user_id.is_none() {state.hub.add(uid.clone(),id,tx.clone());user_id=Some(uid.clone());}
                deadline.as_mut().reset(tokio::time::Instant::now()+Duration::from_secs(60));
                let response=if kind=="send" {
                    let peer=string(&body,"peer",0,64).map(str::to_owned); let client=body["clientId"].clone();
                    let hub=state.hub.clone();
                    let result=match peer {Ok(peer)=>state.db.call(move |db|persist(db,&hub,&uid,&peer,&body)).await,Err(e)=>Err(e)};
                    match result {Ok(message)=>json!({"type":"sent","clientId":client,"message":message}),Err(e)=>json!({"type":"error","clientId":client,"status":e.status,"error":e.message})}
                } else { json!({"type":if kind=="auth"{"ready"}else{"pong"}}) };
                if !send(&mut socket,response).await {break;}
            }
        }
    }
    if let Some(user) = user_id {
        state.hub.remove(&user, &id);
    }
}
