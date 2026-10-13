import { useSetAtom } from "jotai";
import { Box, CircleAlert, Crown, Flag } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { fmtTime } from "../../../src/client/lib/format";
import { shownSolve } from "../../../src/client/lib/duel";
import { communityUrl, eventName, formatText, scoreOf, tournamentUrl, type Match, type MatchSolve } from "../../../src/client/lib/community";
import { resultTime, type Phase } from "../../../src/client/lib/match";
import { eventInfo, heldScramble, puzzleInfo } from "../../../src/shared/puzzles";
import { PushedBar } from "../components/AppBar";
import { ask } from "../components/Confirm";
import { Alg, Empty, Fade, Figure, HeadButton, Numeric } from "../components/layout";
import { Digits, LiveDigits, StopSurface, digitsSize, timerHint, useTimerChrome } from "../components/Practice";
import { ScrambleCube } from "../components/ScrambleCube";
import { Sheet } from "../components/Sheet";
import { toastAtom } from "../components/Toast";
import { Cap, Fly, LiveDot, Ping, RaceScore, SidePanel, SolveActions, SolveTime, TimerCard, type Cell } from "../components/duel/parts";
import { Face, useBack } from "../components/tournaments/format";
import { useLayout } from "../hooks/useLayout";
import { useTimer, type TimerApi } from "../hooks/useTimer";
import { community, live, openUrl, useSocial } from "../lib/social";
import { alpha, useColors } from "../theme";
import { said, tr } from "../../../src/client/i18n";

/**
 * A match being raced, after the web's desktop/renderer/tournaments/match.tsx on a phone, pushed from its tournament or
 * its conversation. Until both players are here, both faces and who is awaited; then the race stacks the players and the
 * score over the strip of the set's solves, the scramble, the player's own timer (hold, then release) and the set's
 * solves as a butterfly. Those who are not players watch it live. Once a player has won, the verdict and the way back.
 * On a wide screen every solve, the match's line and the way back are a docked side panel beside the race.
 */
export function MatchPage({ id }: { id: number }) {
  useSocial();
  const dismiss = useSetAtom(toastAtom);
  useEffect(() => {
    live.open(id);
    // The notice that brought the player here, if any, has done its job.
    dismiss(t => t?.id === "community-match-" + id ? null : t);
    return () => live.close();
  }, [id, dismiss]);
  const m = live.match;
  if (!m) return <Loading />;
  return <Race m={m} />;
}

function Loading() {
  const back = useBack(tournamentUrl());
  return <View className="flex-1">
    <PushedBar title={tr("Match")} onBack={back} />
    {live.error ? <Empty icon={CircleAlert} title={live.error}>
      <Button variant="outline" onPress={() => live.open(live.id)}><Text>{tr("Try again")}</Text></Button>
    </Empty> : <View accessibilityLabel={tr("Loading")} className="min-h-0 flex-1 gap-3 px-4 pb-3">
      <View className="flex-row items-center gap-3"><Skeleton className="size-8 rounded-full" /><Skeleton className="h-4 flex-1" /><Skeleton className="size-8 rounded-full" /></View>
      <Skeleton className="h-6 w-3/4 self-center" />
      <Skeleton className="min-h-0 flex-1 rounded-3xl" />
    </View>}
  </View>;
}

/** Back to where the match belongs: its tournament, or the conversation whose card shows the battle. */
const home = (m: Match | null) =>
  m?.tournamentId ? tournamentUrl(m.tournamentId) : m?.conversationId ? communityUrl("messages/" + m.conversationId) : m?.groupId ? communityUrl(`groups/${m.groupId}`) : tournamentUrl();
const me = () => community.host.account().id;
const nameOf = (m: Match, seat: number) => (m.players[seat]?.id === me() ? tr("You") : (m.players[seat]?.username ?? "–"));

/** The match's head: where it belongs and its event, the cube, and giving it up while playing. */
function Head({ m, forfeit, cube, onCube }: { m: Match; forfeit: boolean; cube?: boolean; onCube?: () => void }) {
  const back = useBack(home(m));
  return <PushedBar title={m.tournament ?? tr("Battle")} onBack={back}>
    {onCube ? <HeadButton icon={Box} label={tr("Show or hide the cube")} active={cube} onPress={onCube} /> : null}
    {forfeit ? <Forfeit /> : null}
  </PushedBar>;
}

