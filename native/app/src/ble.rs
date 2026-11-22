//! The radio of smart cubes: Bluetooth Low Energy through the system (btleplug: BlueZ on Linux, the platform's API
//! elsewhere), in a thread of its own. The app asks it to scan, connect and disconnect; it answers with the cubes it
//! sees and, once one is connected, its decoded events (core's `smart`).
#[cfg(not(target_os = "android"))]
use btleplug::api::{Central, CentralEvent, Manager as _, Peripheral as _, ScanFilter, WriteType};
#[cfg(not(target_os = "android"))]
use btleplug::platform::{Manager, Peripheral, PeripheralId};
#[cfg(not(target_os = "android"))]
use futures_util::StreamExt;
#[cfg(not(target_os = "android"))]
use qbix_core::smart;
use qbix_core::smart::Event;
#[cfg(not(target_os = "android"))]
use std::collections::HashMap;
#[cfg(not(target_os = "android"))]
use std::time::Duration;
use tokio::sync::mpsc;

#[derive(Clone, Debug)]
#[cfg_attr(target_os = "android", allow(dead_code))]
pub enum Command {
    Scan,
    Connect(String),
    /// A MAC address typed by the player, for a cube whose address could not be read.
    Mac(String),
    Disconnect,
}

#[derive(Clone, Debug)]
#[cfg_attr(target_os = "android", allow(dead_code))]
pub enum Report {
    /// The radio is unavailable (no adapter, Bluetooth off).
    Unavailable(String),
    Found { id: String, name: String },
    Connecting(String),
    /// The cube's address is needed (its protocol encrypts with it): a guess to offer.
    NeedMac { name: String, guess: Option<String> },
    Connected { name: String },
    Cube(Event),
    Disconnected(Option<String>),
}

#[derive(Clone, Debug)]
pub struct Handle(mpsc::UnboundedSender<Command>);

impl Handle {
    pub fn send(&self, c: Command) { let _ = self.0.send(c); }
}

/// Starts the radio's thread; `report` hears it until it returns false.
pub fn start(report: impl Fn(Report) -> bool + Send + 'static) -> Handle {
    let (tx, rx) = mpsc::unbounded_channel();
    std::thread::spawn(move || {
        #[cfg(not(target_os = "android"))]
        let Ok(rt) = tokio::runtime::Builder::new_current_thread().enable_all().build() else { return };
        #[cfg(not(target_os = "android"))]
        rt.block_on(run(rx, report));
        // ponytail: the Android radio needs btleplug's Java side (droidplug) packaged in the app; until then the
        // smart cubes are the desktop's.
        #[cfg(target_os = "android")]
        {
            let _ = rx;
            report(Report::Unavailable(qbix_core::t("Smart cubes connect from the desktop app for now")));
        }
    });
    Handle(tx)
}

