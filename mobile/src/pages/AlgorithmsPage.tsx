import { catalogSections, groupCases } from "../../../src/client/lib/practiceCatalog";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, FlatList, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fmtTime } from "../../../src/client/lib/format";
import { formatAlg } from "../../../src/shared/cube";
import { puzzleInfo, puzzleOf } from "../../../src/shared/puzzles";
import type { CaseDto, CaseStatsDto, SetDto } from "../../../src/shared/types";
import { local } from "../api";
import { casesAtom, collapsedAlgorithmGroupsAtom, puzzleAtom, routeAtom, replaceRouteAtom, goBackAtom, previousRouteAtom, selectedCaseIdsAtom, setByStageAtom, setsAtom, solveModeAtom, stageAtom, statsAtom, statsVersionAtom, learningFilterAtom, learnedCaseIdsAtom } from "../state";
import { FONT, useTheme } from "../theme";
import { useLayout } from "../hooks/useLayout";
import { useSlide } from "../hooks/useSlide";
import { usePreservedList } from "../hooks/usePreservedList";
import { usePreservedScroll } from "../hooks/usePreservedScroll";
import { displayAlg, shortId } from "../lib/caseState";
import { AlgText, sourceLabel } from "../components/AlgText";
import { CaseDiagram } from "../components/CaseDiagram";
import { MethodsDialog } from "../components/GuidesDialog";
import { IconBack, IconBook, IconCheck, IconChevronDown, IconNext, IconTimer } from "../components/icons";
import { PuzzlePicker } from "../components/PuzzlePicker";
import { Sheet } from "../components/Sheet";
import { TimesChart } from "../components/TimesChart";
import { Btn, CheckCell, Control, Empty, Input, Label, ListRow, Mark, Metric, Metrics, PageHead, Segmented, mono, CellGroup } from "../components/ui";

/**
 * Algorithms, as the web app on a phone: the case list of one stage (stage tabs, set variants, learning filter,
 * collapsible groups), and a case opened as a page of its own that slides over the list.
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
  // Opening a case pushes the list off to the left and brings the detail in from the right; closing reverses it.
  // The detail stays rendered while it slides out.
  const [shown, setShown] = useState(selected);
  if (selected && selected !== shown) setShown(selected);
  const progress = useSlide(!!selected, () => setShown(undefined));
  const detail = selected ?? shown;
  const closeCase = () => {
    if (previousRoute?.page === "algorithms" && !previousRoute.caseId) goBack();
    else replaceRoute({ page: "algorithms" });
  };
  return <View style={styles.page}>
    {/* Keep the native list and its viewport mounted while a case is open. */}
    <Animated.View style={{ flex: 1, transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -width] }) }] }} pointerEvents={selected ? "none" : "auto"}
      accessibilityElementsHidden={!!selected} importantForAccessibility={selected ? "no-hide-descendants" : "auto"}>
      <AlgorithmBrowser key={puzzle} puzzle={puzzle} cases={cases} sets={sets} stats={stats} />
    </Animated.View>
    {detail && <Animated.View pointerEvents={selected ? "auto" : "none"} style={[StyleSheet.absoluteFill, { transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [width, 0] }) }] }]}>
      <CaseDetail key={detail.set} c={detail} caseIds={caseIds} cases={cases} stats={stats} onBack={closeCase} />
    </Animated.View>}
  </View>;
}

type Row =
  | { kind: "group"; key: string; group: string; list: CaseDto[]; expanded: boolean }
  | { kind: "case"; key: string; c: CaseDto }
  | { kind: "empty"; key: string };

