/**
 * Télécharge les 472 cas ZBLL de SpeedCubeDB (7 pages, une par forme de coins)
 * vers data/raw/speedcubedb_zbll.json, au même format que speedcubedb_pll.json.
 *
 * Usage : bun scripts/fetch-zbll.ts   puis   bun run build:db
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const SHAPES = ["T", "U", "L", "Pi", "H", "S", "AS"];
const text = (html: string) => html.replace(/<[^>]*>/g, "").replace(/&#0?39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const attr = (html: string, name: string) => new RegExp(`${name}=["']([^"']*)["']`).exec(html)?.[1];

const out: unknown[] = [];
for (const shape of SHAPES) {
  const res = await fetch(`https://speedcubedb.com/a/3x3/ZBLL${shape}`, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw Error(`ZBLL ${shape}: HTTP ${res.status}`);
  const blocks = (await res.text()).split(/<div class="row singlealgorithm[^"]*"/).slice(1);
  for (const block of blocks) {
    const stickers = Object.fromEntries(["us", "ub", "uf", "ul", "ur"].map(k => [k === "us" ? "U" : k[1].toUpperCase(), attr(block, `data-${k}`)]));
    const alts = block.split(/<li class=['"]list-group-item['"]/).slice(1).map(li => ({
      alg: text(/class="formatted-alg">([\s\S]*?)<\/div>/.exec(li)![1]),
      votes: Number(/fa-thumbs-up[^>]*><\/i>\s*(-?\d+)/.exec(li)?.[1] ?? 0),
      etm: Number(/(\d+) ETM/.exec(li)?.[1]) || null,
      stm: Number(/(\d+) STM/.exec(li)?.[1]) || null,
      gen: />(\d+GEN)</.exec(li)?.[1] ?? null,
      yt: /youtube\.com\/(?:embed\/|watch\?v=)([\w-]{11})/.exec(li)?.[1] ?? null,
    }));
    out.push({
      name: attr(block, "data-alg")!,
      shape,
      subgroup: attr(block, "data-subgroup")!.replace(/\s+/g, ""),
      setup: text(/class="setup-case[^"]*">([\s\S]*?)<\/div>\s*<\/div>/.exec(block)?.[1] ?? "").replace(/^setup:\s*/, ""),
      stickers,
      alts,
    });
  }
  console.log(`ZBLL ${shape}: ${blocks.length} cas`);
}
writeFileSync(join(import.meta.dirname, "..", "data", "raw", "speedcubedb_zbll.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`-> data/raw/speedcubedb_zbll.json: ${out.length} cas`);
