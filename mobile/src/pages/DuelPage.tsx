import { useAtomValue } from "jotai";
import { Ban, MessageSquare, Plus, Send, Swords, Trophy, Undo2, X } from "lucide-react-native";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { BottomSheetFlatListMethods } from "@gorhom/bottom-sheet";
import { Pressable, View } from "react-native";
import { fmtSolve, fmtTime } from "../../../src/client/lib/format";
import { eventInfo, eventLabel } from "../../../src/shared/puzzles";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { Alg, Fade, Figure, Label, MenuItem, Numeric, MoreMenu, Page, PageHead, Surface, TouchAction, TouchBar } from "../components/layout";
import { Digits, LiveDigits, StopSurface, digitsSize, responder, timerHint, useTimerChrome } from "../components/Practice";
import { SessionButton } from "../components/PuzzlePicker";
import { Sheet, SheetFlatList, SheetInput } from "../components/Sheet";
import { useTimer, type TimerApi } from "../hooks/useTimer";
import { useTourTarget } from "../tour";
import { ao5, clock, compare, opponentStatus, raceAverage, ROUNDS, shownSolve, solveTime, useDuel } from "../lib/duel";
import { eventAtom } from "../state";
import { alpha, useColors } from "../theme";

/**
 * The web app's duel (desktop/renderer/duel.tsx) on a phone: looking for an opponent near the player's level, then the
 * race — the scramble, the opponent's timer over the player's, the rounds as a board — with the chat and the result in
 * sheets.
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

/** Before a race: the player's level on the event and the button to start (or stop) looking for an opponent. */
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
  const label = eventInfo(event)?.label ?? event;
  return <Page>
    <PageHead title="Duel"><SessionButton /></PageHead>
    <View className="flex-1" />
    <Surface {...panel}>
      <View className="items-center gap-3 px-6 pt-8 pb-7">
        <View className={cn("size-12 items-center justify-center rounded-xl", searching ? "bg-primary/15" : "bg-muted")}>
          <Icon as={Swords} size={24} className={searching ? "text-primary" : "text-muted-foreground"} />
        </View>
        <Text accessibilityRole="header" className="text-center text-2xl font-semibold tracking-tight">{searching ? "Looking for an opponent" : "Race an Ao5"}</Text>
        <Text className={cn("max-w-sm text-center text-sm leading-[20px]", duel.notice ? "text-destructive" : "text-muted-foreground")}>
          {duel.notice || `The same five ${label} scrambles for both of you, against a player near your level.`}
        </Text>
      </View>
      <View className="flex-row gap-4 border-y border-border bg-muted/30 px-6 py-4">
        <View className="flex-1">{duel.level === undefined ? <View className="gap-1"><Label>Your level</Label><Skeleton className="h-7 w-20" /></View>
          : <Figure label="Your level" size="lg" value={duel.level === null ? "New" : fmtTime(duel.level)} />}</View>
        <Figure className="flex-1" label="Searching" size="lg" value={searching ? clock(Date.now() - duel.searchSince) : "–"} />
        <Figure className="flex-1" label="Also searching" size="lg" value={searching ? String(duel.searching) : "–"} />
      </View>
      <View className="p-5">
        <Button size="lg" variant={searching ? "outline" : "default"} className="h-12 gap-2 rounded-lg" onPress={() => searching ? duel.leave() : void duel.search(event)}>
          <Icon as={searching ? X : Swords} size={17} className={searching ? "text-foreground" : "text-primary-foreground"} />
          <Text className="text-base">{searching ? "Cancel" : "Find an opponent"}</Text>
        </Button>
      </View>
    </Surface>
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