#[cfg(not(target_os = "android"))]
async fn run(mut rx: mpsc::UnboundedReceiver<Command>, report: impl Fn(Report) -> bool + Send + 'static) {
    let adapter = match Manager::new().await {
        Ok(m) => match m.adapters().await.ok().and_then(|a| a.into_iter().next()) {
            Some(a) => a,
            None => {
                report(Report::Unavailable(qbix_core::t("No Bluetooth adapter on this device")));
                return;
            }
        },
        Err(e) => {
            report(Report::Unavailable(e.to_string()));
            return;
        }
    };
    let Ok(mut events) = adapter.events().await else { return };
    let names: Vec<&str> = smart::protocols().iter().flat_map(|p| p.names.iter().copied()).collect();
    let mut seen: HashMap<String, PeripheralId> = HashMap::new();
    let mut adverts: HashMap<String, HashMap<u16, Vec<u8>>> = HashMap::new();
    let mut connected: Option<Session> = None;
    let mut waiting_mac: Option<(Peripheral, String)> = None;
    let mut poll = tokio::time::interval(Duration::from_secs(60));
    loop {
        tokio::select! {
            Some(cmd) = rx.recv() => match cmd {
                Command::Scan => {
                    let _ = adapter.start_scan(ScanFilter::default()).await;
                }
                Command::Connect(id) => {
                    let _ = adapter.stop_scan().await;
                    if let Some(s) = connected.take() { let _ = s.peripheral.disconnect().await; }
                    let Some(pid) = seen.get(&id).cloned() else { continue };
                    let Ok(p) = adapter.peripheral(&pid).await else { continue };
                    let name = p.properties().await.ok().flatten().and_then(|x| x.local_name).unwrap_or_default();
                    if !report(Report::Connecting(name.clone())) { return }
                    match Session::open(p.clone(), &name, None, adverts.get(&id)).await {
                        Ok(Opened::Ready(s)) => {
                            if !report(Report::Connected { name: name.clone() }) { return }
                            for e in s.first.clone() { report(Report::Cube(e)); }
                            connected = Some(s);
                        }
                        Ok(Opened::NeedMac(guess)) => {
                            waiting_mac = Some((p, name.clone()));
                            if !report(Report::NeedMac { name, guess }) { return }
                        }
                        Err(e) => {
                            let _ = p.disconnect().await;
                            if !report(Report::Disconnected(Some(e))) { return }
                        }
                    }
                }
                Command::Mac(text) => {
                    let Some((p, name)) = waiting_mac.take() else { continue };
                    let Some(mac) = smart::parse_mac(&text) else {
                        waiting_mac = Some((p, name.clone()));
                        report(Report::NeedMac { name, guess: None });
                        continue;
                    };
                    match Session::open(p.clone(), &name, Some(mac), None).await {
                        Ok(Opened::Ready(s)) => {
                            report(Report::Connected { name });
                            for e in s.first.clone() { report(Report::Cube(e)); }
                            connected = Some(s);
                        }
                        _ => {
                            waiting_mac = Some((p, name.clone()));
                            report(Report::NeedMac { name, guess: None });
                        }
                    }
                }
                Command::Disconnect => {
                    if let Some(s) = connected.take() { let _ = s.peripheral.disconnect().await; }
                    if let Some((p, _)) = waiting_mac.take() { let _ = p.disconnect().await; }
                    if !report(Report::Disconnected(None)) { return }
                }
            },
            Some(event) = events.next() => match event {
                CentralEvent::DeviceDiscovered(id) | CentralEvent::DeviceUpdated(id) => {
                    let key = format!("{id:?}");
                    if seen.contains_key(&key) { continue }
                    let Ok(p) = adapter.peripheral(&id).await else { continue };
                    let Some(props) = p.properties().await.ok().flatten() else { continue };
                    let Some(name) = props.local_name else { continue };
                    if !names.iter().any(|n| name.starts_with(n)) { continue }
                    adverts.insert(key.clone(), props.manufacturer_data.clone());
                    seen.insert(key.clone(), id);
                    if !report(Report::Found { id: key, name }) { return }
                }
                CentralEvent::ManufacturerDataAdvertisement { id, manufacturer_data } => {
                    adverts.entry(format!("{id:?}")).or_default().extend(manufacturer_data);
                }
                CentralEvent::DeviceDisconnected(id) => {
                    if connected.as_ref().is_some_and(|s| s.peripheral.id() == id) {
                        connected = None;
                        if !report(Report::Disconnected(Some(qbix_core::t("The cube went out of reach")))) { return }
                    }
                }
                _ => {}
            },
            Some((data, uuid)) = async { match &mut connected { Some(s) => s.notes.next().await.map(|n| (n.value, n.uuid)), None => std::future::pending().await } } => {
                if let Some(s) = &mut connected {
                    for e in s.hear(&data, &uuid.to_string()).await {
                        if !report(Report::Cube(e)) { return }
                    }
                }
            }
            _ = poll.tick() => {
                if let Some(s) = &mut connected { s.poll().await }
            }
        }
    }
}

#[cfg(not(target_os = "android"))]
enum Opened {
    Ready(Session),
    NeedMac(Option<String>),
}

#[cfg(not(target_os = "android"))]
struct Session {
    peripheral: Peripheral,
    channels: Vec<smart::Channel>,
    decoder: Box<dyn smart::Decoder>,
    notes: std::pin::Pin<Box<dyn futures_util::Stream<Item = btleplug::api::ValueNotification> + Send>>,
    first: Vec<Event>,
}

