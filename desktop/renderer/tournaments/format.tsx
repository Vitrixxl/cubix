/**
 * How tournaments and battles are drawn and set up, free of the app's store so the administration shares it: a
 * tournament's and a match's status as badges, the start date's field value, the fields choosing the event and how a
 * match is won, and the pieces every match is drawn with (a player's line, the solves as a move list, the live dot). The
 * words (the format, a round's name, the statuses) are shared with the Android app (src/client/lib/community.ts).
 */
import { useEffect, useRef } from "react";
import { Check, ChevronDown } from "lucide-react";
import { EVENTS } from "../../../src/shared/puzzles";
import { fmtTime } from "../../../src/client/lib/format";
import { tn, tr } from "../../../src/client/i18n";
import { ActionCard, Avatar, FOCUS, Icon, NUMERIC, Tip, said } from "../base";
import { MATCH_STATUS, STATUS_TEXT, eventName, formatText, roundName, type Format, type MatchStatus, type Person, type TournamentStatus } from "../../../src/client/lib/community";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export { MATCH_STATUS, STATUS_TEXT, eventName, formatText, roundName, scoreOf, type Format } from "../../../src/client/lib/community";
/** The date of `ms` as a `datetime-local` input wants it, on this device's clock. */
export const localInput = (ms: number) => new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

/** The mark of what is under way: a dot in the current colour, a ring pulsing out of it (still when motion is reduced). */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("relative flex size-2 shrink-0", className)}>
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60 motion-reduce:animate-none" />
      <span className="relative inline-flex size-2 rounded-full bg-current" />
    </span>
  );
}

/** A status as a soft badge: the accent with the live dot while under way, green when ready or open, quiet once over. */
function StateBadge({ tone, children, className }: { tone: "live" | "good" | "quiet" | "off"; children: React.ReactNode; className?: string }) {
  return (
    <Badge variant={tone === "live" ? "accent" : tone === "good" ? "success" : "secondary"} className={cn("shrink-0", tone === "off" && "text-muted-foreground", className)}>
      {tone === "live" && <LiveDot className="size-1.5" />}
      {children}
    </Badge>
  );
}

const MATCH_TONE = { waiting: "quiet", ready: "good", live: "live", done: "quiet", cancelled: "off" } as const;
/** A match's status; `children` says it otherwise (a bye). */
export function MatchStatusBadge({ status, children, className }: { status: MatchStatus; children?: React.ReactNode; className?: string }) {
  return (
    <StateBadge tone={MATCH_TONE[status]} className={className}>
      {children ?? said(MATCH_STATUS[status])}
    </StateBadge>
  );
}

const TOURNAMENT_TONE = { open: "good", running: "live", finished: "quiet", cancelled: "off" } as const;
/** A tournament's status: the round being played while it runs. */
export function StatusBadge({ t, className }: { t: { status: TournamentStatus; round: number; rounds: number }; className?: string }) {
  return <StateBadge tone={TOURNAMENT_TONE[t.status]} className={className}>{t.status === "running" ? roundName(t.round, t.rounds) : said(STATUS_TEXT[t.status])}</StateBadge>;
}

/** An event's icon on the quiet square of a card (base's `IconTile`, for a puzzle icon rather than a lucide one). */
export function EventTile({ event, className }: { event: string; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-muted text-muted-foreground", className)}>
      <Icon name={"Puzzle" + event} size={20} />
    </span>
  );
}

/** The seat of a match no one holds yet: a dashed circle the size of an avatar. */
export function EmptySeat({ size = 32 }: { size?: number }) {
  return <span aria-hidden="true" className="shrink-0 rounded-full border border-dashed border-muted-foreground/40" style={{ width: size, height: size }} />;
}

/**
 * A player of a match on one line: the face, the name (`name` says it otherwise: "You", "To be decided"), then the score
 * on the right. The winner in bold with a green check, the other muted once it is decided; the account's name in the
 * accent.
 */