function AlgorithmBrowser({ puzzle, cases, sets, stats }: { puzzle: string; cases: CaseDto[]; sets: SetDto[]; stats: Map<string, CaseStatsDto> }) {
  const t = useTheme();
  const { navSpace } = useLayout();
  const [learningFilter, setLearningFilter] = useAtom(learningFilterAtom);
  const [learnedIds, toggleLearned] = useAtom(learnedCaseIdsAtom);
  const learned = useMemo(() => new Set(learnedIds), [learnedIds]);
  const [collapsed, setCollapsed] = useAtom(collapsedAlgorithmGroupsAtom);
  const [stage, setStage] = useAtom(stageAtom);
  const [setByStage, setSetByStage] = useAtom(setByStageAtom);
  const setRoute = useSetAtom(routeAtom), setSelection = useSetAtom(selectedCaseIdsAtom);
  const [searching, setSearching] = useState(false), [methods, setMethods] = useState(false);
  // Counts ignore the learning filter: the header and the filter always describe the whole set.
  const everything = useMemo(() => catalogSections(cases, sets, setByStage, learned, "all"), [sets, cases, setByStage, learned]);
  const sections = useMemo(() => catalogSections(cases, sets, setByStage, learned, learningFilter), [sets, cases, setByStage, learned, learningFilter]);
  const section = sections.find(s => s.stage === stage) ?? sections[0];
  const whole = everything.find(s => s.stage === section?.stage);
  const learnedTotal = everything.reduce((sum, s) => sum + s.learnedCount, 0);
  const total = everything.reduce((sum, s) => sum + s.all.length, 0);
  const rows = useMemo(() => {
    const result: Row[] = [];
    if (!section) return result;
    for (const [group, list] of section.groups) {
      const key = `${section.active.id}:${group}`, expanded = !collapsed[key];
      result.push({ kind: "group", key, group, list, expanded });
      if (expanded) for (const c of list) result.push({ kind: "case", key: c.id, c });
    }
    if (!section.groups.length) result.push({ kind: "empty", key: "empty" });
    return result;
  }, [section, collapsed]);
  const listKey = `algorithms:${puzzle}:${learningFilter}:${section?.active.id ?? "empty"}`;
  const scroll = usePreservedList<Row>(listKey);
  const openCase = useCallback((id: string) => {
    // Freeze the visible order for this visit, including filters and collapsed groups.
    const caseIds = rows.flatMap(row => row.kind === "case" ? [row.c.id] : []);
    setRoute({ page: "algorithms", caseId: id, caseIds });
  }, [rows, setRoute]);
  const trainAll = (list: CaseDto[]) => { setSelection(list.map(c => c.id)); setRoute({ page: "training", autostart: true }); };
  const renderRow = ({ item: row }: { item: Row }) => {
    if (row.kind === "group") return <View style={[styles.groupHead, { backgroundColor: t.bg }]}>
      <Pressable onPress={() => setCollapsed(previous => ({ ...previous, [row.key]: !previous[row.key] }))} accessibilityState={{ expanded: row.expanded }}
        style={({ pressed }) => [styles.groupTitle, { backgroundColor: pressed ? t.hover : "transparent" }]}>
        <View style={{ transform: [{ rotate: row.expanded ? "0deg" : "-90deg" }] }}><IconChevronDown size={12} color={t.muted} /></View>
        <Text style={[styles.groupName, { color: t.secondary }]} numberOfLines={1}>{row.group}</Text>
        <Text style={[mono(t, 11.5, "400"), { color: t.muted }]}>{row.list.length}</Text>
      </Pressable>
      <Btn variant="ghost" small icon={IconTimer} label="Train" accessibilityLabel={`Train ${row.group}`} onPress={() => trainAll(row.list)}
        style={styles.groupTrain} textStyle={{ color: t.muted }} />
    </View>;
    if (row.kind === "case") return <CaseRow c={row.c} best={stats.get(row.c.id)?.best} learned={learned.has(row.c.id)} onOpen={openCase} onToggle={toggleLearned} />;
    return <Empty>{learningFilter === "learned" ? "No learned cases in this set yet." : "Every case of this set is learned."}</Empty>;
  };
  return <View style={{ flex: 1, minHeight: 0 }}>
    <PageHead title="Algorithms" sub={`${learnedTotal} of ${total} learned`} right={<PuzzlePicker />}
      controls={<>
        <Control label="Search" accessibilityLabel="Search cases" onPress={() => setSearching(true)} />
        <Control iconOnly icon={IconBook} accessibilityLabel="Solving methods" onPress={() => setMethods(true)} />
      </>} />
    {section && <View style={[styles.listHead, { borderBottomColor: t.line }]}>
      <Segmented plain scroll options={sections.map(s => ({ id: s.stage, label: s.stage }))} value={section.stage} onChange={setStage} style={{ alignSelf: "stretch" }}
        itemStyle={styles.stageTab} textStyle={styles.stageText} />
      {section.variants.length > 1 && <Segmented scroll style={{ alignSelf: "stretch" }} value={section.active.id} onChange={id => setSetByStage(previous => ({ ...previous, [section.stage]: id }))}
        options={section.variants.map(v => ({ id: v.id, label: v.label.startsWith(`${section.stage} `) ? v.label.slice(section.stage.length + 1) : v.label, count: v.count }))} />}
      <Segmented value={learningFilter} onChange={setLearningFilter} options={[
        { id: "all", label: "All", count: whole?.all.length ?? 0 },
        { id: "learned", label: "Learned", count: whole?.learnedCount ?? 0 },
        { id: "not-learned", label: "To learn", count: (whole?.all.length ?? 0) - (whole?.learnedCount ?? 0) },
      ]} />
    </View>}
    <FlatList key={listKey} {...scroll} data={rows} keyExtractor={row => row.key} renderItem={renderRow}
      initialNumToRender={14} maxToRenderPerBatch={10} windowSize={7} scrollEventThrottle={64}
      style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: navSpace }}
      ListEmptyComponent={<Empty>No cases for this puzzle.</Empty>} />
    <SearchDialog open={searching} cases={cases} onClose={() => setSearching(false)} onOpen={id => { setSearching(false); setRoute({ page: "algorithms", caseId: id }); }} />
    <MethodsDialog open={methods} onClose={() => setMethods(false)} />
  </View>;
}

