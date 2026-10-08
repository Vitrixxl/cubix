import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { BookOpen, Check, ChevronLeft, ChevronRight, CirclePlay, LayoutGrid, Play, SearchX, Timer } from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, FlatList, Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { catalogSections, groupCases, matches } from "../../../src/client/lib/practiceCatalog";
import { fmtTime } from "../../../src/client/lib/format";
import { formatAlg } from "../../../src/shared/cube";
import { viewForStage } from "../../../src/shared/cubeDiagram";
import { puzzleInfo, puzzleOf } from "../../../src/shared/puzzles";
import type { CaseDto, CaseStatsDto, SetDto } from "../../../src/shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { api, local } from "../api";
import { sourceLabel } from "../components/AlgText";
import { CaseDiagram } from "../components/CaseDiagram";
import { MethodsSheet } from "../components/GuidesDialog";
import {
  Alg, BackButton, Bar, Choice, Empty, Figure, GroupToggle, HeadButton, Label, LearnToggle, MenuItem, Numeric, MoreMenu, Page, PageHead, SearchField,
  StatusMark, TouchAction, TouchBar,
} from "../components/layout";
import { CubePreview } from "../components/Practice";
import { AlgPlayerSheet, type PlayItem } from "../components/AlgPlayer";
import { SessionButton } from "../components/PuzzlePicker";
import { Sheet, SheetScrollView } from "../components/Sheet";
import { TimerStats } from "../components/TimesChart";
import { useLayout } from "../hooks/useLayout";
import { usePreservedList } from "../hooks/usePreservedList";
import { useSlide } from "../hooks/useSlide";
import { useTourTarget } from "../tour";
import { displayAlg, maskForStage, shortId } from "../lib/caseState";
import {
  casesAtom, collapsedAlgorithmGroupsAtom, goBackAtom, guidesAtom, learnedCaseIdsAtom, learningFilterAtom, previousRouteAtom, puzzleAtom,
  replaceRouteAtom, routeAtom, selectedCaseIdsAtom, setByStageAtom, setsAtom, solveModeAtom, stageAtom, statsAtom, statsVersionAtom,
} from "../state";
import { tr } from "../../../src/client/i18n";

/** The algorithm each learned case was learned with, as the local workspace holds it. */
const learnedAlgAtom = atom(get => { get(statsVersionAtom); return local.learnedAlg(); });

/**
 * Algorithms, as the web app on a phone: its head (how many cases are learned, Solving methods in its "…"), a search
 * over every case, the stage tabs, the set and learning filters, then the cases of the stage as a grid of tiles grouped
 * by family. A case opens as a page of its own that slides over the list. The route is passed in rather than read, so
 * a page sliding out keeps showing what it showed.
 */
export function AlgorithmsPage({ caseId, caseIds }: { caseId?: string; caseIds?: string[] }) {
  const puzzle = useAtomValue(puzzleAtom);
  const cases = useAtomValue(casesAtom);
  const sets = useAtomValue(setsAtom);
  const stats = useAtomValue(statsAtom);
  const previousRoute = useAtomValue(previousRouteAtom);
  const goBack = useSetAtom(goBackAtom), replaceRoute = useSetAtom(replaceRouteAtom);
  const selected = caseId ? cases.find(c => c.id === caseId) : undefined;
  const { width } = useLayout();
  // The detail stays rendered while it slides out.
  const [shown, setShown] = useState(selected);
  if (selected && selected !== shown) setShown(selected);
  const progress = useSlide(!!selected, () => setShown(undefined));
  const detail = selected ?? shown;
  const closeCase = () => {
    if (previousRoute?.page === "algorithms" && !previousRoute.caseId) goBack();
    else replaceRoute({ page: "algorithms" });
  };
  return <View className="flex-1">
    {/* Keep the list and its scroll position mounted while a case is open. */}
    <Animated.View style={{ flex: 1, transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -width] }) }] }} pointerEvents={selected ? "none" : "auto"}
      accessibilityElementsHidden={!!selected} importantForAccessibility={selected ? "no-hide-descendants" : "auto"}>
      <AlgorithmBrowser key={puzzle} puzzle={puzzle} cases={cases} sets={sets} stats={stats} />
    </Animated.View>
    {detail && <Animated.View pointerEvents={selected ? "auto" : "none"} className="bg-background"
      style={[StyleSheet.absoluteFill, { transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [width, 0] }) }] }]}>
      <CaseDetail key={detail.set} c={detail} caseIds={caseIds} cases={cases} stats={stats} onBack={closeCase} />
    </Animated.View>}
  </View>;
}

