use crate::accounts::now;
use axum::{
    Json,
    extract::{ConnectInfo, Request, State},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, VecDeque},
    net::{IpAddr, SocketAddr},
    sync::{Arc, Mutex},
    time::Instant,
};
use tokio::sync::watch;
const MAX_IPS: usize = 20000;
const MAX_LOGS: usize = 10000;
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
struct Client {
    total: u64,
    limited: u64,
    errors: u64,
    last: i64,
    last_recorded: i64,
    http: Bucket,
    auth: Bucket,
    admin: Bucket,
    ws: Bucket,
}
struct Metrics {
    total: u64,
    limited: u64,
    errors: u64,
    overflow: u64,
    ips: HashMap<IpAddr, Client>,
    logs: VecDeque<Value>,
}
pub struct Traffic {
    updates: watch::Sender<()>,
    data: Mutex<Metrics>,
    pub started: i64,
    pub limit: u32,
    pub trusted: Vec<IpAddr>,
}
impl Traffic {
    pub fn new() -> Self {
        Self {
            updates: watch::channel(()).0,
            data: Mutex::new(Metrics {
                total: 0,
                limited: 0,
                errors: 0,
                overflow: 0,
                ips: HashMap::new(),
                logs: VecDeque::new(),
            }),
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
        let mut d = self.data.lock().unwrap();
        if !d.ips.contains_key(&ip) && d.ips.len() >= MAX_IPS {
            // Evict only inactive buckets. A flood cannot reset an active IP's allowance.
            let cutoff = now() - 900000;
            d.ips.retain(|_, c| c.last > cutoff);
            if d.ips.len() >= MAX_IPS {
                if path != "/api/health" {
                    d.overflow += 1;
                }
                return false;
            }
        }
        let c = d.ips.entry(ip).or_insert_with(|| Client {
            total: 0,
            limited: 0,
            errors: 0,
            last: now(),
            last_recorded: 0,
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
        } else if ["/api/auth/login", "/api/auth/register", "/api/auth/guest"].contains(&path) {
            c.auth.allow(20., 60.)
        } else {
            true
        };
        general && special
    }
    pub fn record(&self, ip: IpAddr, method: &str, path: &str, status: u16, ms: f64) {
        // Health probes still obey rate limits, but never feed admin telemetry.
        if path == "/api/health" {
            return;
        }
        let mut d = self.data.lock().unwrap();
        d.total += 1;
        if status == 429 {
            d.limited += 1;
        }
        if status >= 400 {
            d.errors += 1;
        }
        if let Some(c) = d.ips.get_mut(&ip) {
            c.total += 1;
            c.last = now();
            c.last_recorded = c.last;
            if status == 429 {
                c.limited += 1;
            }
            if status >= 400 {
                c.errors += 1;
            }
        }
        let id = d.total;
        if d.logs.len() == MAX_LOGS {
            d.logs.pop_front();
        }
        d.logs.push_back(json!({"id":id,"at":now(),"ip":ip.to_string(),"method":method,"path":path.chars().take(300).collect::<String>(),"status":status,"durationMs":(ms*100.).round()/100.}));
        drop(d);
        self.updates.send_replace(());
    }
    pub fn snapshot(&self, ip: &str, path: &str, status: &str, ip_page: usize) -> Value {
        let d = self.data.lock().unwrap();
        let logs: Vec<_> = d
            .logs
            .iter()
            .rev()
            .filter(|r| {
                (ip.is_empty() || r["ip"].as_str().unwrap_or("").contains(ip))
                    && r["path"].as_str().unwrap_or("").contains(path)
                    && (status.is_empty() || r["status"].to_string().starts_with(status))
            })
            .take(200)
            .cloned()
            .collect();
        let mut ips: Vec<_> = d
            .ips
            .iter()
            .filter(|(_, client)| client.total > 0)
            .collect();
        let tracked_ip_count = ips.len();
        ips.retain(|(addr, _)| ip.is_empty() || addr.to_string().contains(ip));
        ips.sort_by(|a, b| b.1.total.cmp(&a.1.total).then_with(|| a.0.cmp(b.0)));
        let ip_count = ips.len();
        let rows:Vec<_>=ips.into_iter().skip(ip_page*50).take(50).map(|(ip,c)|json!({"ip":ip.to_string(),"requests":c.total,"limited":c.limited,"errors":c.errors,"lastAt":c.last_recorded})).collect();
        json!({"startedAt":self.started,"total":d.total,"errors":d.errors,"limited":d.limited,"ipCount":tracked_ip_count,"matchingIps":ip_count,"untrackedRequests":d.overflow,"ips":rows,"requests":logs,"retained":d.logs.len(),"capacity":MAX_LOGS,"rateLimit":self.limit})
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
    traffic.record(
        ip,
        &method,
        &path,
        response.status().as_u16(),
        start.elapsed().as_secs_f64() * 1000.,
    );
    response
}
