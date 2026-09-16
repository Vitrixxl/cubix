import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { unwrap } from "jotai/utils";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, FlatList, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, type ViewToken } from "react-native";
import { fmtTime } from "../../../src/client/lib/format";
import { formatAlg } from "../../../src/shared/cube";
import { puzzleInfo, puzzleOf } from "../../../src/shared/puzzles";
import type { CaseDto, CaseHistoryDto, CaseStatsDto, SetDto, Stage } from "../../../src/shared/types";
import { api } from "../api";
import { casesAtom, collapsedAlgorithmGroupsAtom, puzzleAtom, routeAtom, selectedCaseIdsAtom, setByStageAtom, setsAtom, solveModeAtom, stageAtom, statsAtom, learningFilterAtom, learnedCaseIdsAtom } from "../state";
import { useTheme } from "../theme";
import { useLayout } from "../hooks/useLayout";
import { usePreservedList } from "../hooks/usePreservedList";
import { usePreservedScroll } from "../hooks/usePreservedScroll";
import { displayAlg, shortId } from "../lib/caseState";
import { AlgorithmBadges, AlgText } from "../components/AlgText";
import { CaseDiagram } from "../components/CaseDiagram";
import { IconBack, IconChevronDown, IconNext, IconTimer } from "../components/icons";
import { LearnedToggle } from "../components/LearnedToggle";
import { TimesChart } from "../components/TimesChart";
import { Btn, Caption, Chip, Empty, H1, Kpi, MiniBtn, Muted, Segmented, mono } from "../components/ui";

const statsMapAtom = unwrap(statsAtom, prev => prev ?? new Map<string, CaseStatsDto>());

export function AlgorithmsPage() {
  const puzzle = useAtomValue(puzzleAtom);
  const cases = useAtomValue(casesAtom);
  const sets = useAtomValue(setsAtom);
  const stats = useAtomValue(statsMapAtom);
  const [route, setRoute] = useAtom(routeAtom);
  const caseId = route.page === "algorithms" ? route.caseId : undefined;
  const selected = caseId ? cases.find(c => c.id === caseId) : undefined;
  const { pagePadding, phone } = useLayout();
  return <View style={[styles.page, { paddingHorizontal: pagePadding, paddingTop: phone ? 12 : 18 }]}>
    {selected ? <CaseDetail key={selected.id} c={selected} cases={cases} stats={stats.get(selected.id)} onBack={() => setRoute({ page: "algorithms" })} />
      : <AlgorithmBrowser key={puzzle} puzzle={puzzle} cases={cases} sets={sets} stats={stats} />}
  </View>;
}