export function PlayerLine({
  p,
  name,
  score,
  won = false,
  decided = false,
  me = false,
  size = 32,
  className,
}: {
  p: Person | null | undefined;
  name?: React.ReactNode;
  score?: React.ReactNode;
  won?: boolean;
  decided?: boolean;
  me?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      {p ? <Avatar name={p.username} src={p.avatar} size={size} /> : <EmptySeat size={size} />}
      <span className={cn("min-w-0 truncate text-sm", !p ? "text-muted-foreground" : won ? "font-semibold" : decided ? "text-muted-foreground" : "font-medium", me && p && !decided && "text-primary")}>
        {name ?? p?.username}
      </span>
      {won && (
        <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
          <Check className="size-3" strokeWidth={3} aria-label={tr("Winner")} />
        </span>
      )}
      {score != null && <span className={cn(NUMERIC, "ml-auto pl-2 text-base", won ? "font-semibold" : "text-muted-foreground")}>{score}</span>}
    </div>
  );
}

type Timed = { ms: number; penalty: string } | null | undefined;
/** A solve's time as a move list shows it: the better one green, +2 and DNF as small tags. */
export function SolveTime({ r, best = false }: { r: Timed; best?: boolean }) {
  if (!r) return <span className="text-muted-foreground/40">–</span>;
  if (r.penalty === "dnf") return <Badge variant="destructive" className="h-4.5 px-1.5">{tr("DNF")}</Badge>;
  return (
    <span className={cn("inline-flex items-center gap-1.5", best && "font-medium text-success")}>
      {r.penalty === "+2" && <Badge variant="warning" className="h-4.5 px-1">+2</Badge>}
      {fmtTime(r.ms + (r.penalty === "+2" ? 2000 : 0))}
    </span>
  );
}

export interface Move {
  key: string | number;
  /** The number of the round or the solve. */
  n: React.ReactNode;
  results: [Timed, Timed];
  /** The seat with the better time, if any. */
  best: number | null;
  /** The row being raced. */
  current?: boolean;
  /** A heading over the row: the set it opens. */
  section?: string;
  scramble?: string;
  attrs?: Record<string, string | number>;
}

/**
 * The solves of a match as a move list: the number muted, each player's time (the better in green), the row being
 * raced marked, a heading where a set starts; `foot` closes it (the averages), `scrambles` adds each scramble.
 */
export function MoveList({
  names,
  rows,
  foot,
  scrambles = false,
  label,
  className,
}: {
  names: [React.ReactNode, React.ReactNode];
  rows: Move[];
  foot?: { label: React.ReactNode; values: [React.ReactNode, React.ReactNode]; best: number | null };
  scrambles?: boolean;
  label: string;
  className?: string;
}) {
  const current = useRef<HTMLTableRowElement>(null);
  useEffect(() => void current.current?.scrollIntoView({ block: "nearest" }), [rows.length]);
  const columns = scrambles ? 4 : 3,
    head = "h-8 px-2 text-xs font-semibold text-muted-foreground";
  return (
    <table className={cn(NUMERIC, "w-full table-fixed border-collapse text-sm", className)} aria-label={said(label)}>
      <thead className="sticky top-0 z-10 bg-card">
        <tr>
          <th scope="col" className={cn(head, "w-9 text-left")}>
            #
          </th>
          {names.map((name, i) => (
            <th key={i} scope="col" className={cn(head, "truncate text-right")}>
              {name}
            </th>
          ))}
          {scrambles && <th scope="col" className={cn(head, "w-[45%] text-left")}>{tr("Scramble")}</th>}
        </tr>
      </thead>
      <tbody>
        {rows.flatMap((row) => [
          row.section && (
            <tr key={"s" + row.key}>
              <th scope="rowgroup" colSpan={columns} className="px-2 pt-3 pb-1 text-left text-xs font-medium text-muted-foreground">
                {row.section}
              </th>
            </tr>
          ),
          <tr key={row.key} ref={row.current ? current : undefined} aria-current={row.current ? "true" : undefined} className="[&[aria-current]>td]:bg-accent [&>td:first-child]:rounded-l-[10px] [&>td:last-child]:rounded-r-[10px]" {...row.attrs}>
            <td className="h-8 px-2 text-xs text-muted-foreground">{row.n}</td>
            {row.results.map((r, seat) => (
              <td key={seat} className="h-8 px-2 text-right font-semibold">
                <SolveTime r={r} best={row.best === seat} />
              </td>
            ))}
            {scrambles && (
              <td className="h-8 px-2 font-mono text-xs text-muted-foreground">
                <Tip content={row.scramble}>
                  <span className="block truncate">{row.scramble}</span>
                </Tip>
              </td>
            )}
          </tr>,
        ])}
      </tbody>
      {foot && (
        <tfoot>
          <tr className="[&>*]:bg-muted [&>:first-child]:rounded-l-[12px] [&>:last-child]:rounded-r-[12px]">
            <th scope="row" className="h-10 px-2 text-left text-xs font-semibold text-muted-foreground">
              {foot.label}
            </th>
            {foot.values.map((v, seat) => (
              <td key={seat} className={cn("h-10 px-2 text-right font-extrabold", foot.best === seat && "text-success")}>
                {v}
              </td>
            ))}
            {scrambles && <td />}
          </tr>
        </tfoot>
      )}
    </table>
  );
}