type Row =
  | { kind: "group"; key: string; group: string; list: CaseDto[]; expanded: boolean }
  | { kind: "tiles"; key: string; cases: CaseDto[]; end: boolean }
  | { kind: "empty"; key: string };

/** The tiles' smallest width and the gap between them (the web's `TILES`: 5.5rem columns, gap-1.5). */
const TILE_MIN = 88, TILE_GAP = 6;
/** How many tiles a line of `width` holds, and how wide each is then. */
export function tileGrid(width: number) {
  const columns = Math.max(1, Math.floor((width + TILE_GAP) / (TILE_MIN + TILE_GAP)));
  return { columns, size: (width - TILE_GAP * (columns - 1)) / columns };
}
/** Cases cut into lines of `columns` tiles. */
function tileRows(key: string, list: CaseDto[], columns: number): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < list.length; i += columns) rows.push({ kind: "tiles", key: `${key}:${i}`, cases: list.slice(i, i + columns), end: i + columns >= list.length });
  return rows;
}

function AlgorithmBrowser({ puzzle, cases, sets, stats }: { puzzle: string; cases: CaseDto[]; sets: SetDto[]; stats: Map<string, CaseStatsDto> }) {
  const [learningFilter, setLearningFilter] = useAtom(learningFilterAtom);
  const [learnedIds, toggleLearned] = useAtom(learnedCaseIdsAtom);
  const learned = useMemo(() => new Set(learnedIds), [learnedIds]);
  const [collapsed, setCollapsed] = useAtom(collapsedAlgorithmGroupsAtom);
  const [stage, setStage] = useAtom(stageAtom);
  const [setByStage, setSetByStage] = useAtom(setByStageAtom);
  const setRoute = useSetAtom(routeAtom), setSelection = useSetAtom(selectedCaseIdsAtom);
  const openGuides = useSetAtom(guidesAtom);
  const [methods, setMethods] = useState(false);
  const [query, setQuery] = useState("");
  const listTarget = useTourTarget("algorithms");
  // The page's padding on both sides: the list's room for its tiles.
  const { columns, size } = tileGrid(useLayout().width - 32);
  // Counts ignore the learning filter: the header and the filter always describe the whole set.
  const everything = useMemo(() => catalogSections(cases, sets, setByStage, learned, "all"), [sets, cases, setByStage, learned]);
  const sections = useMemo(() => catalogSections(cases, sets, setByStage, learned, learningFilter), [sets, cases, setByStage, learned, learningFilter]);
  const section = sections.find(s => s.stage === stage) ?? sections[0];
  const whole = everything.find(s => s.stage === section?.stage);
  const total = everything.reduce((sum, s) => sum + s.all.length, 0), learnedTotal = everything.reduce((sum, s) => sum + s.learnedCount, 0);
  const q = query.trim();
  const found = useMemo(() => q ? cases.filter(c => matches(c, q)).slice(0, 80) : null, [cases, q]);
  const rows = useMemo(() => {
    if (found) return tileRows("found", found, columns);
    const result: Row[] = [];
    if (!section) return result;
    for (const [group, list] of section.groups) {
      const key = `${section.active.id}:${group}`, expanded = !collapsed[key];
      result.push({ kind: "group", key, group, list, expanded });
      if (expanded) result.push(...tileRows(key, list, columns));
    }
    if (!section.groups.length) result.push({ kind: "empty", key: "empty" });
    return result;
  }, [section, collapsed, found, columns]);
  const listKey = found ? `algorithms-search:${puzzle}` : `algorithms:${puzzle}:${learningFilter}:${section?.active.id ?? "empty"}`;
  const scroll = usePreservedList<Row>(listKey);
  const openCase = useCallback((id: string) => {
    // Freeze the visible order for this visit, including filters and collapsed groups.
    const caseIds = found ? undefined : rows.flatMap(row => row.kind === "tiles" ? row.cases.map(c => c.id) : []);
    setRoute({ page: "algorithms", caseId: id, caseIds });
  }, [rows, found, setRoute]);
  const trainAll = (list: CaseDto[]) => { setSelection(list.map(c => c.id)); setRoute({ page: "training", autostart: true }); };
  const renderRow = ({ item: row }: { item: Row }) => {
    if (row.kind === "group") return <GroupToggle className="bg-background pr-1" title={row.group} meta={row.list.length} open={row.expanded}
      onPress={() => setCollapsed(previous => ({ ...previous, [row.key]: !previous[row.key] }))}>
      <Button variant="ghost" size="sm" className="h-11 gap-1.5 px-2.5" accessibilityLabel={tr("Train {0}", { 0: row.group })} onPress={() => trainAll(row.list)}>
        <Icon as={Timer} size={15} className="text-muted-foreground" />
        <Text className="text-sm text-muted-foreground">{tr("Train")}</Text>
      </Button>
    </GroupToggle>;
    if (row.kind === "tiles") return <View className={cn("flex-row", row.end ? "pb-3" : "pb-1.5")} style={{ gap: TILE_GAP }}>
      {row.cases.map(c => <CaseTile key={c.id} c={c} size={size} best={stats.get(c.id)?.best} learned={learned.has(c.id)}
        detail={found ? `${c.setLabel} · ${c.group}` : undefined} onOpen={openCase} onToggle={toggleLearned} />)}
    </View>;
    return <Empty icon={Check}>{learningFilter === "learned" ? tr("No learned cases in this set yet.") : tr("Every case of this set is learned.")}</Empty>;
  };
  return <Page className="gap-3 pb-0">
    <PageHead title={tr("Algorithms")} sub={tr("{0} of {1} learned", { 0: learnedTotal, 1: total })}>
      <SessionButton />
      <MoreMenu>
        <MenuItem icon={BookOpen} onPress={() => setMethods(true)}>{tr("Solving methods")}</MenuItem>
        <MenuItem icon={BookOpen} onPress={() => openGuides("algorithms")}>{tr("Algorithms guide")}</MenuItem>
      </MoreMenu>
    </PageHead>
    <SearchField value={query} onChangeText={setQuery} placeholder={tr("Search cases: oll 21, pll t…")} />
    {!found && section && <View className="-mx-4 gap-2 border-b border-border pb-2.5">
      {sections.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} className="grow-0" contentContainerClassName="gap-6 px-4">
        {sections.map(s => {
          const on = s.stage === section.stage;
          return <Pressable key={s.stage} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setStage(s.stage)} className="h-11 justify-center">
            <Text className={cn("text-base", on ? "font-semibold text-foreground" : "font-medium text-muted-foreground")}>{s.stage}</Text>
            <View className={cn("absolute right-0 bottom-0 left-0 h-0.5 rounded-full", on ? "bg-primary" : "bg-transparent")} />
          </Pressable>;
        })}
      </ScrollView>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="grow-0" contentContainerClassName="items-center gap-1 px-4">
        {section.variants.length > 1 && <>
          <Choice label={tr("Set")} value={section.active.id} onChange={id => setSetByStage(previous => ({ ...previous, [section.stage]: id }))} className="flex-nowrap"
            options={section.variants.map(v => ({ id: v.id, label: v.label.startsWith(`${section.stage} `) ? v.label.slice(section.stage.length + 1) : v.label, count: v.count }))} />
          <View className="mx-1.5 h-5 w-px bg-border" />
        </>}
        <Choice label={tr("Filter")} value={learningFilter} onChange={setLearningFilter} className="flex-nowrap" options={[
          { id: "all", label: tr("All"), count: whole?.all.length ?? 0 },
          { id: "learned", label: tr("Learned"), count: whole?.learnedCount ?? 0 },
          { id: "not-learned", label: tr("To learn"), count: (whole?.all.length ?? 0) - (whole?.learnedCount ?? 0) },
        ]} />
      </ScrollView>
    </View>}
    <View {...listTarget} className="-mx-4 min-h-0 flex-1">
      <FlatList key={`${listKey}:${columns}`} {...scroll} data={rows} keyExtractor={row => row.key} renderItem={renderRow} keyboardShouldPersistTaps="handled"
        initialNumToRender={10} maxToRenderPerBatch={8} windowSize={7} scrollEventThrottle={64}
        className="flex-1" contentContainerClassName="px-4 pb-4"
        ListEmptyComponent={<Empty icon={found ? SearchX : LayoutGrid}>{found ? tr("No case matches.") : tr("No cases for this puzzle.")}</Empty>} />
    </View>
    <MethodsSheet open={methods} onClose={() => setMethods(false)} />
  </Page>;
}

