/** Solve statistics: the summary figures, the progress chart and the solves table. */
import React, { useState } from "react";
import { ArrowDownUp, ChartLine, ChevronDown, List, MessageSquare, Trash2 } from "lucide-react";
import { store as s } from "./store";
import { HistoryChart, type ChartRange } from "./HistoryChart";
import { fmtTime } from "../../src/client/lib/format";
import { ActionToggle, Button, Choice, Empty, Figure, MONO, SolveMenu, plural } from "./ui";
import { Stat, Stats } from "./profile/card";
import { Card } from "@/components/ui/card";
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

/** The summary figures: a card of their own on a page, plain figures inside a dialog (`compact`). */
function StatStrip({ summary, compact }: { summary: any; compact: boolean }) {
  const figures: [string, string, "" | "good" | "accent"][] = [
    ["Best single", fmtTime(summary.best), "good"],
    ["Best Ao5", fmtTime(summary.bestAo5), ""],
    ["Best Ao12", fmtTime(summary.bestAo12), ""],
    ["Current Ao5", fmtTime(summary.ao5), "accent"],
    ["Current Ao12", fmtTime(summary.ao12), "accent"],
    ["Mean", fmtTime(summary.mean), ""],
    ["Solves", summary.count.toLocaleString(), ""],
  ];
  return compact ? (
    <div className="grid shrink-0 grid-cols-4 gap-x-6 gap-y-4 lg:grid-cols-7">
      {figures.map(([label, value, tone]) => (
        <Figure key={label} label={label} value={value} tone={tone} size="base" />
      ))}
    </div>
  ) : (
    <Card className="shrink-0 gap-0 px-5 py-4" aria-label="Summary">
      <Stats columns={7}>
        {figures.map(([label, value, tone]) => (
          <Stat key={label} label={label} value={value} tone={tone || undefined} />
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
    <Card className="min-h-0 flex-1 gap-0 py-0">
      <div className="flex shrink-0 flex-wrap items-center gap-3 px-5 pt-4 pb-3">{toolbar}</div>
      <div className="flex min-h-0 flex-1 flex-col px-5 pb-5">{children}</div>
    </Card>
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
      <span className="text-sm text-muted-foreground">{zoomed ? `${count} of ${history.length} solves` : plural(count, "solve")}</span>
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
                  Single
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-3 rounded-full bg-chart-2" />
                  Ao5
                </span>
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
      label="View"
      value={s.statsView}
      options={[
        { id: "chart", label: <><ChartLine />Chart</> },
        { id: "table", label: <><List />Table</> },
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
              <DropdownMenuTrigger render={<UiButton variant="ghost" className="gap-1.5" aria-label="Sort solves" />}>
                <ArrowDownUp className="text-muted-foreground" />
                {SOLVE_SORTS.find((o) => o.id === sort)?.label}
                <ChevronDown className="text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto min-w-40">
                <DropdownMenuRadioGroup value={sort} onValueChange={(v: SolveSort) => setSort(v)}>
                  {SOLVE_SORTS.map((o) => (
                    <DropdownMenuRadioItem key={o.id} value={o.id} closeOnClick>
                      {o.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Toggle pressed={commented} onPressedChange={setCommented} aria-label="Show only commented solves" className="aria-pressed:text-foreground">
              <MessageSquare />
              <span className="max-md:hidden">Commented</span>
              <span className={cn(MONO, "text-xs text-muted-foreground")}>{commentCount}</span>
            </Toggle>
          </span>
        </>
      }
    >
      <div className={cn("solves-head grid shrink-0 items-center gap-4 border-b px-2 pb-2 text-xs font-medium text-muted-foreground", COLUMNS)}>
        <span className="text-right">#</span>
        <span>Time</span>
        <span className="max-md:hidden">Ao5</span>
        <span className="max-md:hidden">Ao12</span>
        <span className="max-md:hidden">Comment</span>
        <span>Date</span>
        <span className="w-28 max-md:hidden" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pt-1" key={`${range.join(":")}:${sort}:${commented}`}>
        {!rows.length && <Empty>{commented ? "No commented solve yet. Add one with the bubble on a time." : "No solves match."}</Empty>}
        {rows.slice(0, shown).map(({ v, index, pb }) => (
          <SolveMenu key={v.id} solve={{ ...v, time_ms: v.timeMs }}>
            <div className="history-row group/row rounded-md hover:bg-muted/60">
              <div className={cn("grid items-center gap-4 px-2", COLUMNS)}>
                <button
                  type="button"
                  data-action={"solve:" + v.id}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    void s.action("solve:" + v.id);
                  }}
                  className="col-span-6 grid h-9 grid-cols-subgrid items-center text-left outline-none max-md:col-span-3"
                >
                  <span className={cn(MONO, "text-right text-xs text-muted-foreground")}>{index + 1}</span>
                  <span className="flex items-center gap-2">
                    <span className={cn(MONO, "text-sm", v.time == null ? "text-destructive" : pb ? "text-success" : v.penalty === "+2" ? "text-warning" : "")}>
                      {v.time == null ? "DNF" : fmtTime(v.time)}
                    </span>
                    {pb && <span className="rounded-md bg-success/15 px-1.5 py-px text-[11px] font-medium text-success">PB</span>}
                    {v.penalty === "+2" && <span className="rounded-md bg-muted px-1.5 py-px text-[11px] font-medium text-muted-foreground">+2</span>}
                    {v.comment && <MessageSquare className="size-3 text-muted-foreground md:hidden" />}
                  </span>
                  <span className={cn(MONO, "text-xs text-muted-foreground max-md:hidden")}>{fmtTime(ao5[index])}</span>
                  <span className={cn(MONO, "text-xs text-muted-foreground max-md:hidden")}>{fmtTime(ao12[index])}</span>
                  <span className="truncate text-xs text-muted-foreground max-md:hidden">{v.comment}</span>
                  <span className="truncate text-xs text-muted-foreground">{v.displayDate}</span>
                </button>
                <span className="flex w-28 items-center justify-end opacity-0 max-md:hidden transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
                  <ActionToggle action={`penalty:${v.id}:+2`} pressed={v.penalty === "+2"} size="sm" className="h-6 min-w-0 px-1.5 text-xs text-muted-foreground">
                    +2
                  </ActionToggle>
                  <ActionToggle action={`penalty:${v.id}:dnf`} pressed={v.penalty === "dnf"} size="sm" className="h-6 min-w-0 px-1.5 text-xs text-muted-foreground">
                    DNF
                  </ActionToggle>
                  <Button action={"comment:" + v.id} icon={MessageSquare} size="icon-xs" label={v.comment ? "Edit comment" : "Add comment"} className={cn("text-muted-foreground", v.comment && "text-primary")} />
                  <Button action={"delete:" + v.id} icon={Trash2} size="icon-xs" label="Delete solve" className="text-muted-foreground hover:text-destructive" />
                </span>
              </div>
              {v.comment && <p className="-mt-1 pb-2 pl-[4.5rem] text-xs text-muted-foreground md:hidden">{v.comment}</p>}
            </div>
          </SolveMenu>
        ))}
        {rows.length > shown && (
          <UiButton variant="ghost" className="my-2 w-full text-muted-foreground" onClick={() => setShown(shown + SOLVE_PAGE)}>
            Show more ({rows.length - shown} left)
          </UiButton>
        )}
      </div>
    </Panel>
  );
}
