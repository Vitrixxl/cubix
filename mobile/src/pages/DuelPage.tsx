import { useKeepAwake } from "expo-keep-awake";
import { useAtomValue, useSetAtom } from "jotai";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { fmtSolve, fmtTime } from "../../../src/client/lib/format";
import { eventInfo, eventLabel } from "../../../src/shared/puzzles";
import { eventAtom, timerRunningAtom } from "../state";
import { FONT, useTheme } from "../theme";
import { useLayout } from "../hooks/useLayout";
import { useTimer, type TimerApi } from "../hooks/useTimer";
import { ao5, compare, ROUNDS, solveTime, useDuel, type DuelSolve } from "../lib/duel";
import { AlgText } from "../components/AlgText";
import { IconClose, IconComment, IconSend, IconSwords, IconTrophy } from "../components/icons";
import { PuzzlePicker } from "../components/PuzzlePicker";
import { RunningFade } from "../components/Practice";
import { Sheet } from "../components/Sheet";
import { StopSurface, responder } from "../components/TimerSurface";
import { Btn, Label, PageHead, SkeletonLine, mono } from "../components/ui";

/**
 * The web app's duel (desktop/renderer/duel.tsx) at phone size: looking for an opponent near the player's level,
 * then the race — the scramble, the opponent's timer over the player's, the rounds as a board of cells in the tab
 * bar's sixths — the chat and the result with its rematch.
 */
export function DuelPage() {
  const { duel } = useDuel();
  const event = useAtomValue(eventAtom);
  useEffect(() => {
    void duel.loadLevel(event);
    // A search follows the puzzle: it starts again on the new event.
    if (duel.status === "searching" && eventInfo(event) && duel.levelEvent !== event) void duel.search(event);
  }, [event, duel]);
  return duel.status === "racing" ? <Race /> : <Lobby />;
}

const clock = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

