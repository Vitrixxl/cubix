use crate::accounts::now;
use axum::{
    Json,
    extract::{ConnectInfo, Request, State},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use serde_json::json;
use std::{
    collections::HashMap,
    net::{IpAddr, SocketAddr},
    sync::{Arc, Mutex},
    time::Instant,
};
use tokio::sync::watch;
const MAX_IPS: usize = 20000;
#[derive(Clone)]
struct Bucket {
    tokens: f64,
    at: i64,
}
impl Bucket {
    fn new(cap: f64) -> Self {
        Self {
            tokens: cap,
            at: now(),
        }
    }
    fn allow(&mut self, cap: f64, seconds: f64) -> bool {
        let current = now();
        self.tokens =
            (self.tokens + (current - self.at).max(0) as f64 / 1000. * cap / seconds).min(cap);
        self.at = current;
        if self.tokens >= 1. {
            self.tokens -= 1.;
            true
        } else {
            false
        }
    }
}
/// A client's rate limits; `recorded` once one of its requests was answered (not a health probe).
struct Client {
    recorded: bool,
    last: i64,
    http: Bucket,
    auth: Bucket,
    admin: Bucket,
    ws: Bucket,
}
pub struct Traffic {
    pub log: crate::activity::Log,
    updates: watch::Sender<()>,
    ips: Mutex<HashMap<IpAddr, Client>>,
    pub started: i64,
    pub limit: u32,
    pub trusted: Vec<IpAddr>,
}
impl Traffic {
    pub fn new(log: crate::activity::Log) -> Self {
        Self {
            log,
            updates: watch::channel(()).0,
            ips: Mutex::new(HashMap::new()),
            started: now(),
            limit: std::env::var("CUBIX_RATE_LIMIT")
                .ok()
                .and_then(|v| v.parse().ok())
                .filter(|n| *n > 0)
                .unwrap_or(600),
            trusted: std::env::var("CUBIX_TRUSTED_PROXIES")
                .unwrap_or_default()
                .split(',')
                .filter_map(|v| v.trim().parse().ok())
                .collect(),
        }
    }
    /// Clients currently tracked in memory with at least one recorded request.
    pub fn live_ips(&self) -> usize {
        self.ips.lock().unwrap().values().filter(|c| c.recorded).count()
    }
    /// Changes whenever a request other than a health probe or an administration request is
    /// answered: the administration's live socket tells its views to refetch.
    pub fn subscribe(&self) -> watch::Receiver<()> {
        self.updates.subscribe()
    }
    pub fn ip(&self, peer: IpAddr, headers: &HeaderMap) -> IpAddr {
        if !self.trusted.contains(&peer) {
            return peer;
        }
        // Walk from the trusted socket towards the first untrusted hop. Never trust arbitrary XFF.
        let mut current = peer;
        if let Some(chain) = headers.get("x-forwarded-for").and_then(|v| v.to_str().ok()) {
            for hop in chain.rsplit(',') {
                if !self.trusted.contains(&current) {
                    break;
                }
                match hop.trim().parse() {
                    Ok(ip) => current = ip,
                    Err(_) => return peer,
                }
            }
        }
        current
    }
    pub fn allow(&self, ip: IpAddr, path: &str, websocket: bool) -> bool {
        let mut ips = self.ips.lock().unwrap();
        if !ips.contains_key(&ip) && ips.len() >= MAX_IPS {
            // Evict only inactive buckets. A flood cannot reset an active IP's allowance.
            let cutoff = now() - 900000;
            ips.retain(|_, c| c.last > cutoff);
            if ips.len() >= MAX_IPS {
                return false;
            }
        }
        let c = ips.entry(ip).or_insert_with(|| Client {
            recorded: false,
            last: now(),
            http: Bucket::new(self.limit as f64),
            auth: Bucket::new(20.),
            admin: Bucket::new(5.),
            ws: Bucket::new(120.),
        });
        c.last = now();
        if websocket {
            return c.ws.allow(120., 60.);
        }
        let general = c.http.allow(self.limit as f64, 60.);
        let special = if path == "/api/admin/login" {
            c.admin.allow(5., 900.)
        } else if ["/api/auth/login", "/api/auth/register"].contains(&path) {
            c.auth.allow(20., 60.)
        } else {
            true
        };
        general && special
    }
    fn record(&self, ip: IpAddr, path: &str) {
        // Health probes still obey rate limits, but never feed admin telemetry.
        if path == "/api/health" {
            return;
        }
        if let Some(c) = self.ips.lock().unwrap().get_mut(&ip) {
            c.recorded = true;
            c.last = now();
        }
        // The administration's own requests would otherwise make its views refetch themselves.
        if !path.starts_with("/api/admin/") {
            self.updates.send_replace(());
        }
    }
}
pub async fn monitor(
    State(traffic): State<Arc<Traffic>>,
    request: Request,
    next: Next,
) -> Response {
    let peer = request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|p| p.0.ip())
        .unwrap_or(IpAddr::from([127, 0, 0, 1]));
    let ip = traffic.ip(peer, request.headers());
    let path = request.uri().path().to_owned();
    let method = request.method().to_string();
    // A short, printable user agent only; never other headers.
    let agent = request
        .headers()
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(|v| {
            v.chars()
                .filter(|c| !c.is_control())
                .take(160)
                .collect::<String>()
        })
        .filter(|v| !v.is_empty());
    let start = Instant::now();
    let mut response = if traffic.allow(ip, &path, false) {
        next.run(request).await
    } else {
        let retry = if path == "/api/admin/login" {
            180
        } else if path.starts_with("/api/auth/") {
            3
        } else {
            60
        };
        let mut response = (
            StatusCode::TOO_MANY_REQUESTS,
            Json(json!({"error":"Too many requests. Please retry shortly."})),
        )
            .into_response();
        response
            .headers_mut()
            .insert("retry-after", retry.to_string().parse().unwrap());
        response
    };
    response
        .headers_mut()
        .insert("x-content-type-options", "nosniff".parse().unwrap());
    let ms = start.elapsed().as_secs_f64() * 1000.;
    let status = response.status().as_u16();
    traffic.record(ip, &path);
    if path != "/api/health" {
        traffic.log.request(crate::activity::Entry {
            at: now(),
            ip,
            path: path.chars().take(300).collect(),
            method: method.chars().take(16).collect(),
            status,
            ms,
            agent,
            actor: response
                .extensions_mut()
                .remove::<crate::activity::Actor>(),
        });
    }
    response
}
