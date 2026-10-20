import { useAtomValue, useSetAtom } from "jotai";
import { Box, CircleHelp, History, LogOut, MessageSquare, Send, Swords, Trophy, UserPlus, Users, X, type LucideIcon } from "lucide-react-native";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { BottomSheetFlatListMethods } from "@gorhom/bottom-sheet";
import { FlatList, Pressable, ScrollView, View } from "react-native";
import { Input } from "@/components/ui/input";
import { fmtTime } from "../../../src/client/lib/format";
import { eventInfo, eventLabelOf, heldScramble, puzzleInfo } from "../../../src/shared/puzzles";
import type { Conversation, Person } from "../../../src/client/lib/community";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { AppBar, PushedBar, SectionTabs } from "../components/AppBar";
import { ask } from "../components/Confirm";
import { Alg, Empty, Fade, Figure, HeadButton, IconTile, ListSkeleton, Numeric } from "../components/layout";
import { StopSurface, timerHint, useTimerChrome } from "../components/Practice";
import { ScrambleCube } from "../components/ScrambleCube";
import { Sheet, SheetFlatList, SheetInput, SheetScrollView } from "../components/Sheet";
import { UserAvatar } from "../components/UserAvatar";
import { Pill } from "../components/community/marks";
import { AddFriendSheet, PersonRow, SheetSearch, ShareLink } from "../components/community/people";
import { Cap, Fly, LiveDot, OpponentLive, Ping, RaceScore, RoundStrip, SidePanel, SolveActions, TimerCard, type Cell } from "../components/duel/parts";
import { relative } from "../components/tournaments/format";
import { useLayout } from "../hooks/useLayout";
import { useTimer, type TimerApi } from "../hooks/useTimer";
import { useTourTarget } from "../tour";
import { ANYONE_AFTER, RESULT_MARK, ao5, battles, clock, compare, matchRange, opponentStatus, raceAverage, roundsWon, ROUNDS, shownSolve, solveTime, useDuel, type DuelRecord, type DuelSolve } from "../lib/duel";
import { community, useSocial } from "../lib/social";
import { eventAtom, guidesAtom, routeAtom, signedInAtom } from "../state";
import { tr } from "../../../src/client/i18n";

/**
 * The web app's duel (desktop/renderer/duel.tsx) on a phone. The lobby is one card: racing an opponent at the player's
 * level, or challenging a friend in a sheet; adding a friend and the races played (History) are sheets from its head.
 * The race is a screen of its own: the round and its scramble, both players over the strip of rounds, the opponent live
 * in a small card, the player's own timer large, the rounds as a butterfly under it; the chat and the result in sheets.
 * On a tablet the search is a stage of its own; on a wide screen the races played, and during a race the rounds and the
 * chat, are a docked side panel.
 */
export function DuelPage() {
  const { duel } = useDuel();
  const event = useAtomValue(eventAtom);
  useEffect(() => {
    void duel.loadLevel(event);
    // A search follows the puzzle: it starts again on the new event.
    if (duel.status === "searching" && eventInfo(event) && duel.levelEvent !== event) void duel.search(event);
  }, [event, duel]);
  // The lobby says how many search its event.
  const racing = duel.status === "racing";
  useEffect(() => {
    duel.watch(racing ? "" : event);
    return () => duel.watch("");
  }, [racing, event, duel]);
  return racing ? <Race /> : <Lobby />;
}


function Lobby() {
  const { tablet, wide } = useLayout(), signedIn = useAtomValue(signedInAtom);
  const [history, setHistory] = useState(false), [friends, setFriends] = useState(false), [adding, setAdding] = useState(false);
  return <View className="flex-1">
    <AppBar>
      {signedIn ? <HeadButton icon={UserPlus} label={tr("Add a friend")} onPress={() => setAdding(true)} /> : null}
      {wide ? null : <HeadButton icon={History} label={tr("History")} onPress={() => setHistory(true)} />}
    </AppBar>
    <SectionTabs />
    <View className="min-h-0 flex-1 flex-row">
      <View className={cn("min-h-0 flex-1 px-4 pt-3.5 pb-3", tablet && "px-7 pt-5")}><Play onChallenge={() => setFriends(true)} /></View>
      {wide ? <SidePanel className="mt-5"><Played className="bg-transparent p-0" /></SidePanel> : null}
    </View>
    {wide ? null : <Sheet open={history} onClose={() => setHistory(false)} title={tr("History")} hideTitle><Played sheet /></Sheet>}
    <FriendsSheet open={friends} onClose={() => setFriends(false)} onAdd={() => setAdding(true)} />
    {signedIn ? <AddFriendSheet open={adding} onClose={() => setAdding(false)} /> : null}
  </View>;
}

