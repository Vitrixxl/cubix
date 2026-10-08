/**
 * Puts the English texts of the interface through the translation (`tr`, src/client/i18n): JSX text, the string
 * attributes people read (titles, labels, placeholders…), and the strings and templates such places choose between
 * (`a ? "Yes" : "No"`, `` `${n} cases` ``, which becomes `tr("{0} cases", { 0: n })`). Edits the files in place and
 * adds the import; texts already translated are left alone, so it runs again safely after new texts are written.
 *   bun scripts/i18n-wrap.ts [files…]   (the app's and the landing's sources by default)
 */
import * as ts from "typescript";
import { globSync, readFileSync, writeFileSync } from "node:fs";
import { applyEdits, quote, READ, templateCall, words, type Edit } from "./i18n-common";

/** Attributes whose text is read or heard. */

/** The text JSX renders for a JSXText, as Babel cleans it, with whether a space stays on either side. */
function rendered(raw: string) {
  const lines = raw.split(/\r\n|\n|\r/);
  let last = -1;
  lines.forEach((l, i) => /[^ \t]/.test(l) && (last = i));
  let out = "";
  lines.forEach((line, i) => {
    let s = line.replace(/\t/g, " ");
    if (i !== 0) s = s.replace(/^ +/, "");
    if (i !== lines.length - 1) s = s.replace(/ +$/, "");
    if (s) out += i !== last ? s + " " : s;
  });
  return out;
}

/** The phone app's own read attributes (React Native's accessibility labels, its primitives' texts). */
const MOBILE_READ = new Set(["accessibilityLabel", "accessibilityHint", "backLabel", "openLabel", "help", "status", "summary", "action", "cancel", "held"]);
/** On the phone, the fields of objects written in a component that people read: `toast({ title: "Saved" })`, `options={[{ label: "Dark" }]}`. */
const MOBILE_FIELDS = new Set([...MOBILE_READ, "title", "text", "description", "label", "sub", "detail", "hint", "message", "placeholder", "heading"]);

