import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, CirclePlay, RotateCcw, Timer } from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, FlatList, Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { catalogSections, groupCases } from "../../../src/client/lib/practiceCatalog";
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
import { local } from "../api";
import { sourceLabel } from "../components/AlgText";
import { CaseDiagram } from "../components/CaseDiagram";
import { MethodsSheet } from "../components/GuidesDialog";
import { Alg, BackButton, Choice, Empty, Figure, Label, MenuItem, Mono, MoreMenu, Page, PageHead, SearchField, Surface, TouchAction, TouchBar } from "../components/layout";
import { CubePreview } from "../components/Practice";
import { SessionButton } from "../components/PuzzlePicker";
import { TimerStats } from "../components/TimesChart";
import { useLayout } from "../hooks/useLayout";
import { usePreservedList } from "../hooks/usePreservedList";
import { useSlide } from "../hooks/useSlide";
import { displayAlg, maskForStage, shortId } from "../lib/caseState";
import {
  casesAtom, collapsedAlgorithmGroupsAtom, goBackAtom, guidesAtom, learnedCaseIdsAtom, learningFilterAtom, previousRouteAtom, puzzleAtom,
  replaceRouteAtom, routeAtom, selectedCaseIdsAtom, setByStageAtom, setsAtom, solveModeAtom, stageAtom, statsAtom, statsVersionAtom,
} from "../state";