/** A side of the race: who, their level and what they are doing, then their time. */
function Side({ name, level, tag, mine, children, hint, running }: { name: string; level: number | null; tag: string; mine: boolean; children: React.ReactNode; hint?: string; running: boolean }) {
  return <View className="min-h-0 flex-1 items-center justify-center gap-2">
    <Fade hidden={running} className="flex-row items-center gap-2">
      <Text numberOfLines={1} className="shrink text-sm font-medium">{name}</Text>
      {level ? <Numeric className="text-sm text-muted-foreground">{fmtTime(level)}</Numeric> : null}
      <View className={cn("rounded-md px-1.5 py-0.5", mine ? "bg-primary/15" : "bg-muted")}>
        <Text className={cn("text-xs font-medium", mine ? "text-primary" : "text-muted-foreground")}>{tag}</Text>
      </View>
    </Fade>
    {children}
    {hint !== undefined ? <Text numberOfLines={1} className={cn("min-h-5 text-sm text-muted-foreground", running && "opacity-0")}>{hint}</Text> : null}
  </View>;
}

function Race() {
  const { duel } = useDuel();
  const timer = useDuelTimer();
  const running = timer.phase === "running";
  const opponent = duel.opponent, me = duel.players[duel.seat], round = duel.round;
  const event = eventInfo(duel.event);
  const scramble = duel.scrambles[Math.min(round, ROUNDS - 1)] ?? "";
  const [area, setArea] = useState({ width: 320, height: 200 });
  const size = digitsSize(area, 6, 104);
  const myLast = duel.me[duel.latest(duel.me)];
  const myHint = timerHint(timer, {
    disabled: !duel.opponentHere ? `${opponent.name} left the race`
      : duel.over ? "Race over"
      : !duel.scrambles.length ? "Drawing the scrambles…"
      : !!duel.me[round] && `Waiting for ${opponent.name}`,
  });
  const promptFont = scramble.length > 90 ? 15 : 18;
  const theirPhase = duel.opponentPhase;
  const colors = useColors();
  return <Page>
    <Fade hidden={running}>
      <PageHead title="Duel" sub={`vs ${opponent.name} · ${event ? eventLabel(event.puzzle, event.solveMode) : duel.event}`}>
        <Button variant={duel.chatOpen ? "secondary" : "outline"} size="icon" className="size-9" onPress={() => duel.toggleChat()} accessibilityLabel={duel.unread ? `Chat, ${duel.unread} new` : "Chat"}>
          <Icon as={MessageSquare} size={19} />
          {duel.unread ? <View className="absolute top-1 right-1 min-w-4 items-center rounded-full bg-primary px-1"><Text className="text-[10px] font-semibold text-primary-foreground">{duel.unread}</Text></View> : null}
        </Button>
        <MoreMenu>
          {duel.over && duel.dismissed === duel.game ? <MenuItem icon={Trophy} onPress={() => duel.showResult(true)}>Result</MenuItem> : null}
          {!duel.opponentHere ? <MenuItem icon={Swords} onPress={() => void duel.next()}>New opponent</MenuItem> : null}
          <MenuItem icon={X} destructive onPress={() => duel.leave()}>Leave the race</MenuItem>
        </MoreMenu>
      </PageHead>
    </Fade>
    <Surface className={cn("flex-1", running && "border-transparent bg-transparent")}>
      <Fade hidden={running} className="px-4 pt-4">
        {duel.over ? <Text className="text-sm text-muted-foreground">Five rounds raced.</Text>
          : scramble ? <Alg text={scramble} size={promptFont} />
          : <Skeleton style={{ height: promptFont * 1.4, width: "90%" }} />}
      </Fade>
      <View className="min-h-0 flex-1 py-2" onLayout={event => { const { width, height } = event.nativeEvent.layout; setArea({ width, height: height / 2 }); }}>
        <View className={cn("min-h-0 flex-1", !duel.opponentHere && "opacity-50")}>
          <Side name={opponent.name} level={opponent.level} tag={opponentStatus(duel)} mine={false} running={running}>
            {theirPhase === "running" ? <LiveDigits startedAt={duel.opponentStart} size={size} />
              : <Digits text={theirPhase === "idle" ? shownSolve(duel.them[duel.latest(duel.them)]) : "0.000"} phase={theirPhase} size={size} color={theirPhase === "idle" ? alpha(colors.foreground, 70) : undefined} />}
          </Side>
        </View>
        <View className="min-h-0 flex-1" {...responder(timer, !duel.canSolve && !running)}>
          <Side name={me?.name ?? ""} level={me?.level ?? null} tag="You" mine running={running} hint={myHint}>
            {running ? <LiveDigits startedAt={timer.startedAt} size={size} />
              : <Digits text={timer.phase === "idle" || timer.phase === "stopped" ? shownSolve(duel.me[duel.latest(duel.me)]) : "0.000"} phase={timer.phase} size={size} />}
          </Side>
        </View>
      </View>
      <Fade hidden={running} className="border-t border-border bg-muted/30 px-2 py-2">
        <Board />
        <TouchBar className="pt-1">
          <TouchAction icon={Plus} label="+2" accessibilityLabel="+2 penalty" pressed={myLast?.penalty === "+2"} tone="warning" disabled={!myLast} onPress={() => duel.penalty("+2")} />
          <TouchAction icon={Ban} label="DNF" accessibilityLabel="Did not finish" pressed={myLast?.penalty === "dnf"} tone="bad" disabled={!myLast} onPress={() => duel.penalty("dnf")} />
          <TouchAction icon={Undo2} label="Redo" accessibilityLabel="Take the solve back and redo it" disabled={!duel.canCancel} onPress={() => duel.cancel()} />
        </TouchBar>
      </Fade>
    </Surface>
    <Chat />
    <Result />
    <StopSurface timer={timer} />
  </Page>;
}

