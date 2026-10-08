import { useAtomValue } from "jotai";
import { Ban, ListOrdered, LogOut, MessageSquare, Plus, Send, Swords, Trophy, Undo2, X, type LucideIcon } from "lucide-react-native";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { BottomSheetFlatListMethods } from "@gorhom/bottom-sheet";
import { Pressable, View } from "react-native";
import { fmtTime } from "../../../src/client/lib/format";
import { eventInfo, eventLabel } from "../../../src/shared/puzzles";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { Alg, Fade, Figure, Label, MenuItem, MoreMenu, Page, PageHead, HeadButton, Surface, TouchAction, TouchBar } from "../components/layout";
import { Digits, LiveDigits, StopSurface, digitsSize, responder, timerHint, useTimerChrome } from "../components/Practice";
import { SessionButton } from "../components/PuzzlePicker";
import { Sheet, SheetFlatList, SheetInput } from "../components/Sheet";
import { UserAvatar } from "../components/UserAvatar";
import { LiveDot, MoveList, Ping, PlayerBar } from "../components/duel/parts";
import { useTimer, type TimerApi } from "../hooks/useTimer";
import { useTourTarget } from "../tour";
import { ao5, clock, compare, opponentStatus, raceAverage, ROUNDS, shownSolve, solveTime, useDuel, type DuelClient } from "../lib/duel";
import { eventAtom } from "../state";
import { alpha, useColors } from "../theme";
import { tr } from "../../../src/client/i18n";

