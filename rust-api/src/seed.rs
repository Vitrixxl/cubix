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
    smart_solves(&tx, &mut rng, catalog, players.iter().find(|p| p.name == "dev").expect("dev account"))?;
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
    "ines_bld", "jules_lookahead", "kenji_cfop", "lea_skewb", "malo_megaminx", "nora_pyra", "oscar_ao5",
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
    ("sofia_sq1", 0.55, &["sq1"], &["Spanish", "English"], 0, "Free Square-1 lessons for beginners"),
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
                    ["2gen-ru", "f2l", "last-layer", "xcross-6"][rng.gen_range(0..4)]
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

/// A turn undone: R for R', R' for R, R2 for R2.
fn inverse(turn: &str) -> String {
    match turn.as_bytes() {
        [f, b'\''] => (*f as char).to_string(),
        [f] => format!("{}'", *f as char),
        [f, b'2', ..] => format!("{}2", *f as char),
        _ => unreachable!("face turn"),
    }
}
/// The face-turn setups of a catalogue case (from the solved cube), tokens normalised.
fn setups(case: &Value) -> Vec<Vec<String>> {
    std::iter::once(&case["setup"])
        .chain(case["setups_alt"].as_array().into_iter().flatten())
        .filter_map(Value::as_str)
        .map(|alg| alg.split_whitespace().map(|t| t.replace("2'", "2")).collect::<Vec<_>>())
        .filter(|turns| turns.iter().all(|t| matches!(t.as_bytes(), [b'U' | b'D' | b'F' | b'B' | b'R' | b'L'] | [b'U' | b'D' | b'F' | b'B' | b'R' | b'L', b'\'' | b'2'])))
        .collect()
}

