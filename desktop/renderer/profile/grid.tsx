/**
 * The profile's overview on the desktop: the activity's figures and its last weeks on a band, then the records as a
 * grid of the events played by their scramble types (normal first, the most played after, the rest under "Other").
 * A cell opens its statistics.
 */
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { store as s } from "../store";
import { FOCUS, Icon, NUMERIC, Segmented, Surface, run, useViewport } from "../ui";
import { cn } from "@/lib/utils";
import { EVENTS, attemptMode, scrambleTypesOf, type PuzzleInput } from "../../../src/shared/puzzles";
import { fmtResult, fmtTime } from "../../../src/client/lib/format";
import { HEAT_LEVELS, heatDays, heatmap } from "../../../src/client/lib/profile";
import type { EventRecordDto } from "../../../src/shared/types";
import type { ProfileData } from "./data";
import { tr } from "../../../src/client/i18n";
import { said } from "../base";

/** The weeks of activity the band shows. */
const WEEKS = 18;

/** The activity: the streak, this week, every solve, the active days; then a square per day of the last weeks. */
export function ActivityBand({ d }: { d: ProfileData }) {
  const graph = useMemo(() => heatmap(heatDays(d.activity), null), [d.activity]),
    cells = graph.cells.slice(-WEEKS * 7),
    figures: [string, string, string, string?][] = [
      [tr("Streak"), tr("{0} d", { 0: d.streak.current }), tr("record {0}", { 0: d.streak.longest }), "text-warning"],
      [tr("This week"), d.week.toLocaleString(), tr("solves")],
      [tr("In all"), d.activity.length.toLocaleString(), tr("{0} training", { 0: d.trainingSolves.toLocaleString() })],
      [tr("Active days"), d.days.toLocaleString(), tr("{0} cases learned", { 0: d.learned.toLocaleString() })],
    ];
  return (
    <Surface aria-label={tr("Activity")} className="flex shrink-0 flex-row items-center gap-5 px-6 py-4 xl:gap-8">
      {figures.map(([label, value, sub, tone]) => (
        <div key={label} className="flex min-w-0 flex-col">
          <span className="truncate text-[11px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">{label}</span>
          <b className={cn(NUMERIC, "truncate text-[26px] leading-tight font-extrabold tracking-[-0.03em]", tone)}>{value}</b>
          <span className="truncate text-xs font-semibold text-muted-foreground">{sub}</span>
        </div>
      ))}
      <div className="ml-auto grid grid-flow-col grid-rows-7 gap-[3px] max-xl:hidden" aria-hidden="true">
        {cells.map((c) => (
          <i key={c.key} className={cn("size-[11px] rounded-[3px]", c.hidden ? "bg-transparent" : HEAT_LEVELS[graph.level(c.count)])} />
        ))}
      </div>
    </Surface>
  );
}

type Metric = "single" | "ao5" | "ao12" | "ao100";
const METRICS: { id: Metric; label: string }[] = [
  { id: "single", label: "Single" },
  { id: "ao5", label: "Ao5" },
  { id: "ao12", label: "Ao12" },
  { id: "ao100", label: "Ao100" },
];
const valueOf = (r: EventRecordDto, metric: Metric) => (metric === "single" ? r.best : attemptMode(r.solveMode) ? null : metric === "ao5" ? r.bestAo5 : metric === "ao12" ? r.bestAo12 : r.bestAo100);
const shownValue = (r: EventRecordDto, metric: Metric) => {
  const v = valueOf(r, metric);
  return v == null ? "–" : metric === "single" ? fmtResult(v, r.solveMode) : fmtTime(v);
};
/** The scramble types given their own column besides normal, as the window allows. */
const columnsFor = (width: number) => (width >= 1536 ? 3 : width >= 1280 ? 2 : 1);

