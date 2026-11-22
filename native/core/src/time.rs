//! Times and averages, as src/client/lib/format.ts computes them (WCA rules).
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum Penalty {
    #[default]
    #[serde(rename = "none")]
    None,
    #[serde(rename = "+2")]
    Plus2,
    #[serde(rename = "dnf")]
    Dnf,
}

/// A time kept to the hundredth, as a competition timer gives it: what is past it is dropped.
pub fn to_hundredths(ms: u64) -> u64 { ms / 10 * 10 }

/// The time that counts: +2 adds two seconds, a DNF has none.
pub fn effective(ms: u64, penalty: Penalty) -> Option<f64> {
    match penalty {
        Penalty::None => Some(ms as f64),
        Penalty::Plus2 => Some(ms as f64 + 2000.0),
        Penalty::Dnf => None,
    }
}

/// "12.34", "1:02.30"; "–" for no time. Averages are rounded to the nearest hundredth, as the WCA does.
pub fn fmt_time(ms: Option<f64>) -> String {
    let Some(ms) = ms.filter(|m| m.is_finite()) else { return "–".into() };
    let total = ((ms.max(0.0) / 10.0).round() as u64) * 10;
    let (minutes, rest) = (total / 60_000, total % 60_000);
    if minutes > 0 { format!("{minutes}:{:02}.{:02}", rest / 1000, rest % 1000 / 10) } else { format!("{}.{:02}", rest / 1000, rest % 1000 / 10) }
}

/// A solve as written in a list: "DNF", "14.21+", "12.34".
pub fn fmt_solve(ms: u64, penalty: Penalty) -> String {
    match penalty {
        Penalty::Dnf => "DNF".into(),
        Penalty::Plus2 => format!("{}+", fmt_time(Some(ms as f64 + 2000.0))),
        Penalty::None => fmt_time(Some(ms as f64)),
    }
}

/// Average with the best and the worst dropped; a DNF is the worst, two make it a DNF (None).
pub fn average_of(times: &[Option<f64>]) -> Option<f64> {
    if times.len() < 3 { return None }
    let (mut sum, mut min, mut max, mut dnfs) = (0.0, f64::INFINITY, f64::NEG_INFINITY, 0);
    for t in times {
        match t {
            None => {
                dnfs += 1;
                if dnfs > 1 { return None }
            }
            Some(t) => {
                sum += t;
                min = min.min(*t);
                max = max.max(*t);
            }
        }
    }
    Some((sum - min - if dnfs > 0 { 0.0 } else { max }) / (times.len() - 2) as f64)
}

/// The average of the last `n` times, None until there are `n`.
pub fn last_average(times: &[Option<f64>], n: usize) -> Option<f64> {
    if times.len() < n { None } else { average_of(&times[times.len() - n..]) }
}

/// The average of `n` ending at each time, oldest first.
// ponytail: O(len × n), a few hundred thousand steps for a long session's Ao100; the monotone-queue version of
// format.ts if sessions ever reach tens of thousands of solves.
pub fn rolling(times: &[Option<f64>], n: usize) -> Vec<Option<f64>> {
    (0..times.len()).map(|i| if i + 1 < n { None } else { average_of(&times[i + 1 - n..=i]) }).collect()
}

pub fn mean(times: &[Option<f64>]) -> Option<f64> {
    let kept: Vec<f64> = times.iter().flatten().copied().collect();
    (!kept.is_empty()).then(|| kept.iter().sum::<f64>() / kept.len() as f64)
}

pub fn best(times: &[Option<f64>]) -> Option<f64> { times.iter().flatten().copied().reduce(f64::min) }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_like_the_web() {
        assert_eq!(fmt_time(Some(12_340.0)), "12.34");
        assert_eq!(fmt_time(Some(62_300.0)), "1:02.30");
        assert_eq!(fmt_time(Some(12_345.0)), "12.35");
        assert_eq!(fmt_time(None), "–");
        assert_eq!(fmt_solve(12_210, Penalty::Plus2), "14.21+");
        assert_eq!(fmt_solve(9_000, Penalty::Dnf), "DNF");
        assert_eq!(to_hundredths(12_349), 12_340);
    }

    #[test]
    fn averages_drop_best_and_worst() {
        let t = |v: &[f64]| v.iter().map(|x| Some(*x)).collect::<Vec<_>>();
        assert_eq!(average_of(&t(&[10.0, 20.0, 30.0, 40.0, 50.0])), Some(30.0));
        let mut one_dnf = t(&[10.0, 20.0, 30.0, 40.0]);
        one_dnf.push(None);
        assert_eq!(average_of(&one_dnf), Some(30.0));
        one_dnf[0] = None;
        assert_eq!(average_of(&one_dnf), None);
        assert_eq!(last_average(&t(&[1.0, 2.0]), 5), None);
        let r = rolling(&t(&[10.0, 20.0, 30.0, 40.0, 50.0, 60.0]), 5);
        assert_eq!(r[3], None);
        assert_eq!(r[5], Some(40.0));
        assert_eq!(best(&one_dnf), Some(20.0));
        assert_eq!(mean(&t(&[10.0, 20.0])), Some(15.0));
    }
}