/**
 * Algorithms, as the web app on a phone: a search over every case, the stage tabs, the set and learning filters, then
 * the cases of the stage as large rows grouped by family. A case opens as a page of its own that slides over the list.
 * The route is passed in rather than read, so a page sliding out keeps showing what it showed.
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
  | { kind: "case"; key: string; c: CaseDto }
  | { kind: "empty"; key: string };

/** Every word of the search appears in the case's number, name, set, stage or group. */
const matches = (c: CaseDto, query: string) => {
  const text = [c.id, c.name, c.setLabel, c.stage, c.group, c.subgroup].join(" ").toLowerCase();
  return query.toLowerCase().split(/\s+/).every(word => text.includes(word));
};

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
  // Counts ignore the learning filter: the header and the filter always describe the whole set.
  const everything = useMemo(() => catalogSections(cases, sets, setByStage, learned, "all"), [sets, cases, setByStage, learned]);
  const sections = useMemo(() => catalogSections(cases, sets, setByStage, learned, learningFilter), [sets, cases, setByStage, learned, learningFilter]);
  const section = sections.find(s => s.stage === stage) ?? sections[0];
  const whole = everything.find(s => s.stage === section?.stage);
  const learnedTotal = everything.reduce((sum, s) => sum + s.learnedCount, 0);
  const total = everything.reduce((sum, s) => sum + s.all.length, 0);
  const found = query.trim() ? cases.filter(c => matches(c, query.trim())).slice(0, 80) : null;
  const rows = useMemo(() => {
    const result: Row[] = [];
    if (found) { for (const c of found) result.push({ kind: "case", key: c.id, c }); return result; }
    if (!section) return result;
    for (const [group, list] of section.groups) {
      const key = `${section.active.id}:${group}`, expanded = !collapsed[key];
      result.push({ kind: "group", key, group, list, expanded });
      if (expanded) for (const c of list) result.push({ kind: "case", key: c.id, c });
    }
    if (!section.groups.length) result.push({ kind: "empty", key: "empty" });
    return result;
  }, [section, collapsed, found]);
  const listKey = found ? `algorithms-search:${puzzle}` : `algorithms:${puzzle}:${learningFilter}:${section?.active.id ?? "empty"}`;
  const scroll = usePreservedList<Row>(listKey);
  const openCase = useCallback((id: string) => {
    // Freeze the visible order for this visit, including filters and collapsed groups.
    const caseIds = found ? undefined : rows.flatMap(row => row.kind === "case" ? [row.c.id] : []);
    setRoute({ page: "algorithms", caseId: id, caseIds });
  }, [rows, found, setRoute]);
  const trainAll = (list: CaseDto[]) => { setSelection(list.map(c => c.id)); setRoute({ page: "training", autostart: true }); };
  const renderRow = ({ item: row }: { item: Row }) => {
    if (row.kind === "group") return <View className="-mx-2 flex-row items-center gap-1 bg-background pr-1 pt-2">
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: row.expanded }} onPress={() => setCollapsed(previous => ({ ...previous, [row.key]: !previous[row.key] }))}
        className="h-10 min-w-0 flex-1 flex-row items-center gap-2 rounded-lg px-2 active:bg-muted/50">
        <Icon as={row.expanded ? ChevronDown : ChevronRight} size={16} className="text-muted-foreground" />
        <Text numberOfLines={1} className="shrink text-sm font-medium">{row.group}</Text>
        <Mono className="text-xs text-muted-foreground">{row.list.length}</Mono>
      </Pressable>
      <Button variant="ghost" size="sm" className="h-9 gap-1.5 px-2.5" accessibilityLabel={`Train ${row.group}`} onPress={() => trainAll(row.list)}>
        <Icon as={Timer} size={15} className="text-muted-foreground" />
        <Text className="text-[13px] text-muted-foreground">Train</Text>
      </Button>
    </View>;
    if (row.kind === "case") return <CaseRow c={row.c} best={stats.get(row.c.id)?.best} learned={learned.has(row.c.id)} detail={found ? `${row.c.setLabel} · ${row.c.group}` : undefined} onOpen={openCase} onToggle={toggleLearned} />;
    return <Empty>{learningFilter === "learned" ? "No learned cases in this set yet." : "Every case of this set is learned."}</Empty>;
  };
  return <Page className="gap-3 pb-0">
    <PageHead title="Algorithms" sub={`${learnedTotal} of ${total} learned`}>
      <SessionButton />
      <MoreMenu>
        <MenuItem icon={BookOpen} onPress={() => setMethods(true)}>Solving methods</MenuItem>
        <MenuItem icon={BookOpen} onPress={() => openGuides("algorithms")}>Algorithms guide</MenuItem>
      </MoreMenu>
    </PageHead>
    <SearchField value={query} onChangeText={setQuery} placeholder="Search cases: oll 21, pll t…" />
    {!found && section && <View className="gap-2 border-b border-border pb-3">
      {sections.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} className="grow-0" contentContainerClassName="gap-5">
        {sections.map(s => {
          const on = s.stage === section.stage;
          return <Pressable key={s.stage} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setStage(s.stage)} className="h-9 justify-center">
            <Text className={cn("text-[15px] font-medium", on ? "text-foreground" : "text-muted-foreground")}>{s.stage}</Text>
            <View className={cn("absolute right-0 bottom-0 left-0 h-0.5 rounded-full", on ? "bg-foreground" : "bg-transparent")} />
          </Pressable>;
        })}
      </ScrollView>}
      {section.variants.length > 1 && <Choice label="Set" value={section.active.id} onChange={id => setSetByStage(previous => ({ ...previous, [section.stage]: id }))}
        options={section.variants.map(v => ({ id: v.id, label: v.label.startsWith(`${section.stage} `) ? v.label.slice(section.stage.length + 1) : v.label, count: v.count }))} />}
      <Choice label="Filter" value={learningFilter} onChange={setLearningFilter} options={[
        { id: "all", label: "All", count: whole?.all.length ?? 0 },
        { id: "learned", label: "Learned", count: whole?.learnedCount ?? 0 },
        { id: "not-learned", label: "To learn", count: (whole?.all.length ?? 0) - (whole?.learnedCount ?? 0) },
      ]} />
    </View>}
    <FlatList key={listKey} {...scroll} data={rows} keyExtractor={row => row.key} renderItem={renderRow} keyboardShouldPersistTaps="handled"
      initialNumToRender={14} maxToRenderPerBatch={10} windowSize={7} scrollEventThrottle={64}
      className="-mx-4 flex-1" contentContainerClassName="px-4 pb-4"
      ListEmptyComponent={<Empty>{found ? "No case matches." : "No cases for this puzzle."}</Empty>} />
    <MethodsSheet open={methods} onClose={() => setMethods(false)} />
  </Page>;
}

