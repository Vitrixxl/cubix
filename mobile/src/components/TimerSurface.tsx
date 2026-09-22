import { useSetAtom } from "jotai";
import { useKeepAwake } from "expo-keep-awake";
import { memo, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { StyleSheet, Text, TextInput, View, type GestureResponderEvent } from "react-native";
import { fmtTime, parseTypedTime } from "../../../src/client/lib/format";
import { timerRunningAtom } from "../state";
import { FONT, useTheme } from "../theme";
import type { TimerApi } from "../hooks/useTimer";
import { Btn, FormError } from "./ui";

/** Only this text node rerenders on animation frames, never the practice page. */
const LiveTime = memo(function LiveTime({ startedAt, style }: { startedAt: number; style: object }) {
  const [text, setText] = useState(() => fmtTime(performance.now() - startedAt));
  useEffect(() => {
    let frame: number;
    const tick = () => { setText(fmtTime(performance.now() - startedAt)); frame = requestAnimationFrame(tick); };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [startedAt]);
  return <Text style={style}>{text}</Text>;
});

/**
 * Touch handling uses the raw responder system so a hold stays active while the finger moves.
 * Any touch on the page background arms the timer too (see `TouchArea`); while running, a
 * full-screen layer catches the stopping tap.
 */
export function TimerSurface({ timer, disabled = false, fontSize, short, actions, reserveActions = true, unsaved = false }: { timer: TimerApi; disabled?: boolean; fontSize: number; short?: boolean; actions?: ReactNode; reserveActions?: boolean; /** Casual timing: the hint says the time will not be recorded. */ unsaved?: boolean }) {
  useKeepAwake("cubix-practice", { suppressDeactivateWarnings: true });
  const t = useTheme();
  const { phase, elapsed } = timer;
  const setRunning = useSetAtom(timerRunningAtom);
  useLayoutEffect(() => { setRunning(phase === "running"); }, [phase, setRunning]);
  useLayoutEffect(() => () => { setRunning(false); }, [setRunning]);
  const armed = phase === "ready" || phase === "holding";
  const text = armed ? "0.000" : fmtTime(elapsed, { blank: "0.000" });
  const hint = disabled ? "Select cases to begin"
    : phase === "running" ? "Tap to stop"
    : phase === "ready" ? "Release to start"
    : phase === "holding" ? "Keep holding…"
    : unsaved ? "Not saved · hold, then release to start"
    : "Hold, then release to start";
  const color = phase === "holding" ? t.danger : phase === "ready" ? t.good : t.accent;
  const valueStyle = { fontFamily: FONT.mono, fontSize, lineHeight: fontSize * 1.1, fontWeight: "700" as const, letterSpacing: -fontSize * 0.04, color, fontVariant: ["tabular-nums" as const], includeFontPadding: false };
  return <View style={[styles.surface, short && { paddingTop: 16 }]} {...responder(timer, disabled)}>
    {phase === "running" ? <LiveTime startedAt={timer.startedAt} style={valueStyle} /> : <Text style={valueStyle}>{text}</Text>}
    <Text style={[styles.hint, { color: t.readableMuted, marginTop: short ? 4 : 6, minHeight: short ? 14 : 20 }]}>{hint}</Text>
    {/* The row keeps its height whether or not a fresh time offers its buttons, so the timer never jumps. */}
    {reserveActions && <View style={[styles.actions, { height: short ? 36 : 44 }]}>{phase === "running" ? null : actions}</View>}
    {timer.saveError ? <View style={[styles.saveError, { backgroundColor: t.dangerSoft }]}><FormError style={{ flexShrink: 1 }}>{timer.saveError}</FormError><Btn small label="Retry" onPress={timer.retrySave} /></View> : null}
  </View>;
}

/**
 * Typing entry: the readout becomes a field for a time measured on an external timer. It takes the
 * place and metrics of `TimerSurface`, so switching entry never moves the page.
 */
export function TimeEntryField({ fontSize, short, disabled = false, actions, reserveActions = true, error, onRetry, onSubmit }: { fontSize: number; short?: boolean; disabled?: boolean; actions?: ReactNode; reserveActions?: boolean; error?: string; onRetry?: () => void; onSubmit: (ms: number) => void }) {
  const t = useTheme();
  const [text, setText] = useState("");
  const ms = parseTypedTime(text);
  const hint = !text ? "Type your time: 1234 is 12.34"
    : ms === null ? "Not a time"
    : `${fmtTime(ms)} · confirm to save`;
  const submit = () => { if (ms === null || disabled) return; setText(""); onSubmit(ms); };
  return <View style={[styles.surface, short && { paddingTop: 16 }]}>
    <TextInput value={text} onChangeText={value => setText(value.replace(/[^\d.,:]/g, ""))} onSubmitEditing={submit} submitBehavior="submit"
      keyboardType="decimal-pad" returnKeyType="done" maxLength={11} placeholder="0.00" placeholderTextColor={t.muted} selectionColor={t.accent} accessibilityLabel="Time"
      style={[styles.entry, { fontFamily: FONT.mono, fontSize, lineHeight: fontSize * 1.1, height: fontSize * 1.1, letterSpacing: -fontSize * 0.04, color: text && ms === null ? t.danger : t.accent }]} />
    <Text style={[styles.hint, { color: t.readableMuted, marginTop: short ? 4 : 6, minHeight: short ? 14 : 20 }]}>{hint}</Text>
    {reserveActions && <View style={[styles.actions, { height: short ? 36 : 44 }]}>{actions}</View>}
    {error ? <View style={[styles.saveError, { backgroundColor: t.dangerSoft }]}><FormError style={{ flexShrink: 1 }}>{error}</FormError><Btn small label="Retry" onPress={onRetry} /></View> : null}
  </View>;
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
  return <View style={styles.stop} onStartShouldSetResponderCapture={() => true} onResponderGrant={() => timer.press()} onResponderTerminationRequest={() => false} />;
}

const styles = StyleSheet.create({
  surface: { width: "100%", alignItems: "center", paddingTop: 38, paddingBottom: 8 },
  hint: { fontSize: 12, fontWeight: "500" },
  entry: { width: "100%", padding: 0, textAlign: "center", textAlignVertical: "center", fontWeight: "700", fontVariant: ["tabular-nums"], includeFontPadding: false },
  actions: { width: "100%", alignItems: "center", justifyContent: "center", marginTop: 2 },
  saveError: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 10, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  stop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 900 },
});
