/** The latest solves and their Ao5 as two lines: three quiet ticks, the dates under it, a crosshair on hover. */
import { useRef, useState } from "react";
import { fmtTime } from "../../../src/client/lib/format";
import { MONO } from "../ui";
import { cn } from "@/lib/utils";
import { shortDate } from "./data";

const W = 800,
  H = 200,
  TOP = 8,
  BOTTOM = 8;

export function Trend({ history, averages, count = 100, className }: { history: any[]; averages: (number | null)[]; count?: number; className?: string }) {
  const plot = useRef<HTMLDivElement>(null),
    [hover, setHover] = useState<number | null>(null);
  const from = Math.max(0, history.length - count),
    shown = history.slice(from),
    ao5 = averages.slice(from),
    finite = (v: number | null | undefined): v is number => v != null && Number.isFinite(v),
    values = [...shown.map((v) => v.time), ...ao5].filter(finite);
  if (values.length < 2) return <div className={cn("flex items-center justify-center text-sm text-muted-foreground", className)}>Your curve appears after two timed solves.</div>;
  // The slowest few percent would squash the rest: the scale stops near the top 3 %.
  const sorted = [...values].sort((a, b) => a - b),
    low = sorted[0]!,
    high = Math.max(low + 1, sorted[Math.floor(sorted.length * 0.97)]!),
    x = (i: number) => (shown.length === 1 ? W / 2 : (i / (shown.length - 1)) * W),
    y = (v: number) => TOP + (1 - (Math.min(v, high) - low) / (high - low)) * (H - TOP - BOTTOM),
    line = (points: (number | null)[]) => points.map((v, i) => (finite(v) ? `${finite(points[i - 1]) ? "L" : "M"}${x(i)} ${y(v)}` : "")).join(" "),
    ticks = [0, 1, 2].map((i) => high - ((high - low) * i) / 2),
    point = hover != null ? shown[hover] : null;
  return (
    <div className={cn("grid grid-cols-[auto_1fr] grid-rows-[1fr_auto] gap-x-3 gap-y-2", className)}>
      <div className="relative w-12" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} className={cn(MONO, "absolute right-0 -translate-y-1/2 text-xs text-muted-foreground")} style={{ top: (y(t) / H) * 100 + "%" }}>
            {fmtTime(t)}
          </span>
        ))}
      </div>
      <div
        ref={plot}
        className="relative min-h-0"
        role="img"
        aria-label={`Last ${shown.length} solves and their average of five`}
        onPointerMove={(e) => {
          const r = plot.current!.getBoundingClientRect();
          setHover(Math.max(0, Math.min(shown.length - 1, Math.round(((e.clientX - r.left) / r.width) * (shown.length - 1)))));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
          {ticks.map((t) => (
            <path key={t} d={`M0 ${y(t)} H${W}`} stroke="var(--border)" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={line(shown.map((v) => v.time))} fill="none" stroke="var(--chart-1)" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity="0.55" />
          <path d={line(ao5)} fill="none" stroke="var(--chart-2)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {hover != null && <path d={`M${x(hover)} 0 V${H}`} stroke="var(--muted-foreground)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
        </svg>
        {point && (
          <>
            {finite(point.time) && (
              <i className="pointer-events-none absolute size-2 -translate-1/2 rounded-full bg-chart-1 ring-2 ring-card" style={{ left: (x(hover!) / W) * 100 + "%", top: (y(point.time) / H) * 100 + "%" }} />
            )}
            <div
              className={cn("pointer-events-none absolute top-0 z-10 flex flex-col gap-0.5 rounded-md bg-foreground px-3 py-1.5 text-xs whitespace-nowrap text-background", x(hover!) > W / 2 ? "-translate-x-[calc(100%+10px)]" : "translate-x-2.5")}
              style={{ left: (x(hover!) / W) * 100 + "%" }}
            >
              <strong className={cn(MONO, "font-medium")}>{point.time == null ? "DNF" : fmtTime(point.time)}</strong>
              {finite(ao5[hover!]) && <span className={cn(MONO, "text-background/70")}>Ao5 {fmtTime(ao5[hover!])}</span>}
              <span className="text-background/70">
                #{from + hover! + 1} · {point.displayDate}
              </span>
            </div>
          </>
        )}
      </div>
      <div className="col-start-2 flex justify-between text-xs text-muted-foreground">
        <span>{shown[0]?.at && shortDate(shown[0].at)}</span>
        <span>{shown.at(-1)?.at && shortDate(shown.at(-1).at)}</span>
      </div>
    </div>
  );
}

/** The two series named beside the chart. */
export function TrendLegend() {
  return (
    <span className="flex items-center gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-3 rounded-full bg-chart-1" />
        Single
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-3 rounded-full bg-chart-2" />
        Ao5
      </span>
    </span>
  );
}
