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
import { tr } from "../../../src/client/i18n";
import { Avatar, FOCUS, Icon, NUMERIC, Tip, said } from "../base";
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
export function StatusBadge({ t }: { t: { status: TournamentStatus; round: number; rounds: number } }) {
  return <StateBadge tone={TOURNAMENT_TONE[t.status]}>{t.status === "running" ? roundName(t.round, t.rounds) : said(STATUS_TEXT[t.status])}</StateBadge>;
}

/** An event's icon on the quiet square of a card (base's `IconTile`, for a puzzle icon rather than a lucide one). */
export function EventTile({ event, className }: { event: string; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground", className)}>
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
  useEffect(() => current.current?.scrollIntoView({ block: "nearest" }), [rows.length]);
  const columns = scrambles ? 4 : 3,
    head = "h-8 px-2 text-xs font-medium text-muted-foreground";
  return (
    <table className={cn(NUMERIC, "w-full table-fixed border-collapse text-sm", className)} aria-label={said(label)}>
      <thead className="sticky top-0 z-10 bg-card">
        <tr className="border-b">
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
          <tr key={row.key} ref={row.current ? current : undefined} aria-current={row.current ? "true" : undefined} className="[&[aria-current]>td]:bg-muted/60 [&>td:first-child]:rounded-l-md [&>td:last-child]:rounded-r-md" {...row.attrs}>
            <td className="h-8 px-2 text-xs text-muted-foreground">{row.n}</td>
            {row.results.map((r, seat) => (
              <td key={seat} className="h-8 px-2 text-right">
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
          <tr className="border-t">
            <th scope="row" className="h-9 px-2 text-left text-xs font-medium text-muted-foreground">
              {foot.label}
            </th>
            {foot.values.map((v, seat) => (
              <td key={seat} className={cn("h-9 px-2 text-right font-medium", foot.best === seat && "text-success")}>
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
export const CARD_LINK = cn("cursor-pointer text-left hover:bg-muted/30 hover:ring-primary/40", FOCUS);
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
      <DropdownMenuTrigger render={<Button variant="outline" className="w-full justify-start gap-2 px-2.5 font-normal" aria-label={tr("Event")} data-action="format:event" />}>
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
