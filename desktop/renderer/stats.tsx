/** Solve statistics: the summary figures, the progress chart and the solves table. */
import React, { useState } from "react";
import { ArrowDownUp, ChartLine, ChevronDown, List, MessageSquare, Rotate3d } from "lucide-react";
import { store as s } from "./store";
import { HistoryChart, type ChartRange } from "./HistoryChart";
import { fmtTime } from "../../src/client/lib/format";
import { timerFigures } from "../../src/client/lib/practiceSummary";
import { Choice, Empty, Figure, NUMERIC, SolveActions, SolveMenu, plural, run } from "./ui";
import { PageCard, Stats } from "./profile/card";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { tr } from "../../src/client/i18n";
import { said } from "./base";

/** The summary figures: a card of their own on a page, plain figures inside a dialog (`compact`). */
function StatStrip({ summary, compact }: { summary: any; compact: boolean }) {
  const figures = timerFigures(summary);
  return compact ? (
    <div className="grid shrink-0 grid-cols-4 gap-x-6 gap-y-4 lg:grid-cols-7">
      {figures.map(([label, value, tone]) => (
        <Figure key={label} label={said(label)} value={value} tone={tone} />
      ))}
    </div>
  ) : (
    <Card className="shrink-0 gap-0 px-5 py-4" aria-label={tr("Summary")}>
      <Stats columns={7}>
        {figures.map(([label, value, tone]) => (
          <Figure key={label} label={said(label)} value={value} tone={tone} caption="plain" size="xl" />
        ))}
      </Stats>
    </Card>
  );
}

/** The chart or the table: a card of its own on a page, its toolbar on top; bare inside a dialog. */
function Panel({ compact, toolbar, children }: { compact: boolean; toolbar: React.ReactNode; children: React.ReactNode }) {
  return compact ? (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">{toolbar}</div>
      {children}
    </div>
  ) : (
    <PageCard toolbar={toolbar} scroll={false}>
      {children}
    </PageCard>
  );
}

/** #, time, Ao5, Ao12, comment, date and the actions; phones keep #, time and date. */
const COLUMNS = "grid-cols-[3.5rem_7rem_5.5rem_5.5rem_minmax(0,1fr)_8rem_auto] max-md:grid-cols-[2.5rem_minmax(0,1fr)_auto]";

type SolveSort = "newest" | "oldest" | "fastest" | "slowest";

const SOLVE_SORTS: { id: SolveSort; label: string }[] = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "fastest", label: "Fastest first" },
  { id: "slowest", label: "Slowest first" },
];

/** Rows drawn before the table asks for more; long timer histories stay light. */
const SOLVE_PAGE = 100;

/** Solve statistics with a shared visible period for the chart and history. */
export function TimerStats({ data, empty, compact = false }: { data: any; empty: React.ReactNode; compact?: boolean }) {
  // The table order and filter survive the remount that follows a deleted solve.
  const [sort, setSort] = useState<SolveSort>("newest"),
    [commented, setCommented] = useState(false);
  if (!data?.summary?.count)
    return compact ? (
      <Empty className="flex-none items-start p-0 py-1 text-left">{empty}</Empty>
    ) : (
      <Card className="min-h-0 flex-1 gap-0 py-0">
        <Empty>{empty}</Empty>
      </Card>
    );
  const history = data.history ?? [];
  return (
    <TimerStatsView
      key={`${history[0]?.id}:${history.at(-1)?.id}:${history.length}`}
      data={data}
      compact={compact}
      table={{ sort, setSort, commented, setCommented }}
    />
  );
}

type SolveTableState = {
  sort: SolveSort;
  setSort: (sort: SolveSort) => void;
  commented: boolean;
  setCommented: (commented: boolean) => void;
};

