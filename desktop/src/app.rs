mod guides;
mod navigation;
mod virtuals;
use crate::{
    assets::Images,
    cube::{CubeView, Scene},
    engine::Engine,
    input::TextInput,
    theme::Theme,
    timer::{Phase, Stopped, Timer, time},
};
use gpui::{prelude::*, *};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
};
fn s<'a>(v: &'a Value, k: &str) -> &'a str {
    v[k].as_str().unwrap_or("")
}
fn list(v: &Value) -> Vec<Value> {
    v.as_array().cloned().unwrap_or_default()
}
fn number(v: &Value) -> f64 {
    v.as_f64().unwrap_or(0.)
}
fn ft(v: &Value) -> String {
    v.as_f64().map(time).unwrap_or_else(|| "–".into())
}
fn puzzle(v: &Value) -> String {
    v["puzzle_id"]
        .as_str()
        .map(str::to_owned)
        .unwrap_or_else(|| v["cube_size"].as_u64().unwrap_or(3).to_string().repeat(3))
}
/// "OLL · Fish", "F2L · Disconnected Pairs": the set a case belongs to and its group.
fn case_kind(c: &Value) -> String {
    let (set, group) = (s(c, "setLabel"), s(c, "group"));
    if group.is_empty() || group.eq_ignore_ascii_case(set) {
        set.to_owned()
    } else {
        format!("{set} · {group}")
    }
}
/// Every whitespace-separated word of the query must appear in the case's id, name, set, stage or group.
fn case_matches(c: &Value, query: &str) -> bool {
    let haystack = format!(
        "{} {} {} {} {} {}",
        s(c, "id"),
        s(c, "name"),
        s(c, "setLabel"),
        s(c, "stage"),
        s(c, "group"),
        s(c, "subgroup")
    )
    .to_lowercase();
    query
        .split_whitespace()
        .all(|word| haystack.contains(&word.to_lowercase()))
}
fn row() -> Div {
    div().flex().items_center()
}
fn col() -> Div {
    div().flex().flex_col()
}
fn txt(text: impl AsRef<str>, size: f32) -> Div {
    div().text_size(px(size)).child(text.as_ref().to_string())
}
fn bold(text: impl AsRef<str>, size: f32) -> Div {
    txt(text, size).font_weight(FontWeight::BOLD)
}
fn icon(name: &str, size: f32) -> Div {
    let path: SharedString = format!("icons/{name}.svg").into();
    div()
        .size(px(size))
        .flex_none()
        .flex()
        .items_center()
        .justify_center()
        .child(
            canvas(
                |_, _, _| (),
                move |bounds, _, window, cx| {
                    let _ = window.paint_svg(
                        bounds,
                        path.clone(),
                        Default::default(),
                        window.text_style().color,
                        cx,
                    );
                },
            )
            .size_full(),
        )
}
fn puzzle_icon(id: &str, size: f32) -> Div {
    icon(&format!("Puzzle{id}"), size)
}
pub struct Cubix {
    engine: Engine,
    images: Images,
    catalog: Value,
    cases_cache: Option<(String, std::rc::Rc<Vec<Value>>)>,
    sets_cache: Option<(String, std::rc::Rc<Vec<Value>>)>,
    cube_view: Entity<CubeView>,
    cube_key: String,
    cube_scenes: HashMap<String, std::sync::Arc<Scene>>,
    guides: Value,
    prefs: HashMap<String, Value>,
    page: String,
    back_stack: Vec<navigation::Location>,
    forward_stack: Vec<navigation::Location>,
    /// Trackpad travel accumulated for the two-finger history swipe.
    swipe: navigation::Swipe,
    case_id: String,
    profile_mode: String,
    profile_stage: String,
    profile_filter: (String, String, String),
    achievement_group: String,
    achievement_filter: String,
    catalog_stage: String,
    puzzle: String,
    solve_mode: String,
    scramble_type: String,
    scramble: String,
    user: Value,
    solves: Vec<Value>,
    stats: Vec<Value>,
    profile: Value,
    achievements: Value,
    case_history: Value,
    fields: HashMap<String, Entity<TextInput>>,
    focus: FocusHandle,
    timer: Entity<Timer>,
    hide: f32,
    hide_from: f32,
    hide_since: std::time::Instant,
    sessions: HashMap<String, i64>,
    pending_solve: Value,
    training: Value,
    show_times: bool,
    show_cases: bool,
    revealed: bool,
    editing: bool,
    login: bool,
    learning_filter: String,
    collapsed: HashSet<String>,
    sets: HashMap<String, String>,
    selected: HashSet<String>,
    learned: HashSet<String>,
    /// Selected training cases still to learn; once learning empties it, the page celebrates.
    learn_goal: HashSet<String>,
    learn_notice: Option<std::time::Instant>,
    /// The goal was met away from the training page: show the notice when it next appears.
    learn_notice_pending: bool,
    /// Praise for the timer solve that just beat a personal best, with the moment it appeared.
    record_notice: Option<(String, std::time::Instant)>,
    random_auf: bool,
    overlay: String,
    control_bounds: std::rc::Rc<std::cell::RefCell<HashMap<String, Bounds<Pixels>>>>,
    select_index: usize,
    overlay_solve: Option<Value>,
    /// The solve whose note is being edited in the comment overlay.
    comment_solve: i64,
    /// The time just recorded: it keeps its buttons under the timer until the next attempt or its deletion.
    last_solve: i64,
    error: String,
    saving: bool,
    generating: bool,
    sync: Value,
    theme_name: String,
    light: bool,
    width: f32,
    height: f32,
    theme: Theme,
    subscriptions: Vec<Subscription>,
    snapshot_revision: u64,
    snapshot_busy: bool,
    advance_pending: bool,
    advance_key: String,
    scrolls: HashMap<String, ScrollHandle>,
    virtual_lists: HashMap<String, (ListState, std::rc::Rc<Vec<Value>>, f32)>,
    selector_open: HashMap<String, bool>,
    #[cfg(feature = "reference")]
    virtual_rows_rendered: u64,
}
impl Cubix {
    pub fn new(root: PathBuf, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let catalog: Value = serde_json::from_slice(
            &std::fs::read(root.join("catalog.json")).expect("catalogue missing"),
        )
        .unwrap();
        let (engine, rx) = Engine::start().expect("could not start Cubix data engine");
        let timer = cx.new(|_| Timer::new());
        let focus = cx.focus_handle();
        focus.focus(window);
        let mut fields = HashMap::new();
        for (name, hint, password) in [
            ("username", "", false),
            ("password", "", true),
            ("cases", "Search cases…", false),
            ("search", "Search a case: oll fish, pll t, f2l 6…", false),
            ("comment", "What happened on this solve?", false),
        ] {
            fields.insert(name.into(), cx.new(|cx| TextInput::new(hint, password, cx)));
        }
        let mut app = Self {
            back_stack: Vec::new(),
            forward_stack: Vec::new(),
            swipe: navigation::Swipe::default(),
            engine,
            guides: serde_json::from_slice(&std::fs::read(root.join("guides.json")).unwrap())
                .unwrap(),
            images: Images::new(root),
            catalog,
            cases_cache: None,
            sets_cache: None,
            cube_view: cx.new(|_| CubeView::new()),
            cube_key: String::new(),
            cube_scenes: HashMap::new(),
            prefs: HashMap::new(),
            page: std::env::var("CUBIX_SCREEN").unwrap_or("playground".into()),
            case_id: String::new(),
            profile_mode: "playground".into(),
            profile_stage: "all".into(),
            profile_filter: ("333".into(), "standard".into(), "random-moves".into()),
            achievement_group: "all".into(),
            achievement_filter: "all".into(),
            catalog_stage: String::new(),
            puzzle: "333".into(),
            solve_mode: "standard".into(),
            scramble_type: "random-moves".into(),
            scramble: String::new(),
            user: json!({"isGuest":true,"username":"Guest"}),
            solves: vec![],
            stats: vec![],
            profile: Value::Null,
            achievements: Value::Null,
            case_history: Value::Null,
            fields,
            focus,
            timer,
            sessions: HashMap::new(),
            pending_solve: Value::Null,
            training: Value::Null,
            show_times: false,
            show_cases: f32::from(window.viewport_size().width) >= 1024.,
            revealed: false,
            editing: false,
            login: false,
            learning_filter: "all".into(),
            collapsed: HashSet::new(),
            sets: HashMap::new(),
            selected: HashSet::new(),
            learned: HashSet::new(),
            learn_goal: HashSet::new(),
            learn_notice: None,
            learn_notice_pending: false,
            record_notice: None,
            random_auf: true,
            overlay: String::new(),
            control_bounds: Default::default(),
            select_index: 0,
            overlay_solve: None,
            comment_solve: 0,
            last_solve: 0,
            error: String::new(),
            saving: false,
            generating: false,
            sync: Value::Null,
            theme_name: "t3-code".into(),
            light: false,
            width: 1280.,
            height: 800.,
            theme: Theme::new("t3-code", false),
            subscriptions: vec![],
            snapshot_revision: 0,
            snapshot_busy: false,
            advance_pending: false,
            advance_key: String::new(),
            scrolls: HashMap::new(),
            virtual_lists: HashMap::new(),
            selector_open: HashMap::new(),
            hide: 0.,
            hide_from: 0.,
            hide_since: std::time::Instant::now(),
            #[cfg(feature = "reference")]
            virtual_rows_rendered: 0,
        };
        app.subscriptions
            .push(cx.subscribe(&app.timer, |this, _, stopped: &Stopped, cx| {
                this.save_solve(stopped.0, cx)
            }));
        app.subscriptions.push(cx.subscribe(
            &app.timer,
            |this, _, _: &crate::timer::PhaseChanged, cx| {
                this.hide_from = this.hide;
                this.hide_since = std::time::Instant::now();
                cx.notify()
            },
        ));
        let field = app.fields["cases"].clone();
        app.subscriptions
            .push(cx.observe(&field, move |_, _, cx| cx.notify()));
        cx.spawn(async move |this, cx| {
            while let Ok(message) = rx.recv().await {
                if this
                    .update(cx, |this, cx| this.receive(message, cx))
                    .is_err()
                {
                    break;
                }
            }
        })
        .detach();
        #[cfg(feature = "reference")]
        if let Ok(directory) = std::env::var("CUBIX_REFERENCE_CONTROL") {
            assert!(
                std::env::var("CUBIX_API_ORIGIN")
                    .is_ok_and(|s| s.starts_with("http://127.0.0.1:")
                        || s.starts_with("http://localhost:")),
                "Reference controls require a local test API"
            );
            let directory = PathBuf::from(directory);
            std::fs::create_dir_all(&directory).unwrap();
            cx.spawn_in(window, async move |this, cx| {
                loop {
                    cx.background_executor().timer(std::time::Duration::from_millis(40)).await;
                    if this.update_in(cx, |s, window, cx| {
                        let command = directory.join("command.json");
                        if let Ok(bytes) = std::fs::read(&command) {
                            let _ = std::fs::remove_file(&command);
                            if let Ok(v) = serde_json::from_slice::<Value>(&bytes) {
                                if let Some(fields) = v["fields"].as_object() {for (name,value) in fields {if let Some(f)=s.fields.get(name) {f.update(cx,|f,cx|f.set(value.as_str().unwrap_or("").into(),cx));}}}
                                for action in list(&v["actions"]) {if let Some(a)=action.as_str() {s.action(a,window,cx);}}
                                match v["timer"].as_str() {Some("press")=>s.timer.update(cx,|t,cx|t.press(cx)),Some("release")=>s.timer.update(cx,|t,cx|t.release(cx)),_=>{}}
                                if let Some(route)=v["route"].as_str(){s.page=route.into();s.refresh();cx.notify();}
                                if v["quit"]==true {cx.quit();}
                            }
                        }
                        let state=json!({"page":s.page,"case":s.case_id,"puzzle":s.puzzle,"pending":s.engine.pending.len(),"error":s.error,"solves":s.solves.len(),"achievements":s.achievements["unlocked"],"training":s.training["id"],"phase":format!("{:?}",s.timer.read(cx).phase),"saving":s.saving,"generating":s.generating,"selected":s.selected,"learned":s.learned,"learnNotice":s.learn_notice.is_some()||s.learn_notice_pending,"recordNotice":s.record_notice.as_ref().map(|(message,_)|message.clone()),"overlay":s.overlay,"virtualRowsRendered":s.virtual_rows_rendered,"scramble":s.scramble,"solveMode":s.solve_mode,"selectIndex":s.select_index,"metrics":s.metrics(),"bounds":s.control_bounds.borrow().iter().map(|(k,b)|(k.clone(),json!({"x":f32::from(b.origin.x),"y":f32::from(b.origin.y),"w":f32::from(b.size.width),"h":f32::from(b.size.height)}))).collect::<serde_json::Map<_,_>>()});
                        let _ = std::fs::write(directory.join("state.tmp"),state.to_string());
                        let _ = std::fs::rename(directory.join("state.tmp"),directory.join("state.json"));
                    }).is_err(){break;}
                }
            }).detach();
        }
        app.call("init", "init", json!([]));
        app
    }
    fn guest(&self) -> bool {
        self.user["isGuest"].as_bool().unwrap_or(true)
    }
    fn field(&self, name: &str, cx: &App) -> String {
        self.fields[name].read(cx).content.to_string()
    }
    fn call(&mut self, key: &str, method: &str, args: Value) {
        if let Err(e) = self.engine.call(key, method, args) {
            self.error = e.to_string();
        }
    }
    fn pref(&mut self, key: &str, value: Value) {
        self.prefs.insert(key.into(), value.clone());
        self.call("pref", "preference", json!([key, value]));
    }
    fn context(&self) -> Value {
        json!({"puzzle":self.puzzle,"solveMode":self.solve_mode,"scrambleType":if self.page=="training"{"case"}else{&self.scramble_type}})
    }
    /// Each launch practises in its own session per context: the times panel and the stats only
    /// show solves recorded since the application started, while every solve still synchronizes
    /// to the account and counts in the profile. Nothing is restored from earlier launches.
    fn keep_launch_session(&mut self) {
        let id = self.sessions.get(&self.context_key()).copied();
        self.solves
            .retain(|v| id.is_some_and(|id| v["session_id"] == id));
    }
    fn context_key(&self) -> String {
        format!(
            "{}:{}:{}:{}",
            self.page, self.puzzle, self.solve_mode, self.scramble_type
        )
    }
    fn filter_puzzle(&self) -> &str {
        if self.page == "profile" {
            &self.profile_filter.0
        } else {
            &self.puzzle
        }
    }
    // The catalogue never mutates after load, so the per-puzzle case/set
    // lists (each entry carries algorithm lists and cube state arrays) are
    // cached instead of being deep-cloned and re-filtered out of the full
    // ~1300-entry catalogue on every render, which was the dominant cost
    // behind laggy scrolling on the catalog/selector pages.
    fn all_cases(&mut self) -> std::rc::Rc<Vec<Value>> {
        let key = self.filter_puzzle().to_owned();
        if self.cases_cache.as_ref().map(|(k, _)| k) != Some(&key) {
            let cases = self.catalog["cases"]
                .as_array()
                .into_iter()
                .flatten()
                .filter(|c| puzzle(c) == key)
                .cloned()
                .collect();
            self.cases_cache = Some((key, std::rc::Rc::new(cases)));
        }
        self.cases_cache.as_ref().unwrap().1.clone()
    }
    fn all_sets(&mut self) -> std::rc::Rc<Vec<Value>> {
        let key = self.filter_puzzle().to_owned();
        if self.sets_cache.as_ref().map(|(k, _)| k) != Some(&key) {
            let sets = self.catalog["sets"]
                .as_array()
                .into_iter()
                .flatten()
                .filter(|c| puzzle(c) == key)
                .cloned()
                .collect();
            self.sets_cache = Some((key, std::rc::Rc::new(sets)));
        }
        self.sets_cache.as_ref().unwrap().1.clone()
    }
    /// Cases of the current puzzle matching the Ctrl+K query, in catalogue order.
    fn search_results(&mut self, cx: &App) -> Vec<Value> {
        let query = self.field("search", cx).trim().to_lowercase();
        if query.is_empty() {
            return Vec::new();
        }
        self.all_cases()
            .iter()
            .filter(|c| case_matches(c, &query))
            .take(12)
            .cloned()
            .collect()
    }
    fn open_search(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.overlay = "search".into();
        self.select_index = 0;
        let field = self.input("search");
        field.update(cx, |f, cx| f.set(String::new(), cx));
        field.read(cx).focus(window);
        cx.notify();
    }
    fn close_search(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.overlay.clear();
        self.focus.focus(window);
        cx.notify();
    }
    fn find_case(&self, id: &str) -> Value {
        self.catalog["cases"]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| s(c, "id") == id)
            .cloned()
            .unwrap_or(Value::Null)
    }
    fn puzzle_info(&self) -> Value {
        list(&self.catalog["puzzles"]["puzzles"])
            .into_iter()
            .find(|p| s(p, "id") == self.puzzle)
            .unwrap_or(Value::Null)
    }
    fn label(&self, kind: &str, id: &str) -> String {
        list(&self.catalog["puzzles"][kind])
            .iter()
            .find(|p| s(p, "id") == id)
            .map(|p| s(p, "label").to_string())
            .unwrap_or(id.into())
    }
    fn load_context(&mut self) {
        self.catalog_stage = self
            .prefs
            .get("cubix.algs.stageByCube")
            .and_then(|v| v[&self.puzzle].as_str())
            .unwrap_or("")
            .into();
        if let Some(map) = self
            .prefs
            .get("cubix.algs.collapsedGroups")
            .and_then(Value::as_object)
        {
            for (k, v) in map {
                if v == true {
                    self.collapsed.insert(k.clone());
                }
            }
        }

        self.solve_mode = self
            .prefs
            .get("cubix.practice.modeByPuzzle")
            .and_then(|v| v[&self.puzzle].as_str())
            .unwrap_or("standard")
            .into();
        self.scramble_type = self
            .prefs
            .get("cubix.practice.typeByPuzzle")
            .and_then(|v| v[&self.puzzle].as_str())
            .unwrap_or(if self.puzzle_info()["cubeSize"].is_null() {
                "competition"
            } else {
                "random-moves"
            })
            .into();
        self.selected = self
            .prefs
            .get("cubix.training.selectionByCube")
            .map(|v| list(&v[&self.puzzle]))
            .unwrap_or_default()
            .into_iter()
            .filter_map(|v| v.as_str().map(str::to_owned))
            .collect();
        self.sets = self
            .prefs
            .get("cubix.algs.setByCube")
            .and_then(|v| v[&self.puzzle].as_object())
            .map(|v| {
                v.iter()
                    .filter_map(|(k, v)| v.as_str().map(|v| (k.clone(), v.to_string())))
                    .collect()
            })
            .unwrap_or_default();
        if !self
            .prefs
            .get("cubix.algs.setByCube")
            .is_some_and(|v| v.get(&self.puzzle).is_some())
        {
            self.sets = HashMap::from([
                ("F2L".into(), "f2l".into()),
                ("OLL".into(), "oll".into()),
                ("PLL".into(), "pll".into()),
            ]);
        }
        let key = format!("{}:{}:{}", self.puzzle, self.solve_mode, self.scramble_type);
        self.scramble = self
            .prefs
            .get("cubix.playground.scrambleByContext")
            .and_then(|v| v[&key].as_str())
            .unwrap_or("")
            .into();
    }
    fn save_per_puzzle(&mut self, key: &str, value: Value) {
        let mut map = self.prefs.get(key).cloned().unwrap_or(json!({}));
        map[&self.puzzle] = value;
        self.pref(key, map);
    }
    fn refresh(&mut self) {
        self.snapshot_revision += 1;
        if !self.snapshot_busy {
            self.request_snapshot();
        }
    }
    fn request_snapshot(&mut self) {
        self.snapshot_busy = true;
        self.call("snapshot","snapshot",json!([{"revision":self.snapshot_revision,"context":self.context(),"page":self.page,"caseId":self.case_id,"profilePuzzle":self.profile_filter.0,"profileFilter":{"solveMode":self.profile_filter.1,"scrambleType":self.profile_filter.2},"advance":self.advance_pending,"advanceKey":self.advance_key,"selected":self.selected,"randomAuf":self.random_auf}]));
    }
    fn receive(&mut self, message: Value, cx: &mut Context<Self>) {
        if std::env::var_os("CUBIX_TRACE").is_some() {
            eprintln!("engine {:?} {:?}", message["id"], message["event"]);
        }
        if let Some(event) = message["event"].as_str() {
            match event {
                "sync" => self.sync = message["value"].clone(),
                "live" => {}
                "changed" => {
                    self.refresh();
                    return;
                }
                "engine-exit" => {
                    self.error = "The data engine stopped. Restart Cubix to reconnect.".into()
                }
                _ => {}
            }
            cx.notify();
            return;
        }
        let key = self
            .engine
            .pending
            .remove(&message["id"].as_u64().unwrap_or(0))
            .unwrap_or_default();
        if let Some(request_key) = key.strip_prefix("cubePreview:") {
            if request_key == self.cube_key {
                if let Some(error) = message["error"].as_str() {
                    self.error = format!("Cube preview: {error}");
                } else {
                    let scene = Scene::from_value(&message["value"]);
                    if scene.is_none() {
                        self.error = "Invalid cube preview".into();
                    }
                    self.cube_view.update(cx, |view, cx| view.load(scene, cx));
                }
                cx.notify();
            }
            return;
        }
        if let Some(error) = message["error"].as_str() {
            if key == "snapshot" {
                self.snapshot_busy = false;
            }
            self.error = error.into();
            self.saving = false;
            self.generating = false;
            cx.notify();
            return;
        }
        let value = message["value"].clone();
        match key.as_str() {
            "snapshot" => {
                self.snapshot_busy = false;
                if value["revision"].as_u64() != Some(self.snapshot_revision) {
                    self.request_snapshot();
                    return;
                }
                self.solves = list(&value["solves"]);
                // Learning marks synchronize across devices, so each snapshot carries the current set.
                if let Some(v) = value.get("learned") {
                    self.learned = list(v)
                        .iter()
                        .filter_map(|v| v.as_str().map(str::to_owned))
                        .collect();
                    self.sync_learning_goal(cx);
                }
                self.keep_launch_session();
                self.solves.reverse();
                self.stats = list(&value["stats"]);
                if let Some(v) = value.get("profile") {
                    self.profile = v.clone();
                }
                if let Some(v) = value.get("caseHistory") {
                    self.case_history = v.clone();
                }
                if let Some(v) = value.get("achievements") {
                    self.achievements = v.clone();
                }
                if let Some(v) = value.get("training") {
                    self.training = v.clone();
                    self.revealed = false;
                }
                if let Some(v) = value.get("scramble") {
                    self.scramble = v.as_str().unwrap_or("").into();
                    let mut map = self
                        .prefs
                        .get("cubix.playground.scrambleByContext")
                        .cloned()
                        .unwrap_or(json!({}));
                    map[format!("{}:{}:{}", self.puzzle, self.solve_mode, self.scramble_type)] =
                        json!(self.scramble);
                    self.pref("cubix.playground.scrambleByContext", map);
                }
                if self.advance_pending {
                    self.advance_pending = false;
                    self.saving = false;
                    self.generating = false;
                }
            }
            "init" => {
                if value["protocol"] != 2 {
                    self.error="This build and its data engine have different versions. Rebuild or reopen the complete application package.".into();
                    cx.notify();
                    return;
                }
                self.user = value["user"].clone();
                if let Some(storage) = value["storage"].as_object() {
                    for (k, v) in storage {
                        if let Some(raw) = v.as_str() {
                            if let Ok(val) = serde_json::from_str(raw) {
                                self.prefs.insert(k.clone(), val);
                            }
                        }
                    }
                }
                self.theme_name = self
                    .prefs
                    .get("cubix.ui.theme")
                    .and_then(Value::as_str)
                    .unwrap_or("t3-code")
                    .into();
                self.light =
                    self.prefs.get("cubix.ui.colorMode").and_then(Value::as_str) == Some("light");
                self.puzzle = self
                    .prefs
                    .get("cubix.puzzle")
                    .and_then(Value::as_str)
                    .unwrap_or("333")
                    .into();
                self.random_auf = self
                    .prefs
                    .get("cubix.training.randomAuf")
                    .and_then(Value::as_bool)
                    .unwrap_or(true);
                self.learned = list(&value["learned"])
                    .iter()
                    .filter_map(|v| v.as_str().map(str::to_owned))
                    .collect();
                self.learning_filter = self
                    .prefs
                    .get("cubix.algs.learningFilter")
                    .and_then(Value::as_str)
                    .filter(|value| matches!(*value, "learned" | "not-learned"))
                    .unwrap_or("all")
                    .into();
                self.load_context();
                self.sync_learning_goal(cx);
                self.refresh();
                if self.scramble.is_empty() {
                    self.new_scramble();
                }
                self.next_case();
            }
            "solves" => {
                self.solves = list(&value);
                self.keep_launch_session();
                self.solves.reverse();
            }
            "stats" => self.stats = list(&value),
            "profile" => self.profile = value,
            "caseHistory" => self.case_history = value,
            "scramble" => {
                self.scramble = value.as_str().unwrap_or("").into();
                self.generating = false;
                let mut map = self
                    .prefs
                    .get("cubix.playground.scrambleByContext")
                    .cloned()
                    .unwrap_or(json!({}));
                map[format!("{}:{}:{}", self.puzzle, self.solve_mode, self.scramble_type)] =
                    json!(self.scramble);
                self.pref("cubix.playground.scrambleByContext", map);
            }
            "trainingCase" => self.training = value,
            "auth" => {
                self.sessions.clear();
                self.user = value["user"].clone();
                self.page = "profile".into();
                self.fields["password"].update(cx, |f, cx| f.set(String::new(), cx));
                self.refresh();
                self.saving = false;
            }
            "logout" => {
                self.sessions.clear();
                self.user = json!({"isGuest":true,"username":"Guest"});
                self.editing = false;
                self.refresh();
            }
            "session" => {
                let id = value["id"].as_i64().unwrap();
                self.sessions.insert(self.context_key(), id);
                self.pending_solve["sessionId"] = json!(id);
                self.call("saved", "addSolve", json!([self.pending_solve]));
            }
            "saved" => {
                self.pending_solve = Value::Null;
                self.last_solve = value["id"].as_i64().unwrap_or(0);
                self.advance_pending = true;
                self.advance_key = format!("{}:{}", self.context_key(), value["id"]);
                if let Some(message) = value["record"].as_str() {
                    self.show_record_notice(message.into(), cx);
                }
                self.refresh();
            }
            "mutated" => {
                self.saving = false;
                self.overlay.clear();
                self.refresh();
            }
            _ => return,
        }
        cx.notify();
    }
    fn new_scramble(&mut self) {
        self.generating = true;
        self.call("scramble", "scramble", json!([self.context()]));
    }
    fn next_case(&mut self) {
        self.revealed = false;
        self.call(
            "trainingCase",
            "training",
            json!([
                "next",
                self.puzzle,
                self.selected.iter().collect::<Vec<_>>(),
                self.random_auf,
                self.solve_mode
            ]),
        );
    }
    fn save_solve(&mut self, ms: f64, cx: &mut Context<Self>) {
        self.saving = true;
        let mut body = self.context();
        body["timeMs"] = json!(ms.round() as u64);
        body["scramble"] = json!(if self.page == "training" {
            s(&self.training, "setup")
        } else {
            &self.scramble
        });
        body["caseId"] = if self.page == "training" {
            self.training["id"].clone()
        } else {
            Value::Null
        };
        self.pending_solve = body;
        if let Some(id) = self.sessions.get(&self.context_key()) {
            self.pending_solve["sessionId"] = json!(id);
            self.call("saved", "addSolve", json!([self.pending_solve]));
        } else {
            self.call(
                "session",
                "createSession",
                json!([
                    self.page,
                    self.selected.iter().collect::<Vec<_>>(),
                    self.puzzle,
                    self.context()
                ]),
            );
        }
        cx.notify();
    }
    fn input(&self, key: &str) -> Entity<TextInput> {
        self.fields[key].clone()
    }
    fn btn(
        &self,
        id: impl Into<String>,
        label: impl AsRef<str>,
        active: bool,
        cx: &Context<Self>,
    ) -> Stateful<Div> {
        let id = id.into();
        let action = id.clone();
        let anchor = id.starts_with("menu:") || id == "next";
        let bounds_key = id.clone();
        let bounds = self.control_bounds.clone();
        let t = self.theme;
        row()
            .id(SharedString::from(id))
            .min_h(px(34.))
            .px(px(14.))
            .gap(px(7.))
            .rounded(px(10.))
            .text_size(px(13.))
            .font_weight(FontWeight::SEMIBOLD)
            .cursor_pointer()
            .bg(if active {
                t.surface3
            } else {
                gpui::transparent_black()
            })
            .text_color(if active { t.text } else { t.muted })
            .hover(move |s| s.bg(t.hover).text_color(t.text))
            .on_click(cx.listener(move |this, _, window, cx| this.action(&action, window, cx)))
            .when(!label.as_ref().is_empty(), |d| {
                d.child(label.as_ref().to_string())
            })
            .when(anchor, |d| {
                d.relative().child(
                    canvas(
                        move |rect, _, _| {
                            bounds.borrow_mut().insert(bounds_key.clone(), rect);
                        },
                        |_, _, _, _| {},
                    )
                    .absolute()
                    .inset_0(),
                )
            })
    }
    fn action(&mut self, action: &str, window: &mut Window, cx: &mut Context<Self>) {
        if self.timer.read(cx).phase != Phase::Idle || self.saving {
            return;
        }
        let (kind, arg) = action.split_once(':').unwrap_or((action, ""));
        if kind == "historyBack" || kind == "historyForward" {
            self.travel(kind == "historyBack", window, cx);
            return;
        }
        let previous_location = self.location();
        self.error.clear();
        if matches!(self.timer.read(cx).phase, Phase::Holding | Phase::Ready) {
            self.timer.update(cx, |t, cx| t.reset(cx));
        }
        match kind {
            "nav" => {
                self.page = arg.into();
                if arg == "profile" {
                    self.profile_filter = (
                        self.puzzle.clone(),
                        self.solve_mode.clone(),
                        self.scramble_type.clone(),
                    );
                }
                self.case_id.clear();
                self.overlay.clear();
                self.show_times = arg == "training" && self.width >= 1024.;
                self.show_cases = self.show_times;
                self.timer.update(cx, |t, cx| t.reset(cx));
                self.refresh();
            }
            "case" => {
                self.page = "algorithms".into();
                self.case_id = arg.into();
                self.overlay.clear();
                self.refresh();
            }
            "back" => {
                self.travel(true, window, cx);
                return;
            }
            "learn" => {
                let learned = !self.learned.remove(arg);
                if learned {
                    self.learned.insert(arg.into());
                }
                self.call("learn", "setLearned", json!([arg, learned]));
            }
            "set" => {
                let c = list(&self.catalog["sets"])
                    .into_iter()
                    .find(|s| s["id"] == arg)
                    .unwrap();
                self.sets.insert(s(&c, "stage").into(), arg.into());
                self.save_per_puzzle("cubix.algs.setByCube", json!(self.sets));
            }
            "collapse" => {
                if !self.collapsed.remove(arg) {
                    self.collapsed.insert(arg.into());
                }
                let map: serde_json::Map<_, _> = self
                    .collapsed
                    .iter()
                    .filter(|k| !k.starts_with("selector:") && !k.starts_with("profile:"))
                    .map(|k| (k.clone(), json!(true)))
                    .collect();
                self.pref("cubix.algs.collapsedGroups", Value::Object(map));
            }
            "learningFilter" if matches!(arg, "learned" | "not-learned") => {
                self.learning_filter = if self.learning_filter == arg {
                    "all"
                } else {
                    arg
                }
                .into();
                self.pref("cubix.algs.learningFilter", json!(self.learning_filter));
            }
            "select" => {
                if !self.selected.remove(arg) {
                    self.selected.insert(arg.into());
                }
                self.save_per_puzzle(
                    "cubix.training.selectionByCube",
                    json!(self.selected.iter().collect::<Vec<_>>()),
                );
                if !self.selected.contains(s(&self.training, "id")) {
                    self.next_case();
                }
            }
            "selectSet" | "selectGroup" => {
                let ids: Vec<_> = self
                    .all_cases()
                    .iter()
                    .filter(|c| {
                        if kind == "selectSet" {
                            s(c, "set") == arg
                        } else {
                            format!("{}:{}", s(c, "set"), s(c, "group")) == arg
                        }
                    })
                    .map(|c| s(c, "id").to_string())
                    .collect();
                let all = ids.iter().all(|id| self.selected.contains(id));
                for id in ids {
                    if all {
                        self.selected.remove(&id);
                    } else {
                        self.selected.insert(id);
                    }
                }
                self.save_per_puzzle(
                    "cubix.training.selectionByCube",
                    json!(self.selected.iter().collect::<Vec<_>>()),
                );
                if !self.selected.contains(s(&self.training, "id")) {
                    self.next_case();
                }
            }
            "clear" => {
                self.selected.clear();
                self.save_per_puzzle("cubix.training.selectionByCube", json!([]));
                self.next_case();
            }
            "train" => {
                self.selected = if arg.is_empty() {
                    [self.case_id.clone()].into_iter().collect()
                } else {
                    self.all_cases()
                        .iter()
                        .filter(|c| format!("{}:{}", s(c, "set"), s(c, "group")) == arg)
                        .map(|c| s(c, "id").to_owned())
                        .collect()
                };
                self.save_per_puzzle(
                    "cubix.training.selectionByCube",
                    json!(self.selected.iter().collect::<Vec<_>>()),
                );
                self.case_id.clear();
                self.page = "training".into();
                self.timer.update(cx, |t, cx| t.reset(cx));
                self.show_times = self.width >= 1024.;
                self.show_cases = self.width >= 1024.;
                self.next_case();
                self.refresh();
            }
            "next" => {
                self.timer.update(cx, |t, cx| t.reset(cx));
                if self.page == "training" {
                    self.next_case();
                } else {
                    self.new_scramble();
                }
            }
            "previous" => {
                self.revealed = false;
                self.call(
                    "trainingCase",
                    "training",
                    json!([
                        "previous",
                        self.puzzle,
                        self.selected.iter().collect::<Vec<_>>(),
                        self.random_auf,
                        self.solve_mode
                    ]),
                );
                self.timer.update(cx, |t, cx| t.reset(cx));
            }
            "replayCube" => self.cube_view.update(cx, |view, cx| view.replay(cx)),
            "solution" => self.revealed = !self.revealed,
            "auf" => {
                self.random_auf = !self.random_auf;
                self.pref("cubix.training.randomAuf", json!(self.random_auf));
            }
            "times" => self.show_times = !self.show_times,
            "cases" => self.show_cases = !self.show_cases,
            "menu" => {
                self.overlay = if self.overlay == arg {
                    String::new()
                } else {
                    arg.into()
                };
                let (_, values, current) = self.select_options();
                self.select_index = values.iter().position(|v| v["id"] == current).unwrap_or(0);
            }
            "puzzle" => {
                self.timer.update(cx, |t, cx| t.reset(cx));
                self.puzzle = arg.into();
                self.pref("cubix.puzzle", json!(arg));
                self.load_context();
                self.overlay.clear();
                self.case_id.clear();
                self.next_case();
                if self.scramble.is_empty() {
                    self.new_scramble();
                }
                self.refresh();
            }
            "mode" => {
                self.timer.update(cx, |t, cx| t.reset(cx));
                self.solve_mode = arg.into();
                self.save_per_puzzle("cubix.practice.modeByPuzzle", json!(arg));
                self.overlay.clear();
                self.scramble.clear();
                self.new_scramble();
                self.refresh();
            }
            "scrambleType" => {
                self.timer.update(cx, |t, cx| t.reset(cx));
                self.scramble_type = arg.into();
                self.save_per_puzzle("cubix.practice.typeByPuzzle", json!(arg));
                self.overlay.clear();
                self.scramble.clear();
                self.new_scramble();
                self.refresh();
            }
            "theme" => {
                self.theme_name = arg.into();
                self.pref("cubix.ui.theme", json!(arg));
            }
            "light" => {
                self.light = arg == "light";
                self.pref("cubix.ui.colorMode", json!(arg));
            }
            "authMode" => self.login = arg == "login",
            "auth" => {
                self.saving = true;
                self.call(
                    "auth",
                    if self.login { "login" } else { "register" },
                    json!([self.field("username", cx), self.field("password", cx)]),
                );
            }
            "edit" => self.editing = !self.editing,
            "logout" => self.call("logout", "logout", json!([])),
            "profilePuzzle" => {
                self.profile_filter.0 = arg.into();
                let info = list(&self.catalog["puzzles"]["puzzles"])
                    .into_iter()
                    .find(|p| p["id"] == arg)
                    .unwrap();
                if !list(&info["scrambles"]).contains(&json!(self.profile_filter.2)) {
                    self.profile_filter.2 = info["scrambles"][0]
                        .as_str()
                        .unwrap_or("competition")
                        .into();
                }
                self.overlay.clear();
                self.refresh();
            }
            "profileSolveMode" => {
                self.profile_filter.1 = arg.into();
                self.overlay.clear();
                self.refresh();
            }
            "profileScramble" => {
                self.profile_filter.2 = arg.into();
                self.overlay.clear();
                self.refresh();
            }
            "profileMode" => self.profile_mode = arg.into(),
            "achievementGroup" => {
                self.achievement_group = arg.into();
                self.overlay.clear();
            }
            "achievementFilter" => self.achievement_filter = arg.into(),
            "caseStep" => {
                // Previous/next case of the same set, from the catalogue detail page.
                let c = self.find_case(&self.case_id);
                let set = s(&c, "set").to_owned();
                let ids: Vec<String> = self
                    .all_cases()
                    .iter()
                    .filter(|v| s(v, "set") == set)
                    .map(|v| s(v, "id").to_owned())
                    .collect();
                if let Some(index) = ids.iter().position(|id| *id == self.case_id) {
                    let next = if arg == "previous" {
                        index.checked_sub(1)
                    } else {
                        Some(index + 1).filter(|i| *i < ids.len())
                    };
                    if let Some(next) = next {
                        self.case_id = ids[next].clone();
                        self.refresh();
                    }
                }
            }
            "selectorToggle" => {
                let count = self
                    .all_cases()
                    .iter()
                    .filter(|c| s(c, "set") == arg && self.selected.contains(s(c, "id")))
                    .count();
                let open = self
                    .selector_open
                    .get(arg)
                    .copied()
                    .unwrap_or(count > 0 || !self.field("cases", cx).is_empty());
                self.selector_open.insert(arg.into(), !open);
            }
            "profileStage" => self.profile_stage = arg.into(),
            "stage" => {
                self.catalog_stage = arg.into();
                self.save_per_puzzle("cubix.algs.stageByCube", json!(arg));
                if let Some((state, rows, _)) = self
                    .virtual_lists
                    .get(&format!("{}:{}:catalog", self.page, self.puzzle))
                {
                    if let Some(ix) = rows
                        .iter()
                        .position(|r| r["kind"] == "catalogHeader" && r["stage"] == arg)
                    {
                        state.scroll_to(ListOffset {
                            item_ix: ix,
                            offset_in_item: px(0.),
                        });
                    }
                }
            }
            "profileCase" => {
                self.case_id = arg.into();
                self.overlay = "profileCase".into();
                self.refresh();
            }
            "penalty" => {
                let (id, p) = arg.split_once(':').unwrap();
                let id = id.parse::<i64>().unwrap();
                let current = self.solves.iter().find(|s| s["id"] == id);
                let p = if current.is_some_and(|s| s["penalty"] == p) {
                    "none"
                } else {
                    p
                };
                self.call("mutated", "setPenalty", json!([id, p]));
            }
            "delete" => {
                self.call(
                    "mutated",
                    "deleteSolve",
                    json!([arg.parse::<i64>().unwrap_or(0)]),
                );
            }
            "undo" => {
                if let Some(last) = self.solves.last() {
                    self.call("mutated", "deleteSolve", json!([last["id"]]));
                }
            }
            "comment" => {
                let id = arg.parse::<i64>().unwrap_or(0);
                let existing = self
                    .solves
                    .iter()
                    .find(|s| s["id"] == id)
                    .map(|s| crate::app::s(s, "comment").to_owned())
                    .unwrap_or_default();
                self.comment_solve = id;
                self.overlay = "comment".into();
                let field = self.input("comment");
                field.update(cx, |f, cx| f.set(existing, cx));
                field.read(cx).focus(window);
            }
            "commentSave" | "commentClear" => {
                let text = if kind == "commentClear" {
                    Value::Null
                } else {
                    json!(self.field("comment", cx).trim())
                };
                self.saving = true;
                self.call("mutated", "setComment", json!([self.comment_solve, text]));
                self.focus.focus(window);
            }
            "commentCancel" => {
                self.overlay.clear();
                self.focus.focus(window);
            }
            "solve" => {
                self.overlay_solve = self
                    .solves
                    .iter()
                    .find(|s| s["id"].to_string() == arg)
                    .cloned();
                self.overlay = "solve".into();
            }
            "help" => {
                self.page = match self.page.as_str() {
                    "training" => "trainingGuide",
                    "algorithms" => "algorithmsGuide",
                    _ => "overviewGuide",
                }
                .into();
            }
            "url" => cx.open_url(arg),
            "retry" => {
                if !self.pending_solve.is_null() && self.pending_solve["sessionId"].is_number() {
                    self.saving = true;
                    self.call("saved", "addSolve", json!([self.pending_solve]));
                }
                self.call("mutated", "sync", json!([]));
                self.refresh();
            }
            _ => {}
        }
        self.record_navigation(previous_location);
        self.sync_learning_goal(cx);
        self.focus.focus(window);
        cx.notify();
    }
    /// Recomputes the cases still to learn. Only a learning change that empties a non-empty goal
    /// celebrates: deselecting the remaining cases does not.
    fn sync_learning_goal(&mut self, cx: &Context<Self>) {
        let pending: HashSet<String> = self
            .selected
            .iter()
            .filter(|id| !self.learned.contains(*id))
            .cloned()
            .collect();
        let met = !self.learn_goal.is_empty()
            && !self.selected.is_empty()
            && pending.is_empty()
            && self.learn_goal.iter().all(|id| self.learned.contains(id));
        self.learn_goal = pending;
        if met {
            if self.page == "training" {
                self.show_learning_notice(cx);
            } else {
                self.learn_notice_pending = true;
            }
        }
    }
    fn show_learning_notice(&mut self, cx: &Context<Self>) {
        self.learn_notice_pending = false;
        self.learn_notice = Some(std::time::Instant::now());
        cx.spawn(async move |this, cx| {
            cx.background_executor()
                .timer(std::time::Duration::from_millis(4200))
                .await;
            let _ = this.update(cx, |s, cx| {
                if s.learn_notice
                    .is_some_and(|since| since.elapsed().as_millis() >= 4000)
                {
                    s.learn_notice = None;
                    cx.notify();
                }
            });
        })
        .detach();
    }
    fn show_record_notice(&mut self, message: String, cx: &Context<Self>) {
        self.record_notice = Some((message, std::time::Instant::now()));
        cx.spawn(async move |this, cx| {
            cx.background_executor()
                .timer(std::time::Duration::from_millis(4200))
                .await;
            let _ = this.update(cx, |s, cx| {
                if s.record_notice
                    .as_ref()
                    .is_some_and(|(_, since)| since.elapsed().as_millis() >= 4000)
                {
                    s.record_notice = None;
                    cx.notify();
                }
            });
        })
        .detach();
    }
    fn prepare_cube(&mut self, cx: &mut Context<Self>) {
        let spec = if self.page == "playground" {
            self.puzzle_info()["cubeSize"]
                .as_u64()
                .map(|size| (self.scramble.clone(), size, "full".to_owned()))
        } else if self.page == "training" || self.page == "algorithms" && !self.case_id.is_empty() {
            let id = if self.page == "training" {
                s(&self.training, "id")
            } else {
                &self.case_id
            };
            let c = self.find_case(id);
            // Flat cases (last layer seen from above) are explained by their diagram, not by the 3D cube.
            if id.is_empty() || !s(&c, "diagram").is_empty() || c["flat"] == true {
                None
            } else {
                let setup = if self.page == "training" {
                    s(&self.training, "setup")
                } else {
                    s(&c, "setup")
                };
                let stage = s(&c, "stage");
                Some((
                    setup.to_owned(),
                    c["cube_size"].as_u64().unwrap_or(3),
                    if ["OLL", "PLL", "F2L"].contains(&stage) {
                        stage
                    } else {
                        "full"
                    }
                    .to_owned(),
                ))
            }
        } else {
            None
        };
        let key = spec
            .as_ref()
            .map(|v| format!("{}:{}:{}", self.page, self.case_id, json!(v)))
            .unwrap_or_default();
        if key != self.cube_key {
            self.cube_key = key.clone();
            self.cube_view.update(cx, |view, cx| view.load(None, cx));
            if let Some((setup, size, mask)) = spec {
                self.call(
                    &format!("cubePreview:{key}"),
                    "cubePreview",
                    json!([setup, size, mask]),
                );
            }
        }
    }
    fn animated_cube(&self, size: f32) -> Div {
        div()
            .size(px(size))
            .flex_none()
            .child(self.cube_view.clone())
    }
    fn diagram(&mut self, c: &Value, size: f32) -> Div {
        let mut node = div().size(px(size)).flex_none();
        let key = s(c, "asset");
        if !self.cube_scenes.contains_key(key) {
            if let Some(scene) = Scene::from_value(&c["cube"]) {
                self.cube_scenes.insert(key.to_owned(), scene);
            }
        }
        if let Some(scene) = self.cube_scenes.get(key) {
            return node.child(crate::cube::thumbnail(scene.clone()));
        }
        if let Some(image) = self.images.get(key) {
            node = node.child(img(image).size_full());
        }
        node
    }
    /// The drawn case of the training page carries its random AUF, unlike the catalogue picture.
    fn training_diagram(&mut self, c: &Value, size: f32) -> Div {
        let drawn = self.training["svg"].as_str().filter(|_| c["flat"] == true);
        let Some(source) = drawn else {
            return self.diagram(c, size);
        };
        let key = format!("training:{}:{}", s(c, "id"), s(&self.training, "setup"));
        let image = self.images.svg(&key, source);
        div()
            .size(px(size))
            .flex_none()
            .when_some(image, |d, image| d.child(img(image).size_full()))
    }
    fn kpi(&self, label: &str, value: String, size: f32) -> Div {
        col()
            .gap(px(2.))
            .child(
                txt(label.to_owned(), 13.)
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(self.theme.muted),
            )
            .child(bold(value, size).font_family("Geist Mono"))
    }
    fn empty(&self, label: &str) -> Div {
        col()
            .items_center()
            .justify_center()
            .p(px(28.))
            .gap(px(10.))
            .text_color(self.theme.muted)
            .child(label.to_owned())
    }
    fn scroll(&mut self, id: &str) -> Stateful<Div> {
        let key = format!("{}:{}:{}", self.page, self.puzzle, id);
        let handle = self.scrolls.entry(key.clone()).or_default().clone();
        col()
            .id(SharedString::from(key))
            .flex_1()
            .min_h(px(0.))
            .overflow_y_scroll()
            .track_scroll(&handle)
            .pb(px(72.))
            .gap(px(16.))
    }
    fn nav(&self, cx: &Context<Self>) -> Div {
        let active = &self.page;
        let mut tabs = row()
            .gap(px(2.))
            .p(px(4.))
            .rounded(px(14.))
            .bg(self.theme.surface)
            .border_1()
            .border_color(self.theme.line);
        for (page, label, ic) in [
            ("playground", "Timer", "IconCube"),
            ("algorithms", "Algorithms", "IconGrid"),
            ("training", "Training", "IconTimer"),
            ("profile", "Account", "IconUser"),
        ] {
            let selected = active == page;
            let mut b = self
                .btn(format!("nav:{page}"), "", false, cx)
                .h(px(34.))
                .px(px(if selected { 10. } else { 0. }))
                .gap(px(7.))
                .justify_center()
                .text_size(px(12.))
                .bg(if selected {
                    self.theme.soft
                } else {
                    gpui::transparent_black()
                })
                .text_color(if selected {
                    self.theme.accent
                } else {
                    self.theme.muted
                });
            if !selected {
                b = b.w(px(if self.width <= 760. { 36. } else { 38. }));
            }
            if page == "profile" && !self.guest() {
                b = b.child(self.avatar(&self.user, 20.));
            } else {
                b = b.child(icon(ic, 18.));
            }
            if selected {
                b = b.child(label);
            }
            tabs = tabs.child(b);
        }
        let mut puzzle = self
            .btn("menu:puzzles", "", false, cx)
            .gap(px(6.))
            .px(px(10.))
            .text_size(px(12.))
            .text_color(self.theme.text)
            .child(puzzle_icon(&self.puzzle, 18.));
        if self.width > 760. {
            puzzle = puzzle.child(self.label("puzzles", &self.puzzle));
        }
        puzzle = puzzle.child(icon("IconChevronDown", 12.));
        row()
            .absolute()
            .bottom(px(
                if self.width <= 760. { 8. } else { 10. } - self.hide * 120.
            ))
            .left_0()
            .w_full()
            .justify_center()
            .gap(px(8.))
            .child(
                row()
                    .p(px(4.))
                    .rounded(px(14.))
                    .bg(self.theme.surface)
                    .border_1()
                    .border_color(self.theme.line)
                    .child(puzzle),
            )
            .child(tabs)
    }
    fn avatar(&self, user: &Value, size: f32) -> Div {
        row()
            .size(px(size))
            .flex_none()
            .justify_center()
            .rounded(px(size / 2.))
            .bg(self.theme.soft)
            .text_color(self.theme.accent)
            .font_weight(FontWeight::BOLD)
            .text_size(px(size / 3.))
            .child(
                s(user, "username")
                    .chars()
                    .take(2)
                    .collect::<String>()
                    .to_uppercase(),
            )
    }
    fn metrics(&self) -> Vec<(String, String)> {
        let all: Vec<Option<f64>> = self
            .solves
            .iter()
            .map(|s| {
                if s["penalty"] == "dnf" {
                    None
                } else {
                    Some(number(&s["time_ms"]) + if s["penalty"] == "+2" { 2000. } else { 0. })
                }
            })
            .collect();
        let valid: Vec<f64> = all.iter().flatten().copied().collect();
        let best = valid
            .iter()
            .copied()
            .reduce(f64::min)
            .map(time)
            .unwrap_or("–".into());
        let mean = if valid.is_empty() {
            "–".into()
        } else {
            time(valid.iter().sum::<f64>() / valid.len() as f64)
        };
        let avg = |n: usize| {
            if all.len() < n {
                return "–".into();
            }
            let mut values = all[all.len() - n..].to_vec();
            if values.iter().filter(|v| v.is_none()).count() > 1 {
                return "–".into();
            }
            values.sort_by(|a, b| {
                a.unwrap_or(f64::INFINITY)
                    .total_cmp(&b.unwrap_or(f64::INFINITY))
            });
            time(values[1..n - 1].iter().flatten().sum::<f64>() / (n - 2) as f64)
        };
        let mut out = vec![
            ("Solves".into(), self.solves.len().to_string()),
            ("Best".into(), best),
            ("Mean".into(), mean),
        ];
        if self.page != "training" {
            out.push(("Ao5".into(), avg(5)));
            out.push(("Ao12".into(), avg(12)));
        }
        out
    }
    fn practice(&mut self, cx: &Context<Self>) -> Div {
        let wide = self.width >= 1024. && self.height >= 600.;
        let training = self.page == "training";
        let rail = if wide {
            (self.width - 48. - 48.).min(1200.) / 4.28
        } else {
            0.
        }
        .clamp(220., 280.);
        let center_width = self.width - if wide { rail * 2. + 96. } else { 28. };
        let center_x = (self.width - center_width) / 2.;
        let font_size = (self.width * 0.07).clamp(60., 108.);
        let font_size = if self.width <= 700. {
            (self.width * 0.15).clamp(56., 84.)
        } else {
            font_size
        };
        let mut timer_top = self.height / 2. - font_size * 1.1 / 2. - 38.;
        // The timer itself, then the row of buttons for the time just recorded.
        let actions_height = 44.;
        let timer_height = font_size * 1.1 + 76. + actions_height;
        let gap = (self.height * 0.026).clamp(14., 28.);
        let mut top = row().w_full().justify_center().flex_wrap().gap(px(8.));
        if training {
            if !wide {
                top = top.child(
                    self.btn("cases", "Cases", self.show_cases, cx)
                        .child(icon("IconGrid", 15.)),
                );
            }
            if let Some(id) = self.training["id"]
                .as_str()
                .map(str::to_owned)
                .filter(|_| !self.selected.is_empty())
            {
                let learned = self.learned.contains(&id);
                top = top.child(
                    self.btn(format!("learn:{id}"), "", false, cx)
                        .text_color(if learned {
                            self.theme.good
                        } else {
                            self.theme.muted
                        })
                        .when(learned, |d| d.child(icon("IconCheck", 14.)))
                        .child(if learned { "Learned" } else { "Mark learned" }),
                );
            }
            top = top.child(
                self.btn("auf", "Random AUF", self.random_auf, cx)
                    .text_color(if self.random_auf {
                        self.theme.accent
                    } else {
                        self.theme.secondary
                    })
                    .bg(if self.random_auf {
                        self.theme.soft
                    } else {
                        gpui::transparent_black()
                    })
                    .child(icon("IconShuffle", 15.)),
            );
        } else {
            top = top.child(
                row()
                    .flex_wrap()
                    .gap(px(6.))
                    .child(
                        self.btn(
                            "menu:scrambles",
                            self.label("scrambles", &self.scramble_type),
                            false,
                            cx,
                        )
                        .child(icon("IconChevronDown", 12.)),
                    )
                    .child(
                        self.btn(
                            "menu:modes",
                            self.label("solveModes", &self.solve_mode),
                            false,
                            cx,
                        )
                        .child(icon("IconChevronDown", 12.)),
                    ),
            );
        }
        let mut right = row().justify_center().flex_wrap().gap(px(6.));
        if !self.cube_key.is_empty() {
            right = right.child(
                self.btn("replayCube", "Replay", false, cx)
                    .child(icon("IconUndo", 15.)),
            );
        }
        if !training {
            right = right.child(
                self.btn("next", "", false, cx)
                    .child(icon("IconShuffle", 15.))
                    .child("New scramble"),
            );
        }
        right = right.child(
            self.btn("times", "", self.show_times, cx)
                .child(icon("IconTimer", 15.))
                .child("Times"),
        );
        top = top.child(right);
        let toolbar = top;
        let mut center = div()
            .absolute()
            .left(px(center_x))
            .top_0()
            .w(px(center_width))
            .h_full();
        let hide = self.hide;
        if training && self.learn_notice_pending {
            self.show_learning_notice(cx);
        }
        let notice = if training {
            self.learn_notice.map(|_| {
                (
                    "IconCheck",
                    "Well done! Every selected case is learned.".to_string(),
                )
            })
        } else {
            self.record_notice
                .as_ref()
                .map(|(message, _)| ("IconTrophy", message.clone()))
        };
        if let Some((name, message)) = notice.filter(|_| hide < 1.) {
            center = center.child(
                div()
                    .absolute()
                    .top(px(12. - hide * 120.))
                    .w_full()
                    .flex()
                    .justify_center()
                    .child(
                        row()
                            .gap(px(8.))
                            .px(px(14.))
                            .py(px(8.))
                            .rounded(px(12.))
                            .bg(self.theme.surface2)
                            .text_size(px(13.))
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(self.theme.good)
                            .child(icon(name, 14.))
                            .child(message),
                    ),
            );
        }
        if hide < 1. {
            let mut above = col()
                .w_full()
                .max_w(px(720.))
                .mx_auto()
                .items_center()
                .gap(px(8.))
                .text_center();
            if training {
                if let Some(id) = self.training["id"]
                    .as_str()
                    .map(str::to_owned)
                    .filter(|_| !self.selected.is_empty())
                {
                    let c = self.find_case(&id);
                    let small = self.height < 700.;
                    let setup_font = if small { 16. } else { 19. };
                    let algo_font = if small { 15. } else { 17. };
                    // Two lines of each algorithm always stay visible.
                    let revealed = self.revealed;
                    let min_text =
                        setup_font * 1.6 * 2. + if revealed { algo_font * 1.6 * 2. } else { 0. };
                    // Header row, labels, the show/hide button and the gaps between blocks.
                    let fixed = 42. + 31. + if revealed { 31. + 40. } else { 40. } + 8.;
                    let cube_size = (timer_top - gap - fixed - min_text).clamp(56., 150.);
                    let overflow = gap + fixed + cube_size + min_text - timer_top;
                    if overflow > 0. {
                        // Short window: let the timer slide down as far as the
                        // stats and toolbar allow rather than clipping the header.
                        let slack = self.height - 118. - (timer_top + timer_height + gap + 64.);
                        timer_top += overflow.min(slack.max(0.));
                    }
                    let text_budget = (timer_top - gap - fixed - cube_size).max(min_text);
                    let setup_height = if revealed {
                        text_budget * setup_font / (setup_font + algo_font)
                    } else {
                        text_budget
                    };
                    let algo_height = text_budget - setup_height;
                    let subtitle = case_kind(&c);
                    let arrow = |s: &Self, action: &str, ic: &str| {
                        s.btn(action, "", false, cx)
                            .w(px(38.))
                            .justify_center()
                            .child(icon(ic, 16.))
                    };
                    let cube = if !self.cube_key.is_empty() {
                        self.animated_cube(cube_size)
                    } else {
                        self.training_diagram(&c, cube_size)
                    };
                    let block = |s: &Self, label: &str, id: &str, alg: &str, size: f32, h: f32| {
                        col()
                            .w_full()
                            .items_center()
                            .gap(px(6.))
                            .child(
                                txt(label, 11.)
                                    .font_weight(FontWeight::BOLD)
                                    .text_color(s.theme.muted),
                            )
                            .child(s.practice_alg(id, alg, size, h))
                    };
                    above = above
                        .child(
                            row()
                                .items_center()
                                .justify_center()
                                .gap(px(10.))
                                .child(arrow(self, "previous", "IconBack"))
                                .child(
                                    self.btn(format!("case:{id}"), s(&c, "name"), false, cx)
                                        .text_size(px(22.))
                                        .font_weight(FontWeight::BOLD)
                                        .text_color(self.theme.text),
                                )
                                .child(txt(subtitle, 13.).text_color(self.theme.muted))
                                .child(arrow(self, "next", "IconChevronRight")),
                        )
                        .child(block(
                            self,
                            "SETUP",
                            "setup",
                            s(&self.training, "setup"),
                            setup_font,
                            setup_height,
                        ))
                        .when(revealed, |d| {
                            d.child(block(
                                self,
                                "ALGORITHM",
                                "solution",
                                s(&self.training, "algorithm"),
                                algo_font,
                                algo_height,
                            ))
                        })
                        .child(
                            self.btn(
                                "solution",
                                if revealed {
                                    "Hide solution"
                                } else {
                                    "Show solution"
                                },
                                false,
                                cx,
                            )
                            .child(icon("IconEye", 14.)),
                        )
                        .child(cube);
                } else {
                    above = above
                        .child(icon("IconGrid", 34.).text_color(self.theme.accent))
                        .child(bold("Choose your cases", 22.))
                        .child(
                            txt("Select the cases you want to practise.", 14.)
                                .text_color(self.theme.muted),
                        )
                        .child(self.btn("cases", "Choose cases", true, cx));
                }
            } else {
                let caption = format!(
                    "{} · {}",
                    self.label("puzzles", &self.puzzle),
                    self.label("scrambles", &self.scramble_type)
                )
                .to_uppercase();
                let cube_size = if self.cube_key.is_empty() {
                    0.
                } else if self.height < 700. {
                    96.
                } else {
                    156.
                };
                if cube_size > 0. {
                    above = above.child(self.animated_cube(cube_size));
                }
                let scramble_height = (timer_top - gap - cube_size - 48.).max(40.);
                above = above
                    .child(
                        txt(caption, 11.)
                            .font_weight(FontWeight::BOLD)
                            .text_color(self.theme.muted),
                    )
                    // A new scramble of the same context replaces the shown one in place: no placeholder frame.
                    .child(if self.generating && self.scramble.is_empty() {
                        txt("Generating…", 16.).text_color(self.theme.muted)
                    } else {
                        self.practice_alg(
                            "scramble",
                            &self.scramble,
                            if self.puzzle_info()["cubeSize"]
                                .as_u64()
                                .is_none_or(|n| n > 3)
                            {
                                (self.width * 0.015).clamp(16., 20.)
                            } else {
                                (self.width * 0.022).clamp(22., 30.)
                            },
                            scramble_height,
                        )
                    });
            }
            center = center.child(
                div()
                    .absolute()
                    .bottom(px(self.height - timer_top + gap + hide * (timer_top + 40.)))
                    .w_full()
                    .child(above),
            );
            let mut stats = row()
                .w_full()
                .max_w(px(560.))
                .mx_auto()
                .justify_center()
                .gap(px((self.width * 0.035).clamp(16., 40.)));
            for (label, value) in self.metrics() {
                stats = stats.child(
                    self.kpi(&label, value, (self.width * 0.016).clamp(18., 24.))
                        .flex_1()
                        .text_center(),
                );
            }
            let t = self.theme;
            let mut actions = row()
                .w_full()
                .h(px(actions_height))
                .justify_center()
                .gap(px(8.));
            if let Some(last) = self
                .solves
                .iter()
                .find(|s| s["id"] == self.last_solve)
                .filter(|_| !self.saving)
                .cloned()
            {
                let id = last["id"].to_string();
                let commented = !s(&last, "comment").is_empty();
                actions = actions
                    .child(
                        self.btn(format!("delete:{id}"), "", false, cx)
                            .px(px(10.))
                            .text_color(t.danger)
                            .hover(move |s| s.bg(t.hover).text_color(t.danger))
                            .child(icon("IconClose", 16.)),
                    )
                    .child(
                        self.btn(format!("penalty:{id}:dnf"), "DNF", last["penalty"] == "dnf", cx)
                            .px(px(10.))
                            .text_size(px(12.)),
                    )
                    .child(
                        self.btn(format!("penalty:{id}:+2"), "+2", last["penalty"] == "+2", cx)
                            .px(px(10.))
                            .gap(px(4.))
                            .child(icon("IconFlag", 15.)),
                    )
                    .child(
                        self.btn(format!("comment:{id}"), "", false, cx)
                            .px(px(10.))
                            .when(commented, |d| d.text_color(t.accent))
                            .child(icon("IconComment", 16.)),
                    );
            }
            center = center.child(
                div()
                    .absolute()
                    .top(px(timer_top + timer_height - actions_height
                        + hide * (self.height - timer_top - timer_height + 40.)))
                    .w_full()
                    .child(col().w_full().child(actions).child(stats.mt(px(gap)))),
            );
        }
        center = center.child(
            div()
                .absolute()
                .top(px(timer_top))
                .w_full()
                .child(self.timer.clone()),
        );
        let mut workspace = div().size_full().relative().child(center);
        if hide < 1. {
            workspace = workspace.child(
                div()
                    .absolute()
                    .left(px(14.))
                    .right(px(14.))
                    .bottom(px(72. - hide * 240.))
                    .child(toolbar),
            );
        }
        if hide < 1. {
            if wide {
                if training {
                    workspace = workspace.child(
                        div()
                            .absolute()
                            .left(px(24. - hide * (rail + 48.)))
                            .top(px(12.))
                            .bottom(px(12.))
                            .w(px(rail))
                            .child(if self.show_cases {
                                self.virtual_selector(cx)
                            } else {
                                col().child(
                                    self.btn("cases", "Cases", false, cx)
                                        .child(icon("IconGrid", 15.)),
                                )
                            }),
                    );
                }
                workspace = workspace.child(
                    div()
                        .absolute()
                        .right(px(24. - hide * (rail + 48.)))
                        .top(px(12.))
                        .bottom(px(100.))
                        .w(px(rail))
                        .child(if self.show_times {
                            self.times(cx)
                        } else {
                            col()
                        }),
                );
            } else if hide == 0. && (self.show_times || self.show_cases && training) {
                let panel = if self.show_times {
                    self.times(cx)
                } else {
                    self.virtual_selector(cx)
                };
                workspace = workspace.child(
                    div()
                        .absolute()
                        .inset_0()
                        .bg(rgba(0x00000099))
                        .flex()
                        .items_center()
                        .justify_center()
                        .child(
                            col()
                                .w(px((self.width - 24.).min(560.)))
                                .h(px(self.height - 40.))
                                .p(px(20.))
                                .rounded(px(22.))
                                .bg(self.theme.surface)
                                .child(panel),
                        ),
                );
            }
        }
        workspace
    }
    fn practice_alg(&self, id: &str, alg: &str, size: f32, max_height: f32) -> Div {
        div().w_full().child(
            div()
                .id(SharedString::from(format!("practice-{id}:{alg}")))
                .w_full()
                .max_h(px(max_height))
                .overflow_y_scroll()
                .child(self.alg(alg, size).w_full()),
        )
    }
    fn alg(&self, alg: &str, size: f32) -> Div {
        row()
            .flex_wrap()
            .justify_center()
            .gap_x(px(size * 0.8))
            .gap_y(px(0.))
            .text_size(px(size))
            .line_height(px(size * 1.6))
            .font_family("Geist Mono")
            .children(
                alg.split_whitespace()
                    .map(|word| txt(word.to_owned(), size)),
            )
    }
    fn times(&mut self, cx: &Context<Self>) -> Div {
        let mut rows: Vec<_> = self
            .solves
            .iter()
            .enumerate()
            .rev()
            .map(|(i, solve)| json!({"kind":"solve","index":i+1,"solve":solve}))
            .collect();
        if rows.is_empty() {
            rows.push(json!({"kind":"empty","text":"No times yet."}));
        }
        let content = self.virtual_rows("times", rows, cx);
        col()
            .size_full()
            .gap(px(10.))
            .child(
                row()
                    .h(px(40.))
                    .justify_between()
                    .child(bold(
                        if self.page == "training" {
                            "Session"
                        } else {
                            "Times"
                        },
                        16.,
                    ))
                    .child(
                        self.btn("times", "", false, cx)
                            .px(px(6.))
                            .child(icon("IconClose", 16.)),
                    ),
            )
            .child(
                row()
                    .justify_between()
                    .child(
                        txt(format!("{} solves", self.solves.len()), 13.)
                            .text_color(self.theme.muted),
                    )
                    .when(self.page == "training", |r| {
                        r.child(self.btn("undo", "Undo", false, cx).px(px(6.)))
                    }),
            )
            .child(content)
    }
    fn detail(&mut self, cx: &Context<Self>) -> Div {
        let c = self.find_case(&self.case_id);
        let pic = if self.cube_key.is_empty() {
            self.diagram(&c, 150.)
        } else {
            col().items_center().child(self.animated_cube(180.)).child(
                self.btn("replayCube", "Replay scramble", false, cx)
                    .child(icon("IconUndo", 14.)),
            )
        };
        let mut body = self.scroll("detail").gap(px(22.));
        let hero = row().gap(px(24.)).child(pic).child(
            col()
                .gap(px(8.))
                .child(bold(self.case_id.clone(), 30.))
                .when(s(&c, "name") != self.case_id, |d| {
                    d.child(txt(s(&c, "name").to_string(), 15.).text_color(self.theme.secondary))
                })
                .child(txt(s(&c, "group").to_string(), 11.).text_color(self.theme.muted))
                .child(
                    self.btn(
                        format!("learn:{}", self.case_id),
                        if self.learned.contains(&self.case_id) {
                            "Learned"
                        } else {
                            "To learn"
                        },
                        false,
                        cx,
                    )
                    .when(self.learned.contains(&self.case_id), |d| {
                        d.child(icon("IconCheck", 13.))
                    })
                    .text_color(self.theme.good),
                ),
        );
        body = body.child(hero).child(
            col()
                .gap(px(12.))
                .child(self.heading("Setup"))
                .child(self.alg(s(&c, "setup"), 18.))
                .when(!s(&c, "notes").is_empty(), |d| {
                    d.child(txt(s(&c, "notes").to_string(), 14.).text_color(self.theme.muted))
                }),
        );
        let mut algorithms = col().child(self.heading("Algorithms"));
        for (i, a) in list(&c["algorithms"]).iter().enumerate() {
            let mut badges = row().gap(px(6.));
            if i == 0 {
                badges = badges.child(
                    txt("Primary", 11.)
                        .px(px(7.))
                        .py(px(3.))
                        .rounded(px(6.))
                        .bg(self.theme.soft)
                        .text_color(self.theme.accent),
                );
            }
            if a["stm"].is_number() {
                badges = badges
                    .child(txt(format!("{} STM", a["stm"]), 11.).text_color(self.theme.muted));
            }
            badges = badges.child(
                txt(
                    match s(a, "source") {
                        "speedcubedb" => "SpeedCubeDB",
                        "jperm" => "J Perm",
                        "f2ltrainer" => "F2L Trainer",
                        other => other,
                    }
                    .to_string(),
                    11.,
                )
                .text_color(self.theme.muted),
            );
            if !s(a, "youtube").is_empty() {
                badges = badges.child(
                    self.btn(format!("url:{}", s(a, "youtube")), "Video", false, cx)
                        .min_h(px(24.))
                        .text_size(px(11.)),
                );
            }
            algorithms = algorithms.child(
                row()
                    .flex_wrap()
                    .justify_between()
                    .gap(px(14.))
                    .py(px(12.))
                    .border_b_1()
                    .border_color(self.theme.line)
                    .child(self.alg(s(a, "alg"), 18.))
                    .child(badges),
            );
        }
        body = body.child(algorithms).child(self.heading("Statistics"));
        if number(&self.case_history["summary"]["count"]) > 0. {
            body = body.child(self.profile_stats(&self.case_history.clone(), cx));
        } else {
            body = body.child(self.empty("No solves yet."));
        }
        // The body keeps only a small bottom padding: the action bar below it sits above the
        // floating navbar and carries the padding the navbar needs.
        let body = body.pb(px(12.));
        col()
            .size_full()
            .gap(px(12.))
            .child(
                row().justify_between().child(
                    self.btn("back", "", false, cx)
                        .child(icon("IconBack", 16.))
                        .child(s(&c, "setLabel").to_string()),
                ),
            )
            .child(body)
            .child(self.detail_actions(&c, cx))
    }
    /// Previous / Learned / Train / Next, mirrored by the left and right arrow keys.
    fn detail_actions(&mut self, c: &Value, cx: &Context<Self>) -> Div {
        let set = s(c, "set").to_owned();
        let ids: Vec<String> = self
            .all_cases()
            .iter()
            .filter(|v| s(v, "set") == set)
            .map(|v| s(v, "id").to_owned())
            .collect();
        let index = ids.iter().position(|id| *id == self.case_id);
        let has_previous = index.is_some_and(|i| i > 0);
        let has_next = index.is_some_and(|i| i + 1 < ids.len());
        let learned = self.learned.contains(&self.case_id);
        let step = |s: &Self, action: &str, ic: &str, enabled: bool| {
            s.btn(action, "", false, cx)
                .w(px(38.))
                .justify_center()
                .opacity(if enabled { 1. } else { 0.35 })
                .child(icon(ic, 16.))
        };
        row()
            .items_center()
            .justify_between()
            .gap(px(8.))
            .pb(px(if self.width <= 760. { 64. } else { 68. }))
            .child(
                row()
                    .items_center()
                    .gap(px(4.))
                    .child(step(self, "caseStep:previous", "IconBack", has_previous))
                    .child(
                        txt(
                            format!("{} / {}", index.map_or(0, |i| i + 1), ids.len()),
                            12.,
                        )
                        .min_w(px(48.))
                        .text_center()
                        .text_color(self.theme.muted),
                    )
                    .child(step(self, "caseStep:next", "IconChevronRight", has_next)),
            )
            .child(
                row()
                    .gap(px(8.))
                    .child(
                        self.btn(format!("learn:{}", self.case_id), "", false, cx)
                            .text_color(if learned {
                                self.theme.good
                            } else {
                                self.theme.text
                            })
                            .when(learned, |d| d.child(icon("IconCheck", 14.)))
                            .child(if learned { "Learned" } else { "Mark learned" }),
                    )
                    .child(
                        self.btn("train", "", true, cx)
                            .bg(self.theme.accent)
                            .text_color(gpui::white())
                            .child(icon("IconTimer", 16.))
                            .child("Train"),
                    ),
            )
    }
    fn heading(&self, text: &str) -> Div {
        txt(text.to_uppercase(), 11.)
            .font_weight(FontWeight::BOLD)
            .text_color(self.theme.muted)
    }
    fn appearance(&self, cx: &Context<Self>) -> Div {
        let setting = || {
            row()
                .justify_between()
                .gap(px(12.))
                .min_h(px(48.))
                .py(px(6.))
                .border_b_1()
                .border_color(self.theme.line)
        };
        let mut swatches = row().gap(px(8.));
        for (name, color) in [
            ("t3-code", 0x3987e5),
            ("t3-chat", 0xed2677),
            ("grove", 0x39ad78),
            ("ocean", 0x42a4dc),
            ("ember", 0xe1783f),
            ("iris", 0x9a67df),
        ] {
            swatches = swatches.child(
                self.btn(format!("theme:{name}"), "", false, cx)
                    .size(px(26.))
                    .min_h(px(26.))
                    .px(px(0.))
                    .rounded(px(13.))
                    .bg(rgb(color))
                    .when(name == self.theme_name, |b| {
                        b.border_2().border_color(self.theme.text)
                    }),
            );
        }
        col()
            .child(
                setting()
                    .child(txt("Theme", 14.).font_weight(FontWeight::SEMIBOLD))
                    .child(
                        row()
                            .gap(px(4.))
                            .child(self.btn("light:dark", "Dark", !self.light, cx))
                            .child(self.btn("light:light", "Light", self.light, cx)),
                    ),
            )
            .child(
                setting()
                    .child(txt("Accent", 14.).font_weight(FontWeight::SEMIBOLD))
                    .child(swatches),
            )
            .child(
                setting()
                    .child(txt("Help", 14.).font_weight(FontWeight::SEMIBOLD))
                    .child(self.btn("help", "Open the guides", true, cx)),
            )
    }
    fn account_form(&self, cx: &Context<Self>) -> Div {
        col()
            .gap(px(12.))
            .child(
                row()
                    .gap(px(4.))
                    .child(self.btn("authMode:login", "Sign in", self.login, cx))
                    .child(self.btn("authMode:register", "Create account", !self.login, cx)),
            )
            .child(
                txt(
                    if self.login {
                        "Your local times are merged into your account."
                    } else {
                        "An account keeps your times, statistics and achievements in sync between devices."
                    },
                    14.,
                )
                .text_color(self.theme.muted),
            )
            .child(
                col()
                    .gap(px(6.))
                    .child(
                        txt("Username", 13.)
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(self.theme.secondary),
                    )
                    .child(self.input("username")),
            )
            .child(
                col()
                    .gap(px(6.))
                    .child(
                        txt("Password", 13.)
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(self.theme.secondary),
                    )
                    .child(self.input("password")),
            )
            .when(!self.login, |d| {
                d.child(
                    txt(
                        "3–24 letters, digits or underscores. Password: 10 characters or more.",
                        11.,
                    )
                    .text_color(self.theme.muted),
                )
            })
            .child(
                self.btn(
                    "auth",
                    if self.saving {
                        "One moment…"
                    } else if self.login {
                        "Sign in"
                    } else {
                        "Create account"
                    },
                    true,
                    cx,
                )
                .min_h(px(40.))
                .bg(self.theme.accent)
                .text_color(gpui::white())
                .mr_auto(),
            )
    }
    fn guest_page(&mut self, cx: &Context<Self>) -> Div {
        let scroll = self
            .scroll("guest")
            .gap(px(22.))
            .child(bold("Account", 26.))
            .child(
                txt(
                    "Practise as a guest, or sign in to keep your times, statistics and achievements on every device.",
                    14.,
                )
                .text_color(self.theme.muted),
            )
            .child(self.account_form(cx))
            .child(self.appearance(cx));
        col().size_full().child(scroll)
    }
    fn profile_page(&mut self, cx: &Context<Self>) -> Div {
        if self.profile.is_null() {
            return col().child(self.empty("Loading…"));
        }
        let profile = self.profile.clone();
        let user = &profile["user"];
        let own = true;
        let header = row()
            .flex_wrap()
            .gap(px(14.))
            .child(self.avatar(user, 60.))
            .child(
                col()
                    .flex_1()
                    .min_w(px(140.))
                    .gap(px(2.))
                    .child(bold(s(user, "username"), 24.))
                    .child(
                        txt(format!("Joined {}", s(user, "joined")), 14.)
                            .text_color(self.theme.muted),
                    ),
            )
            .child(self.btn(
                "edit",
                if self.editing { "Close" } else { "Settings" },
                true,
                cx,
            ));
        let mut body = self.scroll("profile").gap(px(16.));
        if self.editing {
            body = body
                .child(self.btn("logout", "Sign out", false, cx).mr_auto())
                .child(self.appearance(cx));
        }
        body = body.child(
            row()
                .flex_wrap()
                .gap(px(12.))
                .child(
                    row()
                        .gap(px(4.))
                        .child(self.btn(
                            "profileMode:playground",
                            "Timer",
                            self.profile_mode == "playground",
                            cx,
                        ))
                        .child(self.btn(
                            "profileMode:training",
                            "Training",
                            self.profile_mode == "training",
                            cx,
                        ))
                        .child(
                            self.btn(
                                "profileMode:achievements",
                                "Achievements",
                                self.profile_mode == "achievements",
                                cx,
                            )
                            .child(
                                txt(
                                    format!(
                                        "{}",
                                        self.achievements["unlocked"].as_u64().unwrap_or(0)
                                    ),
                                    12.,
                                )
                                .font_family("Geist Mono")
                                .text_color(self.theme.muted),
                            ),
                        ),
                )
                .when(self.profile_mode != "achievements", |d| {
                    d.child(
                        self.btn(
                            "menu:profilePuzzles",
                            self.label("puzzles", &self.profile_filter.0),
                            true,
                            cx,
                        )
                        .child(icon("IconChevronDown", 12.)),
                    )
                })
                .when(self.profile_mode == "playground", |d| {
                    d.child(
                        self.btn(
                            "menu:profileScrambles",
                            self.label("scrambles", &self.profile_filter.2),
                            true,
                            cx,
                        )
                        .child(icon("IconChevronDown", 12.)),
                    )
                })
                .when(self.profile_mode != "achievements", |d| {
                    d.child(
                        self.btn(
                            "menu:profileModes",
                            self.label("solveModes", &self.profile_filter.1),
                            true,
                            cx,
                        )
                        .child(icon("IconChevronDown", 12.)),
                    )
                }),
        );
        let mut summary = row().flex_wrap().gap(px(24.));
        if self.profile_mode == "achievements" {
            summary = summary.child(self.kpi(
                "Unlocked",
                format!(
                    "{} / {}",
                    self.achievements["unlocked"].as_u64().unwrap_or(0),
                    self.achievements["total"].as_u64().unwrap_or(0)
                ),
                24.,
            ));
        }
        for (label, key) in [
            ("Solves", "totalSolves"),
            ("Training", "trainingSolves"),
            ("Cases", "cases"),
            ("Active days", "activeDays"),
        ] {
            if self.profile_mode == "achievements" && ["trainingSolves", "cases"].contains(&key) {
                continue;
            }
            summary = summary.child(self.kpi(
                label,
                if key == "cases" {
                    list(&profile[key]).len().to_string()
                } else {
                    profile[key].to_string()
                },
                24.,
            ));
        }
        body = body.child(summary);
        if self.profile_mode == "achievements" {
            body = self.achievements_list(body, cx);
        } else if self.profile_mode == "training" {
            let cases = self.all_cases();
            let width = self.width.min(1100.) - 48.;
            let cols = ((width + 4.) / 100.).floor();
            let tile = (width - (cols - 1.) * 4.) / cols;
            let mut stages = vec!["all".to_string()];
            for set in self.all_sets().iter() {
                let stage = s(set, "stage").to_owned();
                if !stages.contains(&stage) {
                    stages.push(stage);
                }
            }
            let tabs = row().children(stages.iter().map(|stage| {
                self.btn(
                    format!("profileStage:{stage}"),
                    if stage == "all" { "All" } else { stage },
                    self.profile_stage == *stage,
                    cx,
                )
            }));
            body = body.child(
                row()
                    .flex_wrap()
                    .gap(px(12.))
                    .child(tabs)
                    .child(self.input("cases"))
                    .child(
                        txt(
                            format!(
                                "{} / {} trained",
                                list(&profile["cases"]).len(),
                                cases.len()
                            ),
                            13.,
                        )
                        .text_color(self.theme.muted),
                    ),
            );
            for set in self.all_sets().iter() {
                let id = s(set, "id");
                let chosen: Vec<_> = cases
                    .iter()
                    .filter(|c| {
                        s(c, "set") == id
                            && (self.profile_stage == "all" || s(c, "stage") == self.profile_stage)
                            && format!(
                                "{} {} {} {}",
                                s(c, "id"),
                                s(c, "name"),
                                s(c, "group"),
                                s(set, "label")
                            )
                            .to_lowercase()
                            .contains(&self.field("cases", cx).trim().to_lowercase())
                    })
                    .cloned()
                    .collect();
                if chosen.is_empty() {
                    continue;
                }
                let key = format!("profile:{id}");
                let mut block = col().gap(px(4.)).child(
                    self.btn(format!("collapse:{key}"), s(set, "label"), false, cx)
                        .px(px(0.))
                        .text_color(self.theme.text),
                );
                if !self.collapsed.contains(&key) {
                    let mut grid = row().flex_wrap().gap(px(4.));
                    for c in chosen {
                        let stat = list(&profile["cases"])
                            .into_iter()
                            .find(|d| d["summary"]["caseId"] == c["id"]);
                        let pic = self.diagram(&c, 72.);
                        grid = grid.child(
                            self.btn(format!("profileCase:{}", s(&c, "id")), "", false, cx)
                                .w(px(tile))
                                .flex_col()
                                .px(px(4.))
                                .py(px(8.))
                                .gap(px(2.))
                                .when(stat.is_none(), |d| d.opacity(0.5))
                                .child(pic)
                                .child(bold(
                                    s(&c, "id")
                                        .split_once(' ')
                                        .map(|(_, s)| s)
                                        .unwrap_or(s(&c, "id")),
                                    13.,
                                ))
                                .child(
                                    txt(
                                        stat.map(|v| ft(&v["summary"]["best"]))
                                            .unwrap_or("—".into()),
                                        12.,
                                    )
                                    .font_family("Geist Mono")
                                    .text_color(self.theme.accent),
                                ),
                        );
                    }
                    block = block.child(grid);
                }
                body = body.child(block);
            }
        } else if number(&profile["playground"]["summary"]["count"]) > 0. {
            body = body.child(self.profile_stats(&profile["playground"], cx));
        } else {
            body = body
                .child(self.empty("No times in this selection yet."))
                .when(own, |d| {
                    d.child(self.btn("nav:playground", "Open the timer", true, cx))
                });
        }
        col().size_full().gap(px(14.)).child(header).child(body)
    }
    /// Groups in display order: every puzzle with goals, then the general goals.
    fn achievement_groups(&self) -> Vec<String> {
        let mut groups = Vec::new();
        for a in list(&self.achievements["achievements"]) {
            let group = s(&a, "group").to_owned();
            if !groups.contains(&group) {
                groups.push(group);
            }
        }
        groups
    }
    fn achievements_list(&mut self, mut body: Stateful<Div>, cx: &Context<Self>) -> Stateful<Div> {
        let all = list(&self.achievements["achievements"]);
        let group_label = if self.achievement_group == "all" {
            "All puzzles".to_owned()
        } else {
            self.achievement_group.clone()
        };
        body = body.child(
            row()
                .flex_wrap()
                .gap(px(12.))
                .child(
                    self.btn("menu:achievementGroups", group_label, true, cx)
                        .child(icon("IconChevronDown", 12.)),
                )
                .child(
                    row().gap(px(4.)).children(
                        [
                            ("all", "All"),
                            ("unlocked", "Unlocked"),
                            ("locked", "Locked"),
                        ]
                        .into_iter()
                        .map(|(id, label)| {
                            self.btn(
                                format!("achievementFilter:{id}"),
                                label,
                                self.achievement_filter == id,
                                cx,
                            )
                        }),
                    ),
                ),
        );
        let mut shown = 0;
        for group in self.achievement_groups() {
            if self.achievement_group != "all" && self.achievement_group != group {
                continue;
            }
            let members: Vec<_> = all.iter().filter(|a| s(a, "group") == group).collect();
            let unlocked = members.iter().filter(|a| a["unlocked"] == true).count();
            let visible: Vec<_> = members
                .iter()
                .filter(|a| match self.achievement_filter.as_str() {
                    "unlocked" => a["unlocked"] == true,
                    "locked" => a["unlocked"] != true,
                    _ => true,
                })
                .collect();
            if visible.is_empty() {
                continue;
            }
            shown += visible.len();
            let puzzle_id = s(members[0], "puzzle").to_owned();
            let mut block = col().gap(px(2.)).child(
                row()
                    .gap(px(8.))
                    .min_h(px(38.))
                    .pt(px(10.))
                    .child(if puzzle_id.is_empty() {
                        icon("IconTrophy", 16.)
                    } else {
                        puzzle_icon(&puzzle_id, 18.)
                    })
                    .child(
                        txt(group.clone(), 15.)
                            .font_weight(FontWeight::SEMIBOLD)
                            .flex_1(),
                    )
                    .child(
                        txt(format!("{unlocked} / {}", members.len()), 12.)
                            .font_family("Geist Mono")
                            .text_color(self.theme.muted),
                    ),
            );
            for a in visible {
                let done = a["unlocked"] == true;
                let ratio = number(&a["ratio"]).clamp(0., 1.) as f32;
                let t = self.theme;
                block = block.child(
                    row()
                        .gap(px(12.))
                        .py(px(10.))
                        .px(px(2.))
                        .border_b_1()
                        .border_color(t.line)
                        .when(!done, |d| d.opacity(0.72))
                        .child(
                            div()
                                .size(px(40.))
                                .flex_none()
                                .flex()
                                .items_center()
                                .justify_center()
                                .rounded(px(12.))
                                .bg(if done { t.soft } else { t.surface2 })
                                .text_color(if done { t.accent } else { t.muted })
                                .child(if done {
                                    icon("IconTrophy", 18.)
                                } else {
                                    icon("IconLock", 16.)
                                }),
                        )
                        .child(
                            col()
                                .flex_1()
                                .min_w(px(0.))
                                .gap(px(3.))
                                .child(
                                    row()
                                        .justify_between()
                                        .gap(px(10.))
                                        .child(bold(s(a, "title"), 14.))
                                        .child(
                                            txt(
                                                if done && !s(a, "unlockedDate").is_empty() {
                                                    s(a, "unlockedDate")
                                                } else {
                                                    s(a, "detail")
                                                },
                                                12.,
                                            )
                                            .font_family("Geist Mono")
                                            .text_color(if done { t.accent } else { t.muted }),
                                        ),
                                )
                                .child(txt(s(a, "description"), 12.).text_color(t.muted))
                                .child(
                                    div()
                                        .w_full()
                                        .h(px(3.))
                                        .mt(px(4.))
                                        .rounded(px(2.))
                                        .bg(t.surface2)
                                        .child(
                                            div()
                                                .h(px(3.))
                                                .rounded(px(2.))
                                                .w(relative(ratio))
                                                .bg(if done { t.accent } else { t.muted }),
                                        ),
                                ),
                        ),
                );
            }
            body = body.child(block);
        }
        if shown == 0 {
            body = body.child(self.empty(if self.achievement_filter == "unlocked" {
                "Nothing unlocked here yet. Keep practising!"
            } else {
                "Everything here is unlocked."
            }));
        }
        body
    }
    fn profile_stats(&mut self, data: &Value, cx: &Context<Self>) -> Div {
        let mut metrics = row().flex_wrap().gap(px(24.));
        for (label, key) in [
            ("Best", "best"),
            ("Mean", "mean"),
            ("Ao5", "ao5"),
            ("Ao12", "ao12"),
            ("Best Ao5", "bestAo5"),
            ("Best Ao12", "bestAo12"),
        ] {
            metrics = metrics.child(self.kpi(label, ft(&data["summary"][key]), 24.));
        }
        let history = list(&data["history"]);
        let mut recent = col();
        recent = recent.child(
            row()
                .h(px(36.))
                .gap(px(24.))
                .text_color(self.theme.muted)
                .child(txt("#", 13.).w(px(54.)))
                .child(txt("Time", 13.).w(px(132.)))
                .child(txt("Date", 13.)),
        );
        for (i, item) in history.iter().enumerate().rev().take(20) {
            recent = recent.child(
                self.btn(format!("solve:{}", item["id"]), "", false, cx)
                    .px(px(10.))
                    .min_h(px(40.))
                    .w_full()
                    .gap(px(24.))
                    .border_b_1()
                    .border_color(self.theme.line)
                    .font_weight(FontWeight::NORMAL)
                    .child(txt((i + 1).to_string(), 14.).w(px(54.)))
                    .child(
                        txt(
                            if item["time"].is_null() {
                                "DNF".into()
                            } else {
                                ft(&item["time"])
                            },
                            14.,
                        )
                        .w(px(132.))
                        .text_color(self.theme.text),
                    )
                    .child(txt(
                        s(item, "displayDate")
                            .replace('T', " ")
                            .get(..16)
                            .unwrap_or("")
                            .to_owned(),
                        14.,
                    )),
            );
        }
        let chart = self.chart(data);
        col()
            .gap(px(16.))
            .child(metrics)
            .child(
                row()
                    .justify_between()
                    .child(
                        row()
                            .gap(px(14.))
                            .text_color(self.theme.muted)
                            .child(txt("━ Single", 12.).text_color(self.theme.accent))
                            .child(txt("━ Ao5", 12.).text_color(self.theme.series)),
                    )
                    .child(self.btn("menu:chartTable", "Table", false, cx)),
            )
            .child(chart)
            .child(
                row()
                    .justify_between()
                    .child(bold("Recent times", 17.))
                    .child(
                        txt(format!("{} solves", history.len()), 14.).text_color(self.theme.muted),
                    ),
            )
            .child(recent)
    }
    fn chart(&self, data: &Value) -> Div {
        let history = list(&data["history"]);
        let values: Vec<Option<f32>> = history
            .iter()
            .map(|v| v["time"].as_f64().map(|n| n as f32))
            .collect();
        let avg: Vec<Option<f32>> = list(&data["ao5"])
            .iter()
            .map(|v| v.as_f64().map(|n| n as f32))
            .collect();
        let all: Vec<f32> = values.iter().chain(&avg).flatten().copied().collect();
        let low = all.iter().copied().reduce(f32::min).unwrap_or(0.);
        let high = all
            .iter()
            .copied()
            .reduce(f32::max)
            .unwrap_or(1.)
            .max(low + 1.);
        let range = (high - low) * 1.24;
        let lo = low - (high - low) * 0.12;
        let t = self.theme;
        let paint = canvas(
            move |_, _, _| (),
            move |bounds, _, window, _| {
                let w: f32 = bounds.size.width.into();
                let h: f32 = bounds.size.height.into();
                let point_at = |i: usize, v: f32| {
                    point(
                        bounds.left()
                            + px(44.
                                + i as f32 / (values.len().saturating_sub(1).max(1)) as f32
                                    * (w - 60.)),
                        bounds.top() + px(12. + (1. - (v - lo) / range) * (h - 38.)),
                    )
                };
                for n in 0..4 {
                    let y = bounds.top() + px(12. + n as f32 / 3. * (h - 38.));
                    window.paint_quad(fill(
                        Bounds::new(point(bounds.left() + px(44.), y), size(px(w - 60.), px(1.))),
                        t.line,
                    ));
                }
                for (series, color) in [(&values, t.accent), (&avg, t.series)] {
                    let mut path = PathBuilder::stroke(px(1.8));
                    let mut pen = false;
                    for (i, v) in series.iter().enumerate() {
                        if let Some(v) = v {
                            let p = point_at(i, *v);
                            if pen {
                                path.line_to(p);
                            } else {
                                path.move_to(p);
                                pen = true;
                            }
                        } else {
                            pen = false;
                        }
                    }
                    if let Ok(path) = path.build() {
                        window.paint_path(path, color);
                    }
                }
            },
        )
        .w_full()
        .h(px(240.));
        div().w_full().h(px(240.)).child(paint)
    }
    fn solve_card(&self, solve: &Value) -> Div {
        col()
            .gap(px(2.))
            .p(px(10.))
            .rounded(px(14.))
            .bg(self.theme.surface)
            .child(
                txt(format!("{} · {}", puzzle(solve), s(solve, "case_id")), 11.)
                    .text_color(self.theme.muted),
            )
            .child(
                bold(
                    if solve["penalty"] == "dnf" {
                        "DNF".into()
                    } else {
                        ft(&solve["time_ms"])
                    },
                    20.,
                )
                .font_family("Geist Mono"),
            )
            .child(txt(s(solve, "created_at"), 12.).text_color(self.theme.muted))
            .when(!s(solve, "scramble").is_empty(), |d| {
                d.child(txt(s(solve, "scramble"), 12.).font_family("Geist Mono"))
            })
            .when(!s(solve, "comment").is_empty(), |d| {
                d.child(
                    row()
                        .items_start()
                        .gap(px(6.))
                        .mt(px(4.))
                        .text_color(self.theme.secondary)
                        .child(icon("IconComment", 13.).mt(px(2.)))
                        .child(txt(s(solve, "comment"), 13.).flex_1()),
                )
            })
    }
    fn select_options(&self) -> (&'static str, Vec<Value>, String) {
        match self.overlay.as_str() {
            "profilePuzzles" => (
                "profilePuzzle",
                list(&self.catalog["puzzles"]["puzzles"]),
                self.profile_filter.0.clone(),
            ),
            "profileModes" => (
                "profileSolveMode",
                list(&self.catalog["puzzles"]["solveModes"]),
                self.profile_filter.1.clone(),
            ),
            "profileScrambles" => {
                let info = list(&self.catalog["puzzles"]["puzzles"])
                    .into_iter()
                    .find(|p| p["id"] == self.profile_filter.0)
                    .unwrap();
                (
                    "profileScramble",
                    list(&self.catalog["puzzles"]["scrambles"])
                        .into_iter()
                        .filter(|v| list(&info["scrambles"]).contains(&v["id"]))
                        .collect(),
                    self.profile_filter.2.clone(),
                )
            }
            "achievementGroups" => (
                "achievementGroup",
                std::iter::once(json!({"id":"all","label":"All puzzles"}))
                    .chain(
                        self.achievement_groups()
                            .into_iter()
                            .map(|g| json!({"id":g,"label":g})),
                    )
                    .collect(),
                self.achievement_group.clone(),
            ),
            "puzzles" => (
                "puzzle",
                list(&self.catalog["puzzles"]["puzzles"]),
                self.puzzle.clone(),
            ),
            "modes" => (
                "mode",
                list(&self.catalog["puzzles"]["solveModes"]),
                self.solve_mode.clone(),
            ),
            "scrambles" => (
                "scrambleType",
                list(&self.catalog["puzzles"]["scrambles"])
                    .into_iter()
                    .filter(|v| list(&self.puzzle_info()["scrambles"]).contains(&v["id"]))
                    .collect(),
                self.scramble_type.clone(),
            ),
            _ => ("", vec![], String::new()),
        }
    }
    fn overlay_view(&mut self, cx: &Context<Self>) -> Div {
        let mut menu = col()
            .id("overlay-scroll")
            .max_h(px(self.height - 80.))
            .overflow_y_scroll()
            .p(px(6.))
            .min_w(px(180.))
            .rounded(px(16.))
            .bg(self.theme.surface)
            .border_1()
            .border_color(self.theme.line)
            // Clicks inside the panel must not reach the dismiss layer underneath.
            .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation());
        let (kind, values, current) = self.select_options();
        let count = values.len();
        for (index, value) in values.into_iter().enumerate() {
            let id = s(&value, "id");
            menu = menu.child(
                self.btn(format!("{kind}:{id}"), "", self.select_index == index, cx)
                    .min_h(px(38.))
                    .w_full()
                    .text_color(if current == id {
                        self.theme.accent
                    } else {
                        self.theme.text
                    })
                    .when(kind == "puzzle" || kind == "profilePuzzle", |d| {
                        d.child(puzzle_icon(id, 22.))
                    })
                    .child(txt(s(&value, "label"), 13.).flex_1())
                    .child(
                        div()
                            .size(px(14.))
                            .when(current == id, |d| d.child(icon("IconCheck", 14.))),
                    ),
            );
        }
        if self.overlay == "solve" {
            if let Some(solve) = &self.overlay_solve {
                let commented = !s(solve, "comment").is_empty();
                menu = menu
                    .child(self.solve_card(solve))
                    .child(
                        self.btn(
                            format!("comment:{}", solve["id"]),
                            if commented { "Edit comment" } else { "Add comment" },
                            false,
                            cx,
                        )
                        .child(icon("IconComment", 14.)),
                    )
                    .child(
                        self.btn(format!("delete:{}", solve["id"]), "Delete", false, cx)
                            .text_color(self.theme.danger),
                    );
            }
        }
        if self.overlay == "comment" {
            let solve = self
                .solves
                .iter()
                .find(|s| s["id"] == self.comment_solve)
                .cloned()
                .unwrap_or(Value::Null);
            let commented = !s(&solve, "comment").is_empty();
            let value = if solve["penalty"] == "dnf" {
                "DNF".into()
            } else {
                ft(&solve["time_ms"])
            };
            let mut foot = row().w_full().gap(px(6.));
            if commented {
                foot = foot.justify_between().child(
                    self.btn("commentClear", "Remove", false, cx)
                        .text_color(self.theme.danger),
                );
            } else {
                foot = foot.justify_end();
            }
            foot = foot.child(
                row()
                    .gap(px(6.))
                    .child(self.btn("commentCancel", "Cancel", false, cx))
                    .child(
                        self.btn("commentSave", "Save", true, cx)
                            .text_color(self.theme.accent),
                    ),
            );
            menu = menu
                .w(px((self.width - 24.).min(440.)))
                .p(px(16.))
                .gap(px(12.))
                .child(
                    row()
                        .justify_between()
                        .child(self.heading("Comment"))
                        .child(
                            self.btn("commentCancel", "", false, cx)
                                .child(icon("IconClose", 16.)),
                        ),
                )
                .child(
                    txt(format!("{} · {}", value, puzzle(&solve)), 13.)
                        .font_family("Geist Mono")
                        .text_color(self.theme.muted),
                )
                .child(self.input("comment"))
                .child(foot);
        }
        if self.overlay == "profileCase" {
            let c = self.find_case(&self.case_id);
            let pic = self.diagram(&c, 96.);
            let data = list(&self.profile["cases"])
                .into_iter()
                .find(|d| d["summary"]["caseId"] == c["id"])
                .unwrap_or(Value::Null);
            let contents = if data.is_null() {
                self.empty("Not trained yet.")
            } else {
                self.profile_stats(&data, cx)
            };
            menu = menu
                .w(px((self.width - 24.).min(760.)))
                .p(px(20.))
                .gap(px(14.))
                .child(
                    row()
                        .justify_between()
                        .child(self.heading(s(&self.profile["user"], "username")))
                        .child(
                            self.btn("back", "", false, cx)
                                .child(icon("IconClose", 16.)),
                        ),
                )
                .child(
                    row()
                        .gap(px(16.))
                        .child(pic)
                        .child(
                            col()
                                .flex_1()
                                .child(bold(self.case_id.clone(), 24.))
                                .child(txt(s(&c, "group"), 14.).text_color(self.theme.muted)),
                        )
                        .child(self.btn("train", "Train", true, cx)),
                )
                .child(contents);
        }
        if self.overlay == "chartTable" {
            let data = if self.case_id.is_empty() {
                self.profile["playground"].clone()
            } else {
                self.case_history.clone()
            };
            menu = menu.child(self.btn("back", "Close", true, cx));
            for (i, h) in list(&data["history"]).iter().enumerate() {
                menu = menu.child(
                    row()
                        .gap(px(20.))
                        .p(px(8.))
                        .child(txt((i + 1).to_string(), 13.))
                        .child(txt(ft(&h["time"]), 13.))
                        .child(txt(s(h, "at"), 13.)),
                );
            }
        }
        if self.overlay == "search" {
            let results = self.search_results(cx);
            let query = self.field("search", cx);
            let index = self.select_index.min(results.len().saturating_sub(1));
            let width = (self.width - 24.).min(560.);
            let mut list_view = col().gap(px(2.)).id("search-results");
            for (i, c) in results.iter().enumerate() {
                let id = s(c, "id").to_owned();
                let pic = self.diagram(c, 40.);
                list_view = list_view.child(
                    self.btn(format!("case:{id}"), "", i == index, cx)
                        .w_full()
                        .gap(px(12.))
                        .px(px(10.))
                        .py(px(6.))
                        .child(pic)
                        .child(
                            col()
                                .flex_1()
                                .min_w_0()
                                .child(bold(s(c, "name"), 14.))
                                .child(txt(case_kind(c), 12.).text_color(self.theme.muted)),
                        )
                        .child(txt(id, 12.).text_color(self.theme.muted)),
                );
            }
            if results.is_empty() {
                list_view = list_view.child(
                    txt(
                        if query.trim().is_empty() {
                            "Type a set, a group or a case: oll, oll fish, pll t, f2l 6…"
                        } else {
                            "No case matches."
                        },
                        13.,
                    )
                    .p(px(10.))
                    .text_color(self.theme.muted),
                );
            }
            menu = menu
                .w(px(width))
                .p(px(12.))
                .gap(px(10.))
                .child(self.input("search"))
                .child(list_view);
        }
        let modal =
            ["profileCase", "chartTable", "search", "comment"].contains(&self.overlay.as_str());
        let mut layer = div().absolute().inset_0().child(
            div()
                .id("dismiss-overlay")
                .absolute()
                .inset_0()
                .bg(if modal { rgba(0x00000099) } else { rgba(0) })
                .on_mouse_down(
                    MouseButton::Left,
                    cx.listener(|s, _, window, cx| {
                        s.overlay.clear();
                        s.focus.focus(window);
                        cx.notify();
                    }),
                ),
        );
        let mut position = div().absolute();
        if modal {
            let modal_width = (self.width - 24.).min(match self.overlay.as_str() {
                "search" => 560.,
                "comment" => 440.,
                _ => 760.,
            });
            position = position
                .left(px((self.width - modal_width) / 2.))
                .top(px(20.));
        } else if count > 0 {
            let anchor = self
                .control_bounds
                .borrow()
                .get(&format!("menu:{}", self.overlay))
                .copied()
                .unwrap_or(Bounds::new(
                    point(px(14.), px(12.)),
                    size(px(180.), px(34.)),
                ));
            let width = f32::from(anchor.size.width)
                .max(if kind == "scrambleType" || kind == "profileScramble" {
                    240.
                } else {
                    190.
                })
                .min(self.width - 16.);
            let height = (count as f32 * 38. + 14.).min(self.height - 24.);
            let x = f32::from(anchor.left()).clamp(8., (self.width - width - 8.).max(8.));
            let below = f32::from(anchor.bottom()) + 6.;
            let top = if below + height <= self.height - 8. {
                below
            } else {
                (f32::from(anchor.top()) - height - 6.).max(8.)
            };
            menu = menu.w(px(width)).max_h(px(height)).min_w_0();
            position = position.left(px(x)).top(px(top));
        } else {
            position = position
                .left(px((self.width / 2. - 180.).max(8.)))
                .top(px(52.));
        }
        layer = layer.child(position.child(menu));
        layer
    }
}
impl Render for Cubix {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if std::env::var_os("CUBIX_TRACE").is_some() {
            eprintln!("render {} hide={}", self.page, self.hide);
        }
        self.width = window.viewport_size().width.into();
        self.height = window.viewport_size().height.into();
        self.theme = Theme::new(&self.theme_name, self.light);
        self.prepare_cube(cx);
        let t = self.theme;
        for field in self.fields.values() {
            field.update(cx, |f, _| f.colors = (t.surface2, t.text, t.muted));
        }
        let enabled = !self.saving
            && !self.generating
            && self.error.is_empty()
            && (self.page != "training" || !self.selected.is_empty());
        let size = if self.width <= 700. {
            (self.width * 0.15).clamp(56., 84.)
        } else {
            (self.width * 0.07).clamp(60., 108.)
        };
        self.timer.update(cx, |timer, _| {
            timer.theme = t;
            timer.font_size = size;
            timer.compact = self.width <= 700.;
            timer.enabled = enabled;
        });
        let running = self.timer.read(cx).phase == Phase::Running;
        let target = if running { 1. } else { 0. };
        if self.hide != target || self.hide_from != target {
            // Elements clear the screen fast when the timer starts and come back at ease.
            let duration = if running { 0.18 } else { 0.35 };
            let t = (self.hide_since.elapsed().as_secs_f32() / duration).min(1.);
            let eased = if t < 0.5 {
                4. * t * t * t
            } else {
                1. - (-2. * t + 2.).powi(3) / 2.
            };
            self.hide = self.hide_from + (target - self.hide_from) * eased;
            if t < 1. {
                window.request_animation_frame();
            } else {
                self.hide = target;
                self.hide_from = target;
            }
        }
        let practice = ["playground", "training"].contains(&self.page.as_str());
        let guest = self.guest() && self.page == "profile";
        let guide = self.page.ends_with("Guide");
        let content = if guide {
            self.guide_page(cx)
        } else if practice {
            self.practice(cx)
        } else if guest {
            self.guest_page(cx)
        } else {
            match self.page.as_str() {
                "algorithms" => {
                    if self.case_id.is_empty() {
                        self.virtual_catalog(cx)
                    } else {
                        self.detail(cx)
                    }
                }
                "profile" => self.profile_page(cx),
                _ => self.empty("Loading…"),
            }
        };
        let mut app = div()
            .id("cubix")
            .size_full()
            .relative()
            .overflow_hidden()
            .bg(t.bg)
            .text_color(t.text)
            .font_family("Geist")
            .font_weight(FontWeight::MEDIUM)
            .text_size(px(14.))
            .line_height(relative(1.45))
            .track_focus(&self.focus)
            .on_mouse_down(
                MouseButton::Navigate(NavigationDirection::Back),
                cx.listener(|s, _, window, cx| {
                    s.travel(true, window, cx);
                    cx.stop_propagation();
                }),
            )
            .on_mouse_down(
                MouseButton::Navigate(NavigationDirection::Forward),
                cx.listener(|s, _, window, cx| {
                    s.travel(false, window, cx);
                    cx.stop_propagation();
                }),
            )
            .on_scroll_wheel(cx.listener(|s, event: &ScrollWheelEvent, window, cx| {
                s.swipe(event, window, cx);
            }))
            .on_key_down(cx.listener(|s, event: &KeyDownEvent, window, cx| {
                if s.timer.read(cx).phase == Phase::Running && !event.is_held {
                    s.timer.update(cx, |t, cx| t.press(cx));
                    cx.stop_propagation();
                    return;
                }
                let typing = s
                    .fields
                    .values()
                    .any(|f| f.read(cx).focus_handle(cx).is_focused(window));
                let key = event.keystroke.key.as_str();
                if event.keystroke.modifiers.alt && matches!(key, "left" | "right") {
                    s.travel(key == "left", window, cx);
                    cx.stop_propagation();
                    return;
                }
                let ctrl = event.keystroke.modifiers.control || event.keystroke.modifiers.platform;
                if ctrl && key == "k" && s.overlay != "search" {
                    s.open_search(window, cx);
                    cx.stop_propagation();
                    return;
                }
                if s.overlay == "search" {
                    // Ctrl+J / Ctrl+K, Ctrl+N / Ctrl+P (or the arrows) move through the results; Enter opens the case.
                    let results = s.search_results(cx);
                    let count = results.len();
                    match key {
                        "escape" => s.close_search(window, cx),
                        "down" | "j" | "n" if count > 0 && (key == "down" || ctrl) => {
                            s.select_index = (s.select_index + 1) % count
                        }
                        "up" | "k" | "p" if count > 0 && (key == "up" || ctrl) => {
                            s.select_index = (s.select_index + count - 1) % count
                        }
                        "enter" if count > 0 => {
                            let id = crate::app::s(
                                &results[s.select_index.min(results.len() - 1)],
                                "id",
                            )
                            .to_owned();
                            s.close_search(window, cx);
                            s.action(&format!("case:{id}"), window, cx);
                        }
                        _ => return,
                    }
                    cx.stop_propagation();
                    cx.notify();
                    return;
                }
                if !s.overlay.is_empty() {
                    let (kind, values, _) = s.select_options();
                    if !values.is_empty() {
                        match key {
                            "down" => s.select_index = (s.select_index + 1) % values.len(),
                            "up" => {
                                s.select_index = (s.select_index + values.len() - 1) % values.len()
                            }
                            "home" => s.select_index = 0,
                            "end" => s.select_index = values.len() - 1,
                            "enter" | "space" => {
                                let action = format!(
                                    "{}:{}",
                                    kind,
                                    crate::app::s(&values[s.select_index], "id")
                                );
                                s.action(&action, window, cx);
                            }
                            "escape" | "tab" => s.overlay.clear(),
                            _ => return,
                        }
                        cx.stop_propagation();
                        cx.notify();
                        return;
                    }
                }
                if typing && s.overlay == "comment" {
                    match key {
                        "enter" => s.action("commentSave", window, cx),
                        "escape" => s.action("commentCancel", window, cx),
                        _ => return,
                    }
                    cx.stop_propagation();
                    cx.notify();
                    return;
                }
                if typing {
                    if key == "enter" && !s.editing {
                        s.action("auth", window, cx);
                    }
                    return;
                }
                if key == "escape" {
                    s.overlay.clear();
                    if s.width < 1024. {
                        s.show_times = false;
                        s.show_cases = false;
                    }
                    cx.notify();
                    return;
                }
                if event.keystroke.modifiers.alt {
                    // AZERTY reports the unshifted digit row as & é " ' rather than 1 2 3 4.
                    let action = match key {
                        "1" | "&" => "nav:playground",
                        "2" | "é" | "eacute" => "nav:algorithms",
                        "3" | "\"" => "nav:training",
                        "4" | "'" => "nav:profile",
                        "n" => "next",
                        "p" => "previous",
                        "c" => "cases",
                        "t" => "times",
                        "a" => "auf",
                        "h" => "solution",
                        "b" => "back",
                        _ => "",
                    };
                    if !action.is_empty() {
                        s.action(action, window, cx);
                    }
                    return;
                }
                // Arrow keys step through the cases of the open set on the catalogue detail page.
                if s.page == "algorithms" && !s.case_id.is_empty() && s.overlay.is_empty() {
                    match key {
                        "left" => s.action("caseStep:previous", window, cx),
                        "right" => s.action("caseStep:next", window, cx),
                        _ => {}
                    }
                }
                if ["playground", "training"].contains(&s.page.as_str()) && s.overlay.is_empty() {
                    let running = s.timer.read(cx).phase == Phase::Running;
                    if running
                        || key == "space"
                            && !event.keystroke.modifiers.control
                            && !event.keystroke.modifiers.platform
                    {
                        if !event.is_held {
                            s.timer.update(cx, |t, cx| t.press(cx));
                            cx.stop_propagation();
                        }
                    }
                }
            }))
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(|s, _, _, cx| {
                    if s.timer.read(cx).phase == Phase::Running {
                        s.timer.update(cx, |t, cx| t.press(cx));
                    }
                }),
            )
            .on_key_up(cx.listener(|s, event: &KeyUpEvent, _, cx| {
                if event.keystroke.key == "space" {
                    s.timer.update(cx, |t, cx| t.release(cx));
                }
            }));
        if practice || guide {
            app = app.child(content);
        } else {
            let width = if guest { 560. } else { 1100. };
            app = app.child(
                col()
                    .w_full()
                    .max_w(px(width))
                    .h_full()
                    .mx_auto()
                    .pt(px(if self.width <= 700. { 12. } else { 18. }))
                    .px(px(if self.width <= 700. { 14. } else { 24. }))
                    .child(content),
            );
        }
        if self.hide < 1. && !guide {
            app = app.child(self.nav(cx));
        }
        if !self.overlay.is_empty() {
            app = app.child(self.overlay_view(cx));
        }
        if !self.error.is_empty() {
            app = app.child(
                row()
                    .absolute()
                    .bottom(px(84.))
                    .left(px(24.))
                    .right(px(24.))
                    .justify_center()
                    .gap(px(8.))
                    .p(px(10.))
                    .rounded(px(12.))
                    .bg(t.danger)
                    .text_color(gpui::white())
                    .child(self.error.clone())
                    .child(self.btn("retry", "Retry", true, cx)),
            );
        }
        app
    }
}
