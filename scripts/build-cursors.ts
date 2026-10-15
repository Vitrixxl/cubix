/**
 * The mouse pointers of both web apps, taken from the Bibata Modern Classic cursor theme (Bibata Cursor by ful1e5,
 * GPL-3.0-or-later, https://github.com/ful1e5/Bibata_Cursor) as installed on Linux: each CSS cursor's Xcursor file
 * becomes a 24 px PNG and a 48 px one for dense screens in desktop/assets/cursors (copied to /assets/cursors by
 * desktop/web.ts), with cursors.css, which every page links: a `--cursor-<name>` property per cursor, its hotspot read
 * from the file, and the rules that use them.
 *
 *   bun scripts/build-cursors.ts [theme directory]
 */
import sharp from "sharp";
import { mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const theme = resolve(process.argv[2] ?? "/usr/share/icons/Bibata-Modern-Classic");
const out = resolve(import.meta.dirname, "../desktop/assets/cursors");
const SIZE = 24;
/** The CSS cursors the apps use, each read from the theme's file of the same name (the theme's own aliases). */
const CURSORS = ["default", "pointer", "text", "grab", "grabbing", "not-allowed", "progress", "wait", "help", "move", "copy", "crosshair",
  "ew-resize", "ns-resize", "col-resize", "row-resize", "nwse-resize", "nesw-resize", "e-resize", "w-resize", "zoom-in", "zoom-out"];

type Image = { size: number; width: number; height: number; x: number; y: number; pixels: Buffer };

/** Xcursor: "Xcur", header length, version, then a table of chunks (type, nominal size, offset); an image chunk holds its
 * width, height, hotspot and delay, then premultiplied ARGB pixels. Animated cursors list their frames in order. */
function images(file: Buffer): Image[] {
  if (file.toString("latin1", 0, 4) !== "Xcur") throw new Error("Not an Xcursor file");
  const found: Image[] = [];
  for (let i = 0, count = file.readUInt32LE(12); i < count; i++) {
    const entry = file.readUInt32LE(4) + i * 12;
    if (file.readUInt32LE(entry) !== 0xfffd0002) continue;
    const at = file.readUInt32LE(entry + 8), width = file.readUInt32LE(at + 16), height = file.readUInt32LE(at + 20);
    found.push({ size: file.readUInt32LE(at + 8), width, height, x: file.readUInt32LE(at + 24), y: file.readUInt32LE(at + 28), pixels: file.subarray(at + 36, at + 36 + width * height * 4) });
  }
  return found;
}

/** The first frame of the nominal size nearest `size`, scaled to it if the theme has none of that size. */
async function png(all: Image[], size: number) {
  const image = all.reduce((best, image) => Math.abs(image.size - size) < Math.abs(best.size - size) ? image : best);
  const rgba = Buffer.alloc(image.pixels.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const [b, g, r, a] = [image.pixels[i]!, image.pixels[i + 1]!, image.pixels[i + 2]!, image.pixels[i + 3]!];
    const un = (c: number) => a ? Math.min(255, Math.round(c * 255 / a)) : 0;
    rgba.set([un(r), un(g), un(b), a], i);
  }
  const scale = size / image.size, width = Math.round(image.width * scale), height = Math.round(image.height * scale);
  const bytes = await sharp(rgba, { raw: { width: image.width, height: image.height, channels: 4 } }).resize(width, height).png({ compressionLevel: 9 }).toBuffer();
  return { bytes, x: Math.round(image.x * scale), y: Math.round(image.y * scale) };
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const files = new Map<string, string>(), properties: string[] = [], dense: string[] = [];
for (const name of CURSORS) {
  // Several cursors are one image in the theme (col-resize and ew-resize…): written once.
  const source = await realpath(join(theme, "cursors", name));
  let file = files.get(source);
  const all = images(await readFile(source)), small = await png(all, SIZE);
  if (!file) {
    files.set(source, file = name);
    await writeFile(join(out, `${name}.png`), small.bytes);
    await writeFile(join(out, `${name}@2x.png`), (await png(all, SIZE * 2)).bytes);
  }
  const url = `/assets/cursors/${file}`;
  properties.push(`  --cursor-${name}: url("${url}.png") ${small.x} ${small.y}, ${name};`);
  dense.push(`    --cursor-${name}: image-set(url("${url}.png") 1x, url("${url}@2x.png") 2x) ${small.x} ${small.y}, ${name};`);
}

const pointer = ["a[href]", "button", "summary", "select", "label", "[role=button]", "[role=tab]", "[role=menuitem]", "[role=menuitemcheckbox]",
  "[role=menuitemradio]", "[role=option]", "[role=switch]", "[role=checkbox]", "[role=radio]", "input:is([type=button], [type=submit], [type=reset], [type=checkbox], [type=radio], [type=file], [type=color], [type=range])"];
await writeFile(join(out, "cursors.css"), `/* Written by scripts/build-cursors.ts: Bibata Modern Classic (Bibata Cursor by ful1e5, GPL-3.0-or-later, see LICENSE).
   A var() that fails falls back to nothing, not to an earlier declaration: the 2x images replace the plain ones only where
   the browser takes image-set() in a cursor, each value ending on the browser's own cursor of that name. */
@layer theme, base, components, utilities;

:root {
${properties.join("\n")}
}
@supports (cursor: image-set(url("/assets/cursors/default.png") 1x) 0 0, auto) {
  :root {
${dense.join("\n")}
  }
}

/* Without weight (:where), in order: a disabled control's cursor wins over a control's; any utility over all (the
   desktop app's Tailwind draws its cursor utilities with these pointers too: desktop/renderer/globals.css; the phone
   app's are overridden in desktop/web.ts). */
@layer base {
  :root {
    cursor: var(--cursor-default);
  }
  :where(${pointer.join(", ")}) {
    cursor: var(--cursor-pointer);
  }
  :where(textarea, [contenteditable]:not([contenteditable=false]), input:not([type=button], [type=submit], [type=reset], [type=checkbox], [type=radio], [type=file], [type=color], [type=range], [type=image], [type=hidden])) {
    cursor: var(--cursor-text);
  }
  :where(:disabled, [aria-disabled=true]) {
    cursor: var(--cursor-not-allowed);
  }
}
`);
await writeFile(join(out, "LICENSE"), `The cursor images in this directory (*.png) are taken from Bibata Modern Classic, part of Bibata Cursor
by Abdulkaiz Khatri (ful1e5), https://github.com/ful1e5/Bibata_Cursor, version 2.0.7, converted from its
Xcursor files to PNG by scripts/build-cursors.ts without other change.

Bibata Cursor is free software: you can redistribute it and/or modify it under the terms of the GNU General
Public License as published by the Free Software Foundation, either version 3 of the License, or (at your
option) any later version. It is distributed WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See https://www.gnu.org/licenses/gpl-3.0.html for the
full licence text.
`);
console.log(`Wrote ${files.size} cursors (${CURSORS.length} CSS names) to ${out}`);
