/**
 * Battles and tournaments as cards in a conversation. A battle shows its two seats facing each other (the open one is
 * the way in: taking it accepts the battle), the score as it goes, and where it stands; it opens on its detail: every
 * solve with both times and its scramble. A tournament shows when it starts, its places as a row of seats, and the
 * step for the account; it opens on its page.
 */
import { useEffect, useState } from "react";
import { Check, ChevronRight, Plus } from "lucide-react";
import { store as s } from "../store";
import { go } from "../navigation";
import { Avatar, Figure, Icon, LINK, LINK_ACCENT, Modal, NUMERIC, StateMark, Strip } from "../ui";
import { day, relative, time } from "../coaching/parts";
import { MATCH_STATUS, STATUS_TEXT, community, eventName, formatText, matchUrl, roundName, scoreOf, seatIn, tournamentUrl, type Match, type MatchSolve, type MatchStatus, type Person, type Tournament } from "./client";
import { CARD_LINK, MoveList, apart, opens } from "../tournaments/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { localFormat, tr } from "../../../src/client/i18n";
import { said } from "../base";

/** A card in a conversation: the same width and surface for battles and tournaments. */
const CARD = "w-[min(100%,30rem)] rounded-[20px] bg-muted";

const MATCH_TONE = { waiting: "", ready: "good", live: "accent", done: "", cancelled: "off" } as const;
/** Where a battle stands, in a word after its dot. */
const MatchState = ({ status, className }: { status: MatchStatus; className?: string }) => (
  <StateMark tone={MATCH_TONE[status]} className={className}>
    {said(MATCH_STATUS[status])}
  </StateMark>
);

/** Where a battle stands, in a sentence: who it waits for, how far it went, who won. */
function standing(m: Match, names: [string, string], winner: number | null) {
  const seat = seatIn(m, s.user.id);
  if (m.status === "done")
    return m.forfeit ? tr("{0} won: the other player gave up or the organisers decided.", { 0: names[winner ?? 0] }) : tr("{0} won {1}.", { 0: names[winner ?? 0], 1: relative(m.finishedAt ?? m.createdAt) });
  if (m.status === "cancelled") return tr("Called off before it was played.");
  if (m.status === "ready") return tr("Accepted: it starts with the first scramble.");
  if (m.status === "live") return tr("Under way: {0} solves so far.", { 0: m.solved });
  if (!m.players[1]) return seat === 0 ? tr("Waiting for someone in the group to take it up.") : tr("The first in the group to take the seat plays.");
  return seat === 1 ? tr("{0} challenges you.", { 0: names[0] }) : tr("Waiting for {0} to accept.", { 0: names[1] });
}

/**
 * A battle in a conversation: the event and how it is won, its state, then the two seats facing each other. The seat
 * waiting for the account (aimed at it, or open to anyone in the group but its author) is the way to accept; the
 * other steps (play, watch, decline, call off, the detail) are words under it.
 */
export function BattleCard({ match }: { match: Match }) {
  const m = community.card(match),
    [open, setOpen] = useState(false),
    seat = seatIn(m, s.user.id),
    challenged = m.status === "waiting" && (seat === 1 || (!m.players[1] && seat === null)),
    playing = m.status === "ready" || m.status === "live",
    scored = m.status === "live" || m.status === "done",
    cancellable = seat !== null && (m.status === "waiting" || m.status === "ready"),
    score = scoreOf(m),
    winner = m.winner ? (m.players[0]?.id === m.winner ? 0 : 1) : null,
    names = m.players.map((p) => (p ? (p.id === s.user.id ? tr("You") : p.username) : tr("Anyone"))) as [string, string];
  return (
    <section className={CARD} aria-label={tr("Battle")} data-battle={m.id} data-status={m.status}>
      <div className="flex items-baseline gap-2.5 px-4 pt-3 text-[13px] text-muted-foreground">
        <span className="flex items-center gap-1.5 self-center text-[22px] leading-none font-extrabold tracking-[-0.02em] text-foreground">
          <Icon name={"Puzzle" + m.event} size={18} />
          {eventName(m.event)}
        </span>
        <span className="min-w-0 truncate">{formatText(m)}</span>
        <MatchState status={m.status} className="ml-auto self-center" />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-2 p-3">
        {([0, 1] as const).map((i) => (
          <Seat
            key={i}
            p={m.players[i]}
            name={names[i]}
            score={scored ? score[i] : undefined}
            won={winner === i}
            take={i === 1 && challenged ? () => void community.acceptBattle(m) : undefined}
            action={"battle:accept:" + m.id}
            order={i === 1 ? "order-3" : undefined}
          />
        ))}
        <span className="order-2 self-center text-xs font-extrabold text-muted-foreground">{tr("vs")}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 pb-3 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1">{standing(m, names, winner)}</span>
        {playing && (
          <button type="button" className={seat !== null ? LINK_ACCENT : LINK} onClick={() => go(matchUrl(m.id))}>
            {seat !== null ? tr("Play") : tr("Watch")}
          </button>
        )}
        {cancellable && (
          <button type="button" className={cn(LINK, "hover:text-destructive")} onClick={() => void community.cancelBattle(m)}>
            {seat === 0 ? tr("Call off") : tr("Decline")}
          </button>
        )}
        <button type="button" className={LINK} onClick={() => setOpen(true)} data-action={"battle:detail:" + m.id}>
          {tr("See the detail")}
        </button>
      </div>
      <MatchDialog match={m} open={open} onOpenChange={setOpen} />
    </section>
  );
}

