import * as Haptics from "expo-haptics";
import { useKeepAwake } from "expo-keep-awake";
import { useAtomValue, useSetAtom } from "jotai";
import { ChevronUp, Trophy, type LucideIcon } from "lucide-react-native";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BackHandler, Pressable, TextInput, View, type GestureResponderEvent } from "react-native";
import { effective, fmtSolve, fmtTime, parseTypedTime } from "../../../src/client/lib/format";
import type { Metric } from "../../../src/client/lib/practiceSummary";
import { timerHint as sharedTimerHint } from "../../../src/client/lib/practiceTimer";
import { TONE_TEXT } from "../../../src/client/lib/tone";
import { applyAlg, parseAlg, parseScramble, solved } from "../../../src/shared/cube";
import type { CubeMask, DiagramView } from "../../../src/shared/cubeDiagram";
import type { PracticeContext } from "../../../src/shared/puzzles";
import type { SessionMode, SolveDto } from "../../../src/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { api, localChanged } from "../api";
import type { TimerApi } from "../hooks/useTimer";
import { launchSessionId } from "../lib/launchSession";
import { generatePracticeScramble } from "../lib/practiceScramble";
import { cubeSwitchLockedAtom, deletedSolveIdAtom, timerRunningAtom, updatedSolveAtom } from "../state";
import { useColors } from "../theme";
import { Fade, Numeric, Surface } from "./layout";
import { SolveMenu, useSolveMenu } from "./SolveMenus";
import { StaticCubeSvg } from "./StaticCubeSvg";

/**
 * The pieces shared by the practice screens (timer, case training, cross + 1, duel), after the web phone layout: a
 * stage card with the prompt on top (what to solve and its picture), the time in the middle and the last solve's
 * actions as a row of large targets at the bottom, then the session under it. While the timer runs everything but the
 * time fades out.
 */

/** Generation shorter than this stays invisible: the previous scramble simply becomes the next one. */
const SLOW_GENERATION_MS = 120;

export { sessionMetrics, type Metric } from "../../../src/client/lib/practiceSummary";

/**
 * This launch's session of a practice context (see lib/launchSession), oldest first; every solve still syncs to the
 * profile. Deletions and edits made from any list or sheet apply at once.
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

/** The session's solves as the rows should already look, pending penalties and deletions applied. */
export function useShownSolves(solves: SolveDto[]) {
  const { optimistic } = useSolveMenu();
  return useMemo(() => optimistic.size ? solves.flatMap(solve => {
    if (!optimistic.has(solve.id)) return [solve];
    const pending = optimistic.get(solve.id);
    return pending ? [{ ...solve, ...pending } as SolveDto] : [];
  }) : solves, [solves, optimistic]);
}

/**
 * Scramble generation for a practice context: `generate()` hands the next scramble to `save`. Only a generation that
 * takes a while (cubing.js in the native engine) reports `slow`, so instant ones never flash a skeleton.
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

/** The Android back button leaves a running training for its setup screen, like the header's back arrow. */
export function useBackTo(onBack: () => void, enabled = true) {
  const latest = useRef(onBack); latest.current = onBack;
  // The app's history handler subscribes again whenever a solve starts or stops; subscribing after it (next tick)
  // keeps this one first, as the most recent listener runs first.
  const running = useAtomValue(timerRunningAtom);
  useEffect(() => {
    if (!enabled || running) return;
    let subscription: { remove: () => void } | undefined;
    const timer = setTimeout(() => { subscription = BackHandler.addEventListener("hardwareBackPress", () => { latest.current(); return true; }); });
    return () => { clearTimeout(timer); subscription?.remove(); };
  }, [enabled, running]);
}

/** A brief line of praise (a new personal best) shown in place of the hint for a few seconds at each new `at`. */
export function useNotice() {
  const [notice, setNotice] = useState<{ at: number; message: string; icon: LucideIcon } | null>(null);
  useEffect(() => {
    if (!notice) return;
    const hide = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(hide);
  }, [notice]);
  const show = useCallback((message: string, icon: LucideIcon = Trophy) => setNotice({ at: Date.now(), message, icon }), []);
  return [notice, show] as const;
}

