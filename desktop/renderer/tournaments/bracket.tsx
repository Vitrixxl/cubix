/**
 * A tournament's bracket: a column per round, each match as a card with its two players and the sets they won, lines
 * from each pair of matches to the match their winners meet in. Shows where the tournament stands: the round being
 * played, which matches are on, over or waiting, and the champion once the final is over. Free of the app's store, so
 * the administration draws it too.
 */
import { Crown, MoreHorizontal, Trophy } from "lucide-react";
import type { Match, Person, TournamentDetail } from "../community/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { tr } from "../../../src/client/i18n";
import { Avatar, said } from "../base";

const NUMERIC = "font-sans tabular-nums";
import { roundName, scoreOf } from "./format";
export { roundName };
const over = (m: Match) => m.status === "done" || m.status === "cancelled";

export function Bracket({
  tournament: t,
  me,
  onOpen,
  onAward,
}: {
  tournament: Pick<TournamentDetail, "matches" | "rounds" | "round" | "status" | "winner">;
  /** The account viewing: its matches stand out. */
  me?: string;
  /** Opens a match; without it the cards are not links. */
  onOpen?: (match: Match) => void;
  /** Gives a match to one of its players: the organiser's way with a no-show. */
  onAward?: (match: Match, winner: Person) => void;
}) {
  const rounds = Array.from({ length: t.rounds }, (_, i) => t.matches.filter((m) => m.round === i + 1).sort((a, b) => a.slot - b.slot));
  const first = rounds[0]?.length ?? 0;
  return (
    <div className="min-h-0 flex-1 overflow-auto" data-slot="bracket">
      {/* Every column as tall as the first round needs, so a match sits level with the middle of the two before it. */}
      <div className="flex h-full min-w-max gap-8 pb-1" style={{ minHeight: `${first * 7 + 4}rem` }}>
        {rounds.map((matches, i) => {
          const round = i + 1,
            done = matches.filter(over).length,
            current = t.status === "running" && round === t.round;
          return (
            <section
              key={round}
              className={cn("flex min-w-64 flex-1 flex-col rounded-xl border bg-muted/20 p-3", current && "border-primary/40 bg-primary/5")}
              aria-label={roundName(round, t.rounds)}
              data-round={round}
            >
              <header className="flex shrink-0 items-center justify-between gap-2 border-b pb-2.5">
                <span className={cn("text-sm font-semibold tracking-tight", current && "text-primary")}>{roundName(round, t.rounds)}</span>
                <span className={cn(NUMERIC, "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground", current && "bg-primary/15 text-primary")}>
                  {round > t.round && t.status === "running" ? tr("Next") : tr("{0} of {1} over", { 0: done, 1: matches.length })}
                </span>
              </header>
              <div className="flex min-h-0 flex-1 flex-col">
                {pairs(matches).map((pair, k) => (
                  <div key={k} className="relative flex flex-1 flex-col justify-around gap-3 py-2">
                    {pair.map((m) => (
                      <MatchCard key={m.id} match={m} me={me} joined={round > 1} onOpen={onOpen} onAward={onAward} />
                    ))}
                    {/* The line from the pair to the match their winners meet in, across the gap between the columns. */}
                    {round < t.rounds && pair.length === 2 && (
                      <span aria-hidden className="pointer-events-none absolute top-1/4 -right-7 bottom-1/4 w-7 rounded-r-lg border-y-2 border-r-2 border-foreground/20" />
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
        {t.status === "finished" && t.winner && (
          <section className="flex w-56 shrink-0 flex-col rounded-xl border border-warning/40 bg-warning/5 p-3" aria-label={tr("Champion")}>
            <header className="shrink-0 border-b border-warning/30 pb-2.5 text-sm font-semibold tracking-tight">{tr("Champion")}</header>
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <Trophy className="size-10 text-warning" />
              <Avatar name={t.winner.username} src={t.winner.avatar} size={48} />
              <span className="truncate text-lg font-semibold">{t.winner.username}</span>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function pairs<T>(list: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += 2) out.push(list.slice(i, i + 2));
  return out;
}

const STATUS: Record<Match["status"], string> = { waiting: "Waiting", ready: "Ready", live: "Live", done: "Over", cancelled: "Cancelled" };

/**
 * A match: a head with its number and state (and the organiser's way to decide it), then its two players with their
 * score, the winner in full colour; the account's own outlined.
 */
function MatchCard({ match: m, me, joined, onOpen, onAward }: { match: Match; me?: string; joined: boolean; onOpen?: (m: Match) => void; onAward?: (m: Match, winner: Person) => void }) {
  const mine = !!me && m.players.some((p) => p?.id === me),
    bye = m.status === "done" && m.players.filter(Boolean).length === 1,
    open = !!onOpen && m.status !== "waiting" && !bye,
    decidable = !!onAward && (m.status === "ready" || m.status === "live") && m.players.every(Boolean);
  const rows = [0, 1].map((seat) => {
    const p = m.players[seat],
      won = !!p && m.winner === p.id;
    return (
      <span key={seat} className={cn("flex h-11 items-center gap-2.5 px-3", seat === 0 ? "border-b" : "rounded-b-xl", won && "bg-warning/8")}>
        {p ? <Avatar name={p.username} src={p.avatar} size={24} /> : <span className="size-6 shrink-0 rounded-full border border-dashed" />}
        <span className={cn("min-w-0 flex-1 truncate text-sm", !p ? "text-muted-foreground/60 italic" : won ? "font-semibold" : m.winner ? "text-muted-foreground" : "font-medium", p?.id === me && "text-primary")}>
          {p ? p.username : bye ? tr("Bye") : tr("To be decided")}
        </span>
        {won && <Crown className="size-4 shrink-0 text-warning" />}
        {p && m.status !== "waiting" && !bye && <span className={cn(NUMERIC, "w-5 text-right text-base", won ? "font-semibold" : "text-muted-foreground")}>{scoreOf(m)[seat]}</span>}
      </span>
    );
  });
  return (
    <div
      className={cn(
        "relative overflow-visible rounded-xl border bg-card shadow-xs",
        mine && "border-primary/60 ring-1 ring-primary/40",
        m.status === "live" && "border-primary/60",
        bye && "opacity-60",
        // The line coming from the pair before.
        joined && "before:pointer-events-none before:absolute before:top-1/2 before:right-full before:w-7 before:border-t-2 before:border-foreground/20",
      )}
      data-match={m.id}
      data-status={m.status}
    >
      <div className="flex h-8 items-center gap-2 border-b bg-muted/40 px-3 text-[11px] text-muted-foreground first:rounded-t-xl">
        <span className={NUMERIC}>{tr("Match {0}", { 0: m.slot + 1 })}</span>
        <span className={cn("ml-auto flex items-center gap-1 font-medium", m.status === "live" && "text-primary", m.status === "ready" && "text-success")}>
          {m.status === "live" && <span className="size-1.5 animate-pulse rounded-full bg-primary" />}
          {bye ? tr("Bye") : said(STATUS[m.status])}
          {m.forfeit && tr(" · given")}
        </span>
        {decidable && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={tr("Decide the match")} className="-mr-1.5 size-6 text-muted-foreground" />}>
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto">
              <DropdownMenuGroup>
                <DropdownMenuLabel>{tr("Give the match to")}</DropdownMenuLabel>
                {m.players.map((p) => p && <DropdownMenuItem key={p.id} onClick={() => onAward!(m, p)}>{p.username}</DropdownMenuItem>)}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {open ? (
        <button type="button" onClick={() => onOpen!(m)} className="flex w-full flex-col rounded-b-xl text-left outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50" aria-label={tr("Open the match {0}", { 0: m.players.map((p) => p?.username ?? "?").join(" against ") })}>
          {rows}
        </button>
      ) : (
        <div className="flex flex-col">{rows}</div>
      )}
    </div>
  );
}