/** `.case-row`: diagram, number and name, best time and the learned checkbox. */
const CaseRow = memo(function CaseRow({ c, best, learned, onOpen, onToggle }: { c: CaseDto; best?: number | null; learned: boolean; onOpen: (id: string) => void; onToggle: (id: string) => void }) {
  const t = useTheme();
  return <View style={styles.caseRow}>
    <Pressable onPress={() => onOpen(c.id)} accessibilityRole="button" accessibilityLabel={c.name !== c.id ? `${c.id}, ${c.name}` : c.id}
      style={({ pressed }) => [styles.caseOpen, { backgroundColor: pressed ? t.hover : "transparent" }]}>
      <View style={styles.caseDiagram}><CaseDiagram c={c} size={56} /></View>
      <View style={styles.caseName}>
        <Text numberOfLines={1} style={[styles.caseId, { color: t.text }]}>{shortId(c)}</Text>
        {c.name !== c.id && <Text numberOfLines={1} style={[styles.caseSub, { color: t.muted }]}>{c.name}</Text>}
      </View>
      <Text style={[mono(t, 12.5, "400"), { color: t.secondary }]}>{best != null ? fmtTime(best) : "—"}</Text>
    </Pressable>
    <CheckCell checked={learned} tone="good" label={learned ? "Learned" : "Learn"} width={80} onPress={() => onToggle(c.id)} accessibilityLabel={learned ? `${c.id} learned` : `Mark ${c.id} learned`} style={{ borderLeftWidth: 1 }} />
  </View>;
});

