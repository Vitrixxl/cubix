import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { atomWithStorage, createJSONStorage } from "jotai/utils";
import {
  BookOpen, Check, ChevronLeft, ChevronRight, CircleHelp, CirclePlay, Grid3x3, LayoutGrid, ListChecks, Plus, Search, SearchX, SquareCheckBig, Timer, Trash2, Video, X,
  type LucideIcon,
} from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BackHandler, FlatList, Linking, PanResponder, Pressable, ScrollView, View } from "react-native";
import { caseContext, groupCases, matches, toggleSelection } from "../../../src/client/lib/practiceCatalog";
import { moveCount } from "../../../src/client/lib/caseState";
import { algScene, polyAlgScene } from "../../../src/client/lib/algPlayer";
import { fmtTime } from "../../../src/client/lib/format";
import { formatAlg } from "../../../src/shared/cube";
import { PUZZLES, puzzleInfo, puzzleOf, type PuzzleId } from "../../../src/shared/puzzles";
import type { AlgEntry, CaseDto, CaseStatsDto, SetDto } from "../../../src/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { api, local } from "../api";
import { sourceLabel } from "../components/AlgText";
import { PlayerAlg, PlayerControls, PlayerCube, ViewButtons, useAlgPlayer } from "../components/AlgPlayer";
import { AppBar, PushedBar } from "../components/AppBar";
import { CaseDiagram } from "../components/CaseDiagram";
import { MethodsSheet } from "../components/GuidesDialog";
import { Alg, Empty, HeadButton, MenuItem, MoreMenu, Numeric, SearchField, StatusMark } from "../components/layout";
import { PuzzleIcon } from "../components/PuzzlePicker";
import { Sheet, SheetInput, SheetScrollView } from "../components/Sheet";
import { TimerStats } from "../components/TimesChart";
import { useLayout } from "../hooks/useLayout";
import { usePreservedList } from "../hooks/usePreservedList";
import { useTourTarget } from "../tour";
import { casePlayItem, displayAlg, maskForStage, shortId } from "../lib/caseState";
import { storage } from "../platform/storage";
import {
  casesAtom, goBackAtom, guidesAtom, learnedCaseIdsAtom, learningFilterAtom, puzzleAtom, replaceRouteAtom, routeAtom, selectedCaseIdsAtom, setsAtom,
  solveModeAtom, statsAtom, statsVersionAtom, type Route,
} from "../state";
import { said, tr } from "../../../src/client/i18n";

/** The algorithm each learned case was learned with, as the local workspace holds it. */
const learnedAlgsAtom = atom(get => { get(statsVersionAtom); return local.learnedAlgs(); });
const json = createJSONStorage<any>(() => storage);
/** The tiles of a set: large (four a line on a phone) or compact (five). */
const tileSizeAtom = atomWithStorage<"large" | "small">("cubix.algs.tileSize", "large", json, { getOnInit: true });
/**
 * The algorithms a player wrote for a case ("Add yours"), and those of them used. Kept on this device: the account
 * only records the catalogue's algorithms.
 */
type OwnAlgs = { algs: string[]; used: string[] };
const ownAlgsAtom = atomWithStorage<Record<string, OwnAlgs>>("cubix.algs.own", {}, json, { getOnInit: true });
/** The case's tab, kept from one case to the next. */
const caseTabAtom = atom<"algorithms" | "times">("algorithms");
/** The search, kept while a result is open. */
const searchQueryAtom = atom("");
const searchScopeAtom = atom<"all" | "puzzle">("all");

type Status = "learned" | "trained" | "new";
const statusOf = (id: string, learned: ReadonlySet<string>, stats: Map<string, CaseStatsDto>): Status =>
  learned.has(id) ? "learned" : stats.has(id) ? "trained" : "new";
const Mark = ({ status }: { status: Status }) => <StatusMark done={status === "learned"} current={status === "trained"} />;
function useLearned() {
  const ids = useAtomValue(learnedCaseIdsAtom);
  return useMemo(() => new Set(ids), [ids]);
}
/** Trains these cases at once, skipping the setup. */
function useTrain() {
  const setRoute = useSetAtom(routeAtom), setSelection = useSetAtom(selectedCaseIdsAtom);
  return (ids: string[]) => { if (!ids.length) return; setSelection(ids); setRoute({ page: "training", autostart: true }); };
}

/**
 * Algorithms, as the user chose it (mockups 11 to 13, A): the catalogue of sets by step, a set's cases on a pushed
 * screen, the search on another, and a case on a screen of its own. The route is passed in rather than read, so a page
 * sliding out keeps showing what it showed.
 */
export function AlgorithmsPage({ caseId, caseIds, set, search }: Partial<Omit<Extract<Route, { page: "algorithms" }>, "page">> & { page?: "algorithms" }) {
  if (search) return <SearchScreen />;
  if (caseId) return <CaseScreen caseId={caseId} caseIds={caseIds} />;
  if (set) return <SetScreen setId={set} />;
  return <Catalogue />;
}

// ---------------------------------------------------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------------------------------------------------

type CatalogueRow =
  | { kind: "stage"; key: string; label: string }
  | { kind: "set"; key: string; set: SetDto; total: number; learned: number; trained: number; groups: string[] }
  | { kind: "puzzle"; key: string; puzzle: PuzzleId; total: number; learned: number };

/** Learned, then trained but not learned, then never trained: a stacked bar. */
function Progress({ learned, trained, total, className }: { learned: number; trained: number; total: number; className?: string }) {
  const share = (n: number) => `${total ? (n / total) * 100 : 0}%` as const;
  return <View className={cn("h-1.5 flex-row overflow-hidden rounded-full bg-muted", className)} accessibilityRole="progressbar"
    accessibilityValue={{ min: 0, max: total, now: learned }} accessibilityLabel={tr("{0} of {1} learned", { 0: learned, 1: total })}>
    <View className="h-full bg-success" style={{ width: share(learned) }} />
    <View className="h-full bg-primary/55" style={{ width: share(trained) }} />
  </View>;
}

const Caption = ({ children, className }: { children: ReactNode; className?: string }) =>
  <Text accessibilityRole="header" className={cn("text-xs font-bold tracking-wider text-muted-foreground uppercase", className)}>{children}</Text>;