/** Before a race: the player's level on the event and one big cell to start (or stop) looking for an opponent. */
function Lobby() {
  const t = useTheme();
  const { duel } = useDuel();
  const event = useAtomValue(eventAtom);
  const { pagePadding } = useLayout();
  const searching = duel.status === "searching";
  const [, setSecond] = useState(0);
  useEffect(() => {
    if (!searching) return;
    const id = setInterval(() => setSecond(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [searching]);
  const label = eventInfo(event)?.label ?? event;
  const figures: [string, string | null][] = [
    ["Your level", duel.level === undefined ? null : duel.level === null ? "New" : fmtTime(duel.level)],
    ["Searching", searching ? clock(Date.now() - duel.searchSince) : "—"],
    ["Also searching", searching ? String(duel.searching) : "—"],
  ];
  return <View style={styles.page}>
    <PageHead title="Duel" sub={label} padding={pagePadding} right={<PuzzlePicker />} />
    <View style={[styles.lobbyHead, { borderColor: t.line, paddingHorizontal: pagePadding }]}>
      <Label>{`One against one · ${label}`}</Label>
      <Text style={[styles.lobbyTitle, { color: t.text }]}>{searching ? "Looking for an opponent" : "Race an Ao5"}</Text>
      <Text style={{ color: duel.notice ? t.danger : t.muted, fontSize: 13.5, lineHeight: 20 }}>
        {duel.notice || "The same five scrambles for both of you, against a player near your level."}
      </Text>
    </View>
    <View style={styles.figures}>
      {figures.map(([name, value], i) => <View key={name} style={[styles.figure, { borderColor: t.line, borderLeftWidth: i ? 1 : 0 }]}>
        <Label>{name}</Label>
        {value === null ? <SkeletonLine width={72} height={26} radius={0} /> : <Text numberOfLines={1} style={[mono(t, 26), { lineHeight: 32 }]}>{value}</Text>}
      </View>)}
    </View>
    <Pressable accessibilityRole="button" onPress={() => searching ? duel.leave() : void duel.search(event)}
      style={({ pressed }) => [styles.start, { borderColor: t.line, backgroundColor: searching ? pressed ? t.hover : "transparent" : pressed ? t.accentPressed : t.accent }]}>
      <Text style={[styles.startText, { color: searching ? t.text : "#fff" }]}>{searching ? "Cancel" : "Find an opponent"}</Text>
    </Pressable>
  </View>;
}

/** The time of a side at rest: its latest solve, or zero before its first. */
const shown = (v: DuelSolve | undefined) => (v ? fmtSolve(v.ms, v.penalty) : "0.000");

/** Only this text node re-renders on animation frames. */
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

/** What the opponent is doing, in a word or two. */
function opponentStatus(d: ReturnType<typeof useDuel>["duel"]) {
  if (!d.opponentHere) return "Left";
  if (d.over) return "Finished";
  if (d.opponentPhase === "running") return "Solving";
  if (d.opponentPhase !== "idle") return "Ready";
  if (d.them[d.round]) return "Done";
  return d.scrambles.length ? `Round ${d.round + 1}` : "Waiting";
}

/** The player's timer: a hold then a release like the timer page; every phase reaches the opponent. */
function useDuelTimer(): TimerApi {
  const { duel, epoch } = useDuel();
  const timer = useTimer({ onStop: ms => duel.solve(ms), canStart: duel.canSolve });
  useEffect(() => { timer.reset(); }, [epoch]);
  useEffect(() => { if (timer.phase !== "stopped") duel.timer(timer.phase); }, [timer.phase, duel]);
  const setRunning = useSetAtom(timerRunningAtom);
  useLayoutEffect(() => { setRunning(timer.phase === "running"); }, [timer.phase, setRunning]);
  useLayoutEffect(() => () => { setRunning(false); }, [setRunning]);
  return timer;
}

function Race() {
  useKeepAwake("cubix-duel", { suppressDeactivateWarnings: true });
  const t = useTheme();
  const { duel } = useDuel();
  const { pagePadding, width } = useLayout();
  const timer = useDuelTimer();
  const running = timer.phase === "running";
  const opponent = duel.opponent, me = duel.players[duel.seat], round = duel.round;
  const event = eventInfo(duel.event);
  const scramble = duel.scrambles[Math.min(round, ROUNDS - 1)] ?? "";
  const [digitsWidth, setDigitsWidth] = useState(width);
  const font = Math.max(40, Math.min(digitsWidth * 0.19, 96));
  const digit = (color: string) => ({ fontFamily: FONT.mono, fontSize: font, lineHeight: Math.round(font * 1.12), fontWeight: "500" as const, letterSpacing: -font * 0.04, color, fontVariant: ["tabular-nums" as const], includeFontPadding: false });
  const phaseColor = (phase: string, rest: string) => phase === "holding" ? t.danger : phase === "ready" ? t.good : rest;
  const myHint = !duel.opponentHere ? `${opponent.name} left the race`
    : duel.over ? "Race over"
    : !duel.scrambles.length ? "Drawing the scrambles…"
    : duel.me[round] ? `Waiting for ${opponent.name}`
    : timer.phase === "holding" ? "Keep holding…"
    : timer.phase === "ready" ? "Release to start"
    : running ? "Tap to stop" : "Hold, then release to start";
  const scrambleFont = scramble.length > 90 ? 15 : 19;
  return <View style={styles.page}>
    <RunningFade hidden={running}>
      <PageHead title="Duel" sub={`vs ${opponent.name} · ${event ? eventLabel(event.puzzle, event.solveMode) : duel.event}`} padding={pagePadding}
        controls={<>
          {duel.over && duel.dismissed === duel.game && <Btn icon={IconTrophy} label="Result" onPress={() => duel.showResult(true)} />}
          {!duel.opponentHere && <Btn icon={IconSwords} label="New" accessibilityLabel="New opponent" onPress={() => void duel.next()} />}
          <Btn icon={IconComment} label={duel.unread ? `Chat · ${duel.unread}` : "Chat"} active={duel.chatOpen} onPress={() => duel.toggleChat()} />
          <Btn icon={IconClose} label="Leave" onPress={() => duel.leave()} />
        </>} />
      <View style={[styles.scramble, { borderColor: t.line, paddingHorizontal: pagePadding }]}>
        <Label>{duel.over ? "Race over · Ao5" : `Round ${round + 1} of ${ROUNDS} · Scramble`}</Label>
        {duel.over ? <Text style={{ color: t.muted, fontSize: 14 }}>Five rounds raced.</Text>
          : scramble ? <AlgText alg={scramble} size={scrambleFont} lineHeight={Math.round(scrambleFont * 1.55)} />
          : <SkeletonLine width="90%" height={scrambleFont * 1.3} radius={0} />}
      </View>
    </RunningFade>
    <View style={[styles.side, { borderColor: t.line, borderBottomWidth: 1 }]} onLayout={e => setDigitsWidth(e.nativeEvent.layout.width)}>
      <SideHead name={opponent.name} level={opponent.level} tag={opponentStatus(duel)} accent={duel.opponentPhase === "running"} />
      <View style={styles.readout}>
        {duel.opponentPhase === "running"
          ? <LiveTime startedAt={duel.opponentStart} style={digit(t.text)} />
          : <Text style={digit(!duel.opponentHere ? t.muted : phaseColor(duel.opponentPhase, t.text))}>{duel.opponentPhase === "idle" ? shown(duel.them[duel.latest(duel.them)]) : "0.000"}</Text>}
      </View>
    </View>
    <View style={styles.side} {...responder(timer, !duel.canSolve && !running)}>
      <SideHead name={me?.name ?? ""} level={me?.level ?? null} tag="You" />
      <View style={styles.readout}>
        {running ? <LiveTime startedAt={timer.startedAt} style={digit(t.accent)} />
          : <Text style={digit(phaseColor(timer.phase, t.accent))}>{timer.phase === "idle" || timer.phase === "stopped" ? shown(duel.me[duel.latest(duel.me)]) : "0.000"}</Text>}
        <Text numberOfLines={1} style={[styles.hint, { color: t.muted, opacity: running ? 0 : 1 }]}>{myHint}</Text>
      </View>
    </View>
    <RunningFade hidden={running}><Board actions /></RunningFade>
    <Chat />
    <Result />
    <StopSurface timer={timer} />
  </View>;
}

/** The head of a side: its name and level, then a cell saying who or what, flush on the right. */
function SideHead({ name, level, tag, accent }: { name: string; level: number | null; tag: string; accent?: boolean }) {
  const t = useTheme();
  const { pagePadding } = useLayout();
  return <View style={[styles.sideHead, { borderColor: t.line, paddingLeft: pagePadding }]}>
    <Text numberOfLines={1} style={{ color: t.text, fontSize: 13.5, fontWeight: "600", flexShrink: 1 }}>{name}</Text>
    {level ? <Text style={[mono(t, 12, "400"), { color: t.muted }]}>{fmtTime(level)}</Text> : null}
    <View style={[styles.sideTag, { borderColor: t.line }]}><Label style={accent ? { color: t.accent } : undefined}>{tag}</Label></View>
  </View>;
}

/**
 * The rounds in the tab bar's sixths: the five rounds and the Ao5 of the player, then (with `actions`) +2, DNF and
 * Cancel two sixths each, then the opponent's. The round being raced is lit, won rounds and the better Ao5 green.
 */
function Board({ actions = false }: { actions?: boolean }) {
  const t = useTheme();
  const { duel } = useDuel();
  const row = (seat: number) => {
    const solves = duel.results[seat] ?? [], other = duel.results[1 - seat] ?? [];
    const own = ao5(solves), rival = ao5(other);
    return <View key={seat} style={[styles.boardRow, { borderColor: t.line, borderTopWidth: seat === duel.seat ? 0 : 1 }]}>
      {[...Array(ROUNDS).keys()].map(r => {
        const v = solves[r], won = !!v && !!other[r] && compare(solveTime(v), solveTime(other[r]!)) === "win";
        return <View key={r} style={[styles.boardCell, { borderColor: t.line, borderLeftWidth: r ? 1 : 0, backgroundColor: r === duel.round ? t.surface2 : "transparent" }]}>
          <Text style={[styles.round, { color: r === duel.round ? t.accent : t.muted }]}>{r + 1}</Text>
          <Text numberOfLines={1} style={[mono(t, 12.5), { color: v?.penalty === "dnf" ? t.danger : won ? t.good : t.text }]}>{v ? fmtSolve(v.ms, v.penalty) : ""}</Text>
        </View>;
      })}
      <View style={[styles.boardCell, { borderColor: t.line, borderLeftWidth: 1 }]}>
        <Text style={[styles.round, { color: t.muted }]}>AO5</Text>
        <Text numberOfLines={1} style={[mono(t, 12.5, "600"), { color: own !== undefined && rival !== undefined && compare(own, rival) === "win" ? t.good : t.text }]}>
          {own === undefined ? "" : own === null ? "DNF" : fmtTime(own)}
        </Text>
      </View>
    </View>;
  };
  const last = duel.me[duel.latest(duel.me)];
  const cell = (label: string, onPress: () => void, on: boolean, disabled: boolean, tone: string, first = false) =>
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.action, { borderColor: t.line, borderLeftWidth: first ? 0 : 1, opacity: disabled ? 0.4 : 1, backgroundColor: on || pressed ? tone + "24" : "transparent" }]}>
      <Text style={[mono(t, 15), { color: on ? tone : t.secondary }]}>{label}</Text>
    </Pressable>;
  return <View style={[styles.board, { borderColor: t.line }]}>
    {row(duel.seat)}
    {actions && <View style={[styles.boardRow, { borderColor: t.line, borderTopWidth: 1 }]}>
      {cell("+2", () => duel.penalty("+2"), last?.penalty === "+2", !last, t.warning, true)}
      {cell("DNF", () => duel.penalty("dnf"), last?.penalty === "dnf", !last, t.danger)}
      {cell("Cancel", () => duel.cancel(), false, !duel.canCancel, t.danger)}
    </View>}
    {row(1 - duel.seat)}
  </View>;
}

/** Live chat with the opponent, in a sheet: messages over a field and its send cell. */
function Chat() {
  const t = useTheme();
  const { duel } = useDuel();
  const [text, setText] = useState("");
  const list = useRef<FlatList>(null);
  const send = () => { duel.say(text); setText(""); };
  return <Sheet open={duel.chatOpen} onClose={() => duel.toggleChat()} title="Chat" sub={String(duel.chat.length)} tall flush>
    <FlatList ref={list} data={duel.chat} keyExtractor={(_, i) => String(i)} style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 6 }}
      onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
      ListEmptyComponent={<Text style={{ color: t.muted, fontSize: 12.5, padding: 16 }}>No messages yet.</Text>}
      renderItem={({ item }) => <View style={styles.chatLine}>
        <Text style={[mono(t, 11, "400"), { color: item.seat === duel.seat ? t.accent : t.muted }]}>{duel.players[item.seat]?.name}</Text>
        <Text style={{ color: t.text, fontSize: 14 }}>{item.text}</Text>
      </View>} />
    <View style={[styles.chatForm, { borderColor: t.line }]}>
      <TextInput value={text} onChangeText={setText} maxLength={300} onSubmitEditing={send} submitBehavior="submit" returnKeyType="send"
        editable={duel.opponentHere} placeholder={duel.opponentHere ? "Message" : `${duel.opponent.name} left`} placeholderTextColor={t.muted}
        cursorColor={t.accent} selectionColor={t.soft} style={[styles.chatInput, { color: t.text }]} accessibilityLabel="Message" />
      <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={!text.trim() || !duel.opponentHere} onPress={send}
        style={({ pressed }) => [styles.chatSend, { borderColor: t.line, opacity: text.trim() && duel.opponentHere ? 1 : 0.4, backgroundColor: pressed ? t.hover : "transparent" }]}>
        <IconSend size={16} color={t.text} />
      </Pressable>
    </View>
  </Sheet>;
}