function AlgorithmBrowser({ puzzle, cases, sets, stats }: { puzzle: string; cases: CaseDto[]; sets: SetDto[]; stats: Map<string, CaseStatsDto> }) {
  const t = useTheme();
  const { navSpace, phone, width } = useLayout();
  const [learningFilter, setLearningFilter] = useAtom(learningFilterAtom);
  const learnedIds = useAtomValue(learnedCaseIdsAtom);
  const learned = useMemo(() => new Set(learnedIds), [learnedIds]);
  const [collapsed, setCollapsed] = useAtom(collapsedAlgorithmGroupsAtom);
  const [stage, setStage] = useAtom(stageAtom);
  const [setByStage, setSetByStage] = useAtom(setByStageAtom);
  const setRoute = useSetAtom(routeAtom), setSelection = useSetAtom(selectedCaseIdsAtom);
  const sections = useMemo(() => [...new Set(sets.map(set => set.stage))].map(stage => {
    const variants = sets.filter(set => set.stage === stage);
    const active = variants.find(set => set.id === setByStage[stage]) ?? variants[0];
    const all = cases.filter(c => c.set === active.id), learnedCount = all.filter(c => learned.has(c.id)).length;
    const groups = new Map<string, CaseDto[]>();
    for (const c of all.filter(c => learningFilter === "all" || (learningFilter === "learned") === learned.has(c.id))) { const list = groups.get(c.group) ?? []; list.push(c); groups.set(c.group, list); }
    return { stage, variants, active, all, learnedCount, groups: [...groups] };
  }), [sets, cases, setByStage, learned, learningFilter]);
  const inner = Math.min(width, 1100) - 2 * (phone ? 14 : 24) - 4;
  const columns = Math.max(2, Math.floor(inner / (phone ? 104 : 128)));
  const cardWidth = Math.floor((inner - 4 * (columns - 1)) / columns);
  type Section = typeof sections[number];
  type Row = { key: string; stage: Stage } & (
    | { kind: "stage"; section: Section }
    | { kind: "group"; group: string; list: CaseDto[]; expanded: boolean }
    | { kind: "cards"; cases: CaseDto[] }
    | { kind: "empty" }
  );
  const rows = useMemo(() => {
    const result: Row[] = [];
    for (const section of sections) {
      const { stage, active, groups } = section;
      result.push({ key: stage, stage, kind: "stage", section });
      for (const [group, list] of groups) {
        const key = `${active.id}:${group}`, expanded = !collapsed[key];
        result.push({ key, stage, kind: "group", group, list, expanded });
        if (expanded) for (let i = 0; i < list.length; i += columns)
          result.push({ key: `${key}:${i}`, stage, kind: "cards", cases: list.slice(i, i + columns) });
      }
      if (!groups.length) result.push({ key: `${stage}:empty`, stage, kind: "empty" });
    }
    return result;
  }, [sections, collapsed, columns]);
  const listKey = `algorithms:${puzzle}:${learningFilter}:${columns}`;
  const scroll = usePreservedList<Row>(listKey);
  const pendingJump = useRef<number | null>(null);
  const jumpTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(jumpTimer.current), []);
  const jumpTo = (target: Stage) => {
    const index = rows.findIndex(row => row.kind === "stage" && row.stage === target);
    if (index < 0) return;
    pendingJump.current = index;
    setStage(target);
    scroll.ref.current?.scrollToIndex({ index, animated: false, viewPosition: 0 });
  };
  const viewability = useRef({ itemVisiblePercentThreshold: 1 });
  const trackStage = useCallback(({ viewableItems }: { viewableItems: ViewToken<Row>[] }) => {
    if (pendingJump.current !== null) {
      if (!viewableItems.some(item => item.index === pendingJump.current)) return;
      pendingJump.current = null;
    }
    if (viewableItems[0]) setStage(viewableItems[0].item.stage);
  }, [setStage]);
  const openCase = useCallback((id: string) => setRoute({ page: "algorithms", caseId: id }), [setRoute]);
  const trainAll = (list: CaseDto[]) => { setSelection(list.map(c => c.id)); setRoute({ page: "training", autostart: true }); };
  return <View style={styles.browser}>
    <View style={styles.toolbar}>
      <Segmented options={sections.map(s => ({ id: s.stage, label: s.stage }))} value={stage} onChange={jumpTo} />
      <View style={{ flexDirection: "row", gap: 4 }} accessibilityLabel="Learning status">
        {(["learned", "not-learned"] as const).map(filter => <Btn key={filter} small pressed={learningFilter === filter} onPress={() => setLearningFilter(value => value === filter ? "all" : filter)} label={filter === "learned" ? "Learned" : "Not learned"}>
          <Text style={[mono(t, 12), { color: t.readableMuted }]}>{sections.reduce((sum, s) => sum + (filter === "learned" ? s.learnedCount : s.all.length - s.learnedCount), 0)}</Text>
        </Btn>)}
      </View>
    </View>
    <FlatList key={listKey} {...scroll} data={rows} keyExtractor={row => row.key}
      initialNumToRender={8} maxToRenderPerBatch={6} windowSize={5} scrollEventThrottle={64}
      viewabilityConfig={viewability.current} onViewableItemsChanged={trackStage}
      onScrollToIndexFailed={({ index, averageItemLength }) => {
        scroll.ref.current?.scrollToOffset({ offset: averageItemLength * index, animated: false });
        clearTimeout(jumpTimer.current);
        jumpTimer.current = setTimeout(() => {
          if (pendingJump.current !== null) scroll.ref.current?.scrollToIndex({ index: pendingJump.current, animated: false });
        }, 100);
      }}
      onScrollBeginDrag={() => { pendingJump.current = null; clearTimeout(jumpTimer.current); }}
      style={{ flex: 1 }} contentContainerStyle={{ paddingRight: 4, paddingBottom: navSpace }}
      renderItem={({ item: row }) => {
        if (row.kind === "stage") return <View style={[styles.stageHeader, row.stage === sections[0]?.stage && { marginTop: 2 }]}>
          <Text style={{ color: t.text, fontSize: 20, fontWeight: "700" }}>{row.stage}</Text>
          {row.section.variants.length > 1 && <Segmented small options={row.section.variants.map(v => ({ id: v.id, label: v.label, count: v.count }))} value={row.section.active.id} onChange={id => setSetByStage(previous => ({ ...previous, [row.stage]: id }))} />}
        </View>;
        if (row.kind === "group") return <View style={styles.groupTitle}>
          <Pressable onPress={() => setCollapsed(previous => ({ ...previous, [row.key]: !previous[row.key] }))} style={styles.groupToggle} accessibilityState={{ expanded: row.expanded }}>
            <View style={{ transform: [{ rotate: row.expanded ? "0deg" : "-90deg" }] }}><IconChevronDown size={14} color={t.text2} /></View>
            <Text style={{ color: t.text2, fontSize: 15, fontWeight: "600", flexShrink: 1 }} numberOfLines={1}>{row.group}</Text>
            <Text style={[mono(t, 12), { color: t.readableMuted }]}>{row.list.length}</Text>
          </Pressable>
          <MiniBtn icon={<IconTimer size={13} color={t.readableMuted} />} label="Train all" onPress={() => trainAll(row.list)} />
        </View>;
        if (row.kind === "cards") return <View style={styles.grid}>{row.cases.map(c => <CaseCard key={c.id} c={c} stats={stats.get(c.id)} onOpen={openCase} width={cardWidth} phone={phone} />)}</View>;
        return <Empty><Muted>{learningFilter === "learned" ? "No learned cases in this set yet." : "No not learned cases in this set."}</Muted><Btn small label="Show all cases" onPress={() => setLearningFilter("all")} /></Empty>;
      }} />
  </View>;
}

