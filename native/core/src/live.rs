//! The app's socket (go-api/live.go): one connection carrying the sync's news, the duel, the messages and the matches,
//! each message tagged with its channel. A thread holds it, reconnecting after a pause when it drops; the app sends
//! through `Sender` and reads `Event`s.
use serde_json::{Value, json};
use std::net::TcpStream;
use std::sync::mpsc;
use std::time::Duration;
use tungstenite::stream::MaybeTlsStream;
use tungstenite::{Message, WebSocket};

#[derive(Clone, Debug)]
pub enum Event {
    /// Connected and authenticated (`ready`): the account, if any.
    Ready(Value),
    /// A message of a channel.
    Message(Value),
    Closed,
}

/// Sends messages up the socket; a message sent while it is down is dropped.
#[derive(Clone, Debug)]
pub struct Sender(mpsc::Sender<String>);

impl Sender {
    pub fn send(&self, channel: &str, mut value: Value) {
        value["channel"] = json!(channel);
        let _ = self.0.send(value.to_string());
    }
}

fn timeout(ws: &mut WebSocket<MaybeTlsStream<TcpStream>>, d: Option<Duration>) {
    let stream = match ws.get_mut() {
        MaybeTlsStream::Plain(s) => s,
        MaybeTlsStream::Rustls(s) => s.get_mut(),
        _ => return,
    };
    let _ = stream.set_read_timeout(d);
}

/// Opens the socket of `server` (https://…) in a thread, signed in with `token`. Events come down `events` until the
/// receiver is dropped.
pub fn connect(server: &str, token: Option<String>, after: i64, events: impl Fn(Event) -> bool + Send + 'static) -> Sender {
    let url = server.trim_end_matches('/').replacen("https://", "wss://", 1).replacen("http://", "ws://", 1) + "/api/live";
    let (tx, rx) = mpsc::channel::<String>();
    std::thread::spawn(move || {
        let mut pause = Duration::from_secs(1);
        loop {
            match tungstenite::connect(&url) {
                Ok((mut ws, _)) => {
                    pause = Duration::from_secs(1);
                    let auth = json!({ "channel": "live", "type": "auth", "token": token, "after": after });
                    if ws.send(Message::text(auth.to_string())).is_err() { continue }
                    timeout(&mut ws, Some(Duration::from_millis(40)));
                    // Messages sent while it was down are stale.
                    while rx.try_recv().is_ok() {}
                    loop {
                        loop {
                            match rx.try_recv() {
                                Ok(text) => {
                                    if ws.send(Message::text(text)).is_err() { break }
                                }
                                Err(mpsc::TryRecvError::Empty) => break,
                                Err(mpsc::TryRecvError::Disconnected) => return,
                            }
                        }
                        match ws.read() {
                            Ok(Message::Text(t)) => {
                                let Ok(v) = serde_json::from_str::<Value>(t.as_str()) else { continue };
                                let ready = v["channel"] == "live" && v["type"] == "ready";
                                if !events(if ready { Event::Ready(v) } else { Event::Message(v) }) { return }
                            }
                            Ok(Message::Close(_)) => break,
                            Ok(_) => {}
                            Err(tungstenite::Error::Io(e)) if matches!(e.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) => {}
                            Err(_) => break,
                        }
                    }
                    if !events(Event::Closed) { return }
                }
                Err(_) => {
                    if !events(Event::Closed) { return }
                }
            }
            std::thread::sleep(pause);
            pause = (pause * 2).min(Duration::from_secs(30));
        }
    });
    Sender(tx)
}