/** Responder props arming the timer on touch down and starting or cancelling on release. */
export function responder(timer: TimerApi, disabled: boolean) {
  return {
    onStartShouldSetResponder: () => !disabled,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (_event: GestureResponderEvent) => { timer.press(); },
    onResponderRelease: () => { timer.release(); },
    onResponderTerminate: () => { if (timer.phase === "holding" || timer.phase === "ready") timer.reset(); },
  };
}

/** Full-screen layer shown while the timer runs: the first touch anywhere stops it. */
export function StopSurface({ timer }: { timer: TimerApi }) {
  if (timer.phase !== "running") return null;
  return <View className="absolute inset-0 z-50" onStartShouldSetResponderCapture={() => true} onResponderGrant={() => timer.press()} onResponderTerminationRequest={() => false} />;
}

/** Publishes the running state (tab bar, sync badge) and keeps the screen on during practice; buzzes when armed. */
export function useTimerChrome(timer: TimerApi) {
  useKeepAwake("cubix-practice", { suppressDeactivateWarnings: true });
  const setRunning = useSetAtom(timerRunningAtom);
  useLayoutEffect(() => { setRunning(timer.phase === "running"); }, [timer.phase, setRunning]);
  useLayoutEffect(() => () => { setRunning(false); }, [setRunning]);
  useEffect(() => { if (timer.phase === "ready") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }, [timer.phase]);
}

/** The font size of the digits in an area: wide enough for the text, at most 42% of the height, 64–128 dp. */
export function digitsSize(area: { width: number; height: number }, chars: number, max = 128) {
  const byWidth = (1.6 * area.width) / Math.max(6, chars);
  return Math.round(Math.max(Math.min(64, max), Math.min(byWidth, area.height ? area.height * 0.42 : byWidth, max)));
}

/**
 * The running digits: tinted with the accent, the milliseconds smaller in a muted version of it; red while holding,
 * green once ready.
 */
export const Digits = memo(function Digits({ text, phase, size, color }: { text: string; phase: string; size: number; color?: string }) {
  const armed = phase === "holding" || phase === "ready";
  const dot = text.indexOf(".");
  const head = dot < 0 ? text : text.slice(0, dot + 1), tail = dot < 0 ? "" : text.slice(dot + 1);
  const tone = armed ? (phase === "holding" ? "text-destructive" : "text-success") : "text-timer";
  return <Text accessibilityRole="timer" numberOfLines={1} className={cn("text-center font-sans font-semibold tabular-nums", !color && tone)}
    style={{ fontSize: size, lineHeight: Math.round(size * 1.08), letterSpacing: -size * 0.04, includeFontPadding: false, ...(color ? { color } : null) }}>
    {head}
    {tail ? <Text className={cn("font-sans font-semibold tabular-nums", !color && (armed ? tone : "text-timer-ms"))} style={{ fontSize: size * 0.62, letterSpacing: -size * 0.62 * 0.03, ...(color ? { color } : null) }}>{tail}</Text> : null}
  </Text>;
});