/** Racing an opponent near the player's level: the level, the range it meets, who else searches; its button, a friend to challenge beside it. */
function Play({ onChallenge }: { onChallenge: () => void }) {
  const { duel } = useDuel();
  const panel = useTourTarget("duel");
  const event = useAtomValue(eventAtom), openGuide = useSetAtom(guidesAtom);
  const searching = duel.status === "searching";
  const [, setSecond] = useState(0);
  useEffect(() => {
    if (!searching) return;
    const id = setInterval(() => setSecond(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [searching]);
  const { tablet } = useLayout();
  const label = tr(eventInfo(event)?.label ?? event),
    waited = searching ? Date.now() - duel.searchSince : 0,
    range = matchRange(duel.level, waited),
    seconds = (ms: number) => (ms / 1000).toFixed(1),
    level = duel.level === null ? tr("New") : fmtTime(duel.level),
    // Those searching the event besides the player.
    others = searching ? duel.searching : duel.waiting,
    looking = range ? tr("Looking near your level…") : tr("Anyone on {0} will do…", { 0: label });
  // The search widens to anyone after ANYONE_AFTER: its share as a thin bar.
  const widening = <View className="h-1 w-12 overflow-hidden rounded-full bg-background"><View className="h-full rounded-full bg-primary" style={{ width: `${Math.min(1, waited / ANYONE_AFTER) * 100}%` }} /></View>;
  const head = <View className="flex-row items-center gap-3">
      {tablet ? null : <IconTile icon={Swords} tone="primary" className="size-11 rounded-xl" />}
      <View className="min-w-0 flex-1">
        <Text accessibilityRole="header" className="text-xl font-extrabold tracking-[-0.03em]">{tr("Ao5 race")}</Text>
        {duel.notice ? <Text numberOfLines={2} className="text-[13px] text-destructive">{duel.notice}</Text> : null}
      </View>
      <HeadButton icon={CircleHelp} label={tr("How duels work")} onPress={() => openGuide("duel")} />
    </View>;
  const figures = <View className="flex-row gap-2">
      {duel.level === undefined ? <View className="flex-1 gap-1"><Text className="text-xs font-medium text-muted-foreground">{tr("Your level")}</Text><Skeleton className="h-6 w-14" /></View>
        : <View accessible accessibilityLabel={`${tr("Your level")}: ${level}`} accessibilityHint={tr("Mean of your last 12 timer solves")} className="min-w-0 flex-1">
          <Figure label={tr("Your level")} value={level} />
        </View>}
      <Figure className="flex-1" label={tr("Matching")} value={range ? `${seconds(range[0])}–${seconds(range[1])}` : searching || duel.level === null ? tr("Anyone") : "–"} />
      <Figure className="flex-1" label={tr("Searching")} tone={others ? "good" : ""} value={others === undefined ? "–" : String(others)} />
    </View>;
  const play = <View className="flex-row gap-2">
    <Button size="lg" className="h-14 flex-1 gap-2 rounded-2xl" accessibilityLabel={tr("Play an opponent at your level")} onPress={() => void duel.search(event)}>
      <Icon as={Swords} size={19} className="text-primary-foreground" />
      <Text className="text-base font-bold">{tr("Face off")}</Text>
    </Button>
    <Button variant="secondary" size="lg" className="h-14 flex-1 gap-2 rounded-2xl" accessibilityLabel={tr("Challenge a friend")} onPress={onChallenge}>
      <Icon as={Users} size={19} />
      <Text className="text-base font-bold">{tr("Challenge")}</Text>
    </Button>
  </View>;
  // A tablet gives the search a round stage beside the figures: the clock and what it looks for, the duel's mark before.
  if (tablet) return <View {...panel} className="flex-row items-center gap-7 rounded-3xl bg-card p-6">
    <View className="size-52 items-center justify-center gap-2 rounded-full bg-muted">
      {searching ? <>
        <View className="size-3 items-center justify-center"><Ping className="bg-primary/40" /><View className="size-2.5 rounded-full bg-primary" /></View>
        <Numeric className="text-4xl font-extrabold tracking-[-0.03em]">{clock(waited)}</Numeric>
        <Text numberOfLines={2} className="max-w-36 text-center text-sm font-semibold text-muted-foreground">{looking}</Text>
        {widening}
      </> : <Icon as={Swords} size={56} className="text-primary" />}
    </View>
    <View className="min-w-0 flex-1 gap-5">
      {head}
      {figures}
      {searching ? <Button variant="secondary" size="lg" className="h-14 gap-2 rounded-2xl" onPress={() => duel.leave()}>
        <Icon as={X} size={18} /><Text className="text-base font-bold">{tr("Cancel")}</Text>
      </Button> : play}
    </View>
  </View>;
  return <View {...panel} className="gap-3.5 rounded-3xl bg-card p-4">
    {head}
    {figures}
    {searching ? <View className="h-14 flex-row items-center gap-3 rounded-2xl bg-muted pr-1.5 pl-4">
      <View className="size-3 items-center justify-center">
        <Ping className="bg-primary/40" />
        <View className="size-2.5 rounded-full bg-primary" />
      </View>
      <View className="min-w-0 flex-1">
        <Numeric className="text-base font-bold">{clock(waited)}</Numeric>
        <Text numberOfLines={1} className="text-xs text-muted-foreground">{looking}</Text>
      </View>
      {widening}
      <Button variant="ghost" className="h-11 gap-1.5 rounded-xl" onPress={() => duel.leave()}>
        <Icon as={X} size={16} className="text-muted-foreground" /><Text className="text-muted-foreground">{tr("Cancel")}</Text>
      </Button>
    </View> : play}
  </View>;
}

/**
 * The friends to challenge, in a sheet: found by name, each a tap from a battle on the puzzle chosen (first to three
 * solves), shown in the conversation with them; the link that adds the account last.
 */
function FriendsSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: () => void }) {
  useSocial();
  const signedIn = useAtomValue(signedInAtom), event = useAtomValue(eventAtom);
  const me = community.me, [query, setQuery] = useState(""), [busy, setBusy] = useState(false), q = query.trim().toLowerCase(),
    list = (me?.friends ?? []).filter(f => f.username.toLowerCase().includes(q));
  useEffect(() => { if (signedIn && !community.me) void community.load("me"); }, [signedIn]);
  useEffect(() => { if (!open) setQuery(""); }, [open]);
  const challenge = async (friend: Person) => {
    setBusy(true);
    // The battle shows in the conversation with the friend, made on first need.
    const c = await community.act<Conversation>("POST", "social/conversations", { userId: friend.id }, ["conversations"]);
    const done = c && await community.battle(c.id, { event, points: 3, sets: 1, opponentId: null });
    setBusy(false);
    if (!done) return;
    community.host.notify({ title: tr("Challenge sent to {0}", { 0: friend.username }), description: tr("It starts once they accept it.") });
    onClose();
  };
  return <Sheet open={open} onClose={onClose} title={tr("Challenge a friend")}
    right={<Text numberOfLines={1} className="shrink text-xs text-muted-foreground">{tr(eventInfo(event)?.label ?? event)} · {tr("First to 3 solves")}</Text>}>
    {!signedIn ? <Empty icon={Swords} className="flex-none p-4">{tr("Sign in to race your friends on the scrambles you pick.")}</Empty> : <>
      <SheetSearch value={query} onChangeText={setQuery} placeholder={tr("Find a friend")} />
      {!me ? <ListSkeleton rows={3} />
        : !list.length ? <Empty icon={Users} className="flex-none p-4">
          {q ? tr("No friend by that name.") : tr("No friend yet")}
          {q ? null : <Button variant="outline" className="h-11 gap-1.5 rounded-xl" accessibilityLabel={tr("Add a friend")} onPress={onAdd}><Icon as={UserPlus} size={16} /><Text>{tr("Add")}</Text></Button>}
        </Empty>
        : <SheetScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="-mx-2 gap-0.5">
          {list.map(f => <PersonRow key={f.id} p={f}>
            <Pill icon={Send} text={tr("Challenge")} label={tr("Challenge {0}", { 0: f.username })} tone="soft" disabled={busy} onPress={() => void challenge(f)} />
          </PersonRow>)}
        </SheetScrollView>}
      <ShareLink />
    </>}
  </Sheet>;
}

const MARK_BG = { win: "bg-success/15", loss: "bg-destructive/15", draw: "bg-muted" } as const, MARK_TEXT = { win: "text-success", loss: "text-destructive", draw: "text-muted-foreground" } as const;
/**
 * The races played on this device: the record, then each race newest first; the record opens them all in the profile.
 * In the History sheet (`sheet`) on a phone and a portrait tablet, docked in the side panel on a wide screen.
 */
function Played({ className, sheet = false }: { className?: string; sheet?: boolean }) {
  useDuel();
  const navigate = useSetAtom(routeAtom), { tablet } = useLayout();
  const list = battles(), count = (r: DuelRecord["result"]) => list.filter(b => b.result === r).length;
  const row = ({ item: b }: { item: DuelRecord }) => {
    const [a, z] = roundsWon(b.mine, b.theirs), [mine, theirs] = b.ao5;
    return <View className={cn("min-h-12 flex-row items-center gap-2.5 py-1", tablet && "min-h-14 gap-3")}>
      <View className={cn("size-6 items-center justify-center rounded-md", MARK_BG[b.result])}>
        <Text className={cn("text-xs font-extrabold", MARK_TEXT[b.result])}>{tr(RESULT_MARK[b.result])}</Text>
      </View>
      <UserAvatar user={{ username: b.opponent, isGuest: false }} size={32} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-sm font-bold">{b.opponent}</Text>
        <Numeric numberOfLines={1} className="text-xs text-muted-foreground">{eventLabelOf(b.event)} · {relative(Date.parse(b.at))} · {a}–{z}</Numeric>
      </View>
      <View className="items-end">
        <Numeric className="text-sm font-bold">{raceAverage(mine) || "–"}</Numeric>
        <Numeric className="text-xs text-muted-foreground">{tr("vs {0}", { 0: raceAverage(theirs) || "–" })}</Numeric>
      </View>
    </View>;
  };
  return <View className={cn(sheet ? "min-h-0 shrink gap-2" : "min-h-0 flex-1 gap-2 rounded-3xl bg-card px-4 pt-3.5 pb-1", className)}>
    <View className="flex-row items-center gap-2">
      <Text accessibilityRole="header" className="flex-1 text-base font-bold">{sheet ? tr("History") : tr("Races played")}</Text>
      {list.length ? <Pressable accessibilityRole="button" accessibilityLabel={tr("All your races")} onPress={() => navigate({ page: "profile", mode: "duels" })} className="-my-2 h-11 justify-center">
        <Text className="text-xs text-muted-foreground">
          <Text className="text-xs font-bold text-success">{tr("{0} won", { 0: count("win") })}</Text> · <Text className="text-xs font-bold text-destructive">{tr("{0} lost", { 0: count("loss") })}</Text>
          {count("draw") ? ` · ${tr("{0} drawn", { 0: count("draw") })}` : ""}
        </Text>
      </Pressable> : null}
    </View>
    {/* A tablet has the room for the record as a strip, the latest race last. */}
    {tablet && list.length ? <RoundStrip label={tr("Races played")} className="flex-none"
      cells={list.slice(0, 12).reverse().map(b => b.result === "win" ? "me" : b.result === "loss" ? "them" : "tie")} /> : null}
    {!list.length ? <Empty icon={Swords} title={tr("No race yet")} className={sheet ? "flex-none p-4" : "p-2"} />
      : sheet ? <SheetFlatList data={list} keyExtractor={b => b.id} contentContainerStyle={{ paddingBottom: 8 }} renderItem={row} />
      : <FlatList data={list} keyExtractor={b => b.id} className="min-h-0 flex-1" contentContainerStyle={{ paddingBottom: 8 }} renderItem={row} />}
  </View>;
}

/** The player's timer: a hold then a release like the timer page; every phase reaches the opponent. */
function useDuelTimer(): TimerApi {
  const { duel, epoch } = useDuel();
  const timer = useTimer({ onStop: ms => duel.solve(ms), canStart: duel.canSolve });
  useEffect(() => { timer.reset(); }, [epoch]);
  useEffect(() => { if (timer.phase !== "stopped" && timer.phase !== "inspecting") duel.timer(timer.phase); }, [timer.phase, duel]);
  useTimerChrome(timer);
  return timer;
}

const ROUND_LIST = [...Array(ROUNDS).keys()];
/** Who took each round so far, the one being raced outlined. */
const cellsOf = (mine: DuelSolve[], theirs: DuelSolve[], round: number, over: boolean): Cell[] => ROUND_LIST.map(r => {
  if (mine[r] && theirs[r]) {
    const c = compare(solveTime(mine[r]!), solveTime(theirs[r]!));
    return c === "win" ? "me" : c === "loss" ? "them" : "tie";
  }
  return r === round && !over ? "now" : "";
});
/** The seat (0 the player, 1 the opponent) with the better of two times, if they differ. */
const better = (a: number | null | undefined, b: number | null | undefined) => {
  if (a === undefined || b === undefined) return null;
  const r = compare(a, b);
  return r === "win" ? 0 : r === "loss" ? 1 : null;
};
/** A side's Ao5 as a butterfly's time: none until the five are in, a DNF when it is one. */
const asTime = (v: number | null | undefined): DuelSolve | undefined => v === undefined ? undefined : v === null ? { ms: 0, penalty: "dnf" } : { ms: v, penalty: "none" };

function Race() {
  const { duel } = useDuel();
  const timer = useDuelTimer();
  const running = timer.phase === "running";
  const opponent = duel.opponent, me = duel.players[duel.seat], round = duel.round, mine = duel.me, theirs = duel.them;
  const event = eventInfo(duel.event);
  const scramble = duel.scrambles[Math.min(round, ROUNDS - 1)] ?? "";
  const myLast = mine[duel.latest(mine)];
  const [cube, setCube] = useState(false);
  const myHint = timerHint(timer, {
    disabled: !duel.opponentHere ? tr("{0} left the race", { 0: opponent.name })
      : duel.over ? tr("Race over")
      : !duel.scrambles.length ? tr("Drawing the scrambles…")
      : !!mine[round] && tr("Waiting for {0}", { 0: opponent.name }),
  });
  const myStatus = duel.over ? tr("Finished") : running ? tr("Solving") : mine[round] ? tr("Done") : tr("Your turn");
  const won = roundsWon(mine, theirs), theirPhase = duel.opponentPhase;
  const leave = async () => {
    if (duel.over || !duel.opponentHere || await ask({ title: tr("Leave the race?"), text: tr("{0} wins the rounds still to race.", { 0: opponent.name }), action: tr("Leave"), cancel: tr("Keep racing") })) duel.leave();
  };
  const cubeSize = event ? puzzleInfo(event.puzzle).cubeSize : null;
  const { tablet, wide } = useLayout();
  // Docked on a wide screen, the chat is always open: its messages are read as they come.
  useEffect(() => { if (wide && !duel.chatOpen) duel.toggleChat(); });
  return <View className="flex-1 flex-row">
    <View className="flex-1">
      <Fade hidden={running}>
        <PushedBar title={tr("vs {0}", { 0: opponent.name })} onBack={() => void leave()}>
          {duel.over && duel.dismissed === duel.game ? <HeadButton icon={Trophy} label={tr("Result")} onPress={() => duel.showResult(true)} /> : null}
          {event && !duel.over ? <HeadButton icon={Box} label={tr("Show or hide the cube")} active={cube} onPress={() => setCube(c => !c)} /> : null}
          {wide ? null : <HeadButton icon={MessageSquare} label={duel.unread ? tr("Chat, {0} new", { 0: duel.unread }) : tr("Chat")} active={duel.chatOpen} badge={duel.unread || undefined} onPress={() => duel.toggleChat()} />}
          {!duel.opponentHere ? <Button variant="ghost" size="sm" className="h-11 gap-1 rounded-xl px-2.5" onPress={() => void duel.next()}>
            <Icon as={Swords} size={16} /><Text>{tr("New opponent")}</Text>
          </Button> : <Button variant="ghost" size="sm" className="h-11 gap-1 rounded-xl px-2.5" onPress={() => void leave()}>
            <Icon as={X} size={16} className="text-muted-foreground" /><Text className="text-muted-foreground">{tr("Leave")}</Text>
          </Button>}
        </PushedBar>
      </Fade>
      <View className={cn("min-h-0 flex-1 gap-3 px-4 pt-1 pb-3", tablet && "gap-4 px-7")}>
        <Fade hidden={running} className="gap-2.5">
          <Cap>{duel.over ? tr("Five rounds raced") : tr("Round {0} of {1}", { 0: Math.min(round, ROUNDS - 1) + 1, 1: ROUNDS })}</Cap>
          {duel.over ? null : scramble ? <ScrollView style={{ maxHeight: 96 }}><Alg text={scramble} size={scramble.length > 90 ? 15 : 17} /></ScrollView>
            : <Skeleton style={{ height: 24, width: "90%" }} />}
          <RaceScore label={tr("Rounds")} score={won} cells={cellsOf(mine, theirs, round, duel.over)} players={[
            { name: me?.name ?? "", shown: tr("You"), status: myStatus, turn: !duel.over && !mine[round] && !running },
            { name: opponent.name, status: opponentStatus(duel), live: theirPhase === "running", gone: !duel.opponentHere },
          ]} />
          <OpponentLive title={theirPhase === "running" ? tr("{0} is solving", { 0: opponent.name }) : opponent.name} gone={!duel.opponentHere}
            phase={theirPhase} startedAt={duel.opponentStart} rest={shownSolve(theirs[duel.latest(theirs)])} />
        </Fade>
        <TimerCard timer={timer} rest={shownSolve(myLast)} hint={myHint} disabled={!duel.canSolve}
          top={cube && event && scramble && !duel.over ? <ScrambleCube puzzle={event.puzzle} cubeSize={cubeSize} scramble={scramble} held={heldScramble("normal")} size={92} still={timer.phase !== "idle" && timer.phase !== "stopped"} /> : null}
          actions={duel.over ? null : <SolveActions last={myLast} onPenalty={p => duel.penalty(p)} canCancel={duel.canCancel} onCancel={() => duel.cancel()} />} />
        {wide ? null : <Fade hidden={running}><Rounds all={tablet} /></Fade>}
      </View>
    </View>
    {wide ? <Fade hidden={running}><SidePanel className="flex-1">
      <Rounds all className="px-0 pt-0" />
      <View className="min-h-0 flex-1 gap-2 border-t border-border pt-3">
        <Text accessibilityRole="header" className="text-sm font-bold">{tr("Chat")}</Text>
        <ChatBody docked />
      </View>
    </SidePanel></Fade> : <Chat />}
    <Result />
    <StopSurface timer={timer} />
  </View>;
}

/** The rounds raced so far as a butterfly, the player's times on the left; the averages once the five are in. */
function Rounds({ all = false, className }: { all?: boolean; className?: string }) {
  const { duel } = useDuel();
  const mine = duel.me, theirs = duel.them, own = ao5(mine), rival = ao5(theirs);
  // On the race, the latest three: the timer keeps the room.
  const rows = ROUND_LIST.filter(r => all || mine[r] || theirs[r]).slice(all ? 0 : -3);
  return <View accessibilityLabel={tr("Rounds")} className={cn("gap-1.5 rounded-2xl bg-card px-3.5 py-3", className)}>
    <Text className="text-sm font-bold">{tr("Rounds")} <Numeric className="text-sm font-bold text-muted-foreground">{Math.min(duel.round, ROUNDS)} / {ROUNDS}</Numeric></Text>
    {rows.map(r => <Fly key={r} n={r + 1} times={[mine[r], theirs[r]]} current={r === duel.round && !duel.over}
      best={mine[r] && theirs[r] ? better(solveTime(mine[r]!), solveTime(theirs[r]!)) : null} />)}
    {own !== undefined || rival !== undefined ? <View className="border-t border-border pt-1.5">
      <Fly n={tr("Ao5")} times={[asTime(own), asTime(rival)]} best={better(own, rival)} />
    </View> : null}
  </View>;
}

/** A line the race says in the chat rather than a player: centred, muted, its icon before it. */
function Said({ icon, children }: { icon: LucideIcon; children: string }) {
  return <View className="flex-row items-center justify-center gap-1.5 py-1">
    <Icon as={icon} size={13} className="text-muted-foreground" />
    <Text className="text-center text-xs text-muted-foreground">{children}</Text>
  </View>;
}

const QUICK = ["Well played", "GG", "Rematch?"];
/** Live chat with the opponent in its sheet. */
function Chat() {
  const { duel } = useDuel();
  return <Sheet open={duel.chatOpen} onClose={() => { if (duel.chatOpen) duel.toggleChat(); }} title={tr("Chat")} contentClassName="gap-2 px-0"><ChatBody /></Sheet>;
}

/**
 * The chat: "name: message" lines between what the race says, quick replies and the field under them; `docked` in the
 * race's side panel on a wide screen, with a plain list and field instead of the sheet's.
 */
function ChatBody({ docked = false }: { docked?: boolean }) {
  const { duel } = useDuel();
  const [text, setText] = useState("");
  const list = useRef<BottomSheetFlatListMethods>(null);
  const List = (docked ? FlatList : SheetFlatList) as typeof SheetFlatList, Field = (docked ? Input : SheetInput) as typeof SheetInput, pad = docked ? 0 : 20;
  const send = () => { if (!text.trim()) return; duel.say(text); setText(""); };
  const result = duel.over ? compare(ao5(duel.me), ao5(duel.them)) : null;
  const here = duel.opponentHere;
  useLayoutEffect(() => { list.current?.scrollToEnd({ animated: false }); }, [duel.chat.length, duel.opponentHere, duel.over]);
  return <>
    <View className={docked ? "min-h-0 flex-1" : "min-h-0 shrink"}><List ref={list} data={duel.chat} keyExtractor={(_, i) => String(i)} contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: 8, gap: 6 }}
      onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
      ListHeaderComponent={<>
        <Said icon={Swords}>{tr("vs {0} · {1}", { 0: duel.opponent.name, 1: eventLabelOf(duel.event) })}</Said>
        {!duel.chat.length ? <Text className="py-3 text-center text-sm text-muted-foreground">{tr("No messages yet.")}</Text> : null}
      </>}
      ListFooterComponent={<>
        {result ? <Said icon={Trophy}>{result === "win" ? tr("You win") : result === "loss" ? tr("{0} wins", { 0: duel.opponent.name }) : tr("Draw")}</Said> : null}
        {!here ? <Said icon={LogOut}>{tr("{0} left", { 0: duel.opponent.name })}</Said> : null}
      </>}
      renderItem={({ item }) => <Text className="text-[15px] leading-[21px]">
        <Text className={cn("font-semibold", item.seat === duel.seat ? "text-primary" : "text-foreground")}>{duel.players[item.seat]?.name}</Text>
        <Text className="text-muted-foreground">: </Text>
        {item.text}
      </Text>} /></View>
    <View className={cn("flex-row flex-wrap gap-1.5", !docked && "px-5")}>
      {QUICK.map(q => <Pressable key={q} accessibilityRole="button" disabled={!here} onPress={() => duel.say(tr(q))}
        className={cn("h-10 justify-center rounded-xl bg-muted px-3 active:bg-muted/70", !here && "opacity-40")}>
        <Text className="text-[13px] font-semibold text-muted-foreground">{tr(q)}</Text>
      </Pressable>)}
    </View>
    <View className={cn("flex-row items-center gap-2", !docked && "border-t border-border px-5 pt-3")}>
      <Field value={text} onChangeText={setText} maxLength={300} onSubmitEditing={send} submitBehavior="submit" returnKeyType="send"
        editable={here} placeholder={here ? tr("Message") : tr("{0} left", { 0: duel.opponent.name })} accessibilityLabel={tr("Message")} className={docked ? "h-11 flex-1 rounded-lg" : "flex-1"} />
      <Pressable accessibilityRole="button" accessibilityLabel={tr("Send")} disabled={!text.trim() || !here} onPress={send}
        className={cn("size-11 items-center justify-center rounded-lg bg-primary active:bg-primary/85", (!text.trim() || !here) && "opacity-40")}>
        <Icon as={Send} size={18} className="text-primary-foreground" />
      </Pressable>
    </View>
  </>;
}

