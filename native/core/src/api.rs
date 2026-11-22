//! The Go API (go-api), over HTTPS: blocking calls, made away from the interface's thread.
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::time::Duration;

#[derive(Clone, Debug)]
pub enum ApiError {
    /// The server answered with an error: its status and message.
    Status(u16, String),
    /// The server could not be reached.
    Network(String),
}

impl ApiError {
    pub fn message(&self) -> String {
        match self {
            ApiError::Status(_, m) => m.clone(),
            ApiError::Network(_) => crate::i18n::t("The server cannot be reached. Check your connection."),
        }
    }
    /// An error that trying again will not fix (a refused request), unlike the network's or the server's.
    pub fn refused(&self) -> bool { matches!(self, ApiError::Status(s, _) if *s < 500 && *s != 429 && *s != 401) }
    pub fn expired(&self) -> bool { matches!(self, ApiError::Status(401, _)) }
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { f.write_str(&self.message()) }
}

#[derive(Clone, Debug)]
pub struct Api {
    pub base: String,
    pub token: Option<String>,
}

fn agent(timeout: u64) -> ureq::Agent { ureq::Agent::config_builder().http_status_as_error(false).timeout_global(Some(Duration::from_secs(timeout))).build().into() }

impl Api {
    pub fn new(server: &str, token: Option<String>) -> Self { Self { base: server.trim_end_matches('/').to_string() + "/api", token } }

    fn url(&self, path: &str) -> String { format!("{}/{}", self.base, path.trim_start_matches('/')) }

    fn finish<T: DeserializeOwned>(result: Result<ureq::http::Response<ureq::Body>, ureq::Error>) -> Result<T, ApiError> {
        let mut response = result.map_err(|e| ApiError::Network(e.to_string()))?;
        let status = response.status().as_u16();
        let value: Value = response.body_mut().with_config().limit(64 << 20).read_json().map_err(|e| if status >= 400 { ApiError::Status(status, String::new()) } else { ApiError::Network(e.to_string()) })?;
        if status >= 400 {
            let message = value.get("error").and_then(Value::as_str).map_or_else(|| crate::i18n::t("Something went wrong. Please try again."), String::from);
            return Err(ApiError::Status(status, message));
        }
        serde_json::from_value(value).map_err(|e| ApiError::Status(status, format!("Unexpected answer: {e}")))
    }

    pub fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T, ApiError> { self.get_within(path, 15) }

    pub fn get_within<T: DeserializeOwned>(&self, path: &str, seconds: u64) -> Result<T, ApiError> {
        let mut request = agent(seconds).get(self.url(path));
        if let Some(t) = &self.token { request = request.header("authorization", format!("Bearer {t}")) }
        Self::finish(request.call())
    }

    /// POST, PUT, PATCH or DELETE `path` with a JSON body.
    pub fn send<T: DeserializeOwned>(&self, method: &str, path: &str, body: &Value) -> Result<T, ApiError> {
        let agent = agent(20);
        let url = self.url(path);
        let auth = self.token.as_ref().map(|t| format!("Bearer {t}"));
        macro_rules! go {
            ($r:expr) => {{
                let mut r = $r;
                if let Some(a) = &auth { r = r.header("authorization", a) }
                Self::finish(r.send_json(body))
            }};
        }
        match method {
            "POST" => go!(agent.post(url)),
            "PUT" => go!(agent.put(url)),
            "PATCH" => go!(agent.patch(url)),
            "DELETE" => {
                let mut r = agent.delete(url).force_send_body();
                if let Some(a) = &auth { r = r.header("authorization", a) }
                Self::finish(r.send_json(body))
            }
            _ => Err(ApiError::Status(405, "Unknown method".into())),
        }
    }

    pub fn post<T: DeserializeOwned>(&self, path: &str, body: &Value) -> Result<T, ApiError> { self.send("POST", path, body) }
}

/// An encoded component of a path or query.
pub fn encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) { out.push(b as char) } else { out.push_str(&format!("%{b:02X}")) }
    }
    out
}