const CaseCard = memo(function CaseCard({ c, stats, onOpen, width, phone }: { c: CaseDto; stats?: CaseStatsDto; onOpen: (id: string) => void; width: number; phone: boolean }) {
  const t = useTheme();
  return <View style={[styles.card, { width, paddingTop: phone ? 10 : 14, paddingBottom: phone ? 8 : 10 }]}>
    <Pressable onPress={() => onOpen(c.id)} style={({ pressed }) => [styles.cardOpen, { backgroundColor: pressed ? t.hover : "transparent" }]}>
      {stats && <View style={[styles.trainedDot, { backgroundColor: t.accent }]} />}
      <View style={{ marginBottom: 6 }}><CaseDiagram c={c} size={phone ? 80 : 96} /></View>
      <Text style={{ color: t.text, fontSize: 15, fontWeight: "700" }}>{shortId(c)}</Text>
      {c.name !== c.id && <Text numberOfLines={1} style={{ color: t.text2, fontSize: 12, maxWidth: "100%" }}>{c.name}</Text>}
      <Text style={[mono(t, 12), { color: t.readableMuted }]}>{stats ? <><Text style={{ color: t.text2, fontWeight: "600" }}>{fmtTime(stats.best)}</Text> · {fmtTime(stats.mean)}</> : "—"}</Text>
    </Pressable>
    <LearnedToggle caseId={c.id} />
  </View>;
});

/** Horizontal swipe threshold, in points, before the detail page steps to a neighbouring case. */
const SWIPE_DISTANCE = 64;

