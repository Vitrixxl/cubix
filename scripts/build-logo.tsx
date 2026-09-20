/**
 * Draw the app logo, a solved 3×3 in the case-diagram style shown white side up with the MoYu wordmark on its
 * centre, and rasterise the mobile and desktop icons from it (needs rsvg-convert).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { $ } from "bun";
import { StaticCubeSvg } from "../src/client/diagrams/StaticCubeSvg";
import { solved } from "../src/shared/cube";
import { ISO_VIEWBOX } from "../src/shared/cubeDiagram";
import { FACE_COLORS } from "../src/shared/cubeAppearance";

// The diagrams pin yellow on top; the logo shows the cube as it sits on a table: white up, green front, red right.
const RECOLOUR: [string, string][] = [[FACE_COLORS.U, FACE_COLORS.D], [FACE_COLORS.F, FACE_COLORS.B]];
const MOYU_BLUE = "#2a52be";
// Traced from the sticker sold as the MoYu logo; laid flat on the U centre through the isometric projection of
// `shared/cubeDiagram` (x along the front edge, z from the back), reading towards the front-left face.
const wordmark = (await Bun.file("assets/moyu-wordmark.svg").text()).match(/<path[^>]*\/>/)![0].replace("currentColor", MOYU_BLUE);
const WORDMARK_VIEWBOX = "331 162 730 755", WORDMARK_SIZE = 0.72;
const wordmarkOnTop = `<g transform="matrix(17 9 -17 9 60 5)"><svg x="${1.5 - WORDMARK_SIZE / 2}" y="${1.5 - WORDMARK_SIZE / 2}" width="${WORDMARK_SIZE}" height="${WORDMARK_SIZE}" viewBox="${WORDMARK_VIEWBOX}" preserveAspectRatio="xMidYMid meet">${wordmark}</svg></g>`;

const [, , width, height] = ISO_VIEWBOX.split(" ").map(Number);
// The isometric cube, without the document wrapper, placed as a nested svg `size` wide and centred on (cx, cy).
const cubeAt = (cx: number, cy: number, size: number) => renderToStaticMarkup(createElement(StaticCubeSvg, { state: solved(3), view: "iso" }))
  .replace(/^<svg[^>]*>/, `<svg x="${cx - size / 2}" y="${cy - size * height / width / 2}" width="${size}" height="${size * height / width}" viewBox="${ISO_VIEWBOX}">`)
  .replace(/<title[^>]*>.*?<\/title>/, "")
  .replace(/#[0-9a-f]{6}/g, hex => RECOLOUR.find(([from]) => from === hex)?.[1] ?? hex)
  .replace(/<\/svg>$/, `${wordmarkOnTop}</svg>`);

// Launcher icon: the cube on a rounded dark slab.
const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1c1c24"/>
      <stop offset="1" stop-color="#0b0b0e"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="28" fill="url(#bg)"/>
  ${cubeAt(64, 64, 112)}
</svg>
`;
// Android adaptive foreground and splash: the cube alone, inside the 66/108 safe circle of a 192-unit layer.
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width="1024" height="1024">
  ${cubeAt(96, 96, 108)}
</svg>
`;
await Bun.write("assets/cubix.svg", logo);
await Bun.write("mobile/assets/adaptive-foreground.svg", foreground);
const raster = (svg: string, out: string, size: number) => $`rsvg-convert -w ${size} -h ${size} ${svg} -o ${out}`;
await raster("assets/cubix.svg", "mobile/assets/icon.png", 1024);
await raster("assets/cubix.svg", "mobile/assets/favicon.png", 48);
await raster("assets/cubix.svg", "desktop/linux/fr.vitrixxl.cubix.png", 512);
await raster("mobile/assets/adaptive-foreground.svg", "mobile/assets/android-icon-foreground.png", 1024);
await raster("mobile/assets/adaptive-foreground.svg", "mobile/assets/splash-icon.png", 1024);
console.log("Logo and icons written");
