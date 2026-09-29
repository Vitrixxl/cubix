import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { isLearningTrack, isReviewMode, learningCases, learningTrackOf, reviewCases, trainingModeOptions, type LearningMode } from "../../../src/client/lib/dailyLearning";
import { CROSS_PLUS_ONE_MOVES } from "../../../src/shared/crossPlusOne";
import { casesAtom, crossMovesAtom, learnedCaseIdsAtom, puzzleAtom, routeAtom, selectedCaseIdsAtom, setsAtom, trainingKindAtom, trainingSetupModeAtom } from "../state";
import { FONT, useTheme } from "../theme";
import { useLayout } from "../hooks/useLayout";
import type { useDailyLearning } from "../hooks/useDailyLearning";
import { CaseSelector } from "./CaseSelector";
import { IconBook, IconCheck, IconCube, IconGrid, IconTimer, type Icon } from "./icons";
import { PuzzlePicker } from "./PuzzlePicker";
import { Btn, H1, Input, Label, Muted, PageHead, SkeletonLine } from "./ui";

export type DailyLearning = ReturnType<typeof useDailyLearning>;
/** A setup mode: `cross1`, or a learning mode (`practice`, `review`, a track). */
type SetupMode = { id: string; label: string; detail: string; icon: Icon };
export const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/** The mode the setup screen opens on: the one trained last (web `defaultSetupMode`). */
function defaultSetupMode(kind: string, puzzle: string, mode: LearningMode) {
  if (kind === "cross1" && puzzle === "333") return "cross1";
  return isReviewMode(mode) ? "review" : learningTrackOf(mode) ?? "practice";
}

/**
 * Training starts here (web `TrainingSetup`): the modes (a row on phones, a column on wide screens), then the
 * chosen mode's pane with what it needs and its Start button. `onStart` receives `cross1` or a learning mode.
 */
