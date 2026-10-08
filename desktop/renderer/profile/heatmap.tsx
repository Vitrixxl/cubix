/** The contribution graph: solves per day as squares, a week per column (Monday on top), a year wide. */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Section, TIP } from "./card";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { fmtTime, best, bestAverage, shortDate } from "../../../src/client/lib/format";
import { HEAT_LEVELS, heatDays, heatmap, heatYears, type ActivitySolve, type HeatCell, type HeatDay } from "../../../src/client/lib/profile";
import { NUMERIC, plural } from "../ui";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { tr, locale } from "../../../src/client/i18n";
import { said } from "../base";

const GAP = 3,
  LABEL = 30;

type Hover = { cell: HeatCell; rect: DOMRect };

export function Heatmap({ solves, latest, phone }: { solves: ActivitySolve[]; latest: string | null; phone: boolean }) {
  const [year, setYear] = useState<number | null>(null),
    [hover, setHover] = useState<Hover | null>(null),
    [width, setWidth] = useState(0),
    box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const style = getComputedStyle(el);
      setWidth(el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const days = useMemo(() => heatDays(solves), [solves]),
    years = useMemo(() => heatYears(days), [days]),
    { cells, weeks, months, level, total } = useMemo(() => heatmap(days, year), [days, year]);
  const scroller = useRef<HTMLDivElement>(null),
    when = year == null ? tr("in the last year") : tr("in {0}", { 0: year }),
    /** The day outlined: marked on its square directly, the squares never drawn again as the pointer moves. */
    outlined = useRef<HTMLElement | null>(null);
  // Squares fill the card's width, between GitHub's size and a comfortable one; phones scroll sideways.
  const cell = phone ? 12 : Math.max(7, Math.min(16, Math.floor((width - LABEL) / weeks - GAP))),
    gridWidth = LABEL + weeks * (cell + GAP) - GAP;
  const squares = useMemo(
    () =>
      cells.map((c, i) =>
        c.hidden ? null : (
          <span
            key={c.key}
            data-key={c.key}
            data-count={c.count}
            className={cn("rounded-[3px] outline-offset-1 data-hover:outline data-hover:outline-foreground/70", HEAT_LEVELS[level(c.count)])}
            style={{ gridRow: 2 + (i % 7), gridColumn: 1 + Math.floor(i / 7) }}
          />
        ),
      ),
    [cells, level],
  );
  const outline = (element: HTMLElement | null) => {
    outlined.current?.removeAttribute("data-hover");
    element?.setAttribute("data-hover", "");
    outlined.current = element;
  };
  useLayoutEffect(() => {
    // Phones show the latest months first.
    if (phone && scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [phone, year, weeks]);
  return (
    <Section
      label={tr("Activity")}
      title={
        <>
          {plural(total, "solve")} {!phone && when}
        </>
      }
      className="shrink-0"
      // Taller beside the identity card, the year stays centred in its card.
      body="flex-1 justify-center gap-0 pt-2 pb-4"
      aside={
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="sm" data-action="menu:heatmapYear" className="-mr-2 gap-1 text-muted-foreground" />}>
            {year ?? tr("Last 12 months")}
            <ChevronDown />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-40">
            <DropdownMenuRadioGroup value={String(year)} onValueChange={(v: string) => setYear(v === "null" ? null : Number(v))}>
              <DropdownMenuRadioItem value="null" closeOnClick>
                {tr("Last 12 months")}
              </DropdownMenuRadioItem>
              {years.map((y) => (
                <DropdownMenuRadioItem key={y} value={String(y)} closeOnClick>
                  {y}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      <div ref={box}>
        {/* The day names stay put while a phone scrolls the weeks. */}
        <div className={cn("flex", !phone && "justify-center")}>
          <div className="grid shrink-0" aria-hidden="true" style={{ width: LABEL, gridTemplateRows: `auto repeat(7, ${cell}px)`, rowGap: GAP }}>
            <span className="invisible pb-1 text-xs leading-none">M</span>
            {["Mon", "", "Wed", "", "Fri", "", ""].map((d, i) => (
              <span key={i} className="self-center text-xs leading-none text-muted-foreground">
                {said(d)}
              </span>
            ))}
          </div>
          <div ref={scroller} className={cn("min-w-0", phone ? "-mr-5 overflow-x-auto pr-5 pb-1" : "overflow-hidden")}>
            <div
              className="grid"
              role="img"
              aria-label={plural(total, "solve") + " " + when}
              // One listener for every day: the one the pointer enters gets the outline and the tooltip.
              onMouseOver={(e) => {
                const element = (e.target as HTMLElement).closest<HTMLElement>("[data-key]"),
                  cell = element && cells.find((c) => c.key === element.dataset.key);
                if (!element || !cell) return;
                outline(element);
                setHover({ cell, rect: element.getBoundingClientRect() });
              }}
              onMouseLeave={() => {
                outline(null);
                setHover(null);
              }}
              style={{ width: gridWidth - LABEL, gridTemplateColumns: `repeat(${weeks}, ${cell}px)`, gridTemplateRows: `auto repeat(7, ${cell}px)`, gap: GAP }}
            >
              {/* A month starting in the last weeks would stick out past the grid. */}
              {months
                .filter((m) => phone || m.week < weeks - 2)
                .map((m) => (
                  <span key={m.week} className="pb-1 text-xs leading-none whitespace-nowrap text-muted-foreground" style={{ gridRow: 1, gridColumn: m.week + 1 }}>
                    {said(m.label)}
                  </span>
                ))}
              {squares}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-4 text-xs text-muted-foreground" style={phone ? undefined : { width: Math.min(gridWidth, width), marginInline: "auto" }}>
          <span className="truncate">{latest ? tr("Last practice {0}", { 0: shortDate(latest) }) : tr("No practice yet")}</span>
          <span className="flex shrink-0 items-center gap-1">
            {tr("Less")}
            {HEAT_LEVELS.map((c) => (
              <span key={c} className={cn("size-2.5 rounded-[2px]", c)} />
            ))}
            {tr("More")}
          </span>
        </div>
      </div>
      {hover && <HeatTip hover={hover} day={days.get(hover.cell.key)} />}
    </Section>
  );
}

/** The hovered day: its solves, and the best single and Ao5 of its timed ones. */
function HeatTip({ hover, day }: { hover: Hover; day: HeatDay | undefined }) {
  const times = day?.times ?? [],
    { cell, rect } = hover,
    edge = rect.left < 140 ? "start" : rect.right > innerWidth - 140 ? "end" : "middle";
  return createPortal(
    <div
      role="tooltip"
      className={cn(TIP, "fixed -translate-y-full", edge === "end" ? "-translate-x-full" : edge === "middle" && "-translate-x-1/2")}
      style={{ left: rect.left + (edge === "start" ? 0 : edge === "end" ? rect.width : rect.width / 2), top: rect.top - 6 }}
    >
      <span>
        <strong className="font-medium">{cell.count ? plural(cell.count, "solve") : tr("No solves")}</strong> {tr("on")}{" "}
        {cell.date.toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "short" })}
      </span>
      {times.some((t) => t != null) && (
        <span className={cn(NUMERIC, "text-background/70")}>
          {tr("Best")} {fmtTime(best(times))}
          {times.length >= 5 && tr(" · Ao5 {0}", { 0: fmtTime(bestAverage(times, 5)) })}
        </span>
      )}
    </div>,
    document.body,
  );
}