/**
 * A case as a square tile (the web's `CaseTile`): its diagram, then its name and best time on one line, the learned
 * mark in the top right corner (a tap toggles it). A tap elsewhere opens the case.
 */
export const CaseTile = memo(function CaseTile({ c, size, best, learned, detail, onOpen, onToggle }: {
  c: CaseDto; size: number; best?: number | null; learned: boolean; detail?: string; onOpen: (id: string) => void; onToggle: (id: string) => void;
}) {
  const name = detail ?? (c.name !== c.id ? c.name : undefined);
  return <View className="rounded-lg bg-muted/45" style={{ width: size, height: size }}>
    <Pressable onPress={() => onOpen(c.id)} accessibilityRole="button" accessibilityLabel={name ? `${c.id}, ${name}` : c.id}
      className="flex-1 rounded-lg px-2 pt-2 pb-1.5 active:bg-muted/80">
      <View className="min-h-0 flex-1 items-center justify-center"><CaseDiagram c={c} size={Math.max(32, Math.min(70, size - 36))} /></View>
      {/* One line under the diagram: the name on the left, the best time on the right. */}
      <View className="flex-row items-baseline justify-between gap-1.5">
        <Text numberOfLines={1} className="min-w-0 shrink text-xs font-medium">{shortId(c)}</Text>
        <Numeric className={cn("text-xs", best != null ? "text-muted-foreground" : "text-muted-foreground/60")}>{best != null ? fmtTime(best) : "–"}</Numeric>
      </View>
    </Pressable>
    <Pressable onPress={() => onToggle(c.id)} accessibilityRole="checkbox" accessibilityState={{ checked: learned }} accessibilityLabel={learned ? tr("{0} learned", { 0: c.id }) : tr("Mark {0} learned", { 0: c.id })}
      hitSlop={4} className={cn("absolute -top-1 -right-1 size-10 items-center justify-center rounded-full active:bg-muted/50", !learned && "opacity-50")}>
      <StatusMark done={learned} />
    </Pressable>
  </View>;
});

