/**
 * One button system: components/ui/button.tsx (and toggle.tsx) own every button's shape — height, padding, font size,
 * radius, icon size. Callers pick a variant (colour) and at most the compact size, never a shape of their own; and no
 * screen draws a filled button by hand. This test reads the renderer's sources and fails on any shape override.
 */
import {expect, test} from 'bun:test';
import {readdirSync, readFileSync} from 'node:fs';
import {join, relative} from 'node:path';

const ROOT = join(import.meta.dir, '../renderer');
/** The primitives themselves define the shapes. */
const SKIP = ['components/ui/'];
/** The button components: shadcn's, the app's wrappers, and every *Button / *Toggle built on them. */
const BUTTON = /^(?:\w*Buttons?|\w*Toggles?|ToggleGroupItem)$/;
/** Components named like buttons that are not buttons (rows, menus, layout). */
const NOT_BUTTONS = new Set(['SidebarMenuButton', 'SidebarMenuSubButton', 'DropdownMenuTrigger', 'AlertDialogAction', 'AlertDialogCancel']);
/** Toggle items that are not buttons to the eye, allowed their own shape, as [file, a piece of the tag], each for a reason. */
const SHAPE_EXCEPTIONS: [string, string][] = [
  // The guide's pages, a list down the help dialog: rows that wrap their title, not buttons.
  ['overlays.tsx', 'data-action={"guidePage:" + id}'],
  // The scanner's colour swatches: squares of the sticker's colour, ringed when picked.
  ['CubeScan.tsx', 'data-action={"scan:brush:" + face}'],
];
/** Classes that change a button's shape: height, padding, radius, font size, gaps, icon size. */
const SHAPE = /^(?:h|min-h|max-h|size|p|px|py|pl|pr|pt|pb|ps|pe|gap|gap-x|gap-y|leading)-|^rounded(?:-|$)|^text-(?:xs|sm|base|lg|\d*xl|\[[\d.]+(?:px|rem|em)\])$/;
/** A solid button fill, which only the Button component may paint. */
const FILL = /^bg-(?:primary|destructive|success|warning)$/;
/** Hand-made elements allowed a solid fill, as [file, a piece of the tag], each for a reason. */
const FILL_EXCEPTIONS: [string, string][] = [
  // A card offering an action (icon, title, line, key): a tile, not a button; the expected one is filled.
  ['base.tsx', 'flex min-w-0 items-center gap-3 rounded-xl px-4 py-3'],
  // A cell of the cross-target grid (target x moves), a radio: the chosen cell filled like a calendar's day.
  ['setup.tsx', 'role="radio"'],
];

function files(dir: string): string[] {
  return readdirSync(dir, {withFileTypes: true}).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return files(path);
    return /\.tsx?$/.test(e.name) ? [path] : [];
  });
}

/** The end of a balanced span starting at `open` (one of `{`, `(`), skipping strings. */
function balanced(src: string, from: number): number {
  const close: Record<string, string> = {'{': '}', '(': ')', '[': ']'};
  const stack: string[] = [];
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
      continue;
    }
    if (close[c]) stack.push(close[c]);
    else if (c === stack[stack.length - 1]) {
      stack.pop();
      if (!stack.length) return i;
    }
  }
  return src.length;
}

/** The end of a JSX opening tag starting at `<`. */
function tagEnd(src: string, from: number): number {
  for (let i = from + 1; i < src.length; i++) {
    const c = src[i];
    if (c === '{') i = balanced(src, i);
    else if (c === '"' || c === "'") for (i++; i < src.length && src[i] !== c; i++);
    else if (c === '>') return i;
  }
  return src.length;
}

/** The class tokens written as string literals in a piece of code. */
function tokens(code: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)) out.push(...(m[1] ?? m[2] ?? m[3]).replace(/\$\{[^}]*\}/g, ' ').split(/\s+/));
  return out.filter(Boolean);
}

/** The base utility of a token, without its variants (`sm:`, `aria-pressed:`, `[&_svg]:`), `!` or `-`. */
const utility = (token: string) => token.replace(/\[[^\]]*\]:/g, '').split(':').pop()!.replace(/^!?-?/, '');

/** The value of the className attribute in a JSX opening tag. */
function classAttr(tag: string): string {
  const at = tag.search(/\bclassName=/);
  if (at < 0) return '';
  const start = at + 'className='.length;
  if (tag[start] === '"') return tag.slice(start, tag.indexOf('"', start + 1) + 1);
  return tag.slice(start, balanced(tag, start) + 1);
}

/** The class constants of the renderer (`const SOLVE_ACTION = "..."`), by name: a className naming one gets its classes. */
const constants = new Map<string, string[]>();
for (const path of files(ROOT))
  for (const m of readFileSync(path, 'utf8').matchAll(/\bconst ([A-Z][A-Z0-9_]+) = /g)) {
    const src = readFileSync(path, 'utf8'), from = m.index! + m[0].length;
    const end = src.slice(from).search(/;\n|,\n\s*[A-Za-z]/);
    constants.set(m[1], [...(constants.get(m[1]) ?? []), ...tokens(src.slice(from, from + (end < 0 ? 200 : end)))]);
  }
/** The classes of a className: its strings, and those of the constants it names. */
const classes = (cls: string) => [...tokens(cls), ...[...cls.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '').matchAll(/\b[A-Z][A-Z0-9_]+\b/g)].flatMap((m) => constants.get(m[0]) ?? [])];

const shape: string[] = [];
const fills: string[] = [];
for (const path of files(ROOT)) {
  const name = relative(ROOT, path);
  if (SKIP.some((s) => name.startsWith(s))) continue;
  const src = readFileSync(path, 'utf8');
  const line = (i: number) => src.slice(0, i).split('\n').length;
  for (const m of src.matchAll(/<([A-Za-z]\w*)\b/g)) {
    const tag = src.slice(m.index!, tagEnd(src, m.index!) + 1);
    const cls = classAttr(tag);
    if (BUTTON.test(m[1]) && !NOT_BUTTONS.has(m[1])) {
      if (SHAPE_EXCEPTIONS.some(([file, piece]) => name === file && tag.includes(piece))) continue;
      const bad = classes(cls).filter((t) => SHAPE.test(utility(t)));
      if (bad.length) shape.push(`${name}:${line(m.index!)} <${m[1]}> ${bad.join(' ')}`);
    } else if (cls.includes('buttonVariants(')) {
      const bad = classes(cls).filter((t) => SHAPE.test(utility(t)));
      if (bad.length) shape.push(`${name}:${line(m.index!)} <${m[1]}> buttonVariants ${bad.join(' ')}`);
    } else if (m[1] === 'button' || m[1] === 'a' || m[1] === 'Link') {
      if (classes(cls).some((t) => !/(?:^|:)(?:after|before):/.test(t) && FILL.test(utility(t))) && !FILL_EXCEPTIONS.some(([file, piece]) => name === file && tag.includes(piece))) {
        fills.push(`${name}:${line(m.index!)} <${m[1]}> drawn by hand with a button fill`);
      }
    }
  }
  for (const m of src.matchAll(/\bbuttonVariants\(/g)) {
    const end = balanced(src, m.index! + 'buttonVariants'.length);
    const bad = tokens(src.slice(m.index!, end)).filter((t) => SHAPE.test(utility(t)));
    if (bad.length) shape.push(`${name}:${line(m.index!)} buttonVariants() ${bad.join(' ')}`);
  }
}

test('no button gets a shape of its own: height, padding, radius and font size come from the component', () => {
  expect(shape).toEqual([]);
});

test('no screen draws a filled button by hand', () => {
  expect(fills).toEqual([]);
});