/** The rounds: one row per player, the round being raced marked, each won round and the better Ao5 in green. */
function Board() {
  const { duel } = useDuel();
  const cell = "h-8 min-w-0 flex-1 items-center justify-center rounded-md";
  return <View accessibilityLabel="Rounds" className="gap-0.5">
    <View className="flex-row items-center gap-1 px-1">
      <View className="w-16" />
      {[...Array(ROUNDS).keys()].map(r => <Text key={r} className="min-w-0 flex-1 text-center text-xs text-muted-foreground">{r + 1}</Text>)}
      <Text className="min-w-0 flex-[1.1] text-center text-xs text-muted-foreground">Ao5</Text>
    </View>
    {[duel.seat, 1 - duel.seat].map(seat => {
      const solves = duel.results[seat] ?? [], other = duel.results[1 - seat] ?? [];
      const own = ao5(solves), rival = ao5(other), mine = seat === duel.seat;
      return <View key={seat} className="min-h-8 flex-row items-center gap-1 px-1">
        <View className="w-16 flex-row items-baseline gap-1">
          <Text numberOfLines={1} className="shrink text-xs font-medium">{duel.players[seat]?.name}</Text>
          {mine && <Text className="text-[10px] text-muted-foreground">you</Text>}
        </View>
        {[...Array(ROUNDS).keys()].map(r => {
          const v = solves[r], won = !!v && !!other[r] && compare(solveTime(v), solveTime(other[r]!)) === "win";
          return <View key={r} className={cn(cell, r === duel.round && !duel.over && "bg-muted")}>
            <Numeric numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} className={cn("text-xs", v?.penalty === "dnf" && "text-destructive", won && "text-success", !v && "text-muted-foreground/40")}>{v ? fmtSolve(v.ms, v.penalty) : "–"}</Numeric>
          </View>;
        })}
        <View className={cn(cell, "flex-[1.1]")}>
          <Numeric numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} className={cn("text-xs font-medium", own !== undefined && rival !== undefined && compare(own, rival) === "win" && "text-success")}>{raceAverage(own) || "–"}</Numeric>
        </View>
      </View>;
    })}
  </View>;
}

