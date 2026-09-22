/**
 * Rasterise the pre-rendered case diagrams of the non-cube puzzles (`assets/cases/*.svg`, from
 * build-niche-catalog.ts) into palette PNGs next to them. The mobile app shows the bitmaps: a clock or
 * megaminx SVG holds a few hundred elements, each a native view in react-native-svg, while a PNG is
 * one image node that Android decodes off the JavaScript thread. The longest side covers the largest
 * on-screen size (150 pt) at 3× density.
 */
import sharp from "sharp";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CASE_IMAGE_SIZE = 480;
const dir = resolve(import.meta.dirname, "../assets/cases");
const files = (await readdir(dir)).filter(name => name.endsWith(".svg")).sort();
let bytes = 0;
for (const name of files) {
  const svg = await readFile(resolve(dir, name));
  const { width = 1, height = 1 } = await sharp(svg).metadata();
  const png = await sharp(svg, { density: 72 * CASE_IMAGE_SIZE / Math.max(width, height) })
    .resize(width >= height ? { width: CASE_IMAGE_SIZE } : { height: CASE_IMAGE_SIZE })
    .png({ palette: true, quality: 90, compressionLevel: 9 }).toBuffer();
  await writeFile(resolve(dir, name.replace(/\.svg$/, ".png")), png);
  bytes += png.byteLength;
}
console.log(`Rasterised ${files.length} case diagrams (${(bytes / 1024).toFixed(0)} KB) in ${dir}`);