const matches = (c: CaseDto, query: string) => {
  const text = [c.id, c.name, c.setLabel, c.stage, c.group, c.subgroup].join(" ").toLowerCase();
  return query.toLowerCase().split(/\s+/).every(word => text.includes(word));
};
/** Search cases of the current puzzle by number, name, set or group, like the web's Ctrl+K dialog. */
function SearchDialog({ open, cases, onClose, onOpen }: { open: boolean; cases: CaseDto[]; onClose: () => void; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState("");
  useEffect(() => { if (!open) setQuery(""); }, [open]);
  const results = useMemo(() => open ? cases.filter(c => matches(c, query.trim())).slice(0, 50) : [], [open, cases, query]);
  return <Sheet open={open} onClose={onClose} title="Search cases" tall>
    <View style={{ flex: 1, minHeight: 0, gap: 10 }}>
      <Input autoFocus value={query} onChangeText={setQuery} placeholder="Search a case: oll fish, pll t, f2l 6…" autoCorrect={false} autoCapitalize="none" returnKeyType="search"
        onSubmitEditing={() => { if (results[0]) onOpen(results[0].id); }} />
      <FlatList data={results} keyExtractor={c => c.id} keyboardShouldPersistTaps="handled" style={{ flex: 1 }}
        initialNumToRender={10} maxToRenderPerBatch={10} windowSize={5}
        renderItem={({ item: c }) => <ListRow height={56} onPress={() => onOpen(c.id)} left={<CaseDiagram c={c} size={44} />}
          title={c.name !== c.id ? `${c.id} · ${c.name}` : c.id} sub={`${c.setLabel} · ${c.group}`} />}
        ListEmptyComponent={<Empty>No case matches this search.</Empty>} />
    </View>
  </Sheet>;
}

/**
 * The case page: header with the way back, a horizontal pager over the case's set (the neighbouring cases are
 * rendered beside it, a swipe settles on the next or previous one and stops at both ends) and the stepper below.
 */
function CaseDetail({ c, caseIds, cases, stats, onBack }: { c: CaseDto; caseIds?: string[]; cases: CaseDto[]; stats: Map<string, CaseStatsDto>; onBack: () => void }) {
  const t = useTheme();
  const { navInFlow, navSpace } = useLayout();
  const replaceRoute = useSetAtom(replaceRouteAtom);
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
  const renderPage = useCallback(({ item }: { item: CaseDto }) => <CasePage c={item} stats={stats.get(item.id)} width={width} />, [stats, width]);
  return <View style={[styles.page, { backgroundColor: t.bg }]}>
    <PageHead onBack={onBack} title={c.id} sub={c.setLabel} />
    {/* The exact width, never rounded: native paging steps by the real width of the list, so pages a fraction
        of a point narrower drift a little further out of line with every swipe. */}
    <View style={{ flex: 1, minHeight: 0 }} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 && <FlatList ref={list} horizontal pagingEnabled showsHorizontalScrollIndicator={false} bounces={false} overScrollMode="never"
        data={siblings} keyExtractor={item => item.id} renderItem={renderPage}
        initialScrollIndex={index} getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        initialNumToRender={1} maxToRenderPerBatch={2} windowSize={3} removeClippedSubviews={false}
        onMomentumScrollEnd={event => settle(event.nativeEvent.contentOffset.x)}
        onScrollEndDrag={event => { if (!event.nativeEvent.velocity?.x) settle(event.nativeEvent.contentOffset.x); }}
        onScrollToIndexFailed={({ index: target }) => list.current?.scrollToOffset({ offset: width * target, animated: false })}
        style={{ flex: 1 }} />}
    </View>
    <View style={[styles.foot, { borderTopColor: t.line }, !navInFlow && { marginBottom: navSpace - 16 }]}>
      <Btn iconOnly icon={IconBack} disabled={!previous} onPress={() => step(previous)} accessibilityLabel="Previous case" />
      <Text style={[mono(t, 12.5, "400"), { color: t.muted }]}>{index + 1} / {siblings.length}</Text>
      <Btn iconOnly icon={IconNext} disabled={!next} onPress={() => step(next)} accessibilityLabel="Next case" />
    </View>
  </View>;
}

