//! Qbix, native: iced on wgpu, one code for the desktop and Android.
mod algs;
mod ble;
mod challenges;
mod charts;
mod ctx;
mod cube3d;
mod devices;
mod diagram;
mod gallery;
mod glass;
mod help;
mod icon;
mod page;
mod picker;
mod press;
mod profile;
mod settings;
mod shell;
mod social;
mod spring;
mod theme;
mod timer;
mod tournaments;
mod training;
mod ui;

use ctx::{Ctx, SyncState, ToastAction};
use iced::keyboard;
use iced::{Element, Size, Subscription, Task, window};
use qbix_core::api::ApiError;
use qbix_core::store::Store;
use qbix_core::sync;
use shell::Section;
use spring::Spring;
use std::time::{Duration, Instant};

#[derive(Debug, Clone)]
enum LiveIn {
    Connected(qbix_core::live::Sender),
    Event(qbix_core::live::Event),
}

#[derive(Debug, Clone)]
enum BleIn {
    Started(ble::Handle),
    Report(ble::Report),
}

#[derive(Debug, Clone)]
enum Message {
    Live(LiveIn),
    Ble(BleIn),
    Devices(devices::Msg),
    Challenges(challenges::Msg),
    Social(social::Msg),
    Go(Section),
    Frame(Instant),
    Key(keyboard::Event),
    Resized(Size),
    Dropped(std::path::PathBuf),
    /// Android: a slow beat that lets the window's queued input through.
    #[cfg_attr(not(target_os = "android"), allow(dead_code))]
    Wake,
    Toast(ToastAction),
    SyncTick,
    Pushed(Vec<String>, Result<sync::PushResult, ApiError>),
    Pulled(Result<sync::Page, ApiError>),
    Timer(timer::Msg),
    Algs(algs::Msg),
    Training(training::Msg),
    Profile(profile::Msg),
    Settings(settings::Msg),
    Help(help::Msg),
    Gallery(gallery::Message),
}

struct App {
    ctx: Ctx,
    section: Section,
    timer: timer::Page,
    algs: algs::Page,
    training: training::Page,
    profile: profile::Page,
    challenges: challenges::Page,
    social: social::Page,
    devices: devices::Page,
    /// The radio runs once the smart cubes were asked for.
    radio: bool,
    settings: settings::Page,
    help: help::Page,
    gallery: Option<gallery::Gallery>,
    // The shell's motion.
    drawer: Spring,
    content: Spring,
    drawer_key: String,
    enter: Spring,
    toast: Spring,
    toast_text: Option<(String, Option<ToastAction>)>,
    toast_until: Option<Instant>,
    last_frame: Option<Instant>,
    moving: bool,
    // The synchronisation.
    syncing: bool,
    single: bool,
    pull_due: bool,
}

impl App {
    fn new() -> (Self, Task<Message>) {
        let store = Store::open(&qbix_core::store::default_dir());
        let language = if store.settings.language.is_empty() { qbix_core::i18n::system_language().to_string() } else { store.settings.language.clone() };
        qbix_core::i18n::set_language(&language);
        let ctx = Ctx::new(store);
        let (timer, task) = timer::Page::new(&ctx);
        let training = training::Page::new(&ctx);
        let gallery = std::env::args().any(|a| a == "--gallery").then(gallery::Gallery::default);
        let section = match std::env::var("QBIX_SECTION").as_deref() {
            Ok("training") => Section::Training,
            Ok("algs") => Section::Algs,
            Ok("challenges") => Section::Challenges,
            Ok("social") => Section::Social,
            Ok("profile") => Section::Profile,
            Ok("settings") => Section::Settings,
            Ok("help") => Section::Help,
            Ok("devices") => Section::Devices,
            _ => Section::Timer,
        };
        let mut app = Self {
            ctx,
            section,
            timer,
            algs: algs::Page::new(),
            training,
            profile: profile::Page::new(),
            challenges: challenges::Page::new(),
            social: social::Page::new(),
            devices: devices::Page::new(),
            radio: section == Section::Devices,
            settings: settings::Page::new(),
            help: help::Page::new(),
            gallery,
            drawer: Spring::smooth(0.0),
            content: Spring::smooth(1.0),
            drawer_key: String::new(),
            enter: Spring::smooth(1.0),
            toast: Spring::smooth(0.0),
            toast_text: None,
            toast_until: None,
            last_frame: None,
            moving: true,
            syncing: false,
            single: false,
            pull_due: true,
        };
        // Development: open a case to capture it.
        if let Ok(id) = std::env::var("QBIX_CASE") {
            app.ctx.store.settings.set_pref("algs.step.cfop", std::env::var("QBIX_STEP").unwrap_or_else(|_| "2".into()));
            app.algs.show(&id, &app.ctx);
        }
        let first = match app.section {
            Section::Training => app.training.enter(&mut app.ctx).map(Message::Training),
            Section::Profile => app.profile.enter(&app.ctx).map(Message::Profile),
            Section::Social => app.social.enter(&app.ctx).map(Message::Social),
            Section::Challenges => app.challenges.enter(&app.ctx).map(Message::Challenges),
            _ => Task::none(),
        };
        (app, Task::batch([task.map(Message::Timer), first, Task::done(Message::SyncTick)]))
    }

