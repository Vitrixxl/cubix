/**
 * Marks the English texts of modules outside the interface (the libraries the data engine and the mobile app share,
 * the store) with `msg`, which gives them back unchanged: the extraction (scripts/i18n-extract.ts) then lists them,
 * and the interface translates them where it shows them. A text is a string or a template starting with a capital
 * letter and holding words, outside imports, property names, types, `case` labels and comparisons.
 *   bun scripts/i18n-mark.ts <files…>
 */
import * as ts from "typescript";
import { readFileSync, writeFileSync } from "node:fs";
import { applyEdits, quote, templateCall, type Edit } from "./i18n-common";

const text = (s: string) => /^[A-Z][a-z]*[a-z ,.…'’:·-]/.test(s) && /[a-z]{2}/.test(s) && !/^[A-Z][A-Za-z]+$/.test(s.trim()) || /^[A-Z][a-z]{2,}$/.test(s);

export function mark(file: string, source: string) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits: Edit[] = [];
  const skipped = (n: ts.Node) => {
    const p = n.parent;
    if (!p) return true;
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isLiteralTypeNode(p) || ts.isCaseClause(p) || ts.isPropertyAssignment(p) && p.name === n) return true;
    if (ts.isElementAccessExpression(p) || ts.isPropertyAccessExpression(p)) return true;
    if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.InKeyword].includes(p.operatorToken.kind)) return true;
    for (let q: ts.Node | undefined = p; q; q = q.parent) {
      if (ts.isCallExpression(q) && /^(msg|tr|t|tn|require)$/.test(q.expression.getText().replace(/^.*\./, ""))) return true;
      if (ts.isCallExpression(q) && /(\.includes|\.startsWith|\.endsWith|\.test|\.split|\.has|\.get|\.set|\.delete|getItem|setItem|querySelector|addEventListener|matchMedia)$/.test(q.expression.getText()) && q.arguments.some((a) => a.pos <= n.pos && n.end <= a.end)) return true;
      if (ts.isTypeNode(q) || ts.isAsExpression(q) && q.type.getText() === "const") return true;
    }
    return false;
  };
  const visit = (n: ts.Node) => {
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && text(n.text) && !skipped(n)) edits.push({ start: n.getStart(), end: n.getEnd(), text: `msg(${quote(n.text)})` });
    else if (ts.isTemplateExpression(n) && !skipped(n)) {
      const parts = [n.head.text, ...n.templateSpans.map((s) => s.literal.text)];
      if (text(parts.join("{}").replace(/^\{\}/, "X")) && parts.some((p) => /[a-z]{2}/.test(p))) {
        edits.push({ start: n.getStart(), end: n.getEnd(), text: templateCall("msg", n) });
        return;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!edits.length) return source;
  return applyEdits(file, source, edits, "msg", "src/client/i18n/msg", /import \{[^}]*\bmsg\b[^}]*\} from "[^"]*i18n\/msg"/);
}

if (import.meta.main) {
  let changed = 0;
  for (const file of process.argv.slice(2)) {
    const before = readFileSync(file, "utf8"), after = mark(file, before);
    if (after !== before) (writeFileSync(file, after), changed++);
  }
  console.log(`${changed} files marked`);
}
