use serde_json::{Value, json};
use std::collections::VecDeque;
/// The time a solve counts for: none for a DNF, two more seconds for +2.
pub fn effective_ms(ms: f64, penalty: &str) -> Option<f64> {
    match penalty {
        "dnf" => None,
        "+2" => Some(ms + 2000.),
        _ => Some(ms),
    }
}
/// `effective_ms` over the `time_ms` and `penalty` columns of a solve, in SQL.
pub const EFFECTIVE_MS_SQL: &str =
    "CASE WHEN penalty='dnf' THEN NULL ELSE time_ms+CASE WHEN penalty='+2' THEN 2000 ELSE 0 END END";
pub fn effective(s: &Value) -> Option<f64> {
    effective_ms(
        s["time_ms"].as_f64().unwrap_or(0.),
        s["penalty"].as_str().unwrap_or(""),
    )
}
pub fn average(times: &[Option<f64>]) -> Option<f64> {
    if times.len() < 3 || times.iter().filter(|v| v.is_none()).count() > 1 {
        return None;
    }
    let mut sorted: Vec<f64> = times.iter().map(|n| n.unwrap_or(f64::INFINITY)).collect();
    sorted.sort_by(f64::total_cmp);
    Some(sorted[1..sorted.len() - 1].iter().sum::<f64>() / (sorted.len() - 2) as f64)
}
fn rolling(times: &[Option<f64>], n: usize) -> Vec<Option<f64>> {
    let (mut mins, mut maxs): (VecDeque<usize>, VecDeque<usize>) = (VecDeque::new(), VecDeque::new());
    let (mut sum, mut dnfs) = (0., 0);
    let mut result = Vec::with_capacity(times.len());
    for (i, time) in times.iter().enumerate() {
        if i >= n {
            if let Some(old) = times[i - n] { sum -= old; } else { dnfs -= 1; }
            while mins.front().is_some_and(|&j| j <= i - n) { mins.pop_front(); }
            while maxs.front().is_some_and(|&j| j <= i - n) { maxs.pop_front(); }
        }
        if let Some(time) = time {
            sum += time;
            while mins.back().is_some_and(|&j| times[j].unwrap() >= *time) { mins.pop_back(); }
            while maxs.back().is_some_and(|&j| times[j].unwrap() <= *time) { maxs.pop_back(); }
            mins.push_back(i);
            maxs.push_back(i);
        } else { dnfs += 1; }
        result.push(if i + 1 < n || dnfs > 1 { None } else {
            Some((sum - times[*mins.front().unwrap()].unwrap() - if dnfs == 0 { times[*maxs.front().unwrap()].unwrap() } else { 0. }) / (n - 2) as f64)
        });
    }
    result
}
fn minimum(values: impl Iterator<Item = f64>) -> Option<f64> {
    values.reduce(f64::min)
}
pub fn history(case_id: &str, solves: &[Value]) -> Value {
    let times: Vec<_> = solves.iter().map(effective).collect();
    let ao5 = rolling(&times, 5);
    let ao12 = rolling(&times, 12);
    let mut best: Option<f64> = None;
    let entries: Vec<_> = solves.iter().zip(&times).map(|(s, time)| {
        if let Some(t) = time { best = Some(best.map_or(*t, |b| b.min(*t))); }
        json!({"id":s["id"],"time":time,"timeMs":s["time_ms"],"penalty":s["penalty"],"comment":s["comment"],"at":s["created_at"],"best":best,"sessionId":s["session_id"]})
    }).collect();
    json!({"summary":summary_of(case_id, solves, &times, &ao5, &ao12),"history":entries,"ao5":ao5,"ao12":ao12})
}
pub fn summary(case_id: &str, solves: &[Value]) -> Value {
    let times: Vec<_> = solves.iter().map(effective).collect();
    summary_of(case_id, solves, &times, &rolling(&times, 5), &rolling(&times, 12))
}
fn summary_of(case_id: &str, solves: &[Value], times: &[Option<f64>], ao5: &[Option<f64>], ao12: &[Option<f64>]) -> Value {
    let valid: Vec<_> = times.iter().flatten().copied().collect();
    json!({
        "caseId":case_id,"count":solves.len(),"best":minimum(valid.iter().copied()),"worst":valid.iter().copied().reduce(f64::max),
        "mean":if valid.is_empty(){None}else{Some(valid.iter().sum::<f64>()/valid.len() as f64)},
        "ao5":ao5.last().copied().flatten(),"ao12":ao12.last().copied().flatten(),
        "bestAo5":minimum(ao5.iter().flatten().copied()),"bestAo12":minimum(ao12.iter().flatten().copied()),
        "last":times.last().copied().flatten(),"lastAt":solves.last().map(|s|&s["created_at"])
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rolling_matches_sorted_windows() {
        let times: Vec<_> = (0..2000).map(|i| if i % 17 < 2 { None } else { Some(((i * 7919) % 100) as f64 * 123.) }).collect();
        for size in [3, 5, 12, 100] {
            let expected: Vec<_> = (0..times.len()).map(|i| if i + 1 < size { None } else { average(&times[i + 1 - size..=i]) }).collect();
            assert_eq!(rolling(&times, size), expected);
        }
        let rows: Vec<_> = times.iter().enumerate().map(|(id, time)| json!({"id":id,"time_ms":time.unwrap_or(1000.),"penalty":if time.is_none() {"dnf"} else {"none"},"created_at":"2026-01-01"})).collect();
        assert_eq!(summary("case", &rows), history("case", &rows)["summary"]);
    }
    #[test]
    fn dnf_and_trimming() {
        assert_eq!(
            average(&[Some(1000.), Some(2000.), Some(3000.), Some(4000.), None]),
            Some(3000.)
        );
        assert_eq!(
            average(&[Some(1000.), Some(2000.), Some(3000.), None, None]),
            None
        );
        assert_eq!(
            effective(&json!({"time_ms":1000,"penalty":"+2"})),
            Some(3000.)
        );
        assert_eq!(history("empty", &[])["summary"]["lastAt"], Value::Null);
    }
}
