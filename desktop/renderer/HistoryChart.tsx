import { useEffect, useRef, useState } from "react";
import { fmtTime } from "../../src/client/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type ChartRange = [number, number];
type Entry = { time: number | null; displayDate: string };
type Drag = { pointer: number; start: number; end: number; range: ChartRange; pan: boolean };
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));

/** Inclusive solve bounds; retain the requested width when reaching either edge. */
function fitRange(start: number, width: number, last: number): ChartRange {
  const span = clamp(Math.round(width), Math.min(1, last), last);
  const first = clamp(Math.round(start), 0, last - span);
  return [first, first + span];
}

export function HistoryChart({ history, averages, range, onRange }: {
  history: Entry[];
  averages: (number | null)[];
  range: ChartRange;
  onRange: (range: ChartRange) => void;
}) {
  const plot = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [first, last] = range, end = history.length - 1;
  const zoomed = first > 0 || last < end;
  const span = Math.max(1, last - first);
  const visible = history.slice(first, last + 1);
  const all = [...visible.map(v => v.time), ...averages.slice(first, last + 1)]
    .filter((v): v is number => v != null && Number.isFinite(v));
  const low = all.length ? Math.min(...all) : 0;
  const high = Math.max(low + 1, all.length ? Math.max(...all) : 1);
  const lo = Math.max(0, low - (high - low) * 0.12);
  const height = high + (high - low) * 0.12 - lo;
  const x = (i: number) => history.length === 1 ? 400 : 6 + (i - first) / span * 788;
  const y = (v: number) => 12 + (1 - (v - lo) / height) * 202;
  const fraction = (clientX: number) => {
    const rect = plot.current!.getBoundingClientRect();
    return clamp(((clientX - rect.left) / rect.width * 800 - 6) / 788, 0, 1);
  };
  const index = (f: number) => clamp(Math.round(first + f * span), first, last);
  const change = (next: ChartRange) => { setHover(null); onRange(next); };
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
        change(fitRange(first + delta / element.clientWidth * span, span, end));
      } else {
        zoom(Math.exp(clamp(event.deltaY * unit, -400, 400) * 0.003), fraction(event.clientX));
      }
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [first, last, end, onRange]);

  const path = (series: (number | null)[]) => {
    let pen = false;
    return series.slice(first, last + 1).map((value, offset) => {
      if (value == null || !Number.isFinite(value)) { pen = false; return ""; }
      const command = `${pen ? "L" : "M"}${x(first + offset)} ${y(value)}`;
      pen = true;
      return command;
    }).join(" ");
  };
  const cancelDrag = () => { dragRef.current = null; setDrag(null); };
  const point = hover != null ? history[hover] : null;
  const value = point ? point.time ?? averages[hover!] : null;
  const selection = drag && !drag.pan ? [index(Math.min(drag.start, drag.end)), index(Math.max(drag.start, drag.end))] : null;
  return (
    <div className="grid min-h-40 flex-1 grid-cols-[auto_1fr] grid-rows-[1fr_auto] gap-x-3 gap-y-1.5">
      <div className="relative w-12" aria-hidden="true">
        {[0, 1, 2, 3].map(i => <span key={i} className="absolute right-0 -translate-y-1/2 font-mono text-[11px] text-muted-foreground tabular-nums" style={{ top: (12 + i / 3 * 202) / 240 * 100 + "%" }}>{fmtTime(lo + height * (1 - i / 3))}</span>)}
      </div>
      <div
        ref={plot}
        className={cn("chart-plot relative min-h-0 cursor-crosshair touch-none rounded-md outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50", drag?.pan && "cursor-grabbing")}
        tabIndex={0}
        role="group"
        aria-label="Solve times: scroll to zoom, drag to select a period, Shift-drag to pan, double-click to reset. Keyboard: plus or minus to zoom, arrows to pan, Home to reset."
        onDoubleClick={reset}
        onKeyDown={event => {
          if (!["+", "=", "-", "ArrowLeft", "ArrowRight", "Home", "Escape"].includes(event.key)) return;
          event.preventDefault();
          event.stopPropagation();
          if (event.key === "Escape") { cancelDrag(); setHover(null); }
          else if (event.key === "Home") reset();
          else if (event.key === "+" || event.key === "=") zoom(0.7, 0.5);
          else if (event.key === "-") zoom(1.5, 0.5);
          else change(fitRange(first + (event.key === "ArrowLeft" ? -1 : 1) * Math.max(1, Math.round(span * 0.2)), span, end));
        }}
        onPointerDown={event => {
          if (event.button !== 0 || dragRef.current) return;
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          const start = fraction(event.clientX);
          dragRef.current = { pointer: event.pointerId, start, end: start, range, pan: event.shiftKey };
          setDrag(dragRef.current);
          setHover(null);
        }}
        onPointerMove={event => {
          const f = fraction(event.clientX), current = dragRef.current;
          if (!current) { setHover(index(f)); return; }
          if (current.pointer !== event.pointerId) return;
          const next = { ...current, end: f };
          dragRef.current = next;
          setDrag(next);
          if (next.pan) {
            const width = next.range[1] - next.range[0];
            change(fitRange(next.range[0] + (next.start - f) * width, width, end));
          }
        }}
        onPointerUp={event => {
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
        <svg className="absolute inset-0 size-full overflow-visible" viewBox="0 0 800 240" preserveAspectRatio="none" role="img" aria-label="Single times and rolling average of five">
          {[0, 1, 2, 3].map(i => <path key={i} d={`M0 ${12 + i / 3 * 202} H800`} stroke="var(--border)" vectorEffect="non-scaling-stroke" />)}
          <path d={path(history.map(v => v.time))} fill="none" stroke="var(--chart-1)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
          <path d={path(averages)} fill="none" stroke="var(--chart-2)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
          {visible.map((v, i) => v.time != null && (visible.length < 40 || (history[first + i - 1]?.time == null && history[first + i + 1]?.time == null))
            ? <path key={i} d={`M${x(first + i)} ${y(v.time)}h0.01`} stroke="var(--chart-1)" strokeWidth="4.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" /> : null)}
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={240} stroke="var(--muted-foreground)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
          {selection && <rect x={x(selection[0])} y={0} width={Math.max(1, x(selection[1]) - x(selection[0]))} height={240} fill="color-mix(in oklch, var(--primary) 12%, transparent)" stroke="var(--primary)" vectorEffect="non-scaling-stroke" />}
        </svg>
        {zoomed && <Button variant="secondary" size="xs" className="absolute top-2 right-2" onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()} onClick={reset}>Reset zoom</Button>}
        {selection && <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md ring-1 ring-foreground/10">{history[selection[0]]?.displayDate} — {history[selection[1]]?.displayDate}</div>}
        {point && <>
          {value != null && <div className="pointer-events-none absolute size-2.5 -translate-1/2 rounded-full bg-chart-1 ring-2 ring-background" style={{ left: x(hover!) / 8 + "%", top: y(value) / 240 * 100 + "%" }} />}
          <div className={cn("pointer-events-none absolute top-1 flex min-w-32 flex-col gap-0.5 rounded-lg bg-popover px-2.5 py-2 text-popover-foreground shadow-md ring-1 ring-foreground/10", x(hover!) > 400 ? "-translate-x-[calc(100%+12px)]" : "translate-x-3")} style={{ left: x(hover!) / 8 + "%" }}>
            <strong className="font-mono text-sm font-medium tabular-nums">{fmtTime(point.time, { blank: "DNF" })}</strong>
            {averages[hover!] != null && <span className="font-mono text-xs text-chart-2 tabular-nums">Ao5 {fmtTime(averages[hover!])}</span>}
            <small className="text-xs text-muted-foreground">#{hover! + 1} · {point.displayDate}</small>
          </div>
        </>}
      </div>
      <div className="col-start-2 flex justify-between text-xs text-muted-foreground" aria-label="Visible period">
        <span>{history[first]?.displayDate}</span><span>{last !== first ? history[last]?.displayDate : ""}</span>
      </div>
    </div>
  );
}
