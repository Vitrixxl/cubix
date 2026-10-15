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
  const bySet = groupBySet(cases);
  return [...new Set(sets.map(set => set.stage))].map(stage => {
    const variants = sets.filter(set => set.stage === stage);
    const active = variants.find(set => set.id === preferred[stage]) ?? variants[0];
    const all = bySet.get(active.id) ?? [];
    const learnedCount = all.filter(c => learned.has(c.id)).length;
    const visible = all.filter(c => filter === "all" || (filter === "learned") === learned.has(c.id));
    return { stage, variants, active, all, learnedCount, groups: [...groupCases(visible)] };
  });
}

/** Cases by their set, each set's in the order given. */
export function groupBySet<C extends Pick<CaseDto, "set">>(cases: readonly C[]): Map<string, C[]> {
  const bySet = new Map<string, C[]>();
  for (const c of cases) {
    const list = bySet.get(c.set);
    if (list) list.push(c); else bySet.set(c.set, [c]);
  }
  return bySet;
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
type Searched = Pick<CaseDto, "id" | "name" | "setLabel" | "stage" | "group" | "subgroup"> & { algorithms?: readonly { alg: string }[] };
/** Whether every word typed starts a word of the case, so "g perm" finds the G perms and not every case with a "g" somewhere. */
export function nameMatches(c: Searched, q: string) {
  if (wordsLanguage !== language()) (caseWords = new WeakMap(), (wordsLanguage = language()));
  const words = caseWords.get(c) ?? wordsOf(c);
  if (q !== lastQuery) queryWords = plain(lastQuery = q).split(/\s+/);
  return queryWords.every(word => words.some(w => w.startsWith(word)));
}

/** Moves as one spaced line: ’ and ′ as ', brackets dropped, "Rw" as "r", "R2'" as "R2"; " R U R' U' ". */
export const movesText = (alg: string) =>
  ` ${alg.replace(/[’′`]/g, "'").replace(/[()[\]]/g, " ").replace(/\b([RLUDFB])w/g, (_, f: string) => f.toLowerCase()).replace(/2'/g, "2").trim().split(/\s+/).join(" ")} `;
const MOVE = /^[RLUDFBMESrludfbxyz]w?[2']*$/;
let caseMoves = new WeakMap<object, string>();
/** Whether the moves typed (two or more, "R U R' U'") run in one of the case's algorithms; in lower case, whatever the case. */
export function movesMatch(c: Searched, q: string) {
  const typed = movesText(q);
  if (!c.algorithms?.length || typed.trim().split(" ").length < 2 || !typed.trim().split(" ").every(m => MOVE.test(m))) return false;
  let algs = caseMoves.get(c);
  if (algs === undefined) caseMoves.set(c, algs = c.algorithms.map(a => movesText(a.alg)).join("|"));
  return typed === typed.toLowerCase() ? algs.toLowerCase().includes(typed) : algs.includes(typed);
}

/** A case the search finds: by its name or by its moves. */
export const matches = (c: Searched, q: string) => nameMatches(c, q) || movesMatch(c, q);

/** The cases a search finds, those found by their name first, then those by their moves. */
export function searchCases<C extends Searched>(cases: readonly C[], q: string): C[] {
  const byName: C[] = [], byMoves: C[] = [];
  for (const c of cases) if (nameMatches(c, q)) byName.push(c); else if (movesMatch(c, q)) byMoves.push(c);
  return byName.concat(byMoves);
}
