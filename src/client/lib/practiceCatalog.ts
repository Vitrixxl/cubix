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

/** The words of each case a search reads, worked out once; and the words of the last query. */
const caseWords = new WeakMap<object, string[]>();
let lastQuery = "", queryWords = [""];
function wordsOf(c: Pick<CaseDto, "id" | "name" | "setLabel" | "stage" | "group" | "subgroup">) {
  const text = [c.id, c.name, c.setLabel, c.stage, c.group, c.subgroup].join(" ").toLowerCase(),
    words = [...new Set([...text.split(/\s+/), ...text.split(/[^a-z0-9]+/)])];
  caseWords.set(c, words);
  return words;
}
/** Whether every word typed starts a word of the case, so "g perm" finds the G perms and not every case with a "g" somewhere. */
export function matches(c: Pick<CaseDto, "id" | "name" | "setLabel" | "stage" | "group" | "subgroup">, q: string) {
  const words = caseWords.get(c) ?? wordsOf(c);
  if (q !== lastQuery) queryWords = (lastQuery = q).toLowerCase().split(/\s+/);
  return queryWords.every(word => words.some(w => w.startsWith(word)));
}
