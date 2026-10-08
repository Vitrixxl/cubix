import { CalendarClock, Check, ChevronRight, Crown, Eye, Play, Swords, Users, X } from "lucide-react-native";
import { useEffect, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { eventName, formatText, matchUrl, scoreOf, seatIn, tournamentUrl, type Match, type MatchSolve, type Tournament } from "../../../../src/client/lib/community";
import type { EventId } from "../../../../src/shared/puzzles";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { community } from "../../lib/social";
import { useColors } from "../../theme";
import { Figure, IconTile, Numeric } from "../layout";
import { PuzzleIcon } from "../PuzzlePicker";
import { Sheet, SheetScrollView } from "../Sheet";
import { SolveTime } from "../duel/parts";
import { EventTile, MatchStatusBadge, PlayerLine, StatusBadge, Strip, day, relative, time, when } from "../tournaments/format";
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
    className="w-full max-w-[26rem] gap-3 rounded-xl border border-border bg-card p-4 active:bg-muted/40">{children}</Pressable>;
}
function CardButton({ icon, label, onPress, variant = "default" }: { icon?: typeof Check; label: string; onPress: () => void; variant?: "default" | "outline" | "ghost" }) {
  return <Button size="sm" variant={variant} className="h-10 rounded-lg px-3" onPress={onPress}>
    {icon ? <Icon as={icon} size={15} /> : null}
    <Text className={variant === "ghost" ? "text-muted-foreground" : undefined}>{label}</Text>
  </Button>;
}

/** A battle in a conversation: its players and score, its state, and the next step for whoever reads it. `onOpen` shows its detail. */
export function BattleCard({ match, onOpen }: { match: Match; onOpen: (m: Match) => void }) {
  const colors = useColors(), m = community.card(match), seat = seatIn(m, me()),
    // Aimed at the account, or open to anyone in the group but its author.
    challenged = m.status === "waiting" && (seat === 1 || (!m.players[1] && seat === null)),
    playing = m.status === "ready" || m.status === "live",
    scored = m.status === "live" || m.status === "done",
    cancellable = seat !== null && (m.status === "waiting" || m.status === "ready");
  return <Card label={tr("Battle details")} onPress={() => onOpen(m)}>
    <View className="flex-row items-center gap-3">
      <IconTile icon={Swords} />
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row items-center gap-1.5">
          <Text className="text-sm font-medium">{tr("Battle")}</Text>
          <PuzzleIcon puzzle={m.event as EventId} size={14} color={colors.mutedForeground} />
          <Text numberOfLines={1} className="shrink text-sm text-muted-foreground">{eventName(m.event)}</Text>
        </View>
        <Text className="text-xs text-muted-foreground">{formatText(m)}</Text>
      </View>
      <View className="self-start"><MatchStatusBadge status={m.status} /></View>
    </View>
    <Players m={m} scored={scored} />
    {challenged || playing || cancellable ? <View className="flex-row flex-wrap items-center gap-1.5">
      {challenged ? <CardButton icon={Check} label={tr("Accept")} onPress={() => void community.acceptBattle(m)} /> : null}
      {playing ? <CardButton icon={seat !== null ? Play : Eye} label={seat !== null ? tr("Play") : tr("Watch")} variant={seat !== null ? "default" : "outline"} onPress={() => go(matchUrl(m.id))} /> : null}
      {cancellable ? <CardButton label={seat === 0 ? tr("Call off") : tr("Decline")} variant="ghost" onPress={() => void community.cancelBattle(m)} /> : null}
    </View> : null}
  </Card>;
}

/** The two players of a battle, one per line with their score: the winner in bold with a check, the account's name. */
function Players({ m, scored }: { m: Match; scored: boolean }) {
  return <View className="gap-2">
    {([0, 1] as const).map(seat => {
      const p = m.players[seat];
      return <PlayerLine key={seat} p={p} name={!p ? tr("Anyone") : p.id === me() ? tr("You") : undefined} won={!!p && m.winner === p.id} decided={!!m.winner} me={p?.id === me()}
        score={scored ? scoreOf(m)[seat] : undefined} />;
    })}
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
    <Text className="text-sm text-muted-foreground">
      {m.status === "done" ? m.forfeit ? tr("{0} won: the other player gave up or the organisers decided.", { 0: who[winner ?? 0] }) : tr("{0} won {1}.", { 0: who[winner ?? 0], 1: relative(m.finishedAt ?? m.createdAt) })
        : m.status === "cancelled" ? tr("Called off before it was played.")
          : m.status === "waiting" ? m.players[1] ? tr("Waiting for {0} to accept.", { 0: who[1] }) : tr("Waiting for someone in the group to take it up.")
            : m.status === "ready" ? tr("Accepted: it starts with the first scramble.") : tr("Under way: {0} solves so far.", { 0: m.solved })}
    </Text>
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
      <Text>{m.status === "done" ? tr("Open the match page") : seatIn(m, me()) !== null ? tr("Play") : tr("Watch")}</Text>
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
      {t.myMatch ? <CardButton icon={Play} label={tr("Play your match")} onPress={() => go(matchUrl(t.myMatch!))} /> : null}
    </View> : null}
  </Card>;
}
function Line({ icon, tone, children }: { icon: typeof Users; tone?: string; children: string }) {
  return <View className="flex-row items-center gap-2">
    <Icon as={icon} size={16} className={tone ?? "text-muted-foreground"} />
    <Numeric className={cn("text-sm", tone ? "text-foreground" : "text-muted-foreground")}>{children}</Numeric>
  </View>;
}
