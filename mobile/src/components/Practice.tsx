import { useAtomValue, useSetAtom } from "jotai";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, BackHandler, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { bestAverage, fmtTime } from "../../../src/client/lib/format";
import { practiceSummary } from "../../../src/client/lib/practiceSummary";
import { applyAlg, parseAlg, solved } from "../../../src/shared/cube";
import type { CubeMask, DiagramView } from "../../../src/shared/cubeDiagram";
import type { PracticeContext } from "../../../src/shared/puzzles";
import type { SessionMode, SolveDto } from "../../../src/shared/types";
import { api, localChanged } from "../api";
import { cubeSwitchLockedAtom, deletedSolveIdAtom, timerRunningAtom, updatedSolveAtom } from "../state";
import { FONT, useTheme } from "../theme";
import { useLayout } from "../hooks/useLayout";
import type { TimerApi } from "../hooks/useTimer";
import { launchSessionId } from "../lib/launchSession";
import { generatePracticeScramble } from "../lib/practiceScramble";
import { StaticCubeSvg } from "./StaticCubeSvg";
import { StopSurface, responder } from "./TimerSurface";
import { IconClose } from "./icons";
import { Btn, Label, Metrics, type MetricItem } from "./ui";

/**
 * The pieces shared by the practice screens (timer, case training, cross + 1), like the web `.practice`
 * page on a phone: the page head, the prompt (`.prompt`: what to solve, with its picture), the timer
 * filling the middle and the session figures (`.metrics`) at the bottom. While the timer runs everything
 * but the time fades out.
 */

/** Generation shorter than this stays invisible: the previous scramble simply becomes the next one. */
const SLOW_GENERATION_MS = 120;

/**
 * The session figures under the timer (`store.metrics()` on the web): Best and Best Ao5/Ao12 in green,
 * Worst in red (DNF as soon as one attempt is a DNF), the current averages in the accent.
 */
export function sessionMetrics(solves: readonly Pick<SolveDto, "time_ms" | "penalty">[]): MetricItem[] {
  const summary = practiceSummary(solves), times = summary.times;
  const worst = !times.length ? fmtTime(null) : times.includes(null) ? "DNF" : fmtTime(Math.max(...(times as number[])));
  return [
    { label: "Best", value: fmtTime(summary.best), tone: "good" },
    { label: "Worst", value: worst, tone: "bad" },
    { label: "Mean", value: fmtTime(summary.mean) },
    { label: "Ao5", value: fmtTime(summary.ao5), tone: "accent" },
    { label: "Best Ao5", value: fmtTime(bestAverage(times, 5)), tone: "good" },
    { label: "Ao12", value: fmtTime(summary.ao12), tone: "accent" },
    { label: "Best Ao12", value: fmtTime(bestAverage(times, 12)), tone: "good" },
    { label: "Solves", value: String(summary.count) },
  ];
}

/**
 * This launch's session of a practice context (see lib/launchSession), oldest first; every solve still syncs
 * to the profile. Deletions and edits made from any list or dialog apply at once.
 */
export function useSessionSolves(mode: SessionMode, context: PracticeContext) {
  const [solves, setSolves] = useState<SolveDto[]>([]);
  const deletedSolveId = useAtomValue(deletedSolveIdAtom);
  useEffect(() => { if (deletedSolveId !== null) setSolves(list => list.filter(solve => solve.id !== deletedSolveId)); }, [deletedSolveId]);
  const updatedSolve = useAtomValue(updatedSolveAtom);
  useEffect(() => { if (updatedSolve) setSolves(list => list.map(solve => solve.id === updatedSolve.id ? updatedSolve : solve)); }, [updatedSolve]);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      const session = launchSessionId(mode, context);
      if (session === null) { setSolves([]); return; }
      void api.solves(mode, 1000, context.puzzle, context).then(list => { if (active) setSolves(list.filter(s => s.session_id === session).reverse()); });
    };
    refresh();
    const unsubscribe = localChanged.on(refresh);
    return () => { active = false; unsubscribe(); };
  }, []);
  return [solves, setSolves] as const;
}

