import { useEffect, useMemo, useRef, useState } from "react";
import { fmtDate, fmtTime } from "../lib/format";
import type { HistoryPoint } from "../../shared/types";

/**
 * Time evolution for one case: single times (series 1) and rolling ao5 (series 2).
 * Line chart, hairline grid, crosshair + tooltip, table view toggle.
 */
const SERIES = {
  single: { label: "Single", color: "var(--accent)" },
  ao5: { label: "Ao5", color: "var(--series-2)" },
};

interface Props {
  history: HistoryPoint[];
  ao5: (number | null)[];
  height?: number;
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (!(max > min)) return [min];
  const span = max - min;
  const raw = span / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => span / s <= count + 1) ?? pow * 10;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

export function TimesChart({ history, ao5, height = 220 }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const pad = { l: 44, r: 16, t: 12, b: 26 };
  const W = Math.max(200, width);
  const H = height;
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const n = history.length;

  const { yMin, yMax, ticks } = useMemo(() => {
    const vals = [...history.map((h) => h.time), ...ao5].filter((v): v is number => v !== null).map((v) => v / 1000);
    if (!vals.length) return { yMin: 0, yMax: 1, ticks: [0, 1] };
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    if (hi === lo) {
      lo = Math.max(0, lo - 0.5);
      hi = hi + 0.5;
    }
    const margin = (hi - lo) * 0.12;
    const t = niceTicks(Math.max(0, lo - margin), hi + margin);
    return { yMin: Math.min(t[0], lo - margin), yMax: Math.max(t.at(-1)!, hi + margin), ticks: t };
  }, [history, ao5]);

  const x = (i: number) => pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (sec: number) => pad.t + ih - ((sec - yMin) / (yMax - yMin)) * ih;

  const path = (vals: (number | null)[]) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v / 1000).toFixed(1)} `;
      pen = true;
    });
    return d;
  };

  const singles = history.map((h) => h.time);
  const lastIdx = (vals: (number | null)[]) => {
    for (let i = vals.length - 1; i >= 0; i--) if (vals[i] !== null) return i;
    return -1;
  };

  if (n === 0) return <div className="empty">No solves yet — train this case to start a history.</div>;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = n <= 1 ? 0 : Math.round(((px - pad.l) / iw) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const hp = hover !== null ? history[hover] : null;
  const tipLeft = hover !== null ? Math.min(x(hover) + 12, W - 170) : 0;

  return (
    <div className="chart" ref={wrap} style={{ position: "relative" }}>
      <div className="chart-header">
        <div className="legend" aria-label="Legend">
          <span>
            <i style={{ background: SERIES.single.color }} /> {SERIES.single.label}
          </span>
          <span>
            <i style={{ background: SERIES.ao5.color }} /> {SERIES.ao5.label}
          </span>
        </div>
        <button className="btn ghost small" onClick={() => setTable((t) => !t)}>
          {table ? "Chart" : "Table"}
        </button>
      </div>
      {table ? (
        <div style={{ maxHeight: 280, overflow: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Time</th>
                <th>Ao5</th>
                <th>Best</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={h.id}>
                  <td>{i + 1}</td>
                  <td className="mono">{h.time === null ? "DNF" : fmtTime(h.time)}</td>
                  <td className="mono">{fmtTime(ao5[i])}</td>
                  <td className="mono">{fmtTime(h.best)}</td>
                  <td className="muted">{fmtDate(h.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label="Time evolution">
            <g className="grid">
              {ticks.map((t) => (
                <line key={t} x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
              ))}
            </g>
            {ticks.map((t) => (
              <text key={t} x={pad.l - 8} y={y(t) + 4} textAnchor="end">
                {t.toFixed(t < 10 ? 1 : 0)}
              </text>
            ))}
            <text x={pad.l} y={H - 8}>
              1
            </text>
            {n > 1 && (
              <text x={W - pad.r} y={H - 8} textAnchor="end">
                {n}
              </text>
            )}
            <path d={path(ao5)} fill="none" stroke={SERIES.ao5.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <path d={path(singles)} fill="none" stroke={SERIES.single.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {[
              [singles, SERIES.single.color],
              [ao5, SERIES.ao5.color],
            ].map(([vals, color], k) => {
              const li = lastIdx(vals as (number | null)[]);
              if (li < 0) return null;
              const v = (vals as number[])[li];
              return <circle key={k} cx={x(li)} cy={y(v / 1000)} r={4} fill={color as string} stroke="var(--surface)" strokeWidth={2} />;
            })}
            {hover !== null && (
              <g>
                <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} />
                {hp?.time !== null && hp && <circle cx={x(hover)} cy={y(hp.time / 1000)} r={5} fill={SERIES.single.color} stroke="var(--surface)" strokeWidth={2} />}
                {ao5[hover] !== null && <circle cx={x(hover)} cy={y(ao5[hover]! / 1000)} r={5} fill={SERIES.ao5.color} stroke="var(--surface)" strokeWidth={2} />}
              </g>
            )}
          </svg>
          {hp && (
            <div className="tooltip" style={{ left: tipLeft, top: pad.t }}>
              <div className="row">
                <i style={{ background: SERIES.single.color }} />
                <b>{hp.time === null ? "DNF" : fmtTime(hp.time)}</b> <span className="muted">single #{hover! + 1}</span>
              </div>
              {ao5[hover!] !== null && (
                <div className="row">
                  <i style={{ background: SERIES.ao5.color }} />
                  <b>{fmtTime(ao5[hover!])}</b> <span className="muted">ao5</span>
                </div>
              )}
              <div className="muted" style={{ marginTop: 4 }}>
                {fmtDate(hp.at)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