export function TrainingSetup({ daily, onStart }: { daily: DailyLearning; onStart: (mode: string) => void }) {
  const t = useTheme();
  const layout = useLayout();
  const puzzle = useAtomValue(puzzleAtom);
  const cases = useAtomValue(casesAtom);
  const kind = useAtomValue(trainingKindAtom);
  const moves = useAtomValue(crossMovesAtom);
  const selected = useAtomValue(selectedCaseIdsAtom);
  const learnedIds = useAtomValue(learnedCaseIdsAtom);
  const learned = useMemo(() => new Set(learnedIds), [learnedIds]);
  const [setupMode, setSetupMode] = useAtom(trainingSetupModeAtom);
  const modes = useMemo<SetupMode[]>(() => [
    ...(puzzle === "333" ? [{ id: "cross1", label: "Cross + 1", detail: `First block · ${moves} moves`, icon: IconCube }] : []),
    ...trainingModeOptions(puzzle).map(({ value, label }) => {
      const pool = isLearningTrack(value) ? learningCases(cases, value) : [];
      return {
        id: value as string, label,
        icon: value === "practice" ? IconGrid : value === "review" ? IconCheck : IconBook,
        detail: value === "practice" ? `${plural(selected.length, "case")} selected`
          : value === "review" ? plural(reviewCases(cases, learned, puzzle).length, "learned case")
          : `${pool.filter(c => learned.has(c.id)).length} / ${pool.length} learned`,
      };
    }),
  ], [puzzle, moves, cases, selected.length, learned]);
  const current = modes.find(m => m.id === (setupMode || defaultSetupMode(kind, puzzle, daily.mode))) ?? modes[0]!;
  const wide = !layout.phone;
  const row = useRef<ScrollView>(null);
  const rowGeometry = useRef({ width: 0, offset: 0, items: new Map<string, { x: number; width: number }>() });
  // The chosen mode is scrolled into view (web `scrollIntoView({ inline: "nearest" })`), without moving otherwise.
  const reveal = (id: string) => {
    const { width, offset, items } = rowGeometry.current, item = items.get(id);
    if (!item || !width || wide) return;
    if (item.x + item.width > offset + width) row.current?.scrollTo({ x: item.x + item.width - width + 10, animated: true });
    else if (item.x < offset) row.current?.scrollTo({ x: Math.max(0, item.x - 10), animated: true });
  };
  useEffect(() => reveal(current.id), [current.id]);

  const modeButtons = modes.map(m => {
    const on = m === current;
    return <Pressable key={m.id} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={m.label} onPress={() => setSetupMode(m.id)}
      onLayout={event => {
        const { x, width } = event.nativeEvent.layout;
        rowGeometry.current.items.set(m.id, { x, width });
        if (on) reveal(m.id);
      }}
      style={({ pressed }) => [styles.mode, wide ? styles.modeWide : styles.modePhone, { backgroundColor: on ? t.surface2 : pressed ? t.hover : "transparent" }]}>
      <m.icon size={16} color={on ? t.accent : t.muted} />
      <View style={styles.modeText}>
        <Text numberOfLines={1} style={[styles.modeLabel, { color: t.text }]}>{m.label}</Text>
        {wide && <Text numberOfLines={1} style={[styles.modeDetail, { color: t.muted }]}>{m.detail}</Text>}
      </View>
    </Pressable>;
  });

  return <View style={styles.page}>
    <PageHead title="Training" sub="Choose what to practise" right={<PuzzlePicker />} padding={layout.pagePadding} />
    <View style={[styles.body, wide && { flexDirection: "row" }]}>
      {wide
        ? <ScrollView style={[styles.modesColumn, { borderColor: t.line }]} contentContainerStyle={{ gap: 2, paddingVertical: 12, paddingHorizontal: 10 }}>{modeButtons}</ScrollView>
        : <View style={[styles.modesRow, { borderColor: t.line }]}>
          <ScrollView ref={row} horizontal showsHorizontalScrollIndicator={false} scrollEventThrottle={32}
            onLayout={event => { rowGeometry.current.width = event.nativeEvent.layout.width; reveal(current.id); }}
            onScroll={event => { rowGeometry.current.offset = event.nativeEvent.contentOffset.x; }} contentContainerStyle={{ gap: 2, paddingVertical: 8, paddingHorizontal: 10 }}>{modeButtons}</ScrollView>
        </View>}
      <View key={current.id} style={styles.detail}>
        {current.id === "cross1" ? <CrossSetup onStart={() => onStart("cross1")} />
          : current.id === "practice" ? <CasesSetup onStart={() => onStart("practice")} />
          : <LearningSetup mode={current.id as LearningMode} onStart={() => onStart(current.id)} />}
      </View>
    </View>
  </View>;
}

/** The setup screen before the app is ready: head, modes row and the free practice catalogue, as bones. */
export function TrainingSetupSkeleton() {
  const t = useTheme();
  const layout = useLayout();
  return <View style={styles.page} accessibilityLabel="Loading training">
    <View style={[styles.skeletonHead, { borderColor: t.line, paddingHorizontal: layout.pagePadding }]}>
      <SkeletonLine width={92} height={22} /><SkeletonLine width={150} height={13} style={{ flexShrink: 1 }} /><SkeletonLine width={82} height={32} radius={8} style={{ marginLeft: "auto" }} />
    </View>
    <View style={[styles.modesRow, styles.skeletonModes, { borderColor: t.line }]}>
      {[112, 138, 150, 112].map((width, i) => <SkeletonLine key={i} width={width} height={44} radius={8} />)}
    </View>
    <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12, gap: 10, borderBottomWidth: 1, borderColor: t.line }}>
      <SkeletonLine width={96} height={11} /><SkeletonLine width={190} height={24} />
      <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}><SkeletonLine width="56%" height={34} radius={8} /><SkeletonLine width={60} height={32} radius={8} /><SkeletonLine width={72} height={32} radius={8} /></View>
    </View>
    <View style={{ paddingHorizontal: 10 }}>
      {Array.from({ length: 8 }, (_, i) => <View key={i} style={[styles.skeletonSet, { borderColor: t.line }]}>
        <SkeletonLine width={16} height={16} radius={4} /><SkeletonLine width={34} height={11} /><SkeletonLine width={i % 2 ? 110 : 80} height={15} /><SkeletonLine width={46} height={12} />
      </View>)}
    </View>
  </View>;
}