/**
 * A seat of a battle: the face, the name and, once it is played, the solves or sets won (the winner's seat in green).
 * With `take` it is the way in: dashed, the account's face or a plus, "Accept" or "Take the seat". An empty seat no
 * one may take here stays dashed and quiet.
 */
function Seat({ p, name, score, won, take, action, order }: { p: Person | null; name: string; score?: number; won: boolean; take?: () => void; action: string; order?: string }) {
  const tile = "flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-3 text-center text-sm font-bold";
  if (take)
    return (
      <button type="button" onClick={take} data-action={action} className={cn(tile, order, "border-2 border-dashed border-muted-foreground/50 text-foreground/80 transition-colors hover:border-primary hover:text-primary focus-visible:border-primary focus-visible:outline-none")}>
        {p ? (
          <Avatar name={p.username} src={p.avatar} size={34} />
        ) : (
          <span className="flex size-[34px] items-center justify-center rounded-full bg-accent">
            <Plus className="size-4" />
          </span>
        )}
        <span className="flex items-center gap-1">
          {p && <Check className="size-3.5" />}
          {p ? tr("Accept") : tr("Take the seat")}
        </span>
        <small className="text-xs font-semibold text-muted-foreground">{tr("You play right away")}</small>
      </button>
    );
  if (!p)
    return (
      <div className={cn(tile, order, "border-2 border-dashed border-muted-foreground/25 font-semibold text-muted-foreground")}>
        <span aria-hidden="true" className="size-[34px] rounded-full border-2 border-dashed border-muted-foreground/30" />
        {name}
      </div>
    );
  return (
    <div className={cn(tile, order, won ? "bg-success/12 text-success" : "bg-accent")} data-won={won || undefined}>
      <Avatar name={p.username} src={p.avatar} size={34} />
      <span className="flex max-w-full items-center gap-1">
        <span className="truncate">{name}</span>
        {won && <Check className="size-3.5 shrink-0" strokeWidth={3} aria-label={tr("Winner")} />}
      </span>
      {score != null && <span className={cn(NUMERIC, "text-2xl leading-none font-extrabold", !won && "text-foreground/80")}>{score}</span>}
    </div>
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
    names = m.players.map((p) => p?.username ?? tr("Anyone")) as [string, string],
    score = scoreOf(m);
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          <Icon name={"Puzzle" + m.event} size={18} />
          {names[0]} <span className="font-normal text-muted-foreground">{tr("vs")}</span> {names[1]}
        </span>
      }
      description={`${eventName(m.event)} · ${formatText(m)} · ${m.tournament ? `${m.tournament} · ` : m.group ? `${m.group} · ` : ""}${day(m.startedAt ?? m.createdAt)} · ${time(m.startedAt ?? m.createdAt)}`}
      className="sm:max-w-xl"
    >
      <div className="flex min-h-0 flex-col gap-4" data-slot="battle-detail">
        <Strip className="grid-cols-2">
          {[0, 1].map((seat) => (
            <Figure
              key={seat}
              label={names[seat]!}
              value={score[seat]}
              size="2xl"
              tone={winner === seat ? "good" : ""}
              sub={m.sets > 1 ? tr("sets") : tr("solves won")}
              className={seat === 1 ? "items-end text-right" : undefined}
            />
          ))}
        </Strip>
        <p className="text-sm text-muted-foreground">{standing(m, names, winner)}</p>
        {!solves ? (
          m.solved > 0 && (
            <div className="flex flex-col gap-2" aria-busy="true" aria-label={tr("Loading")}>
              {Array.from({ length: Math.min(m.solved, 5) }, (_, i) => (
                <Skeleton key={i} className="h-6" />
              ))}
            </div>
          )
        ) : (
          solves.length > 0 && (
            <div className="max-h-[45svh] overflow-y-auto rounded-[20px] bg-muted/50 px-1 pb-1">
              <MoveList
                label="Solves"
                names={names}
                scrambles
                rows={solves.map((solve, i) => ({
                  key: solve.number,
                  n: solve.number,
                  results: solve.results,
                  best: solve.winner,
                  scramble: solve.scramble,
                  section: m.sets > 1 && sets[i] !== sets[i - 1] ? tr("Set {0}", { 0: sets[i] }) : undefined,
                  attrs: { "data-solve": solve.number },
                }))}
              />
            </div>
          )
        )}
      </div>
      {(m.status === "ready" || m.status === "live" || m.status === "done") && (
        <DialogFooter>
          <Button variant="outline" onClick={() => go(matchUrl(m.id))}>
            {m.status === "done" ? tr("Open the match page") : seatIn(m, s.user.id) !== null ? tr("Play") : tr("Watch")}
            <ChevronRight />
          </Button>
        </DialogFooter>
      )}
    </Modal>
  );
}