function Catalogue() {
  const puzzle = useAtomValue(puzzleAtom);
  const cases = useAtomValue(casesAtom), sets = useAtomValue(setsAtom), stats = useAtomValue(statsAtom);
  const learned = useLearned();
  const setRoute = useSetAtom(routeAtom), openGuides = useSetAtom(guidesAtom), setPuzzle = useSetAtom(puzzleAtom);
  const [methods, setMethods] = useState(false);
  const listTarget = useTourTarget("algorithms");
  const learnedTotal = cases.filter(c => learned.has(c.id)).length;
  const trainedTotal = cases.filter(c => !learned.has(c.id) && stats.has(c.id)).length;
  const rows = useMemo(() => {
    const bySet = new Map<string, CaseDto[]>();
    for (const c of cases) bySet.set(c.set, [...(bySet.get(c.set) ?? []), c]);
    const out: CatalogueRow[] = [];
    for (const stage of new Set(sets.map(s => s.stage))) {
      out.push({ kind: "stage", key: `stage:${stage}`, label: said(stage) });
      for (const set of sets.filter(s => s.stage === stage)) {
        const list = bySet.get(set.id) ?? [];
        out.push({
          kind: "set", key: set.id, set, total: list.length, groups: [...groupCases(list).keys()],
          learned: list.filter(c => learned.has(c.id)).length, trained: list.filter(c => !learned.has(c.id) && stats.has(c.id)).length,
        });
      }
    }
    // The other puzzles close the list: a tap switches to one.
    const others = PUZZLES.filter(p => p.id !== puzzle).map(p => ({ p, list: local.read.catalog(p.id).cases })).filter(({ list }) => list.length);
    if (others.length) out.push({ kind: "stage", key: "others", label: tr("Other puzzles") });
    for (const { p, list } of others) out.push({ kind: "puzzle", key: `puzzle:${p.id}`, puzzle: p.id, total: list.length, learned: list.filter(c => learned.has(c.id)).length });
    return out;
  }, [cases, sets, stats, learned, puzzle]);
  const scroll = usePreservedList<CatalogueRow>(`algorithms:${puzzle}`);
  const renderRow = ({ item: row }: { item: CatalogueRow }) => {
    if (row.kind === "stage") return <Caption className="px-1 pt-4 pb-1">{row.label}</Caption>;
    if (row.kind === "puzzle") {
      const label = said(puzzleInfo(row.puzzle)?.label ?? row.puzzle);
      return <Pressable onPress={() => setPuzzle(row.puzzle)} accessibilityRole="button" accessibilityLabel={label}
        className="min-h-14 flex-row items-center gap-3 rounded-2xl px-2 py-2 active:bg-muted/50">
        <View className="size-5 items-center justify-center"><PuzzleIcon puzzle={row.puzzle} size={18} /></View>
        <Text numberOfLines={1} className="min-w-0 flex-1 text-base font-bold">{label}</Text>
        <SetCount learned={row.learned} total={row.total} />
        <Icon as={ChevronRight} size={18} className="text-muted-foreground/70" />
      </Pressable>;
    }
    const { set, groups } = row;
    const detail = groups.length > 1
      ? `${groups.slice(0, 2).map(g => said(g)).join(", ")}${groups.length > 2 ? "…" : ""} · ${tr("{0} groups", { 0: groups.length })}`
      : said(set.description);
    return <Pressable onPress={() => setRoute({ page: "algorithms", set: set.id })} accessibilityRole="button" accessibilityLabel={said(set.label)}
      className="min-h-14 flex-row items-center gap-3 rounded-2xl px-2 py-2 active:bg-muted/50">
      <StatusMark done={row.total > 0 && row.learned === row.total} current={row.learned + row.trained > 0} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text numberOfLines={1} className="text-base font-bold">{said(set.label)}</Text>
        {detail ? <Text numberOfLines={1} className="text-xs text-muted-foreground">{detail}</Text> : null}
      </View>
      <SetCount learned={row.learned} total={row.total} />
      <Icon as={ChevronRight} size={18} className="text-muted-foreground/70" />
    </Pressable>;
  };
  return <View className="flex-1">
    <AppBar title={tr("Algorithms")}>
      <HeadButton icon={CircleHelp} label={tr("Algorithms guide")} onPress={() => openGuides("algorithms")} />
    </AppBar>
    <View className="min-h-0 flex-1 gap-2.5 px-4 pt-1">
      <Pressable onPress={() => setRoute({ page: "algorithms", search: true })} accessibilityRole="search" accessibilityLabel={tr("Search cases")}
        className="h-12 flex-row items-center gap-2.5 rounded-2xl bg-muted px-3.5 active:bg-muted/70">
        <Icon as={Search} size={18} className="text-muted-foreground" />
        <Text numberOfLines={1} className="text-base text-muted-foreground">{tr("Search cases: oll 21, pll t…")}</Text>
      </Pressable>
      <View className="gap-3 rounded-3xl bg-card p-4">
        <View className="flex-row items-center gap-3">
          <View className="min-w-0 flex-1 gap-0.5">
            <Text numberOfLines={1} className="text-lg font-extrabold tracking-[-0.02em]">{said(puzzleInfo(puzzle)?.label ?? puzzle)}</Text>
            <Text className="text-sm text-muted-foreground">{tr("{0} of {1} learned", { 0: learnedTotal, 1: cases.length })}</Text>
          </View>
          <Pressable onPress={() => setMethods(true)} accessibilityRole="button" className="h-10 flex-row items-center gap-2 rounded-full bg-primary/15 px-3.5 active:bg-primary/25">
            <Icon as={BookOpen} size={16} className="text-primary" />
            <Text className="text-sm font-bold text-primary">{tr("Solving methods")}</Text>
          </Pressable>
        </View>
        <Progress learned={learnedTotal} trained={trainedTotal} total={cases.length} />
      </View>
      <View {...listTarget} className="-mx-4 min-h-0 flex-1">
        <FlatList {...scroll} data={rows} keyExtractor={row => row.key} renderItem={renderRow} className="flex-1" contentContainerClassName="px-4 pb-4"
          initialNumToRender={16} ListEmptyComponent={<Empty icon={LayoutGrid}>{tr("No cases for this puzzle.")}</Empty>} />
      </View>
    </View>
    <MethodsSheet open={methods} onClose={() => setMethods(false)} />
  </View>;
}

function SetCount({ learned, total }: { learned: number; total: number }) {
  return <Numeric className={cn("text-base font-bold", total && learned === total ? "text-success" : learned ? "text-foreground" : "text-muted-foreground")}>
    {learned}<Text className="text-muted-foreground"> / {total}</Text>
  </Numeric>;
}

// ---------------------------------------------------------------------------------------------------------------------
// The search
// ---------------------------------------------------------------------------------------------------------------------