/**
 * The web app's duel (desktop/renderer/duel.tsx) on a phone: looking for an opponent near the player's level, then the
 * race as over a chess board — the opponent's bar on top, the player's at the bottom, the scramble between their
 * timers — with the rounds, the chat and the result in sheets.
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

/** Before a race: a card with the player's level, rings going out from the mark while searching, and the one button. */
function Lobby() {
  const { duel } = useDuel();
  const panel = useTourTarget("duel");
  const event = useAtomValue(eventAtom);
  const searching = duel.status === "searching";
  const [, setSecond] = useState(0);
  useEffect(() => {
    if (!searching) return;
    const id = setInterval(() => setSecond(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [searching]);
  const label = tr(eventInfo(event)?.label ?? event);
  return <Page>
    <PageHead title={tr("Duel")}><SessionButton /></PageHead>
    <View className="flex-1 justify-end">
      <Surface {...panel} className="gap-6 p-5">
        <View className="items-center gap-4 pt-2">
          <View className="size-16 items-center justify-center">
            {searching ? <>
              <Ping className="bg-primary/25" />
              <Ping className="border border-primary/40" duration={2400} scale={1.6} />
            </> : null}
            <View className={cn("size-16 items-center justify-center rounded-full", searching ? "bg-primary/15" : "bg-muted")}>
              <Icon as={Swords} size={28} className={searching ? "text-primary" : "text-muted-foreground"} />
            </View>
          </View>
          <View className="items-center gap-1.5">
            <Text accessibilityRole="header" className="text-center text-2xl font-semibold tracking-tight">{searching ? tr("Looking for an opponent") : tr("Race an Ao5")}</Text>
            <Text className={cn("max-w-sm text-center text-sm", duel.notice ? "text-destructive" : "text-muted-foreground")}>
              {duel.notice || tr("The same five {0} scrambles for both of you, against a player near your level.", { 0: label })}
            </Text>
          </View>
        </View>
        <View className="flex-row rounded-xl bg-muted/40">
          <View className="flex-1 px-3 py-3">{duel.level === undefined ? <View className="gap-1"><Label>{tr("Your level")}</Label><Skeleton className="h-7 w-16" /></View>
            : <Figure label={tr("Your level")} size="lg" value={duel.level === null ? "New" : fmtTime(duel.level)} />}</View>
          <Figure className="flex-1 border-l border-border px-3 py-3" label={tr("Searching")} size="lg" tone={searching ? "accent" : ""} value={searching ? clock(Date.now() - duel.searchSince) : "–"} />
          <Figure className="flex-1 border-l border-border px-3 py-3" label={tr("Also searching")} size="lg" value={searching ? String(duel.searching) : "–"} />
        </View>
        <Button size="lg" variant={searching ? "ghost" : "default"} className="h-12 gap-2 rounded-xl" onPress={() => searching ? duel.leave() : void duel.search(event)}>
          <Icon as={searching ? X : Swords} size={17} className={searching ? "text-muted-foreground" : "text-primary-foreground"} />
          <Text className={cn("text-base font-semibold", searching && "text-muted-foreground")}>{searching ? tr("Cancel") : tr("Find an opponent")}</Text>
        </Button>
      </Surface>
    </View>
  </Page>;
}

/** The player's timer: a hold then a release like the timer page; every phase reaches the opponent. */
function useDuelTimer(): TimerApi {
  const { duel, epoch } = useDuel();
  const timer = useTimer({ onStop: ms => duel.solve(ms), canStart: duel.canSolve });
  useEffect(() => { timer.reset(); }, [epoch]);
  useEffect(() => { if (timer.phase !== "stopped") duel.timer(timer.phase); }, [timer.phase, duel]);
  useTimerChrome(timer);
  return timer;
}

const ROUND_LIST = [...Array(ROUNDS).keys()];
/** Each round for a seat: won, lost or drawn (false), or not raced by both yet (null). */
const roundsOf = (duel: DuelClient, seat: number) => ROUND_LIST.map(r => {
  const a = duel.results[seat]?.[r], b = duel.results[1 - seat]?.[r];
  return a && b ? compare(solveTime(a), solveTime(b)) === "win" : null;
});
/** The seat (0 the player, 1 the opponent) with the better of two times, if they differ. */
const better = (a: number | null | undefined, b: number | null | undefined) => {
  if (a === undefined || b === undefined) return null;
  const r = compare(a, b);
  return r === "win" ? 0 : r === "loss" ? 1 : null;
};

function Race() {
  const { duel } = useDuel();
  const timer = useDuelTimer();
  const running = timer.phase === "running";
  const opponent = duel.opponent, me = duel.players[duel.seat], round = duel.round;
  const event = eventInfo(duel.event);
  const scramble = duel.scrambles[Math.min(round, ROUNDS - 1)] ?? "";
  const [area, setArea] = useState({ width: 320, height: 160 });
  const size = digitsSize(area, 6, 104);
  const myLast = duel.me[duel.latest(duel.me)];
  const [roundsOpen, setRoundsOpen] = useState(false);
  const myHint = timerHint(timer, {
    disabled: !duel.opponentHere ? tr("{0} left the race", { 0: opponent.name })
      : duel.over ? tr("Race over")
      : !duel.scrambles.length ? tr("Drawing the scrambles…")
      : !!duel.me[round] && tr("Waiting for {0}", { 0: opponent.name }),
  });
  // What the player is doing, said as the opponent's is.
  const myStatus = opponentStatus({ opponentHere: true, over: duel.over, opponentPhase: timer.phase === "stopped" ? "idle" : timer.phase, them: duel.me, round, scrambles: duel.scrambles });
  const promptFont = scramble.length > 90 ? 15 : 18;
  const theirPhase = duel.opponentPhase;
  const mine = roundsOf(duel, duel.seat), theirs = roundsOf(duel, 1 - duel.seat);
  const colors = useColors();
  return <Page className="pb-0">
    <Fade hidden={running}>
      <PageHead title={tr("Duel")} sub={tr("vs {0} · {1}", { 0: opponent.name, 1: event ? eventLabel(event.puzzle, event.solveMode) : duel.event })}>
        <HeadButton icon={MessageSquare} label={duel.unread ? tr("Chat, {0} new", { 0: duel.unread }) : tr("Chat")} active={duel.chatOpen} badge={duel.unread || undefined} onPress={() => duel.toggleChat()} />
        <MoreMenu>
          {duel.over && duel.dismissed === duel.game ? <MenuItem icon={Trophy} onPress={() => duel.showResult(true)}>{tr("Result")}</MenuItem> : null}
          {!duel.opponentHere ? <MenuItem icon={Swords} onPress={() => void duel.next()}>{tr("New opponent")}</MenuItem> : null}
          <MenuItem icon={X} destructive onPress={() => duel.leave()}>{tr("Leave the race")}</MenuItem>
        </MoreMenu>
      </PageHead>
    </Fade>
    <Surface className="min-h-0 flex-1">
      <View className={cn("min-h-0 flex-1", !duel.opponentHere && "opacity-50")}>
        <Fade hidden={running} className="px-4 pt-3">
          <PlayerBar name={opponent.name} level={opponent.level ? fmtTime(opponent.level) : undefined} status={opponentStatus(duel)} live={theirPhase === "running"}
            won={theirs} score={theirs.filter(Boolean).length} active={theirPhase !== "idle"} />
        </Fade>
        <View className="min-h-0 flex-1 items-center justify-center">
          {theirPhase === "running" ? <LiveDigits startedAt={duel.opponentStart} size={size} />
            : <Digits text={theirPhase === "idle" ? shownSolve(duel.them[duel.latest(duel.them)]) : "0.000"} phase={theirPhase} size={size} color={theirPhase === "idle" ? alpha(colors.foreground, 70) : undefined} />}
        </View>
      </View>
      <Fade hidden={running} className="gap-1.5 border-y border-border bg-muted/30 px-4 py-3">
        {duel.over ? <Text className="text-sm text-muted-foreground">{tr("Five rounds raced.")}</Text> : <>
          <Label>{tr("Round {0} of {1}", { 0: Math.min(round, ROUNDS - 1) + 1, 1: ROUNDS })}</Label>
          {scramble ? <Alg text={scramble} size={promptFont} /> : <Skeleton style={{ height: promptFont * 1.4, width: "90%" }} />}
        </>}
      </Fade>
      <View className="min-h-0 flex-1" {...responder(timer, !duel.canSolve && !running)}>
        <View className="min-h-0 flex-1 items-center justify-center gap-1" onLayout={e => { const { width, height } = e.nativeEvent.layout; setArea({ width, height }); }}>
          {running ? <LiveDigits startedAt={timer.startedAt} size={size} />
            : <Digits text={timer.phase === "idle" || timer.phase === "stopped" ? shownSolve(myLast) : "0.000"} phase={timer.phase} size={size} />}
          <Text numberOfLines={1} className={cn("min-h-5 text-sm text-muted-foreground", running && "opacity-0")}>{myHint}</Text>
        </View>
        <Fade hidden={running} className="px-4 pb-3">
          <PlayerBar name={me?.name ?? ""} level={me?.level ? fmtTime(me.level) : undefined} status={myStatus} live={running}
            won={mine} score={mine.filter(Boolean).length} active={timer.phase !== "idle" && timer.phase !== "stopped"} />
        </Fade>
      </View>
    </Surface>
    <Fade hidden={running}>
      <TouchBar className="py-1">
        <TouchAction icon={Plus} label="+2" accessibilityLabel={tr("+2 penalty")} pressed={myLast?.penalty === "+2"} tone="warning" disabled={!myLast} onPress={() => duel.penalty("+2")} />
        <TouchAction icon={Ban} label={tr("DNF")} accessibilityLabel={tr("Did not finish")} pressed={myLast?.penalty === "dnf"} tone="bad" disabled={!myLast} onPress={() => duel.penalty("dnf")} />
        <TouchAction icon={Undo2} label={tr("Redo")} accessibilityLabel={tr("Take the solve back and redo it")} disabled={!duel.canCancel} onPress={() => duel.cancel()} />
        <TouchAction icon={ListOrdered} label={tr("Rounds")} onPress={() => setRoundsOpen(true)} />
      </TouchBar>
    </Fade>
    <Sheet open={roundsOpen} onClose={() => setRoundsOpen(false)} title={tr("Rounds")} description={tr("Average of five, best and worst dropped.")}><Rounds /></Sheet>
    <Chat />
    <Result />
    <StopSurface timer={timer} />
  </Page>;
}

/** The rounds as a move list: the player's time, then the opponent's, the better in green; the averages under them. */
function Rounds() {
  const { duel } = useDuel();
  const own = ao5(duel.me), rival = ao5(duel.them);
  const rows = ROUND_LIST.map(r => {
    const a = duel.me[r], b = duel.them[r];
    return { n: r + 1, results: [a, b] as [typeof a, typeof b], best: a && b ? better(solveTime(a), solveTime(b)) : null, current: r === duel.round && !duel.over };
  });
  return <MoveList label={tr("Rounds")} names={[duel.players[duel.seat]?.name ?? tr("You"), duel.opponent.name]} rows={rows}
    foot={{ label: tr("Ao5"), values: [raceAverage(own) || "–", raceAverage(rival) || "–"], best: better(own, rival) }} />;
}

/** A line the race says in the chat rather than a player: centred, muted, its icon before it. */
function Said({ icon, children }: { icon: LucideIcon; children: string }) {
  return <View className="flex-row items-center justify-center gap-1.5 py-1">
    <Icon as={icon} size={13} className="text-muted-foreground" />
    <Text className="text-center text-xs text-muted-foreground">{children}</Text>
  </View>;
}

/** Live chat with the opponent, as on a game site: "name: message" lines between what the race says, the field under them. */
function Chat() {
  const { duel } = useDuel();
  const [text, setText] = useState("");
  const list = useRef<BottomSheetFlatListMethods>(null);
  const send = () => { if (!text.trim()) return; duel.say(text); setText(""); };
  const result = duel.over ? compare(ao5(duel.me), ao5(duel.them)) : null;
  const event = eventInfo(duel.event);
  useLayoutEffect(() => { list.current?.scrollToEnd({ animated: false }); }, [duel.chat.length, duel.opponentHere, duel.over]);
  return <Sheet open={duel.chatOpen} onClose={() => { if (duel.chatOpen) duel.toggleChat(); }} title={tr("Chat")} contentClassName="gap-2 px-0">
    <View className="min-h-0 shrink"><SheetFlatList ref={list} data={duel.chat} keyExtractor={(_, i) => String(i)} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8, gap: 6 }}
      onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
      ListHeaderComponent={<>
        <Said icon={Swords}>{tr("vs {0} · {1}", { 0: duel.opponent.name, 1: event ? eventLabel(event.puzzle, event.solveMode) : duel.event })}</Said>
        {!duel.chat.length ? <Text className="py-3 text-center text-sm text-muted-foreground">{tr("No messages yet.")}</Text> : null}
      </>}
      ListFooterComponent={<>
        {result ? <Said icon={Trophy}>{result === "win" ? tr("You win") : result === "loss" ? tr("{0} wins", { 0: duel.opponent.name }) : tr("Draw")}</Said> : null}
        {!duel.opponentHere ? <Said icon={LogOut}>{tr("{0} left", { 0: duel.opponent.name })}</Said> : null}
      </>}
      renderItem={({ item }) => <Text className="text-[15px] leading-[21px]">
        <Text className={cn("font-semibold", item.seat === duel.seat ? "text-primary" : "text-foreground")}>{duel.players[item.seat]?.name}</Text>
        <Text className="text-muted-foreground">: </Text>
        {item.text}
      </Text>} /></View>
    <View className="flex-row items-center gap-2 border-t border-border px-5 pt-3">
      <SheetInput value={text} onChangeText={setText} maxLength={300} onSubmitEditing={send} submitBehavior="submit" returnKeyType="send"
        editable={duel.opponentHere} placeholder={duel.opponentHere ? tr("Message") : tr("{0} left", { 0: duel.opponent.name })} accessibilityLabel={tr("Message")} className="flex-1" />
      <Pressable accessibilityRole="button" accessibilityLabel={tr("Send")} disabled={!text.trim() || !duel.opponentHere} onPress={send}
        className={cn("size-11 items-center justify-center rounded-lg bg-primary active:bg-primary/85", (!text.trim() || !duel.opponentHere) && "opacity-40")}>
        <Icon as={Send} size={18} className="text-primary-foreground" />
      </Pressable>
    </View>
  </Sheet>;
}

/** Once both have raced the five rounds, as a game site's end card: who won, the faces and their Ao5s, the rounds, what next. */
function Result() {
  const { duel } = useDuel();
  const open = duel.over && duel.dismissed !== duel.game;
  const own = ao5(duel.me), rival = ao5(duel.them), result = compare(own, rival), opponent = duel.opponent.name;
  const asked = duel.rematch[duel.seat], offered = duel.rematch[1 - duel.seat];
  const note = !duel.opponentHere ? tr("{0} left", { 0: opponent }) : offered && !asked ? tr("{0} wants a rematch.", { 0: opponent }) : asked ? tr("Waiting for {0}…", { 0: opponent }) : "";
  const faces = [[duel.players[duel.seat]?.name ?? "", own, result === "win"], [opponent, rival, result === "loss"]] as const;
  return <Sheet open={open} onClose={() => { if (open) duel.showResult(false); }} title={tr("Result")} hideTitle>
    <View className="items-center gap-1">
      <Text accessibilityRole="header" className={cn("text-center text-3xl font-semibold tracking-tight", result === "win" ? "text-success" : result === "loss" ? "text-destructive" : "text-foreground")}>
        {result === "win" ? tr("You win") : result === "loss" ? tr("{0} wins", { 0: opponent }) : tr("Draw")}</Text>
      <Text className="text-center text-xs text-muted-foreground">{tr("Average of five, best and worst dropped.")}</Text>
    </View>
    <View className="flex-row items-center gap-3 pt-1">
      {faces.map(([name, value, won], i) => [
        i === 1 ? <Text key="vs" className="text-sm text-muted-foreground">{tr("vs")}</Text> : null,
        <View key={i} className="min-w-0 flex-1 items-center gap-2">
          <View className={cn("rounded-full border-2 p-0.5", won ? "border-success" : "border-transparent")}><UserAvatar user={{ username: name, isGuest: false }} size={56} /></View>
          <Text numberOfLines={1} className="max-w-full text-sm font-medium">{name}</Text>
          <Figure label={tr("Ao5")} size="xl" tone={won ? "good" : ""} value={raceAverage(value) || "–"} className="items-center" />
        </View>,
      ])}
    </View>
    <Rounds />
    {note ? <View className="flex-row items-center justify-center gap-2">
      {offered && !asked && duel.opponentHere ? <LiveDot /> : null}
      <Text className="text-sm text-muted-foreground">{note}</Text>
    </View> : null}
    <View className="gap-2">
      <Button size="lg" className="h-12 rounded-xl" disabled={!duel.opponentHere || asked} onPress={() => duel.askRematch()}><Text className="text-base font-semibold">{offered && !asked ? tr("Accept rematch") : tr("Rematch")}</Text></Button>
      <View className="flex-row gap-2">
        <Button variant="outline" size="lg" className="h-12 flex-1 rounded-xl" onPress={() => void duel.next()}><Text>{tr("New opponent")}</Text></Button>
        <Button variant="ghost" size="lg" className="h-12 flex-1 rounded-xl" onPress={() => duel.showResult(false)}><Text>{tr("Close")}</Text></Button>
      </View>
    </View>
  </Sheet>;
}