/** Giving up the match, once asked. */
function Forfeit() {
  return <Button variant="ghost" size="sm" className="h-11 gap-1.5 rounded-xl px-2.5" onPress={async () => {
    const text = tr("Your opponent wins it at once") + (live.match?.tournamentId ? " " + tr("and goes through to the next round") : "") + ".";
    if (await ask({ title: tr("Give up the match?"), text, action: tr("Forfeit"), cancel: tr("Keep playing") })) live.forfeit();
  }}>
    <Icon as={Flag} size={16} className="text-muted-foreground" /><Text className="text-muted-foreground">{tr("Forfeit")}</Text>
  </Button>;
}

/** The player's own timer: a hold then a release, as on the timer page; every phase goes to the other player, the stop as the solve itself. */
function useMatchTimer(): TimerApi {
  const timer = useTimer({ onStop: ms => live.solve(ms), canStart: live.canSolve });
  // A new solve starts the digits over.
  useEffect(() => { timer.reset(); }, [live.solves.length]);
  useEffect(() => { if (timer.phase !== "stopped" && timer.phase !== "inspecting") live.timer(timer.phase); }, [timer.phase]);
  useTimerChrome(timer);
  return timer;
}

/** The solves in sets: a new set after the one a player took with `points` solves. */
function setsOf(m: Match) {
  const sets: MatchSolve[][] = [[]], wins = [0, 0];
  for (const solve of m.solves ?? []) {
    sets.at(-1)!.push(solve);
    if (solve.winner !== null && ++wins[solve.winner]! >= m.points) { wins[0] = wins[1] = 0; sets.push([]); }
  }
  // Once over, the set the match ended on is the last one.
  if (sets.length > 1 && !sets.at(-1)!.length && (m.status === "done" || m.status === "cancelled")) sets.pop();
  return sets;
}