    fn springs(&mut self) -> [&mut Spring; 4] { [&mut self.drawer, &mut self.content, &mut self.enter, &mut self.toast] }

    fn update(&mut self, message: Message) -> Task<Message> {
        let task = match message {
            Message::Gallery(m) => {
                if let Some(g) = &mut self.gallery { g.update(m) }
                Task::none()
            }
            Message::Go(s) => {
                if s == Section::Devices { self.radio = true }
                if s != self.section {
                    self.section = s;
                    self.enter.set(0.0);
                    self.enter.to(1.0);
                    // The new page's drawer is where it was left, without sliding.
                    let open = self.drawer_open();
                    self.drawer.set(if open { 1.0 } else { 0.0 });
                    if s == Section::Training { return self.training.enter(&mut self.ctx).map(Message::Training) }
                    if s == Section::Profile { return self.profile.enter(&self.ctx).map(Message::Profile) }
                    if s == Section::Social { return self.social.enter(&self.ctx).map(Message::Social) }
                    if s == Section::Challenges { return self.challenges.enter(&self.ctx).map(Message::Challenges) }
                }
                Task::none()
            }
            Message::Frame(at) => {
                let dt = self.last_frame.map_or(1.0 / 120.0, |l| (at - l).as_secs_f32());
                self.last_frame = Some(at);
                let mut moving = false;
                for s in self.springs() {
                    moving |= s.step(dt);
                }
                let (page_moving, task) = self.timer.step(dt, at, &mut self.ctx);
                moving |= page_moving;
                moving |= self.algs.step_motion(dt);
                moving |= self.profile.step_motion(dt);
                moving |= self.settings.step_motion(dt);
                let (training_moving, training_task) = self.training.step(dt, at, &mut self.ctx);
                moving |= training_moving;
                let (challenges_moving, challenges_task) = self.challenges.step(dt, at, &mut self.ctx);
                moving |= challenges_moving | self.challenges.tournaments.step(dt, at, &self.ctx);
                if self.toast_until.is_some_and(|u| at >= u) {
                    self.toast_until = None;
                    self.toast.to(0.0);
                }
                moving |= self.toast_until.is_some();
                self.moving = moving;
                Task::batch([task.map(Message::Timer), training_task.map(Message::Training), challenges_task.map(Message::Challenges)])
            }
            Message::Key(event) => match self.section {
                Section::Timer => self.timer.key(event, &mut self.ctx).map(Message::Timer),
                Section::Training => self.training.key(event, &mut self.ctx).map(Message::Training),
                Section::Challenges if self.challenges.tournaments.play.is_some() => {
                    self.challenges.tournaments.key(&event, &self.ctx);
                    Task::none()
                }
                Section::Challenges => self.challenges.key(event, &mut self.ctx).map(Message::Challenges),
                _ => {
                    if let keyboard::Event::KeyPressed { key: keyboard::Key::Named(keyboard::key::Named::Escape), .. } = event {
                        match self.section {
                            Section::Algs => self.algs.escape(),
                            Section::Profile => self.profile.escape(),
                            Section::Social => self.social.escape(),
                            Section::Challenges => {}
                            _ => {}
                        }
                    }
                    Task::none()
                }
            },
            Message::Wake => Task::none(),
            Message::Dropped(path) => {
                self.settings.import_file(&path.to_string_lossy(), &mut self.ctx);
                Task::none()
            }
            Message::Resized(size) => {
                self.ctx.width = size.width;
                self.ctx.height = size.height;
                self.ctx.phone = size.width < 720.0;
                Task::none()
            }
            Message::Toast(ToastAction::UndoDelete) => {
                self.timer.undo(&mut self.ctx);
                self.toast_until = Some(Instant::now());
                Task::none()
            }
            Message::Timer(m) => self.timer.update(m, &mut self.ctx).map(Message::Timer),
            Message::Algs(algs::Msg::Train(ids)) => {
                self.ctx.store.settings.set_pref("training.kind", "cases");
                let task = self.training.update(training::Msg::Pool(ids), &mut self.ctx).map(Message::Training);
                Task::batch([task, self.update(Message::Go(Section::Training))])
            }
            Message::Algs(algs::Msg::TrainSteps(kind)) => {
                self.ctx.store.settings.set_pref("training.steps", kind);
                self.ctx.store.settings.set_pref("training.kind", "steps");
                self.update(Message::Go(Section::Training))
            }
            Message::Devices(m) => self.devices.update(m, &mut self.ctx).map(Message::Devices),
            Message::Ble(BleIn::Started(h)) => {
                self.ctx.ble = Some(h);
                Task::none()
            }
            Message::Ble(BleIn::Report(r)) => {
                self.smart(r);
                Task::none()
            }
            Message::Social(social::Msg::Play(id)) => {
                self.ctx.store.settings.set_pref("challenges.tab", "tournaments");
                self.challenges.tournaments.play = Some(tournaments::Play::new(id, &self.ctx));
                self.update(Message::Go(Section::Challenges))
            }
            Message::Social(m) => self.social.update(m, &mut self.ctx).map(Message::Social),
            Message::Challenges(m) => self.challenges.update(m, &mut self.ctx).map(Message::Challenges),
            Message::Live(LiveIn::Connected(sender)) => {
                self.ctx.live = Some(sender);
                if self.section == Section::Challenges { self.challenges.enter(&self.ctx).map(Message::Challenges) } else { Task::none() }
            }
            Message::Live(LiveIn::Event(qbix_core::live::Event::Message(v))) => match v["channel"].as_str().unwrap_or("") {
                "duel" => self.challenges.live(&v, &mut self.ctx).map(Message::Challenges),
                "match" => self.challenges.tournaments.live(&v, &self.ctx).map(|m| Message::Challenges(challenges::Msg::Tournaments(m))),
                "social" => self.social.live(&v, &self.ctx).map(Message::Social),
                "sync" => {
                    self.pull_due = true;
                    Task::none()
                }
                _ => Task::none(),
            },
            Message::Live(LiveIn::Event(_)) => Task::none(),
            Message::Settings(m) => {
                let task = self.settings.update(m, &mut self.ctx).map(Message::Settings);
                let s = &self.ctx.store.settings;
                self.timer.set_inspection(s.inspection, s.hold_ms);
                task
            }
            Message::Help(m) => self.help.update(m, &mut self.ctx).map(Message::Help),
            Message::Profile(m) => self.profile.update(m, &mut self.ctx).map(Message::Profile),
            Message::Training(m) => self.training.update(m, &mut self.ctx).map(Message::Training),
            Message::Algs(m) => self.algs.update(m, &mut self.ctx).map(Message::Algs),
            Message::SyncTick => {
                self.pull_due = true;
                Task::none()
            }
            Message::Pushed(ids, result) => {
                self.syncing = false;
                match result {
                    Ok(r) => {
                        sync::pushed(&mut self.ctx.store, r);
                        self.single = false;
                        self.ctx.changed();
                    }
                    Err(e) => self.sync_failed(&ids, e),
                }
                Task::none()
            }
            Message::Pulled(result) => {
                self.syncing = false;
                match result {
                    Ok(page) => {
                        let more = page.more;
                        sync::merge(&mut self.ctx.store, page);
                        self.pull_due = more;
                        self.ctx.sync = SyncState::Synced;
                        self.ctx.changed();
                    }
                    Err(e) => self.sync_failed(&[], e),
                }
                Task::none()
            }
        };
        self.after();
        Task::batch([task, self.sync()])
    }

