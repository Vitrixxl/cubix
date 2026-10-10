/**
 * A tournament's bracket: a column per round, each match as a card with its two players and the sets they won, lines
 * from each pair of matches to the match their winners meet in. Shows where the tournament stands: the round being
 * played, which matches are on, over or waiting, and the champion once the final is over. Free of the app's store, so
 * the administration draws it too.
 */
import { MoreHorizontal, Trophy } from "lucide-react";
import type { Match, Person, TournamentDetail } from "../community/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { tr } from "../../../src/client/i18n";
import { Avatar, NUMERIC, Surface, said } from "../base";
import { CARD_LINK, LiveDot, MATCH_STATUS, PlayerLine, apart, opens, roundName, scoreOf } from "./format";
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
      <div className="flex h-full min-w-max gap-14 pb-1" style={{ minHeight: `${first * 7 + 4}rem` }}>
        {rounds.map((matches, i) => {
          const round = i + 1,
            done = matches.filter(over).length,
            current = t.status === "running" && round === t.round;
          return (
            <section
              key={round}
              className="flex min-w-60 flex-1 flex-col"
              aria-label={roundName(round, t.rounds)}
              data-round={round}
            >
              <header className="flex h-8 shrink-0 items-baseline justify-between gap-2 px-1">
                <h3 className={cn("text-xs font-bold tracking-[0.08em] uppercase", current ? "text-primary" : "text-muted-foreground")}>{roundName(round, t.rounds)}</h3>
                <span className={cn(NUMERIC, "text-xs font-semibold text-muted-foreground")}>
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
                      <span aria-hidden className="pointer-events-none absolute top-1/4 -right-7 bottom-1/4 w-7 rounded-r-lg border-y-[1.5px] border-r-[1.5px] border-muted-foreground/30" />
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
        {t.status === "finished" && t.winner && (
          <section className="flex w-48 shrink-0 flex-col" aria-label={tr("Champion")}>
            <h3 className="flex h-8 shrink-0 items-baseline px-1 text-xs font-bold tracking-[0.08em] text-warning uppercase">{tr("Champion")}</h3>
            <div className="my-auto flex flex-col items-center gap-2.5 text-center">
              <Avatar name={t.winner.username} src={t.winner.avatar} size={64} />
              <span className="flex max-w-full items-center gap-1.5 truncate text-xl font-extrabold tracking-[-0.02em]">
                <Trophy className="size-5 shrink-0 text-warning" />
                {t.winner.username}
              </span>
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

/**
 * A match: its number and state on top (and the organiser's way to decide it), then its two players with their score,
 * the winner in bold with a check; the account's own outlined in the accent. The whole card opens the match.
 */
function MatchCard({ match: m, me, joined, onOpen, onAward }: { match: Match; me?: string; joined: boolean; onOpen?: (m: Match) => void; onAward?: (m: Match, winner: Person) => void }) {
  const mine = !!me && m.players.some((p) => p?.id === me),
    bye = m.status === "done" && m.players.filter(Boolean).length === 1,
    open = !!onOpen && m.status !== "waiting" && !bye,
    decidable = !!onAward && (m.status === "ready" || m.status === "live") && m.players.every(Boolean),
    scored = m.status !== "waiting" && !bye;
  return (
    // The line coming from the pair before, drawn outside the card.
    <div className={cn("relative", joined && "before:pointer-events-none before:absolute before:top-1/2 before:right-full before:w-7 before:border-t-[1.5px] before:border-muted-foreground/30")}>
      <Surface
        className={cn("gap-1.5 rounded-[16px] bg-muted px-3 py-2.5", open && CARD_LINK, open && "hover:bg-accent", mine && "ring-[1.5px] ring-primary ring-inset", bye && "bg-transparent opacity-60")}
        data-match={m.id}
        data-status={m.status}
        {...(open ? opens(() => onOpen!(m)) : {})}
        aria-label={open ? tr("Open the match {0}", { 0: m.players.map((p) => p?.username ?? "?").join(" – ") }) : undefined}
      >
        <div className="flex h-5 items-center gap-2 text-xs text-muted-foreground">
          <span className={NUMERIC}>{tr("Match {0}", { 0: m.slot + 1 })}</span>
          <span className={cn("ml-auto flex items-center gap-1.5 font-semibold", m.status === "live" ? "text-primary" : m.status === "ready" && "text-success")} data-slot="match-status">
            {m.status === "live" && <LiveDot className="size-1.5" />}
            {bye ? tr("Bye") : said(MATCH_STATUS[m.status])}
            {m.forfeit && tr(" · given")}
          </span>
          {decidable && (
            <span {...apart} className="-my-1 -mr-1">
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={tr("Decide the match")} className="text-muted-foreground" />}>
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-auto">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>{tr("Give the match to")}</DropdownMenuLabel>
                    {m.players.map((p) => p && <DropdownMenuItem key={p.id} onClick={() => onAward!(m, p)}>{p.username}</DropdownMenuItem>)}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          )}
        </div>
        {[0, 1].map((seat) => {
          const p = m.players[seat];
          return (
            <PlayerLine
              key={seat}
              p={p}
              size={24}
              name={p ? undefined : <span className="italic">{bye ? tr("Bye") : tr("To be decided")}</span>}
              won={!!p && m.winner === p.id}
              decided={!!m.winner}
              me={!!me && p?.id === me}
              score={p && scored ? scoreOf(m)[seat] : undefined}
            />
          );
        })}
      </Surface>
    </div>
  );
}
