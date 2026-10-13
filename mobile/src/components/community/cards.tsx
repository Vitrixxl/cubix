import { CalendarClock, Check, ChevronRight, Crown, Play, Users, X } from "lucide-react-native";
import { Fragment, useEffect, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { eventName, formatText, matchUrl, scoreOf, seatIn, tournamentUrl, type Match, type MatchSolve, type Message, type Tournament } from "../../../../src/client/lib/community";
import type { EventId } from "../../../../src/shared/puzzles";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { community } from "../../lib/social";
import { useColors } from "../../theme";
import { Figure, Numeric } from "../layout";
import { Face } from "../chat/kit";
import { Pill } from "./marks";
import { PuzzleIcon } from "../PuzzlePicker";
import { Sheet, SheetScrollView } from "../Sheet";
import { SolveTime } from "../duel/parts";
import { EventTile, MatchStatusBadge, StatusBadge, Strip, day, relative, time, when } from "../tournaments/format";
import { tr } from "../../../../src/client/i18n";
import { plural } from "../../../../src/client/lib/format";

/**
 * Battles and tournaments as cards in a conversation (the web's community/cards.tsx): who plays, where it stands, and
 * what to do now (accept, play, watch, register), kept up to date as it goes. A battle opens on its detail, every solve
 * with both times and its scramble; a tournament on its page.
 */

const me = () => community.host.account().id;
const go = (url: string) => community.host.navigate(url);

/** A card in a conversation that opens something as a whole; the buttons on it act on their own. */
function Card({ onPress, label, children }: { onPress: () => void; label: string; children: ReactNode }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    className="w-full max-w-[26rem] gap-3 rounded-2xl border border-border bg-card p-3.5 active:bg-muted/40">{children}</Pressable>;
}
function CardButton({ icon, label, onPress, variant = "default" }: { icon?: typeof Check; label: string; onPress: () => void; variant?: "default" | "outline" | "ghost" }) {
  return <Button size="sm" variant={variant} className="h-10 rounded-lg px-3" onPress={onPress}>
    {icon ? <Icon as={icon} size={15} /> : null}
    <Text className={variant === "ghost" ? "text-muted-foreground" : undefined}>{label}</Text>
  </Button>;
}

/** Where a battle stands, in a sentence. */
function statusLine(m: Match) {
  const [a, b] = names(m), winner = m.winner ? (m.players[0]?.id === m.winner ? a : b) : a;
  return m.status === "done" ? m.forfeit ? tr("{0} won: the other player gave up or the organisers decided.", { 0: winner }) : tr("{0} won {1}.", { 0: winner, 1: relative(m.finishedAt ?? m.createdAt) })
    : m.status === "cancelled" ? tr("Called off before it was played.")
      : m.status === "waiting" ? m.players[1] ? tr("Waiting for {0} to accept.", { 0: b }) : tr("Waiting for someone in the group to take it up.")
        : m.status === "ready" ? tr("Accepted: it starts with the first scramble.") : tr("Under way: {0} solves so far.", { 0: m.solved });
}

/**
 * A battle in a conversation: the event and how it is won, where it stands, the two players face to face (with the
 * score once it is played), and the next step for whoever reads it. `onOpen` shows its detail.
 */
export function BattleCard({ match, onOpen }: { match: Match; onOpen: (m: Match) => void }) {
  const colors = useColors(), m = community.card(match), seat = seatIn(m, me()),
    // Aimed at the account, or open to anyone in the group but its author.
    challenged = m.status === "waiting" && (seat === 1 || (!m.players[1] && seat === null)),
    playing = m.status === "ready" || m.status === "live",
    scored = m.status === "live" || m.status === "done",
    cancellable = seat !== null && (m.status === "waiting" || m.status === "ready"),
    score = scoreOf(m);
  const actions: { label: string; run: () => void; tone: "primary" | "muted" }[] = [];
  if (challenged) actions.push({ label: tr("Accept"), run: () => void community.acceptBattle(m), tone: "primary" });
  if (playing) actions.push({ label: seat !== null ? tr("Play") : tr("Watch"), run: () => go(matchUrl(m.id)), tone: "primary" });
  if (cancellable) actions.push({ label: seat === 0 ? tr("Call off") : tr("Decline"), run: () => void community.cancelBattle(m), tone: "muted" });
  return <View className="w-full max-w-[26rem] gap-2.5 rounded-2xl border border-border bg-card p-3" accessibilityLabel={tr("Battle")}>
    <View className="flex-row items-center gap-1.5">
      <PuzzleIcon puzzle={m.event as EventId} size={16} color={colors.foreground} />
      <Text className="text-base font-bold tracking-tight">{eventName(m.event)}</Text>
      <Text numberOfLines={1} className="min-w-0 flex-1 text-sm text-muted-foreground">{formatText(m)}</Text>
      <MatchStatusBadge status={m.status} />
    </View>
    <View className="flex-row items-center gap-1.5">
      {([0, 1] as const).map(i => {
        const p = m.players[i];
        return <Fragment key={i}>
          {i === 1 ? <Text className="text-xs font-extrabold text-muted-foreground">{tr("vs")}</Text> : null}
          <View className="min-w-0 flex-1 items-center gap-1 rounded-2xl bg-muted px-2 py-2.5">
            {p ? <Face name={p.username} src={p.avatar} size={30} /> : <View className="size-[30px] items-center justify-center rounded-full bg-background"><Icon as={Users} size={14} className="text-muted-foreground" /></View>}
            <Text numberOfLines={1} className={cn("text-[13px] font-extrabold", !p && "text-muted-foreground", !!m.winner && m.winner === p?.id && "text-success")}>{!p ? tr("Anyone") : p.id === me() ? tr("You") : p.username}</Text>
            {scored ? <Numeric className="text-xl font-extrabold">{score[i]}</Numeric> : null}
          </View>
        </Fragment>;
      })}
    </View>
    <View className="flex-row gap-2">
      {actions.map(a => <Pill key={a.label} text={a.label} tone={a.tone} onPress={a.run} className="flex-1" />)}
      {actions.length < 2 ? <Pill text={tr("Details")} tone="soft" onPress={() => onOpen(m)} className="flex-1" /> : null}
    </View>
  </View>;
}

/** Each solve's set, counted as the match went: a set ends when a player takes `points` solves of it. */
function setsOf(solves: MatchSolve[], points: number) {
  let set = 1;
  const wins = [0, 0];
  return solves.map(solve => {
    const current = set;
    if (solve.winner !== null) {
      wins[solve.winner]!++;
      if (wins[solve.winner]! >= points) { set++; wins[0] = wins[1] = 0; }
    }
    return current;
  });
}

/** A battle in full: where and when it was played, the score, and every solve with both times and its scramble. */
export function MatchSheet({ match, onClose }: { match: Match | null; onClose: () => void }) {
  useEffect(() => { if (match) void community.load(`match:${match.id}`); }, [match?.id, match?.status, match?.solved]);
  const m = match && community.card(match);
  return <Sheet open={!!m} onClose={onClose} title={m ? <MatchTitle m={m} /> : ""} description={m ? describe(m) : undefined}>
    {m ? <MatchBody m={m} onClose={onClose} /> : null}
  </Sheet>;
}
const names = (m: Match) => m.players.map(p => p?.username ?? tr("Anyone")) as [string, string];
function MatchTitle({ m }: { m: Match }) {
  const colors = useColors(), [a, b] = names(m);
  return <View className="flex-row items-center gap-2">
    <PuzzleIcon puzzle={m.event as EventId} size={18} color={colors.foreground} />
    <Text accessibilityRole="header" numberOfLines={1} className="shrink text-base font-semibold">{a} <Text className="font-normal text-muted-foreground">{tr("vs")}</Text> {b}</Text>
  </View>;
}
const describe = (m: Match) => `${eventName(m.event)} · ${formatText(m)} · ${m.tournament ? `${m.tournament} · ` : m.group ? `${m.group} · ` : ""}${day(m.startedAt ?? m.createdAt)} · ${time(m.startedAt ?? m.createdAt)}`;

function MatchBody({ m, onClose }: { m: Match; onClose: () => void }) {
  const solves = m.solves, sets = solves ? setsOf(solves, m.points) : [], winner = m.winner ? (m.players[0]?.id === m.winner ? 0 : 1) : null, who = names(m), score = scoreOf(m);
  return <>
    <Strip>
      {([0, 1] as const).map(seat => <View key={seat} className={cn("w-1/2", seat === 1 && "items-end")}>
        <Figure label={who[seat]} value={score[seat]} size="xl" tone={winner === seat ? "good" : ""} className={seat === 1 ? "items-end" : undefined} />
        <Text className="text-xs text-muted-foreground">{m.sets > 1 ? tr("sets") : tr("solves won")}</Text>
      </View>)}
    </Strip>
    <Text className="text-sm text-muted-foreground">{statusLine(m)}</Text>
    {!solves ? m.solved > 0 ? <View className="gap-2" accessibilityLabel={tr("Loading")}>
      {Array.from({ length: Math.min(m.solved, 5) }, (_, i) => <Skeleton key={i} className="h-6" />)}
    </View> : null : solves.length ? <View className="max-h-80 rounded-lg border border-border bg-card">
      <SheetScrollView contentContainerClassName="px-1 pb-1" accessibilityLabel={tr("Solves")}>
        <View className="h-8 flex-row items-center border-b border-border">
          <Text className="w-9 px-2 text-xs font-medium text-muted-foreground">#</Text>
          {who.map((name, i) => <Text key={i} numberOfLines={1} className="flex-1 px-2 text-right text-xs font-medium text-muted-foreground">{name}</Text>)}
        </View>
        {solves.map((solve, i) => <View key={solve.number}>
          {m.sets > 1 && sets[i] !== sets[i - 1] ? <Text className="px-2 pt-3 pb-1 text-xs font-medium text-muted-foreground">{tr("Set {0}", { 0: sets[i] })}</Text> : null}
          <View className="min-h-8 flex-row items-center">
            <Numeric className="w-9 px-2 text-xs text-muted-foreground">{solve.number}</Numeric>
            {solve.results.map((r, seat) => <View key={seat} className="flex-1 flex-row justify-end px-2"><SolveTime r={r ?? undefined} best={solve.winner === seat} /></View>)}
          </View>
          <Text selectable className="px-2 pb-1.5 pl-9 font-mono text-xs text-muted-foreground">{solve.scramble}</Text>
        </View>)}
      </SheetScrollView>
    </View> : null}
    {m.status === "ready" || m.status === "live" || m.status === "done" ? <Button variant="outline" className="h-11 rounded-lg" onPress={() => { onClose(); go(matchUrl(m.id)); }}>
      <Text>{m.status === "done" ? tr("Open") : seatIn(m, me()) !== null ? tr("Play") : tr("Watch")}</Text>
      <Icon as={ChevronRight} size={16} />
    </Button> : null}
  </>;
}

/** Registering for an open tournament, or taking the registration back. */
function RegisterButton({ t }: { t: Tournament }) {
  if (t.status !== "open") return null;
  const full = !!t.maxPlayers && t.players >= t.maxPlayers;
  return t.registered
    ? <CardButton icon={X} label={tr("Unregister")} variant="outline" onPress={() => void community.register(t.id, false)} />
    : <Button size="sm" disabled={full} className="h-10 rounded-lg px-3" onPress={() => void community.register(t.id, true)}><Text>{full ? tr("Full") : tr("Register")}</Text></Button>;
}

/** A tournament in a conversation: the tournaments page's card, opening its page. */
export function TournamentChatCard({ tournament }: { tournament: Tournament }) {
  const t = community.summary(tournament);
  return <Card label={tr("Open {0}", { 0: t.name })} onPress={() => go(tournamentUrl(t.id))}>
    <View className="flex-row items-start gap-3">
      <EventTile event={t.event} />
      <View className="min-w-0 flex-1 gap-1">
        <Text numberOfLines={2} className="text-base leading-snug font-semibold tracking-tight">{t.name}</Text>
        <Text className="text-sm text-muted-foreground">{t.group ? <Text className="text-sm text-foreground/80">{t.group} · </Text> : null}{eventName(t.event)} · {formatText(t)}</Text>
      </View>
      <StatusBadge t={t} />
    </View>
    <View className="flex-row flex-wrap gap-x-5 gap-y-1.5">
      <Line icon={CalendarClock}>{t.status === "open" ? tr("Starts {0}", { 0: when(t.startsAt) }) : t.status === "running" ? tr("Started {0}", { 0: relative(t.startedAt ?? t.startsAt) }) : day(t.finishedAt ?? t.startsAt)}</Line>
      <Line icon={Users}>{t.maxPlayers ? tr("{0} / {1} players", { 0: t.players, 1: t.maxPlayers }) : plural(t.players, "player")}</Line>
      {t.winner ? <Line icon={Crown} tone="text-warning">{tr("{0} won the tournament", { 0: t.winner.username })}</Line> : null}
    </View>
    {t.status === "open" || t.myMatch ? <View className="flex-row flex-wrap items-center gap-2">
      {t.registered ? <View className="flex-row items-center gap-1"><Icon as={Check} size={14} className="text-success" /><Text className="text-sm text-success">{tr("Registered")}</Text></View> : null}
      <RegisterButton t={t} />
      {t.myMatch ? <CardButton icon={Play} label={tr("Play")} onPress={() => go(matchUrl(t.myMatch!))} /> : null}
    </View> : null}
  </Card>;
}
function Line({ icon, tone, children }: { icon: typeof Users; tone?: string; children: string }) {
  return <View className="flex-row items-center gap-2">
    <Icon as={icon} size={16} className={tone ?? "text-muted-foreground"} />
    <Numeric className={cn("text-sm", tone ? "text-foreground" : "text-muted-foreground")}>{children}</Numeric>
  </View>;
}

export type Waiting = { key: string; event: string; lead: string; text: string; label: string; run: () => void; accent: boolean };
/** What waits for the account in a conversation, the latest first: battles to take or play, tournaments to enter or play. */
export function waiting(messages: Message[]) {
  const out: Waiting[] = [];
  for (const message of [...messages].reverse()) {
    if (message.match) {
      const m = community.card(message.match), seat = seatIn(m, me()), lead = eventName(m.event), key = "m" + m.id, event = m.event;
      if (m.status === "waiting" && (seat === 1 || (!m.players[1] && seat === null)))
        out.push({ key, event, lead, text: m.players[1] ? tr("{0} challenges you", { 0: m.players[0]?.username }) : tr("{0} waits for an opponent", { 0: m.players[0]?.username }), label: tr("Accept"), run: () => void community.acceptBattle(m), accent: true });
      else if (m.status === "waiting" && seat === 0) out.push({ key, event, lead, text: tr("Your battle waits"), label: tr("Call off"), run: () => void community.cancelBattle(m), accent: false });
      else if ((m.status === "ready" || m.status === "live") && seat !== null) out.push({ key, event, lead, text: tr("Your battle is on"), label: tr("Play"), run: () => go(matchUrl(m.id)), accent: true });
    } else if (message.tournament) {
      const t = community.summary(message.tournament), key = "t" + t.id, left = t.maxPlayers ? t.maxPlayers - t.players : null;
      if (t.myMatch) out.push({ key, event: t.event, lead: t.name, text: tr("Your match is ready"), label: tr("Play"), run: () => go(matchUrl(t.myMatch!)), accent: true });
      else if (t.status === "open" && !t.registered && left !== 0)
        out.push({ key, event: t.event, lead: time(t.startsAt), text: left ? `${t.name} · ${tr("{0} places left", { 0: left })}` : t.name, label: tr("Register"), run: () => void community.register(t.id, true), accent: true });
    }
  }
  return out;
}

/** One thing that waits, on a line: the puzzle, a word in bold, what it is, and its step. */
export function WaitingLine({ w, children }: { w: Waiting; children?: ReactNode }) {
  const colors = useColors();
  return <View className="min-h-11 flex-row items-center gap-2.5">
    <PuzzleIcon puzzle={w.event as EventId} size={16} color={colors.foreground} />
    <Numeric numberOfLines={1} className="max-w-28 shrink-0 text-sm font-bold">{w.lead}</Numeric>
    <Text numberOfLines={1} className="min-w-0 flex-1 text-sm text-muted-foreground">{w.text}</Text>
    {children ?? <Pill text={w.label} tone={w.accent ? "primary" : "muted"} onPress={w.run} />}
  </View>;
}