/**
 * The case page: the way back and the stepper in the head, then a pager over the case's set (a swipe settles on the
 * next or previous case, stopping at both ends), and Train and Mark learned at the bottom, under the thumb.
 */
function CaseDetail({ c, caseIds, cases, stats, onBack }: { c: CaseDto; caseIds?: string[]; cases: CaseDto[]; stats: Map<string, CaseStatsDto>; onBack: () => void }) {
  const replaceRoute = useSetAtom(replaceRouteAtom);
  const [learnedIds, toggleLearned] = useAtom(learnedCaseIdsAtom);
  const learned = learnedIds.includes(c.id);
  const train = useTrain();
  // The 3D player, open on one of the case's algorithms.
  const [playing, setPlaying] = useState<number | null>(null);
  // Pages come from the same set so a swipe never jumps from PLL into OLL.
  const siblings = useMemo(() => {
    const members = cases.filter(other => other.set === c.set);
    if (caseIds?.includes(c.id)) {
      const byId = new Map(members.map(other => [other.id, other]));
      return caseIds.flatMap(id => { const other = byId.get(id); return other ? [other] : []; });
    }
    // Details opened from training or the search follow the catalogue's group order.
    return [...groupCases(members).values()].flat();
  }, [cases, c.set, c.id, caseIds]);
  const index = Math.max(0, siblings.findIndex(other => other.id === c.id));
  const previous = index > 0 ? siblings[index - 1] : undefined;
  const next = index < siblings.length - 1 ? siblings[index + 1] : undefined;
  const step = useCallback((target?: CaseDto) => {
    if (target) replaceRoute({ page: "algorithms", caseId: target.id, caseIds });
  }, [replaceRoute, caseIds]);
  const [width, setWidth] = useState(0);
  const list = useRef<FlatList<CaseDto>>(null);
  // The page the list currently rests on; the stepper and route changes scroll to the new one.
  const shown = useRef(index);
  useEffect(() => {
    if (shown.current === index || !width) return;
    shown.current = index;
    list.current?.scrollToIndex({ index, animated: true });
  }, [index, width]);
  const settle = (offset: number) => {
    if (!width) return;
    const target = Math.min(siblings.length - 1, Math.max(0, Math.round(offset / width)));
    if (target === shown.current) return;
    shown.current = target;
    step(siblings[target]);
  };
  const playItem = casePlayItem(c);
  const renderPage = useCallback(({ item }: { item: CaseDto }) => <CasePage c={item} stats={stats.get(item.id)} width={width} onPlay={playItem ? setPlaying : undefined} />, [stats, width, !!playItem]);
  return <Page className="pb-0">
    <PageHead lead={<BackButton onPress={onBack} />} title={c.id} sub={`${c.setLabel} · ${c.group}`}>
      <HeadButton icon={ChevronLeft} label={tr("Previous case")} disabled={!previous} onPress={() => step(previous)} />
      <Numeric className="min-w-10 text-center text-xs text-muted-foreground">{index + 1} / {siblings.length}</Numeric>
      <HeadButton icon={ChevronRight} label={tr("Next case")} disabled={!next} onPress={() => step(next)} />
    </PageHead>
    <View className="-mx-4 min-h-0 flex-1">
      {/* The exact width, never rounded: native paging steps by the real width of the list. */}
      <View className="min-h-0 flex-1" onLayout={event => setWidth(event.nativeEvent.layout.width)}>
        {width > 0 && <FlatList ref={list} horizontal pagingEnabled showsHorizontalScrollIndicator={false} bounces={false} overScrollMode="never"
          data={siblings} keyExtractor={item => item.id} renderItem={renderPage}
          initialScrollIndex={index} getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          initialNumToRender={1} maxToRenderPerBatch={2} windowSize={3} removeClippedSubviews={false}
          onMomentumScrollEnd={event => settle(event.nativeEvent.contentOffset.x)}
          onScrollEndDrag={event => { if (!event.nativeEvent.velocity?.x) settle(event.nativeEvent.contentOffset.x); }}
          onScrollToIndexFailed={({ index: target }) => list.current?.scrollToOffset({ offset: width * target, animated: false })}
          style={{ flex: 1 }} />}
      </View>
      <CaseFoot learned={learned} onTrain={() => train(c.id)} onLearn={() => toggleLearned(c.id)} />
    </View>
    {playItem && <AlgPlayerSheet items={[playItem]} index={playing === null ? null : 0} choice={playing ?? 0} onIndex={() => {}} onClose={() => setPlaying(null)} />}
  </Page>;
}

