/** A few weeks from this one, Monday first: days to pick, marked open or off. */
import { NUMERIC } from "../base";
import { dayKey } from "./parts";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "long" });

export function CalendarGrid({
  weeks,
  marked,
  selected,
  onPick,
  disabled,
  className,
}: {
  weeks: number;
  marked: (key: string) => "open" | "off" | "none";
  selected: Set<string>;
  onPick: (key: string) => void;
  disabled?: (key: string) => boolean;
  className?: string;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const first = new Date(today);
  first.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const days = Array.from({ length: weeks * 7 }, (_, i) => {
    const d = new Date(first);
    d.setDate(first.getDate() + i);
    return d;
  });
  const todayKey = dayKey(today);
  const months = [...new Set(days.filter((d) => d >= today).map((d) => monthFormat.format(d)))];
  return (
    <div className={cn("flex flex-col gap-1.5", className)} data-slot="calendar">
      <span className="text-xs font-medium">{months.join(" – ")}</span>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => (
          <span key={w} className="pb-0.5 text-[11px] text-muted-foreground">
            {w}
          </span>
        ))}
        {days.map((d) => {
          const key = dayKey(d),
            past = d < today,
            mark = marked(key),
            off = past || disabled?.(key),
            chosen = selected.has(key);
          return (
            <button
              key={key}
              type="button"
              disabled={off}
              data-day={key}
              aria-pressed={chosen}
              aria-label={d.toDateString()}
              onClick={() => onPick(key)}
              className={cn(
                NUMERIC,
                "relative flex h-9 items-center justify-center rounded-md text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                off ? "text-muted-foreground/40" : "hover:bg-muted",
                mark === "open" && !off && "font-semibold text-foreground",
                mark === "off" && "text-muted-foreground line-through",
                key === todayKey && "ring-1 ring-border",
                chosen && "bg-primary font-semibold text-primary-foreground hover:bg-primary",
              )}
            >
              {d.getDate()}
              {mark === "open" && !off && !chosen && <span className="absolute bottom-1 size-1 rounded-full bg-primary" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