    /// What the radio said: the smart cube's state follows it.
    fn smart(&mut self, r: ble::Report) {
        use qbix_core::smart::Event;
        let sm = &mut self.ctx.smart;
        sm.revision += 1;
        match r {
            ble::Report::Unavailable(e) => sm.error = Some(e),
            ble::Report::Found { id, name } => if !sm.found.iter().any(|f| f.0 == id) { sm.found.push((id, name)) },
            ble::Report::Connecting(name) => {
                sm.connecting = Some(name);
                sm.error = None;
            }
            ble::Report::NeedMac { name, guess } => {
                sm.connecting = None;
                sm.need_mac = Some((name, guess));
            }
            ble::Report::Connected { name, .. } => {
                sm.connecting = None;
                sm.need_mac = None;
                sm.scanning = false;
                sm.turns.clear();
                self.ctx.toast(qbix_core::tf("{0} connected", &[&name]));
                self.ctx.store.settings.smart_cube = Some(name.clone());
                self.ctx.smart.name = Some(name);
            }
            ble::Report::Cube(Event::Facelets(f)) => sm.cube = Some(qbix_core::smart::cube_of(&f)),
            ble::Report::Cube(Event::Move { turn, at }) => {
                if let Some(c) = &mut sm.cube { c.apply(&turn); }
                sm.turns.push((turn.clone(), at));
                self.timer.smart_turn(&turn, at, &mut self.ctx);
            }
            ble::Report::Cube(Event::Battery(b)) => sm.battery = Some(b),
            ble::Report::Cube(Event::Orientation(_)) => sm.revision -= 1,
            ble::Report::Disconnected(e) => {
                let was = sm.name.take();
                sm.cube = None;
                sm.connecting = None;
                sm.error = e.clone();
                if let Some(name) = was { self.ctx.toast(e.unwrap_or_else(|| qbix_core::tf("{0} disconnected", &[&name]))) }
            }
        }
    }