/** One page of the case pager: diagram and figures, setup, algorithms and the case's own statistics. */
const CasePage = memo(function CasePage({ c, stats, width }: { c: CaseDto; stats?: CaseStatsDto; width: number }) {
  const t = useTheme();
  const solveMode = useAtomValue(solveModeAtom);
  const statsVersion = useAtomValue(statsVersionAtom);
  const [learnedIds, toggleLearned] = useAtom(learnedCaseIdsAtom);
  const learned = learnedIds.includes(c.id);
  const setRoute = useSetAtom(routeAtom), setSelection = useSetAtom(selectedCaseIdsAtom);
  const train = () => { setSelection([c.id]); setRoute({ page: "training", autostart: true }); };
  // Computed from the local workspace, so the page never waits for its history.
  const history = useMemo(() => local.read.caseHistory(c.id, { solveMode }), [c.id, solveMode, statsVersion]);
  const scroll = usePreservedScroll(`case:${c.id}:detail`);
  const isCube = !!puzzleInfo(puzzleOf(c)).cubeSize;
  const summary = history.summary.count ? history.summary : stats;
  const count = summary?.count ?? 0;
  return <ScrollView ref={scroll.ref} onScroll={scroll.onScroll} onContentSizeChange={scroll.onContentSizeChange} scrollEventThrottle={64} style={{ width }} contentContainerStyle={styles.detailScroll}>
    <View style={styles.hero}>
      <View style={styles.visual}><CaseDiagram c={c} size={128} /></View>
      <View style={styles.meta}>
        <Label numberOfLines={2}>{c.setLabel} · {c.group}</Label>
        <Text style={[styles.title, { color: t.text }]} numberOfLines={2}>{c.id}</Text>
        {c.name !== c.id && <Text style={[styles.name, { color: t.secondary }]}>{c.name}</Text>}
        <View style={styles.figures}>
          <Metric label="Best" value={count ? fmtTime(summary!.best) : "—"} valueSize={16} labelSize={10.5} style={styles.figure} />
          <Metric label="Mean" value={count ? fmtTime(summary!.mean) : "—"} valueSize={16} labelSize={10.5} style={[styles.figure, styles.figureNext, { borderLeftColor: t.line }]} />
          <Metric label="Attempts" value={String(count)} valueSize={16} labelSize={10.5} style={[styles.figure, styles.figureNext, { borderLeftColor: t.line }]} />
        </View>
        <CellGroup style={styles.buttons}>
          <Btn variant="primary" icon={IconTimer} label="Train" onPress={train} />
          <Btn tone={learned ? "good" : undefined} icon={learned ? IconCheck : undefined} label={learned ? "Learned" : "Mark learned"}
            accessibilityRole="checkbox" accessibilityState={{ checked: learned }} accessibilityLabel={`${c.id} learned`} onPress={() => toggleLearned(c.id)} />
        </CellGroup>
      </View>
    </View>
    <View style={styles.section}>
      <Label>Setup</Label>
      <AlgText alg={isCube ? formatAlg(c.setup) : c.setup} size={17} selectable />
      {c.setups_alt.length > 0 && <Text style={[styles.note, { color: t.muted }]}>Also: {c.setups_alt.map((setup, i) => <Text key={i}>{i > 0 && " · "}<Text style={{ fontFamily: FONT.mono }}>{isCube ? formatAlg(setup) : setup}</Text></Text>)}</Text>}
      {c.notes && <Text style={[styles.note, { color: t.muted }]}>{c.notes}</Text>}
      {c.probability && <Text style={[styles.note, { color: t.muted }]}>Probability {c.probability}</Text>}
    </View>
    <View style={styles.section}>
      <Label>Algorithms</Label>
      <View style={{ borderTopWidth: 1, borderTopColor: t.line }}>
        {c.algorithms.map((a, i) => <View key={i} style={[styles.algorithm, { borderBottomColor: t.line }]}>
          <Text style={[mono(t, 12, "400"), styles.algorithmIndex, { color: t.muted }]}>{i + 1}</Text>
          <View style={styles.algorithmBody}>
            <AlgText alg={displayAlg(a)} size={16} selectable />
            <View style={styles.algorithmMeta}>
              {i === 0 && <Mark>Primary</Mark>}
              {a.recommended_by?.includes("jperm") && <Text style={[styles.metaText, { color: t.muted }]}>J Perm pick</Text>}
              {a.stm != null && <Text style={[styles.metaText, { color: t.muted }]}>{a.stm} STM</Text>}
              <Text style={[styles.metaText, { color: t.muted }]}>{sourceLabel(a.source)}</Text>
              {a.youtube && <Btn size={26} label="Video" onPress={() => void Linking.openURL(a.youtube!)} style={{ paddingHorizontal: 9 }} textStyle={{ fontSize: 12 }} />}
            </View>
          </View>
        </View>)}
      </View>
    </View>
    <View style={styles.section}>
      <Label>Statistics</Label>
      {summary && summary.count > 0 ? <>
        <Metrics columns={3} items={[
          { label: "Solves", value: String(summary.count) },
          { label: "Best", value: fmtTime(summary.best), tone: "good" },
          { label: "Mean", value: fmtTime(summary.mean) },
          { label: "Ao5", value: fmtTime(summary.ao5), tone: "accent" },
          { label: "Ao12", value: fmtTime(summary.ao12), tone: "accent" },
          { label: "Best Ao5", value: fmtTime(summary.bestAo5), tone: "good" },
        ]} />
        <TimesChart history={history.history} ao5={history.ao5} />
      </> : <Empty>No attempts on this case yet.</Empty>}
    </View>
  </ScrollView>;
});

