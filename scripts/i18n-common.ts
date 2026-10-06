/** What the i18n scripts share: the attributes people read, and how a file gets its edits and its import. */
import * as ts from "typescript";
import { dirname, relative } from "node:path";

/** JSX attributes whose text is read or heard. */
export const READ = new Set(["title", "label", "placeholder", "aria-label", "tip", "sub", "meta", "description", "detail", "empty", "heading", "hint", "notice", "alt", "more", "text", "message", "confirm"]);
export const words = (s: string) => /[A-Za-z]{2}/.test(s);
export const quote = (s: string) => JSON.stringify(s);
export type Edit = { start: number; end: number; text: string };

/** `${a} solves` as a translation call: `call("{0} solves", { 0: a })`. */
export function templateCall(call: string, node: ts.TemplateExpression) {
  let key = node.head.text;
  const values = node.templateSpans.map((span, i) => {
    key += `{${i}}` + span.literal.text;
    return `${i}: ${span.expression.getText()}`;
  });
  return `${call}(${quote(key)}, { ${values.join(", ")} })`;
}

/**
 * `source` with its edits made (from the end, so positions hold), and `name` imported from `module` (a path from the
 * repository's root) after the last import unless `present` finds it there already.
 */
export function applyEdits(file: string, source: string, edits: Edit[], name: string, module: string, present: RegExp) {
  let out = source;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  if (present.test(out)) return out;
  let path = relative(dirname(file), module);
  if (!path.startsWith(".")) path = "./" + path;
  const imports = [...out.matchAll(/^import [^;]*;$/gms)];
  const at = imports.length ? imports.at(-1)!.index! + imports.at(-1)![0].length : 0;
  return out.slice(0, at) + `${at ? "\n" : ""}import { ${name} } from "${path}";${at ? "" : "\n"}` + out.slice(at);
}
