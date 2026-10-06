/**
 * Battles and tournaments as cards in a conversation: who plays, where it stands, and what to do now (accept, play,
 * watch, register), kept up to date as it goes. A battle opens on its detail: every solve with both times and its
 * scramble; a tournament on its page.
 */
import { useEffect, useState } from "react";
import { CalendarClock, Check, ChevronRight, Crown, Eye, Play, Swords, Trophy, Users } from "lucide-react";
import { store as s } from "../store";
import { go } from "../navigation";
import { Icon } from "../base";
import { Avatar, NUMERIC } from "../ui";
import { day, relative, time } from "../coaching/parts";
import { community, eventName, formatText, matchUrl, scoreOf, seatIn, tournamentUrl, type Match, type MatchSolve, type Person, type Tournament } from "./client";
import { RegisterButton, StatusBadge, when } from "../tournaments/page";
import { fmtSolve } from "../../../src/client/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { tr } from "../../../src/client/i18n";
import { msg } from "../../../src/client/i18n/msg";
import { said } from "../base";

/** A card's frame: the same width and face for battles and tournaments. */
const CARD = "flex w-[min(100%,26rem)] flex-col gap-3 rounded-xl border bg-card p-3.5 text-card-foreground shadow-xs";

const STATUS: Record<Match["status"], string> = { waiting: msg("Waiting"), ready: msg("Ready to play"), live: msg("Live"), done: msg("Over"), cancelled: msg("Called off") };

/** A player of a battle, or the empty seat of an open one. */
function Seat({ p, won, align = "start" }: { p: Person | null; won: boolean; align?: "start" | "end" }) {
  return (
    <span className={cn("flex min-w-0 flex-1 items-center gap-2", align === "end" && "flex-row-reverse text-right")}>
      {p ? <Avatar name={p.username} src={p.avatar} size={28} /> : <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed text-muted-foreground">?</span>}
      <span className={cn("flex min-w-0 flex-col", align === "end" && "items-end")}>
        <span className={cn("max-w-full truncate text-sm", won ? "font-semibold" : "font-medium", !p && "text-muted-foreground")}>{p ? (p.id === s.user.id ? tr("You") : p.username) : tr("Anyone")}</span>
        {won && (
          <span className="flex items-center gap-1 text-[11px] text-warning">
            <Crown className="size-3" />
            {tr("Winner")}</span>
        )}
      </span>
    </span>
  );
}

/** A battle in a conversation: its players and score, its state, and the next step for whoever reads it. */
export function BattleCard({ match }: { match: Match }) {
  const m = community.card(match),
    [open, setOpen] = useState(false),
    seat = seatIn(m, s.user.id),
    // Aimed at the account, or open to anyone in the group but its author.
    challenged = m.status === "waiting" && (seat === 1 || (!m.players[1] && seat === null)),
    playing = m.status === "ready" || m.status === "live",
    winner = m.winner ? (m.players[0]?.id === m.winner ? 0 : 1) : null,
    scored = m.status === "live" || m.status === "done";
  const cancellable = seat !== null && (m.status === "waiting" || m.status === "ready");
  return (
    <>
      {/* The card opens the battle's detail; its buttons act on their own. */}
      <article
        role="button"
        tabIndex={0}
        aria-label={tr("Battle details")}
        className={cn(CARD, "cursor-pointer text-left transition-colors outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring/50")}
        data-battle={m.id}
        data-status={m.status}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <div className="flex items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <Swords className="size-4" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              {tr("Battle")}<Icon name={"Puzzle" + m.event} size={14} />
              <span className="truncate font-normal text-muted-foreground">{eventName(m.event)}</span>
            </span>
            <span className="text-xs text-muted-foreground">{formatText(m)}</span>
          </span>
          <BattleStatus m={m} />
        </div>
        <div className="flex items-center gap-3">
          <Seat p={m.players[0]} won={winner === 0} />
          <span className={cn(NUMERIC, "shrink-0 text-lg font-semibold tabular-nums", !scored && "text-sm font-normal text-muted-foreground")}>
            {scored ? scoreOf(m).join(" – ") : tr("vs")}
          </span>
          <Seat p={m.players[1]} won={winner === 1} align="end" />
        </div>
        {(challenged || playing || cancellable) && (
          <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            {challenged && (
              <Button size="sm" onClick={() => void community.acceptBattle(m)} data-action={"battle:accept:" + m.id}>
                <Check />
                {tr("Accept")}</Button>
            )}
            {playing && (
              <Button size="sm" variant={seat !== null ? "default" : "outline"} onClick={() => go(matchUrl(m.id))}>
                {seat !== null ? <Play /> : <Eye />}
                {seat !== null ? tr("Play") : tr("Watch")}
              </Button>
            )}
            {cancellable && (
              <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => void community.cancelBattle(m)}>
                {seat === 0 ? tr("Call off") : tr("Decline")}
              </Button>
            )}
          </div>
        )}
      </article>
      <MatchDialog match={m} open={open} onOpenChange={setOpen} />
    </>
  );
}