function SearchScreen() {
  const [query, setQuery] = useAtom(searchQueryAtom), [scope, setScope] = useAtom(searchScopeAtom);
  const [puzzle, setPuzzle] = useAtom(puzzleAtom);
  const cases = useAtomValue(casesAtom), stats = useAtomValue(statsAtom), solveMode = useAtomValue(solveModeAtom), statsVersion = useAtomValue(statsVersionAtom);
  const learned = useLearned();
  const setRoute = useSetAtom(routeAtom), goBack = useSetAtom(goBackAtom);
  const everything = useMemo(() => PUZZLES.flatMap(p => local.read.catalog(p.id).cases), []);
  // Each puzzle's statistics, read once a result of it shows.
  const otherStats = useMemo(() => new Map<string, Map<string, CaseStatsDto>>(), [statsVersion, solveMode]);
  const statsOf = (c: CaseDto) => {
    const id = puzzleOf(c);
    if (id === puzzle) return stats;
    let map = otherStats.get(id);
    if (!map) otherStats.set(id, map = new Map(local.read.stats(id, { solveMode: "standard" }).map(s => [s.caseId, s])));
    return map;
  };
  const q = query.trim();
  const found = useMemo(() => q ? (scope === "all" ? everything : cases).filter(c => matches(c, q)) : [], [q, scope, everything, cases]);
  const shown = found.slice(0, 120);
  const open = (c: CaseDto) => {
    if (puzzleOf(c) !== puzzle) setPuzzle(puzzleOf(c));
    setRoute({ page: "algorithms", caseId: c.id });
  };
  const chip = (id: "all" | "puzzle", label: string) => <Pressable key={id} accessibilityRole="radio" accessibilityState={{ checked: scope === id }} onPress={() => setScope(id)}
    className={cn("h-10 items-center justify-center rounded-full px-3.5", scope === id ? "bg-muted" : "active:bg-muted/50")}>
    <Text className={cn("text-sm font-bold", scope === id ? "text-foreground" : "text-muted-foreground")}>{label}</Text>
  </Pressable>;
  return <View className="flex-1">
    <View className="min-h-14 flex-row items-center gap-1 pr-4 pl-2">
      <Pressable accessibilityRole="button" accessibilityLabel={tr("Back")} onPress={() => { goBack(); }} className="size-11 items-center justify-center rounded-full active:bg-muted">
        <Icon as={ChevronLeft} size={22} />
      </Pressable>
      <SearchField value={query} onChangeText={setQuery} placeholder={tr("Search cases: oll 21, pll t…")} autoFocus={!query} className="flex-1 rounded-2xl" />
    </View>
    <View className="flex-row items-center gap-1 px-4 pb-1" accessibilityRole="radiogroup">
      {chip("all", tr("All puzzles' sets"))}
      {chip("puzzle", tr("{0} only", { 0: said(puzzleInfo(puzzle)?.label ?? puzzle) }))}
      <View className="flex-1" />
      {q ? <Numeric className="text-sm text-muted-foreground">{tr("{0} cases", { 0: found.length })}</Numeric> : null}
    </View>
    <FlatList data={shown} keyExtractor={c => c.id} keyboardShouldPersistTaps="handled" className="flex-1" contentContainerClassName="gap-1.5 px-4 pt-1 pb-4"
      initialNumToRender={10} maxToRenderPerBatch={8} windowSize={7}
      renderItem={({ item: c }) => {
        const own = statsOf(c), best = own.get(c.id)?.best, name = c.name !== c.id ? said(c.name) : undefined;
        return <Pressable onPress={() => open(c)} accessibilityRole="button" accessibilityLabel={name ? `${c.id}, ${name}` : c.id}
          className="min-h-16 flex-row items-center gap-3 rounded-2xl bg-card px-3 py-2 active:bg-muted">
          <CaseDiagram c={c} size={44} />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text numberOfLines={1} className="text-base font-bold">{c.id}{name ? <Text className="font-medium text-muted-foreground"> {name}</Text> : null}</Text>
            <Text numberOfLines={1} className="text-xs text-muted-foreground">{caseContext(c)}</Text>
          </View>
          <View className="items-end gap-0.5">
            <Mark status={statusOf(c.id, learned, own)} />
            <Numeric className={cn("text-sm font-bold", best != null ? "text-success" : "text-muted-foreground/60")}>{best != null ? fmtTime(best) : "–"}</Numeric>
          </View>
        </Pressable>;
      }}
      ListEmptyComponent={q ? <Empty icon={SearchX}>{tr("No case matches.")}</Empty> : <Empty icon={Search}>{tr("Type a case, a set or a group: oll 21, pll t, sune…")}</Empty>} />
  </View>;
}

// ---------------------------------------------------------------------------------------------------------------------
// A set
// ---------------------------------------------------------------------------------------------------------------------

/** The tiles' smallest width and the gap between them (the web's `TILES`: 5.5rem columns, gap-1.5). */
const TILE_MIN = 88, TILE_GAP = 6;
/** How many tiles a line of `width` holds, and how wide each is then. */
export function tileGrid(width: number, least = TILE_MIN) {
  const columns = Math.max(1, Math.floor((width + TILE_GAP) / (least + TILE_GAP)));
  return { columns, size: (width - TILE_GAP * (columns - 1)) / columns };
}

type SetRow =
  | { kind: "group"; key: string; group: string; all: CaseDto[]; first: boolean }
  | { kind: "tiles"; key: string; cases: CaseDto[] }
  | { kind: "empty"; key: string };

/** Two or three choices as one filled pill, the chosen one raised; an option is a word with its count, or an icon. */
function Pills<T extends string>({ value, options, onChange, label, className }: {
  value: T; options: { id: T; label?: string; count?: number; icon?: LucideIcon }[]; onChange: (id: T) => void; label: string; className?: string;
}) {
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} className={cn("h-11 flex-row rounded-2xl bg-muted p-1", className)}>
    {options.map(o => {
      const on = o.id === value;
      return <Pressable key={o.id} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={o.icon ? o.label : undefined} onPress={() => onChange(o.id)}
        className={cn("flex-row items-center justify-center gap-1 rounded-xl", o.icon ? "w-10" : "px-2.5", on && "bg-background")}>
        {o.icon ? <Icon as={o.icon} size={17} className={on ? "text-foreground" : "text-muted-foreground"} />
          : <Text numberOfLines={1} className={cn("text-sm font-bold", on ? "text-foreground" : "text-muted-foreground")}>{o.label}</Text>}
        {o.count !== undefined ? <Numeric className={cn("text-sm", on ? "font-bold text-foreground" : "text-muted-foreground")}>{o.count}</Numeric> : null}
      </Pressable>;
    })}
  </View>;
}