export function wrap(file: string, source: string) {
  const mobile = /(^|\/)mobile\//.test(file);
  const read = (name: string) => READ.has(name) || (mobile && MOBILE_READ.has(name));
  const inFunction = (n: ts.Node) => {
    for (let p = n.parent; p; p = p.parent) if (ts.isFunctionLike(p)) return true;
    return false;
  };
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits: Edit[] = [];
  const translated = (n: ts.Node) => {
    for (let p = n.parent; p; p = p.parent) if (ts.isCallExpression(p) && /^(tr|t|tn)$/.test(p.expression.getText())) return true;
    return false;
  };
  /** A string or a template the expression chooses, through conditions and defaults. */
  const choices = (e: ts.Expression): void => {
    if (ts.isParenthesizedExpression(e)) return choices(e.expression);
    if (ts.isConditionalExpression(e)) return (choices(e.whenTrue), choices(e.whenFalse));
    if (ts.isBinaryExpression(e) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(e.operatorToken.kind)) {
      if (e.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) choices(e.left);
      return choices(e.right);
    }
    // "Training · " + plural(n, "case"): the parts joined as one text.
    if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken && !translated(e)) {
      const parts: ts.Expression[] = [];
      const flatten = (x: ts.Expression): void => {
        if (ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.PlusToken) return (flatten(x.left), flatten(x.right));
        parts.push(x);
      };
      flatten(e);
      const literal = (x: ts.Expression) => ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x);
      if (!parts.some((x) => literal(x) && words((x as ts.StringLiteral).text))) return;
      let key = "";
      const values: string[] = [];
      for (const x of parts) {
        if (literal(x)) key += (x as ts.StringLiteral).text;
        else {
          key += `{${values.length}}`;
          values.push(`${values.length}: ${x.getText()}`);
        }
      }
      return void edits.push({ start: e.getStart(), end: e.getEnd(), text: `tr(${quote(key)}, { ${values.join(", ")} })` });
    }
    if ((ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) && words(e.text) && !translated(e)) {
      edits.push({ start: e.getStart(), end: e.getEnd(), text: `tr(${quote(e.text)})` });
    } else if (ts.isTemplateExpression(e) && !translated(e)) {
      const parts = [e.head.text, ...e.templateSpans.map((s) => s.literal.text)];
      if (!parts.some(words)) return;
      edits.push({ start: e.getStart(), end: e.getEnd(), text: templateCall("tr", e) });
    }
  };
  /** Notices and announcements: their text, and the description and action label of their options. */
  const NOTICE = /^(toast(\.(error|success|info|warning|message))?|(this|s|store)\.announce|announce)$/;
  /** Children already put in a sentence with the values beside them. */
  const merged = new Set<ts.Node>();
  /** A value shown inside a sentence: no element and no text of its own to translate. */
  const value = (e: ts.Expression) => {
    let plain = true;
    const look = (x: ts.Node) => {
      if (ts.isJsxElement(x) || ts.isJsxSelfClosingElement(x) || ts.isJsxFragment(x) || ((ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x) || ts.isTemplateHead(x)) && words(x.text))) plain = false;
      else ts.forEachChild(x, look);
    };
    look(e);
    return plain;
  };
  /** On the phone, `{a} of {b}` in an element becomes one sentence, `tr("{0} of {1}", { 0: a, 1: b })`. */
  const sentences = (children: ts.NodeArray<ts.JsxChild>) => {
    let run: ts.JsxChild[] = [];
    const flush = () => {
      const texts = run.filter((c) => ts.isJsxText(c) && words(rendered(c.text)));
      if (texts.length && run.some((c) => ts.isJsxExpression(c))) {
        let key = "";
        const values: string[] = [];
        for (const c of run) {
          if (ts.isJsxText(c)) key += rendered(c.text);
          else {
            key += `{${values.length}}`;
            values.push(`${values.length}: ${(c as ts.JsxExpression).expression!.getText()}`);
          }
          merged.add(c);
        }
        const lead = /^\s/.test(key) ? '{" "}' : "",
          tail = /\s$/.test(key) ? '{" "}' : "";
        edits.push({ start: run[0]!.pos, end: run.at(-1)!.getEnd(), text: `${lead}{tr(${quote(key.trim())}, { ${values.join(", ")} })}${tail}` });
      }
      run = [];
    };
    for (const c of children) {
      if (ts.isJsxText(c) || (ts.isJsxExpression(c) && c.expression && value(c.expression))) run.push(c);
      else flush();
    }
    flush();
  };
  const visit = (n: ts.Node) => {
    if (merged.has(n)) return;
    if (mobile && (ts.isJsxElement(n) || ts.isJsxFragment(n)) && !translated(n)) sentences(n.children);
    if (ts.isCallExpression(n) && NOTICE.test(n.expression.getText()) && !translated(n)) {
      const [first, options] = n.arguments;
      if (first) choices(first);
      if (options && ts.isObjectLiteralExpression(options))
        for (const p of options.properties) {
          if (!ts.isPropertyAssignment(p)) continue;
          if (["description", "label"].includes(p.name.getText())) choices(p.initializer);
          if (p.name.getText() === "action" && ts.isObjectLiteralExpression(p.initializer))
            for (const q of p.initializer.properties) if (ts.isPropertyAssignment(q) && q.name.getText() === "label") choices(q.initializer);
        }
    }
    if (ts.isJsxText(n) && words(n.text)) {
      const text = rendered(n.text);
      if (text.trim() && words(text)) {
        const lead = text.startsWith(" ") ? '{" "}' : "",
          tail = text.endsWith(" ") ? '{" "}' : "";
        edits.push({ start: n.pos, end: n.getEnd(), text: `${lead}{tr(${quote(text.trim())})}${tail}` });
      }
    } else if (mobile && ts.isPropertyAssignment(n) && MOBILE_FIELDS.has(n.name.getText()) && inFunction(n)) {
      // Data written at the top of a module is read before a language is chosen: it is translated where it is drawn.
      choices(n.initializer);
    } else if (ts.isJsxAttribute(n) && read(n.name.getText()) && n.initializer) {
      if (ts.isStringLiteral(n.initializer) && words(n.initializer.text)) edits.push({ start: n.initializer.getStart(), end: n.initializer.getEnd(), text: `{tr(${quote(n.initializer.text)})}` });
      else if (ts.isJsxExpression(n.initializer) && n.initializer.expression) choices(n.initializer.expression);
    } else if (ts.isJsxExpression(n) && n.expression && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))) choices(n.expression);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!edits.length) return source;
  return applyEdits(file, source, edits, "tr", "src/client/i18n", /import \{[^}]*\btr\b[^}]*\} from "[^"]*src\/client\/i18n"/);
}

if (import.meta.main) {
  const files = process.argv.slice(2).length
    ? process.argv.slice(2)
    : [...globSync("desktop/renderer/**/*.{ts,tsx}"), ...globSync("desktop/guides/*.tsx"), "mobile/App.tsx", ...globSync("mobile/src/**/*.{ts,tsx}")].filter((f) => !/components\/ui\/|\/dev\/|\/admin\/|\.d\.ts$|worker\.ts$|sw\.ts$/.test(f));
  let changed = 0;
  for (const file of files) {
    const before = readFileSync(file, "utf8"), after = wrap(file, before);
    if (after !== before) {
      writeFileSync(file, after);
      changed++;
    }
  }
  console.log(`${changed} of ${files.length} files changed`);
}
