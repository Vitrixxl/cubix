/**
 * Every English text the app (web and Android), the landing page and the API show, for the dictionaries (src/client/i18n/<code>.json):
 * the texts put through `tr`, `t`, `tn`, `plural` and `msg` in the code, the texts of the data the pages draw (the
 * solving methods, the landing page, the guides' names, the puzzles and events), and the API's error messages.
 * Writes them, sorted, to src/client/i18n/keys.json; tests/i18n.test.ts checks each dictionary has them all.
 *   bun scripts/i18n-extract.ts
 */
import * as ts from "typescript";
import { globSync, readFileSync, writeFileSync } from "node:fs";

const keys = new Set<string>();
/** Fields of the interface's data that people read. */
const LABELS = new Set(["label", "title", "description", "tip", "detail", "hint", "heading", "summary", "text", "caption", "name", "sub", "meta"]);
const words = (s: string) => /[A-Za-z]{2}/.test(s);
const add = (s: string | undefined) => {
  const text = s?.trim();
  if (text && words(text)) keys.add(text);
};
/** The plural of an English noun, as `tn` makes it. */
import { pluralOf } from "../src/client/i18n";

/** The texts an expression may give: a string, or each branch of a condition. */
function strings(e: ts.Expression | undefined): string[] {
  if (!e) return [];
  if (ts.isParenthesizedExpression(e)) return strings(e.expression);
  if (ts.isConditionalExpression(e)) return [...strings(e.whenTrue), ...strings(e.whenFalse)];
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return [e.text];
  return [];
}

for (const file of [...globSync("desktop/renderer/**/*.{ts,tsx}"), ...globSync("desktop/guides/*.tsx"), ...globSync("src/client/**/*.ts"), ...globSync("src/shared/**/*.ts"), "mobile/App.tsx", ...globSync("mobile/src/**/*.{ts,tsx}")]) {
  if (/components\/ui\/|\/admin\/|\/dev\/|\/legal\/|\.d\.ts$/.test(file)) continue;
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n)) {
      const name = n.expression.getText().replace(/^.*\./, "");
      const [first, second] = n.arguments;
      if (["tr", "t", "msg"].includes(name) && n.expression.getText() !== "s.t") strings(first).forEach(add);
      if (name === "tn") {
        for (const one of strings(second)) {
          add(one);
          add(n.arguments[2] ? undefined : pluralOf(one));
        }
        strings(n.arguments[2]).forEach(add);
      }
      if (name === "plural" && second) for (const noun of strings(second)) (add(`{n} ${noun}`), add(`{n} ${pluralOf(noun)}`));
    }
    // Labels written in the interface's own data: `{ label: "Dark" }`, `["Best", value]`.
    if (/desktop\/(renderer|guides)\/|mobile\//.test(file)) {
      if (ts.isPropertyAssignment(n) && LABELS.has(n.name.getText()) && !(file.startsWith("mobile/") && n.name.getText() === "name") && (ts.isStringLiteral(n.initializer) || ts.isNoSubstitutionTemplateLiteral(n.initializer))) add(n.initializer.text);
      if (ts.isArrayLiteralExpression(n)) for (const e of n.elements) if (ts.isStringLiteral(e) && /^[A-Z][a-z]/.test(e.text)) add(e.text);
      // The landing page's sentences, wherever they are kept.
      if (file.includes("/landing/") && ts.isStringLiteral(n) && /^[A-Z][a-z]* [a-z]/.test(n.text)) add(n.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

/** Every string of a data structure, but the fields that are notation, identifiers or addresses. */
function walk(value: unknown, skip = new Set(["id", "alg", "setup", "alternatives", "sets", "mask", "level", "path", "puzzle", "solveMode", "twisty", "scrambles", "icon", "href", "url", "train"])) {
  if (typeof value === "string") return add(value);
  if (Array.isArray(value)) return value.forEach((v) => walk(v, skip));
  if (value && typeof value === "object") for (const [key, v] of Object.entries(value)) if (!skip.has(key)) walk(v, skip);
}
const { METHODS } = await import("../src/shared/methods");
walk(METHODS);
const content = await import("../desktop/renderer/landing/content");
for (const [name, value] of Object.entries(content)) if (!["SITE", "NAME", "SOURCE", "IMPORTS"].includes(name)) walk(value);
const { GUIDES } = await import("../desktop/guides/pages");
walk(Object.values(GUIDES).map(({ name, heading }) => ({ name, heading })));
walk(JSON.parse(readFileSync("data/puzzles.json", "utf8")));
// The catalogue's words: its sets, stages, groups and notes, and the names that describe a case. Nicknames (Sune, T Perm,
// the OLL names), letters and numbers stay as they are; a number in a name is a value ("Corner orientation {0}").
const catalog = JSON.parse(readFileSync("data/catalog.json", "utf8"));
const REDUCED = "After centers and edges are reduced: ";
add(REDUCED + "{0}");
for (const s of catalog.sets) {
  add(s.description.replace(REDUCED, ""));
  // "ZBLL T" is a name; "F2L Advanced" is shown as "Advanced" beside its stage.
  if (s.stage !== "ZBLL") (add(s.label), add(s.label.replace(/^F2L /, "")));
}
for (const c of catalog.cases) {
  add(c.stage);
  add(c.notes);
  if (!/^[A-Z][a-z]?[A-Z]?\d$/.test(c.group)) add(c.group);
  const nickname = (/^oll|^pll/.test(c.set.replace(/^\d+x\d+-/, "")) && !/Shape$/.test(c.name)) || /^(F2L|PLL \(|Pi$|Sune$|Antisune$)/.test(c.name);
  if (c.name !== c.id && !nickname) add(c.name.replace(/\d+/, "{0}"));
}
const { TOUR_STEPS } = await import("../src/client/lib/journey");
walk(TOUR_STEPS.map(({ title, body }) => ({ title, body })));

// The API's messages, shown as they come in notices.
for (const file of globSync("rust-api/src/*.rs")) {
  const source = readFileSync(file, "utf8");
  for (const m of source.matchAll(/ApiError::new\(\s*\d+,\s*"((?:[^"\\]|\\.)*)"/g)) add(m[1]);
  for (const m of source.matchAll(/const [A-Z_]+: &str = "((?:[^"\\]|\\.)*)";/g)) if (/^[A-Z][a-z]/.test(m[1]!) && m[1]!.includes(" ")) add(m[1]);
}

const sorted = [...keys].sort((a, b) => a.localeCompare(b, "en"));
writeFileSync("src/client/i18n/keys.json", JSON.stringify(sorted, null, 1) + "\n");
console.log(`${sorted.length} texts`);