function SetScreen({ setId }: { setId: string }) {
  const puzzle = useAtomValue(puzzleAtom);
  const cases = useAtomValue(casesAtom), sets = useAtomValue(setsAtom), stats = useAtomValue(statsAtom);
  const learned = useLearned(), toggleLearned = useSetAtom(learnedCaseIdsAtom);
  const [filter, setFilter] = useAtom(learningFilterAtom), [tiles, setTiles] = useAtom(tileSizeAtom);
  const setRoute = useSetAtom(routeAtom), openGuides = useSetAtom(guidesAtom);
  const train = useTrain();
  const [methods, setMethods] = useState(false);
  // The selection: null outside it.
  const [picked, setPicked] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!picked) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { setPicked(null); return true; });
    return () => subscription.remove();
  }, [!picked]);
  const set = sets.find(s => s.id === setId);
  const all = useMemo(() => cases.filter(c => c.set === setId), [cases, setId]);
  const learnedCount = all.filter(c => learned.has(c.id)).length, trainedCount = all.filter(c => !learned.has(c.id) && stats.has(c.id)).length;
  const visible = useMemo(() => all.filter(c => filter === "all" || (filter === "learned") === learned.has(c.id)), [all, filter, learned]);
  const small = tiles === "small";
  const { columns, size } = tileGrid(useLayout().width - 32, small ? 60 : 76);
  const rows = useMemo(() => {
    const members = groupCases(all), out: SetRow[] = [];
    [...groupCases(visible)].forEach(([group, list], i) => {
      out.push({ kind: "group", key: `group:${group}`, group, all: members.get(group) ?? list, first: i === 0 });
      for (let at = 0; at < list.length; at += columns) out.push({ kind: "tiles", key: `${group}:${at}`, cases: list.slice(at, at + columns) });
    });
    if (!out.length && all.length) out.push({ kind: "empty", key: "empty" });
    return out;
  }, [all, visible, columns]);
  const scroll = usePreservedList<SetRow>(`algorithms-set:${puzzle}:${setId}:${filter}:${tiles}`);
  const order = useMemo(() => rows.flatMap(row => row.kind === "tiles" ? row.cases.map(c => c.id) : []), [rows]);
  const pick = useCallback((id: string) => setPicked(p => p && toggleSelection(p, [id])), []);
  const openCase = useCallback((id: string) => setRoute({ page: "algorithms", caseId: id, caseIds: order }), [setRoute, order]);
  if (!set) return <View className="flex-1"><PushedBar title={tr("Algorithms")} /><Empty icon={LayoutGrid}>{tr("No cases for this puzzle.")}</Empty></View>;
  const ids = picked ? [...picked] : [];
  const renderRow = ({ item: row }: { item: SetRow }) => {
    if (row.kind === "empty") return <Empty icon={Check}>{filter === "learned" ? tr("No learned cases in this set yet.") : tr("Every case of this set is learned.")}</Empty>;
    if (row.kind === "tiles") return <View className="flex-row pb-1.5" style={{ gap: TILE_GAP }}>
      {row.cases.map(c => <CaseTile key={c.id} c={c} size={size} small={small} best={stats.get(c.id)?.best} learned={learned.has(c.id)} trained={stats.has(c.id)}
        picked={picked ? picked.has(c.id) : undefined} onOpen={picked ? pick : openCase} onToggle={toggleLearned} />)}
    </View>;
    const done = row.all.filter(c => learned.has(c.id)).length, groupIds = row.all.map(c => c.id);
    const allPicked = !!picked && groupIds.every(id => picked.has(id));
    return <View className={cn("flex-row items-center gap-3 pb-2", row.first ? "pt-1" : "mt-2 border-t border-border pt-3")}>
      <View className="min-w-0 flex-1 gap-1.5">
        <View className="flex-row items-baseline gap-2">
          <Text numberOfLines={1} accessibilityRole="header" className="shrink text-lg font-extrabold tracking-[-0.02em]">{said(row.group)}</Text>
          <Numeric className={cn("text-xs", done === row.all.length ? "text-success" : "text-muted-foreground")}>{tr("{0} of {1} learned", { 0: done, 1: row.all.length })}</Numeric>
        </View>
        <View className="flex-row flex-wrap gap-[3px]" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {row.all.map(c => <View key={c.id} className={cn("h-1.5 w-2.5 rounded-full", learned.has(c.id) ? "bg-success" : stats.has(c.id) ? "bg-primary/55" : "bg-muted")} />)}
        </View>
      </View>
      {picked
        ? <Button variant="secondary" className="h-10 rounded-full px-3.5" onPress={() => setPicked(toggleSelection(picked, groupIds))}>
          <Text>{allPicked ? tr("Unselect") : tr("Select")}</Text>
        </Button>
        : <Button variant="secondary" className="h-10 gap-1.5 rounded-full px-3.5" accessibilityLabel={tr("Train {0}", { 0: said(row.group) })} onPress={() => train(groupIds)}>
          <Icon as={Timer} size={16} className="text-secondary-foreground" /><Text>{tr("Train")}</Text>
        </Button>}
    </View>;
  };
  return <View className="flex-1">
    {picked
      ? <View className="min-h-14 flex-row items-center gap-1 bg-primary/12 pr-3 pl-2">
        <Pressable accessibilityRole="button" accessibilityLabel={tr("Cancel")} onPress={() => setPicked(null)} className="size-11 items-center justify-center rounded-full active:bg-muted">
          <Icon as={X} size={22} />
        </Pressable>
        <Text numberOfLines={1} accessibilityRole="header" className="min-w-0 flex-1 text-xl font-extrabold tracking-[-0.03em]">{tr("{0} selected", { 0: ids.length })}</Text>
        <Button variant="ghost" className="h-10 rounded-full px-3" onPress={() => setPicked(toggleSelection(picked, visible.map(c => c.id)))}>
          <Text className="text-muted-foreground">{visible.every(c => picked.has(c.id)) ? tr("Unselect all") : tr("Select all")}</Text>
        </Button>
      </View>
      : <PushedBar title={said(set.label)}>
        <Button variant="ghost" className="h-10 gap-1.5 rounded-full px-3" onPress={() => setPicked(new Set())}>
          <Icon as={SquareCheckBig} size={17} className="text-foreground" /><Text>{tr("Select")}</Text>
        </Button>
        <MoreMenu>
          <MenuItem icon={BookOpen} onPress={() => setMethods(true)}>{tr("Solving methods")}</MenuItem>
          <MenuItem icon={CircleHelp} onPress={() => openGuides("algorithms")}>{tr("Algorithms guide")}</MenuItem>
        </MoreMenu>
      </PushedBar>}
    <View className="min-h-0 flex-1 gap-2.5 px-4">
      <View className="gap-1">
        <View className="flex-row items-center gap-1">
          <Text className="text-xs text-muted-foreground">{tr("Algorithms")}</Text>
          <Icon as={ChevronRight} size={12} className="text-muted-foreground" />
          <Text className="text-xs text-muted-foreground">{said(puzzleInfo(puzzle)?.label ?? puzzle)}</Text>
          <Icon as={ChevronRight} size={12} className="text-muted-foreground" />
          <Text numberOfLines={1} className="shrink text-xs font-bold">{said(set.stage)}</Text>
        </View>
        {set.description ? <Text numberOfLines={2} className="text-sm text-muted-foreground">{said(set.description)}</Text> : null}
      </View>
      <View className="gap-1.5">
        <Progress learned={learnedCount} trained={trainedCount} total={all.length} />
        <View className="flex-row flex-wrap gap-x-3.5">
          {([[learnedCount, tr("learned"), "bg-success"], [trainedCount, tr("in progress"), "bg-primary/55"], [all.length - learnedCount - trainedCount, tr("never trained"), "bg-muted-foreground/40"]] as const)
            .map(([n, label, dot]) => <View key={label} className="flex-row items-center gap-1.5">
              <View className={cn("size-2 rounded-full", dot)} />
              <Text className="text-xs text-muted-foreground"><Text className="text-xs font-bold text-foreground">{n}</Text> {label}</Text>
            </View>)}
        </View>
      </View>
      <View className="flex-row items-center justify-between gap-2">
        <Pills label={tr("Filter")} value={filter} onChange={setFilter} className="shrink" options={[
          { id: "all", label: tr("All"), count: all.length },
          { id: "learned", label: tr("Learned"), count: learnedCount },
          { id: "not-learned", label: tr("To learn"), count: all.length - learnedCount },
        ]} />
        <Pills label={tr("Tile size")} value={tiles} onChange={setTiles} options={[
          { id: "large", label: tr("Large tiles"), icon: LayoutGrid },
          { id: "small", label: tr("Compact tiles"), icon: Grid3x3 },
        ]} />
      </View>
      <View className="-mx-4 min-h-0 flex-1">
        <FlatList key={`${columns}`} {...scroll} data={rows} keyExtractor={row => row.key} renderItem={renderRow} className="flex-1" contentContainerClassName="px-4 pb-24"
          initialNumToRender={10} maxToRenderPerBatch={8} windowSize={7} ListEmptyComponent={<Empty icon={LayoutGrid}>{tr("No cases for this puzzle.")}</Empty>} />
      </View>
    </View>
    {picked
      ? <View className="flex-row gap-2 border-t border-border px-4 py-2.5">
        <Pressable disabled={!ids.some(id => !learned.has(id))} accessibilityRole="button"
          onPress={() => { for (const id of ids) if (!learned.has(id)) void api.setLearned(id, true).catch(() => { /* Reported by the sync indicator. */ }); setPicked(null); }}
          className={cn("h-12 flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-success/15 active:bg-success/25", !ids.some(id => !learned.has(id)) && "opacity-40")}>
          <Icon as={Check} size={18} className="text-success" /><Text className="text-base font-bold text-success">{tr("Mark learned")}</Text>
        </Pressable>
        <Pressable disabled={!ids.length} accessibilityRole="button" onPress={() => train(ids)}
          className={cn("h-12 flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-primary active:bg-primary/85", !ids.length && "opacity-40")}>
          <Icon as={Timer} size={18} className="text-primary-foreground" /><Text className="text-base font-bold text-primary-foreground">{tr("Train selection")}</Text>
        </Pressable>
      </View>
      : <Pressable onPress={() => train(all.map(c => c.id))} accessibilityRole="button" disabled={!all.length}
        className="absolute right-4 bottom-4 h-14 flex-row items-center gap-2 rounded-2xl bg-primary px-5 shadow-lg shadow-black/30 active:bg-primary/85">
        <Icon as={Timer} size={20} className="text-primary-foreground" />
        <Text className="text-lg font-extrabold tracking-[-0.02em] text-primary-foreground">{tr("Train all")} · {all.length}</Text>
      </Pressable>}
    <MethodsSheet open={methods} onClose={() => setMethods(false)} />
  </View>;
}

