import { useEffect, useMemo, useRef, useState } from "react";
import { fmtTime, joinedDate, shortDate } from "../../src/client/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { tr } from "../../src/client/i18n";
import { NUMERIC } from "./base";

export type ChartRange = [number, number];
type Entry = { time: number | null; displayDate: string; at?: string; memoMs?: number | null };
type Drag = { pointer: number; start: number; end: number; range: ChartRange; pan: boolean };
/** The chart's own tooltips (the selected period, the point under the pointer), drawn like the app's tooltips. */
const TIP = "pointer-events-none absolute z-10 rounded-md bg-foreground px-3 py-1.5 text-xs text-background shadow-md";
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
/** The plot is drawn in a 800 × 240 box stretched to its place; the times keep a margin above and below. */
const TOP = 10, BOTTOM = 230;
/** Steps of the time axis, in ms: the first giving five lines at most. */
const STEPS = [100, 200, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000, 1800000];
/** A time on the axis: "12", "12.5", "1:30". */
const axisTime = (ms: number, minutes: boolean) =>
  minutes ? `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}` : String(+(ms / 1000).toFixed(1));

/** Inclusive solve bounds; retain the requested width when reaching either edge. */
export function fitRange(start: number, width: number, last: number): ChartRange {
  const span = clamp(Math.round(width), Math.min(1, last), last);
  const first = clamp(Math.round(start), 0, last - span);
  return [first, first + span];
}

/**
 * Times over their order, read without guessing: the time axis graduated with its unit, the dates under the plot,
 * the marked times written beside their dot, the point under the pointer in a tooltip. Singles as a line, or as dots
 * (`points`) under their rolling average; blindfolded, the memorisation as squares; DNFs as crosses on top. `marks`
 * names the solves to write (the records); otherwise the fastest and slowest shown. Scroll zooms, a drag selects a
 * period, Shift-drag pans, a double click resets.
 */