/** The case's algorithms in the 3D player, on cube puzzles. */
function casePlayItem(c: CaseDto): PlayItem | null {
  const size = !c.diagram && (c.cube_size ?? puzzleInfo(puzzleOf(c)).cubeSize);
  return size ? { key: c.id, name: c.id, detail: c.name !== c.id ? c.name : undefined, context: `${c.setLabel} · ${c.group}`, algs: c.algorithms.map(displayAlg), note: c.notes, size, mask: maskForStage(c.stage) } : null;
}

/** Trains one case at once, skipping the setup. */
function useTrain() {
  const setRoute = useSetAtom(routeAtom), setSelection = useSetAtom(selectedCaseIdsAtom);
  return (id: string) => { setSelection([id]); setRoute({ page: "training", autostart: true }); };
}

/** A case's actions under the thumb (the web phone's touch bar): Train, then Mark learned. */
function CaseFoot({ learned, onTrain, onLearn }: { learned: boolean; onTrain: () => void; onLearn: () => void }) {
  return <View className="border-t border-border bg-muted/30 px-2 py-2">
    <TouchBar>
      <TouchAction icon={Timer} label={tr("Train")} primary onPress={onTrain} />
      <TouchAction icon={Check} label={learned ? tr("Learned") : tr("Mark learned")} pressed={learned} tone="good" onPress={onLearn} />
    </TouchBar>
  </View>;
}

