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
