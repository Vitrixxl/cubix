/**
 * The profile and statistics mockups, in one file: head, styles, the parts in their order, the scripts.
 *
 *   bun docs/maquettes-profil/build.ts   → docs/maquettes-profil-stats.html
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = import.meta.dir, read = (f: string) => readFileSync(join(dir, f), "utf8");
const parts = readdirSync(dir).filter((f) => /^\d\d-.*\.html$/.test(f)).sort().map(read).join("\n");
const style = `<style>\n${read("base.css")}\n${read("extra.css")}\n</style>`;
writeFileSync(join(dir, "../maquettes-profil-stats.html"), parts.replace("<!--STYLE-->", style) + read("tail.html"));
console.log("docs/maquettes-profil-stats.html");
