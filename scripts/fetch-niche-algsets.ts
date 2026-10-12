/**
 * Download SpeedCubeDB's big-cube (4×4 parities, 5×5 and 6×6 L2C/L2E), Square-1, Pyraminx, Skewb and Megaminx pages
 * into data/raw/speedcubedb_niche.json, in the format of speedcubedb_algsets.json. Only move sequences and names are kept.
 *
 * Usage: bun scripts/fetch-niche-algsets.ts   then   bun run build:catalog
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const PAGES = [
  "4x4/OLLParity", "4x4/PLLParity", "5x5/L2C", "5x5/L2E", "6x6/6x6L2C", "6x6/6x6L2E",
  "SQ1/SQ1CS", "SQ1/SQ1CO", "SQ1/SQ1EO", "SQ1/SQ1CP", "SQ1/SQ1EP", "SQ1/SQ1Parity",
  "Pyraminx/L4E", "Skewb/SarahsAdvanced",
  "Megaminx/MegaminxEO", "Megaminx/MegaminxCO", "Megaminx/MegaminxEP", "Megaminx/MegaminxCP",
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
    alts: block.split(/<li class=['"]list-group-item['"]/).slice(1).map(li => ({
      alg: text(/class="formatted-alg">([\s\S]*?)<\/div>/.exec(li)?.[1] ?? ""),
      votes: Number(/fa-thumbs-up[^>]*><\/i>\s*(-?\d+)/.exec(li)?.[1] ?? 0),
    })).filter(a => a.alg),
  });
  console.log(`${page}: ${blocks.length}`);
}
writeFileSync(join(import.meta.dirname, "..", "data", "raw", "speedcubedb_niche.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`-> data/raw/speedcubedb_niche.json: ${out.length} cases`);