function TimerStatsView({ data, compact, table }: { data: any; compact: boolean; table: SolveTableState }) {
  const history: any[] = data.history ?? [];
  const [range, setRange] = useState<ChartRange>([0, history.length - 1]);
  const zoomed = range[0] > 0 || range[1] < history.length - 1,
    count = range[1] - range[0] + 1,
    total = (
      <span className="text-sm text-muted-foreground">{zoomed ? tr("{0} of {1} solves", { 0: count, 1: history.length }) : plural(count, "solve")}</span>
    );
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", compact ? "gap-5" : "gap-4")}>
      <StatStrip summary={data.summary} compact={compact} />
      {s.statsView === "table" ? (
        <SolvesTable history={history} ao5={data.ao5 ?? []} ao12={data.ao12 ?? []} range={range} total={total} compact={compact} {...table} />
      ) : (
        <Panel
          compact={compact}
          toolbar={
            <>
              <StatsViewToggle />
              {total}
              <span className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-3 rounded-full bg-chart-1" />
                  {tr("Single")}</span>
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-3 rounded-full bg-chart-2" />
                  {tr("Ao5")}</span>
              </span>
            </>
          }
        >
          <HistoryChart history={history} averages={data.ao5 ?? []} range={range} onRange={setRange} />
        </Panel>
      )}
    </div>
  );
}

/** Chart or table: the solves of the period drawn over time, or listed with their actions. */
function StatsViewToggle() {
  return (
    <Choice
      prefix="statsView:"
      label={tr("View")}
      value={s.statsView}
      options={[
        { id: "chart", label: <><ChartLine />{tr("Chart")}</> },
        { id: "table", label: <><List />{tr("Table")}</> },
      ]}
    />
  );
}