/** Once both have raced the five rounds: who won, the rounds, and a rematch or another opponent. */
function Result() {
  const t = useTheme();
  const { duel } = useDuel();
  if (!duel.over) return null;
  const own = ao5(duel.me), rival = ao5(duel.them), result = compare(own, rival), opponent = duel.opponent.name;
  const asked = duel.rematch[duel.seat], offered = duel.rematch[1 - duel.seat];
  const note = !duel.opponentHere ? `${opponent} left.` : offered && !asked ? `${opponent} wants a rematch.` : asked ? `Waiting for ${opponent}…` : "";
  const average = (v: number | null | undefined) => v === undefined ? "" : v === null ? "DNF" : fmtTime(v);
  const cells: [string, () => void, boolean, boolean][] = [
    [offered && !asked ? "Accept rematch" : "Rematch", () => duel.askRematch(), !duel.opponentHere || asked, offered && !asked],
    ["New opponent", () => void duel.next(), false, false],
    ["Leave", () => duel.leave(), false, false],
  ];
  return <Sheet open={duel.dismissed !== duel.game} onClose={() => duel.showResult(false)} title={result === "win" ? "You win" : result === "loss" ? `${opponent} wins` : "Draw"} flush>
    <View style={[styles.score, { borderColor: t.line }]}>
      {([[duel.players[duel.seat]?.name ?? "", own, result === "win"], [opponent, rival, result === "loss"]] as const).map(([name, value, won], i) =>
        <View key={i} style={[styles.scoreSide, { borderColor: t.line, borderLeftWidth: i ? 1 : 0 }]}>
          <Label numberOfLines={1}>{name}</Label>
          <Text style={[mono(t, 34), { lineHeight: 40, color: won ? t.good : t.text }]}>{average(value)}</Text>
          <Label>Ao5</Label>
        </View>)}
    </View>
    <Board />
    {note ? <Text style={[styles.note, { color: t.muted, borderColor: t.line }]}>{note}</Text> : null}
    <View style={[styles.boardRow, { borderColor: t.line, borderTopWidth: 1 }]}>
      {cells.map(([label, onPress, disabled, primary], i) => <Pressable key={label} accessibilityRole="button" disabled={disabled} onPress={onPress}
        style={({ pressed }) => [styles.resultCell, { borderColor: t.line, borderLeftWidth: i ? 1 : 0, opacity: disabled ? 0.4 : 1, backgroundColor: primary ? t.accent : pressed ? t.hover : "transparent" }]}>
        <Text numberOfLines={1} style={[mono(t, 13), { color: primary ? "#fff" : t.text }]}>{label}</Text>
      </Pressable>)}
    </View>
  </Sheet>;
}