/** A case: its picture, number and name, best time and the learned toggle. */
const CaseRow = memo(function CaseRow({ c, best, learned, detail, onOpen, onToggle }: { c: CaseDto; best?: number | null; learned: boolean; detail?: string; onOpen: (id: string) => void; onToggle: (id: string) => void }) {
  return <View className="-mx-2 flex-row items-center gap-1 rounded-lg">
    <Pressable onPress={() => onOpen(c.id)} accessibilityRole="button" accessibilityLabel={c.name !== c.id ? `${c.id}, ${c.name}` : c.id}
      className="min-w-0 flex-1 flex-row items-center gap-3 rounded-lg py-1.5 pl-2 active:bg-muted/50">
      <CaseDiagram c={c} size={48} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-sm font-medium">{shortId(c)}</Text>
        {detail ?? (c.name !== c.id && c.name) ? <Text numberOfLines={1} className="text-xs text-muted-foreground">{detail ?? c.name}</Text> : null}
      </View>
      <Mono className={cn("text-sm", best != null ? "text-foreground/80" : "text-muted-foreground/50")}>{best != null ? fmtTime(best) : "–"}</Mono>
    </Pressable>
    {/* The learned status after the time, like an issue's status: a green disc with a check, or a quiet dashed circle. */}
    <Pressable onPress={() => onToggle(c.id)} accessibilityRole="checkbox" accessibilityState={{ checked: learned }} accessibilityLabel={learned ? `${c.id} learned` : `Mark ${c.id} learned`}
      className="size-11 items-center justify-center rounded-full active:bg-muted/50">
      {learned ? <View className="size-4 items-center justify-center rounded-full bg-success">
        <Icon as={Check} size={12} strokeWidth={3} className="text-background" />
      </View> : <View className="size-4 rounded-full border-[1.5px] border-dashed border-muted-foreground/40" />}
    </Pressable>
  </View>;
});

/**
 * The case page: the way back and the stepper in the head, then a pager over the case's set (a swipe settles on the
 * next or previous case, stopping at both ends), and Train, Learned and Replay at the bottom, under the thumb.
 */
function CaseDetail({ c, caseIds, cases, stats, onBack }: { c: CaseDto; caseIds?: string[]; cases: CaseDto[]; stats: Map<string, CaseStatsDto>; onBack: () => void }) {
  const replaceRoute = useSetAtom(replaceRouteAtom);
  const [learnedIds, toggleLearned] = useAtom(learnedCaseIdsAtom);
  const learned = learnedIds.includes(c.id);
  const setRoute = useSetAtom(routeAtom), setSelection = useSetAtom(selectedCaseIdsAtom);
  const [replay, setReplay] = useState(0);
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
  const cube = !c.diagram && !!puzzleInfo(puzzleOf(c)).cubeSize;
  const renderPage = useCallback(({ item }: { item: CaseDto }) => <CasePage c={item} stats={stats.get(item.id)} width={width} replay={item.id === c.id ? replay : 0} />, [stats, width, replay, c.id]);
  const train = () => { setSelection([c.id]); setRoute({ page: "training", autostart: true }); };
  return <Page>
    <PageHead lead={<BackButton onPress={onBack} />} title={c.id} sub={`${c.setLabel} · ${c.group}`}>
      <Button variant="outline" size="icon" className="size-9" disabled={!previous} onPress={() => step(previous)} accessibilityLabel="Previous case"><Icon as={ChevronLeft} size={18} /></Button>
      <Mono className="min-w-10 text-center text-xs text-muted-foreground">{index + 1} / {siblings.length}</Mono>
      <Button variant="outline" size="icon" className="size-9" disabled={!next} onPress={() => step(next)} accessibilityLabel="Next case"><Icon as={ChevronRight} size={18} /></Button>
    </PageHead>
    <Surface className="flex-1">
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
      <TouchBar className="border-t border-border bg-muted/30 px-2 py-2">
        <TouchAction icon={Timer} label="Train" primary onPress={train} accessibilityLabel={`Train ${c.id}`} />
        <TouchAction icon={Check} label={learned ? "Learned" : "Mark learned"} pressed={learned} tone="good" onPress={() => toggleLearned(c.id)} accessibilityLabel={`${c.id} learned`} />
        {cube && <TouchAction icon={RotateCcw} label="Replay" onPress={() => setReplay(n => n + 1)} accessibilityLabel="Replay the setup on the cube" />}
      </TouchBar>
    </Surface>
  </Page>;
}

