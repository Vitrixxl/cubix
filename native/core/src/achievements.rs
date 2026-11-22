//! The awards (src/client/lib/achievements.ts): goals of speed, average, volume, knowledge and dedication computed
//! from the solves and the learned cases, each worth experience; the levels the experience reaches.
use crate::catalog::catalog;
use crate::i18n::tf;
use crate::store::{Solve, Store};
use crate::time::{fmt_time, rolling};

#[derive(Clone, Debug)]
pub struct Award {
    pub id: String,
    pub title: String,
    pub description: String,
    /// knowledge, speed, average, volume, dedication.
    pub category: &'static str,
    /// The puzzle's label, or "General".
    pub group: String,
    pub progress: f64,
    pub target: f64,
    pub ratio: f64,
    pub detail: String,
    pub unlocked: bool,
    pub unlocked_at: Option<i64>,
    pub xp: u32,
    /// What the badge reads: 10, 1:00, 1k, OLL.
    pub badge: String,
}

fn goals(puzzle: &str) -> &'static [u32] {
    match puzzle {
        "222" => &[15, 10, 7, 5, 3],
        "333" => &[60, 45, 30, 25, 20, 15, 12, 10],
        "444" => &[180, 120, 90, 60, 45],
        "555" => &[300, 180, 120, 90],
        "666" => &[480, 300, 240, 180],
        "777" => &[600, 420, 300, 240],
        "sq1" => &[60, 30, 20, 15, 10],
        "pyram" | "skewb" => &[20, 10, 6, 4],
        "minx" => &[300, 180, 120, 90, 60],
        "clock" => &[20, 12, 8, 6],
        _ => &[],
    }
}

fn seconds(n: u32) -> String { if n >= 60 && n % 60 == 0 { format!("{}:00", n / 60) } else { n.to_string() } }
fn short_count(n: u32) -> String { if n >= 1000 { format!("{}k", n / 1000) } else { n.to_string() } }

struct Point {
    at: i64,
    value: Option<f64>,
}

#[allow(clippy::too_many_arguments)]
fn time_goal(id: String, title: String, description: String, category: &'static str, group: &str, goal: u32, series: &[Point]) -> Award {
    let target = goal as f64 * 1000.0;
    let mut best: Option<f64> = None;
    let mut at = None;
    for p in series {
        let Some(v) = p.value else { continue };
        if best.is_none_or(|b| v < b) { best = Some(v) }
        if at.is_none() && v < target { at = Some(p.at) }
    }
    let unlocked = at.is_some();
    let ratio = match best {
        None => 0.0,
        Some(_) if unlocked => 1.0,
        Some(b) => (target / b).clamp(0.0, 1.0),
    };
    let detail = match best {
        None => tf("No solve yet · goal {0}", &[&fmt_time(Some(target))]),
        Some(b) => tf("Best {0} · goal {1}", &[&fmt_time(Some(b)), &fmt_time(Some(target))]),
    };
    Award { id, title, description, category, group: group.into(), progress: best.unwrap_or(0.0), target, ratio, detail, unlocked, unlocked_at: at, xp: 0, badge: seconds(goal) }
}

#[allow(clippy::too_many_arguments)]
fn counter(id: String, title: String, description: String, category: &'static str, group: &str, unit: &str, goal: u32, points: &[i64]) -> Award {
    let progress = points.len().min(goal as usize) as f64;
    let at = points.get(goal as usize - 1).copied();
    Award { id, title, description, category, group: group.into(), progress, target: goal as f64, ratio: progress / goal as f64, detail: format!("{} / {} {}", points.len(), goal, crate::i18n::t(unit)), unlocked: at.is_some(), unlocked_at: at, xp: 0, badge: short_count(goal) }
}

fn set_short(label: &str) -> String {
    if let Some(rest) = label.strip_prefix("2-Look ") { return format!("2-{}", rest.split_whitespace().next().unwrap_or("")) }
    if label.len() <= 6 { return label.into() }
    label.split_whitespace().find(|w| w.len() >= 2 && w.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())).map(String::from).unwrap_or_else(|| label.split_whitespace().filter_map(|w| w.chars().next()).map(|c| c.to_ascii_uppercase()).collect())
}

pub struct Summary {
    pub awards: Vec<Award>,
    pub unlocked: usize,
    pub xp: u32,
}

