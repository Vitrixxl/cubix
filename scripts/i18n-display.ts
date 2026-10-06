/**
 * Translates, where the interface shows them, the texts that reach it as values (a step's title, an achievement, a
 * label of the data engine): every JSX child, and every attribute people read, whose type is a string, goes through
 * `said` (desktop/renderer/base.tsx), which translates a known English text and leaves anything else as it is. Values
 * that are someone's words (usernames, messages, comments…), notation or formatted figures are left alone.
 * Uses the type checker of desktop/tsconfig.json.
 *   bun scripts/i18n-display.ts
 */
import * as ts from "typescript";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { applyEdits, READ, type Edit } from "./i18n-common";

/** Values never translated: what people wrote, who they are, notation, figures. */
const OWN = /(^|\.)(username|body|comment|email|displayDate|scramble|solution|alg|setup|avatar|id|url|src|href|value|time|ms|count|n|query|text|name|description|headline|bio|experience|note|notes|group|subgroup|setLabel|probability|event|from|title)$/;

const configPath = resolve("desktop/tsconfig.json");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath));
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();

const stringy = (type: ts.Type): boolean => {
  if (type.isUnion()) return type.types.some((t) => t.flags & ts.TypeFlags.StringLike) && type.types.every((t) => t.flags & (ts.TypeFlags.StringLike | ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.BooleanLiteral));
  return !!(type.flags & ts.TypeFlags.String) || !!(type.flags & ts.TypeFlags.StringLiteral);
};
/** The expression a value is read from, or why it is left alone. */
function wrappable(e: ts.Expression): boolean {
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) || ts.isTemplateExpression(e)) return false;
  if (ts.isCallExpression(e)) return false;
  if (ts.isConditionalExpression(e) || ts.isBinaryExpression(e) || ts.isParenthesizedExpression(e)) return false;
  const text = e.getText();
  if (OWN.test(text) && !/\.(title|label|text|name|description)$/.test(text)) return false;
  return stringy(checker.getTypeAtLocation(e));
}

let changed = 0;
for (const sf of program.getSourceFiles()) {
  const file = relative(process.cwd(), sf.fileName);
  if (!file.startsWith("desktop/renderer/") && !file.startsWith("desktop/guides/")) continue;
  if (/components\/ui\/|\/dev\/|\/admin\//.test(file) || !file.endsWith(".tsx")) continue;
  const edits: Edit[] = [];
  const visit = (n: ts.Node) => {
    const container = ts.isJsxExpression(n) && n.expression && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent) || (ts.isJsxAttribute(n.parent) && READ.has(n.parent.name.getText())));
    if (container && wrappable(n.expression!)) {
      const e = n.expression!;
      // People's own words are left alone, whatever the field is called.
      const name = e.getText().replace(/^.*\./, "");
      if (!["username", "body", "comment"].includes(name)) edits.push({ start: e.getStart(), end: e.getEnd(), text: `said(${e.getText()})` });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!edits.length) continue;
  const out = applyEdits(file, sf.getFullText(), edits, "said", "desktop/renderer/base", /\bsaid\b[^;]*from "[^"]*(\/base|\/ui)"|export const said/);
  writeFileSync(file, out);
  changed++;
  console.log(file, edits.length);
}
console.log(`${changed} files changed`);