function Race({ m }: { m: Match }) {
  const timer = useMatchTimer(),
    seat = live.seat,
    playing = seat !== null,
    // The player on the left and on the timer; a spectator follows the first player there.
    own = seat ?? 0,
    other = 1 - own,
    current = live.current,
    last = live.solves.at(-1),
    mine = playing ? last?.results[seat] : null,
    running = timer.phase === "running",
    myPhase: Phase = playing ? (timer.phase === "stopped" || timer.phase === "inspecting" ? "idle" : timer.phase) : live.phases[own];
  const [solvesOpen, setSolvesOpen] = useState(false), [cube, setCube] = useState(false);
  const { tablet, wide } = useLayout();
  const rest = (k: number) => shownSolve((current ?? last)?.results[k] ?? undefined);
  const waiting = !m.present?.every(Boolean);
  // What a player is doing, under the name.
  const status = (k: number, phase: string) => {
    if (live.over) return m.winner === m.players[k]?.id ? tr("Winner") : "";
    if (!m.present?.[k]) return tr("Away");
    if (phase === "running") return tr("Solving");
    if (phase !== "idle") return tr("Ready");
    if (current?.results[k]) return current.results[1 - k] ? "" : tr("Waiting for {0}", { 0: m.players[1 - k]?.username ?? "" });
    return playing && k === own ? tr("Your turn") : tr("Here");
  };
  const rival = m.players[other];
  const myHint = timerHint(timer, {
    disabled: live.over ? tr("Match over") : waiting ? tr("Waiting for {0}…", { 0: rival?.username ?? tr("your opponent") }) : !current ? tr("Drawing the scramble…") : current.results[own] ? tr("Waiting for {0}", { 0: rival?.username }) : false,
  });
  const scramble = current?.scramble ?? "";
  // Until both players are here, the race waits: no timers, only who is here and who is awaited.
  if (!live.over && waiting) return <Waiting m={m} seat={seat} />;
  const sets = setsOf(m), set = sets.at(-1)!, setNumber = sets.length;
  const cells: Cell[] = Array.from({ length: Math.max(set.length, 2 * m.points - 1) }, (_, i) => {
    const s = set[i];
    if (!s) return "";
    if (s.winner !== null) return s.winner === own ? "me" : "them";
    return s.results[0] && s.results[1] ? "tie" : s === current && !live.over ? "now" : "";
  });
  const points = (k: number) => m.sets > 1 && !live.over ? ` · ${tr("{0} of {1}", { 0: m.score.points[k], 1: m.points })}` : "";
  const racer = (k: number, phase: Phase) => ({
    name: m.players[k]?.username ?? "–", shown: nameOf(m, k), status: status(k, phase) + points(k), live: phase === "running", turn: playing && k === own && status(k, phase) === tr("Your turn"),
    gone: !m.present?.[k] && !live.over,
    extra: k === other && phase === "running" ? <LiveDigits startedAt={live.started[k]} size={13} /> : undefined,
  });
  const theirPhase = live.phases[other];
  const event = eventInfo(m.event);
  return <View className="flex-1 flex-row">
    <View className="flex-1">
      <Fade hidden={running}><Head m={m} forfeit={playing && !live.over} cube={cube} onCube={event && !live.over ? () => setCube(c => !c) : undefined} /></Fade>
      <View className={cn("min-h-0 flex-1 gap-2.5 px-4 pt-1 pb-3", tablet && "gap-4 px-7")}>
        <Fade hidden={running} className="gap-2.5">
          <RaceScore label={m.sets > 1 ? tr("Solves of the set") : tr("Solves")} unit={m.sets > 1 ? tr("sets") : undefined}
            score={m.sets > 1 ? m.score.sets.slice() as [number, number] : [scoreOf(m)[own], scoreOf(m)[other]]}
            players={[racer(own, myPhase), racer(other, theirPhase)]} cells={cells} />
          <View className="flex-row items-center justify-between gap-3">
            <Cap className="shrink-0">{[m.sets > 1 && tr("Set {0}", { 0: setNumber }), current && !live.over ? tr("Solve {0}", { 0: current.number }) : null].filter(Boolean).join(" · ") || tr("Solves")}</Cap>
            <Outcome m={m} />
          </View>
          {live.over ? <Text className="text-center text-sm text-muted-foreground">{m.status === "cancelled" ? tr("This match was called off.") : tr("{0} solves raced.", { 0: m.solves?.length ?? 0 })}</Text>
            : scramble ? <ScrollView style={{ maxHeight: 96 }} contentContainerClassName="items-center"><Alg text={scramble} size={scramble.length > 90 ? 15 : 18} className="justify-center" /></ScrollView>
            : <Skeleton style={{ height: 24, width: "80%", alignSelf: "center" }} />}
        </Fade>
        {playing ? <TimerCard timer={timer} rest={rest(own)} hint={myHint} disabled={!live.canSolve}
          top={cube && event && scramble ? <ScrambleCube puzzle={event.puzzle} cubeSize={puzzleInfo(event.puzzle).cubeSize} scramble={scramble} held={heldScramble("normal")} size={92} still={timer.phase !== "idle" && timer.phase !== "stopped"} /> : null}
          actions={live.over ? null : <SolveActions last={mine} onPenalty={p => live.penalty(p)} canCancel={live.canCancel} onCancel={() => live.cancel()} />} />
          : <Watch phase={myPhase} startedAt={live.started[own]} rest={rest(own)} name={nameOf(m, own)} />}
        {wide ? null : <Fade hidden={running}>
          <Pressable accessibilityRole="button" accessibilityHint={tr("Every solve of the match")} onPress={() => setSolvesOpen(true)} className="gap-1.5 rounded-2xl bg-card px-3.5 py-3 active:bg-muted/60">
            <View className="flex-row items-baseline justify-between gap-2">
              <Text className="text-sm font-bold">{tr("Solves")}</Text>
              <Numeric numberOfLines={1} className="shrink text-xs text-muted-foreground">{sets.slice(0, -1).map((s, i) => setLine(m, s, i, own)).join(" · ")}</Numeric>
            </View>
            {m.sets > 1 ? <Text className="text-xs font-bold text-muted-foreground">{tr("Set {0}", { 0: setNumber })}</Text> : null}
            {set.slice(-3).map(s => <Fly key={s.number} n={s.number} times={[s.results[own] ?? undefined, s.results[other] ?? undefined]}
              best={s.winner === null ? null : s.winner === own ? 0 : 1} current={s === current && !live.over} />)}
          </Pressable>
        </Fade>}
      </View>
    </View>
    {wide ? <Fade hidden={running}><SidePanel className="flex-1">
      <Text accessibilityRole="header" className="text-base font-bold">{tr("Solves")}</Text>
      <ScrollView className="min-h-0 flex-1"><Solves m={m} own={own} /></ScrollView>
      <View className="gap-0.5 rounded-2xl bg-muted px-3.5 py-2.5">
        <Text numberOfLines={1} className="text-xs text-muted-foreground">{[m.tournament, m.tournament ? tr("Round {0}", { 0: m.round }) : m.group].filter(Boolean).join(" · ")}</Text>
        <Text className="text-sm font-bold">{[eventName(m.event), formatText(m)].join(" · ")}</Text>
      </View>
      <Button variant="secondary" className="h-11 rounded-xl" onPress={() => openUrl(home(m))}><Text>{m.tournamentId ? tr("Back to the tournament") : tr("Back to the conversation")}</Text></Button>
    </SidePanel></Fade> : null}
    <Sheet open={solvesOpen} onClose={() => setSolvesOpen(false)} title={tr("Solves")} scroll><Solves m={m} own={own} /></Sheet>
    <Result m={m} />
    <SetFlash m={m} />
    <StopSurface timer={timer} />
  </View>;
}