/** `.setup-start`: the primary 32 px Start button. */
function SetupStart({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  return <Btn variant="primary" icon={IconTimer} label="Start" disabled={disabled} onPress={onPress} style={{ paddingHorizontal: 14 }} />;
}

/** A single pane sitting in the middle of the space (`.setup-pane:not(.setup-cases)`). */
function CentredPane({ label, title, text, children }: { label: string; title: string; text: string; children: ReactNode }) {
  const layout = useLayout();
  return <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.centred, { paddingHorizontal: layout.phone ? 16 : 48, paddingVertical: layout.phone ? 20 : 40, gap: layout.phone ? 24 : 32 }]}>
    <View style={styles.paneTitle}>
      <Label>{label}</Label>
      <H1 size={layout.phone ? 22 : 28} style={{ textAlign: "center" }}>{title}</H1>
      <Muted size={13.5} style={{ maxWidth: 480, textAlign: "center", lineHeight: 20 }}>{text}</Muted>
    </View>
    {children}
  </ScrollView>;
}

function CrossSetup({ onStart }: { onStart: () => void }) {
  const t = useTheme();
  const [moves, setMoves] = useAtom(crossMovesAtom);
  return <CentredPane label="First block" title="Cross + 1" text="Scrambles whose back block (a back F2L pair with its two cross edges) takes exactly the chosen number of moves, held with white on the bottom and green in front (z2).">
    <View style={styles.field}>
      <Label>Moves</Label>
      <View style={styles.moveChoice} accessibilityRole="radiogroup" accessibilityLabel="Moves">
        {CROSS_PLUS_ONE_MOVES.map(n => {
          const on = moves === n;
          return <Pressable key={n} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${n} moves`} onPress={() => setMoves(n)}
            style={({ pressed }) => [styles.moveOption, { borderColor: on ? t.accent : t.line, backgroundColor: on ? t.surface2 : pressed ? t.hover : "transparent" }]}>
            <Text style={[styles.moveCount, { color: on ? t.accent : t.secondary }]}>{n}</Text>
            <Text style={{ fontSize: 12, color: on ? t.text : t.muted }}>moves</Text>
          </Pressable>;
        })}
      </View>
    </View>
    <SetupStart onPress={onStart} />
  </CentredPane>;
}

function LearningSetup({ mode, onStart }: { mode: LearningMode; onStart: () => void }) {
  const t = useTheme();
  const layout = useLayout();
  const puzzle = useAtomValue(puzzleAtom);
  const cases = useAtomValue(casesAtom);
  const learnedIds = useAtomValue(learnedCaseIdsAtom);
  const learned = useMemo(() => new Set(learnedIds), [learnedIds]);
  const review = mode === "review";
  const track = isLearningTrack(mode) ? mode : undefined;
  const pool = track ? learningCases(cases, track) : reviewCases(cases, learned, puzzle);
  const learnedCount = pool.filter(c => learned.has(c.id)).length;
  const figures: [string, number][] = review ? [["Learned cases", pool.length]] : [["Cases", pool.length], ["Learned", learnedCount], ["Left", pool.length - learnedCount]];
  return <CentredPane label={review ? "Review" : "Daily learning"} title={review ? "Review learned" : `Learn ${track}`}
    text={review ? "Every case you marked as learned, drawn at random." : `One new ${track} case a day, group by group, until the set is learned.`}>
    <View style={styles.figures}>
      {figures.map(([label, value], i) => <View key={label} style={[styles.figure, i > 0 && { borderLeftWidth: 1, borderColor: t.line }]}>
        <Label size={10}>{label}</Label>
        <Text style={[styles.figureValue, { color: t.text, fontSize: layout.phone ? 20 : 26 }]}>{value}</Text>
      </View>)}
    </View>
    <SetupStart onPress={onStart} disabled={review && !pool.length} />
  </CentredPane>;
}

/** Free practice: the case catalogue, set by set, with the search and the Start button in its head. */
function CasesSetup({ onStart }: { onStart: () => void }) {
  const t = useTheme();
  const layout = useLayout();
  const cases = useAtomValue(casesAtom);
  const sets = useAtomValue(setsAtom);
  const [selected, setSelected] = useAtom(selectedCaseIdsAtom);
  const setRoute = useSetAtom(routeAtom);
  const [query, setQuery] = useState("");
  return <View style={{ flex: 1, minHeight: 0 }}>
    <View style={[styles.casesHead, { borderColor: t.line, paddingHorizontal: layout.phone ? 14 : 24, paddingTop: layout.phone ? 14 : 22, paddingBottom: layout.phone ? 12 : 18 }]}>
      <View style={styles.paneTitleLeft}>
        <Label>Free practice</Label>
        <H1 size={22}>{plural(selected.length, "case")} selected</H1>
      </View>
      <View style={styles.casesControls}>
        <Input accessibilityLabel="Search cases" placeholder="Search cases…" value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false}
          style={{ flex: 1, minWidth: 0, height: 34, minHeight: 34, paddingVertical: 0 }} />
        <Btn label="Clear" disabled={!selected.length} onPress={() => setSelected([])} />
        <SetupStart onPress={onStart} disabled={!selected.length} />
      </View>
    </View>
    <CaseSelector cases={cases} sets={sets} selected={selected} onChange={setSelected} query={query} onOpenCase={caseId => setRoute({ page: "algorithms", caseId })} />
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, minHeight: 0 },
  body: { flex: 1, minHeight: 0 },
  modesRow: { borderBottomWidth: 1, flexShrink: 0 },
  modesColumn: { width: 300, flexGrow: 0, borderRightWidth: 1 },
  mode: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, borderRadius: 0 },
  modePhone: { height: 44 },
  modeWide: { height: 56 },
  modeText: { minWidth: 0, gap: 2, flexShrink: 1 },
  modeLabel: { fontSize: 13.5, fontWeight: "600" },
  modeDetail: { fontSize: 12 },
  detail: { flex: 1, minWidth: 0, minHeight: 0 },
  centred: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  paneTitle: { alignItems: "center", gap: 6 },
  paneTitleLeft: { gap: 6 },
  field: { alignItems: "center", gap: 10, width: "100%" },
  moveChoice: { flexDirection: "row", gap: 8, width: 420, maxWidth: "100%" },
  moveOption: { flex: 1, height: 76, alignItems: "center", justifyContent: "center", gap: 4, borderWidth: 1, borderRadius: 0 },
  moveCount: { fontFamily: FONT.mono, fontSize: 30, fontWeight: "500", lineHeight: 32 },
  figures: { flexDirection: "row", justifyContent: "center" },
  figure: { alignItems: "center", gap: 5, paddingHorizontal: 28 },
  figureValue: { fontFamily: FONT.mono, fontWeight: "500", fontVariant: ["tabular-nums"] },
  casesHead: { borderBottomWidth: 1, gap: 16 },
  skeletonHead: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, minHeight: 53, borderBottomWidth: 1 },
  skeletonModes: { flexDirection: "row", gap: 8, paddingVertical: 8, paddingHorizontal: 10, overflow: "hidden" },
  skeletonSet: { flexDirection: "row", alignItems: "center", gap: 14, height: 52, paddingHorizontal: 8, borderBottomWidth: 1 },
  casesControls: { flexDirection: "row", alignItems: "center", gap: 6, width: "100%" },
});
