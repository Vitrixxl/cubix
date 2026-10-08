import type { CaseDto, SetDto } from "../../shared/types";
import { language, t } from "../i18n";

/** A case's set and group, in the current language: "F2L · Free Pairs". */
export const caseContext = (c: Pick<CaseDto, "setLabel" | "group">) => `${t(c.setLabel)} · ${t(c.group)}`;

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
let caseWords = new WeakMap<object, string[]>(), wordsLanguage = "";
let lastQuery = "", queryWords = [""];
/** Lower case, accents dropped: "déconnectées" is found by "deconnectees". */
const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
function wordsOf(c: Pick<CaseDto, "id" | "name" | "setLabel" | "stage" | "group" | "subgroup">) {
  // The English words and the translated ones alike.
  const shown = [c.name, c.setLabel, c.stage, c.group].map((s) => s && t(s)),
    text = plain([c.id, c.name, c.setLabel, c.stage, c.group, c.subgroup, ...shown].join(" ")),
    words = [...new Set([...text.split(/\s+/), ...text.split(/[^a-z0-9]+/)])];
  caseWords.set(c, words);
  return words;
}
/** Whether every word typed starts a word of the case, so "g perm" finds the G perms and not every case with a "g" somewhere. */
export function matches(c: Pick<CaseDto, "id" | "name" | "setLabel" | "stage" | "group" | "subgroup">, q: string) {
  if (wordsLanguage !== language()) (caseWords = new WeakMap(), (wordsLanguage = language()));
  const words = caseWords.get(c) ?? wordsOf(c);
  if (q !== lastQuery) queryWords = plain(lastQuery = q).split(/\s+/);
  return queryWords.every(word => words.some(w => w.startsWith(word)));
}
