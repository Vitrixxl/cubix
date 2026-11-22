//! Embeds the catalogue's pictures of the cases of other puzzles (assets/cases/*.png) as a table of bytes.
use std::io::Write;

fn main() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../assets/cases");
    println!("cargo:rerun-if-changed={}", dir.display());
    let mut names: Vec<String> = std::fs::read_dir(&dir).map(|d| d.filter_map(|e| e.ok()).map(|e| e.file_name().to_string_lossy().into_owned()).filter(|n| n.ends_with(".png")).collect()).unwrap_or_default();
    names.sort();
    let out = std::path::Path::new(&std::env::var("OUT_DIR").unwrap()).join("cases.rs");
    let mut f = std::fs::File::create(out).unwrap();
    writeln!(f, "pub static CASES: &[(&str, &[u8])] = &[").unwrap();
    for n in names {
        writeln!(f, "    ({:?}, include_bytes!({:?})),", n.trim_end_matches(".png"), dir.join(&n).display().to_string()).unwrap();
    }
    writeln!(f, "];").unwrap();
}