/** One page of the case pager: the case (CaseBody) scrolling on its own. */
const CasePage = memo(function CasePage({ c, stats, width, onPlay }: { c: CaseDto; stats?: CaseStatsDto; width: number; onPlay?: (choice: number) => void }) {
  return <ScrollView style={{ width }} contentContainerClassName="pb-4" showsVerticalScrollIndicator={false}>
    <CaseBody c={c} stats={stats} onPlay={onPlay} />
  </ScrollView>;
});

/**
 * A case in full: picture and figures, setup, its algorithms (the one it was learned with tinted, each with how many
 * players chose it, and its own learned toggle) and the case's statistics.
 */
function CaseBody({ c, stats, onPlay }: { c: CaseDto; stats?: CaseStatsDto; onPlay?: (choice: number) => void }) {
  const solveMode = useAtomValue(solveModeAtom);
  const statsVersion = useAtomValue(statsVersionAtom);
  const learned = useAtomValue(learnedCaseIdsAtom).includes(c.id);
  const learnedAlg = useAtomValue(learnedAlgAtom), chosen = learned ? learnedAlg[c.id] : undefined;
  // How many players learned the case with each algorithm; nothing for a guest or offline.
  const [choices, setChoices] = useState<{ total: number; algs: Record<string, number> } | null>(null);
  useEffect(() => {
    let live = true;
    setChoices(null);
    void api.algorithmChoices([c.id]).then(all => { if (live) setChoices(all[c.id] ?? null); }, () => {});
    return () => { live = false; };
  }, [c.id, chosen]);
  // Learned with this algorithm; choosing the one already chosen unlearns the case.
  const choose = (alg: string) => { const on = chosen !== alg; void api.setLearned(c.id, on, on ? alg : null).catch(() => { /* Reported by the sync indicator. */ }); };
  // Computed from the local workspace, so the page never waits for its history.
  const history = useMemo(() => local.read.caseHistory(c.id, { solveMode }), [c.id, solveMode, statsVersion]);
  const info = puzzleInfo(puzzleOf(c));
  const isCube = !!info.cubeSize;
  const summary = history.summary.count ? history.summary : stats;
  const count = summary?.count ?? 0;
  const block = "gap-2 border-t border-border px-4 py-4";
  return <>
    <View className="flex-row items-center gap-6 px-4 pt-2 pb-4">
      {isCube && !c.diagram
        ? <Pressable accessibilityRole="button" accessibilityLabel={tr("Play the algorithm in 3D")} disabled={!onPlay} onPress={() => onPlay?.(0)} className="rounded-md active:opacity-70">
          <CubePreview alg={c.setup} cube={c.cube_size ?? info.cubeSize ?? 3} size={104} mask={maskForStage(c.stage)} view={viewForStage(c.stage)} />
          {onPlay ? <View className="absolute right-0 bottom-0 size-6 items-center justify-center rounded-full border border-border bg-background">
            <Icon as={Play} size={11} className="text-muted-foreground" fill="currentColor" />
          </View> : null}
        </Pressable>
        : <CaseDiagram c={c} size={104} />}
      <View className="min-w-0 flex-1 gap-3">
        {c.name !== c.id ? <Text numberOfLines={2} className="text-sm text-muted-foreground">{c.name}</Text> : null}
        <View className="flex-row gap-6">
          <Figure label={tr("Best")} value={count ? fmtTime(summary!.best) : "–"} tone="good" />
          <Figure label={tr("Mean")} value={count ? fmtTime(summary!.mean) : "–"} />
          <Figure label={tr("Attempts")} value={String(count)} />
        </View>
      </View>
    </View>
    <View className={block}>
      <Label>{tr("Setup")}</Label>
      <Alg text={isCube ? formatAlg(c.setup) : c.setup} size={17} selectable />
      {c.notes ? <Text className="text-sm text-muted-foreground">{c.notes}</Text> : null}
    </View>
    <View className={cn(block, "gap-1")}>
      <Label className="pb-1">{tr("Algorithms")}</Label>
      {c.algorithms.map((a, i) => {
        const mine = chosen === a.alg, share = choices?.total ? (choices.algs[a.alg] ?? 0) / choices.total : null;
        return <View key={i} className={cn("-mx-2 flex-row gap-4 rounded-lg px-2 py-2", mine && "bg-success/10")}>
          <Numeric className="w-4 pt-0.5 text-xs text-muted-foreground">{i + 1}</Numeric>
          <View className="min-w-0 flex-1 gap-1.5">
            <Alg text={displayAlg(a)} size={16} selectable />
            <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
              {i === 0 && <Badge variant="accent"><Text>{tr("Primary")}</Text></Badge>}
              {a.stm != null && <Numeric className="text-xs text-muted-foreground">{tr("{0} STM", { 0: a.stm })}</Numeric>}
              <Text className="text-xs text-muted-foreground">{sourceLabel(a.source)}</Text>
              {a.youtube && <Button variant="ghost" size="sm" className="-my-1 h-8 gap-1.5 px-2" onPress={() => void Linking.openURL(a.youtube!)} accessibilityLabel={tr("Watch the video")}>
                <Icon as={CirclePlay} size={15} className="text-muted-foreground" /><Text className="text-xs text-muted-foreground">{tr("Video")}</Text>
              </Button>}
              {share !== null && <View className="flex-row items-center gap-1.5" accessibilityLabel={tr("{0} of {1} players learned this case with it", { 0: choices!.algs[a.alg] ?? 0, 1: choices!.total })}>
                <Bar ratio={share} className="w-12" />
                <Numeric className="text-xs text-muted-foreground">{tr("Chosen by {0}% of players", { 0: Math.round(share * 100) })}</Numeric>
              </View>}
            </View>
            <View className="items-end">
              <LearnToggle learned={mine} onPress={() => choose(a.alg)} accessibilityLabel={mine ? tr("Learned with algorithm {0}", { 0: i + 1 }) : tr("Learn {0} with algorithm {1}", { 0: c.id, 1: i + 1 })} className="h-9" />
            </View>
          </View>
        </View>;
      })}
    </View>
    <View className={block}>
      <Label>{tr("Statistics")}</Label>
      <TimerStats compact data={history} empty={tr("No attempts on this case yet.")} />
    </View>
  </>;
}

