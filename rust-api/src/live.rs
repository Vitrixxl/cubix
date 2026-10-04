//! Account-scoped incremental sync. Protocol 2 streams changed entities and acknowledges durable
//! uploads over the same socket; older clients retain cursor-only notifications.
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
        .max_write_buffer_size(8 * 1024 * 1024)
        .max_message_size(2 * 1024 * 1024)
        .max_frame_size(2 * 1024 * 1024)
        .on_upgrade(move |socket| live(state, socket, ip))
}
async fn send(socket: &mut WebSocket, value: Value) -> bool {
    matches!(tokio::time::timeout(Duration::from_secs(15), socket.send(Message::Text(value.to_string().into()))).await, Ok(Ok(())))
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
    let mut streaming = false;
    let mut delivered = 0;
    let slot = Arc::new(Slot::default());
    let deadline = tokio::time::sleep(Duration::from_secs(5));
    tokio::pin!(deadline);
    loop {
        tokio::select! {
            _=&mut deadline=>{close(&mut socket).await; break;}
            _=slot.wake.notified(),if user_id.is_some()=>{
                if !slot.pending.swap(false,Ordering::AcqRel) { continue; }
                if streaming {
                    let auth = token.clone();
                    let after = delivered;
                    let page = state.db.call(move |db| {
                        let user = accounts::signed_in(db, &auth)?;
                        crate::sync::pull(db, user["id"].as_str().unwrap(), after, true, true)
                    }).await;
                    let Ok(mut page) = page else { close(&mut socket).await; break; };
                    delivered = page["cursor"].as_i64().unwrap();
                    if page["more"] == true { slot.pending.store(true, Ordering::Release); slot.wake.notify_one(); }
                    if delivered > after {
                        page["type"] = json!("changes"); page["after"] = json!(after);
                        if !send(&mut socket, page).await { break; }
                    }
                } else {
                    if authenticated(&state,token.clone()).await.is_err() { close(&mut socket).await; break; }
                    if !send(&mut socket,json!({"type":"sync","cursor":slot.cursor.load(Ordering::Acquire)})).await { break; }
                }
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
                if streaming && user_id.is_some() && ["push", "pull"].contains(&kind) {
                    let Ok(request_id) = string(&body, "requestId", 1, 100) else {close(&mut socket).await;break};
                    let request_id = request_id.to_owned();
                    let auth = token.clone(); let copy = state.clone(); let request = body.clone();
                    let result = state.db.call(move |db| {
                        let caller = crate::api::Caller::new(db, &auth)?;
                        let uid = caller.id().ok_or_else(|| ApiError::new(401, "Please sign in again."))?;
                        if request["type"] == "pull" {
                            let after = request["after"].as_i64().filter(|n| *n >= 0).ok_or_else(ApiError::validation)?;
                            crate::sync::pull(db, uid, after, true, true)
                        } else {
                            let result = crate::sync::push(db, &copy, uid, &caller, &request)?;
                            copy.hub.notify_sync(uid, crate::sync::cursor(db, uid)?);
                            Ok(result)
                        }
                    }).await;
                    let expired = result.as_ref().is_err_and(|e| e.status == 401);
                    let response = match result {
                        Ok(value) => {
                            if kind == "pull" { delivered = delivered.max(value["cursor"].as_i64().unwrap_or(0)); }
                            json!({"type":"result","requestId":request_id,"value":value})
                        },
                        Err(error) => json!({"type":"result","requestId":request_id,"status":error.status,"error":error.message}),
                    };
                    if !send(&mut socket, response).await { break; }
                    if expired { close(&mut socket).await; break; }
                    deadline.as_mut().reset(tokio::time::Instant::now()+Duration::from_secs(60));
                    continue;
                }
                if !["auth","ping"].contains(&kind) {close(&mut socket).await;break;}
                if kind=="auth" && user_id.is_none() {
                    let Ok(value)=string(&body,"token",1,128) else {close(&mut socket).await;break};
                    token=format!("Bearer {value}");
                    streaming = body["protocol"] == 2;
                    if streaming {
                        let Some(after) = body["after"].as_i64().filter(|n| *n >= 0) else {close(&mut socket).await;break};
                        delivered = after;
                    }
                }
                let Ok(user)=authenticated(&state,token.clone()).await else {close(&mut socket).await;break};
                let uid=user["id"].as_str().unwrap().to_owned();
                // An open app is an active account even between HTTP requests.
                state.traffic.log.seen(uid.clone());
                if user_id.is_none() {state.hub.add(uid.clone(),id,slot.clone());user_id=Some(uid.clone());}
                deadline.as_mut().reset(tokio::time::Instant::now()+Duration::from_secs(60));
                let response=if kind=="auth" {
                    // The current cursor lets a reconnecting device pull immediately if it fell behind.
                    match state.db.call(move |db|crate::sync::cursor(db,&uid)).await {
                        Ok(cursor)=>if streaming { json!({"type":"ready","cursor":cursor,"protocol":2,"user":accounts::public(&user)}) } else { json!({"type":"ready","cursor":cursor}) },
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