/**
 * Scramble generation for a practice context: `generate()` hands the next scramble to `save`. Only a generation
 * that takes a while (cubing.js in the native engine) reports `slow`, so instant ones never flash a skeleton.
 */
export function useScrambleGeneration(context: PracticeContext, save: (scramble: string) => void) {
  const [generating, setGenerating] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestSave = useRef(save); latestSave.current = save;
  const generate = useCallback(async () => {
    const id = ++request.current;
    setGenerating(true); setError("");
    clearTimeout(slowTimer.current);
    slowTimer.current = setTimeout(() => { if (request.current === id) setSlow(true); }, SLOW_GENERATION_MS);
    try {
      const next = await generatePracticeScramble(context);
      if (request.current === id) latestSave.current(next);
    } catch (e) {
      if (request.current === id) setError((e as Error).message);
    } finally {
      if (request.current === id) { clearTimeout(slowTimer.current); setGenerating(false); setSlow(false); }
    }
  }, [context]);
  // A generation still running when the page goes away is dropped.
  useEffect(() => () => { request.current++; clearTimeout(slowTimer.current); }, []);
  return { generating, slow, error, generate };
}

/** A solve being timed or saved (or a failed save) locks the puzzle, mode and scramble switches. */
export function usePracticeLock(timer: TimerApi, saving: boolean) {
  const lockCube = useSetAtom(cubeSwitchLockedAtom);
  const running = timer.phase === "running";
  const busy = saving || running || timer.phase === "holding" || timer.phase === "ready";
  const locked = busy || !!timer.saveError;
  useEffect(() => { lockCube(locked); return () => lockCube(false); }, [locked, lockCube]);
  return { busy, running, locked };
}

/**
 * `.practice.running …`: the page head, scramble, figures and hints fade out (180 ms) while the timer
 * runs, leaving only the time, and fade back afterwards (`showMs`). The layout never moves.
 */
export function RunningFade({ hidden, children, style, showMs = 250 }: { hidden: boolean; children: ReactNode; style?: StyleProp<ViewStyle>; showMs?: number }) {
  const opacity = useRef(new Animated.Value(hidden ? 0 : 1)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: hidden ? 0 : 1, duration: hidden ? 180 : showMs, useNativeDriver: true }).start();
  }, [hidden, opacity]);
  return <Animated.View pointerEvents={hidden ? "none" : "box-none"} style={[style, { opacity }]}>{children}</Animated.View>;
}

/**
 * Extends touch arming to the page background: a touch that starts on anything but a control
 * (buttons and lists claim their own touches first) holds the timer, like the web's document listener.
 */
export function TouchArea({ timer, enabled, children, style }: { timer: TimerApi; enabled: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.area, style]} {...responder(timer, !enabled)}>{children}</View>;
}

/** `.notice`: a brief green line of praise (trophy, 13 px semibold) at the top of the timer, shown at each new `at`; fades out on its own. */
export function Notice({ at, hidden, top, icon, message }: { at: number; hidden: boolean; top: number; icon: ReactNode; message: string }) {
  const t = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!at) return;
    setShown(true);
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    const hide = setTimeout(() => Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => setShown(false)), 4000);
    return () => clearTimeout(hide);
  }, [at, opacity]);
  if (!shown || hidden) return null;
  return <Animated.View pointerEvents="none" style={[styles.notice, { top, opacity }]}>
    <View style={styles.noticeBody}>
      {icon}
      <Text numberOfLines={1} style={{ color: t.good, fontSize: 13, fontWeight: "600", flexShrink: 1 }}>{message}</Text>
    </View>
  </Animated.View>;
}