#[cfg(not(target_os = "android"))]
impl Session {
    /// Connects, finds the protocol, listens and says hello; Ready once the cube's first state came.
    async fn open(p: Peripheral, name: &str, mac: Option<Vec<u8>>, advert: Option<&HashMap<u16, Vec<u8>>>) -> Result<Opened, String> {
        p.connect().await.map_err(|e| e.to_string())?;
        p.discover_services().await.map_err(|e| e.to_string())?;
        let services: Vec<String> = p.services().iter().map(|s| s.uuid.to_string()).collect();
        let protocols = smart::protocols();
        let protocol = protocols.iter().find(|x| services.contains(&smart::uuid(x.channels[0].service)) && x.names.iter().any(|n| name.starts_with(n))).ok_or_else(|| qbix_core::t("This device is not a cube Qbix knows"))?;
        // Its address: typed, the system's (BlueZ gives the real one), advertised, or guessed from its name.
        let mut tries: Vec<Vec<u8>> = vec![];
        if protocol.needs_mac {
            if let Some(m) = mac { tries.push(m) } else {
                let addr = p.address().into_inner().to_vec();
                if addr.iter().any(|b| *b != 0) { tries.push(addr) }
                if let Some(m) = advert.and_then(|a| smart::mac_from(protocol.id, a)) { tries.push(m) }
                tries.extend(smart::mac_guesses(protocol.id, name).iter().filter_map(|g| smart::parse_mac(g)));
            }
            if tries.is_empty() { return Ok(Opened::NeedMac(smart::mac_guesses(protocol.id, name).into_iter().next())) }
        } else {
            tries.push(vec![0; 6]);
        }
        let chars = p.characteristics();
        for mac in tries {
            let mut decoder = smart::decoder(protocol.id, name, Some(&mac)).ok_or("no decoder")?;
            for c in &protocol.channels {
                if let Some(ch) = chars.iter().find(|x| x.uuid.to_string() == smart::uuid(c.notify)) { let _ = p.subscribe(ch).await; }
            }
            let mut notes = p.notifications().await.map_err(|e| e.to_string())?;
            let mut session = Session { peripheral: p.clone(), channels: protocol.channels.clone(), decoder, notes: Box::pin(futures_util::stream::empty()), first: vec![] };
            for i in session.decoder.reads() {
                if let Some(ch) = chars.iter().find(|x| x.uuid.to_string() == smart::uuid(session.channels[i].notify)) && let Ok(v) = p.read(ch).await {
                    let events = session.decode(i, &v).await;
                    session.first.extend(events);
                }
            }
            let hello = session.decoder.hello();
            session.write(hello).await;
            // The first state within four seconds, or this address was wrong.
            let deadline = tokio::time::Instant::now() + Duration::from_secs(4);
            while !session.first.iter().any(|e| matches!(e, Event::Facelets(_))) {
                match tokio::time::timeout_at(deadline, notes.next()).await {
                    Ok(Some(n)) => {
                        let events = session.hear(&n.value, &n.uuid.to_string()).await;
                        session.first.extend(events);
                    }
                    _ => break,
                }
            }
            if session.first.iter().any(|e| matches!(e, Event::Facelets(_))) {
                session.notes = notes;
                return Ok(Opened::Ready(session));
            }
            decoder = smart::decoder(protocol.id, name, Some(&mac)).ok_or("no decoder")?;
            let _ = decoder;
        }
        if protocol.needs_mac { Ok(Opened::NeedMac(smart::mac_guesses(protocol.id, name).into_iter().next())) } else { Err(qbix_core::t("The cube did not answer")) }
    }

    async fn decode(&mut self, channel: usize, data: &[u8]) -> Vec<Event> {
        let mut out = vec![];
        let events = self.decoder.receive(channel, data, qbix_core::store::now_ms() as i64, &mut out);
        self.write(out).await;
        // A state that is not a cube (a wrong key, a garbled message) is dropped.
        events.into_iter().filter(|e| !matches!(e, Event::Facelets(f) if !smart::is_cube(f))).collect()
    }

    async fn hear(&mut self, data: &[u8], uuid: &str) -> Vec<Event> {
        let Some(channel) = self.channels.iter().position(|c| smart::uuid(c.notify) == uuid) else { return vec![] };
        self.decode(channel, data).await
    }

    async fn write(&self, messages: Vec<(usize, Vec<u8>)>) {
        let chars = self.peripheral.characteristics();
        for (c, data) in messages {
            let Some(w) = self.channels.get(c).and_then(|c| c.write) else { continue };
            if let Some(ch) = chars.iter().find(|x| x.uuid.to_string() == smart::uuid(w)) {
                let kind = if ch.properties.contains(btleplug::api::CharPropFlags::WRITE_WITHOUT_RESPONSE) { WriteType::WithoutResponse } else { WriteType::WithResponse };
                let _ = self.peripheral.write(ch, &data, kind).await;
            }
        }
    }

    async fn poll(&mut self) {
        let m = self.decoder.poll();
        self.write(m).await;
    }
}