/** A finished set in words: "Set 1 · You 3–1", its winner's score first. */
function setLine(m: Match, set: MatchSolve[], i: number, own: number) {
  const wins = [0, 1].map(k => set.filter(s => s.winner === k).length), w = wins[0]! > wins[1]! ? 0 : 1;
  return tr("Set {0} · {1} {2}–{3}", { 0: i + 1, 1: w === own ? tr("You") : m.players[w]?.username ?? "–", 2: wins[w], 3: wins[1 - w] });
}

/** A spectator's view of the player followed: their digits live, large, on the timer's card. */
function Watch({ phase, startedAt, rest, name }: { phase: Phase; startedAt: number; rest: string; name: string }) {
  const [area, setArea] = useState({ width: 320, height: 200 });
  const colors = useColors(), size = digitsSize(area, 6, 112);
  return <View className="min-h-0 flex-1 items-center justify-center gap-2 rounded-3xl bg-card" onLayout={e => setArea(e.nativeEvent.layout)}>
    {phase === "running" ? <LiveDigits startedAt={startedAt} size={size} />
      : <Digits text={phase === "idle" ? rest : "0.000"} phase={phase} size={size} color={phase === "idle" ? alpha(colors.foreground, 70) : undefined} />}
    <Text className="text-sm text-muted-foreground">{name}</Text>
  </View>;
}

/** What the solves so far tell: the latest one decided, its set, and the seat that took the set with it. */
function lastOutcome(m: Match) {
  const wins = [0, 0];
  let set = 1, out: { solve: MatchSolve; set: number; setWon: number | null } | null = null;
  for (const solve of m.solves ?? []) {
    if (!solve.results[0] || !solve.results[1]) break;
    let setWon: number | null = null;
    if (solve.winner !== null && ++wins[solve.winner]! >= m.points) {
      setWon = solve.winner;
      wins[0] = wins[1] = 0;
    }
    out = { solve, set, setWon };
    if (setWon !== null) set++;
  }
  return out;
}

/** The latest solve decided, in words: who took it and by how much. */
function Outcome({ m }: { m: Match }) {
  const out = lastOutcome(m);
  if (!out) return null;
  const { solve } = out, w = solve.winner,
    a = resultTime(solve.results[0]), b = resultTime(solve.results[1]),
    gap = a !== null && b !== null ? Math.abs(a - b) : null;
  return <Text accessibilityLiveRegion="polite" numberOfLines={1} className="min-w-0 shrink text-xs text-muted-foreground">
    {tr("Solve {0}", { 0: solve.number })} · {w === null ? tr("A tie: no point.") : gap !== null ? tr("{0} took it by {1}", { 0: nameOf(m, w), 1: fmtTime(gap) }) : tr("{0} took it", { 0: nameOf(m, w) })}
  </Text>;
}