/** Every solve of the visible period, sorted as asked; right-click a row for its menu. */
function SolvesTable({
  history,
  ao5,
  ao12,
  range,
  total,
  compact,
  sort,
  setSort,
  commented,
  setCommented,
}: { history: any[]; ao5: (number | null)[]; ao12: (number | null)[]; range: ChartRange; total: React.ReactNode; compact: boolean } & SolveTableState) {
  const [shown, setShown] = useState(SOLVE_PAGE);
  const byTime = (a: any, b: any, direction: 1 | -1) =>
    a.time == null ? (b.time == null ? 0 : 1) : b.time == null ? -1 : (a.time - b.time) * direction;
  const rows = history
    .slice(range[0], range[1] + 1)
    .map((v, i) => {
      const index = range[0] + i,
        previous = history[index - 1];
      return {
        v,
        index,
        pb: v.time != null && v.time === v.best && (!previous || previous.best == null || previous.best > v.time),
      };
    })
    .filter((r) => !commented || r.v.comment);
  if (sort === "newest") rows.reverse();
  else if (sort === "fastest") rows.sort((a, b) => byTime(a.v, b.v, 1) || b.index - a.index);
  else if (sort === "slowest") rows.sort((a, b) => byTime(a.v, b.v, -1) || b.index - a.index);
  const commentCount = history.filter((v) => v.comment).length;
  return (
    <Panel
      compact={compact}
      toolbar={
        <>
          <StatsViewToggle />
          {total}
          <span className="ml-auto flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger render={<UiButton variant="ghost" className="gap-1.5" aria-label={tr("Sort solves")} />}>
                <ArrowDownUp className="text-muted-foreground" />
                {said(SOLVE_SORTS.find((o) => o.id === sort)?.label)}
                <ChevronDown className="text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto min-w-40">
                <DropdownMenuRadioGroup value={sort} onValueChange={(v: SolveSort) => setSort(v)}>
                  {SOLVE_SORTS.map((o) => (
                    <DropdownMenuRadioItem key={o.id} value={o.id} closeOnClick>
                      {said(o.label)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Toggle pressed={commented} onPressedChange={setCommented} aria-label={tr("Show only commented solves")} className="aria-pressed:text-foreground">
              <MessageSquare />
              <span className="max-md:hidden">{tr("Commented")}</span>
              <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>{commentCount}</span>
            </Toggle>
          </span>
        </>
      }
    >
      <div className={cn("solves-head grid shrink-0 items-center gap-4 border-b px-2 pb-2 text-xs font-medium text-muted-foreground", COLUMNS)}>
        <span className="text-right">#</span>
        <span>{tr("Time")}</span>
        <span className="max-md:hidden">{tr("Ao5")}</span>
        <span className="max-md:hidden">{tr("Ao12")}</span>
        <span className="max-md:hidden">{tr("Comment")}</span>
        <span>{tr("Date")}</span>
        <span className="w-28 max-md:hidden" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pt-1" key={`${range.join(":")}:${sort}:${commented}`}>
        {!rows.length && <Empty>{commented ? tr("No commented solve yet. Add one with the bubble on a time.") : tr("No solves match.")}</Empty>}
        {rows.slice(0, shown).map(({ v, index, pb }) => {
          // A case done during a smart cube solve opens that solve; its time is the case's, so it has no actions.
          const open = "solve:" + (v.solveId ?? v.id),
            row = (
            <div className="history-row group/row rounded-md hover:bg-muted/60">
              <div className={cn("grid items-center gap-4 px-2", COLUMNS)}>
                <button
                  type="button"
                  data-action={open}
                  onClick={run(open)}
                  className="col-span-6 grid h-9 grid-cols-subgrid items-center text-left outline-none max-md:col-span-3"
                >
                  <span className={cn(NUMERIC, "text-right text-xs text-muted-foreground")}>{index + 1}</span>
                  <span className="flex items-center gap-2">
                    <span className={cn(NUMERIC, "text-sm", v.time == null ? "text-destructive" : pb ? "text-success" : v.penalty === "+2" ? "text-warning" : "")}>
                      {fmtTime(v.time, { blank: "DNF" })}
                    </span>
                    {pb && <span className="rounded-md bg-success/15 px-1.5 py-px text-[11px] font-medium text-success">{tr("PB")}</span>}
                    {v.penalty === "+2" && <span className="rounded-md bg-muted px-1.5 py-px text-[11px] font-medium text-muted-foreground">+2</span>}
                    {v.solveId !== undefined ? (
                      <Badge variant="secondary" className="h-5 gap-1 px-1.5 text-[11px] text-muted-foreground" title={tr("Done during a solve on a connected cube")}>
                        <Rotate3d />
                        {tr("In solve")}</Badge>
                    ) : (
                      v.smart && <Rotate3d className="size-3 text-muted-foreground" aria-label={tr("Turned on a connected cube")} />
                    )}
                    {v.comment && <MessageSquare className="size-3 text-muted-foreground md:hidden" />}
                  </span>
                  <span className={cn(NUMERIC, "text-xs text-muted-foreground max-md:hidden")}>{fmtTime(ao5[index])}</span>
                  <span className={cn(NUMERIC, "text-xs text-muted-foreground max-md:hidden")}>{fmtTime(ao12[index])}</span>
                  <span className="truncate text-xs text-muted-foreground max-md:hidden">{v.comment}</span>
                  <span className="truncate text-xs text-muted-foreground">{v.displayDate}</span>
                </button>
                {v.solveId === undefined ? <SolveActions solve={v} comment className="w-28 justify-end max-md:hidden" /> : <span className="w-28 max-md:hidden" />}
              </div>
              {v.comment && <p className="-mt-1 pb-2 pl-[4.5rem] text-xs text-muted-foreground md:hidden">{v.comment}</p>}
            </div>
          );
          return v.solveId === undefined ? (
            <SolveMenu key={v.id} solve={{ ...v, time_ms: v.timeMs }}>
              {row}
            </SolveMenu>
          ) : (
            <div key={v.id}>{row}</div>
          );
        })}
        {rows.length > shown && (
          <UiButton variant="ghost" className="my-2 w-full text-muted-foreground" onClick={() => setShown(shown + SOLVE_PAGE)}>
            {tr("Show more ({0} left)", { 0: rows.length - shown })}</UiButton>
        )}
      </div>
    </Panel>
  );
}