/** Once both have raced the five rounds: the verdict, both faces with their Ao5, the rounds, a rematch or another opponent. */
function Result() {
  const { duel } = useDuel();
  const open = duel.over && duel.dismissed !== duel.game;
  const own = ao5(duel.me), rival = ao5(duel.them), result = compare(own, rival), opponent = duel.opponent.name;
  const asked = duel.rematch[duel.seat], offered = duel.rematch[1 - duel.seat];
  const note = !duel.opponentHere ? tr("{0} left", { 0: opponent }) : offered && !asked ? tr("{0} wants a rematch.", { 0: opponent }) : asked ? tr("Waiting for {0}…", { 0: opponent }) : "";
  const faces = [[duel.players[duel.seat]?.name ?? "", tr("You"), own, result === "win"], [opponent, opponent, rival, result === "loss"]] as const;
  return <Sheet open={open} onClose={() => { if (open) duel.showResult(false); }} title={tr("Result")} hideTitle>
    <Text accessibilityRole="header" className={cn("text-center text-4xl font-extrabold tracking-[-0.03em]", result === "win" ? "text-success" : result === "loss" ? "text-destructive" : "text-foreground")}>
      {result === "win" ? tr("Victory") : result === "loss" ? tr("Defeat") : tr("Draw")}</Text>
    <View className="flex-row items-center gap-3">
      {faces.map(([name, shown, value, won], i) => [
        i === 1 ? <Text key="vs" className="text-sm text-muted-foreground">{tr("vs")}</Text> : null,
        <View key={i} className="min-w-0 flex-1 items-center gap-1.5">
          <View className={cn("rounded-full border-2 p-0.5", won ? "border-success" : "border-transparent")}><UserAvatar user={{ username: name, isGuest: false }} size={52} /></View>
          <Text numberOfLines={1} className="max-w-full text-sm font-bold">{shown}</Text>
          <Figure label={tr("Ao5")} size="lg" tone={won ? "good" : ""} value={raceAverage(value) || "–"} className="items-center" />
        </View>,
      ])}
    </View>
    <Rounds all />
    {note ? <View className="flex-row items-center justify-center gap-2">
      {offered && !asked && duel.opponentHere ? <LiveDot /> : null}
      <Text className="text-sm font-semibold text-primary">{note}</Text>
    </View> : null}
    <View className="gap-2">
      <Button size="lg" className="h-12 rounded-xl" disabled={!duel.opponentHere || asked} onPress={() => duel.askRematch()}><Text className="text-base font-bold">{offered && !asked ? tr("Accept rematch") : tr("Rematch")}</Text></Button>
      <View className="flex-row gap-2">
        <Button variant="secondary" size="lg" className="h-12 flex-1 rounded-xl" onPress={() => void duel.next()}><Text>{tr("New opponent")}</Text></Button>
        <Button variant="ghost" size="lg" className="h-12 flex-1 rounded-xl" onPress={() => duel.showResult(false)}><Text>{tr("Close")}</Text></Button>
      </View>
    </View>
  </Sheet>;
}
