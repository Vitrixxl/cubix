//! Signing in and the account itself, through the API.
use crate::api::{Api, ApiError};
use crate::store::User;
use serde::Deserialize;
use serde_json::json;

#[derive(Clone, Debug, Deserialize)]
pub struct Auth {
    pub user: User,
    pub token: String,
}

#[derive(Clone, Debug, Default, Deserialize)]
pub struct Config {
    /// Google's client id, when the server signs in with Google.
    #[serde(default)]
    pub google: Option<String>,
    #[serde(default)]
    pub wca: bool,
    /// Any username signs in: development and test servers.
    #[serde(default)]
    pub dev: bool,
}

pub fn config(api: &Api) -> Result<Config, ApiError> { api.get("auth/config") }

pub fn dev_login(api: &Api, username: &str) -> Result<Auth, ApiError> { api.post("auth/dev", &json!({ "username": username })) }

pub fn logout(api: &Api) -> Result<serde_json::Value, ApiError> { api.post("auth/logout", &json!({})) }

pub fn set_username(api: &Api, username: &str) -> Result<User, ApiError> {
    #[derive(Deserialize)]
    struct R {
        user: User,
    }
    api.post::<R>("account/username", &json!({ "username": username })).map(|r| r.user)
}

pub fn delete_account(api: &Api) -> Result<serde_json::Value, ApiError> { api.post("account/delete", &json!({})) }