/** One page of the case pager: picture and figures, setup, algorithms and the case's own statistics. */
const CasePage = memo(function CasePage({ c, stats, width, replay }: { c: CaseDto; stats?: CaseStatsDto; width: number; replay: number }) {
  const solveMode = useAtomValue(solveModeAtom);
  const statsVersion = useAtomValue(statsVersionAtom);
  // Computed from the local workspace, so the page never waits for its history.
  const history = useMemo(() => local.read.caseHistory(c.id, { solveMode }), [c.id, solveMode, statsVersion]);
  const info = puzzleInfo(puzzleOf(c));
  const isCube = !!info.cubeSize;
  const summary = history.summary.count ? history.summary : stats;
  const count = summary?.count ?? 0;
  const block = "gap-2 border-t border-border px-4 py-4";
  return <ScrollView style={{ width }} contentContainerClassName="pb-4" showsVerticalScrollIndicator={false}>
    <View className="flex-row items-center gap-6 px-4 pt-4 pb-4">
      {isCube && !c.diagram
        ? <CubePreview alg={c.setup} cube={c.cube_size ?? info.cubeSize ?? 3} size={112} mask={maskForStage(c.stage)} view={viewForStage(c.stage)} replay={replay} />
        : <CaseDiagram c={c} size={104} />}
      <View className="min-w-0 flex-1 gap-3">
        {c.name !== c.id ? <Text numberOfLines={2} className="text-sm text-muted-foreground">{c.name}</Text> : null}
        <View className="flex-row gap-6">
          <Figure label="Best" value={count ? fmtTime(summary!.best) : "–"} tone="good" />
          <Figure label="Mean" value={count ? fmtTime(summary!.mean) : "–"} />
          <Figure label="Attempts" value={String(count)} />
        </View>
      </View>
    </View>
    <View className={block}>
      <Label>Setup</Label>
      <Alg text={isCube ? formatAlg(c.setup) : c.setup} size={17} selectable />
      {c.setups_alt.length > 0 && <Text className="text-[13px] leading-[20px] text-muted-foreground">Also: {c.setups_alt.map(setup => isCube ? formatAlg(setup) : setup).join(" · ")}</Text>}
      {c.notes ? <Text className="text-[13px] leading-[20px] text-muted-foreground">{c.notes}</Text> : null}
      {c.probability ? <Text className="text-[13px] text-muted-foreground">Probability {c.probability}</Text> : null}
    </View>
    <View className={cn(block, "gap-1")}>
      <Label className="pb-1">Algorithms</Label>
      {c.algorithms.map((a, i) => <View key={i} className="flex-row gap-4 py-2">
        <Mono className="w-4 pt-0.5 text-xs text-muted-foreground">{i + 1}</Mono>
        <View className="min-w-0 flex-1 gap-1.5">
          <Alg text={displayAlg(a)} size={16} selectable />
          <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
            {i === 0 && <Badge variant="secondary"><Text className="text-primary">Primary</Text></Badge>}
            {a.recommended_by?.includes("jperm") && <Text className="text-xs text-muted-foreground">J Perm pick</Text>}
            {a.stm != null && <Mono className="text-xs text-muted-foreground">{a.stm} STM</Mono>}
            <Text className="text-xs text-muted-foreground">{sourceLabel(a.source)}</Text>
            {a.youtube && <Button variant="ghost" size="sm" className="-my-1 h-8 gap-1.5 px-2" onPress={() => void Linking.openURL(a.youtube!)} accessibilityLabel="Watch the video">
              <Icon as={CirclePlay} size={15} className="text-muted-foreground" /><Text className="text-xs text-muted-foreground">Video</Text>
            </Button>}
          </View>
        </View>
      </View>)}
    </View>
    <View className={block}>
      <Label>Statistics</Label>
      <TimerStats compact data={history} empty="No attempts on this case yet." />
    </View>
  </ScrollView>;
});