/**
 * A case as a tile (the web's `CaseTile`): its diagram, faded until it is learned, then its learned mark (a tap toggles
 * it) and its name, its best time under them. A tap elsewhere opens the case. With `picked` it is one of several cases
 * to pick: a check box in its corner, the tap picks it. `small` draws it compact.
 */
export const CaseTile = memo(function CaseTile({ c, size, best, learned, trained = false, detail, picked, small = false, onOpen, onToggle }: {
  c: CaseDto; size: number; best?: number | null; learned: boolean; trained?: boolean; detail?: string; picked?: boolean; small?: boolean;
  onOpen: (id: string) => void; onToggle: (id: string) => void;
}) {
  const name = detail ?? (c.name !== c.id ? said(c.name) : undefined);
  const picking = picked !== undefined;
  const status: Status = learned ? "learned" : trained || best != null ? "trained" : "new";
  return <View className={cn("rounded-2xl border-2", picked ? "border-primary bg-primary/10" : "border-transparent bg-card")} style={{ width: size }}>
    <Pressable onPress={() => onOpen(c.id)} accessibilityRole={picking ? "checkbox" : "button"} accessibilityState={picking ? { checked: picked } : undefined}
      accessibilityLabel={name ? `${c.id}, ${name}` : c.id} className={cn("items-center rounded-2xl px-1 active:bg-muted/60", small ? "gap-0.5 pt-1.5 pb-1" : "gap-1 pt-2 pb-1.5")}>
      <View style={{ opacity: learned || picking ? 1 : 0.55 }}>
        <CaseDiagram c={c} size={Math.max(28, Math.min(small ? 46 : 70, size - (small ? 12 : 20)))} />
      </View>
      <View className="max-w-full flex-row items-center gap-1">
        {picking
          ? <Mark status={status} />
          : <Pressable onPress={() => onToggle(c.id)} hitSlop={10} accessibilityRole="checkbox" accessibilityState={{ checked: learned }}
            accessibilityLabel={learned ? tr("{0} learned", { 0: c.id }) : tr("Mark {0} learned", { 0: c.id })}>
            <Mark status={status} />
          </Pressable>}
        <Text numberOfLines={1} className={cn("min-w-0 shrink font-bold", small ? "text-xs" : "text-sm")}>{detail ? c.id : shortId(c)}</Text>
      </View>
      <Numeric className={cn("text-[11px] font-bold", best != null ? "text-success" : "text-muted-foreground/60")}>{best != null ? fmtTime(best) : "–"}</Numeric>
    </Pressable>
    {picking && <View pointerEvents="none" className={cn("absolute top-1 left-1 size-5 items-center justify-center rounded-md border-[1.5px]", picked ? "border-primary bg-primary" : "border-muted-foreground/60 bg-background/60")}>
      {picked ? <Icon as={Check} size={13} strokeWidth={3} className="text-primary-foreground" /> : null}
    </View>}
  </View>;
});

// ---------------------------------------------------------------------------------------------------------------------
// A case
// ---------------------------------------------------------------------------------------------------------------------

function CaseScreen({ caseId, caseIds }: { caseId: string; caseIds?: string[] }) {
  const cases = useAtomValue(casesAtom);
  const c = cases.find(other => other.id === caseId);
  if (!c) return <View className="flex-1"><PushedBar title={caseId} back="close" /><Empty icon={SearchX}>{tr("No case matches.")}</Empty></View>;
  return <CaseScreenBody c={c} cases={cases} caseIds={caseIds} />;
}

/** A case's neighbours: the order it was opened in (a set's tiles), else its set in the catalogue's group order. */
function useSiblings(c: CaseDto, cases: CaseDto[], ids?: string[]) {
  return useMemo(() => {
    const members = cases.filter(other => other.set === c.set);
    if (ids?.includes(c.id)) {
      const byId = new Map(cases.map(other => [other.id, other]));
      return ids.flatMap(id => { const other = byId.get(id); return other ? [other] : []; });
    }
    return [...groupCases(members).values()].flat();
  }, [cases, c.set, c.id, ids]);
}