/** The records of every event played, by scramble type. */
export function RecordGrid({ d }: { d: ProfileData }) {
  const [metric, setMetric] = useState<Metric>("single"),
    width = useViewport().w,
    played = d.records.filter((r) => r.count > 0 || r.best != null),
    events = EVENTS.filter((e) => played.some((r) => r.event === e.id)),
    // The scramble types most played across events, after normal; the others share the last column.
    totals = new Map<string, number>();
  for (const r of played) if (r.scrambleType !== "normal") totals.set(r.scrambleType, (totals.get(r.scrambleType) ?? 0) + r.count);
  const own = [...totals].sort((a, b) => b[1] - a[1]).slice(0, columnsFor(width)).map(([id]) => id),
    other = [...totals.keys()].some((id) => !own.includes(id)),
    columns = ["normal", ...own],
    current = s.event(s.profilePuzzle, s.profileSolveMode).id;
  const cell = (event: (typeof EVENTS)[number], type: string | null) => {
    const types = scrambleTypesOf(event.puzzle as PuzzleInput, event.solveMode) as string[],
      // "Other": the most played of the remaining types.
      r = type ? played.find((v) => v.event === event.id && v.scrambleType === type) : played.filter((v) => v.event === event.id && v.scrambleType !== "normal" && !own.includes(v.scrambleType)).sort((a, b) => b.count - a.count)[0],
      key = event.id + ":" + (type ?? "other");
    if (!r && (!type || !types.includes(type))) return <span key={key} className="flex items-center px-3 text-muted-foreground/50" aria-hidden="true">–</span>;
    const action = `profileView:playground|${event.id}|${r?.scrambleType ?? type}`,
      chosen = event.id === current && (r?.scrambleType ?? type) === s.profileScramble,
      // Under the value, the other figure (the Ao5 under a single, the single under an average); "Other" names its type.
      sub = r && (!type ? said(s.label("scrambles", r.scrambleType)) : metric === "single" ? (r.bestAo5 != null && !attemptMode(r.solveMode) ? tr("Ao5 {0}", { 0: fmtTime(r.bestAo5) }) : "") : r.best != null ? fmtResult(r.best, r.solveMode) : "");
    return (
      <button
        key={key}
        type="button"
        data-action={action}
        onClick={run(action)}
        aria-label={`${said(event.label)} · ${said(s.label("scrambles", r?.scrambleType ?? type!))}${r ? ` · ${r.count.toLocaleString()}` : ` · ${tr("Not played yet")}`}`}
        aria-current={chosen ? "true" : undefined}
        className={cn(
          "flex min-w-0 flex-col justify-center rounded-[14px] px-3 py-2 text-left transition-colors",
          r ? "bg-muted hover:bg-accent" : "items-center border-[1.5px] border-dashed border-border text-muted-foreground/60 hover:bg-muted hover:text-foreground",
          chosen && "ring-2 ring-primary",
          FOCUS,
        )}
      >
        {r ? (
          <>
            <b className={cn(NUMERIC, "text-lg leading-tight font-extrabold tracking-[-0.02em]")}>{shownValue(r, metric)}</b>
            <span className={cn(NUMERIC, "truncate text-xs font-semibold text-muted-foreground")}>{sub}</span>
          </>
        ) : (
          <Plus className="size-4" />
        )}
      </button>
    );
  };
  return (
    <Surface aria-label={tr("Personal bests")} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 px-6 py-5">
      <div className="flex min-h-9 shrink-0 items-center gap-3">
        <h2 className="text-lg font-extrabold tracking-[-0.02em]">{tr("Records")}</h2>
        <span className="truncate text-sm font-semibold text-muted-foreground max-xl:hidden">{tr("by event and scramble")}</span>
        <Segmented label="Record" value={metric} onChange={(id) => setMetric(id as Metric)} action="profileMetric:" options={METRICS} className="ml-auto bg-muted/60" />
      </div>
      {events.length ? (
        <div className="-mr-2 min-h-0 overflow-y-auto pr-2">
          <div className="grid auto-rows-[3.6rem] grid-rows-[auto] gap-1.5" style={{ gridTemplateColumns: `minmax(0,8.5rem) repeat(${columns.length + Number(other)}, minmax(0,1fr))` }}>
            <span />
            {[...columns.map((id) => s.label("scrambles", id)), ...(other ? ["Other"] : [])].map((label) => (
              <span key={label} className="line-clamp-2 self-end px-3 text-[11px] leading-tight font-extrabold tracking-[0.06em] text-muted-foreground uppercase">
                {said(label)}
              </span>
            ))}
            {events.map((e) => (
              <div key={e.id} className="contents">
                <span className="flex min-w-0 items-center gap-2.5 pr-2 text-sm font-extrabold">
                  <Icon name={"Puzzle" + e.id} size={22} />
                  <span className="truncate">{said(e.label)}</span>
                </span>
                {columns.map((type) => cell(e, type))}
                {other && cell(e, null)}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{tr("No times yet")}</p>
      )}
    </Surface>
  );
}
