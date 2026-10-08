/**
 * Battles and tournaments as cards in a conversation: who plays, where it stands, and what to do now (accept, play,
 * watch, register), kept up to date as it goes. A battle opens on its detail: every solve with both times and its
 * scramble; a tournament on its page.
 */
import { useEffect, useState } from "react";
import { Check, ChevronRight, Eye, Play, Swords } from "lucide-react";
import { store as s } from "../store";
import { go } from "../navigation";
import { Figure, Icon, IconTile, Modal, Strip, Surface } from "../ui";
import { day, relative, time } from "../coaching/parts";
import { community, eventName, formatText, matchUrl, scoreOf, seatIn, type Match, type MatchSolve, type Tournament } from "./client";
import { TournamentCard } from "../tournaments/page";
import { CARD_LINK, MatchStatusBadge, MoveList, PlayerLine, apart, opens } from "../tournaments/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { tr } from "../../../src/client/i18n";

/** The width of a card in a conversation: the same for battles and tournaments. */
const CARD_WIDTH = "w-[min(100%,26rem)]";

/** A battle in a conversation: its players and score, its state, and the next step for whoever reads it. */
export function BattleCard({ match }: { match: Match }) {
  const m = community.card(match),
    [open, setOpen] = useState(false),
    seat = seatIn(m, s.user.id),
    // Aimed at the account, or open to anyone in the group but its author.
    challenged = m.status === "waiting" && (seat === 1 || (!m.players[1] && seat === null)),
    playing = m.status === "ready" || m.status === "live",
    scored = m.status === "live" || m.status === "done";
  const cancellable = seat !== null && (m.status === "waiting" || m.status === "ready");
  return (
    <>
      {/* The card opens the battle's detail; its buttons act on their own. */}
      <Surface className={cn(CARD_WIDTH, CARD_LINK, "gap-3 p-4")} aria-label={tr("Battle details")} data-battle={m.id} data-status={m.status} {...opens(() => setOpen(true))}>
        <div className="flex items-center gap-3">
          <IconTile icon={Swords} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              {tr("Battle")}
              <span className="flex min-w-0 items-center gap-1.5 font-normal text-muted-foreground">
                <Icon name={"Puzzle" + m.event} size={14} />
                <span className="truncate">{eventName(m.event)}</span>
              </span>
            </span>
            <span className="text-xs text-muted-foreground">{formatText(m)}</span>
          </span>
          <MatchStatusBadge status={m.status} className="self-start" />
        </div>
        <Players m={m} scored={scored} />
        {(challenged || playing || cancellable) && (
          <div className="flex flex-wrap items-center gap-1.5" {...apart}>
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
      </Surface>
      <MatchDialog match={m} open={open} onOpenChange={setOpen} />
    </>
  );
}

/** The two players of a battle, one per line with their score: the winner in bold with a check, the account's name. */
function Players({ m, scored }: { m: Match; scored: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1].map((seat) => {
        const p = m.players[seat];
        return (
          <PlayerLine
            key={seat}
            p={p}
            name={!p ? tr("Anyone") : p.id === s.user.id ? tr("You") : undefined}
            won={!!p && m.winner === p.id}
            decided={!!m.winner}
            me={p?.id === s.user.id}
            score={scored ? scoreOf(m)[seat] : undefined}
          />
        );
      })}
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
          m.solved > 0 && (
            <div className="flex flex-col gap-2" aria-busy="true" aria-label={tr("Loading")}>
              {Array.from({ length: Math.min(m.solved, 5) }, (_, i) => (
                <Skeleton key={i} className="h-6" />
              ))}
            </div>
          )
        ) : (
          solves.length > 0 && (
            <div className="max-h-[45svh] overflow-y-auto rounded-lg border bg-card px-1 pb-1">
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

/** A tournament in a conversation: the tournaments page's card, at the width of a battle's. */
export function TournamentChatCard({ tournament }: { tournament: Tournament }) {
  return <TournamentCard t={community.summary(tournament)} className={CARD_WIDTH} />;
}
