//! The training's figures (src/client/lib/trainingPicks.ts): each case's attempts, its pace, when it is due again
//! (spaced repetition), and the learned cases slower than their set's usual.
use crate::store::Store;
use crate::time::{best, last_average, mean};
use std::collections::HashMap;

#[derive(Clone, Debug, Default)]
pub struct CaseStats {
    pub count: usize,
    pub best: Option<f64>,
    pub mean: Option<f64>,
    pub ao5: Option<f64>,
    pub ao12: Option<f64>,
    pub last: Option<f64>,
    pub last_at: Option<i64>,
    /// When it is due for review (ms since 1970).
    pub due: i64,
}

/// Days until a case done well when due comes back, box after box.
const REVIEW_DAYS: [i64; 7] = [1, 3, 7, 14, 30, 60, 120];
const PACE: usize = 12;

/// When a case is due again, replayed from its attempts in order (None: a DNF). Done well when due (no DNF, at most a
/// fifth slower than its pace), it moves up a box; done badly, back to the first, due at once. Never trained: due.
pub fn due(attempts: &[(Option<f64>, i64)]) -> i64 {
    let mut box_ = 0usize;
    let mut due = i64::MIN;
    let mut recent: Vec<f64> = vec![];
    for &(time, at) in attempts {
        let pace = if recent.is_empty() { f64::INFINITY } else { recent.iter().sum::<f64>() / recent.len() as f64 };
        if at >= due {
            match time {
                Some(t) if t <= pace * 1.2 => {
                    let day = crate::date::day(at);
                    let start = day_start(day + REVIEW_DAYS[box_.min(REVIEW_DAYS.len() - 1)]);
                    box_ += 1;
                    due = start;
                }
                _ => {
                    box_ = 0;
                    due = at;
                }
            }
        }
        if let Some(t) = time {
            recent.push(t);
            if recent.len() > PACE { recent.remove(0); }
        }
    }
    if due == i64::MIN { 0 } else { due }
}

/// The local midnight starting a day (days since the common era, as `date::day`).
fn day_start(day: i64) -> i64 {
    use chrono::{Local, NaiveDate, TimeZone};
    let d = NaiveDate::from_num_days_from_ce_opt(day as i32).unwrap_or_default();
    Local.from_local_datetime(&d.and_hms_opt(0, 0, 0).unwrap()).earliest().map_or(0, |t| t.timestamp_millis())
}

/// Every trained case's figures, from the training solves (standard mode).
pub fn stats(store: &Store) -> HashMap<String, CaseStats> {
    let mut by: HashMap<String, Vec<(Option<f64>, i64)>> = HashMap::new();
    for s in store.solves.iter().filter(|s| s.solve_mode == "standard") {
        if let Some(c) = &s.case_id { by.entry(c.clone()).or_default().push((s.value(), s.at())) }
    }
    by.into_iter()
        .map(|(id, attempts)| {
            let values: Vec<Option<f64>> = attempts.iter().map(|a| a.0).collect();
            let s = CaseStats { count: values.len(), best: best(&values), mean: mean(&values), ao5: last_average(&values, 5), ao12: last_average(&values, 12), last: values.last().copied().flatten(), last_at: attempts.last().map(|a| a.1), due: due(&attempts) };
            (id, s)
        })
        .collect()
}

/// The learned cases due for review now, in catalogue order.
pub fn due_cases(store: &Store, stats: &HashMap<String, CaseStats>, now: i64) -> Vec<String> {
    crate::catalog::catalog().cases.iter().filter(|c| store.is_learned(&c.id) && stats.get(&c.id).map_or(0, |s| s.due) <= now).map(|c| c.id.clone()).collect()
}

/// The learned cases trained at least three times and slower than their set's usual, the slowest against it first:
/// (case, its mean, the set's usual).
pub fn recommend(store: &Store, stats: &HashMap<String, CaseStats>, limit: usize) -> Vec<(String, f64, f64)> {
    let cat = crate::catalog::catalog();
    let mut by_set: HashMap<&str, Vec<(&str, f64)>> = HashMap::new();
    for (id, s) in stats {
        if !store.is_learned(id) || s.count < 3 { continue }
        let (Some(c), Some(m)) = (cat.case(id), s.mean) else { continue };
        by_set.entry(c.set.as_str()).or_default().push((id.as_str(), m));
    }
    let mut out = vec![];
    for list in by_set.values() {
        if list.len() < 2 { continue }
        let usual = list.iter().map(|r| r.1).sum::<f64>() / list.len() as f64;
        out.extend(list.iter().filter(|r| r.1 > usual).map(|r| (r.0.to_string(), r.1, usual)));
    }
    out.sort_by(|a, b| (b.1 / b.2).total_cmp(&(a.1 / a.2)));
    out.truncate(limit);
    out
}

#[cfg(test)]
mod tests {
    #[test]
    fn spaces_reviews() {
        let day = 86_400_000;
        let t0 = 1_790_000_000_000;
        assert_eq!(super::due(&[]), 0);
        // Done well: due a day later at the earliest, then three days after that.
        let one = super::due(&[(Some(2000.0), t0)]);
        assert!(one > t0 && one <= t0 + day);
        let two = super::due(&[(Some(2000.0), t0), (Some(1900.0), one + 1000)]);
        assert!(two > one + 2 * day && two <= one + 3 * day + 1000);
        // A DNF when due: due again at once.
        assert_eq!(super::due(&[(Some(2000.0), t0), (None, one + 5)]), one + 5);
    }
}
