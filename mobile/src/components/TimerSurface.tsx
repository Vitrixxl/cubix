import { useSetAtom } from "jotai";
import { useKeepAwake } from "expo-keep-awake";
import { memo, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { StyleSheet, Text, TextInput, View, type GestureResponderEvent } from "react-native";
import { fmtTime, parseTypedTime } from "../../../src/client/lib/format";
import { timerRunningAtom } from "../state";
import { alpha, FONT, useTheme } from "../theme";
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

/** `.timer-digits`: Geist Mono 500, accent at rest, red while holding, green when ready. */
function digitStyle(fontSize: number, color: string) {
  return { fontFamily: FONT.mono, fontSize, lineHeight: Math.round(fontSize * 1.12), fontWeight: "500" as const, letterSpacing: -fontSize * 0.04, color, fontVariant: ["tabular-nums" as const], includeFontPadding: false, textAlign: "center" as const };
}

/**
 * `.timer`: the big time, its hint and `.solve-actions` under it, centred. Touch handling uses the raw
 * responder system so a hold stays active while the finger moves. Any touch on the page background
 * arms the timer too (see `TouchArea`); while running, a full-screen layer catches the stopping tap.
 * While running only the digits stay visible (the hint and actions keep their space).
 */
export function TimerSurface({ timer, disabled = false, fontSize, short, actions, reserveActions = true, unsaved = false }: { timer: TimerApi; disabled?: boolean; fontSize: number; short?: boolean; actions?: ReactNode; reserveActions?: boolean; /** Casual timing: the hint says the time will not be recorded. */ unsaved?: boolean }) {
  useKeepAwake("cubix-practice", { suppressDeactivateWarnings: true });
  const t = useTheme();
  const { phase, elapsed } = timer;
  const setRunning = useSetAtom(timerRunningAtom);
  useLayoutEffect(() => { setRunning(phase === "running"); }, [phase, setRunning]);
  useLayoutEffect(() => () => { setRunning(false); }, [setRunning]);
  const armed = phase === "ready" || phase === "holding";
  const running = phase === "running";
  const text = armed ? "0.000" : fmtTime(elapsed, { blank: "0.000" });
  const hint = disabled ? "Select cases to begin"
    : running ? "Tap to stop"
    : phase === "ready" ? "Release to start"
    : phase === "holding" ? "Keep holding…"
    : unsaved ? "Not saved · Hold, then release to start"
    : "Hold, then release to start";
  const color = phase === "holding" ? t.danger : phase === "ready" ? t.good : t.accent;
  const valueStyle = digitStyle(fontSize, color);
  return <View style={styles.surface} {...responder(timer, disabled)}>
    {running ? <LiveTime startedAt={timer.startedAt} style={valueStyle} /> : <Text style={valueStyle}>{text}</Text>}
    <Text numberOfLines={1} style={[styles.hint, { color: t.muted, marginTop: short ? 8 : 14, opacity: running ? 0 : 1 }]}>{hint}</Text>
    {/* The row keeps its height whether or not a fresh time offers its buttons, so the timer never jumps. */}
    {reserveActions && <View style={[styles.actions, { marginTop: short ? 8 : 12, opacity: running ? 0 : 1 }]} pointerEvents={running ? "none" : "box-none"}>{running ? null : actions}</View>}
    {timer.saveError ? <View style={[styles.saveError, { borderColor: t.line }]}><FormError style={{ flexShrink: 1 }}>{timer.saveError}</FormError><Btn small label="Retry" onPress={timer.retrySave} /></View> : null}
  </View>;
}

/**
 * Typing entry (`.typed-time`): the readout becomes a field for a time measured on an external timer.
 * It takes the place and metrics of `TimerSurface`, so switching entry never moves the page.
 */
export function TimeEntryField({ fontSize, short, disabled = false, actions, reserveActions = true, error, onRetry, onSubmit }: { fontSize: number; short?: boolean; disabled?: boolean; actions?: ReactNode; reserveActions?: boolean; error?: string; onRetry?: () => void; onSubmit: (ms: number) => void }) {
  const t = useTheme();
  const [text, setText] = useState("");
  const ms = parseTypedTime(text);
  const hint = !text ? "Type your time, then Enter: 1234 is 12.34"
    : ms === null ? "Not a time"
    : `${fmtTime(ms)} · Enter to save`;
  const submit = () => { if (ms === null || disabled) return; setText(""); onSubmit(ms); };
  const { lineHeight, ...digits } = digitStyle(fontSize, text && ms === null ? t.danger : t.accent);
  return <View style={styles.surface}>
    <TextInput value={text} onChangeText={value => setText(value.replace(/[^\d.,:]/g, ""))} onSubmitEditing={submit} submitBehavior="submit"
      keyboardType="decimal-pad" returnKeyType="done" maxLength={11} placeholder="0.00" placeholderTextColor={alpha(t.accent, 35)} selectionColor={t.soft} cursorColor={t.accent} accessibilityLabel="Time"
      style={[styles.entry, digits, { height: lineHeight, lineHeight }]} />
    <Text numberOfLines={1} style={[styles.hint, { color: t.muted, marginTop: short ? 8 : 14 }]}>{hint}</Text>
    {reserveActions && <View style={[styles.actions, { marginTop: short ? 8 : 12 }]}>{actions}</View>}
    {error ? <View style={[styles.saveError, { borderColor: t.line }]}><FormError style={{ flexShrink: 1 }}>{error}</FormError><Btn small label="Retry" onPress={onRetry} /></View> : null}
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
  surface: { width: "100%", alignItems: "center" },
  hint: { fontSize: 12.5, lineHeight: 18, height: 18, textAlign: "center", paddingHorizontal: 12 },
  entry: { width: "100%", padding: 0, textAlignVertical: "center" },
  actions: { width: "100%", height: 30, alignItems: "center", justifyContent: "center" },
  saveError: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  stop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 900 },
});
