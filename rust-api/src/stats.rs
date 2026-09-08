use serde_json::{Value, json};
pub fn effective(s: &Value) -> Option<f64> {
    if s["penalty"] == "dnf" {
        None
    } else {
        Some(s["time_ms"].as_f64().unwrap_or(0.) + if s["penalty"] == "+2" { 2000. } else { 0. })
    }
}
fn average(times: &[Option<f64>]) -> Option<f64> {
    if times.len() < 3 || times.iter().filter(|v| v.is_none()).count() > 1 {
        return None;
    }
    let mut sorted: Vec<f64> = times.iter().map(|n| n.unwrap_or(f64::INFINITY)).collect();
    sorted.sort_by(f64::total_cmp);
    Some(sorted[1..sorted.len() - 1].iter().sum::<f64>() / (sorted.len() - 2) as f64)
}
fn rolling(times: &[Option<f64>], n: usize) -> Vec<Option<f64>> {
    (0..times.len())
        .map(|i| {
            if i + 1 < n {
                None
            } else {
                average(&times[i + 1 - n..=i])
            }
        })
        .collect()
}
fn minimum(values: impl Iterator<Item = f64>) -> Option<f64> {
    values.reduce(f64::min)
}
pub fn history(case_id: &str, solves: &[Value]) -> Value {
    let times: Vec<_> = solves.iter().map(effective).collect();
    let valid: Vec<_> = times.iter().flatten().copied().collect();
    let ao5 = rolling(&times, 5);
    let ao12 = rolling(&times, 12);
    let mut best: Option<f64> = None;
    let entries: Vec<_> = solves.iter().zip(&times).map(|(s, time)| {
        if let Some(t) = time { best = Some(best.map_or(*t, |b| b.min(*t))); }
        json!({"id":s["id"],"time":time,"penalty":s["penalty"],"at":s["created_at"],"best":best,"sessionId":s["session_id"]})
    }).collect();
    json!({"summary":{
        "caseId":case_id,"count":solves.len(),"best":minimum(valid.iter().copied()),"worst":valid.iter().copied().reduce(f64::max),
        "mean":if valid.is_empty(){None}else{Some(valid.iter().sum::<f64>()/valid.len() as f64)},
        "ao5":ao5.last().copied().flatten(),"ao12":ao12.last().copied().flatten(),
        "bestAo5":minimum(ao5.iter().flatten().copied()),"bestAo12":minimum(ao12.iter().flatten().copied()),
        "last":times.last().copied().flatten(),"lastAt":solves.last().map(|s|&s["created_at"])
    },"history":entries,"ao5":ao5,"ao12":ao12})
}
#[cfg(test)]
mod tests {
    use super::*;
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