    fn sync_failed(&mut self, ids: &[String], e: ApiError) {
        if e.expired() {
            self.ctx.sync = SyncState::SignIn;
        } else if e.refused() {
            if ids.len() > 1 { self.single = true } else { sync::refused(&mut self.ctx.store, ids, e.message()) }
            self.ctx.sync = SyncState::Error(e.message());
            self.ctx.changed();
        } else {
            self.ctx.sync = SyncState::Offline;
        }
    }

    /// Starts the next synchronisation step, if one is due and none runs.
    fn sync(&mut self) -> Task<Message> {
        if std::mem::take(&mut self.ctx.pull) {
            self.pull_due = true;
            self.ctx.sync = SyncState::Synced;
        }
        if self.syncing || !self.ctx.store.signed_in() || self.ctx.sync == SyncState::SignIn { return Task::none() }
        if matches!(self.ctx.sync, SyncState::Offline | SyncState::Error(_)) && !self.pull_due { return Task::none() }
        let api = self.ctx.api();
        if let Some(push) = sync::next_push(&mut self.ctx.store, self.single) {
            self.syncing = true;
            self.ctx.sync = SyncState::Syncing;
            let ids = push.ids.clone();
            return Task::perform(ctx::spawn(move || api.post::<sync::PushResult>("sync", &push.body)), move |r| Message::Pushed(ids.clone(), r));
        }
        if self.pull_due {
            self.pull_due = false;
            self.syncing = true;
            self.ctx.sync = SyncState::Syncing;
            let path = sync::pull_path(&self.ctx.store);
            return Task::perform(ctx::spawn(move || api.get::<sync::Page>(&path)), Message::Pulled);
        }
        Task::none()
    }

