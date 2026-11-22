//! What every page reads and changes: the store, the account's synchronisation, the window's shape and the toast.
use qbix_core::api::Api;
use qbix_core::store::Store;

#[derive(Clone, Debug, PartialEq)]
pub enum SyncState {
    /// A guest: everything stays on this device.
    Local,
    Syncing,
    Synced,
    /// Waiting for the network; the changes stay here until then.
    Offline,
    /// The session ended: sign in again.
    SignIn,
    Error(String),
}

/// What the toast's button does.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ToastAction {
    UndoDelete,
}

/// The smart cube: what the radio sees and, once one is connected, its state as it turns.
#[derive(Default)]
pub struct Smart {
    pub found: Vec<(String, String)>,
    pub scanning: bool,
    pub connecting: Option<String>,
    pub name: Option<String>,
    pub battery: Option<u8>,
    /// The cube as it stands, white on top and green in front (as the cube reports it).
    pub cube: Option<qbix_core::cube::Cube>,
    /// Its turns, with when they were made (ms since 1970).
    pub turns: Vec<(String, i64)>,
    pub need_mac: Option<(String, Option<String>)>,
    pub error: Option<String>,
    /// Bumped at each change, for the drawings that follow it.
    pub revision: u64,
}

pub struct Ctx {
    pub store: Store,
    pub sync: SyncState,
    /// A phone's layout: the tab bar, sheets from the bottom.
    pub phone: bool,
    pub width: f32,
    pub height: f32,
    /// How open the drawer is (0–1), for what is placed beside it.
    pub drawer: f32,
    pub toast: Option<(String, Option<ToastAction>)>,
    /// The account's changes should come down now (a sign-in).
    pub pull: bool,
    /// The app's socket, once connected (messages sent while it is down are dropped).
    pub live: Option<qbix_core::live::Sender>,
    pub ble: Option<crate::ble::Handle>,
    pub smart: Smart,
}

impl Ctx {
    pub fn new(store: Store) -> Self {
        let sync = if store.signed_in() { SyncState::Offline } else { SyncState::Local };
        Self { store, sync, phone: false, width: 1440.0, height: 900.0, drawer: 0.0, toast: None, pull: false, live: None, ble: None, smart: Smart::default() }
    }

    /// The store changed: it is written now, and goes up at the next synchronisation.
    pub fn changed(&mut self) {
        if let Err(e) = self.store.save() { self.toast(format!("{}: {e}", qbix_core::t("This change could not be saved"))) }
    }

    pub fn api(&self) -> Api { Api::new(&self.store.settings.server, self.store.token.clone()) }

    pub fn toast(&mut self, text: String) { self.toast = Some((text, None)) }

    pub fn toast_with(&mut self, text: String, action: ToastAction) { self.toast = Some((text, Some(action))) }

    pub fn username(&self) -> String { self.store.user.as_ref().filter(|u| !u.is_guest).map_or_else(|| qbix_core::t("Guest"), |u| u.username.clone()) }
}

/// Runs a blocking call (the network, a long computation) away from the interface.
pub fn spawn<T: Send + 'static>(work: impl FnOnce() -> T + Send + 'static) -> impl std::future::Future<Output = T> {
    let (tx, rx) = iced::futures::channel::oneshot::channel();
    std::thread::spawn(move || {
        let _ = tx.send(work());
    });
    async move { rx.await.expect("the worker thread ended") }
}
