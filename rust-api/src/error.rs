use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;
pub type Result<T> = std::result::Result<T, ApiError>;
#[derive(Debug)]
pub struct ApiError {
    pub status: u16,
    pub message: String,
}
impl ApiError {
    pub fn new(status: u16, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
        }
    }
    pub fn internal(error: impl std::fmt::Display) -> Self {
        eprintln!("API error: {error}");
        Self::new(500, "Internal server error")
    }
    pub fn validation() -> Self {
        Self::new(422, "Invalid request")
    }
}
impl From<rusqlite::Error> for ApiError {
    fn from(e: rusqlite::Error) -> Self {
        Self::internal(e)
    }
}
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            StatusCode::from_u16(self.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
            Json(json!({"error":self.message})),
        )
            .into_response()
    }
}