const startDay = localFormat({ weekday: "short", day: "numeric" });
const TOURNAMENT_TONE = { open: "good", running: "accent", finished: "", cancelled: "off" } as const;
/** A tournament's seats as a row of dots, filled as players register, while there are few enough to count. */
const SEATS_SHOWN = 16;

/**
 * A tournament in a conversation: when it starts in the margin, its name and format, its places as a row of seats,
 * where it stands, and the step for the account (register, unregister, play its match). It opens on its page.
 */
export function TournamentChatCard({ tournament }: { tournament: Tournament }) {
  const t = community.summary(tournament),
    full = !!t.maxPlayers && t.players >= t.maxPlayers,
    at = t.status === "open" ? t.startsAt : t.status === "running" ? (t.startedAt ?? t.startsAt) : (t.finishedAt ?? t.startsAt);
  return (
    <section
      className={cn(CARD, CARD_LINK, "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1.5 px-4 py-3.5")}
      data-tournament={t.id}
      data-status={t.status}
      aria-label={tr("Open {0}", { 0: t.name })}
      {...opens(() => go(tournamentUrl(t.id)), "link")}
    >
      <span className="row-span-2 flex flex-col items-center pr-1.5">
        <b className={cn(NUMERIC, "text-[22px] leading-tight font-extrabold")}>{time(at)}</b>
        <span className={cn(NUMERIC, "text-[11px] font-bold text-muted-foreground uppercase")}>{startDay.format(at)}</span>
      </span>
      <span className="min-w-0 truncate font-extrabold">
        {t.name}
        <small className="ml-1.5 text-xs font-semibold text-muted-foreground">
          {eventName(t.event)} · {formatText(t)}
        </small>
      </span>
      <span className="justify-self-end" {...apart}>
        {t.myMatch ? (
          <button type="button" className={LINK_ACCENT} onClick={() => go(matchUrl(t.myMatch!))}>
            {tr("Play your match")}
          </button>
        ) : t.status === "open" && t.registered ? (
          <button type="button" className={cn(LINK, "hover:text-destructive")} onClick={() => void community.register(t.id, false)} data-action={"tournament:unregister:" + t.id}>
            {tr("Unregister")}
          </button>
        ) : t.status === "open" ? (
          <button type="button" className={LINK_ACCENT} disabled={full} onClick={() => void community.register(t.id, true)} data-action={"tournament:register:" + t.id}>
            {full ? tr("Full") : tr("Register")}
          </button>
        ) : null}
      </span>
      <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        {t.maxPlayers && t.maxPlayers <= SEATS_SHOWN ? (
          <span className="flex gap-1" aria-hidden="true">
            {Array.from({ length: t.maxPlayers }, (_, i) => (
              <i key={i} className={cn("size-3.5 rounded-full", i < t.players ? "bg-warning" : "border-2 border-accent")} />
            ))}
          </span>
        ) : null}
        <span className={NUMERIC}>{t.maxPlayers ? tr("{0} of {1} places", { 0: t.players, 1: t.maxPlayers }) : `${t.players} ${tr("players")}`}</span>
        {t.registered && t.status === "open" && <span className="font-bold text-success">· {tr("Registered")}</span>}
      </span>
      <StateMark tone={TOURNAMENT_TONE[t.status]} className="justify-self-end">
        {t.status === "running" ? roundName(t.round, t.rounds) : t.status === "finished" && t.winner ? tr("Won by {0}", { 0: t.winner.username }) : said(STATUS_TEXT[t.status])}
      </StateMark>
    </section>
  );
}
