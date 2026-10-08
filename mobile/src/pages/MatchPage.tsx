import { useSetAtom } from "jotai";
import { Ban, CircleAlert, Crown, Flag, ListOrdered, Plus, Undo2 } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { fmtSolve, fmtTime } from "../../../src/client/lib/format";
import { shownSolve } from "../../../src/client/lib/duel";
import { communityUrl, eventName, formatText, scoreOf, tournamentUrl, type Match, type MatchSolve } from "../../../src/client/lib/community";
import { resultTime, type Phase } from "../../../src/client/lib/match";
import { ask } from "../components/Confirm";
import { Alg, Empty, Fade, Figure, Label, Numeric, Page, PageHead, Surface, TouchAction, TouchBar } from "../components/layout";
import { Digits, LiveDigits, StopSurface, digitsSize, responder, timerHint, useTimerChrome } from "../components/Practice";
import { Sheet } from "../components/Sheet";
import { toastAtom } from "../components/Toast";
import { LiveDot, Ping, SolveTime } from "../components/duel/parts";
import { Back, Face } from "../components/tournaments/format";
import { useTimer, type TimerApi } from "../hooks/useTimer";
import { community, live, openUrl, useSocial } from "../lib/social";
import { alpha, useColors } from "../theme";
import { tr } from "../../../src/client/i18n";

/**
 * A match being raced, after the web's desktop/renderer/tournaments/match.tsx on a phone, laid out as the duel: the other
 * player's bar and timer on top, the scramble both solve between, the player's own timer (hold, then release) and bar at
 * the bottom, the solves so far in a sheet. Those who are not players watch it live. Until both players are here, who
 * is awaited; once a player has won, the result, and the way back to the tournament or the conversation.
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
  if (!m) return <Page>
    <PageHead lead={<BackTo m={null} />} title={tr("Match")} />
    {live.error ? <Empty icon={CircleAlert} title={live.error}>
      <Button variant="outline" onPress={() => live.open(id)}><Text>{tr("Try again")}</Text></Button>
    </Empty> : <RaceSkeleton />}
  </Page>;
  return <Race m={m} />;
}

/** The race on its way: the bars, the scramble, the digits. */
function RaceSkeleton() {
  return <Surface accessibilityLabel={tr("Loading")} className="min-h-0 flex-1 justify-between gap-4 p-4">
    {[0, 1].map(i => <View key={i} className={cn("gap-6", i === 1 && "flex-col-reverse")}>
      <View className="flex-row items-center gap-3">
        <Skeleton className="size-9 rounded-full" />
        <Skeleton className="h-4 flex-1" />
        <Skeleton className="h-11 w-12 rounded-lg" />
      </View>
      <Skeleton className="h-20 w-3/4 self-center" />
    </View>)}
  </Surface>;
}

/** Back to where the match belongs: its tournament, or the conversation whose card shows the battle. */
const home = (m: Match | null) =>
  m?.tournamentId ? tournamentUrl(m.tournamentId) : m?.conversationId ? communityUrl("messages/" + m.conversationId) : m?.groupId ? communityUrl(`groups/${m.groupId}`) : tournamentUrl();
/** Back where the match belongs; a battle under way has no way back but its end or forfeit. */
const BackTo = ({ m }: { m: Match | null }) => m && community.competition?.match === m.id ? null : <Back to={home(m)} />;
const me = () => community.host.account().id;
const nameOf = (m: Match, seat: number) => (m.players[seat]?.id === me() ? tr("You") : (m.players[seat]?.username ?? "–"));

/** The match's header: where it belongs, its event and format, and giving it up while playing. */
function Head({ m, forfeit }: { m: Match; forfeit: boolean }) {
  return <PageHead lead={<BackTo m={m} />} title={m.tournament ?? tr("Battle")}
    sub={[m.tournament ? tr("Round {0}", { 0: m.round }) : m.group, eventName(m.event), formatText(m)].filter(Boolean).join(" · ")}>
    {forfeit ? <Forfeit /> : null}
  </PageHead>;
}

/** Giving up the match, once asked. */
function Forfeit() {
  return <Button variant="outline" size="sm" className="gap-1.5" onPress={async () => {
    const text = tr("Your opponent wins it at once") + (live.match?.tournamentId ? " " + tr("and goes through to the next round") : "") + ".";
    if (await ask({ title: tr("Give up the match?"), text, action: tr("Forfeit"), cancel: tr("Keep playing") })) live.forfeit();
  }}>
    <Icon as={Flag} size={15} className="text-muted-foreground" /><Text className="text-muted-foreground">{tr("Forfeit")}</Text>
  </Button>;
}

