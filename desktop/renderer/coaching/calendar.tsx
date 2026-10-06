/**
 * The coaching calendar, shared by the coach's schedule and a player's booking: a month as one grid, Monday first,
 * six weeks tall, each day a cell its page fills (open hours, sessions, free slots). Days are YYYY-MM-DD keys, computed
 * in UTC so the browser's own zone never shifts them.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { NUMERIC } from "../base";
import { PANEL } from "./parts";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import { tr, localFormat } from "../../../src/client/i18n";
import { said } from "../base";

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const toDate = (key: string) => new Date(key + "T00:00:00Z");
export const keyOf = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (key: string, n: number) => keyOf(new Date(toDate(key).getTime() + n * 86_400_000));
export const weekdayOf = (key: string) => (toDate(key).getUTCDay() + 6) % 7;
export const longDay = localFormat({ weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
export const shortDay = localFormat({ day: "numeric", month: "short", timeZone: "UTC" });
const monthName = localFormat({ month: "long", year: "numeric", timeZone: "UTC" });
/** The month ("2026-10") some months away. */
function shiftMonth(month: string, n: number) {
  const d = toDate(month + "-01");
  d.setUTCMonth(d.getUTCMonth() + n);
  return keyOf(d).slice(0, 7);
}

/** A small label inside a day: a session booked, a free slot. */
export const CHIP = "flex w-full min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
/** Shown when a day is too narrow for its hours as text: a line under the date. */
export const NARROW_BAR = "hidden h-1 shrink-0 rounded-full bg-primary/50 @max-[5.5rem]:block";

/** The month's name, the arrows to the months around it and Today; the page's own actions on the right. */
export function MonthHeader({ month, today, onMonth, children }: { month: string; today: string; onMonth: (month: string) => void; children?: React.ReactNode }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <h2 className="min-w-44 text-xl font-semibold tracking-tight first-letter:uppercase">{monthName.format(toDate(month + "-01"))}</h2>
      <UiButton variant="outline" size="icon-sm" aria-label={tr("Previous month")} onClick={() => onMonth(shiftMonth(month, -1))} data-action="calendar:previous">
        <ChevronLeft />
      </UiButton>
      <UiButton variant="outline" size="icon-sm" aria-label={tr("Next month")} onClick={() => onMonth(shiftMonth(month, 1))} data-action="calendar:next">
        <ChevronRight />
      </UiButton>
      <UiButton variant="ghost" size="sm" onClick={() => onMonth(today.slice(0, 7))}>
        {tr("Today")}</UiButton>
      {children}
    </div>
  );
}

/** What a day's cell shows besides its date: beside the date, under it, and the look of the whole cell. */
export interface DayCell {
  corner?: React.ReactNode;
  body?: React.ReactNode;
  className?: string;
}

/** The month as one grid: a day is picked with a click, or Enter; past days and closed ones cannot be. */
export function Month({
  month,
  today,
  selected,
  disabled,
  allowPast = false,
  pick,
  cell,
  className,
}: {
  month: string;
  today: string;
  selected: (day: string) => boolean;
  /** Days that cannot be picked, besides past days when `allowPast` is false. */
  disabled?: (day: string) => boolean;
  allowPast?: boolean;
  pick: (day: string, e: React.MouseEvent | React.KeyboardEvent) => void;
  cell: (day: string, past: boolean) => DayCell;
  className?: string;
}) {
  const first = month + "-01";
  const start = addDays(first, -weekdayOf(first));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return (
    <div className={cn(PANEL, "min-w-0 flex-1 max-lg:min-h-[36rem] max-lg:flex-none", className)} role="grid" aria-label={tr("Calendar")} data-slot="calendar">
      <div className="grid shrink-0 grid-cols-7 border-b" role="row">
        {WEEKDAYS.map((w) => (
          <span key={w} role="columnheader" className="px-2.5 py-2 text-xs font-medium text-muted-foreground">
            {said(w)}
          </span>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
        {days.map((day, i) => {
          const past = day < today,
            off = (past && !allowPast) || !!disabled?.(day),
            outside = !day.startsWith(month),
            chosen = selected(day),
            { corner, body, className } = cell(day, past);
          return (
            <div
              key={day}
              role="gridcell"
              tabIndex={off ? -1 : 0}
              aria-disabled={off || undefined}
              aria-selected={chosen}
              aria-label={longDay.format(toDate(day))}
              data-day={day}
              onClick={(e) => !off && pick(day, e)}
              onKeyDown={(e) => !off && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), pick(day, e))}
              className={cn(
                "@container relative flex min-h-0 min-w-0 flex-col gap-1 overflow-hidden p-1.5 outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
                i % 7 !== 6 && "border-r",
                i < 35 && "border-b",
                outside && "bg-muted/25",
                off ? "text-muted-foreground/60" : "cursor-pointer hover:bg-muted/40",
                className,
                chosen && "bg-primary/10 ring-2 ring-primary ring-inset hover:bg-primary/10",
              )}
            >
              <span className="flex items-center gap-1">
                <span className={cn(NUMERIC, "flex size-6 items-center justify-center rounded-full text-xs font-medium", outside && "text-muted-foreground", day === today && "bg-primary text-primary-foreground")}>{toDate(day).getUTCDate()}</span>
                {corner}
              </span>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A box of a day's grid ({@link DayBoxes}): a time to book, a session booked. */
export const BOX = cn(CHIP, "min-h-6 justify-center text-xs font-semibold");

/**
 * A day's times as boxes filling its cell: one per line up to three, two per line beyond, and when six do not hold
 * them all, the last box counts the others; its click reaches the cell, which opens the day. `children` draws a box,
 * told whether it shares its line.
 */
export function DayBoxes<T>({ items, children, className }: { items: T[]; children: (item: T, paired: boolean) => React.ReactNode; className?: string }) {
  const paired = items.length > 3,
    room = paired ? 6 : 3,
    shown = items.length > room ? items.slice(0, room - 1) : items;
  return (
    <div className={cn("grid min-h-0 flex-1 grid-rows-[repeat(3,minmax(0,2.5rem))] gap-1", paired && "grid-cols-2", className)} data-slot="day-boxes">
      {shown.map((item) => children(item, paired))}
      {shown.length < items.length && (
        <button type="button" aria-label={tr("{0} more", { 0: items.length - shown.length })} data-action="calendar:more" className={cn(BOX, "px-0.5 bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground")}>
          +{items.length - shown.length}
        </button>
      )}
    </div>
  );
}