/** `.alg`: moves in Geist Mono, wrapping between moves only, 0.62em apart. */
export const Moves = memo(function Moves({ alg, size }: { alg: string; size: number }) {
  const t = useTheme();
  const tokens = useMemo(() => alg.trim().split(/\s+/).filter(Boolean), [alg]);
  return <View style={[styles.moves, { columnGap: size * 0.62 }]}>
    {tokens.map((token, i) => <Text key={i} style={{ fontFamily: FONT.mono, fontWeight: "500", fontSize: size, lineHeight: Math.round(size * 1.55), color: t.text }}>{token}</Text>)}
  </View>;
});

/** `.prompt-block`: a quiet label over its content. */
export function PromptBlock({ label, children }: { label: string; children: ReactNode }) {
  return <View style={styles.block}><Label>{label}</Label>{children}</View>;
}

/**
 * The cube after `alg`, drawn like the case diagrams. Each change of `replay` plays the moves again from
 * the solved cube, one turn at a time, as the web cube's replay button does.
 */
export const CubePreview = memo(function CubePreview({ alg, cube = 3, size, mask, view, replay = 0 }: { alg: string; cube?: number; size: number; mask?: CubeMask; view?: DiagramView; replay?: number }) {
  const moves = useMemo(() => { try { return parseAlg(alg, cube); } catch { return []; } }, [alg, cube]);
  const [step, setStep] = useState<number | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!moves.length) return;
    let index = 0;
    setStep(0);
    const timer = setInterval(() => {
      index++;
      if (index >= moves.length) { clearInterval(timer); setStep(null); } else setStep(index);
    }, Math.max(60, Math.min(180, 2400 / moves.length)));
    return () => clearInterval(timer);
  }, [replay]);
  useEffect(() => setStep(null), [alg]);
  const state = useMemo(() => applyAlg(solved(cube), step === null ? moves : moves.slice(0, step)), [cube, moves, step]);
  return <StaticCubeSvg state={state} size={size} mask={mask} view={view} />;
});

/** Size of the prompt's picture in the training frames: none on short phones. */
export function framePreviewSize({ phone, width, height }: { phone: boolean; width: number; height: number }) {
  return phone ? (height < 760 ? 0 : 76) : height < 700 ? 92 : width < 1200 ? 112 : 132;
}

/** The Android back button leaves a running training for its setup screen, like the header's back arrow. */
export function useBackTo(onBack: () => void, enabled = true) {
  const latest = useRef(onBack); latest.current = onBack;
  // The app's history handler subscribes again whenever a solve starts or stops; subscribing after it (next
  // tick) keeps this one first, as the most recent listener runs first.
  const running = useAtomValue(timerRunningAtom);
  useEffect(() => {
    if (!enabled || running) return;
    let subscription: { remove: () => void } | undefined;
    const timer = setTimeout(() => { subscription = BackHandler.addEventListener("hardwareBackPress", () => { latest.current(); return true; }); });
    return () => { clearTimeout(timer); subscription?.remove(); };
  }, [enabled, running]);
}

/** Timer digits size of the phone page (`clamp(52px, 19cqw, 110px)`), smaller on wider screens' short heights. */
export function useTimerFont() {
  const { width, height, phone } = useLayout();
  return phone ? Math.max(52, Math.min(width * 0.19, 110)) : Math.max(60, Math.min(width * 0.08, height * 0.12, 150));
}

