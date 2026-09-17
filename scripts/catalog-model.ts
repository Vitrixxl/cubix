/**
 * Assemble the single shared catalogue (`data/catalog.json`) from the curated inputs in `data/`.
 * Every client (Rust API, desktop, mobile, tests) reads the generated file and never merges sources itself.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AlgEntry, CaseDto, SetDto, Stage } from "../src/shared/types";

const root = resolve(import.meta.dir, "..");
const read = <T>(file: string): T => JSON.parse(readFileSync(resolve(root, "data", file), "utf8")) as T;

export interface Catalog { generated: string; sets: SetDto[]; cases: CaseDto[]; puzzles: unknown; moves: unknown }

// A reduced big cube behaves like a 3×3. Wide turns move every layer except
// the opposite outer face; M/E/S already represent the entire inner block.
export const reducedAlg = (alg: string, size: number) => alg.replace(/\b([UDFBRL])w|[udfbrl]/g, token => `${size - 1}${token[0].toUpperCase()}w`);

export function buildCatalog(generated = new Date().toISOString().slice(0, 10)): Catalog {
  const metadata = read<{ id: string; label: string; stage: Stage; description: string }[]>("catalog-sets.json");
  const sets: SetDto[] = [], cases: CaseDto[] = [];
  for (const meta of metadata) {
    const doc = read<{ cases: (Omit<CaseDto, "algorithms"> & { algorithms: (AlgEntry & { verified?: boolean })[] })[] }>(`${meta.id}.json`);
    const set: SetDto = { ...meta, count: doc.cases.length };
    sets.push(set);
    for (const c of doc.cases) cases.push({
      id: c.id, name: c.name, stage: set.stage, set: set.id, setLabel: set.label, group: c.group,
      ...(c.subgroup ? { subgroup: c.subgroup } : {}), ...(c.probability ? { probability: c.probability } : {}),
      setup: c.setup, setups_alt: c.setups_alt ?? [],
      algorithms: c.algorithms.map(({ verified, ...alg }) => alg),
    });
  }
  const baseSets = [...sets], baseCases = [...cases];
  for (const file of ["multi-cube.json", "niche-catalog.json"]) {
    const extra = read<{ sets: SetDto[]; cases: CaseDto[] }>(file);
    sets.push(...extra.sets); cases.push(...extra.cases);
  }
  for (const size of [4, 5, 6, 7] as const) {
    for (const set of baseSets) sets.push({ ...set, cube_size: size, id: `${size}x${size}-${set.id}`, description: `After centers and edges are reduced: ${set.description}` });
    for (const c of baseCases) cases.push({ ...c, cube_size: size, id: `${size}x${size} ${c.id}`, set: `${size}x${size}-${c.set}`,
      setup: reducedAlg(c.setup, size), setups_alt: c.setups_alt.map(a => reducedAlg(a, size)),
      algorithms: c.algorithms.map(a => ({ ...a, alg: reducedAlg(a.alg, size), ...(a.gen ? { gen: reducedAlg(a.gen, size) } : {}) })),
    });
  }
  const ids = new Set<string>();
  for (const c of cases) { if (ids.has(c.id)) throw Error(`Duplicate case id: ${c.id}`); ids.add(c.id); }
  for (const s of sets) { const n = cases.filter(c => c.set === s.id).length; if (n !== s.count) throw Error(`Set ${s.id} declares ${s.count} cases but has ${n}`); }
  return { generated, sets, cases, puzzles: read("puzzles.json"), moves: read("moves.json") };
}