/** A set won: said large over the race for a moment. */
function SetFlash({ m }: { m: Match }) {
  const out = lastOutcome(m), key = out?.setWon != null ? out.solve.number : 0, [shown, setShown] = useState(0);
  useEffect(() => {
    if (!key || live.over) return;
    setShown(key);
    const t = setTimeout(() => setShown(0), 2600);
    return () => clearTimeout(t);
  }, [key]);
  if (!shown || !out || out.setWon === null) return null;
  const mine = m.players[out.setWon]?.id === me();
  return <View pointerEvents="none" className="absolute inset-0 z-20 items-center justify-center">
    <View className="items-center gap-2 rounded-3xl bg-popover px-10 py-7 shadow-2xl">
      <Icon as={Crown} size={32} className={mine ? "text-warning" : "text-muted-foreground"} />
      <Text className="text-center text-3xl font-extrabold tracking-[-0.03em]">{mine ? tr("You win set {0}", { 0: out.set }) : tr("{0} wins set {1}", { 0: nameOf(m, out.setWon), 1: out.set })}</Text>
      <Numeric className="text-lg text-muted-foreground">{tr("Sets {0} – {1}", { 0: m.score.sets[0], 1: m.score.sets[1] })}</Numeric>
    </View>
  </View>;
}

/** Before the race: both faces large, who is here and who is awaited, then what will be raced. */
function Waiting({ m, seat }: { m: Match; seat: number | null }) {
  const other = seat === null ? null : m.players[1 - seat], started = (m.solves?.length ?? 0) > 0;
  const order = seat === 1 ? [1, 0] : [0, 1];
  return <View className="flex-1">
    <Head m={m} forfeit={seat !== null} />
    <View className="min-h-0 flex-1 items-center gap-4 px-4 pt-5 pb-3">
      <Cap className="text-center">{[m.group, eventName(m.event), formatText(m)].filter(Boolean).join(" · ")}</Cap>
      <View className="mt-3 flex-row items-start gap-3">
        {order.map((k, i) => {
          const p = m.players[k], here = !!m.present?.[k];
          return [i === 1 ? <Text key="vs" className="mt-8 text-2xl font-extrabold text-muted-foreground">{tr("vs")}</Text> : null,
            <View key={k} className="w-32 items-center gap-1.5">
              {/* The one awaited has a ring pulsing round its face. */}
              <View className={cn("rounded-full border-4 p-0.5", here ? "border-primary/30" : "border-transparent opacity-60")}>
                {!here ? <Ping className="border-2 border-primary/40" scale={1.25} /> : null}
                <Face p={p} size={80} />
              </View>
              <Text numberOfLines={1} className="mt-1 max-w-full text-base font-bold">{p ? nameOf(m, k) : tr("Anyone")}</Text>
              <View className="flex-row items-center gap-1.5">
                <View className={cn("size-2 rounded-full", here ? "bg-success" : "bg-muted-foreground/50")} />
                <Text className="text-sm text-muted-foreground">{here ? tr("Here") : tr("Not here yet")}</Text>
              </View>
            </View>];
        })}
      </View>
      <Badge variant="accent" className="mt-3"><LiveDot className="size-1.5" /><Text>{tr("Waiting")}</Text></Badge>
      <Text accessibilityRole="header" className="text-center text-2xl font-extrabold tracking-[-0.03em]">
        {other ? (started ? tr("Waiting for {0} to come back", { 0: other.username }) : tr("Waiting for {0}", { 0: other.username })) : tr("Waiting for the players")}
      </Text>
      {started ? <Numeric className="text-sm text-muted-foreground">{tr("Score so far · {0}", { 0: scoreOf(m).join(" – ") })}</Numeric> : null}
      <View className="flex-1" />
      <View className="w-full flex-row gap-2.5">
        <View className="flex-1 items-center justify-center gap-0.5 rounded-2xl bg-card p-3">
          <Text className="text-2xl font-extrabold">{eventName(m.event)}</Text>
          <Text className="text-xs text-muted-foreground">{tr("Event")}</Text>
        </View>
        <View className="flex-1 items-center justify-center gap-0.5 rounded-2xl bg-card p-3">
          <Text className="text-center text-base font-bold">{formatText(m)}</Text>
          <Text className="text-xs text-muted-foreground">{tr("Format")}</Text>
        </View>
      </View>
    </View>
  </View>;
}

