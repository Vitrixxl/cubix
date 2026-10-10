/**
 * Download SpeedCubeDB's COLL, CMLL, WV, VLS, OLLCP, CLL, EG-1 and EG-2 pages into data/raw/speedcubedb_algsets.json
 * (same entry format as speedcubedb_zbll.json, plus the page it came from). Only move sequences and case names are kept.
 *
 * Usage: bun scripts/fetch-algsets.ts   then   bun run build:catalog
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const PAGES = [
  "3x3/COLL", "3x3/CMLL", "3x3/WV",
  ...["UB", "UF", "UL", "UBUL", "UFUB", "UFUL", "NE"].map(s => `3x3/VLS${s}`),
  ...Array.from({ length: 57 }, (_, i) => `3x3/OLLCP${i + 1}`),
  "2x2/CLL", "2x2/EG1", "2x2/EG2",
];
const text = (html: string) => html.replace(/<[^>]*>/g, "").replace(/&#0?39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const attr = (html: string, name: string) => new RegExp(`${name}=["']([^"']*)["']`).exec(html)?.[1];

const out: unknown[] = [];
for (const page of PAGES) {
  const res = await fetch(`https://speedcubedb.com/a/${page}`, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw Error(`${page}: HTTP ${res.status}`);
  const blocks = (await res.text()).split(/<div class="row singlealgorithm[^"]*"/).slice(1);
  if (!blocks.length) throw Error(`${page}: no case found, the page changed`);
  for (const block of blocks) out.push({
    page,
    name: attr(block, "data-alg")!,
    subgroup: attr(block, "data-subgroup")?.trim() ?? "",
    setup: text(/class="setup-case[^"]*">([\s\S]*?)<\/div>\s*<\/div>/.exec(block)?.[1] ?? "").replace(/^setup:\s*/, ""),
    alts: block.split(/<li class=['"]list-group-item['"]/).slice(1).map(li => ({
      alg: text(/class="formatted-alg">([\s\S]*?)<\/div>/.exec(li)![1]),
      votes: Number(/fa-thumbs-up[^>]*><\/i>\s*(-?\d+)/.exec(li)?.[1] ?? 0),
    })),
  });
  console.log(`${page}: ${blocks.length}`);
}
writeFileSync(join(import.meta.dirname, "..", "data", "raw", "speedcubedb_algsets.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`-> data/raw/speedcubedb_algsets.json: ${out.length} cases`);