/** A card (a `Surface`) that opens something as a whole: its outline lights up under the pointer, the button's focus ring. */
export const CARD_LINK = cn("cursor-pointer text-left transition-colors hover:bg-accent", FOCUS);
/** What makes a whole card open something; the buttons on it act on their own (they stop the click). */
export const opens = (open: () => void, role: "button" | "link" = "button") => ({
  role,
  tabIndex: 0,
  onClick: open,
  onKeyDown: (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget || !(e.key === "Enter" || (role === "button" && e.key === " "))) return;
    e.preventDefault();
    open();
  },
});
/** Keeps a click on a card's own buttons from opening the card. */
export const apart = { onClick: (e: React.SyntheticEvent) => e.stopPropagation(), onKeyDown: (e: React.SyntheticEvent) => e.stopPropagation() };

/** The event, picked from a menu of every event with its icon, like the app's puzzle picker. */
function EventSelect({ value, onChange }: { value: string; onChange: (event: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className="w-full justify-start font-normal" aria-label={tr("Event")} data-action="format:event" />}>
        <Icon name={"Puzzle" + value} size={16} />
        <span className="truncate">{eventName(value)}</span>
        <ChevronDown className="ml-auto text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[min(32rem,var(--available-height))] w-auto min-w-52">
        <DropdownMenuRadioGroup value={value} onValueChange={(v: string) => onChange(v)}>
          {EVENTS.map((e) => (
            <DropdownMenuRadioItem key={e.id} value={e.id} closeOnClick data-event={e.id}>
              <Icon name={"Puzzle" + e.id} size={16} />
              {said(e.label)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The event and how a match is won, on one line: solves to take a set, sets to take the match. */
export function FormatFields({ value, onChange }: { value: Format; onChange: (f: Format) => void }) {
  return (
    <>
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] items-end gap-3">
        <Field>
          <FieldLabel>{tr("Event")}</FieldLabel>
          <EventSelect value={value.event} onChange={(event) => onChange({ ...value, event })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="format-points">{tr("Solves per set")}</FieldLabel>
          <Input id="format-points" type="number" min={1} max={15} value={value.points} onChange={(e) => onChange({ ...value, points: Math.max(1, Math.min(15, Number(e.target.value) || 1)) })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="format-sets">{tr("Sets to win")}</FieldLabel>
          <Input id="format-sets" type="number" min={1} max={9} value={value.sets} onChange={(e) => onChange({ ...value, sets: Math.max(1, Math.min(9, Number(e.target.value) || 1)) })} />
        </Field>
      </div>
      <FieldDescription>{formatText(value)}{tr(", on the same scrambles for both players.")}</FieldDescription>
    </>
  );
}

/*
 * The Challenges' own pieces, the same on the duel, the tournaments and the daily scramble: the stage in the middle (its
 * main action, the meter of what is under way, the figures under it), the side panes' heads, a player's name with its
 * level, the strip of rounds, the race's rows as a butterfly, a played race as a ticket, the stacked record and the
 * steps a tournament goes through.
 */

/** The small capitals over a block: the round, the day, what a list is about. */
export const KICKER = "text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase";

/** A pane's title, bold, its count muted beside it; its controls on the right. */
export function PanelHead({ title, meta, children, className }: { title: React.ReactNode; meta?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-8 shrink-0 items-center gap-2", className)}>
      <h2 className="flex min-w-0 items-baseline gap-2 text-lg font-extrabold tracking-[-0.01em]">
        <span className="truncate">{said(title)}</span>
        {meta != null && <span className={cn(NUMERIC, "shrink-0 text-sm font-semibold text-muted-foreground")}>{meta}</span>}
      </h2>
      {children && <div className="ml-auto flex shrink-0 items-center gap-1">{children}</div>}
    </div>
  );
}

/** A name with its level hung on it like a tag, after a thin rule. */
export function NameTag({ name, level, className }: { name: React.ReactNode; level?: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-baseline", className)}>
      <b className="truncate font-bold">{name}</b>
      {level != null && level !== "" && <span className={cn(NUMERIC, "ml-1.5 shrink-0 before:mr-1.5 before:content-['·'] text-[0.78em] font-bold text-muted-foreground")}>{level}</span>}
    </span>
  );
}

/** A figure of the stage: the number large, a short caption under it, no card. */
export function StageFigure({ value, label, tone }: { value: React.ReactNode; label: React.ReactNode; tone?: "good" | "accent" | "bad" }) {
  return (
    <div className="flex min-w-0 flex-col items-center">
      <b className={cn(NUMERIC, "text-2xl leading-[1.05] font-extrabold tracking-[-0.03em] md:text-[32px]", tone === "good" ? "text-success" : tone === "accent" ? "text-primary" : tone === "bad" && "text-destructive")}>{value ?? "–"}</b>
      <span className="truncate text-xs font-semibold text-muted-foreground md:text-[13px]">{said(label)}</span>
    </div>
  );
}

/** The middle of a Challenges page: one thing to press or to watch, a line under it, the figures along its foot. */
export function Stage({ children, lead, figures, className, ...rest }: { children: React.ReactNode; lead?: React.ReactNode; figures?: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("flex min-h-0 min-w-0 flex-col items-center justify-center gap-5 text-center md:gap-8", className)} {...rest}>
      <div className="flex flex-col items-center gap-3 md:gap-4">{children}</div>
      {lead}
      {figures && <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 md:gap-x-12">{figures}</div>}
    </section>
  );
}

/** The width the stage's action and its meter share, so one stands in for the other without a jump. */
const STAGE_WIDE = "w-[min(100%,24rem)] shrink-0";
/** The stage's main action: the page's one action card, filled, its icon, its word and the line saying what it does. */
export function StageAction({ icon, title, sub, className, onClick, "data-action": action }: { icon: typeof Check; title: React.ReactNode; sub?: React.ReactNode; className?: string; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; "data-action"?: string }) {
  return <ActionCard primary icon={icon} title={title} text={sub} action={action} onClick={onClick} className={cn(STAGE_WIDE, className)} />;
}

/** The stage's meter, where the action stands while something is under way: a big value, a line, its share as a bar. */
export function StageMeter({ share, value, label, tone = "accent", className }: { share: number; value: React.ReactNode; label?: React.ReactNode; tone?: "accent" | "good"; className?: string }) {
  return (
    <div
      role="img"
      aria-label={[typeof value === "string" ? value : "", typeof label === "string" ? label : ""].filter(Boolean).join(" · ") || undefined}
      className={cn(STAGE_WIDE, "flex min-h-16 flex-col justify-center gap-2 rounded-xl bg-muted px-5 py-3 text-left", className)}
    >
      <span className="flex min-w-0 items-baseline gap-3">
        <b className={cn(NUMERIC, "text-2xl leading-none font-extrabold tracking-[-0.03em]")}>{value}</b>
        {label && <span className="truncate text-[13px] font-semibold text-muted-foreground">{label}</span>}
      </span>
      <span className="h-1.5 overflow-hidden rounded-full bg-background">
        <i className={cn("block h-full rounded-full transition-[width]", tone === "good" ? "bg-success" : "bg-primary")} style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }} />
      </span>
    </div>
  );
}

/** Who took each round: the player's in the accent, the other's in lilac, a tie muted, the one being raced outlined. */
export type Cell = "me" | "them" | "tie" | "now" | "";
export function RoundStrip({ cells, big = false, label, className }: { cells: Cell[]; big?: boolean; label?: string; className?: string }) {
  return (
    <span role="img" aria-label={said(label)} className={cn("grid min-w-0 gap-1", className)} style={{ gridTemplateColumns: `repeat(${Math.max(1, cells.length)}, minmax(0, 1fr))` }}>
      {cells.map((c, i) => (
        <i
          key={i}
          data-cell={c || "todo"}
          className={cn(
            big ? "h-4 rounded-[6px]" : "h-2.5 rounded-[4px]",
            c === "me" ? "bg-primary" : c === "them" ? "bg-lilac" : c === "tie" ? "bg-muted-foreground/60" : c === "now" ? "ring-2 ring-primary ring-inset" : "bg-muted",
          )}
        />
      ))}
    </span>
  );
}

type Timed2 = { ms: number; penalty: string } | null | undefined;
const timeOf = (r: Timed2) => (!r || r.penalty === "dnf" ? null : r.ms + (r.penalty === "+2" ? 2000 : 0));
/** The longest time among rows, which the butterfly's bars are measured against. */
export const longest = (rows: [Timed2, Timed2][]) => Math.max(1, ...rows.flat().map(timeOf).filter((t): t is number => t !== null));
/**
 * A round as a butterfly: the player's bar to the left, the other's to the right, as long as the time, the faster in
 * its colour; the round's number between them, in the accent while it is raced.
 */
export function Fly({ n, times, best, max, current = false, className, ...rest }: { n: React.ReactNode; times: [Timed2, Timed2]; best: number | null; max: number; current?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div role="row" aria-current={current ? "true" : undefined} className={cn("grid grid-cols-[1fr_26px_1fr] items-center gap-1.5 text-[13px] font-bold", className)} {...rest}>
      {times.flatMap((r, seat) => {
        const t = timeOf(r),
          won = best === seat;
        const bar = r && <i className={cn("h-2 shrink-0 rounded-[4px]", won ? (seat ? "bg-lilac" : "bg-primary") : "bg-muted")} style={{ width: `${t === null ? 100 : Math.max(6, (t / max) * 100)}%`, maxWidth: "calc(100% - 52px)" }} />;
        const time = (
          <span role="cell" className={cn(NUMERIC, "min-w-[46px] shrink-0 whitespace-nowrap", seat ? "text-left" : "text-right", won ? "text-foreground" : "text-muted-foreground", r?.penalty === "dnf" && "text-destructive")}>
            {r ? (
              <>
                {r.penalty === "+2" && <span className="mx-0.5 text-[10px] text-warning">+2</span>}
                {r.penalty === "dnf" ? tr("DNF") : fmtTime(r.ms + (r.penalty === "+2" ? 2000 : 0))}
              </>
            ) : current ? (
              "…"
            ) : (
              ""
            )}
          </span>
        );
        const half = (
          <span key={seat} className={cn("flex min-w-0 items-center gap-1.5", !seat && "justify-end")}>
            {seat ? bar : time}
            {seat ? time : bar}
          </span>
        );
        // The number sits between the two halves.
        return seat ? [half] : [
          half,
          <span key="n" role="rowheader" className={cn(NUMERIC, "text-center text-xs", current ? "text-primary" : "text-muted-foreground")}>
            {n}
          </span>,
        ];
      })}
    </div>
  );
}

/** A gap between two times, signed: green when the player was faster, red when slower. */
export function Gap({ ms, children }: { ms?: number | null; children?: React.ReactNode }) {
  const tone = ms == null || ms === 0 ? "" : ms < 0 ? "text-success" : "text-destructive";
  return (
    <span className={cn(NUMERIC, "shrink-0 rounded-[8px] bg-muted px-[7px] py-[3px] text-[13px] font-bold whitespace-nowrap text-muted-foreground", tone)}>
      {children ?? (ms == null ? "–" : (ms > 0 ? "+" : ms < 0 ? "−" : "") + fmtTime(Math.abs(ms)))}
    </span>
  );
}

/** A race played, as a ticket: its result's edge, the score large, against whom with a line under, and the gap. */
export function Ticket({ result, score, name, level, sub, aside, className, ...rest }: { result: "win" | "loss" | "draw" | null; score: React.ReactNode; name: React.ReactNode; level?: React.ReactNode; sub?: React.ReactNode; aside?: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return (
    <div
      className={cn(
        "relative grid grid-cols-[54px_minmax(0,1fr)_auto] items-center gap-3 rounded-[14px] py-[9px] pr-3 pl-3.5 transition-colors before:absolute before:top-2.5 before:bottom-2.5 before:left-0 before:w-[3px] before:rounded-[3px]",
        result === "win" ? "before:bg-success" : result === "loss" ? "before:bg-destructive" : "before:bg-muted-foreground",
        className,
      )}
      data-result={result ?? undefined}
      {...rest}
    >
      <span className={cn(NUMERIC, "text-xl font-extrabold tracking-[-0.02em] whitespace-nowrap")}>{score}</span>
      <span className="flex min-w-0 flex-col text-[14.5px]">
        <NameTag name={name} level={level} />
        {sub && <small className="truncate text-[12.5px] text-muted-foreground">{sub}</small>}
      </span>
      {aside}
    </div>
  );
}

/** Wins, draws and losses as one stacked bar, their counts under it. */
export function Record({ won, drawn, lost }: { won: number; drawn: number; lost: number }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-[5px] bg-muted" aria-hidden="true">
        {won > 0 && <i className="bg-success" style={{ flex: won }} />}
        {drawn > 0 && <i className="bg-muted-foreground" style={{ flex: drawn }} />}
        {lost > 0 && <i className="bg-destructive" style={{ flex: lost }} />}
      </div>
      <p className={cn(NUMERIC, "flex flex-wrap gap-x-3.5 text-[13px] font-semibold text-muted-foreground [&_b]:text-[15px] [&_b]:text-foreground")}>
        <span>{tn(won, "{n} win")}</span>
        {drawn > 0 && <span>{tn(drawn, "{n} draw")}</span>}
        <span>{tn(lost, "{n} loss")}</span>
      </p>
    </div>
  );
}

const STEP = { open: 0, running: 1, finished: 2, cancelled: 2 } as const;
/** Where a tournament stands as three short steps (registration, under way, over), the current one lit, its word beside. */
export function Steps({ t, className }: { t: { status: TournamentStatus; round: number; rounds: number }; className?: string }) {
  const at = STEP[t.status];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-2 text-[13px] font-bold whitespace-nowrap", t.status === "open" ? "text-success" : t.status === "running" ? "text-primary" : "text-muted-foreground", className)} data-status={t.status}>
      <span className="flex gap-[3px]" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <i key={i} className={cn("h-1 w-3.5 rounded-[2px]", i < at ? "bg-muted-foreground" : i === at && t.status !== "cancelled" ? (t.status === "open" ? "bg-success" : t.status === "running" ? "bg-primary" : "bg-muted-foreground") : "bg-muted")} />
        ))}
      </span>
      {t.status === "running" ? roundName(t.round, t.rounds) : said(STATUS_TEXT[t.status])}
    </span>
  );
}

/** A rank as an outlined number, the podium's in yellow. */
export function Rank({ n, className }: { n: number; className?: string }) {
  return (
    <span className={cn(NUMERIC, "w-7 shrink-0 text-right text-lg font-extrabold text-transparent [-webkit-text-stroke:1.2px_var(--muted-foreground)]", n <= 3 && "[-webkit-text-stroke-color:var(--warning)]", className)}>{n}</span>
  );
}

/** The end of a race, rising over its foot rather than a dialog: the verdict and a line, the rounds, what next. */
export function Verdict({ title, tone, sub, middle, actions, className }: { title: React.ReactNode; tone?: "good" | "bad"; sub?: React.ReactNode; middle?: React.ReactNode; actions: React.ReactNode; className?: string }) {
  return (
    <section
      aria-live="polite"
      className={cn("grid shrink-0 items-center gap-x-8 gap-y-3 rounded-[26px] bg-card px-5 py-4 md:grid-cols-[auto_minmax(0,1fr)_auto] md:px-7 md:py-6", className)}
      data-slot="verdict"
    >
      <div className="min-w-0">
        <h2 className={cn("text-[clamp(28px,4vw,40px)] leading-none font-extrabold tracking-[-0.03em]", tone === "good" ? "text-success" : tone === "bad" && "text-destructive")}>{title}</h2>
        {sub && <p className={cn(NUMERIC, "mt-1.5 text-sm text-muted-foreground")}>{sub}</p>}
      </div>
      <div className="grid min-w-0 gap-2.5">{middle}</div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </section>
  );
}