function BattleStatus({ m }: { m: Match }) {
  if (m.status === "live")
    return (
      <Badge className="shrink-0 gap-1.5">
        <span className="size-1.5 animate-pulse rounded-full bg-primary-foreground" />
        {tr("Live")}</Badge>
    );
  return (
    <Badge variant="secondary" className={cn("shrink-0", m.status === "ready" && "bg-success/15 text-success", m.status === "cancelled" && "text-muted-foreground")}>
      {said(STATUS[m.status])}
    </Badge>
  );
}

/** Each solve's set, counted as the match went: a set ends when a player takes `points` solves of it. */
function setsOf(solves: MatchSolve[], points: number) {
  let set = 1;
  const wins = [0, 0];
  return solves.map((solve) => {
    const current = set;
    if (solve.winner !== null) {
      wins[solve.winner]!++;
      if (wins[solve.winner]! >= points) {
        set++;
        wins[0] = wins[1] = 0;
      }
    }
    return current;
  });
}

/** A battle in full: where and when it was played, the score, and every solve with both times and its scramble. */
export function MatchDialog({ match, open, onOpenChange }: { match: Match; open: boolean; onOpenChange: (open: boolean) => void }) {
  useEffect(() => {
    if (open) void community.load(`match:${match.id}`);
  }, [open, match.id, match.status, match.solved]);
  const m = community.card(match),
    solves = m.solves,
    sets = solves ? setsOf(solves, m.points) : [],
    winner = m.winner ? (m.players[0]?.id === m.winner ? 0 : 1) : null,
    names = m.players.map((p) => p?.username ?? tr("Anyone"));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl" data-slot="battle-detail">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name={"Puzzle" + m.event} size={18} />
            {names[0]} <span className="font-normal text-muted-foreground">{tr("vs")}</span> {names[1]}
          </DialogTitle>
          <DialogDescription>
            {eventName(m.event)} · {formatText(m)} · {m.tournament ? `${m.tournament} · ` : m.group ? `${m.group} · ` : ""}
            {day(m.startedAt ?? m.createdAt)} · {time(m.startedAt ?? m.createdAt)}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-xl bg-muted/45 px-4 py-3">
          <Seat p={m.players[0]} won={winner === 0} />
          <div className="flex flex-col items-center">
            <span className={cn(NUMERIC, "text-2xl font-semibold")}>
              {scoreOf(m).join(" – ")}
            </span>
            <span className="text-[11px] text-muted-foreground">{m.sets > 1 ? tr("sets") : tr("solves won")}</span>
          </div>
          <Seat p={m.players[1]} won={winner === 1} align="end" />
        </div>
        <p className="text-sm text-muted-foreground">
          {m.status === "done"
            ? m.forfeit
              ? tr("{0} won: the other player gave up or the organisers decided.", { 0: names[winner ?? 0] })
              : tr("{0} won {1}.", { 0: names[winner ?? 0], 1: relative(m.finishedAt ?? m.createdAt) })
            : m.status === "cancelled"
              ? tr("Called off before it was played.")
              : m.status === "waiting"
                ? m.players[1]
                  ? tr("Waiting for {0} to accept.", { 0: names[1] })
                  : tr("Waiting for someone in the group to take it up.")
                : m.status === "ready"
                  ? tr("Accepted: it starts with the first scramble.")
                  : tr("Under way: {0} solves so far.", { 0: m.solved })}
        </p>
        {!solves ? (
          m.solved > 0 && <Skeleton className="h-40" />
        ) : solves.length > 0 && (
          <div className="max-h-[45svh] overflow-y-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  {m.sets > 1 && <TableHead className="w-12">{tr("Set")}</TableHead>}
                  <TableHead className="text-right">{names[0]}</TableHead>
                  <TableHead className="text-right">{names[1]}</TableHead>
                  <TableHead>{tr("Scramble")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {solves.map((solve, i) => (
                  <TableRow key={solve.number} data-solve={solve.number}>
                    <TableCell className={cn(NUMERIC, "text-muted-foreground")}>{solve.number}</TableCell>
                    {m.sets > 1 && <TableCell className={cn(NUMERIC, "text-muted-foreground")}>{sets[i]}</TableCell>}
                    {[0, 1].map((seat) => {
                      const r = solve.results[seat];
                      return (
                        <TableCell key={seat} className={cn(NUMERIC, "text-right", !r ? "text-muted-foreground/50" : solve.winner === seat ? "font-semibold text-success" : r.penalty === "dnf" ? "text-destructive" : "text-muted-foreground")}>
                          {r ? fmtSolve(r.ms, r.penalty) : "–"}
                        </TableCell>
                      );
                    })}
                    <TableCell className="max-w-48 truncate font-mono text-xs text-muted-foreground" title={solve.scramble}>
                      {solve.scramble}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {(m.status === "ready" || m.status === "live" || m.status === "done") && (
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => go(matchUrl(m.id))}>
              {m.status === "done" ? tr("Open the match page") : seatIn(m, s.user.id) !== null ? tr("Play") : tr("Watch")}
              <ChevronRight />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** A tournament in a conversation: its date, players and state, registration a click away, its page behind. */
export function TournamentChatCard({ tournament }: { tournament: Tournament }) {
  const t = community.summary(tournament);
  return (
    // The card opens the tournament's page; its buttons act on their own.
    <article
      role="link"
      tabIndex={0}
      aria-label={tr("Open {0}", { 0: t.name })}
      className={cn(CARD, "cursor-pointer text-left transition-colors outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring/50")}
      data-tournament={t.id}
      data-status={t.status}
      onClick={() => go(tournamentUrl(t.id))}
      onKeyDown={(e) => e.target === e.currentTarget && e.key === "Enter" && go(tournamentUrl(t.id))}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
          <Trophy className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold">{t.name}</span>
          <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <Icon name={"Puzzle" + t.event} size={12} />
            {eventName(t.event)} · {formatText(t)}
          </span>
        </span>
        <StatusBadge t={t} />
      </div>
      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <CalendarClock className="size-3.5" />
          {t.status === "open" ? tr("Starts {0}", { 0: when(t.startsAt) }) : t.status === "running" ? tr("Started {0}", { 0: relative(t.startedAt ?? t.startsAt) }) : day(t.finishedAt ?? t.startsAt)}
        </span>
        <span className="flex items-center gap-2">
          <Users className="size-3.5" />
          <span className={NUMERIC}>
            {t.players}
            {t.maxPlayers ? ` / ${t.maxPlayers}` : ""} {" "}{tr("players")}</span>
        </span>
        {t.winner && (
          <span className="flex items-center gap-2 text-foreground">
            <Crown className="size-3.5 text-warning" />
            {tr("{0} won the tournament", { 0: t.winner.username })}</span>
        )}
      </div>
      {(t.status === "open" || t.myMatch) && (
        <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <RegisterButton t={t} size="sm" />
          {t.myMatch && (
            <Button size="sm" onClick={() => go(matchUrl(t.myMatch!))}>
              <Play />
              {tr("Play your match")}</Button>
          )}
        </div>
      )}
    </article>
  );
}