/// The 3×3 timer solves of the last weeks turned on a smart cube, for the analysis: each one a cross,
/// four F2L pairs, an OLL and a PLL from the catalogue, timed with a pause to recognise each step.
/// The solution is built first and the scramble is its inverse, so no solver is needed.
fn smart_solves(tx: &Transaction, rng: &mut StdRng, catalog: &Catalog, p: &Player) -> Result<()> {
    let pick = |set: &str| -> Vec<Vec<Vec<String>>> {
        catalog.cases.as_array().unwrap().iter().filter(|c| c["set"] == set).map(setups).filter(|s| !s.is_empty()).collect()
    };
    let (f2l, oll, pll) = (pick("f2l"), pick("oll"), pick("pll"));
    let ids: Vec<i64> = all(tx, "SELECT id FROM solves WHERE user_id=? AND puzzle_id='333' AND solve_mode='standard' AND scramble_type='normal' AND case_id IS NULL ORDER BY created_at DESC LIMIT 150", [&p.id])?
        .iter()
        .filter_map(|r| r["id"].as_i64())
        .collect();
    for id in ids {
        // The steps as the solver holds the cube (yellow on top, the cross below); undone, each F2L,
        // OLL and PLL case keeps the cross and the other pairs, so each step solves exactly its part.
        let mut steps: Vec<Vec<String>> = Vec::new();
        let mut cross: Vec<String> = Vec::new();
        while cross.len() < rng.gen_range(6..9) {
            let face = ["U", "D", "F", "B", "R", "L"][rng.gen_range(0..6)];
            if cross.last().is_none_or(|t| !t.starts_with(face)) {
                cross.push(format!("{face}{}", ["", "'", "2"][rng.gen_range(0..3)]));
            }
        }
        steps.push(cross);
        let mut slots = [0, 1, 2, 3];
        slots.shuffle(rng);
        for slot in slots {
            // The front-right pair's setup turned to another slot: R→F→L→B→R once per slot.
            let setup = f2l.choose(rng).unwrap().choose(rng).unwrap();
            let turned = setup.iter().map(|t| {
                let mut face = t[..1].to_owned();
                for _ in 0..slot {
                    face = match face.as_str() { "R" => "F", "F" => "L", "L" => "B", "B" => "R", f => f }.to_owned();
                }
                face + &t[1..]
            });
            steps.push(turned.rev().map(|t| inverse(&t)).collect());
        }
        for set in [&oll, &pll] {
            steps.push(set.choose(rng).unwrap().choose(rng).unwrap().iter().rev().map(|t| inverse(t)).collect());
        }
        // Recognition then execution, at a pace close to the player's.
        let mut clock = 0.;
        let mut turns: Vec<(String, i64)> = Vec::new();
        for (i, step) in steps.iter().enumerate() {
            clock += if i == 0 { 0. } else { time(rng, if i < 5 { 450. } else { 700. }) };
            for turn in step {
                // Recorded held white on top and green in front: up and down, right and left swap.
                let face = match &turn[..1] { "U" => "D", "D" => "U", "R" => "L", "L" => "R", f => f };
                turns.push((format!("{face}{}", &turn[1..]), clock as i64));
                clock += time(rng, 140.);
            }
        }
        let solution = turns.iter().map(|(t, at)| format!("{t}@{at}")).collect::<Vec<_>>().join(" ");
        let scramble = turns.iter().rev().map(|(t, _)| inverse(t)).collect::<Vec<_>>().join(" ");
        tx.execute("UPDATE solves SET scramble=?, solution=?, time_ms=?, penalty='none' WHERE id=?", params![scramble, solution, clock as i64, id])?;
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

/// The community of the development accounts: friends, conversations, two groups, battles and tournaments. Some
/// tournaments start a few minutes after the server, so their brackets can be played. Seeds a database whose accounts
/// are seeded and whose community is empty, so an existing development database gets it too. Returns whether it did.
pub fn social(db: &mut Connection) -> Result<bool> {
    let groups = all(db, "SELECT count(*) n FROM social_groups", [])?[0]["n"].as_i64().unwrap_or(0);
    let ids: std::collections::HashMap<String, String> = all(db, "SELECT id,username FROM users WHERE password_hash IS NOT NULL", [])?
        .into_iter()
        .filter_map(|r| Some((r["username"].as_str()?.to_owned(), r["id"].as_str()?.to_owned())))
        .collect();
    if groups > 0 || !ids.contains_key("dev") {
        return Ok(false);
    }
    let id = |name: &str| ids.get(name).cloned().unwrap_or_default();
    let at = now();
    let tx = db.transaction()?;
    let friend = |a: &str, b: &str, accepted: bool, days: i64| {
        tx.execute(
            "INSERT INTO friends(user_id,friend_id,status,created_at,accepted_at) VALUES(?,?,?,?,?)",
            params![id(a), id(b), if accepted { "accepted" } else { "pending" }, at - days * DAY_MS, accepted.then_some(at - days * DAY_MS + HOUR_MS)],
        )
    };
    for (other, days) in [("lena_speed", 40), ("alex_cubes", 25), ("coach", 60), ("kenji_cfop", 9)] {
        friend("dev", other, true, days)?;
    }
    friend("ben_tps", "dev", false, 1)?;
    friend("dev", "chloe_f2l", false, 2)?;
    // A conversation between friends.
    let (a, b) = if id("dev") < id("lena_speed") { (id("dev"), id("lena_speed")) } else { (id("lena_speed"), id("dev")) };
    tx.execute("INSERT INTO social_conversations(user_a,user_b,updated_at) VALUES(?,?,?)", params![a, b, at - HOUR_MS])?;
    let direct = tx.last_insert_rowid();
    let say = |conversation: i64, who: &str, body: &str, ago: i64| {
        tx.execute("INSERT INTO social_messages(conversation_id,sender_id,body,created_at) VALUES(?,?,?,?)", params![conversation, id(who), body, at - ago])
    };
    // Two groups: the dev account runs the first, and is invited to the second.
    let group = |name: &str, description: &str, owner: &str, members: &[(&str, &str)]| -> Result<(i64, i64)> {
        tx.execute("INSERT INTO social_groups(name,description,owner_id,created_at) VALUES(?,?,?,?)", params![name, description, id(owner), at - 30 * DAY_MS])?;
        let g = tx.last_insert_rowid();
        tx.execute("INSERT INTO group_members(group_id,user_id,role,joined_at) VALUES(?,?,'owner',?)", params![g, id(owner), at - 30 * DAY_MS])?;
        for (k, (member, role)) in members.iter().enumerate() {
            tx.execute(
                "INSERT INTO group_members(group_id,user_id,role,invited_by,joined_at) VALUES(?,?,?,?,?)",
                params![g, id(member), role, id(owner), at - (20 - k as i64) * DAY_MS],
            )?;
        }
        tx.execute("INSERT INTO social_conversations(group_id,updated_at) VALUES(?,?)", params![g, at - 30 * MINUTE_MS])?;
        Ok((g, tx.last_insert_rowid()))
    };
    let club_members = [("lena_speed", "admin"), ("alex_cubes", "member"), ("coach", "member"), ("ben_tps", "member"), ("chloe_f2l", "member"), ("hugo_sub10", "member"), ("kenji_cfop", "member"), ("emma_pll", "invited")];
    let (club, club_chat) = group("Cubix Club", "Weekly races and a cup every month. Be nice, turn fast.", "dev", &club_members)?;
    group("Big cubes", "4×4 and up, reduction and Yau.", "lena_speed", &[("quentin_4x4", "member"), ("dev", "invited")])?;
    // A card in a conversation: a battle (`m`) or a tournament (`t`) as its message.
    let card = |conversation: i64, who: &str, m: Option<i64>, t: Option<i64>, ago: i64| {
        tx.execute(
            "INSERT INTO social_messages(conversation_id,sender_id,body,created_at,match_id,tournament_id) VALUES(?,?,'',?,?,?)",
            params![conversation, id(who), at - ago, m, t],
        )
    };
    // Tournaments: the group's and the administration's; the "sprint" ones start a few minutes from now.
    let tournament = |name: &str, event: &str, group: Option<i64>, by: Option<String>, starts: i64, points: i64, sets: i64, cap: i64, players: &[&str]| -> Result<i64> {
        tx.execute(
            "INSERT INTO tournaments(name,description,event,group_id,created_by,starts_at,points,sets,max_players,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
            params![name, "", event, group, by, starts, points, sets, cap, at - 3 * DAY_MS],
        )?;
        let t = tx.last_insert_rowid();
        for (k, player) in players.iter().enumerate() {
            tx.execute("INSERT INTO tournament_players(tournament_id,user_id,registered_at) VALUES(?,?,?)", params![t, id(player), at - DAY_MS + k as i64 * MINUTE_MS])?;
        }
        Ok(t)
    };
    let club_players = ["dev", "lena_speed", "alex_cubes", "coach", "ben_tps", "chloe_f2l", "hugo_sub10"];
    let cup = tournament("Club cup", "333", Some(club), Some(id("dev")), at + 2 * DAY_MS, 3, 2, 16, &club_players)?;
    let sprint = tournament("Friday sprint", "222", Some(club), Some(id("lena_speed")), at + 3 * MINUTE_MS, 2, 1, 8, &["dev", "lena_speed", "alex_cubes", "kenji_cfop", "hugo_sub10"])?;
    let open = ["lena_speed", "alex_cubes", "kenji_cfop", "emma_pll", "felix_roux", "gaia_zz", "ines_bld", "tess_cll", "vera_zbll"];
    // Full: the dev account sees it closed to newcomers.
    tournament("Qbix Autumn Open", "333", None, None, at + 3 * DAY_MS, 3, 2, open.len() as i64, &open)?;
    tournament("Weekly 2×2 sprint", "222", None, None, at + 5 * MINUTE_MS, 2, 1, 32, &["dev", "alex_cubes", "kenji_cfop"])?;
    // Battles waiting in the club: one open to all, one aimed at the dev account.
    let mut battles = vec![];
    for (from, to, event) in [("alex_cubes", None, "222"), ("lena_speed", Some("dev"), "333")] {
        tx.execute(
            "INSERT INTO matches(group_id,event,points,sets,player_a,player_b,status,created_by,created_at) VALUES(?,?,3,2,?,?,'waiting',?,?)",
            params![club, event, id(from), to.map(id), id(from), at - 20 * MINUTE_MS],
        )?;
        battles.push((from, tx.last_insert_rowid()));
    }
    // The club's conversation, in order, its cards among the words.
    say(club_chat, "dev", "Welcome everyone! The Club cup opens on Saturday.", 26 * HOUR_MS)?;
    card(club_chat, "dev", None, Some(cup), 26 * HOUR_MS - MINUTE_MS)?;
    say(club_chat, "alex_cubes", "Can we do 2×2 battles in between?", 25 * HOUR_MS)?;
    say(club_chat, "lena_speed", "Sure, launch one from the swords at the top of the chat.", 24 * HOUR_MS)?;
    card(club_chat, "lena_speed", None, Some(sprint), 45 * MINUTE_MS)?;
    say(club_chat, "hugo_sub10", "Friday sprint starts in a few minutes, register!", 40 * MINUTE_MS)?;
    for (from, battle) in battles {
        card(club_chat, from, Some(battle), None, 20 * MINUTE_MS)?;
    }
    // Between friends: words, then a battle raced and won, solve by solve.
    say(direct, "lena_speed", "Your Ao12 went down a lot this week!", 3 * HOUR_MS)?;
    say(direct, "dev", "Thanks, the F2L drills helped. Club cup this weekend?", 2 * HOUR_MS + 30 * MINUTE_MS)?;
    say(direct, "lena_speed", "Already registered. Quick warm-up battle?", 2 * HOUR_MS + 20 * MINUTE_MS)?;
    tx.execute(
        "INSERT INTO matches(event,points,sets,player_a,player_b,status,winner,created_by,created_at,started_at,finished_at) VALUES('333',3,1,?,?,'done',?,?,?,?,?)",
        params![id("lena_speed"), id("dev"), id("dev"), id("lena_speed"), at - 2 * HOUR_MS - 15 * MINUTE_MS, at - 2 * HOUR_MS - 10 * MINUTE_MS, at - 2 * HOUR_MS],
    )?;
    let warm_up = tx.last_insert_rowid();
    let race = [
        ("R2 U' F2 D' L2 U R2 B2 U' F2 R' B' L' D2 F U' L2 B' R D'", 9_870, "none", 10_420, "none"),
        ("F' L2 D R2 U' B2 D' L2 F2 U2 R2 B U' L' F' R D' F' U2 L'", 11_350, "none", 10_930, "none"),
        ("U2 L' B2 R' D2 L F2 D2 R' U2 B' U L2 F' D B R' U' F2 U'", 10_010, "+2", 10_880, "none"),
        ("B2 D' R2 F2 U L2 D B2 R2 U2 F' L' B' U R' F2 D L' B U2", 9_640, "none", 11_200, "none"),
        ("L2 F' U2 R2 D' B2 U L2 D2 F2 R' D' B L U' F R2 U B' L", 10_120, "none", 10_760, "none"),
    ];
    for (n, (scramble, dev_ms, dev_penalty, lena_ms, lena_penalty)) in race.iter().enumerate() {
        tx.execute(
            "INSERT INTO match_solves(match_id,number,scramble,a_ms,a_penalty,b_ms,b_penalty) VALUES(?,?,?,?,?,?,?)",
            params![warm_up, n as i64 + 1, scramble, lena_ms, lena_penalty, dev_ms, dev_penalty],
        )?;
    }
    card(direct, "lena_speed", Some(warm_up), None, 2 * HOUR_MS + 15 * MINUTE_MS)?;
    say(direct, "lena_speed", "GG, that last one was fast 😄 See you in the bracket.", HOUR_MS)?;
    tx.commit()?;
    Ok(true)
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