/** Previous and next of a list, with where this one stands. */
function Stepper({ index, count, onStep }: { index: number; count: number; onStep: (to: number) => void }) {
  return <View className="flex-row items-center">
    <HeadButton icon={ChevronLeft} label={tr("Previous case")} disabled={index <= 0} onPress={() => onStep(index - 1)} />
    <Numeric className="min-w-10 text-center text-sm font-bold text-muted-foreground">{index + 1} / {count}</Numeric>
    <HeadButton icon={ChevronRight} label={tr("Next case")} disabled={index >= count - 1} onPress={() => onStep(index + 1)} />
  </View>;
}

/** The case as a full-height screen (the web's case dialog on a phone): its bar with the stepper, then the case. A side swipe steps too. */
function CaseScreenBody({ c, cases, caseIds }: { c: CaseDto; cases: CaseDto[]; caseIds?: string[] }) {
  const goBack = useSetAtom(goBackAtom), replaceRoute = useSetAtom(replaceRouteAtom);
  const train = useTrain();
  const siblings = useSiblings(c, cases, caseIds);
  const index = Math.max(0, siblings.findIndex(other => other.id === c.id));
  const step = (to: number) => { const target = siblings[to]; if (target) replaceRoute({ page: "algorithms", caseId: target.id, caseIds }); };
  const stepRef = useRef(step);
  stepRef.current = step;
  const indexRef = useRef(index);
  indexRef.current = index;
  const tab = useRef("algorithms");
  tab.current = useAtomValue(caseTabAtom);
  // A swipe across the screen steps; the cube and the scrubber keep their own drags, the times' chart its own.
  const swipe = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => tab.current === "algorithms" && Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderRelease: (_, g) => { if (Math.abs(g.dx) > 60) stepRef.current(indexRef.current + (g.dx < 0 ? 1 : -1)); },
  }), []);
  const close = () => { if (!goBack()) replaceRoute({ page: "algorithms", set: c.set }); };
  return <View className="flex-1" {...swipe.panHandlers}>
    <PushedBar title={c.id} sub={c.name !== c.id ? said(c.name) : undefined} back="close" onBack={close}>
      {siblings.length > 1 && <Stepper index={index} count={siblings.length} onStep={step} />}
    </PushedBar>
    <CaseView key={c.id} c={c} onTrain={() => train([c.id])} />
  </View>;
}

/** How many players learned the case with each of its algorithms; nothing for a guest or offline. */
function useChoices(id: string, chosen: string[]) {
  const [choices, setChoices] = useState<{ total: number; algs: Record<string, number> } | null>(null);
  useEffect(() => {
    let live = true;
    setChoices(null);
    void api.algorithmChoices([id]).then(all => { if (live) setChoices(all[id] ?? null); }, () => {});
    return () => { live = false; };
  }, [id, chosen.join("\n")]);
  return choices?.total ? choices : null;
}

/** An algorithm of a case: one of the catalogue's (`entry`, its number `index`) or one the player wrote (`own`). */
type AlgItem = { key: string; text: string; alg: string; entry?: AlgEntry; index?: number; own?: boolean };

/** The faces an algorithm turns (R U, R U F…) and whether it rotates the cube. */
function turns(alg: string) {
  const moves = alg.replace(/[()[\]]/g, " ").split(/\s+/).filter(Boolean);
  return { faces: [...new Set(moves.filter(m => !/^[xyz]/.test(m)).map(m => m[0]!.toUpperCase()))], rotation: moves.some(m => /^[xyz]/.test(m)) };
}

/**
 * What tells an algorithm apart: its length, the faces it turns, its SpeedCubeDB votes, its video. `full` (the one
 * played) adds how many players chose it and its source.
 */
function AlgFacts({ item, cube, choices, full = false }: { item: AlgItem; cube: boolean; choices?: { total: number; algs: Record<string, number> } | null; full?: boolean }) {
  const { faces, rotation } = turns(item.alg), a = item.entry;
  const part = "text-xs text-muted-foreground";
  return <View className="flex-row flex-wrap items-center gap-x-2.5 gap-y-0.5">
    {cube && <Text className={part}><Text className="text-xs font-bold text-foreground">{moveCount(item.alg)}</Text> STM</Text>}
    {cube && <Text className={part}>{faces.join(" ")}{rotation ? ` + ${tr("rotation")}` : ""}</Text>}
    {item.own && <Text className={part}>{tr("Yours")}</Text>}
    {full && choices && !item.own && <Text className={part}>{tr("{0}% of players", { 0: Math.round(((choices.algs[item.alg] ?? 0) / choices.total) * 100) })}</Text>}
    {a?.votes != null && <Text className={part}>{full ? tr("{0} votes", { 0: a.votes }) : tr("{0} SpeedCubeDB votes", { 0: a.votes })}</Text>}
    {full && a && a.source !== "speedcubedb" && <Text className={part}>{sourceLabel(a.source)}</Text>}
    {a?.youtube && <Pressable onPress={() => void Linking.openURL(a.youtube!)} hitSlop={8} accessibilityRole="link" accessibilityLabel={tr("Watch the video")} className="flex-row items-center gap-1">
      <Icon as={Video} size={13} className="text-primary" /><Text className="text-xs text-primary">{tr("Video")}</Text>
    </Pressable>}
  </View>;
}

/**
 * A case whole: its diagram, place and setup, Train and Learned, then two tabs. Algorithms: the one played large at
 * the top (the 3D player), the algorithms the player uses under it, a tap plays one; the case's others wait in a
 * drawer, where choosing one makes it the one used, and where the player adds their own. My times: the figures and
 * chart of the case. `sheet`: drawn in a sheet, scrolling as one.
 */
