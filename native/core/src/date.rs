//! Dates as the API writes them (ISO 8601, UTC) and as the interface shows them (the device's time zone).
use chrono::{DateTime, Datelike, Local, TimeZone, Utc};

/// Milliseconds since 1970 from an ISO date ("2026-11-22T10:04:05.123Z"; SQLite's "2026-11-22 10:04:05" too).
pub fn parse(s: &str) -> Option<i64> {
    if let Ok(d) = DateTime::parse_from_rfc3339(s) { return Some(d.timestamp_millis()) }
    chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S").ok().map(|d| d.and_utc().timestamp_millis())
}

pub fn iso(ms: i64) -> String { Utc.timestamp_millis_opt(ms).single().unwrap_or_default().to_rfc3339_opts(chrono::SecondsFormat::Millis, true) }

fn local(ms: i64) -> DateTime<Local> { Local.timestamp_millis_opt(ms).single().unwrap_or_default() }

/// The local day of a moment, as days since 1970 (for streaks and activity).
pub fn day(ms: i64) -> i64 { local(ms).date_naive().num_days_from_ce() as i64 }

pub fn today() -> i64 { day(crate::store::now_ms() as i64) }

/// "22 Nov", or "22 Nov 2025" in another year.
pub fn short(ms: i64) -> String {
    let d = local(ms);
    let month = crate::i18n::t(MONTHS[d.month0() as usize]);
    if d.year() == local(crate::store::now_ms() as i64).year() { format!("{} {}", d.day(), month) } else { format!("{} {} {}", d.day(), month, d.year()) }
}

/// "22 Nov, 14:05".
pub fn with_time(ms: i64) -> String { format!("{}, {}", short(ms), local(ms).format("%H:%M")) }

/// "just now", "5 min ago", "3 h ago", or the day.
pub fn ago(ms: i64) -> String {
    let gone = (crate::store::now_ms() as i64 - ms) / 1000;
    if gone < 60 { crate::i18n::t("just now") } else if gone < 3600 { crate::i18n::tf("{0} min ago", &[&(gone / 60)]) } else if gone < 86_400 { crate::i18n::tf("{0} h ago", &[&(gone / 3600)]) } else { short(ms) }
}

pub const MONTHS: [&str; 12] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
pub const WEEKDAYS: [&str; 7] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

#[cfg(test)]
mod tests {
    #[test]
    fn reads_what_it_writes() {
        let ms = 1_790_000_000_123;
        assert_eq!(super::parse(&super::iso(ms)), Some(ms));
        assert_eq!(super::parse("2026-11-22 10:04:05"), Some(1_795_341_845_000));
    }
}
