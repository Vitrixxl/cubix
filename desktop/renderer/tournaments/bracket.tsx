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
import { said } from "../base";

const NUMERIC = "font-sans tabular-nums";
import { roundName } from "./format";
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
      <div className="flex h-full min-w-max gap-10 px-1 pb-2" style={{ minHeight: `${first * 4.75 + 3}rem` }}>
        {rounds.map((matches, i) => {
          const round = i + 1,
            done = matches.filter(over).length,
            current = t.status === "running" && round === t.round;
          return (
            <section key={round} className="flex w-60 shrink-0 flex-col" aria-label={roundName(round, t.rounds)} data-round={round}>
              <header className="flex h-12 shrink-0 flex-col justify-center">
                <span className={cn("text-sm font-semibold tracking-tight", current && "text-primary")}>{roundName(round, t.rounds)}</span>
                <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>
                  {round > t.round && t.status === "running" ? tr("Waiting for the round before") : tr("{0} of {1} over", { 0: done, 1: matches.length })}
                </span>
              </header>
              <div className="flex min-h-0 flex-1 flex-col">
                {pairs(matches).map((pair, k) => (
                  <div key={k} className="relative flex flex-1 flex-col justify-around">
                    {pair.map((m) => (
                      <MatchCard key={m.id} match={m} me={me} joined={round > 1} onOpen={onOpen} onAward={onAward} />
                    ))}
                    {/* The line from the pair to the match their winners meet in. */}
                    {round < t.rounds && pair.length === 2 && (
                      <span aria-hidden className="pointer-events-none absolute top-1/4 -right-5 bottom-1/4 w-5 rounded-r-md border-y border-r border-border" />
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
        {t.status === "finished" && t.winner && (
          <section className="flex w-48 shrink-0 flex-col" aria-label={tr("Champion")}>
            <header className="flex h-12 shrink-0 items-center text-sm font-semibold tracking-tight">{tr("Champion")}</header>
            <div className="flex flex-1 items-center">
              <div className="flex w-full items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
                <Trophy className="size-5 shrink-0 text-warning" />
                <span className="truncate font-semibold">{t.winner.username}</span>
              </div>
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

const STATUS: Record<Match["status"], string> = { waiting: "", ready: "Ready", live: "Live", done: "", cancelled: "Cancelled" };

/** A match: its two players with the sets they won, the winner in full colour; the account's own outlined. */
function MatchCard({ match: m, me, joined, onOpen, onAward }: { match: Match; me?: string; joined: boolean; onOpen?: (m: Match) => void; onAward?: (m: Match, winner: Person) => void }) {
  const mine = !!me && m.players.some((p) => p?.id === me),
    bye = m.status === "done" && m.players.filter(Boolean).length === 1,
    open = !!onOpen && m.status !== "waiting" && !bye,
    decidable = !!onAward && (m.status === "ready" || m.status === "live") && m.players.every(Boolean);
  const body = (
    <>
      {[0, 1].map((seat) => {
        const p = m.players[seat],
          won = !!p && m.winner === p.id;
        return (
          <span key={seat} className={cn("flex h-7 items-center gap-2 px-3", seat === 0 && "border-b border-border/60")}>
            {won && <Crown className="size-3.5 shrink-0 text-warning" />}
            <span className={cn("min-w-0 flex-1 truncate text-sm", !p ? "text-muted-foreground/60 italic" : won ? "font-semibold" : m.winner ? "text-muted-foreground" : "", p?.id === me && "text-primary")}>
              {p ? p.username : bye ? tr("Bye") : tr("To be decided")}
            </span>
            {p && m.status !== "waiting" && !bye && (
              <span className={cn(NUMERIC, "text-sm", won ? "font-semibold" : "text-muted-foreground")}>{m.score.sets[seat]}</span>
            )}
          </span>
        );
      })}
    </>
  );
  return (
    <div
      className={cn(
        "relative rounded-lg border bg-card",
        mine && "ring-1 ring-primary/70",
        m.status === "live" && "border-primary/50",
        // The line coming from the pair before.
        joined && "before:pointer-events-none before:absolute before:top-1/2 before:right-full before:w-5 before:border-t before:border-border",
      )}
      data-match={m.id}
      data-status={m.status}
    >
      {STATUS[m.status] && (
        <span className={cn("absolute -top-2 right-2 flex items-center gap-1 rounded-full border bg-background px-1.5 text-[10px] font-medium", m.status === "live" ? "text-primary" : "text-muted-foreground")}>
          {m.status === "live" && <span className="size-1.5 animate-pulse rounded-full bg-primary" />}
          {said(STATUS[m.status])}
          {m.forfeit && tr(" · given")}
        </span>
      )}
      {open ? (
        <button type="button" onClick={() => onOpen!(m)} className="flex w-full flex-col rounded-lg text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50" aria-label={tr("Open the match {0}", { 0: m.players.map((p) => p?.username ?? "?").join(" against ") })}>
          {body}
        </button>
      ) : (
        <div className="flex flex-col">{body}</div>
      )}
      {decidable && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="icon-xs" aria-label={tr("Decide the match")} className="absolute -top-2.5 left-2 size-5 rounded-full bg-background text-muted-foreground" />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-auto">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{tr("Give the match to")}</DropdownMenuLabel>
              {m.players.map((p) => p && <DropdownMenuItem key={p.id} onClick={() => onAward!(m, p)}>{p.username}</DropdownMenuItem>)}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {m.forfeit && !STATUS[m.status] && <span className="absolute -top-2 right-2 rounded-full border bg-background px-1.5 text-[10px] text-muted-foreground">{tr("Given")}</span>}
    </div>
  );
}