/** The player's own timer: a hold then a release, as on the timer page; every phase goes to the other player, the stop as the solve itself. */
function useMatchTimer(): TimerApi {
  const timer = useTimer({ onStop: ms => live.solve(ms), canStart: live.canSolve });
  // A new solve starts the digits over.
  useEffect(() => { timer.reset(); }, [live.solves.length]);
  useEffect(() => { if (timer.phase !== "stopped") live.timer(timer.phase); }, [timer.phase]);
  useTimerChrome(timer);
  return timer;
}

/**
 * A player's bar, as over a chess board: the face, the name and the set's progress, what the player is doing under them
 * (with the live dot while solving), and the score in a box on the right, lit while the player's timer is on.
 */
function Bar({ name, progress, status, live: running, score, active }: { name: string; progress?: ReactNode; status: string; live: boolean; score: number; active: boolean }) {
  return <View className="min-w-0 flex-row items-center gap-3">
    <Face p={{ username: name }} size={36} />
    <View className="min-w-0 flex-1 gap-0.5">
      <View className="min-w-0 flex-row items-center gap-2">
        <Text numberOfLines={1} className="shrink text-[15px] font-medium">{name}</Text>
        {progress}
      </View>
      <View className="h-4 flex-row items-center gap-1.5">
        {running ? <LiveDot className="size-1.5" /> : null}
        <Text numberOfLines={1} className={cn("shrink text-xs", running ? "text-primary" : "text-muted-foreground")}>{status}</Text>
      </View>
    </View>
    <View className={cn("h-11 min-w-12 items-center justify-center rounded-lg px-3", active ? "bg-foreground" : "bg-muted")}>
      <Numeric className={cn("text-2xl font-semibold", active ? "text-background" : "text-muted-foreground")}>{score}</Numeric>
    </View>
  </View>;
}

