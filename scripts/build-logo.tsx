/**
 * Draw the app logo, the 3×3 mark of the app (desktop/renderer/logo.tsx `puzzleMark`): nine rounded stickers, the top
 * right one in the default theme's pink. Rasterise the mobile icons from it (needs rsvg-convert).
 */
import { $ } from "bun";
import { puzzleMark } from "../desktop/renderer/logo";
import { buildTheme, DEFAULT_THEME } from "../src/client/lib/theme";

const PINK = buildTheme(DEFAULT_THEME, "dark").accent, STICKER = "#e5e5e5", GROUND = "#0b0b0e";
const mark = puzzleMark("333");
// The mark `size` wide, centred on (cx, cy).
const markAt = (cx: number, cy: number, size: number) => `<svg x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" viewBox="0 0 ${mark.box} ${mark.box}">
    ${mark.parts.map(part => {
      if (!("rect" in part)) throw new Error("the 3×3 mark is made of rounded squares");
      const [x, y, width, height, rx] = part.rect.map(v => +v!.toFixed(3));
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="${part.accent ? PINK : STICKER}"/>`;
    }).join("\n    ")}
  </svg>`;

// Launcher icon: the mark on a rounded dark slab.
const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1c1c24"/>
      <stop offset="1" stop-color="${GROUND}"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="28" fill="url(#bg)"/>
  ${markAt(64, 64, 72)}
</svg>
`;
// Android adaptive foreground and splash: the mark alone, its corners inside the 66/108 safe circle of a 192-unit layer.
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width="1024" height="1024">
  ${markAt(96, 96, 78)}
</svg>
`;
await Bun.write("assets/cubix.svg", logo);
await Bun.write("mobile/assets/adaptive-foreground.svg", foreground);
const raster = (svg: string, out: string, size: number) => $`rsvg-convert -w ${size} -h ${size} ${svg} -o ${out}`;
await raster("assets/cubix.svg", "mobile/assets/icon.png", 1024);
await raster("assets/cubix.svg", "mobile/assets/favicon.png", 48);
await raster("mobile/assets/adaptive-foreground.svg", "mobile/assets/android-icon-foreground.png", 1024);
await raster("mobile/assets/adaptive-foreground.svg", "mobile/assets/splash-icon.png", 1024);
console.log("Logo and icons written");