/** Only this text re-renders on animation frames, never the page. */
export const LiveDigits = memo(function LiveDigits({ startedAt, size, color }: { startedAt: number; size: number; color?: string }) {
  const [text, setText] = useState(() => fmtTime(performance.now() - startedAt));
  useEffect(() => {
    let frame: number;
    const tick = () => { setText(fmtTime(performance.now() - startedAt)); frame = requestAnimationFrame(tick); };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [startedAt]);
  return <Digits text={text} phase="running" size={size} color={color} />;
});

/** The hint under the digits, or the praise of a new record in its place. */
export function Hint({ children, notice, hidden }: { children: ReactNode; notice?: { message: string; icon: LucideIcon } | null; hidden?: boolean }) {
  return <View className={cn("mt-3 min-h-5 flex-row items-center justify-center gap-1.5 px-3", hidden && "opacity-0")}>
    {notice ? <>
      <Icon as={notice.icon} size={16} className="text-success" />
      <Text numberOfLines={1} className="text-sm font-medium text-success">{notice.message}</Text>
    </> : <Text numberOfLines={1} className="text-center text-sm text-muted-foreground">{children}</Text>}
  </View>;
}

/** The hint of a timer phase on a phone (src/client/lib/practiceTimer.ts). */
export const timerHint = (timer: TimerApi, options?: { disabled?: string | false; unsaved?: boolean }) => sharedTimerHint(timer.phase, options);

/** The time of a timer at rest or running, sized to its area. */
export function TimerDigits({ timer, area, max }: { timer: TimerApi; area: { width: number; height: number }; max?: number }) {
  const armed = timer.phase === "ready" || timer.phase === "holding";
  const text = armed ? "0.000" : fmtTime(timer.elapsed, { blank: "0.000" });
  const size = digitsSize(area, text.length, max);
  return timer.phase === "running" ? <LiveDigits startedAt={timer.startedAt} size={size} /> : <Digits text={text} phase={timer.phase} size={size} />;
}

/**
 * Typing entry: the digits become a field for a time measured on an external timer, in their place, with the same
 * hint line, so switching entry never moves the page.
 */
export function TypedTime({ size, disabled, error, onRetry, onSubmit }: { size: number; disabled?: boolean; error?: string; onRetry?: () => void; onSubmit: (ms: number) => void }) {
  const colors = useColors();
  const [text, setText] = useState("");
  const ms = parseTypedTime(text);
  const submit = () => { if (ms === null || disabled) return; setText(""); onSubmit(ms); };
  const hint = !text ? "Type your time, then Enter: 1234 is 12.34" : ms === null ? "Not a time" : `${fmtTime(ms)} · Enter to save`;
  return <View className="w-full items-center">
    <TextInput value={text} onChangeText={value => setText(value.replace(/[^\d.,:]/g, ""))} onSubmitEditing={submit} submitBehavior="submit"
      keyboardType="decimal-pad" returnKeyType="done" maxLength={11} placeholder="0.000" placeholderTextColor={colors.mutedForeground + "66"}
      cursorColor={colors.primary} selectionColor={colors.primary + "55"} accessibilityLabel="Time" editable={!disabled}
      className={cn("w-[80%] border-b-2 border-border pb-2 text-center font-sans font-medium", text && ms === null ? "text-destructive" : "text-timer")}
      style={{ fontSize: size * 0.8, includeFontPadding: false }} />
    {error ? <View className="mt-3 flex-row items-center gap-2">
      <Text className="text-sm text-destructive">{error}</Text>
      <Button size="sm" variant="outline" onPress={onRetry}><Text>Retry</Text></Button>
    </View> : <Hint>{hint}</Hint>}
  </View>;
}

/** A failed save under the time, with its retry. */
export function SaveError({ timer }: { timer: TimerApi }) {
  if (!timer.saveError) return null;
  return <View className="mt-3 flex-row flex-wrap items-center justify-center gap-2 px-3">
    <Text className="text-sm text-destructive">{timer.saveError}</Text>
    <Button size="sm" variant="outline" onPress={timer.retrySave}><Text>Retry</Text></Button>
  </View>;
}

/**
 * The current average of five as it is counted: the last five solves as chips, the fastest and the slowest dropped
 * (in brackets), the newest outlined. Empty slots until there are five. A chip opens its solve; held, its menu.
 */
export function AverageWindow({ solves, hidden }: { solves: SolveDto[]; hidden?: boolean }) {
  const last = solves.slice(-5);
  const times = last.map(v => effective(v.time_ms, v.penalty) ?? Infinity);
  const full = last.length === 5;
  const fastest = full ? times.indexOf(Math.min(...times)) : -1, slowest = full ? times.lastIndexOf(Math.max(...times)) : -1;
  return <Fade hidden={!!hidden} className="mt-6 w-full flex-row gap-1">
    {Array.from({ length: 5 }, (_, i) => {
      const index = i - (5 - last.length), v = last[index];
      if (!v) return <View key={i} className="h-8 min-w-0 flex-1 items-center justify-center rounded-md bg-muted/50"><Numeric className="text-xs text-muted-foreground/50">–</Numeric></View>;
      const dropped = index === fastest || index === slowest, time = fmtSolve(v.time_ms, v.penalty);
      return <SolveMenu key={v.id} solve={v} accessibilityLabel={`Solve ${time}`} rootClassName="min-w-0 flex-1"
        className={cn("h-8 items-center justify-center rounded-md bg-muted active:bg-muted/70", index === last.length - 1 && "border border-foreground/30")}>
        <Numeric numberOfLines={1} className={cn("text-xs", dropped ? "text-muted-foreground" : v.penalty === "+2" ? "text-warning" : "", v.penalty === "dnf" && "text-destructive")}>{dropped ? `(${time})` : time}</Numeric>
      </SolveMenu>;
    })}
  </Fade>;
}

/** Under the stage: the session's main figures, one tap (or a swipe of the sheet) from its times. */
export function SessionPeek({ figures, count, noun, onPress, hidden }: { figures: Metric[]; count: number; noun: string; onPress: () => void; hidden?: boolean }) {
  return <Fade hidden={!!hidden}>
    <Pressable accessibilityRole="button" accessibilityLabel="Session times" onPress={onPress}
      className="h-14 flex-row items-center gap-4 rounded-xl bg-muted/45 px-4 active:bg-muted/70">
      {figures.map(([label, value, tone]) => <View key={label} className="min-w-0 flex-1 gap-0.5">
        <Text className="text-[11px] font-medium text-muted-foreground">{label}</Text>
        <Numeric numberOfLines={1} className={cn("text-base font-medium", value === "–" ? "text-muted-foreground/60" : TONE_TEXT[tone])}>{value}</Numeric>
      </View>)}
      <View className="flex-row items-center gap-1.5">
        <Numeric className="text-sm text-muted-foreground">{count} {noun}{count === 1 ? "" : "s"}</Numeric>
        <Icon as={ChevronUp} size={16} className="text-muted-foreground" />
      </View>
    </Pressable>
  </Fade>;
}

/**
 * The cube after `alg`, drawn like the case diagrams. Each change of `replay` plays the moves again from the solved
 * cube, one turn at a time. A `held` scramble is applied white on top and shown yellow on top (see `parseScramble`).
 */
export const CubePreview = memo(function CubePreview({ alg, cube = 3, size, mask, view, replay = 0, held = false }: { alg: string; cube?: number; size: number; mask?: CubeMask; view?: DiagramView; replay?: number; held?: boolean }) {
  const moves = useMemo(() => { try { return held ? parseScramble(alg, cube) : parseAlg(alg, cube); } catch { return []; } }, [alg, cube, held]);
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
  return <StaticCubeSvg state={state} size={size} mask={mask} view={view} held={held} />;
});

/**
 * The stage card: the prompt and its picture on top, the readout in the middle (it measures its area for the digits),
 * the touch bar at the bottom. A touch anywhere but on a control arms the timer.
 */
export function Stage({ timer, disabled, running, prompt, visual, readout, bar }: {
  timer: TimerApi; disabled: boolean; running: boolean; prompt: ReactNode; visual?: ReactNode;
  readout: (area: { width: number; height: number }) => ReactNode; bar: ReactNode;
}) {
  const [area, setArea] = useState({ width: 320, height: 0 });
  return <Surface className={cn("flex-1", running && "border-transparent bg-transparent")}>
    <View className="min-h-0 flex-1 px-4 pt-4" {...responder(timer, disabled)}>
      <Fade hidden={running} className="flex-row items-start gap-3">
        <View className="min-w-0 flex-1 gap-3">{prompt}</View>
        {visual ? <View className="shrink-0">{visual}</View> : null}
      </Fade>
      <View className="min-h-0 flex-1 items-center justify-center overflow-hidden"
        onLayout={event => { const { width, height } = event.nativeEvent.layout; setArea(current => current.width === width && current.height === height ? current : { width, height }); }}>
        {readout(area)}
      </View>
    </View>
    <Fade hidden={running}>{bar}</Fade>
  </Surface>;
}