function CaseView({ c, onTrain, sheet = false }: { c: CaseDto; onTrain: () => void; sheet?: boolean }) {
  const [tab, setTab] = useAtom(caseTabAtom);
  const learned = useAtomValue(learnedCaseIdsAtom).includes(c.id), toggleLearned = useSetAtom(learnedCaseIdsAtom);
  const solveMode = useAtomValue(solveModeAtom), statsVersion = useAtomValue(statsVersionAtom);
  const history = useMemo(() => local.read.caseHistory(c.id, { solveMode }), [c.id, solveMode, statsVersion]);
  const learnedAlgs = useAtomValue(learnedAlgsAtom), chosen = learned ? (learnedAlgs[c.id] ?? []) : [];
  const [ownAll, setOwnAll] = useAtom(ownAlgsAtom), own = ownAll[c.id] ?? { algs: [], used: [] };
  const setOwn = (next: OwnAlgs) => setOwnAll(all => ({ ...all, [c.id]: next }));
  const choices = useChoices(c.id, chosen);
  const play = casePlayItem(c), cube = !!play && !play.puzzle;
  const items: AlgItem[] = [
    ...c.algorithms.map((a, i) => ({ key: `a${i}`, text: displayAlg(a), alg: a.alg, entry: a, index: i })),
    ...own.algs.map(alg => ({ key: `own:${alg}`, text: alg, alg, own: true })),
  ];
  const usedOwn = learned ? own.used : [];
  const isUsed = (item: AlgItem) => item.own ? usedOwn.includes(item.alg) : chosen.includes(item.alg);
  const used = items.filter(isUsed);
  const [shown, setShown] = useState<string | null>(null), [tapped, setTapped] = useState(false);
  const current = items.find(item => item.key === shown) ?? used[0] ?? items[0];
  const show = (item: AlgItem) => { setShown(item.key); setTapped(true); };
  const save = (algs: string[], ownUsed: string[]) => {
    if (ownUsed.join("\n") !== own.used.join("\n")) setOwn({ ...own, used: ownUsed });
    void api.setLearned(c.id, algs.length + ownUsed.length > 0, algs).catch(() => { /* Reported by the sync indicator. */ });
  };
  // Choosing an algorithm makes it the one used.
  const choose = (item: AlgItem) => { save(item.own ? [] : [item.alg], item.own ? [item.alg] : []); show(item); };
  // "I use it" adds or drops one: several may be used, as on the web.
  const toggleUse = (item: AlgItem) => {
    const on = isUsed(item);
    if (item.own) save(chosen, on ? usedOwn.filter(a => a !== item.alg) : [...usedOwn, item.alg]);
    else save(on ? chosen.filter(a => a !== item.alg) : [...chosen, item.alg], usedOwn);
  };
  const [drawer, setDrawer] = useState(false), [writing, setWriting] = useState(false);
  const addOwn = (alg: string) => {
    setOwnAll(all => ({ ...all, [c.id]: { algs: [...own.algs.filter(a => a !== alg), alg], used: [alg] } }));
    void api.setLearned(c.id, true, []).catch(() => {});
    setShown(`own:${alg}`); setTapped(true);
  };
  const removeOwn = (alg: string) => setOwn({ algs: own.algs.filter(a => a !== alg), used: own.used.filter(a => a !== alg) });
  const count = history.summary.count;
  const head = <>
    <View className="flex-row items-center gap-4 px-4 pt-1">
      <CaseDiagram c={c} size={60} />
      <View className="min-w-0 flex-1 gap-1">
        <Text numberOfLines={1} className="text-sm font-semibold text-muted-foreground">{caseContext(c)}</Text>
        <View className="flex-row items-baseline gap-2">
          <Text className="text-sm text-muted-foreground">{tr("Setup")}</Text>
          <Alg text={cube ? formatAlg(c.setup) : c.setup} size={15} selectable className="min-w-0 flex-1" />
        </View>
      </View>
    </View>
    <View className="flex-row gap-2 px-4 pt-3">
      <Pressable onPress={onTrain} accessibilityRole="button" className="h-12 flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-primary active:bg-primary/85">
        <Icon as={Timer} size={18} className="text-primary-foreground" /><Text className="text-base font-bold text-primary-foreground">{tr("Train")}</Text>
      </Pressable>
      <Pressable onPress={() => toggleLearned(c.id)} accessibilityRole="switch" accessibilityState={{ checked: learned }}
        className={cn("h-12 flex-1 flex-row items-center justify-center gap-2 rounded-2xl", learned ? "bg-success/15 active:bg-success/25" : "bg-muted active:bg-muted/70")}>
        <Icon as={Check} size={18} className={learned ? "text-success" : "text-muted-foreground"} />
        <Text className={cn("text-base font-bold", learned ? "text-success" : "text-muted-foreground")}>{learned ? tr("Learned") : tr("Mark learned")}</Text>
      </Pressable>
    </View>
    <View className="mt-2 flex-row gap-5 border-b border-border px-5" accessibilityRole="tablist">
      {([["algorithms", tr("Algorithms"), items.length], ["times", tr("My times"), count]] as const).map(([id, label, n]) => {
        const on = tab === id;
        return <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setTab(id)} className="h-11 flex-row items-center gap-1.5">
          <Text className={cn("text-[15px] font-bold", on ? "text-foreground" : "text-muted-foreground")}>{label}</Text>
          <Numeric className="text-[15px] text-muted-foreground">{n}</Numeric>
          {on && <View className="absolute right-0 bottom-0 left-0 h-[3px] rounded-full bg-primary" />}
        </Pressable>;
      })}
    </View>
  </>;
  const others = items.length - used.length;
  const algorithms = <View className="gap-1 px-4 pt-3 pb-4">
    {current ? <AlgStage key={current.key} c={c} item={current} items={c.algorithms.length} used={isUsed(current)} choices={choices} autoplay={tapped} onUse={() => toggleUse(current)} /> : null}
    <View className="flex-row items-center justify-between pt-3">
      <Text accessibilityRole="header" className="px-1 text-xs font-bold tracking-wider text-muted-foreground uppercase">{tr("You use")}</Text>
      <Pressable onPress={() => setWriting(true)} accessibilityRole="button" className="h-10 flex-row items-center gap-1.5 rounded-full px-2 active:bg-muted/50">
        <Icon as={Plus} size={16} className="text-muted-foreground" /><Text className="text-sm font-bold text-muted-foreground">{tr("Add yours")}</Text>
      </Pressable>
    </View>
    {used.length ? used.map(item => <AlgRow key={item.key} item={item} cube={cube} used here={item.key === current?.key} onPress={() => show(item)} />)
      : <Text className="px-1 pb-1 text-sm text-muted-foreground">{tr("None chosen yet: pick the one you learn among the case's algorithms.")}</Text>}
    {items.length > 0 && <Pressable onPress={() => setDrawer(true)} accessibilityRole="button"
      className="mt-1 h-12 flex-row items-center justify-center gap-2 rounded-2xl bg-muted active:bg-muted/70">
      <Icon as={ListChecks} size={18} className="text-foreground" />
      <Text className="text-base font-bold">{used.length ? tr("Other algorithms · {0}", { 0: others }) : tr("Choose an algorithm · {0}", { 0: items.length })}</Text>
    </Pressable>}
  </View>;
  const times = <View className={cn("px-4 pt-3 pb-3", !sheet && "min-h-0 flex-1")}>
    <TimerStats data={history} compact={sheet} fill={!sheet} empty={tr("No attempts on this case yet.")} />
  </View>;
  const sheets = <>
    <Sheet open={drawer} onClose={() => setDrawer(false)} title={tr("Algorithms of {0}", { 0: c.id })} description={tr("Choose the one you use.")} scroll contentClassName="gap-1 px-3">
      {items.map(item => <AlgRow key={item.key} item={item} cube={cube} used={isUsed(item)} here={false}
        onPress={() => { choose(item); setDrawer(false); }}
        trailing={<View className="flex-row items-center">
          <HeadButton icon={CirclePlay} label={tr("Play it")} onPress={() => { show(item); setTab("algorithms"); setDrawer(false); }} />
          {item.own && <HeadButton icon={Trash2} label={tr("Delete")} onPress={() => removeOwn(item.alg)} />}
        </View>} />)}
      <Pressable onPress={() => { setDrawer(false); setWriting(true); }} accessibilityRole="button"
        className="mt-1 h-12 flex-row items-center justify-center gap-2 rounded-2xl border border-dashed border-border active:bg-muted/50">
        <Icon as={Plus} size={17} className="text-muted-foreground" /><Text className="text-base font-bold text-muted-foreground">{tr("Add yours")}</Text>
      </Pressable>
    </Sheet>
    <OwnAlgSheet open={writing} c={c} onClose={() => setWriting(false)} onAdd={alg => { addOwn(alg); setWriting(false); }} />
  </>;
  if (sheet) return <>
    <SheetScrollView contentContainerClassName="pb-4">{head}{tab === "algorithms" ? algorithms : times}</SheetScrollView>
    {sheets}
  </>;
  return <View className="min-h-0 flex-1">
    {head}
    {tab === "algorithms" ? <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>{algorithms}</ScrollView> : times}
    {sheets}
  </View>;
}

