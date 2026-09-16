//! Live sync notifications: one socket per device, told when its account's practice data changed.
//! Writes never depend on this socket; it only lets other devices pull sooner than their next poll.
use crate::{
    AppState, accounts,
    api::string,
    error::{ApiError, Result},
};
use axum::{
    extract::{
        ConnectInfo, State, WebSocketUpgrade,
        ws::{CloseFrame, Message, WebSocket},
    },
    response::Response,
};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicI64, Ordering},
    },
    time::Duration,
};
use tokio::sync::Notify;
use uuid::Uuid;

/// Live sockets indexed by account. Signals are coalesced, so a burst of changes produces at most
/// one sync message per socket.
#[derive(Default)]
pub struct Slot {
    pending: AtomicBool,
    cursor: AtomicI64,
    wake: Notify,
}
#[derive(Default)]
pub struct Hub(Mutex<HashMap<String, HashMap<Uuid, Arc<Slot>>>>);
impl Hub {
    fn add(&self, user: String, id: Uuid, slot: Arc<Slot>) {
        self.0
            .lock()
            .unwrap()
            .entry(user)
            .or_default()
            .insert(id, slot);
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
    /// The user's own practice data changed up to `cursor`; every device of that account pulls.
    pub fn notify_sync(&self, user: &str, cursor: i64) {
        let map = self.0.lock().unwrap();
        if let Some(sockets) = map.get(user) {
            for slot in sockets.values() {
                slot.cursor.fetch_max(cursor, Ordering::AcqRel);
                slot.pending.store(true, Ordering::Release);
                slot.wake.notify_one();
            }
        }
    }
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
        return Err(ApiError::new(403, "Sign in to synchronize."));
    }
    Ok(user)
}
async fn live(state: AppState, mut socket: WebSocket, ip: std::net::IpAddr) {
    let id = Uuid::new_v4();
    let mut user_id: Option<String> = None;
    let mut token = String::new();
    let slot = Arc::new(Slot::default());
    let deadline = tokio::time::sleep(Duration::from_secs(5));
    tokio::pin!(deadline);
    loop {
        tokio::select! {
            _=&mut deadline=>{close(&mut socket).await; break;}
            _=slot.wake.notified(),if user_id.is_some()=>{
                if !slot.pending.swap(false,Ordering::AcqRel) { continue; }
                if authenticated(&state,token.clone()).await.is_err() { close(&mut socket).await; break; }
                if !send(&mut socket,json!({"type":"sync","cursor":slot.cursor.load(Ordering::Acquire)})).await { break; }
            }
            incoming=socket.recv()=>{
                let Some(Ok(message))=incoming else {break};
                if !state.traffic.allow(ip,"/api/live",true) {
                    let _=socket.send(Message::Close(Some(CloseFrame {code:1008,reason:"Message rate limit exceeded".into()}))).await;
                    break;
                }
                let text=match message {Message::Text(t)=>t,Message::Close(_)=>break,Message::Ping(_)|Message::Pong(_)=>continue,_=>{close(&mut socket).await;break}};
                let Ok(body)=serde_json::from_str::<Value>(&text) else {close(&mut socket).await;break};
                let kind=body["type"].as_str().unwrap_or("");
                if !["auth","ping"].contains(&kind) {close(&mut socket).await;break;}
                if kind=="auth" && user_id.is_none() {
                    let Ok(value)=string(&body,"token",1,128) else {close(&mut socket).await;break};
                    token=format!("Bearer {value}");
                }
                let Ok(user)=authenticated(&state,token.clone()).await else {close(&mut socket).await;break};
                let uid=user["id"].as_str().unwrap().to_owned();
                if user_id.is_none() {state.hub.add(uid.clone(),id,slot.clone());user_id=Some(uid.clone());}
                deadline.as_mut().reset(tokio::time::Instant::now()+Duration::from_secs(60));
                let response=if kind=="auth" {
                    // The current cursor lets a reconnecting device pull immediately if it fell behind.
                    match state.db.call(move |db|crate::sync::cursor(db,&uid)).await {
                        Ok(cursor)=>json!({"type":"ready","cursor":cursor}),
                        Err(_)=>{close(&mut socket).await;break}
                    }
                } else { json!({"type":"pong"}) };
                if !send(&mut socket,response).await {break;}
            }
        }
    }
    if let Some(user) = user_id {
        state.hub.remove(&user, &id);
    }
}