/// Every award with its progress.
pub fn compute(store: &Store) -> Summary {
    let solves: &[Solve] = &store.solves;
    let mut out: Vec<Award> = vec![];
    let full = |s: &Solve| s.case_id.is_none() && s.scramble_type == "normal";
    for p in crate::puzzles::puzzles().iter().filter(|p| p.relay.is_empty()) {
        let group = crate::i18n::t(&p.label);
        let own: Vec<&Solve> = solves.iter().filter(|s| s.puzzle_id == p.id).collect();
        let series = |mode: &str| -> Vec<Point> { own.iter().filter(|s| full(s) && s.solve_mode == mode).map(|s| Point { at: s.at(), value: s.value() }).collect() };
        let standard = series("standard");
        for &g in goals(&p.id) {
            out.push(time_goal(format!("{}:single:{g}", p.id), tf("Sub-{0}", &[&seconds(g)]), tf("Solve {0} in under {1} seconds on a full scramble.", &[&group, &seconds(g)]), "speed", &group, g, &standard));
        }
        let ao5 = rolling(&standard.iter().map(|x| x.value).collect::<Vec<_>>(), 5);
        let averages: Vec<Point> = standard.iter().zip(ao5).map(|(x, a)| Point { at: x.at, value: a }).collect();
        let g = goals(&p.id);
        for &goal in &g[..g.len().saturating_sub(1)] {
            out.push(time_goal(format!("{}:ao5:{goal}", p.id), tf("Sub-{0} average", &[&seconds(goal)]), tf("Average of 5 under {0} seconds on {1}.", &[&seconds(goal), &group]), "average", &group, goal, &averages));
        }
        if p.id == "333" {
            let oh = series("one-handed");
            for g in [90, 60, 45, 30, 20] {
                out.push(time_goal(format!("333:oh:{g}"), tf("Sub-{0} one-handed", &[&seconds(g)]), tf("Solve 3×3 one-handed in under {0} seconds.", &[&seconds(g)]), "speed", &group, g, &oh));
            }
            let blind = series("blindfolded");
            let ok: Vec<i64> = blind.iter().filter(|x| x.value.is_some()).map(|x| x.at).collect();
            let mut first = counter("333:bld:first".into(), crate::i18n::t("Blindfolded success"), crate::i18n::t("Complete a 3×3 blindfolded solve without a DNF."), "speed", &group, "solve", 1, &ok);
            first.badge = "1".into();
            out.push(first);
            for g in [300, 180, 120, 60] {
                out.push(time_goal(format!("333:bld:{g}"), tf("Sub-{0} blindfolded", &[&seconds(g)]), tf("Solve 3×3 blindfolded, memorisation included, in under {0} seconds.", &[&seconds(g)]), "speed", &group, g, &blind));
            }
        }
        let timed: Vec<i64> = own.iter().filter(|s| s.case_id.is_none()).map(|s| s.at()).collect();
        for g in [1, 10, 100, 1000] {
            let (title, desc) = if g == 1 { (crate::i18n::t("First solve"), tf("Record a first {0} time.", &[&group])) } else { (tf("{0} solves", &[&g]), tf("Record {0} {1} times.", &[&g, &group])) };
            out.push(counter(format!("{}:solves:{g}", p.id), title, desc, "volume", &group, "solves", g, &timed));
        }
        for set in catalog().sets_of(&p.id) {
            let id = &set.id;
            if id.len() > 4 && id.as_bytes()[1] == b'x' && ["f2l", "oll", "pll", "2look"].iter().any(|k| id[4..].starts_with(k)) { continue }
            let ids: Vec<&str> = catalog().cases_of_set(id).map(|c| c.id.as_str()).collect();
            let known = ids.iter().filter(|c| store.is_learned(c)).count();
            out.push(Award {
                id: format!("learn:{id}"),
                title: tf("{0} master", &[&set.label]),
                description: tf("Mark every {0} case of {1} as learned.", &[&set.label, &group]),
                category: "knowledge",
                group: group.clone(),
                progress: known as f64,
                target: ids.len() as f64,
                ratio: if ids.is_empty() { 0.0 } else { known as f64 / ids.len() as f64 },
                detail: tf("{0} / {1} cases", &[&known, &ids.len()]),
                unlocked: !ids.is_empty() && known == ids.len(),
                unlocked_at: None,
                xp: 0,
                badge: set_short(&set.label),
            });
        }
    }
    let general = crate::i18n::t("General");
    let learned = store.learned.len();
    for g in [1u32, 10, 50, 100] {
        let (title, desc) = if g == 1 { (crate::i18n::t("First algorithm"), crate::i18n::t("Mark a first case as learned.")) } else { (tf("{0} algorithms", &[&g]), tf("Mark {0} cases as learned across all puzzles.", &[&g])) };
        out.push(Award { id: format!("learn:total:{g}"), title, description: desc, category: "knowledge", group: general.clone(), progress: learned.min(g as usize) as f64, target: g as f64, ratio: (learned as f64 / g as f64).min(1.0), detail: tf("{0} / {1} cases", &[&learned, &g]), unlocked: learned >= g as usize, unlocked_at: None, xp: 0, badge: g.to_string() });
    }
    let all: Vec<i64> = solves.iter().map(Solve::at).collect();
    for g in [100, 1000, 10000] {
        out.push(counter(format!("total:{g}"), tf("{0} times", &[&g]), tf("Record {0} times across every puzzle and mode.", &[&g]), "volume", &general, "times", g, &all));
    }
    let drills: Vec<i64> = solves.iter().filter(|s| s.case_id.is_some()).map(Solve::at).collect();
    for g in [10, 100, 1000, 5000] {
        out.push(counter(format!("training:{g}"), tf("{0} drills", &[&g]), tf("Complete {0} algorithm training attempts.", &[&g]), "volume", &general, "drills", g, &drills));
    }
    let mut days: Vec<(i64, i64)> = vec![];
    for s in solves {
        let d = crate::date::day(s.at());
        if days.last().is_none_or(|l| l.0 != d) && !days.iter().any(|x| x.0 == d) { days.push((d, s.at())) }
    }
    days.sort();
    let day_points: Vec<i64> = days.iter().map(|d| d.1).collect();
    for g in [7, 30, 100, 365] {
        out.push(counter(format!("days:{g}"), tf("{0} active days", &[&g]), tf("Practise on {0} different days.", &[&g]), "dedication", &general, "days", g, &day_points));
    }
    let (mut longest, mut run, mut previous) = (0u32, 0u32, None::<i64>);
    let mut reached: [Option<i64>; 3] = [None; 3];
    for &(d, at) in &days {
        run = if previous == Some(d - 1) { run + 1 } else { 1 };
        previous = Some(d);
        longest = longest.max(run);
        for (i, g) in [3, 7, 30].iter().enumerate() {
            if run >= *g && reached[i].is_none() { reached[i] = Some(at) }
        }
    }
    for (i, g) in [3u32, 7, 30].iter().enumerate() {
        out.push(Award { id: format!("streak:{g}"), title: tf("{0}-day streak", &[g]), description: tf("Practise {0} days in a row.", &[g]), category: "dedication", group: general.clone(), progress: longest.min(*g) as f64, target: *g as f64, ratio: (longest as f64 / *g as f64).min(1.0), detail: tf("{0} / {1} days", &[&longest, g]), unlocked: longest >= *g, unlocked_at: reached[i], xp: 0, badge: g.to_string() });
    }
    // Each step of a series is worth more than the one before; a set is worth its cases.
    let mut steps: std::collections::HashMap<String, u32> = Default::default();
    for a in &mut out {
        let series = if a.id.starts_with("learn:") && !a.id.starts_with("learn:total") { format!("learn:{}", a.group) } else { a.id[..a.id.rfind(':').unwrap_or(0)].to_string() };
        let step = steps.entry(series).or_insert(0);
        *step += 1;
        a.xp = if a.id.starts_with("learn:") && !a.id.starts_with("learn:total") { (a.target as u32).max(25) } else { 25 * *step };
    }
    let unlocked = out.iter().filter(|a| a.unlocked).count();
    let xp = out.iter().filter(|a| a.unlocked).map(|a| a.xp).sum();
    Summary { awards: out, unlocked, xp }
}