/** Every solve so far as a move list: both times, the faster in green, the row being raced marked, a heading where a set starts. */
function Solves({ m, own }: { m: Match; own: number }) {
  const solves = m.solves ?? [], wins = [0, 0];
  let set = 1, headed = 0;
  const cell = "min-w-0 flex-1 flex-row items-center justify-end px-2";
  if (!solves.length) return <Empty className="p-3">{tr("No solve yet.")}</Empty>;
  return <View accessibilityLabel={tr("Solves")}>
    <View className="h-8 flex-row items-center border-b border-border">
      <Text className="w-11 px-2 text-xs font-medium text-muted-foreground">#</Text>
      {[own, 1 - own].map(k => <View key={k} className={cell}><Text numberOfLines={1} className="text-xs font-medium text-muted-foreground">{nameOf(m, k)}</Text></View>)}
    </View>
    {solves.map(solve => {
      const section = m.sets > 1 && headed !== set ? tr("Set {0}", { 0: (headed = set) }) : null;
      if (solve.winner !== null && ++wins[solve.winner]! >= m.points) { set++; wins[0] = wins[1] = 0; }
      const current = !live.over && solve === live.current;
      return <View key={solve.number}>
        {section ? <Text className="px-2 pt-3 pb-1 text-xs font-medium text-muted-foreground">{section}</Text> : null}
        <View accessibilityState={{ selected: current }} className={cn("h-9 flex-row items-center rounded-md", current && "bg-muted/60")}>
          <Numeric className="w-11 px-2 text-xs text-muted-foreground">{solve.number}</Numeric>
          {[own, 1 - own].map(k => <View key={k} className={cell}><SolveTime r={solve.results[k] ?? undefined} best={solve.winner === k} /></View>)}
        </View>
      </View>;
    })}
  </View>;
}

/** Once the match is over: who won, both players face to face with their score, and back to the tournament or the conversation. */
function Result({ m }: { m: Match }) {
  const [closed, setClosed] = useState(0);
  const open = m.status === "done" && closed !== m.id;
  const winner = m.players.find(p => p?.id === m.winner), mine = !!winner && winner.id === me(),
    fastest = (m.solves ?? []).flatMap(x => x.results.map(resultTime)).filter((t): t is number => t !== null);
  const description = ((m.forfeit ? tr("The match was given.") : "") + (fastest.length ? " " + tr("Fastest solve {0}.", { 0: fmtTime(Math.min(...fastest)) }) : "")).trim();
  return <Sheet open={open} onClose={() => setClosed(m.id)} title={tr("Result")} hideTitle>
    <View className="items-center gap-1">
      <Text accessibilityRole="header" className={cn("text-center text-4xl font-extrabold tracking-[-0.03em]", mine && "text-success")}>{mine ? tr("You win") : tr("{0} wins", { 0: winner?.username ?? tr("Nobody") })}</Text>
      {description ? <Text className="text-center text-sm text-muted-foreground">{said(description)}</Text> : null}
    </View>
    <View className="flex-row items-center gap-3 pt-1">
      {[0, 1].map(k => {
        const won = !!m.winner && m.players[k]?.id === m.winner;
        return [k === 1 ? <Text key="vs" className="text-sm text-muted-foreground">{tr("vs")}</Text> : null,
          <View key={k} className="min-w-0 flex-1 items-center gap-2">
            <View className={cn("rounded-full border-2 p-0.5", won ? "border-success" : "border-transparent")}><Face p={m.players[k]} size={56} /></View>
            <Text numberOfLines={1} className="max-w-full text-sm font-bold">{m.players[k] ? nameOf(m, k) : "–"}</Text>
            <Figure label={m.sets > 1 ? tr("Sets") : tr("Solves")} size="xl" tone={won ? "good" : ""} value={scoreOf(m)[k]} className="items-center" />
          </View>];
      })}
    </View>
    <View className="flex-row gap-2">
      <Button variant="ghost" size="lg" className="h-12 flex-1 rounded-xl" onPress={() => setClosed(m.id)}><Text>{tr("Stay")}</Text></Button>
      <Button size="lg" className="h-12 flex-1 rounded-xl" onPress={() => openUrl(home(m))}><Text>{m.tournamentId ? tr("Back to the tournament") : tr("Back to the conversation")}</Text></Button>
    </View>
  </Sheet>;
}