function Race({ m }: { m: Match }) {
  const timer = useMatchTimer(),
    seat = live.seat,
    playing = seat !== null,
    // The player at the bottom; a spectator sees the first player there.
    own = seat ?? 0,
    other = 1 - own,
    current = live.current,
    last = live.solves.at(-1),
    mine = playing ? last?.results[seat] : null,
    running = timer.phase === "running",
    myPhase: Phase = playing ? (timer.phase === "stopped" ? "idle" : timer.phase) : live.phases[own];
  const [area, setArea] = useState({ width: 320, height: 160 });
  const [solvesOpen, setSolvesOpen] = useState(false);
  const colors = useColors();
  const size = digitsSize(area, 6, 104);
  const rest = (k: number) => shownSolve((current ?? last)?.results[k] ?? undefined);
  const waiting = !m.present?.every(Boolean);
  // What a player is doing, under the name in the bar.
  const status = (k: number, phase: string) => {
    if (live.over) return m.winner === m.players[k]?.id ? tr("Winner") : "";
    if (!m.present?.[k]) return tr("Away");
    if (phase === "running") return tr("Solving");
    if (phase !== "idle") return tr("Ready");
    if (current?.results[k]) return current.results[1 - k] ? "" : tr("Waiting for {0}", { 0: m.players[1 - k]?.username ?? "" });
    return tr("Here");
  };
  const rival = m.players[other];
  const myHint = timerHint(timer, {
    disabled: live.over ? tr("Match over") : waiting ? tr("Waiting for {0}…", { 0: rival?.username ?? tr("your opponent") }) : !current ? tr("Drawing the scramble…") : current.results[own] ? tr("Waiting for {0}", { 0: rival?.username }) : false,
  });
  const scramble = current?.scramble ?? "";
  const setNumber = m.score.sets[0] + m.score.sets[1] + 1;
  // Until both players are here, the race waits: no timers, only who is here and who is awaited.
  if (!live.over && waiting) return <Waiting m={m} seat={seat} />;
  const bar = (k: number, phase: Phase) => {
    const p = m.players[k];
    return <Bar name={playing && k === own ? tr("You") : p?.username ?? "–"} status={status(k, phase)} live={phase === "running"} score={scoreOf(m)[k]}
      active={phase !== "idle" || (live.over && m.winner === p?.id)}
      progress={m.sets > 1 ? <View accessibilityLabel={tr("{0} of {1} solves in this set", { 0: m.score.points[k], 1: m.points })} className="flex-row gap-1">
        {Array.from({ length: m.points }, (_, i) => <View key={i} className={cn("h-1.5 w-4 rounded-full", i < m.score.points[k] ? "bg-primary" : "bg-muted-foreground/20")} />)}
      </View> : undefined} />;
  };
  const theirPhase = live.phases[other];
  return <Page className="pb-0">
    <Fade hidden={running}><Head m={m} forfeit={playing && !live.over} /></Fade>
    <Fade hidden={running}><Outcome m={m} own={own} /></Fade>
    <Surface className="min-h-0 flex-1">
      <View className={cn("min-h-0 flex-1", !m.present?.[other] && "opacity-50")}>
        <Fade hidden={running} className="px-4 pt-3">{bar(other, theirPhase)}</Fade>
        <View className="min-h-0 flex-1 items-center justify-center">
          {theirPhase === "running" ? <LiveDigits startedAt={live.started[other]} size={size} />
            : <Digits text={theirPhase === "idle" ? rest(other) : "0.000"} phase={theirPhase} size={size} color={theirPhase === "idle" ? alpha(colors.foreground, 70) : undefined} />}
        </View>
      </View>
      <Fade hidden={running} className="gap-1.5 border-y border-border bg-muted/30 px-4 py-3">
        <Label>{[m.sets > 1 && !live.over && tr("Set {0}", { 0: setNumber }), current ? tr("Solve {0}", { 0: current.number }) : tr("Scramble")].filter(Boolean).join(" · ")}</Label>
        {live.over ? <Text className="text-sm text-muted-foreground">{m.status === "cancelled" ? tr("This match was called off.") : tr("{0} solves raced.", { 0: m.solves?.length ?? 0 })}</Text>
          : scramble ? <ScrollView style={{ maxHeight: 120 }}><Alg text={scramble} size={scramble.length > 90 ? 15 : 18} /></ScrollView>
          : <Skeleton style={{ height: 25, width: "90%" }} />}
      </Fade>
      <View className={cn("min-h-0 flex-1", !playing && !m.present?.[own] && "opacity-50")} {...responder(timer, !playing || (!live.canSolve && !running))}>
        <View className="min-h-0 flex-1 items-center justify-center gap-1" onLayout={e => { const { width, height } = e.nativeEvent.layout; setArea({ width, height }); }}>
          {playing && running ? <LiveDigits startedAt={timer.startedAt} size={size} />
            : !playing && myPhase === "running" ? <LiveDigits startedAt={live.started[own]} size={size} />
            : <Digits text={myPhase === "idle" ? rest(own) : "0.000"} phase={myPhase} size={size} color={!playing && myPhase === "idle" ? alpha(colors.foreground, 70) : undefined} />}
          {playing ? <Text numberOfLines={1} className={cn("min-h-5 text-sm text-muted-foreground", running && "opacity-0")}>{myHint}</Text> : null}
        </View>
        <Fade hidden={running} className="px-4 pb-3">{bar(own, myPhase)}</Fade>
      </View>
    </Surface>
    <Fade hidden={running}>
      <TouchBar className="py-1">
        {playing && !live.over ? <>
          <TouchAction icon={Plus} label="+2" accessibilityLabel={tr("+2 penalty")} pressed={mine?.penalty === "+2"} tone="warning" disabled={!mine} onPress={() => live.penalty("+2")} />
          <TouchAction icon={Ban} label={tr("DNF")} accessibilityLabel={tr("Did not finish")} pressed={mine?.penalty === "dnf"} tone="bad" disabled={!mine} onPress={() => live.penalty("dnf")} />
          <TouchAction icon={Undo2} label={tr("Redo")} accessibilityLabel={tr("Take the solve back and redo it")} disabled={!live.canCancel} onPress={() => live.cancel()} />
        </> : null}
        <TouchAction icon={ListOrdered} label={tr("Solves")} onPress={() => setSolvesOpen(true)} />
      </TouchBar>
    </Fade>
    <Sheet open={solvesOpen} onClose={() => setSolvesOpen(false)} title={tr("Solves")} scroll><Solves m={m} own={own} /></Sheet>
    <Result m={m} />
    <SetFlash m={m} />
    <StopSurface timer={timer} />
  </Page>;
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

/** The latest solve decided, in words: who took it and by how much, and the set it closed. */
function Outcome({ m, own }: { m: Match; own: number }) {
  const out = lastOutcome(m);
  if (!out) return <Text className="py-2 text-sm text-muted-foreground">{tr("The first solve decides the first point.")}</Text>;
  const { solve, set, setWon } = out, w = solve.winner,
    a = resultTime(solve.results[0]), b = resultTime(solve.results[1]),
    gap = a !== null && b !== null ? Math.abs(a - b) : null,
    won = w !== null && m.players[w]?.id === me();
  const times = [own, 1 - own].map(k => solve.results[k]).map(r => (r ? fmtSolve(r.ms, r.penalty) : "–")).join(" · ") + (gap !== null && w !== null ? ` · ${tr("by {0}", { 0: fmtTime(gap) })}` : "");
  return <View accessibilityLiveRegion="polite" className={cn("h-9 flex-row items-center gap-3 rounded-lg border px-3",
    w === null ? "border-border bg-muted/45" : won ? "border-success/25 bg-success/10" : "border-destructive/25 bg-destructive/10")}>
    <Label>{tr("Solve {0}", { 0: solve.number })}</Label>
    <Text numberOfLines={1} className="min-w-0 flex-1 text-sm font-medium">
      {w === null ? tr("A tie: no point.") : setWon !== null && !live.over ? tr("{0} took it and won set {1}!", { 0: nameOf(m, w), 1: set }) : tr("{0} took it", { 0: nameOf(m, w) })}
    </Text>
    <Numeric numberOfLines={1} className="shrink-0 text-sm text-muted-foreground">{times}</Numeric>
  </View>;
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
    <View className="items-center gap-2 rounded-xl border border-border bg-popover px-10 py-7 shadow-2xl">
      <Icon as={Crown} size={32} className={mine ? "text-warning" : "text-muted-foreground"} />
      <Text className="text-center text-3xl font-semibold tracking-tight">{mine ? tr("You win set {0}", { 0: out.set }) : tr("{0} wins set {1}", { 0: nameOf(m, out.setWon), 1: out.set })}</Text>
      <Numeric className="text-lg text-muted-foreground">{tr("Sets {0} – {1}", { 0: m.score.sets[0], 1: m.score.sets[1] })}</Numeric>
    </View>
  </View>;
}

/** Before the race: who is here, who is awaited, and what will be raced. */
function Waiting({ m, seat }: { m: Match; seat: number | null }) {
  const other = seat === null ? null : m.players[1 - seat], started = (m.solves?.length ?? 0) > 0;
  return <Page>
    <Head m={m} forfeit={seat !== null} />
    <View className="min-h-0 flex-1 justify-center">
      <Surface className="items-center gap-8 px-6 py-8">
        <View className="items-center gap-2">
          <View className="flex-row items-center gap-2"><LiveDot /><Text className="text-sm font-medium text-primary">{tr("Waiting")}</Text></View>
          <Text accessibilityRole="header" className="text-center text-2xl font-semibold tracking-tight">
            {other ? (started ? tr("Waiting for {0} to come back", { 0: other.username }) : tr("Waiting for {0}", { 0: other.username })) : tr("Waiting for the players")}
          </Text>
          <Text className="max-w-xs text-center text-sm text-muted-foreground">
            {seat !== null ? tr("The race starts by itself once you are both on this page. Keep it open: {0} has been told.", { 0: other?.username ?? "" }) : tr("The race shows here once both players are on its page.")}
          </Text>
        </View>
        <View className="w-full flex-row items-center gap-4">
          {[0, 1].map(k => {
            const p = m.players[k], here = !!m.present?.[k];
            return [k === 1 ? <Text key="vs" className="text-sm text-muted-foreground">{tr("vs")}</Text> : null,
              <View key={k} className="min-w-0 flex-1 items-center gap-2">
                {/* The one awaited has a ring pulsing round its face. */}
                <View className={cn("size-14", !here && "opacity-50")}>
                  {!here ? <Ping className="border-2 border-primary/40" scale={1.35} /> : null}
                  <Face p={p} size={56} />
                </View>
                <Text numberOfLines={1} className="max-w-full text-sm font-medium">{p ? nameOf(m, k) : tr("Anyone")}</Text>
                <Badge variant={here ? "success" : "secondary"}><Text>{here ? tr("Here") : tr("Not here yet")}</Text></Badge>
              </View>];
          })}
        </View>
        {started ? <Numeric className="text-sm text-muted-foreground">{tr("Score so far · {0}", { 0: scoreOf(m).join(" – ") })}</Numeric> : null}
      </Surface>
    </View>
  </Page>;
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
      <Text accessibilityRole="header" className={cn("text-center text-3xl font-semibold tracking-tight", mine && "text-success")}>{mine ? tr("You win") : tr("{0} wins", { 0: winner?.username ?? tr("Nobody") })}</Text>
      {description ? <Text className="text-center text-xs text-muted-foreground">{description}</Text> : null}
    </View>
    <View className="flex-row items-center gap-3 pt-1">
      {[0, 1].map(k => {
        const won = !!m.winner && m.players[k]?.id === m.winner;
        return [k === 1 ? <Text key="vs" className="text-sm text-muted-foreground">{tr("vs")}</Text> : null,
          <View key={k} className="min-w-0 flex-1 items-center gap-2">
            <View className={cn("rounded-full border-2 p-0.5", won ? "border-success" : "border-transparent")}><Face p={m.players[k]} size={56} /></View>
            <Text numberOfLines={1} className="max-w-full text-sm font-medium">{m.players[k] ? nameOf(m, k) : "–"}</Text>
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
