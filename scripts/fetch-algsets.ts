/**
 * Download SpeedCubeDB's COLL, CMLL, WV, SV, VLS, CLS, OLLCP, ELL, Roux EO, CLL, EG-1 and EG-2 pages into
 * data/raw/speedcubedb_algsets.json (same entry format as speedcubedb_zbll.json, plus the page it came from), and the
 * sets SpeedCubeDB does not have into data/raw/algsets_other.json, each entry with the page it came from: ZBLS (the
 * community ZBLS sheet by Chad Batten and Tao Yu, as transcribed in @moishy/algsets), TTLL (the ZZ-CT TTLL sheet),
 * TCLL+ and TCLL− (SpeedCubeTrainer, plus Chris Olson's algorithms) and LEG-1 (Chris Olson). Only move sequences and
 * case names are kept.
 *
 * Usage: bun scripts/fetch-algsets.ts [page…]   then   bun run build:catalog
 * Given pages (e.g. 3x3/SV), only those SpeedCubeDB pages are fetched again, the others kept as they are; "other" fetches
 * the other sources again.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PAGES = [
  "3x3/COLL", "3x3/CMLL", "3x3/WV", "3x3/SV", "3x3/CLS", "3x3/ELL", "3x3/EO4A",
  ...["UB", "UF", "UL", "UBUL", "UFUB", "UFUL", "NE"].map(s => `3x3/VLS${s}`),
  ...Array.from({ length: 57 }, (_, i) => `3x3/OLLCP${i + 1}`),
  "2x2/CLL", "2x2/EG1", "2x2/EG2",
];
const text = (html: string) => html.replace(/<[^>]*>/g, "").replace(/&#0?39;/g, "'").replace(/&rsquo;|&#8217;|’/g, "'").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const attr = (html: string, name: string) => new RegExp(`${name}=["']([^"']*)["']`).exec(html)?.[1];
const get = async (url: string) => {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw Error(`${url}: HTTP ${res.status}`);
  return res.text();
};
interface Entry { page: string; name: string; subgroup: string; setup?: string; source?: string; alts: { alg: string; votes: number }[] }
const raw = (file: string) => join(import.meta.dirname, "..", "data", "raw", file);

const args = process.argv.slice(2), only = args.filter(a => a !== "other"), file = raw("speedcubedb_algsets.json");
const out: Entry[] = args.length && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).filter((e: Entry) => !only.includes(e.page)) : [];
for (const page of args.length ? only : PAGES) {
  const blocks = (await get(`https://speedcubedb.com/a/${page}`)).split(/<div class="row singlealgorithm[^"]*"/).slice(1);
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
out.sort((a, b) => PAGES.indexOf(a.page) - PAGES.indexOf(b.page));
writeFileSync(file, JSON.stringify(out, null, 1) + "\n");
console.log(`-> data/raw/speedcubedb_algsets.json: ${out.length} cases`);
if (args.length && !args.includes("other")) process.exit(0);

// ---- The other sources: each algorithm as written there, its case's name and group. ----
const other: Entry[] = [];
const algs = (...list: string[]) => list.map(alg => ({ alg: alg.trim(), votes: 0 })).filter(a => a.alg);

// ZBLS: 41 F2L cases × the orientations of the top edges, front-right slot.
const ZBLS = "https://jsr.io/@moishy/algsets/0.3.3/src/zbls/index.ts";
for (const m of (await get(ZBLS)).matchAll(/id: "f2l-(\d+)-(\d+)",\s*subset: "([^"]+)",\s*algs: \[([^\]]*)\]/g))
  other.push({ page: "zbls", source: ZBLS, name: `ZBLS ${m[1]}.${m[2]}`, subgroup: m[3], alts: algs(...[...m[4].matchAll(/"([^"]*)"/g)].map(s => s[1])) });

// TTLL: a CSV of two cases a row, "T1 Ja,,alg,T2 Ra,,alg", under the headings of the groups.
const TTLL = "https://docs.google.com/spreadsheets/d/1QA9o1lW02AqV6XaMAPPGT24tz1P4vwsiVYyu045SexQ/export?format=csv";
/** The rows of a CSV, its quoted cells kept whole. */
const csv = (data: string) => [...data.matchAll(/(?:^|\n)((?:"[^"]*"|[^\n])*)/g)].map(r => [...r[1].matchAll(/("[^"]*"|[^,]*)(?:,|$)/g)].map(c => c[1].replace(/^"|"$/g, "").trim()));
let group = "";
for (const cells of csv(await get(TTLL))) {
  if (cells[0] && !cells.slice(1).some(Boolean)) { group = cells[0]; continue; }
  for (const k of [0, 3]) if (/^T\d+/.test(cells[k] ?? ""))
    other.push({ page: "ttll", source: TTLL.replace(/\/export.*/, ""), name: cells[k].replace(/\s+/g, " "), subgroup: group, alts: algs(...cells[k + 2].split("\n")) });
}