    /// The page's drawer: whether it is open, and what it shows.
    fn page_drawer(&self) -> (bool, String) {
        let d = match self.section {
            Section::Timer => self.timer.view(&self.ctx).drawer.map(|d| (d.open, d.key)),
            Section::Algs => self.algs.view(&self.ctx).drawer.map(|d| (d.open, d.key)),
            Section::Training => self.training.view(&self.ctx).drawer.map(|d| (d.open, d.key)),
            Section::Profile => self.profile.view(&self.ctx).drawer.map(|d| (d.open, d.key)),
            Section::Challenges => self.challenges.view(&self.ctx).drawer.map(|d| (d.open, d.key)),
            Section::Social => self.social.view(&self.ctx).drawer.map(|d| (d.open, d.key)),
            _ => None,
        };
        d.unwrap_or((false, String::new()))
    }

    fn drawer_open(&self) -> bool { self.page_drawer().0 }

    /// After every message: the shell's springs follow the page, the toast shows what the page said.
    fn after(&mut self) {
        match self.section {
            Section::Devices => self.devices.refresh(&self.ctx),
            Section::Profile => self.profile.refresh(&self.ctx),
            Section::Training => self.training.refresh_stats(&self.ctx),
            _ => {}
        }
        let (open, key) = self.page_drawer();
        self.drawer.to(if open { 1.0 } else { 0.0 });
        if key != self.drawer_key {
            if self.drawer.value > 0.05 && !self.drawer_key.is_empty() {
                self.content.set(0.0);
                self.content.to(1.0);
            }
            self.drawer_key = key;
        }
        self.ctx.drawer = self.drawer.value.max(0.0);
        if let Some(t) = self.ctx.toast.take() {
            self.toast_text = Some(t);
            self.toast.to(1.0);
            self.toast_until = Some(Instant::now() + Duration::from_secs(5));
        }
        let shell_moving = [&self.drawer, &self.content, &self.enter, &self.toast].iter().any(|s| !s.settled());
        self.moving |= shell_moving || self.toast_until.is_some() || self.timer.busy() || self.training.busy() || self.challenges.busy() || self.challenges.tournaments.busy();
        if !self.moving { self.last_frame = None }
    }

    fn view(&self) -> Element<'_, Message> {
        if let Some(g) = &self.gallery { return g.view().map(Message::Gallery) }
        let view = match self.section {
            Section::Timer => self.timer.view(&self.ctx).map(Message::Timer),
            Section::Algs => self.algs.view(&self.ctx).map(Message::Algs),
            Section::Training => self.training.view(&self.ctx).map(Message::Training),
            Section::Profile => self.profile.view(&self.ctx).map(Message::Profile),
            Section::Settings => self.settings.view(&self.ctx).map(Message::Settings),
            Section::Challenges => self.challenges.view(&self.ctx).map(Message::Challenges),
            Section::Social => self.social.view(&self.ctx).map(Message::Social),
            Section::Help => self.help.view(&self.ctx).map(Message::Help),
            Section::Devices => self.devices.view(&self.ctx).map(Message::Devices),
        };
        let pending = self.ctx.store.outbox.len();
        shell::frame(shell::Frame {
            section: self.section,
            view,
            motion: shell::Motion { drawer: self.drawer.value, content: self.content.value, enter: self.enter.value, toast: self.toast.value },
            phone: self.ctx.phone,
            user: self.ctx.username(),
            signed_in: self.ctx.store.signed_in(),
            toast: self.toast_text.clone().map(|(text, action)| (text, action.map(Message::Toast))),
            go: Message::Go,
            sync: shell::sync_badge(&self.ctx.sync, pending),
        })
    }

    fn subscription(&self) -> Subscription<Message> {
        let dropped = iced::event::listen_with(|e, _, _| match e {
            iced::Event::Window(window::Event::FileDropped(p)) => Some(Message::Dropped(p)),
            _ => None,
        });
        let mut subs = vec![dropped, keyboard::listen().map(Message::Key), window::resize_events().map(|(_, s)| Message::Resized(s)), Subscription::run(ticks)];
        if self.moving {
            #[cfg(not(target_os = "android"))]
            subs.push(window::frames().map(Message::Frame));
            // On Android the window's frames stop until the next touch: a beat of its own drives the motion.
            #[cfg(target_os = "android")]
            subs.push(Subscription::run(android_frames));
        }
        #[cfg(target_os = "android")]
        subs.push(Subscription::run(android_wake));
        subs.push(Subscription::run_with((self.ctx.store.settings.server.clone(), self.ctx.store.token.clone()), live_stream));
        if self.radio || self.ctx.store.settings.smart_cube.is_some() { subs.push(Subscription::run(radio_stream)) }
        Subscription::batch(subs)
    }
}

