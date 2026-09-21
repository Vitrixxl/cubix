import type { CaseDto, SetDto } from "../../shared/types";

/** Stable catalog ordering, shared by native lists and desktop grids. */
export function groupCases<C extends Pick<CaseDto, "group">>(cases: readonly C[]): Map<string, C[]> {
  const groups = new Map<string, C[]>();
  for (const c of cases) {
    const group = groups.get(c.group);
    if (group) group.push(c);
    else groups.set(c.group, [c]);
  }
  return groups;
}

export function catalogSections<C extends Pick<CaseDto, "id" | "set" | "group">, S extends Pick<SetDto, "id" | "stage">>(
  cases: readonly C[], sets: readonly S[], preferred: Readonly<Record<string, string>>,
  learned: ReadonlySet<string>, filter: string,
) {
  const bySet = new Map<string, C[]>();
  for (const c of cases) {
    const list = bySet.get(c.set);
    if (list) list.push(c); else bySet.set(c.set, [c]);
  }
  return [...new Set(sets.map(set => set.stage))].map(stage => {
    const variants = sets.filter(set => set.stage === stage);
    const active = variants.find(set => set.id === preferred[stage]) ?? variants[0];
    const all = bySet.get(active.id) ?? [];
    const learnedCount = all.filter(c => learned.has(c.id)).length;
    const visible = all.filter(c => filter === "all" || (filter === "learned") === learned.has(c.id));
    return { stage, variants, active, all, learnedCount, groups: [...groupCases(visible)] };
  });
}

/** Toggle a whole group without mutating the caller's selection. */
export function toggleSelection(selected: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  const next = new Set(selected);
  const all = ids.every(id => selected.has(id));
  for (const id of ids) { if (all) next.delete(id); else next.add(id); }
  return next;
}