// TCLL: SpeedCubeTrainer names the 43 cases of each and gives an algorithm each; Chris Olson's pages give more, unnamed.
for (const sign of ["+", "-"]) {
  const url = `https://redblaze908.github.io/SpeedCubeTrainer/2x2/TCLL/TCLL${sign}/tcll${sign}.html`;
  const lines = (await get(url)).replace(/<[^>]*>/g, "\n").split("\n").map(text).filter(Boolean);
  let group = "";
  for (let i = 0; i < lines.length; i++) {
    if (lines[i + 1] === "Algorithms") {
      const name = /^U \d$/.test(lines[i]) ? `Pinwheel ${lines[i].slice(2)}` : lines[i].replace("SpaceShip", "Spaceship");
      group = name.replace(/ \d+$/, "");
      const list: string[] = [];
      for (let j = i + 2; /^\d+\)/.test(lines[j] ?? ""); j++) list.push(lines[j].replace(/^\d+\)\s*/, "").replace("(U/U')", "(U)"));
      other.push({ page: `2x2/TCLL${sign}`, source: url, name: `TCLL${sign} ${name}`, subgroup: group, alts: algs(...list) });
    }
  }
}
/** Chris Olson's pages: each picture of a case, then its algorithms, one a paragraph or a line. */
async function olson(path: string) {
  const html = await get(`https://cyotheking.squarespace.com/${path}`), cases: { name: string; algs: string[] }[] = [];
  for (const m of html.matchAll(/data-image="[^"]*\/([^"/]+?)\.(?:gif|png|jpe?g)"|<p[^>]*>([\s\S]*?)<\/p>/g)) {
    if (m[1]) { const name = decodeURIComponent(m[1]).replace(/\+/g, " "); if (cases.at(-1)?.name !== name) cases.push({ name, algs: [] }); continue; }
    for (const line of m[2].split(/<br\s*\/?>/)) {
      const alg = text(line);
      if (cases.length && /^[(]?[RUFLDBxyzMrufl][RUFLDBxyzMrufl2' ()]*$/.test(alg) && alg.split(" ").length > 2) cases.at(-1)!.algs.push(alg);
    }
  }
  return { url: `https://cyotheking.squarespace.com/${path}`, cases: cases.filter(c => c.algs.length) };
}
for (const [path, sign] of [["tcll", "+"], ["tcll-1", "-"]]) {
  const { url, cases } = await olson(path);
  for (const c of cases) other.push({ page: `2x2/TCLL${sign} pool`, source: url, name: c.name, subgroup: "", alts: algs(...c.algs) });
}
const leg = await olson("leg1");
for (const c of leg.cases) {
  const name = c.name.replace(/^(\w)/, s => s.toUpperCase()).replace(/^(\D+?)\s*(\d+)$/, "$1 $2");
  other.push({ page: "2x2/LEG1", source: leg.url, name, subgroup: name.replace(/ \d+$/, ""), alts: algs(...c.algs) });
}

writeFileSync(raw("algsets_other.json"), JSON.stringify(other, null, 1) + "\n");
const count = (page: string) => other.filter(e => e.page === page).length;
console.log(`-> data/raw/algsets_other.json: ${[...new Set(other.map(e => e.page))].map(p => `${p} ${count(p)}`).join(", ")}`);
