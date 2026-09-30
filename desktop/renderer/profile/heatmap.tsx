/** The contribution graph: solves per day as squares, a week per column (Monday on top), a year wide. */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { fmtTime, best, bestAverage } from "../../../src/client/lib/format";
import { MONO, plural } from "../ui";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { dayKey, shortDate, type ActivitySolve } from "./data";

const GAP = 3,
  LABEL = 30,
  /** Five steps of the accent: none, then the four quarters of the active days. */
  LEVELS = ["bg-muted", "bg-primary/35", "bg-primary/60", "bg-primary/85", "bg-primary"];

type Cell = { key: string; date: Date; count: number; hidden: boolean };

/** The days to draw: the last 53 weeks up to today, or one calendar year. */
function period(year: number | null) {
  const today = new Date(),
    first = year == null ? new Date(today.getFullYear(), today.getMonth(), today.getDate() - 364) : new Date(year, 0, 1),
    last = year == null ? new Date(today.getFullYear(), today.getMonth(), today.getDate()) : new Date(year, 11, 31),
    start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const weeks = Math.ceil(((last.getTime() - start.getTime()) / 86400000 + 1) / 7);
  return { first, last, start, weeks, today };
}

export function Heatmap({ solves, latest, phone }: { solves: ActivitySolve[]; latest: string | null; phone: boolean }) {
  const [year, setYear] = useState<number | null>(null),
    [hover, setHover] = useState<{ cell: Cell; rect: DOMRect } | null>(null),
    [width, setWidth] = useState(0),
    box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const days = useMemo(() => {
    const map = new Map<string, { count: number; times: (number | null)[] }>();
    for (const solve of solves) {
      const key = dayKey(new Date(solve.at)),
        day = map.get(key) ?? { count: 0, times: [] };
      day.count++;
      if (solve.timer) day.times.push(solve.time);
      map.set(key, day);
    }
    return map;
  }, [solves]);
  const years = [...new Set([new Date().getFullYear(), ...[...days.keys()].map((k) => Number(k.slice(0, 4)))])].sort((a, b) => b - a);
  const scroller = useRef<HTMLDivElement>(null);
  const { first, last, start, weeks, today } = period(year),
    cells: Cell[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const key = dayKey(date);
    cells.push({ key, date, count: days.get(key)?.count ?? 0, hidden: date < first || date > last || date > today });
  }
  // The active days split in four quarters, like GitHub's graph: a few busy days don't flatten the rest.
  const counts = cells.filter((c) => !c.hidden && c.count).map((c) => c.count).sort((a, b) => a - b),
    quartile = (q: number) => counts[Math.min(counts.length - 1, Math.floor(q * counts.length))] ?? 0,
    steps = [quartile(0.25), quartile(0.5), quartile(0.75)],
    level = (count: number) => (!count ? 0 : count <= steps[0]! ? 1 : count <= steps[1]! ? 2 : count <= steps[2]! ? 3 : 4),
    total = counts.reduce((sum, n) => sum + n, 0);
  // Squares fill the card's width, between GitHub's size and a comfortable one; phones scroll sideways.
  const cell = phone ? 12 : Math.max(9, Math.min(16, Math.floor((width - LABEL) / weeks - GAP))),
    gridWidth = LABEL + weeks * (cell + GAP) - GAP;
  const months: { week: number; label: string }[] = [];
  // A month is named over the week of its first day, unless the previous name is too close.
  for (let w = 0; w < weeks; w++) {
    const week = cells.slice(w * 7, w * 7 + 7),
      opening = w === 0 ? week.find((c) => c.date >= first) : week.find((c) => c.date.getDate() === 1);
    if (!opening || opening.date > last) continue;
    if (months.length && w - months.at(-1)!.week < 3) months.pop();
    months.push({ week: w, label: opening.date.toLocaleDateString(undefined, { month: "short" }) });
  }
  useLayoutEffect(() => {
    // Phones show the latest months first.
    if (phone && scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [phone, year, weeks]);
  const hovered = hover && days.get(hover.cell.key),
    times = hovered?.times ?? [];
  return (
    <Card className="heatmap gap-0 py-0" aria-label="Activity">
      <div className="flex min-h-13 items-center gap-3 px-5 pt-2">
        <h2 className="text-base font-semibold tracking-tight">
          {plural(total, "solve")} {phone ? "" : year == null ? "in the last year" : `in ${year}`}
        </h2>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="sm" data-action="menu:heatmapYear" className="-mr-2 ml-auto gap-1 text-muted-foreground" />}>
            {year ?? "Last 12 months"}
            <ChevronDown />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-40">
            <DropdownMenuRadioGroup value={String(year)} onValueChange={(v: string) => setYear(v === "null" ? null : Number(v))}>
              <DropdownMenuRadioItem value="null" closeOnClick>
                Last 12 months
              </DropdownMenuRadioItem>
              {years.map((y) => (
                <DropdownMenuRadioItem key={y} value={String(y)} closeOnClick>
                  {y}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div ref={box} className="px-5 pt-2 pb-4">
        {/* The day names stay put while a phone scrolls the weeks. */}
        <div className={cn("flex", !phone && "justify-center")}>
          <div className="grid shrink-0" aria-hidden="true" style={{ width: LABEL, gridTemplateRows: `auto repeat(7, ${cell}px)`, rowGap: GAP }}>
            <span className="invisible pb-1 text-xs leading-none">M</span>
            {["Mon", "", "Wed", "", "Fri", "", ""].map((d, i) => (
              <span key={i} className="self-center text-xs leading-none text-muted-foreground">
                {d}
              </span>
            ))}
          </div>
          <div ref={scroller} className={cn(phone && "-mr-5 min-w-0 overflow-x-auto pr-5 pb-1")}>
            <div
              className="grid"
              role="img"
              aria-label={`${plural(total, "solve")} ${year == null ? "over the last 12 months" : "in " + year}`}
              onMouseLeave={() => setHover(null)}
              style={{ width: gridWidth - LABEL, gridTemplateColumns: `repeat(${weeks}, ${cell}px)`, gridTemplateRows: `auto repeat(7, ${cell}px)`, gap: GAP }}
            >
              {months.map((m) => (
                <span key={m.week} className="pb-1 text-xs leading-none whitespace-nowrap text-muted-foreground" style={{ gridRow: 1, gridColumn: m.week + 1 }}>
                  {m.label}
                </span>
              ))}
              {cells.map((c, i) =>
                c.hidden ? null : (
                  <span
                    key={c.key}
                    data-count={c.count}
                    className={cn("heat-cell rounded-[3px] outline-offset-1", LEVELS[level(c.count)], hover?.cell.key === c.key && "outline outline-foreground/70")}
                    onMouseEnter={(e) => setHover({ cell: c, rect: e.currentTarget.getBoundingClientRect() })}
                    style={{ gridRow: 2 + (i % 7), gridColumn: 1 + Math.floor(i / 7) }}
                  />
                ),
              )}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-4 text-xs text-muted-foreground" style={phone ? undefined : { width: gridWidth, marginInline: "auto" }}>
          <span className="truncate">{latest ? `Last practice ${shortDate(latest)}` : "No practice yet"}</span>
          <span className="flex shrink-0 items-center gap-1">
            Less
            {LEVELS.map((c) => (
              <span key={c} className={cn("size-2.5 rounded-[2px]", c)} />
            ))}
            More
          </span>
        </div>
      </div>
      {hover &&
        createPortal(
          <div
            role="tooltip"
            className={cn(
              "pointer-events-none fixed z-50 flex -translate-y-full flex-col gap-0.5 rounded-md bg-foreground px-3 py-1.5 text-xs whitespace-nowrap text-background",
              hover.rect.left < 140 ? "" : hover.rect.right > innerWidth - 140 ? "-translate-x-full" : "-translate-x-1/2",
            )}
            style={{ left: hover.rect.left + (hover.rect.left < 140 ? 0 : hover.rect.right > innerWidth - 140 ? hover.rect.width : hover.rect.width / 2), top: hover.rect.top - 6 }}
          >
            <span>
              <strong className="font-medium">{hover.cell.count ? plural(hover.cell.count, "solve") : "No solves"}</strong> on{" "}
              {hover.cell.date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
            </span>
            {times.some((t) => t != null) && (
              <span className={cn(MONO, "text-background/70")}>
                Best {fmtTime(best(times))}
                {times.length >= 5 && ` · Ao5 ${fmtTime(bestAverage(times, 5))}`}
              </span>
            )}
          </div>,
          document.body,
        )}
    </Card>
  );
}