/** An algorithm in a list: its number, its moves and what tells it apart, a check when used. */
function AlgRow({ item, cube, used, here, onPress, trailing }: { item: AlgItem; cube: boolean; used: boolean; here: boolean; onPress: () => void; trailing?: ReactNode }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: here }}
    className={cn("flex-row items-start gap-3 rounded-2xl px-3 py-2.5 active:bg-muted/60", here && "bg-muted")}>
    <Numeric className={cn("w-5 pt-0.5 text-right text-sm font-extrabold", used ? "text-success" : "text-muted-foreground")}>{item.own ? "•" : (item.index ?? 0) + 1}</Numeric>
    <View className="min-w-0 flex-1 gap-1">
      <Alg text={item.text} size={16} />
      <AlgFacts item={item} cube={cube} />
    </View>
    {used ? <Icon as={Check} size={18} strokeWidth={3} className="mt-0.5 text-success" /> : null}
    {trailing}
  </Pressable>;
}

/** The algorithm picked, played large: the cube, its moves lit, the controls on one bar; then what tells it apart and whether it is used. */
function AlgStage({ c, item, items, used, choices, autoplay, onUse }: {
  c: CaseDto; item: AlgItem; items: number; used: boolean; choices: { total: number; algs: Record<string, number> } | null; autoplay: boolean; onUse: () => void;
}) {
  const play = casePlayItem(c), { height } = useLayout();
  const player = useAlgPlayer(item.text, play?.size, play?.mask, { puzzle: play?.puzzle, hints: play?.hints, autoplay: autoplay ? 250 : undefined });
  const cube = Math.round(Math.min(210, Math.max(130, height * 0.22)));
  return <View className="overflow-hidden rounded-3xl border border-border bg-background">
    <View className="items-center gap-3 px-3 pt-3 pb-3">
      {player && <PlayerCube player={player} size={cube} />}
      <View className="max-w-full items-center px-2"><PlayerAlg player={player} text={item.text} size={18} /></View>
      {player && <PlayerControls player={player} inline className="w-full rounded-2xl bg-card p-1" />}
      {player && <ViewButtons player={player} compact className="absolute top-2 right-2" />}
    </View>
    <View className="flex-row items-center gap-3 border-t border-border px-4 py-3">
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
          {item.own ? tr("Your algorithm") : tr("Algorithm {0} of {1}", { 0: (item.index ?? 0) + 1, 1: items })}
        </Text>
        <AlgFacts item={item} cube={!!play && !play.puzzle} choices={choices} full />
      </View>
      <Pressable onPress={onUse} accessibilityRole="switch" accessibilityState={{ checked: used }}
        className={cn("h-10 flex-row items-center gap-1.5 rounded-xl px-3", used ? "bg-success/15 active:bg-success/25" : "bg-muted active:bg-muted/70")}>
        <Icon as={Check} size={16} className={used ? "text-success" : "text-muted-foreground"} />
        <Text className={cn("text-sm font-bold", used ? "text-success" : "text-muted-foreground")}>{tr("I use it")}</Text>
      </Pressable>
    </View>
  </View>;
}

/** Whether `alg` reads as moves of the case's puzzle; puzzles without a 3D model take any text. */
function readable(c: CaseDto, alg: string) {
  const play = casePlayItem(c);
  if (!play) return true;
  try { return !!(play.puzzle ? polyAlgScene(play.puzzle, alg) : algScene(alg, play.size, maskForStage(c.stage))); } catch { return false; }
}

/** "Add yours": the player's own algorithm for the case, checked as moves of its puzzle. */
function OwnAlgSheet({ open, c, onClose, onAdd }: { open: boolean; c: CaseDto; onClose: () => void; onAdd: (alg: string) => void }) {
  const [text, setText] = useState("");
  useEffect(() => { if (open) setText(""); }, [open]);
  const alg = text.trim().replace(/\s+/g, " "), valid = !!alg && readable(c, alg);
  return <Sheet open={open} onClose={onClose} title={tr("Add yours")} description={tr("Your own algorithm for {0}, kept on this device.", { 0: c.id })}>
    <SheetInput value={text} onChangeText={setText} placeholder="R U R' U'" autoCapitalize="none" autoCorrect={false} autoFocus
      className="h-12 rounded-2xl border border-input bg-input/30 px-3.5 font-sans text-base text-foreground" onSubmitEditing={() => { if (valid) onAdd(alg); }} />
    {alg && !valid ? <Text className="text-sm text-destructive">{tr("These moves can't be read.")}</Text> : null}
    <Button disabled={!valid} onPress={() => onAdd(alg)} className="h-12 rounded-2xl"><Text>{tr("Add")}</Text></Button>
  </Sheet>;
}

/**
 * A case opened over another page (a course's case, the web's case dialog): the case in a sheet, the cases of `ids` a
 * step away in its head. `caseId` null closes it.
 */
export function CaseSheet({ caseId, ids, onChange, onClose }: { caseId: string | null; ids: string[]; onChange: (id: string) => void; onClose: () => void }) {
  const cases = useAtomValue(casesAtom);
  const train = useTrain();
  // The last case stays drawn while the sheet goes away.
  const [shown, setShown] = useState(caseId);
  if (caseId && caseId !== shown) setShown(caseId);
  const c = cases.find(other => other.id === shown);
  if (!c) return null;
  const index = ids.indexOf(c.id);
  return <Sheet open={!!caseId} onClose={onClose} title={c.id} description={c.name !== c.id ? said(c.name) : caseContext(c)} contentClassName="gap-0 px-0"
    right={index >= 0 && ids.length > 1 ? <Stepper index={index} count={ids.length} onStep={to => onChange(ids[to]!)} /> : null}>
    <CaseView key={c.id} c={c} sheet onTrain={() => { onClose(); train([c.id]); }} />
  </Sheet>;
}