/// The level an amount of XP reaches: (level, XP into it, XP the level spans).
pub fn level(xp: u32) -> (u32, u32, u32) {
    let mut n = 1;
    while 50 * n * (n + 1) <= xp {
        n += 1;
    }
    (n, xp - 50 * n * (n - 1), 100 * n)
}

/// The current run of days practised in a row (today or yesterday counts as current), and the longest.
pub fn streak(store: &Store) -> (u32, u32) {
    let mut days: Vec<i64> = store.solves.iter().map(|s| crate::date::day(s.at())).collect();
    days.sort();
    days.dedup();
    let (mut longest, mut run) = (0u32, 0u32);
    for (i, d) in days.iter().enumerate() {
        run = if i > 0 && days[i - 1] == d - 1 { run + 1 } else { 1 };
        longest = longest.max(run);
    }
    let today = crate::date::today();
    let current = if days.last().is_some_and(|l| *l >= today - 1) { run } else { 0 };
    (current, longest)
}

#[cfg(test)]
mod tests {
    #[test]
    fn levels_and_awards() {
        assert_eq!(super::level(0), (1, 0, 100));
        assert_eq!(super::level(100), (2, 0, 200));
        assert_eq!(super::level(250), (2, 150, 200));
        let store = crate::store::Store::memory();
        let s = super::compute(&store);
        assert!(s.awards.len() > 100);
        assert_eq!(s.unlocked, 0);
    }
}
