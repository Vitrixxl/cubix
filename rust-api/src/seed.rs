//! Development data for `cubix-api seed`, compiled only with `--features seed` (compose.dev.yaml):
//! accounts with a year of practice on several events, learned cases, coaches with bookings,
//! reviews and messages, coach applications, duels and traffic for the administration.
//! Only an empty database is seeded, so the development container runs it at every start.
//! The random generator has a fixed seed: every reset gives the same data, dated from today.
use crate::{
    accounts::{DAY_MS, digest, now},
    catalog::Catalog,
    coaching,
    db::all,
    error::{ApiError, Result},
    stats,
};
use argon2::password_hash::{PasswordHasher, SaltString};
use rand::{Rng, SeedableRng, rngs::StdRng, seq::SliceRandom};
use rusqlite::{Connection, Transaction, params};
use serde_json::{Value, json};

/// Every seeded account signs in with this password.
pub const PASSWORD: &str = "cubix-dev-password";
/// The administration token, pasted on /admin.
pub const ADMIN_TOKEN: &str = "cbx_admin_dev";
const HOUR_MS: i64 = 3_600_000;
const MINUTE_MS: i64 = 60_000;

/// An event: its puzzle, solve mode and the time (ms) of an average regular player.
struct Event {
    id: &'static str,
    puzzle: &'static str,
    mode: &'static str,
    typical: f64,
    dnf: f64,
}
const EVENTS: &[Event] = &[
    Event { id: "333", puzzle: "333", mode: "standard", typical: 16_000., dnf: 0.01 },
    Event { id: "222", puzzle: "222", mode: "standard", typical: 5_500., dnf: 0.015 },
    Event { id: "444", puzzle: "444", mode: "standard", typical: 58_000., dnf: 0.015 },
    Event { id: "555", puzzle: "555", mode: "standard", typical: 105_000., dnf: 0.015 },
    Event { id: "666", puzzle: "666", mode: "standard", typical: 190_000., dnf: 0.02 },
    Event { id: "777", puzzle: "777", mode: "standard", typical: 280_000., dnf: 0.02 },
    Event { id: "333oh", puzzle: "333", mode: "one-handed", typical: 28_000., dnf: 0.015 },
    Event { id: "333bf", puzzle: "333", mode: "blindfolded", typical: 110_000., dnf: 0.35 },
    Event { id: "444bf", puzzle: "444", mode: "blindfolded", typical: 420_000., dnf: 0.5 },
    Event { id: "sq1", puzzle: "sq1", mode: "standard", typical: 27_000., dnf: 0.02 },
    Event { id: "pyram", puzzle: "pyram", mode: "standard", typical: 7_000., dnf: 0.02 },
    Event { id: "skewb", puzzle: "skewb", mode: "standard", typical: 8_000., dnf: 0.02 },
    Event { id: "minx", puzzle: "minx", mode: "standard", typical: 95_000., dnf: 0.015 },
    Event { id: "clock", puzzle: "clock", mode: "standard", typical: 13_000., dnf: 0.04 },
];
fn event(id: &str) -> &'static Event {
    EVENTS.iter().find(|e| e.id == id).expect("seed event")
}

