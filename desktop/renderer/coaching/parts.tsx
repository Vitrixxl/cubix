/** Pieces shared by the coaching pages: dates, stars, events, panels and their loading shapes. */
import { ChevronLeft, Star } from "lucide-react";
import { Link } from "react-router";
import { Icon, NUMERIC, Tip } from "../base";
import { EVENTS, eventInfo } from "../../../src/shared/puzzles";
import { go } from "../navigation";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** The joined panel of the coaching pages: one frame whose parts share lines. */
export const PANEL = "flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card text-sm text-card-foreground";
/** A heading inside a panel, on its own line. */
export const PANEL_HEAD = "flex min-h-11 shrink-0 items-center gap-2 border-b px-4 text-sm font-medium";

export const url = (view = "") => "/coaching" + (view ? "/" + view : "");

const dayFormat = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
export const day = (ms: number) => dayFormat.format(ms);
export const time = (ms: number) => timeFormat.format(ms);
/** "Tue 7 Oct · 18:00–19:00" */
export const span = (start: number, end?: number) => `${day(start)} · ${time(start)}${end ? "–" + time(end) : ""}`;
/** The local calendar day of a moment, as YYYY-MM-DD. */
export function dayKey(ms: number | Date) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** "in 3 h", "in 2 days", "now", "2 days ago" */
export function relative(ms: number, now = Date.now()) {
  const minutes = Math.round((ms - now) / 60_000),
    abs = Math.abs(minutes);
  const text = abs < 1 ? "now" : abs < 60 ? `${abs} min` : abs < 48 * 60 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / 1440)} days`;
  return text === "now" ? text : minutes > 0 ? "in " + text : text + " ago";
}
export const clockTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Five stars, filled up to the rating (halves rounded), with the figure beside. */
export function Stars({ rating, size = 14, className, figure = true }: { rating: number | null; size?: number; className?: string; figure?: boolean }) {
  const filled = Math.round(rating ?? 0);
  return (
    <span className={cn("inline-flex items-center gap-1", className)} aria-label={rating == null ? "Not rated yet" : `Rated ${rating.toFixed(1)} out of 5`}>
      <span className="flex" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} style={{ width: size, height: size }} className={cn(i <= filled ? "fill-warning text-warning" : "text-muted-foreground/40")} />
        ))}
      </span>
      {figure && <span className={cn(NUMERIC, "text-muted-foreground")}>{rating == null ? "New" : rating.toFixed(1)}</span>}
    </span>
  );
}

/** The events a coach teaches, as WCA icons. */
export function Events({ events, size = 16, className }: { events: string[]; size?: number; className?: string }) {
  return (
    <span className={cn("flex flex-wrap items-center gap-1.5 text-muted-foreground", className)}>
      {events.map((id) => (
        <Tip key={id} content={eventInfo(id)?.label ?? id}>
          <span className="flex">
            <Icon name={"Puzzle" + id} size={size} />
          </span>
        </Tip>
      ))}
    </span>
  );
}

/** The header's back arrow. */
export function Back({ to, label = "Back" }: { to: string; label?: string }) {
  return (
    <Tip content={label}>
      <UiButton variant="outline" size="icon" aria-label={label} data-action="coaching:back" className="size-8 max-md:size-10" onClick={() => go(to)}>
        <ChevronLeft />
      </UiButton>
    </Tip>
  );
}

/** A row that opens another view. */
export function RowLink({ to, active, children, className }: { to: string; active?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={cn("flex w-full min-w-0 items-center gap-3 border-b px-4 py-3 text-left outline-none last:border-b-0 hover:bg-muted/50 focus-visible:bg-muted aria-[current=page]:bg-muted", className)}
    >
      {children}
    </Link>
  );
}

/** A count on a navigation row or a list row. */
export function Count({ n, tone = "primary" }: { n: number; tone?: "primary" | "muted" }) {
  if (!n) return null;
  return (
    <span className={cn(NUMERIC, "ml-auto flex h-5 min-w-5 items-center justify-center rounded-md px-1.5 text-xs font-medium", tone === "primary" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
      {n}
    </span>
  );
}

/** Rows on their way, shaped like a list of people. */
export function RowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A quiet sentence where a list has nothing, with an optional way forward. */
export function Nothing({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground", className)}>{children}</div>;
}

/** The figures of a panel, one line of equal cells split by lines. */
export function Figures({ items, className }: { items: [label: string, value: React.ReactNode, tone?: string][]; className?: string }) {
  return (
    <div className={cn("grid shrink-0 border-b", className)} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map(([label, value, tone], i) => (
        <div key={label} className={cn("flex min-w-0 flex-col gap-1 px-4 py-3", i > 0 && "border-l")}>
          <span className="truncate text-xs text-muted-foreground">{label}</span>
          <span className={cn(NUMERIC, "truncate text-xl font-medium tracking-tight", tone)}>{value}</span>
        </div>
      ))}
    </div>
  );
}

/** The events taught, picked among every WCA event: icon cells, chosen ones tinted. */
export function EventPicker({ value, onChange, className }: { value: string[]; onChange: (events: string[]) => void; className?: string }) {
  return (
    <ToggleGroup multiple variant="outline" spacing={1} value={value} onValueChange={(v: string[]) => onChange(EVENTS.filter((e) => v.includes(e.id)).map((e) => e.id))} aria-label="Events" className={cn("flex-wrap justify-start", className)}>
      {EVENTS.map((e) => (
        <Tip key={e.id} content={e.label}>
          <ToggleGroupItem value={e.id} aria-label={e.label} data-event={e.id} className="size-10 p-0 data-[pressed]:border-primary/60 data-[pressed]:bg-primary/12 data-[pressed]:text-primary">
            <Icon name={"Puzzle" + e.id} size={20} />
          </ToggleGroupItem>
        </Tip>
      ))}
    </ToggleGroup>
  );
}
