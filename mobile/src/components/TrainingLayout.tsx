import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, BackHandler, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { applyAlg, parseAlg, solved } from "../../../src/shared/cube";
import type { CubeMask, DiagramView } from "../../../src/shared/cubeDiagram";
import { useAtomValue } from "jotai";
import { timerRunningAtom } from "../state";
import { FONT, useTheme } from "../theme";
import { useLayout } from "../hooks/useLayout";
import type { TimerApi } from "../hooks/useTimer";
import { StaticCubeSvg } from "./StaticCubeSvg";
import { StopSurface, responder } from "./TimerSurface";
import { IconClose } from "./icons";
import { Btn, Label, Metrics, type MetricItem } from "./ui";

/**
 * The practice screen of a running training, like the web `.practice` page on a phone: the page head,
 * the prompt (`.prompt`: what to solve, with its picture), the timer filling the middle and the session
 * figures (`.metrics`) at the bottom. While the timer runs everything but the time fades out.
 */

/** `.alg`: moves in Geist Mono, wrapping between moves only, 0.62em apart. */
export const Moves = memo(function Moves({ alg, size, color }: { alg: string; size: number; color?: string }) {
  const t = useTheme();
  const tokens = useMemo(() => alg.trim().split(/\s+/).filter(Boolean), [alg]);
  return <View style={[styles.moves, { columnGap: size * 0.62 }]}>
    {tokens.map((token, i) => <Text key={i} style={{ fontFamily: FONT.mono, fontWeight: "500", fontSize: size, lineHeight: Math.round(size * 1.55), color: color ?? t.text }}>{token}</Text>)}
  </View>;
});

/** `.prompt-block`: a quiet label over its content. */
export function PromptBlock({ label, children }: { label: ReactNode; children: ReactNode }) {
  return <View style={styles.block}>{typeof label === "string" ? <Label>{label}</Label> : label}{children}</View>;
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

/** Opacity fade of the page chrome while a solve runs (`.practice.running … { opacity: 0 }`). */
export function Fade({ hidden, children, style }: { hidden: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const opacity = useRef(new Animated.Value(hidden ? 0 : 1)).current;
  useEffect(() => { Animated.timing(opacity, { toValue: hidden ? 0 : 1, duration: 180, useNativeDriver: true }).start(); }, [hidden, opacity]);
  return <Animated.View pointerEvents={hidden ? "none" : "box-none"} style={[style, { opacity }]}>{children}</Animated.View>;
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
    <Fade hidden={running}>{head}</Fade>
    <View style={styles.body}>
      <View style={styles.stage}>
        <Fade hidden={running} style={[styles.prompt, { borderColor: t.line, paddingHorizontal: layout.phone ? 16 : 32, paddingVertical: layout.phone ? 14 : 22, gap: layout.phone ? 14 : 28 }]}>
          <ScrollView style={[styles.promptScroll, { maxHeight: layout.height * 0.4 - (layout.phone ? 28 : 44) }]} contentContainerStyle={styles.promptMain} showsVerticalScrollIndicator={false} nestedScrollEnabled keyboardShouldPersistTaps="handled">{prompt}</ScrollView>
          {visual ? <View style={styles.visual}>{visual}</View> : null}
        </Fade>
        <View style={styles.timer} {...responder(timer, disabled)}>
          {notice}
          {readout}
        </View>
        <Fade hidden={running}><Metrics items={metrics} columns={columns} dense={dense} /></Fade>
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

/** `.notice`: a brief line over the timer, shown for a few seconds at each new `at`. */
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
  return <View pointerEvents="none" style={styles.notice}>
    <View style={[styles.noticeBody, { backgroundColor: t.surface2, borderColor: t.line }]}>
      {icon}
      <Text numberOfLines={1} style={{ color: t.text, fontSize: 13, fontWeight: "500", flexShrink: 1 }}>{message}</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
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
  notice: { position: "absolute", top: 18, left: 12, right: 12, alignItems: "center", zIndex: 2 },
  noticeBody: { flexDirection: "row", alignItems: "center", gap: 8, height: 34, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, maxWidth: "100%" },
});
