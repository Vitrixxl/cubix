//! The interface's languages: its texts are written in English and looked up in the translations the web and the
//! phone use (src/client/i18n), `{0}`-style placeholders filled after.
use std::collections::HashMap;
use std::sync::{OnceLock, RwLock};

pub const LANGUAGES: [(&str, &str); 5] = [("en", "English"), ("fr", "Français"), ("es", "Español"), ("it", "Italiano"), ("de", "Deutsch")];

static CURRENT: RwLock<&'static str> = RwLock::new("en");

fn table(language: &str) -> Option<&'static HashMap<String, String>> {
    static TABLES: OnceLock<HashMap<&'static str, HashMap<String, String>>> = OnceLock::new();
    let tables = TABLES.get_or_init(|| {
        let parse = |s: &str| serde_json::from_str::<HashMap<String, String>>(s).unwrap_or_default();
        HashMap::from([
            ("fr", parse(include_str!("../../../src/client/i18n/fr.json"))),
            ("es", parse(include_str!("../../../src/client/i18n/es.json"))),
            ("it", parse(include_str!("../../../src/client/i18n/it.json"))),
            ("de", parse(include_str!("../../../src/client/i18n/de.json"))),
        ])
    });
    tables.get(language)
}

pub fn set_language(language: &str) { *CURRENT.write().unwrap() = LANGUAGES.iter().find(|l| l.0 == language).map_or("en", |l| l.0) }

pub fn language() -> &'static str { *CURRENT.read().unwrap() }

/// The system's language, when it is one of the app's.
pub fn system_language() -> &'static str {
    let lang = std::env::var("LC_ALL").or_else(|_| std::env::var("LC_MESSAGES")).or_else(|_| std::env::var("LANG")).unwrap_or_default();
    LANGUAGES.iter().find(|l| lang.starts_with(l.0)).map_or("en", |l| l.0)
}

/// `text` in the interface's language.
pub fn t(text: &str) -> String { table(language()).and_then(|t| t.get(text)).cloned().unwrap_or_else(|| text.to_string()) }

/// `text` translated, then each `{0}`, `{1}`… replaced by its value (the first one also fills `{n}`).
pub fn tf(text: &str, values: &[&dyn std::fmt::Display]) -> String {
    let mut out = t(text);
    for (i, v) in values.iter().enumerate() {
        out = out.replace(&format!("{{{i}}}"), &v.to_string());
        if i == 0 { out = out.replace("{n}", &v.to_string()) }
    }
    out
}

/// "1 solve" or "{n} solves", translated.
pub fn plural(n: usize, one: &str, many: &str) -> String { if n == 1 { tf(one, &[&n]) } else { tf(many, &[&n]) } }

#[cfg(test)]
mod tests {
    #[test]
    fn translates() {
        super::set_language("fr");
        assert_eq!(super::t("Page {0} of {1}"), "Page {0} sur {1}");
        assert_eq!(super::tf("Page {0} of {1}", &[&2, &5]), "Page 2 sur 5");
        assert_eq!(super::t("no such text, anywhere"), "no such text, anywhere");
        super::set_language("en");
    }
}