/** The practice screen of a running training (case practice, cross + 1). */
export function PracticeFrame({ head, prompt, visual, timer, readout, metrics, columns, dense, side, notice, disabled }: {
  head: ReactNode; prompt: ReactNode; visual?: ReactNode; timer: TimerApi; readout: ReactNode;
  metrics: MetricItem[]; columns?: number; dense?: boolean;
  /** The times column of wide screens (`.column-right`). */
  side?: ReactNode;
  /** `.notice`, over the top of the timer. */
  notice?: ReactNode;
  disabled: boolean;
}) {
  const t = useTheme();
  const layout = useLayout();
  const running = timer.phase === "running";
  return <View style={styles.page}>
    <RunningFade hidden={running} showMs={180}>{head}</RunningFade>
    <View style={styles.body}>
      <View style={styles.stage}>
        <RunningFade hidden={running} showMs={180} style={[styles.prompt, { borderColor: t.line, paddingHorizontal: layout.phone ? 16 : 32, paddingVertical: layout.phone ? 14 : 22, gap: layout.phone ? 14 : 28 }]}>
          <ScrollView style={[styles.promptScroll, { maxHeight: layout.height * 0.4 - (layout.phone ? 28 : 44) }]} contentContainerStyle={styles.promptMain} showsVerticalScrollIndicator={false} nestedScrollEnabled keyboardShouldPersistTaps="handled">{prompt}</ScrollView>
          {visual ? <View style={styles.visual}>{visual}</View> : null}
        </RunningFade>
        <View style={styles.timer} {...responder(timer, disabled)}>
          {notice}
          {readout}
        </View>
        <RunningFade hidden={running} showMs={180}><Metrics items={metrics} columns={columns} dense={dense} /></RunningFade>
      </View>
      {side}
    </View>
    <StopSurface timer={timer} />
  </View>;
}

/** `.column-right` of wide screens: the session or times list beside the timer, with its head. */
export function TimesColumn({ title, count, onClose, actions, children }: { title: string; count: number; onClose?: () => void; actions?: ReactNode; children: ReactNode }) {
  const t = useTheme();
  return <View style={[styles.column, { borderColor: t.line }]}>
    <View style={[styles.columnHead, { borderColor: t.line }]}>
      <Text style={{ color: t.text, fontSize: 14, fontWeight: "600" }}>{title}</Text>
      <Text style={{ color: t.muted, fontSize: 12, fontFamily: FONT.mono }}>{count}</Text>
      <View style={styles.columnActions}>
        {actions}
        {onClose && <Btn small iconOnly icon={IconClose} onPress={onClose} accessibilityLabel={`Close ${title.toLowerCase()}`} />}
      </View>
    </View>
    {children}
  </View>;
}

/** `.notice` of the training frames: a brief line over the timer, shown for a few seconds at each new `at`. */
export function Toast({ at, icon, message, hidden }: { at: number; icon: ReactNode; message: string; hidden: boolean }) {
  const t = useTheme();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!at) return;
    setShown(true);
    const hide = setTimeout(() => setShown(false), 5000);
    return () => clearTimeout(hide);
  }, [at]);
  if (!shown || hidden) return null;
  return <View pointerEvents="none" style={styles.toast}>
    <View style={[styles.toastBody, { backgroundColor: t.surface2, borderColor: t.line }]}>
      {icon}
      <Text numberOfLines={1} style={{ color: t.text, fontSize: 13, fontWeight: "500", flexShrink: 1 }}>{message}</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  area: { flex: 1, minHeight: 0 },
  notice: { position: "absolute", left: 0, right: 0, zIndex: 3, alignItems: "center" },
  noticeBody: { flexDirection: "row", alignItems: "center", gap: 8, maxWidth: "92%", paddingVertical: 4 },
  page: { flex: 1, minHeight: 0 },
  body: { flex: 1, minHeight: 0, flexDirection: "row" },
  stage: { flex: 1, minWidth: 0, minHeight: 0 },
  prompt: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, flexShrink: 0 },
  promptScroll: { flex: 1, minWidth: 0 },
  promptMain: { gap: 8 },
  visual: { flexShrink: 0, alignItems: "center", justifyContent: "center" },
  block: { gap: 4 },
  moves: { flexDirection: "row", flexWrap: "wrap" },
  timer: { flex: 1, minHeight: 0, alignItems: "center", justifyContent: "center" },
  column: { width: 320, borderLeftWidth: 1, minHeight: 0 },
  columnHead: { flexDirection: "row", alignItems: "center", gap: 8, height: 48, paddingHorizontal: 14, borderBottomWidth: 1 },
  columnActions: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 6 },
  toast: { position: "absolute", top: 18, left: 12, right: 12, alignItems: "center", zIndex: 2 },
  toastBody: { flexDirection: "row", alignItems: "center", gap: 8, height: 34, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, maxWidth: "100%" },
});