/**
 * A case opened over another page (a course's case, the web's case dialog): the case page in a sheet, the cases of
 * `ids` a step away in its head, and Train and Mark learned at its foot. `caseId` null closes it.
 */
export function CaseSheet({ caseId, ids, onChange, onClose }: { caseId: string | null; ids: string[]; onChange: (id: string) => void; onClose: () => void }) {
  const cases = useAtomValue(casesAtom), stats = useAtomValue(statsAtom);
  const [learnedIds, toggleLearned] = useAtom(learnedCaseIdsAtom);
  const train = useTrain();
  const [playing, setPlaying] = useState<number | null>(null);
  // The last case stays drawn while the sheet goes away.
  const [shown, setShown] = useState(caseId);
  if (caseId && caseId !== shown) setShown(caseId);
  const c = cases.find(other => other.id === shown);
  if (!c) return null;
  const index = ids.indexOf(c.id), playItem = casePlayItem(c), learned = learnedIds.includes(c.id);
  return <>
    <Sheet open={!!caseId} onClose={onClose} title={c.id} description={c.name !== c.id ? c.name : `${c.setLabel} · ${c.group}`} contentClassName="gap-0 px-0"
      right={index >= 0 ? <View className="flex-row items-center">
        <HeadButton icon={ChevronLeft} label={tr("Previous case")} disabled={index <= 0} onPress={() => onChange(ids[index - 1]!)} />
        <HeadButton icon={ChevronRight} label={tr("Next case")} disabled={index >= ids.length - 1} onPress={() => onChange(ids[index + 1]!)} />
      </View> : null}>
      <SheetScrollView key={c.id} contentContainerClassName="pb-2"><CaseBody c={c} stats={stats.get(c.id)} onPlay={playItem ? setPlaying : undefined} /></SheetScrollView>
      <CaseFoot learned={learned} onTrain={() => { onClose(); train(c.id); }} onLearn={() => toggleLearned(c.id)} />
    </Sheet>
    {playItem && <AlgPlayerSheet items={[playItem]} index={playing === null ? null : 0} choice={playing ?? 0} onIndex={() => {}} onClose={() => setPlaying(null)} />}
  </>;
}