/// The app's socket, open again when the server or the account changes.
fn live_stream(key: &(String, Option<String>)) -> impl iced::futures::Stream<Item = Message> + use<> {
    let (tx, rx) = iced::futures::channel::mpsc::unbounded();
    let events = tx.clone();
    let sender = qbix_core::live::connect(&key.0, key.1.clone(), 0, move |e| events.unbounded_send(Message::Live(LiveIn::Event(e))).is_ok());
    let _ = tx.unbounded_send(Message::Live(LiveIn::Connected(sender)));
    rx
}

#[cfg(target_os = "android")]
fn android_frames() -> impl iced::futures::Stream<Item = Message> {
    use iced::futures::StreamExt;
    let (mut tx, rx) = iced::futures::channel::mpsc::channel(1);
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(Duration::from_millis(8));
            if tx.is_closed() { break }
            let _ = tx.try_send(());
        }
    });
    rx.map(|_| Message::Frame(Instant::now()))
}

#[cfg(target_os = "android")]
fn android_wake() -> impl iced::futures::Stream<Item = Message> {
    use iced::futures::StreamExt;
    let (mut tx, rx) = iced::futures::channel::mpsc::channel(1);
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(Duration::from_millis(60));
            if tx.is_closed() { break }
            let _ = tx.try_send(());
        }
    });
    rx.map(|_| Message::Wake)
}

/// The radio of smart cubes, in its thread.
fn radio_stream() -> impl iced::futures::Stream<Item = Message> {
    let (tx, rx) = iced::futures::channel::mpsc::unbounded();
    let reports = tx.clone();
    let handle = ble::start(move |r| reports.unbounded_send(Message::Ble(BleIn::Report(r))).is_ok());
    let _ = tx.unbounded_send(Message::Ble(BleIn::Started(handle)));
    rx
}

/// A beat every 45 seconds: the account's changes are pulled then.
fn ticks() -> impl iced::futures::Stream<Item = Message> {
    use iced::futures::StreamExt;
    let (mut tx, rx) = iced::futures::channel::mpsc::channel(1);
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(Duration::from_secs(45));
            if tx.try_send(()).is_err() && tx.is_closed() { break }
        }
    });
    rx.map(|_| Message::SyncTick)
}

pub fn run() -> iced::Result {
    #[cfg(not(target_os = "android"))]
    let window = window::Settings { size: Size::new(1440.0, 900.0), min_size: Some(Size::new(360.0, 600.0)), platform_specific: window::settings::PlatformSpecific { application_id: "qbix".into(), ..Default::default() }, ..Default::default() };
    #[cfg(target_os = "android")]
    let window = window::Settings::default();
    let mut app = iced::application(App::new, App::update, App::view).subscription(App::subscription).title("Qbix").window(window).antialiasing(true).default_font(theme::text(400));
    for font in theme::FONTS {
        app = app.font(font);
    }
    app.run()
}

/// The Android app's entry: the activity handed to iced, the app's files in its private folder.
#[cfg(target_os = "android")]
#[unsafe(no_mangle)]
fn android_main(app: iced_winit::android::AndroidApp) {
    struct Keyboard(iced_winit::android::AndroidApp);
    impl iced_winit::android::Platform for Keyboard {
        fn show_keyboard(&self, _: iced::advanced::input_method::Purpose) { self.0.show_soft_input(true) }
        fn hide_keyboard(&self) { self.0.hide_soft_input(true) }
        fn read_clipboard(&self) -> Option<String> { None }
        fn write_clipboard(&self, _: String) {}
    }
    if let Some(dir) = app.internal_data_path() {
        // SAFETY: set once, before any other thread starts.
        unsafe { std::env::set_var("QBIX_DATA_DIR", dir) };
    }
    iced_winit::android::init(app.clone(), Keyboard(app));
    let _ = run();
}