/// A seeded account. `skill` multiplies the typical times at the end of the period (0.5 is twice
/// as fast); `practice` is the share of days the player solves; `events` are weighted.
struct Player {
    id: String,
    name: String,
    joined: i64,
    skill: f64,
    practice: f64,
    events: Vec<(&'static str, f64)>,
}

pub struct Summary {
    pub users: usize,
    pub solves: i64,
}

/// Seeds an empty database; returns `None` when it already holds accounts.
pub fn run(db: &mut Connection, catalog: &Catalog) -> Result<Option<Summary>> {
    let count = all(db, "SELECT count(*) n FROM users", [])?[0]["n"].as_i64().unwrap_or(0);
    if count > 0 {
        return Ok(None);
    }
    let hash = crate::api::argon()?
        .hash_password(PASSWORD.as_bytes(), &SaltString::generate(&mut rand::rngs::OsRng))
        .map_err(ApiError::internal)?
        .to_string();
    let mut rng = StdRng::seed_from_u64(2026);
    let at = now();
    let players = players(&mut rng, at);
    let tx = db.transaction()?;
    for p in &players {
        tx.execute(
            "INSERT INTO users(id,username,password_hash,created_at,last_seen_at) VALUES(?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ',?/1000.0,'unixepoch'),?)",
            params![p.id, p.name, hash, p.joined, at - rng.gen_range(0..(3 * DAY_MS))],
        )?;
    }
    for p in &players {
        practice(&tx, &mut rng, catalog, p, at)?;
    }
    coaching_data(&tx, &mut rng, &players, at)?;
    duels(&tx, &mut rng, &players, at)?;
    traffic(&tx, &mut rng, &players, at)?;
    tx.execute(
        "INSERT INTO admin_access(id,digest,version,created_at) VALUES(1,?,'dev',?)",
        params![digest(ADMIN_TOKEN), at],
    )?;
    let solves = all(&tx, "SELECT count(*) n FROM solves", [])?[0]["n"].as_i64().unwrap_or(0);
    tx.commit()?;
    Ok(Some(Summary { users: players.len(), solves }))
}

const NAMES: &[&str] = &[
    "alex_cubes", "ben_tps", "chloe_f2l", "dario_oh", "emma_pll", "felix_roux", "gaia_zz", "hugo_sub10",
    "ines_bld", "jules_lookahead", "kenji_cfop", "lea_skewb", "malo_megaminx", "nora_pyra", "oscar_clock",
    "paula_sq1", "quentin_4x4", "rosa_cross", "sami_ortega", "tess_cll", "ugo_yau", "vera_zbll", "will_2gen",
    "xena_colorneutral", "yann_slowturn", "zoe_newbie", "arthur_rubik", "bea_timer", "cyril_ao100",
    "dina_lsll", "eliott_cube", "fanny_tracking", "gabin_wca", "hana_pb", "ivan_fingertricks",
];
/// A coach: name, skill, events taught, languages, price in cents, headline.
type Coach = (&'static str, f64, &'static [&'static str], &'static [&'static str], i64, &'static str);
const COACHES: &[Coach] = &[
    ("coach", 0.45, &["333", "333oh", "222"], &["French", "English"], 2500, "Sub-8 CFOP, I fix your F2L look-ahead"),
    ("lena_speed", 0.4, &["333", "444", "555"], &["English", "German"], 4000, "Big cubes and reduction, from sub-1 to sub-40"),
    ("tom_onehand", 0.55, &["333oh"], &["English"], 2000, "One-handed specialist, 12 years of OH"),
    ("yuki_blind", 0.6, &["333bf", "444bf"], &["English", "Japanese"], 3500, "Blindfolded: memo, M2/OP to 3-style"),
    ("marco_minx", 0.5, &["minx", "pyram", "skewb"], &["Italian", "English"], 1500, "Megaminx and the small puzzles"),
    ("sofia_sq1", 0.55, &["sq1", "clock"], &["Spanish", "English"], 0, "Free Square-1 lessons for beginners"),
];

fn players(rng: &mut StdRng, at: i64) -> Vec<Player> {
    let mut list = vec![Player {
        id: uuid::Uuid::new_v4().to_string(),
        name: "dev".into(),
        joined: at - 400 * DAY_MS,
        skill: 0.7,
        practice: 0.7,
        events: vec![("333", 10.), ("222", 2.5), ("333oh", 1.5), ("444", 1.2), ("pyram", 1.5), ("skewb", 1.), ("555", 0.5), ("minx", 0.3), ("333bf", 0.4)],
    }];
    for &(name, skill, taught, ..) in COACHES {
        let mut events: Vec<(&'static str, f64)> = taught.iter().map(|e| (event(e).id, 3.)).collect();
        if !taught.contains(&"333") {
            events.push(("333", 2.));
        }
        list.push(Player {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.into(),
            joined: at - rng.gen_range(250..500) * DAY_MS,
            skill,
            practice: rng.gen_range(0.2..0.4),
            events,
        });
    }
    for name in NAMES {
        let mut events = vec![("333", rng.gen_range(3.0..10.0))];
        for e in EVENTS.iter().skip(1) {
            if rng.gen_bool(0.3) {
                events.push((e.id, rng.gen_range(0.3..3.0)));
            }
        }
        list.push(Player {
            id: uuid::Uuid::new_v4().to_string(),
            name: (*name).into(),
            joined: at - rng.gen_range(5..380) * DAY_MS,
            skill: rng.gen_range(0.55..2.2),
            practice: rng.gen_range(0.03..0.35),
            events,
        });
    }
    list
}

/// A standard normal draw (Box-Muller).
fn normal(rng: &mut StdRng) -> f64 {
    let (u, v): (f64, f64) = (rng.gen_range(f64::EPSILON..1.), rng.r#gen());
    (-2. * u.ln()).sqrt() * (std::f64::consts::TAU * v).cos()
}
fn time(rng: &mut StdRng, mean: f64) -> f64 {
    // Mostly near the mean, with a long tail of bad solves.
    let spread = if rng.gen_bool(0.05) { 0.35 } else { 0.11 };
    (mean * (spread * normal(rng)).exp()).max(mean * 0.6).round()
}
fn penalty(rng: &mut StdRng, dnf: f64) -> &'static str {
    let roll: f64 = rng.r#gen();
    if roll < dnf {
        "dnf"
    } else if roll < dnf + 0.025 {
        "+2"
    } else {
        "none"
    }
}

/// A random-move scramble in the puzzle's notation; none for Square-1, whose random moves are
/// not all legal.
fn scramble(rng: &mut StdRng, puzzle: &str) -> Option<String> {
    let suffix = |rng: &mut StdRng| ["", "'", "2"][rng.gen_range(0..3)];
    let cube = |rng: &mut StdRng, faces: &[&str], wide: &[&str], length: usize| {
        let mut moves = Vec::new();
        let mut last = usize::MAX;
        while moves.len() < length {
            let pick = rng.gen_range(0..faces.len() + wide.len());
            let name = if pick < faces.len() { faces[pick] } else { wide[pick - faces.len()] };
            // Never two turns in a row on the same axis.
            let axis = match name.chars().find(char::is_ascii_uppercase) {
                Some('R' | 'L') => 0,
                Some('U' | 'D') => 1,
                _ => 2,
            };
            if axis == last {
                continue;
            }
            last = axis;
            moves.push(format!("{name}{}", suffix(rng)));
        }
        moves.join(" ")
    };
    const FACES: [&str; 6] = ["R", "L", "U", "D", "F", "B"];
    Some(match puzzle {
        "222" => cube(rng, &["R", "U", "F"], &[], 10),
        "333" => cube(rng, &FACES, &[], 20),
        "444" => cube(rng, &FACES, &["Rw", "Lw", "Uw", "Dw", "Fw", "Bw"], 44),
        "555" => cube(rng, &FACES, &["Rw", "Lw", "Uw", "Dw", "Fw", "Bw"], 60),
        "666" => cube(rng, &FACES, &["Rw", "Lw", "Uw", "Dw", "Fw", "Bw", "3Rw", "3Uw", "3Fw"], 80),
        "777" => cube(rng, &FACES, &["Rw", "Lw", "Uw", "Dw", "Fw", "Bw", "3Rw", "3Lw", "3Uw", "3Dw", "3Fw", "3Bw"], 100),
        "pyram" | "skewb" => {
            let mut text = cube(rng, &["R", "L", "U", "B"], &[], if puzzle == "pyram" { 10 } else { 9 }).replace('2', "");
            if puzzle == "pyram" {
                for tip in ["u", "l", "r", "b"] {
                    match rng.gen_range(0..3) {
                        0 => {}
                        1 => text.push_str(&format!(" {tip}")),
                        _ => text.push_str(&format!(" {tip}'")),
                    }
                }
            }
            text
        }
        "minx" => (0..7)
            .map(|_| {
                let mut line: Vec<String> = (0..10)
                    .map(|i| format!("{}{}", if i % 2 == 0 { "R" } else { "D" }, if rng.r#gen() { "++" } else { "--" }))
                    .collect();
                line.push(if rng.r#gen() { "U".into() } else { "U'".into() });
                line.join(" ")
            })
            .collect::<Vec<_>>()
            .join(" "),
        "clock" => {
            let mut pins: Vec<String> = ["UR", "DR", "DL", "UL", "U", "R", "D", "L", "ALL"]
                .iter()
                .map(|p| {
                    let n = rng.gen_range(0..=6);
                    format!("{p}{n}{}", if n == 0 || rng.r#gen() { "+" } else { "-" })
                })
                .collect();
            pins.push("y2".into());
            pins.extend(["U", "R", "D", "L", "ALL"].iter().map(|p| format!("{p}{}+", rng.gen_range(0..=6))));
            pins.join(" ")
        }
        _ => return None,
    })
}

/// A session of solves on one practice context, then its solves.
#[allow(clippy::too_many_arguments)]
fn session(tx: &Transaction, player: &Player, puzzle: &str, mode: &str, kind: &str, training: bool, cases: &[&str], at: i64) -> Result<i64> {
    let size = puzzle.as_bytes()[0].is_ascii_digit().then(|| (puzzle.as_bytes()[0] - b'0') as i64);
    tx.execute(
        "INSERT INTO sessions(mode,case_ids,user_id,cube_size,puzzle_id,solve_mode,scramble_type,created_at)
         VALUES(?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ',?/1000.0,'unixepoch'))",
        params![if training { "training" } else { "playground" }, json!(cases).to_string(), player.id, size, puzzle, mode, kind, at],
    )?;
    Ok(tx.last_insert_rowid())
}
#[allow(clippy::too_many_arguments)]
fn solve(tx: &Transaction, player: &Player, session: i64, puzzle: &str, mode: &str, kind: &str, case: Option<&str>, ms: f64, penalty: &str, scramble: Option<String>, comment: Option<&str>, at: i64) -> Result<()> {
    let size = puzzle.as_bytes()[0].is_ascii_digit().then(|| (puzzle.as_bytes()[0] - b'0') as i64);
    tx.prepare_cached(
        "INSERT INTO solves(session_id,case_id,time_ms,penalty,scramble,comment,user_id,cube_size,puzzle_id,solve_mode,scramble_type,created_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ',?/1000.0,'unixepoch'))",
    )?
    .execute(params![session, case, ms, penalty, scramble, comment, player.id, size, puzzle, mode, kind, at])?;
    Ok(())
}

const COMMENTS: &[&str] = &[
    "PLL skip!", "Lockup on the U perm", "Easy cross, bad F2L", "New PB, finally", "Popped on the last move",
    "Forgot the OLL", "Xcross", "Full step", "Misread the case", "Felt slow but it's fine",
];

/// The account's profile, its learned cases and group orders, and a year of solves: sessions on
/// the days it practised, times improving from twice its final level, and drills on cases.
fn practice(tx: &Transaction, rng: &mut StdRng, catalog: &Catalog, p: &Player, at: i64) -> Result<()> {
    let mut known: Vec<&str> = Vec::new();
    for (id, _) in &p.events {
        let puzzle = event(id).puzzle;
        if !known.contains(&puzzle) {
            known.push(puzzle);
        }
    }
    let mut methods = serde_json::Map::new();
    let catalog_methods: Value = serde_json::from_str(include_str!("../../data/method-ids.json")).map_err(ApiError::internal)?;
    for puzzle in &known {
        let list = catalog_methods[*puzzle].as_array().cloned().unwrap_or_default();
        // The most advanced method for fast players, the first one otherwise.
        let index = if p.skill < 1. { 1.min(list.len().saturating_sub(1)) } else { 0 };
        if let Some(m) = list.get(index) {
            methods.insert((*puzzle).into(), json!([m]));
        }
    }
    let profile = json!({"kind":"profile","knownPuzzles":known,"knownMethods":methods,"priority":null,
        "completedAt": jiff::Timestamp::from_millisecond(p.joined).map_err(ApiError::internal)?.strftime("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()});
    tx.execute("INSERT INTO personal_entries(user_id,key,value) VALUES(?,'profile',?)", params![p.id, profile.to_string()])?;

    // Cases: fast players know all of PLL and most of OLL and F2L; slow ones a few 2-look cases.
    let mut learned: Vec<&str> = Vec::new();
    let share = |set: &str| -> f64 {
        match (set, p.skill) {
            ("pll" | "2look-oll" | "2look-pll", s) if s < 1.2 => 1.,
            ("f2l" | "oll", s) if s < 0.8 => 0.9,
            ("f2l", s) if s < 1.3 => 0.5,
            ("oll", s) if s < 1.1 => 0.35,
            ("zbll-t" | "zbll-u" | "f2l-advanced", s) if s < 0.6 => 0.4,
            ("2look-oll" | "2look-pll", _) => 0.6,
            _ => 0.,
        }
    };
    for case in catalog.cases.as_array().unwrap() {
        let set = case["set"].as_str().unwrap_or("");
        if case.get("puzzle_id").is_none_or(Value::is_null) && rng.gen_bool(share(set)) {
            learned.push(case["id"].as_str().unwrap());
        }
    }
    for id in &learned {
        tx.execute("INSERT INTO learned_cases(user_id,case_id,learned) VALUES(?,?,1)", params![p.id, id])?;
    }
    if p.skill < 1. {
        for track in ["F2L", "OLL", "PLL"] {
            let set = track.to_lowercase();
            let mut groups: Vec<&str> = Vec::new();
            for case in catalog.cases.as_array().unwrap() {
                let group = case["group"].as_str().unwrap_or("");
                if case["set"] == set && !groups.contains(&group) {
                    groups.push(group);
                }
            }
            groups.shuffle(rng);
            tx.execute("INSERT INTO learning_group_orders(user_id,track,groups) VALUES(?,?,?)", params![p.id, track, json!(groups).to_string()])?;
        }
    }

    let total: f64 = p.events.iter().map(|(_, w)| w).sum();
    let span = (at - p.joined) as f64;
    let mut day = p.joined / DAY_MS * DAY_MS;
    while day < at {
        // The main account keeps a streak going: it practised every day of the last two weeks.
        if (p.name == "dev" && at - day < 14 * DAY_MS) || rng.gen_bool(p.practice) {
            // An evening session (or a lunch break), on one or two events.
            let mut clock = day + rng.gen_range(7..20) * HOUR_MS + rng.gen_range(0..60) * MINUTE_MS;
            for _ in 0..rng.gen_range(1..=2) {
                let mut pick = rng.gen_range(0.0..total);
                let id = p.events.iter().find(|(_, w)| { pick -= w; pick < 0. }).map_or("333", |(id, _)| *id);
                let e = event(id);
                // Improvement: twice slower at sign-up, reaching `skill` by today.
                let progress = ((day - p.joined) as f64 / span.max(1.)).clamp(0., 1.);
                let mean = e.typical * p.skill * (1. + 0.9 * (-3. * progress).exp());
                let kind = if e.puzzle == "333" && e.mode == "standard" && rng.gen_bool(0.08) {
                    ["2gen-ru", "f2l", "last-layer", "cross1-4"][rng.gen_range(0..4)]
                } else {
                    "normal"
                };
                // About 5 to 30 solves; more on quick events, fewer on long ones.
                let count = (rng.gen_range(5.0..30.0) * (15_000. / mean).clamp(0.25, 1.3)).round().max(3.) as usize;
                if clock >= at {
                    break;
                }
                let sid = session(tx, p, e.puzzle, e.mode, kind, false, &[], clock)?;
                for _ in 0..count {
                    let ms = time(rng, if kind == "normal" { mean } else { mean * 0.5 });
                    let comment = rng.gen_bool(0.01).then(|| *COMMENTS.choose(rng).unwrap());
                    if clock >= at {
                        break;
                    }
                    solve(tx, p, sid, e.puzzle, e.mode, kind, None, ms, penalty(rng, e.dnf), scramble(rng, e.puzzle), comment, clock)?;
                    clock += ms as i64 + rng.gen_range(8_000..25_000);
                }
            }
            // Drills on known cases, now and then.
            if !learned.is_empty() && rng.gen_bool(0.25) && clock < at {
                let n = rng.gen_range(3..12).min(learned.len());
                let picked: Vec<&str> = learned.choose_multiple(rng, n).copied().collect();
                let sid = session(tx, p, "333", "standard", "case", true, &picked, clock)?;
                for _ in 0..rng.gen_range(10..40) {
                    let id = *picked.choose(rng).unwrap();
                    let setup = catalog.by_id.get(id).and_then(|c| c["setup"].as_str()).map(str::to_owned);
                    let base = if id.starts_with("F2L") { 2_200. } else { 1_700. };
                    if clock >= at {
                        break;
                    }
                    solve(tx, p, sid, "333", "standard", "case", Some(id), time(rng, base * p.skill.max(0.5)), penalty(rng, 0.01), setup, None, clock)?;
                    clock += rng.gen_range(4_000..9_000);
                }
            }
        }
        day += DAY_MS;
    }
    Ok(())
}

/// Coaches with their profile and week, applications in every state, past sessions (most of them
/// reviewed), upcoming ones on free slots, one cancelled, and conversations with unread messages.
fn coaching_data(tx: &Transaction, rng: &mut StdRng, players: &[Player], at: i64) -> Result<()> {
    let by_name = |name: &str| players.iter().find(|p| p.name == name).expect("seed account");
    let students: Vec<&Player> = players.iter().filter(|p| !COACHES.iter().any(|c| c.0 == p.name)).collect();
    let zones = ["Europe/Paris", "Europe/Berlin", "America/New_York", "Asia/Tokyo", "Europe/Rome", "Europe/Madrid"];
    for (i, &(name, _, events, languages, price, headline)) in COACHES.iter().enumerate() {
        let coach = by_name(name);
        let created = at - rng.gen_range(60..200) * DAY_MS;
        tx.execute(
            "INSERT INTO coach_applications(user_id,email,events,experience,message,status,created_at,decided_at) VALUES(?,?,?,?,?,'approved',?,?)",
            params![coach.id, format!("{name}@example.com"), json!(events).to_string(), "Competing since 2015, several national podiums.", "I would love to help players get past their plateau.", created - 3 * DAY_MS, created],
        )?;
        // Weekday evenings and Saturday mornings, in the coach's time zone (minutes of the day).
        let mut windows: Vec<Value> = (0..5).filter(|d| (d + i) % 3 != 2).map(|d| json!({"weekday": d, "start": 17 * 60 + 30 * (i as i64 % 3), "end": 21 * 60})).collect();
        windows.push(json!({"weekday": 5, "start": 9 * 60, "end": 12 * 60}));
        tx.execute(
            "INSERT INTO coaches(user_id,active,accepting,headline,bio,events,languages,price_cents,session_minutes,timezone,windows,days_off,created_at)
             VALUES(?,1,?,?,?,?,?,?,?,?,?,'[]',?)",
            params![
                coach.id,
                (i != 4) as i64,
                headline,
                format!("Hi, I'm {name}! I have coached dozens of players, from their first solve to their first competition.\n\nEach session starts with a few solves on camera, then we work on one thing at a time, with drills you keep after the call."),
                json!(events).to_string(),
                json!(languages).to_string(),
                price,
                [60, 45, 60, 90, 30, 60][i],
                zones[i],
                json!(windows).to_string(),
                created
            ],
        )?;
    }
    // Applications still waiting for the administration, and one refused.
    for (name, status) in [("chloe_f2l", "pending"), ("kenji_cfop", "pending"), ("vera_zbll", "pending"), ("yann_slowturn", "rejected")] {
        let p = by_name(name);
        let created = at - rng.gen_range(1..20) * DAY_MS;
        tx.execute(
            "INSERT INTO coach_applications(user_id,email,events,experience,message,status,created_at,decided_at) VALUES(?,?,?,?,?,?,?,?)",
            params![p.id, format!("{name}@example.com"), json!(["333", "222"]).to_string(), "Sub-12 average, I teach at my local club.", "I'd like to coach beginners on CFOP and F2L intuition.", status, created, (status != "pending").then_some(created + DAY_MS)],
        )?;
    }

    let dev = by_name("dev");
    let reviews = [
        (5, "Super clear, my F2L is way smoother after two sessions."),
        (5, "Great drills, I finally broke sub-15!"),
        (4, "Very helpful, a bit short on time at the end."),
        (5, ""),
        (3, "Good tips but the call quality was poor."),
        (4, "Learned a lot about look-ahead."),
    ];
    for (i, &(name, ..)) in COACHES.iter().enumerate() {
        let coach = by_name(name);
        let row = all(tx, "SELECT * FROM coaches WHERE user_id=?", [&coach.id])?.remove(0);
        let minutes = row["session_minutes"].as_i64().unwrap_or(60);
        let price = row["price_cents"].as_i64().unwrap_or(0);
        let mut pupils: Vec<&Player> = students.choose_multiple(rng, 4 + i % 3).copied().filter(|p| p.id != dev.id).collect();
        if i < 2 {
            pupils.insert(0, dev);
        }
        let mut upcoming = if row["accepting"] == 1 { coaching::free_slots(&row, &[], at, 28) } else { Vec::new() };
        upcoming.shuffle(rng);
        for (n, pupil) in pupils.iter().enumerate() {
            let mut conversation = None;
            // Past sessions, at round hours.
            for k in 0..rng.gen_range(1..=4) {
                let start = (at - rng.gen_range(2..120) * DAY_MS) / HOUR_MS * HOUR_MS;
                let id = booking(tx, coach, pupil, start, start + minutes * MINUTE_MS, price, "booked", start - 5 * DAY_MS)?;
                if k < 3 && rng.gen_bool(0.75) {
                    let (rating, comment) = reviews[rng.gen_range(0..reviews.len())];
                    tx.execute(
                        "INSERT INTO coach_reviews(booking_id,coach_id,student_id,rating,comment,created_at) VALUES(?,?,?,?,?,?)",
                        params![id, coach.id, pupil.id, rating, comment, start + minutes * MINUTE_MS + HOUR_MS],
                    )?;
                }
                conversation.get_or_insert(start - 5 * DAY_MS);
            }
            // Upcoming sessions on the coach's free slots; the third pupil cancelled one.
            for k in 0..(if pupil.id == dev.id { 2 } else { rng.gen_range(0..=1) }) {
                let Some((start, end)) = upcoming.pop() else { break };
                let cancelled = n == 2 && k == 0;
                let id = booking(tx, coach, pupil, start, end, price, if cancelled { "cancelled" } else { "booked" }, at - rng.gen_range(1..6) * DAY_MS)?;
                if cancelled {
                    tx.execute("UPDATE coach_bookings SET cancelled_at=?,cancelled_by=? WHERE id=?", params![at - HOUR_MS, pupil.id, id])?;
                }
            }
            if let Some(since) = conversation {
                chat(tx, rng, coach, pupil, since, at)?;
            }
        }
    }
    Ok(())
}
#[allow(clippy::too_many_arguments)]
fn booking(tx: &Transaction, coach: &Player, student: &Player, start: i64, end: i64, price: i64, status: &str, created: i64) -> Result<String> {
    let id = uuid::Uuid::new_v4().to_string();
    let notes = ["", "I'd like to work on my cross.", "Can we look at my OLL recognition?", "Preparing my first competition!"];
    tx.execute(
        "INSERT INTO coach_bookings(id,coach_id,student_id,starts_at,ends_at,status,note,price_cents,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        params![id, coach.id, student.id, start, end, status, notes[(start / HOUR_MS % 4) as usize], price, created],
    )?;
    Ok(id)
}
/// A conversation between a coach and a student, the last messages unread by their recipient.
fn chat(tx: &Transaction, rng: &mut StdRng, coach: &Player, student: &Player, since: i64, at: i64) -> Result<()> {
    const LINES: &[(bool, &str)] = &[
        (false, "Hi! I just booked a session, looking forward to it."),
        (true, "Hi, welcome! Could you send me a video of a few solves before we start?"),
        (false, "Sure, I'll record an ao5 tonight."),
        (true, "Thanks. Your cross is good, but you pause a lot before the first pair."),
        (false, "Yes, I never know which pair to start with."),
        (true, "We'll work on that: plan the cross and the first pair during inspection."),
        (false, "Great session today, thank you!"),
        (true, "You're welcome. Do the inspection drill 15 minutes a day and tell me how it goes."),
        (false, "Done for a week, my average went down by a second!"),
        (true, "Excellent! Next time we'll look at your last layer."),
    ];
    tx.execute(
        "INSERT INTO coach_conversations(coach_id,student_id,note,updated_at) VALUES(?,?,?,?)",
        params![coach.id, student.id, "Good cross, slow first pair. Working on inspection planning.", at],
    )?;
    let conversation = tx.last_insert_rowid();
    let count = rng.gen_range(3..=LINES.len());
    let step = (at - since) / (count as i64 + 1);
    for (k, (from_coach, body)) in LINES.iter().take(count).enumerate() {
        let sent = since + step * (k as i64 + 1);
        let read = (k + 2 < count).then_some(sent + 10 * MINUTE_MS);
        tx.execute(
            "INSERT INTO coach_messages(conversation_id,sender_id,body,created_at,read_at) VALUES(?,?,?,?,?)",
            params![conversation, if *from_coach { &coach.id } else { &student.id }, body, sent, read],
        )?;
    }
    Ok(())
}

/// Finished duels over the last two months, for the administration.
fn duels(tx: &Transaction, rng: &mut StdRng, players: &[Player], at: i64) -> Result<()> {
    for game in 0..400 {
        let pair: Vec<&Player> = if game % 4 == 0 {
            vec![&players[0], players[1..].choose(rng).unwrap()]
        } else {
            players.choose_multiple(rng, 2).collect()
        };
        let e = event(["333", "333", "333", "222", "pyram", "skewb", "333oh", "444"][rng.gen_range(0..8)]);
        let mut seats = Vec::new();
        for p in &pair {
            let results: Vec<(f64, &str)> = (0..5).map(|_| (time(rng, e.typical * p.skill), penalty(rng, e.dnf))).collect();
            let ao5 = stats::average(&results.iter().map(|&(ms, pen)| stats::effective_ms(ms, pen)).collect::<Vec<_>>());
            seats.push((json!(results.iter().map(|&(ms, pen)| json!({"ms": ms, "penalty": pen})).collect::<Vec<_>>()), ao5));
        }
        let winner = match (seats[0].1, seats[1].1) {
            (Some(a), Some(b)) => Some(if a <= b { 0 } else { 1 }),
            (Some(_), None) => Some(0),
            (None, Some(_)) => Some(1),
            _ => None,
        };
        tx.execute(
            "INSERT INTO duel_games(race,game,event,ended_at,player1_id,player1_name,player1_ao5,player2_id,player2_name,player2_ao5,winner,results) VALUES(?,1,?,?,?,?,?,?,?,?,?,?)",
            params![
                uuid::Uuid::new_v4().to_string(),
                e.id,
                at - rng.gen_range(0..60 * DAY_MS),
                pair[0].id,
                pair[0].name,
                seats[0].1,
                pair[1].id,
                pair[1].name,
                seats[1].1,
                winner,
                json!([seats[0].0, seats[1].0]).to_string()
            ],
        )?;
    }
    Ok(())
}

/// A month of daily traffic and activity, and the last day of requests, for the administration.
fn traffic(tx: &Transaction, rng: &mut StdRng, players: &[Player], at: i64) -> Result<()> {
    let ips: Vec<String> = (0..40).map(|i| format!("203.0.113.{}", 10 + i)).collect();
    for back in 0..30 {
        let day = jiff::Timestamp::from_millisecond(at - back * DAY_MS).map_err(ApiError::internal)?.strftime("%Y-%m-%d").to_string();
        let start = (at - back * DAY_MS) / DAY_MS * DAY_MS;
        for (i, p) in players.iter().enumerate() {
            if !rng.gen_bool(p.practice.max(0.15)) {
                continue;
            }
            let requests = rng.gen_range(5..400);
            let ip = &ips[i % ips.len()];
            tx.execute("INSERT INTO user_activity(user_id,day,requests) VALUES(?,?,?)", params![p.id, day, requests])?;
            tx.execute(
                "INSERT INTO traffic_daily(day,ip,requests,errors,server_errors,limited,first_at,last_at) VALUES(?,?,?,?,0,0,?,?)
                 ON CONFLICT(day,ip) DO UPDATE SET requests=requests+excluded.requests",
                params![day, ip, requests, rng.gen_range(0..requests / 20 + 1), start + 8 * HOUR_MS, start + 22 * HOUR_MS],
            )?;
            tx.execute("INSERT OR IGNORE INTO traffic_daily_users(day,ip,user_id) VALUES(?,?,?)", params![day, ip, p.id])?;
        }
    }
    let paths = [("GET", "/api/sync", 200, "api"), ("POST", "/api/sync", 200, "api"), ("GET", "/timer", 200, "page"), ("GET", "/api/coaching/coaches", 200, "api"), ("POST", "/api/auth/login", 401, "api"), ("GET", "/assets/app.js", 200, "asset"), ("GET", "/api/cases", 200, "api"), ("GET", "/api/nope", 404, "api")];
    for _ in 0..1500 {
        let (method, path, status, kind) = paths[rng.gen_range(0..paths.len())];
        let p = players.choose(rng).unwrap();
        tx.execute(
            "INSERT INTO request_log(at,ip,method,path,status,duration_ms,user_id,user_agent,kind,important) VALUES(?,?,?,?,?,?,?,?,?,?)",
            params![at - rng.gen_range(0..DAY_MS), ips.choose(rng).unwrap(), method, path, status, rng.gen_range(0.2..40.0), (kind == "api" && status == 200).then_some(&p.id), "Mozilla/5.0 (X11; Linux x86_64) Cubix-dev", kind, (status == 401) as i64],
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn seeds_an_empty_database_once() {
        let dir = std::env::temp_dir().join(format!("cubix-seed-{}", uuid::Uuid::new_v4()));
        let path = dir.join("cubix.db");
        drop(crate::db::Db::open(&path).unwrap());
        let mut db = Connection::open(&path).unwrap();
        let catalog = Catalog::load();
        let summary = run(&mut db, &catalog).unwrap().expect("seeded");
        assert!(summary.users > 40 && summary.solves > 10_000);
        assert!(run(&mut db, &catalog).unwrap().is_none());
        // Every seeded row reaches the change feed the clients pull.
        let feed = all(&db, "SELECT count(*) n FROM sync_changes WHERE kind='solves'", []).unwrap()[0]["n"].as_i64().unwrap();
        assert_eq!(feed, summary.solves);
        let _ = std::fs::remove_dir_all(dir);
    }
}