const styles = StyleSheet.create({
  page: { flex: 1, minHeight: 0 },
  lobbyHead: { gap: 8, paddingVertical: 24, borderBottomWidth: 1 },
  lobbyTitle: { fontSize: 28, fontWeight: "600", letterSpacing: -0.6, fontFamily: FONT.mono },
  figures: { flex: 1, minHeight: 0, flexDirection: "row", borderBottomWidth: 0 },
  figure: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center", gap: 10 },
  start: { height: 72, alignItems: "center", justifyContent: "center", borderTopWidth: 1 },
  startText: { fontFamily: FONT.mono, fontSize: 20, fontWeight: "500", letterSpacing: 0.6 },
  scramble: { gap: 6, paddingVertical: 12, borderBottomWidth: 1 },
  side: { flex: 1, minHeight: 0 },
  sideHead: { flexDirection: "row", alignItems: "center", gap: 10, height: 36, borderBottomWidth: 1 },
  sideTag: { alignSelf: "stretch", justifyContent: "center", marginLeft: "auto", paddingHorizontal: 14, borderLeftWidth: 1 },
  readout: { flex: 1, alignItems: "center", justifyContent: "center" },
  hint: { fontSize: 12.5, lineHeight: 18, height: 18, marginTop: 10 },
  board: { borderTopWidth: 1 },
  boardRow: { flexDirection: "row", height: 48 },
  boardCell: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center" },
  round: { position: "absolute", top: 4, left: 6, fontSize: 9.5, fontFamily: FONT.mono },
  action: { flex: 1, alignItems: "center", justifyContent: "center" },
  chatLine: { paddingVertical: 6, paddingHorizontal: 16, gap: 1 },
  chatForm: { flexDirection: "row", height: 52, borderTopWidth: 1 },
  chatInput: { flex: 1, paddingHorizontal: 16, fontSize: 14 },
  chatSend: { width: 52, alignItems: "center", justifyContent: "center", borderLeftWidth: 1 },
  score: { flexDirection: "row", borderBottomWidth: 1 },
  scoreSide: { flex: 1, minWidth: 0, alignItems: "center", gap: 6, paddingVertical: 20, paddingHorizontal: 10 },
  note: { fontSize: 13, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1 },
  resultCell: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center", height: 52 },
});