/** Live chat with the opponent, in a sheet: messages over a field and its send button. */
function Chat() {
  const { duel } = useDuel();
  const [text, setText] = useState("");
  const list = useRef<BottomSheetFlatListMethods>(null);
  const send = () => { if (!text.trim()) return; duel.say(text); setText(""); };
  useLayoutEffect(() => { list.current?.scrollToEnd({ animated: false }); }, [duel.chat.length]);
  return <Sheet open={duel.chatOpen} onClose={() => { if (duel.chatOpen) duel.toggleChat(); }} title="Chat" description={`With ${duel.opponent.name}`} snapPoints={["60%", "100%"]} contentClassName="gap-2 px-0">
    <View className="min-h-0 flex-1"><SheetFlatList ref={list} style={{ flex: 1 }} data={duel.chat} keyExtractor={(_, i) => String(i)} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8, gap: 10 }}
      onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
      ListEmptyComponent={<Text className="py-2 text-sm text-muted-foreground">No messages yet.</Text>}
      renderItem={({ item }) => <View className={cn("max-w-[85%] gap-0.5 rounded-xl px-3 py-2", item.seat === duel.seat ? "self-end bg-primary/15" : "self-start bg-muted")}>
        <Text className={cn("text-xs font-medium", item.seat === duel.seat ? "text-primary" : "text-muted-foreground")}>{duel.players[item.seat]?.name}</Text>
        <Text className="text-[15px]">{item.text}</Text>
      </View>} /></View>
    <View className="flex-row items-center gap-2 px-5">
      <SheetInput value={text} onChangeText={setText} maxLength={300} onSubmitEditing={send} submitBehavior="submit" returnKeyType="send"
        editable={duel.opponentHere} placeholder={duel.opponentHere ? "Message" : `${duel.opponent.name} left`} accessibilityLabel="Message" className="flex-1" />
      <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={!text.trim() || !duel.opponentHere} onPress={send}
        className={cn("size-11 items-center justify-center rounded-lg bg-primary active:bg-primary/85", (!text.trim() || !duel.opponentHere) && "opacity-40")}>
        <Icon as={Send} size={18} className="text-primary-foreground" />
      </Pressable>
    </View>
  </Sheet>;
}

/** Once both have raced the five rounds: who won, the rounds, and a rematch or another opponent. */
function Result() {
  const { duel } = useDuel();
  const open = duel.over && duel.dismissed !== duel.game;
  const own = ao5(duel.me), rival = ao5(duel.them), result = compare(own, rival), opponent = duel.opponent.name;
  const asked = duel.rematch[duel.seat], offered = duel.rematch[1 - duel.seat];
  const note = !duel.opponentHere ? `${opponent} left.` : offered && !asked ? `${opponent} wants a rematch.` : asked ? `Waiting for ${opponent}…` : "";
  return <Sheet open={open} onClose={() => { if (open) duel.showResult(false); }} title={result === "win" ? "You win" : result === "loss" ? `${opponent} wins` : "Draw"}
    description="Average of five, best and worst dropped.">
    <View className="flex-row gap-6">
      {([[duel.players[duel.seat]?.name ?? "", own, result === "win"], [opponent, rival, result === "loss"]] as const).map(([name, value, won], i) =>
        <View key={i} className="flex-1 gap-1">
          <Label numberOfLines={1}>{name}</Label>
          <Numeric className={cn("text-4xl font-medium tracking-tight", won ? "text-success" : "text-foreground/80")}>{raceAverage(value) || "–"}</Numeric>
        </View>)}
    </View>
    <View className="rounded-xl bg-muted/30 p-2"><Board /></View>
    {note ? <Text className="text-sm text-muted-foreground">{note}</Text> : null}
    <View className="gap-2">
      <Button size="lg" className="h-12 rounded-lg" disabled={!duel.opponentHere || asked} onPress={() => duel.askRematch()}><Text className="text-base">{offered && !asked ? "Accept rematch" : "Rematch"}</Text></Button>
      <View className="flex-row gap-2">
        <Button variant="outline" size="lg" className="h-12 flex-1 rounded-lg" onPress={() => void duel.next()}><Text>New opponent</Text></Button>
        <Button variant="ghost" size="lg" className="h-12 flex-1 rounded-lg" onPress={() => duel.leave()}><Text>Leave</Text></Button>
      </View>
    </View>
  </Sheet>;
}