function CaseDetail({ c, cases, stats, onBack }: { c: CaseDto; cases: CaseDto[]; stats?: CaseStatsDto; onBack: () => void }) {
  const t = useTheme();
  const { navSpace, phone } = useLayout();
  const setRoute = useSetAtom(routeAtom);
  // Neighbours come from the same set so a swipe never jumps from PLL into OLL.
  const siblings = useMemo(() => cases.filter(other => other.set === c.set), [cases, c.set]);
  const index = siblings.findIndex(other => other.id === c.id);
  const previous = index > 0 ? siblings[index - 1] : undefined;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : undefined;
  const step = useCallback((target?: CaseDto) => { if (target) setRoute({ page: "algorithms", caseId: target.id }); }, [setRoute]);
  const drag = useRef(new Animated.Value(0)).current;
  const neighbours = useRef({ previous, next, step });
  neighbours.current = { previous, next, step };
  // The responder only claims clearly horizontal moves so vertical scrolling and taps keep working.
  const swipe = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 16 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,
    onPanResponderMove: (_, gesture) => drag.setValue(gesture.dx / 3),
    onPanResponderRelease: (_, gesture) => {
      const { previous, next, step } = neighbours.current;
      const target = gesture.dx <= -SWIPE_DISTANCE ? next : gesture.dx >= SWIPE_DISTANCE ? previous : undefined;
      Animated.spring(drag, { toValue: 0, useNativeDriver: true, speed: 30, bounciness: 4 }).start();
      step(target);
    },
    onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start(),
  }), [drag]);
  const setSelection = useSetAtom(selectedCaseIdsAtom);
  const solveMode = useAtomValue(solveModeAtom);
  const scroll = usePreservedScroll(`case:${c.id}:detail`);
  const [history, setHistory] = useState<CaseHistoryDto | null>(null);
  const isCube = !!puzzleInfo(puzzleOf(c)).cubeSize;
  useEffect(() => { let alive = true; api.caseHistory(c.id, { solveMode }).then(h => alive && setHistory(h)); return () => { alive = false; }; }, [c.id, stats?.count, solveMode]);
  const train = () => { setSelection([c.id]); setRoute({ page: "training", autostart: true }); };
  const summary = history?.summary ?? stats;
  return <Animated.View style={[styles.browser, { transform: [{ translateX: drag }] }]} {...swipe.panHandlers}>
    <View style={styles.toolbar}>
      <Btn small variant="ghost" icon={<IconBack size={16} color={t.text2} />} label={c.setLabel} onPress={onBack} />
      <View style={styles.stepper}>
        <Btn small variant="ghost" iconOnly icon={<IconBack size={16} color={previous ? t.text2 : t.muted} />} disabled={!previous} onPress={() => step(previous)} accessibilityLabel="Previous case" />
        <Text style={[mono(t, 12), { color: t.text2, minWidth: 44, textAlign: "center" }]}>{index + 1} / {siblings.length}</Text>
        <Btn small variant="ghost" iconOnly icon={<IconNext size={16} color={next ? t.text2 : t.muted} />} disabled={!next} onPress={() => step(next)} accessibilityLabel="Next case" />
      </View>
      <Btn small variant="primary" icon={<IconTimer size={16} color="#fff" />} label="Train" onPress={train} />
    </View>
    <ScrollView ref={scroll.ref} onScroll={scroll.onScroll} onContentSizeChange={scroll.onContentSizeChange} scrollEventThrottle={64} style={{ flex: 1 }} contentContainerStyle={{ gap: 22, paddingTop: 4, paddingHorizontal: 4, paddingBottom: navSpace }}>
      <View style={[styles.hero, { gap: phone ? 14 : 24 }]}>
        <CaseDiagram c={c} size={phone ? 110 : 150} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <H1 size={phone ? 24 : 30}>{c.id}</H1>
          {c.name !== c.id && <Text style={{ color: t.text2, fontSize: 15, marginTop: 2, marginBottom: 10 }}>{c.name}</Text>}
          <View style={styles.chips}><Chip label={c.group} />{c.subgroup && c.subgroup !== c.group && <Chip label={c.subgroup} />}{c.probability && <Chip label={`P = ${c.probability}`} />}</View>
          <View style={{ alignSelf: "flex-start" }}><LearnedToggle caseId={c.id} /></View>
        </View>
      </View>
      <View style={styles.card2}>
        <Caption>Setup</Caption>
        <AlgText alg={isCube ? formatAlg(c.setup) : c.setup} size={phone ? 17 : 21} lineHeight={(phone ? 17 : 21) * 1.7} />
        {c.setups_alt.length > 0 && <Muted size={13}>Also: {c.setups_alt.map((setup, i) => <Text key={i}>{i > 0 && " · "}<AlgText alg={isCube ? formatAlg(setup) : setup} size={13} color={t.readableMuted} /></Text>)}</Muted>}
        {c.notes && <Muted size={13}>{c.notes}</Muted>}
      </View>
      <View style={styles.card2}>
        <Caption>Algorithms</Caption>
        <View>{c.algorithms.map((a, i) => <View key={i} style={[styles.algRow, { borderBottomColor: t.line }]}><AlgText alg={displayAlg(a)} size={phone ? 15 : 18} style={{ flexShrink: 1 }} /><AlgorithmBadges algorithm={a} primary={i === 0} /></View>)}</View>
      </View>
      <View style={styles.card2}>
        <Caption>Statistics</Caption>
        {summary && summary.count > 0 ? <>
          <View style={styles.kpiRow}>
            <Kpi label="Solves" value={String(summary.count)} /><Kpi label="Best" value={fmtTime(summary.best)} /><Kpi label="Mean" value={fmtTime(summary.mean)} />
            <Kpi label="Ao5" value={fmtTime(summary.ao5)} /><Kpi label="Ao12" value={fmtTime(summary.ao12)} /><Kpi label="Best Ao5" value={fmtTime(summary.bestAo5)} />
          </View>
          {history && <TimesChart history={history.history} ao5={history.ao5} />}
        </> : <Empty>No solves yet.</Empty>}
      </View>
    </ScrollView>
  </Animated.View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, width: "100%", maxWidth: 1100, alignSelf: "center", minHeight: 0 },
  browser: { flex: 1, gap: 12, minHeight: 0 },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", columnGap: 12, rowGap: 10 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 2 },
  stageHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginTop: 18, marginBottom: 6 },
  groupTitle: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, marginBottom: 4 },
  groupToggle: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minHeight: 38, minWidth: 0 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  card: { alignItems: "center", gap: 2, paddingHorizontal: 4, borderRadius: 16 },
  cardOpen: { width: "100%", alignItems: "center", gap: 2, borderRadius: 10 },
  trainedDot: { position: "absolute", top: -4, right: 6, width: 6, height: 6, borderRadius: 3 },
  hero: { flexDirection: "row", alignItems: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  card2: { gap: 10 },
  algRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: 14, rowGap: 6, paddingVertical: 12, borderBottomWidth: 1 },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", columnGap: 24, rowGap: 12 },
});
