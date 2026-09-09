import multi from "../../../data/multi-cube.json";
import niche from "../../../data/niche-catalog.json";
import metadata from "../../../rust-api/catalog-sets.json";
import f2l from "../../../data/f2l.json";
import advanced from "../../../data/f2l-advanced.json";
import expert from "../../../data/f2l-expert.json";
import twoOll from "../../../data/2look-oll.json";
import oll from "../../../data/oll.json";
import twoPll from "../../../data/2look-pll.json";
import pll from "../../../data/pll.json";
import type { CaseDto, SetDto } from "../../shared/types";

const sources = [f2l, advanced, expert, twoOll, oll, twoPll, pll];
export const sets = metadata.map((set, i) => ({ ...set, count: sources[i].cases.length })) as SetDto[];
export const cases: CaseDto[] = sets.flatMap((set, i) => sources[i].cases.map((entry) => {
  const c = entry as unknown as CaseDto;
  return { id: c.id, name: c.name, stage: set.stage, set: set.id, setLabel: set.label,
    group: c.group, ...(c.subgroup ? { subgroup: c.subgroup } : {}), ...(c.probability ? { probability: c.probability } : {}),
    setup: c.setup, setups_alt: c.setups_alt ?? [],
    algorithms: c.algorithms.map(alg => { const { verified, ...value } = alg as typeof alg & { verified?: boolean }; return value; }),
  };
}));

// A reduced big cube behaves like a 3×3. Wide turns move every layer except
// the opposite outer face; M/E/S already represent the entire inner block.
const reducedAlg = (alg: string, size: number) => alg.replace(/\b([UDFBRL])w|[udfbrl]/g, token => `${size - 1}${token[0].toUpperCase()}w`);
const baseSets = [...sets], baseCases = [...cases];
sets.push(...multi.sets as SetDto[]);
cases.push(...multi.cases as CaseDto[]);
sets.push(...niche.sets as SetDto[]);
cases.push(...niche.cases as CaseDto[]);
for (const size of [4, 5, 6, 7] as const) {
  for (const set of baseSets) sets.push({ ...set, cube_size: size, id: `${size}x${size}-${set.id}`, description: `After centers and edges are reduced: ${set.description}` });
  for (const c of baseCases) cases.push({ ...c, cube_size: size, id: `${size}x${size} ${c.id}`, set: `${size}x${size}-${c.set}`,
    setup: reducedAlg(c.setup, size), setups_alt: c.setups_alt.map(a => reducedAlg(a, size)),
    algorithms: c.algorithms.map(a => ({ ...a, alg: reducedAlg(a.alg, size), ...(a.gen ? {gen: reducedAlg(a.gen, size)} : {}) })),
  });
}