const styles = StyleSheet.create({
  page: { flex: 1, width: "100%", maxWidth: 1100, alignSelf: "center", minHeight: 0 },
  // `.md-list-head`
  listHead: { alignItems: "flex-start", gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  stageTab: { height: 30, paddingHorizontal: 10 },
  stageText: { fontSize: 14, fontWeight: "600" },
  // `.list-group-head`
  groupHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 38, paddingTop: 4 },
  groupTitle: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "stretch", paddingHorizontal: 6, borderRadius: 0, flex: 1, minWidth: 0 },
  groupName: { fontSize: 12.5, fontWeight: "600", flexShrink: 1 },
  groupTrain: { height: 26, minHeight: 26, paddingHorizontal: 8, gap: 6 },
  // `.case-row`
  caseRow: { flexDirection: "row", alignItems: "center", borderRadius: 0, height: 64 },
  caseOpen: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 14, height: 64, paddingLeft: 8, paddingRight: 4, borderRadius: 0 },
  caseDiagram: { width: 56, height: 56, alignItems: "center", justifyContent: "center" },
  caseName: { flex: 1, minWidth: 0 },
  caseId: { fontSize: 13.5, fontWeight: "600", lineHeight: 17.5 },
  caseSub: { fontSize: 12, lineHeight: 15.5 },
  // `.detail`
  detailScroll: { gap: 24, paddingTop: 18, paddingHorizontal: 16, paddingBottom: 20 },
  hero: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
  visual: { width: 160, height: 160, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  meta: { flex: 1, minWidth: 0, alignItems: "flex-start", gap: 4 },
  title: { fontSize: 26, fontWeight: "600", letterSpacing: -0.78, lineHeight: 29 },
  name: { fontSize: 15 },
  figures: { flexDirection: "row", marginTop: 12, marginBottom: 14 },
  figure: { paddingRight: 14, gap: 6 },
  figureNext: { paddingLeft: 14, borderLeftWidth: 1 },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  section: { gap: 10 },
  note: { fontSize: 13, lineHeight: 19 },
  algorithm: { flexDirection: "row", gap: 14, paddingVertical: 11, borderBottomWidth: 1 },
  algorithmIndex: { width: 18, lineHeight: 25.6 },
  algorithmBody: { flex: 1, minWidth: 0, gap: 8 },
  algorithmMeta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  metaText: { fontSize: 12 },
  foot: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14, height: 52, borderTopWidth: 1, flexShrink: 0 },
});