export function HistoryChart({ history, averages, range, onRange, points = false, marks, averageLabel = "Ao5", xTitle, tip }: {
  history: Entry[];
  averages: (number | null)[];
  range: ChartRange;
  onRange: (range: ChartRange) => void;
  points?: boolean;
  marks?: number[];
  averageLabel?: string;
  /** The title under the dates; with it the time axis carries its own above. */
  xTitle?: string;
  /** A last line for the tooltip of a point (its session). */
  tip?: (i: number) => React.ReactNode;
}) {
  const plot = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  // The plot's width in pixels: as many dates and written times as it has room for.
  const [width, setWidth] = useState(800);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width || 800));
    observer.observe(plot.current!);
    return () => observer.disconnect();
  }, []);
  const [first, last] = range, end = history.length - 1;
  const zoomed = first > 0 || last < end;
  const span = Math.max(1, last - first);
  const memo = history.some((v) => v.memoMs != null);
  // The visible times on a graduated scale; with dots, the slowest 1 % stand on the top line instead of flattening the rest.
  const [lo, hi, step] = useMemo(() => {
    const values: number[] = [];
    for (let i = first; i <= last && i < history.length; i++) {
      const v = history[i]!;
      if (v.time != null) values.push(v.time);
      if (v.memoMs != null) values.push(v.memoMs);
      if (averages[i] != null) values.push(averages[i]!);
    }
    if (!values.length) return [0, 1000, 1000];
    values.sort((a, b) => a - b);
    const low = values[0]!, high = points ? values[Math.min(values.length - 1, Math.floor(values.length * 0.99))]! : values.at(-1)!;
    const step = STEPS.find((s) => (high - low) / s <= 4) ?? 3600000;
    const lo = Math.max(0, Math.floor(low / step) * step), hi = Math.max(lo + step, Math.ceil(high / step) * step);
    return [lo, hi, step];
  }, [history, averages, first, last, points]);
  const minutes = hi >= 60000;
  const x = (i: number) => (history.length === 1 ? 400 : 6 + ((i - first) / span) * 788);
  const y = (v: number) => TOP + (1 - (Math.min(v, hi) - lo) / (hi - lo)) * (BOTTOM - TOP);
  const grid: number[] = [];
  for (let v = lo; v <= hi + 1e-6; v += step) grid.push(v);
  const fraction = (clientX: number) => {
    const rect = plot.current!.getBoundingClientRect();
    return clamp((((clientX - rect.left) / rect.width) * 800 - 6) / 788, 0, 1);
  };
  const index = (f: number) => clamp(Math.round(first + f * span), first, last);
  const change = (next: ChartRange) => {
    setHover(null);
    onRange(next);
  };
  const reset = () => change([0, end]);
  const zoom = (factor: number, anchor: number) => {
    const width = clamp(Math.round(span * factor), Math.min(1, end), end);
    change(fitRange(first + anchor * (span - width), width, end));
  };
  // A native non-passive listener keeps wheel/pinch gestures inside the chart.
  useEffect(() => {
    const element = plot.current!;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (dragRef.current) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
      if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        const delta = (event.deltaX || event.deltaY) * unit;
        change(fitRange(first + (delta / element.clientWidth) * span, span, end));
      } else {
        zoom(Math.exp(clamp(event.deltaY * unit, -400, 400) * 0.003), fraction(event.clientX));
      }
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [first, last, end, onRange]);

  // The records written on the plot: the ones asked for, else the fastest and slowest shown.
  const written = useMemo(() => {
    if (marks) return marks.filter((i) => i >= first && i <= last && history[i]?.time != null).map((i) => ({ i, tone: "text-success" }));
    let fast = -1, slow = -1;
    for (let i = first; i <= last; i++) {
      const t = history[i]?.time;
      if (t == null) continue;
      if (fast < 0 || t < history[fast]!.time!) fast = i;
      if (slow < 0 || t > history[slow]!.time!) slow = i;
    }
    return [...(slow >= 0 && slow !== fast ? [{ i: slow, tone: "text-destructive" }] : []), ...(fast >= 0 ? [{ i: fast, tone: "text-success" }] : [])];
  }, [history, marks, first, last]);
  // The lines and dots of the times, built again only when the times or the period change, never as the pointer moves.
  const plotted = useMemo(() => {
    const path = (value: (i: number) => number | null | undefined) => {
      let pen = false, d = "";
      for (let i = first; i <= last; i++) {
        const v = value(i);
        if (v == null || !Number.isFinite(v)) { pen = false; continue; }
        d += `${pen ? "L" : "M"}${x(i)} ${y(v)}`;
        pen = true;
      }
      return d;
    };
    // Every dot in one path: zero-length strokes with round (or square) ends.
    const dots = (value: (i: number) => number | null | undefined, only?: (i: number) => boolean) => {
      let d = "";
      for (let i = first; i <= last; i++) {
        const v = value(i);
        if (v != null && (!only || only(i))) d += `M${x(i)} ${y(v)}h0.01`;
      }
      return d;
    };
    const many = last - first > 500;
    return (
      <>
        {grid.map((v) => <path key={v} d={`M0 ${y(v)} H800`} stroke="var(--border)" vectorEffect="non-scaling-stroke" />)}
        {memo && <path d={dots((i) => history[i]?.memoMs)} stroke="var(--warning)" strokeWidth="5" strokeLinecap="square" vectorEffect="non-scaling-stroke" />}
        {points ? (
          <path d={dots((i) => history[i]?.time)} stroke="var(--chart-1)" strokeOpacity={many ? 0.55 : 0.9} strokeWidth={many ? 3 : last - first > 120 ? 4 : 6} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        ) : (
          <>
            <path d={path((i) => history[i]?.time)} fill="none" stroke="var(--chart-1)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
            {/* Dots where the line cannot show them: few times, or a time alone between two DNFs. */}
            <path d={dots((i) => history[i]?.time, (i) => last - first < 40 || (history[i - 1]?.time == null && history[i + 1]?.time == null))} stroke="var(--chart-1)" strokeWidth="4.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </>
        )}
        <path d={path((i) => averages[i])} fill="none" stroke="var(--chart-2)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {written.map(({ i, tone }) => (
          <path key={i} className={tone} d={`M${x(i)} ${y(history[i]!.time!)}h0.01`} stroke="currentColor" strokeWidth="9" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        ))}
      </>
    );
    // `x` and `y` follow from these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, averages, first, last, lo, hi, step, points, written]);
  // Dates under the plot: six at most, the month and year over a long period.
  const ticks = useMemo(() => {
    const n = Math.min(last - first, Math.max(1, Math.min(5, Math.floor(width / 110)))), at = (i: number) => history[i]?.at;
    const long = at(first) && at(last) ? Date.parse(at(last)!) - Date.parse(at(first)!) > 120 * 86400000 : false;
    return Array.from({ length: n + 1 }, (_, k) => {
      const i = Math.round(first + ((last - first) * k) / (n || 1)), iso = at(i);
      return { i, text: iso ? (long ? joinedDate(iso) : shortDate(iso)) : `#${i + 1}` };
    }).map((tick, k, all) => (k && all[k - 1]!.text === tick.text ? { ...tick, text: "" } : tick));
  }, [history, first, last, width]);
  // Labels of the written records, those too close to the one on their right left out.
  const labels = useMemo(() => {
    const out: { i: number; tone: string }[] = [];
    for (const m of [...written].sort((a, b) => b.i - a.i)) if (!out.length || ((x(out.at(-1)!.i) - x(m.i)) * width) / 800 > 52) out.push(m);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [written, first, last, width]);
  const cancelDrag = () => {
    dragRef.current = null;
    setDrag(null);
  };
  const point = hover != null ? history[hover] : null;
  const value = point ? (point.time ?? averages[hover!]) : null;
  const selection = drag && !drag.pan ? [index(Math.min(drag.start, drag.end)), index(Math.max(drag.start, drag.end))] : null;
  const pct = (v: number, of: number) => (v / of) * 100 + "%";
  return (
    <div className="grid min-h-40 flex-1 grid-cols-[auto_1fr] grid-rows-[auto_1fr_auto_auto] gap-x-3 gap-y-1">
      <span className={cn("col-span-2 text-xs font-bold text-muted-foreground", !xTitle && "hidden")}>{minutes ? tr("time (min:s)") : tr("time (seconds)")}</span>
      <div className="relative w-9" aria-hidden="true">
        {grid.map((v) => (
          <span key={v} className={cn(NUMERIC, "absolute right-0 -translate-y-1/2 text-xs text-muted-foreground")} style={{ top: pct(y(v), 240) }}>
            {axisTime(v, minutes)}
          </span>
        ))}
      </div>
      <div
        ref={plot}
        className={cn("chart-plot relative min-h-0 cursor-crosshair touch-none rounded-md outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50", drag?.pan && "cursor-grabbing")}
        tabIndex={0}
        role="group"
        aria-label={tr("Solve times: scroll to zoom, drag to select a period, Shift-drag to pan, double-click to reset. Keyboard: plus or minus to zoom, arrows to pan, Home to reset.")}
        onDoubleClick={reset}
        onKeyDown={(event) => {
          if (!["+", "=", "-", "ArrowLeft", "ArrowRight", "Home", "Escape"].includes(event.key)) return;
          event.preventDefault();
          event.stopPropagation();
          if (event.key === "Escape") {
            cancelDrag();
            setHover(null);
          } else if (event.key === "Home") reset();
          else if (event.key === "+" || event.key === "=") zoom(0.7, 0.5);
          else if (event.key === "-") zoom(1.5, 0.5);
          else change(fitRange(first + (event.key === "ArrowLeft" ? -1 : 1) * Math.max(1, Math.round(span * 0.2)), span, end));
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || dragRef.current) return;
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          const start = fraction(event.clientX);
          dragRef.current = { pointer: event.pointerId, start, end: start, range, pan: event.shiftKey };
          setDrag(dragRef.current);
          setHover(null);
        }}
        onPointerMove={(event) => {
          const f = fraction(event.clientX), current = dragRef.current;
          if (!current) {
            setHover(index(f));
            return;
          }
          if (current.pointer !== event.pointerId) return;
          const next = { ...current, end: f };
          dragRef.current = next;
          setDrag(next);
          if (next.pan) {
            const width = next.range[1] - next.range[0];
            change(fitRange(next.range[0] + (next.start - f) * width, width, end));
          }
        }}
        onPointerUp={(event) => {
          const current = dragRef.current;
          if (!current || current.pointer !== event.pointerId) return;
          const finish = fraction(event.clientX);
          if (!current.pan && Math.abs(finish - current.start) * event.currentTarget.clientWidth > 6) {
            const a = index(Math.min(current.start, finish)), b = index(Math.max(current.start, finish));
            change(fitRange(a, b - a, end));
          }
          cancelDrag();
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={cancelDrag}
        onLostPointerCapture={cancelDrag}
        onPointerLeave={() => setHover(null)}
      >
        <svg className="absolute inset-0 size-full overflow-visible" viewBox="0 0 800 240" preserveAspectRatio="none" role="img" aria-label={tr("Single times and rolling average of five")}>
          {plotted}
          <path d={`M0 240 H800`} stroke="var(--muted-foreground)" strokeOpacity="0.5" vectorEffect="non-scaling-stroke" />
          {ticks.map(({ i }) => <path key={i} d={`M${x(i)} 240 v-6`} stroke="var(--muted-foreground)" strokeOpacity="0.5" vectorEffect="non-scaling-stroke" />)}
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={240} stroke="var(--muted-foreground)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
          {selection && <rect x={x(selection[0])} y={0} width={Math.max(1, x(selection[1]) - x(selection[0]))} height={240} fill="color-mix(in oklch, var(--primary) 12%, transparent)" stroke="var(--primary)" vectorEffect="non-scaling-stroke" />}
        </svg>
        {labels.map(({ i, tone }) => {
          const top = y(history[i]!.time!);
          return (
            <span key={i} aria-hidden="true" className={cn(NUMERIC, "pointer-events-none absolute -translate-x-1/2 text-[11px] font-bold", tone)} style={{ left: pct(clamp(x(i), 20, 780), 800), top: top > 200 ? `calc(${pct(top, 240)} - 22px)` : `calc(${pct(top, 240)} + 7px)` }}>
              {fmtTime(history[i]!.time)}
            </span>
          );
        })}
        {last - first < 300 &&
          history.slice(first, last + 1).map((v, k) =>
            v.time == null ? (
              <span key={k} aria-hidden="true" className="pointer-events-none absolute top-0 -translate-x-1/2 -translate-y-1/2 text-xs font-extrabold text-destructive" style={{ left: pct(x(first + k), 800) }}>
                ×
              </span>
            ) : null,
          )}
        {zoomed && (
          <Button variant="secondary" className="absolute top-2 right-2" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onClick={reset}>
            {tr("Reset zoom")}
          </Button>
        )}
        {selection && (
          <div className={cn(TIP, "top-2 left-1/2 -translate-x-1/2")}>
            {history[selection[0]]?.displayDate} — {history[selection[1]]?.displayDate}
          </div>
        )}
        {point && (
          <>
            {value != null && <div className="pointer-events-none absolute size-2.5 -translate-1/2 rounded-full bg-chart-1 ring-2 ring-background" style={{ left: x(hover!) / 8 + "%", top: pct(y(value), 240) }} />}
            <div className={cn(TIP, "top-1 flex min-w-32 flex-col gap-0.5", x(hover!) > 400 ? "-translate-x-[calc(100%+12px)]" : "translate-x-3")} style={{ left: x(hover!) / 8 + "%" }}>
              <strong className={cn(NUMERIC, "text-sm font-medium")}>{fmtTime(point.time, { blank: "DNF" })}</strong>
              {point.memoMs != null && <span className={cn(NUMERIC, "text-background/70")}>{tr("memo {0}", { 0: fmtTime(point.memoMs) })}</span>}
              {averages[hover!] != null && (
                <span className={cn(NUMERIC, "flex items-center gap-1.5 text-background/70")}>
                  <span className="h-0.5 w-3 rounded-full bg-chart-2" />
                  {averageLabel} {fmtTime(averages[hover!])}
                </span>
              )}
              <small className="text-xs text-background/70">
                #{hover! + 1} · {point.displayDate}
              </small>
              {tip && <small className="text-xs text-background/70">{tip(hover!)}</small>}
            </div>
          </>
        )}
      </div>
      <div className="relative col-start-2 h-4 text-xs text-muted-foreground" aria-label={tr("Visible period")}>
        {ticks.map(({ i, text }, k) => (
          <span key={i} className={cn("absolute whitespace-nowrap", k === 0 ? "" : k === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2")} style={{ left: pct(x(i), 800) }}>
            {text}
          </span>
        ))}
      </div>
      {xTitle && <span className="col-start-2 text-center text-xs font-bold text-muted-foreground">{xTitle}</span>}
    </div>
  );
}
