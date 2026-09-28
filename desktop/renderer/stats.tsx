/** Solve statistics: summary tiles, the progress chart and the solves table. */
import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { store as s } from "./store";
import { HistoryChart, type ChartRange } from "./HistoryChart";
import { fmtTime } from "../../src/client/lib/format";
import { Button, Empty, Icon, Row, plural } from "./ui";
function StatStrip({ summary }: { summary: any }) {
  return (
    <div className="stat-strip">
      {[
        ["Best", fmtTime(summary.best), "accent"],
        ["Ao5", fmtTime(summary.ao5), ""],
        ["Ao12", fmtTime(summary.ao12), ""],
        ["Mean", fmtTime(summary.mean), ""],
        ["Best Ao5", fmtTime(summary.bestAo5), ""],
        ["Best Ao12", fmtTime(summary.bestAo12), ""],
        ["Solves", String(summary.count), ""],
      ].map(([label, value, cls]) => (
        <div key={label} className="stat-tile">
          <small className="muted">{label}</small>
          <span className={"mono " + cls}>{value}</span>
        </div>
      ))}
    </div>
  );
}

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
export function TimerStats({
  data,
  empty,
  compact = false,
}: {
  data: any;
  empty: React.ReactNode;
  compact?: boolean;
}) {
  // The table order and filter survive the remount that follows a deleted solve.
  const [sort, setSort] = useState<SolveSort>("newest"),
    [commented, setCommented] = useState(false);
  if (!data?.summary?.count) return <Empty>{empty}</Empty>;
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
    total = <span className="muted solves-count">{zoomed ? `${count} of ${history.length} solves` : plural(count, "solve")}</span>;
  return (
    <div className={"stats " + (compact ? "compact" : "")}>
      <StatStrip summary={data.summary} />
      <div className="stats-grid">
        {s.statsView === "table" ? (
          <SolvesTable history={history} range={range} total={total} {...table} />
        ) : (
          <div className="panel chart-panel">
            <Row className="between">
              <Row>
                <StatsViewToggle />
                {total}
              </Row>
              <Row className="chart-legend">
                <span className="accent">━ Single</span>
                <span style={{ color: "var(--series)" }}>━ Ao5</span>
              </Row>
            </Row>
            <HistoryChart history={history} averages={data.ao5 ?? []} range={range} onRange={setRange} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Chart or table: the solves of the period drawn over time, or listed with their actions. */
function StatsViewToggle() {
  const id = useId();
  return (
    <Row className="stats-view-toggle">
      {[
        ["chart", "Chart", "IconChart"],
        ["table", "Table", "IconGrid"],
      ].map(([view, label, icon]) => (
        <Button key={view} action={"statsView:" + view} active={s.statsView === view} highlight={"stats-view" + id} icon={icon} title={label}>
          <span className="stats-view-label">{label}</span>
        </Button>
      ))}
    </Row>
  );
}

/** Every solve of the visible period, sorted as asked, each with its penalty, comment and delete buttons. */
function SolvesTable({
  history,
  range,
  total,
  sort,
  setSort,
  commented,
  setCommented,
}: { history: any[]; range: ChartRange; total: React.ReactNode } & SolveTableState) {
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
    <div className="panel history-panel">
      <Row className="between solves-bar">
        <Row>
          <StatsViewToggle />
          {total}
        </Row>
        <Row>
          <LocalSelect label="Sort solves" value={sort} options={SOLVE_SORTS} onChange={setSort} />
          <button
            type="button"
            className={"button " + (commented ? "soft" : "")}
            aria-pressed={commented}
            aria-label="Show only commented solves"
            title="Show only commented solves"
            onClick={(e) => {
              e.currentTarget.blur();
              setCommented(!commented);
            }}
          >
            <Icon name="IconComment" size={14} />
            <span className="solves-label">Commented</span>
            <span className="mono muted">{commentCount}</span>
          </button>
        </Row>
      </Row>
      <div className="solves-head muted">
        <span>#</span>
        <span>Time</span>
        <span>Date</span>
        <span>Actions</span>
      </div>
      <div className="scroll history-solves" key={`${range.join(":")}:${sort}:${commented}`}>
        {!rows.length && (
          <Empty>{commented ? "No commented solve yet. Add one with the bubble on a time." : "No solves match."}</Empty>
        )}
        {rows.slice(0, shown).map(({ v, index, pb }) => (
          <div key={v.id} className="solve-row">
            <button
              type="button"
              className="button history-row"
              title="Show the scramble and details"
              onClick={() => void s.action("solve:" + v.id)}
            >
              <span className="muted">{index + 1}</span>
              <span className={"mono " + (v.time == null ? "danger" : pb ? "accent" : "")}>
                {v.time == null ? "DNF" : fmtTime(v.time)}
              </span>
              <span className="history-tags">
                {pb && <span className="tag">PB</span>}
                {v.penalty === "+2" && <span className="tag muted">+2</span>}
              </span>
              <span className="muted">{v.displayDate}</span>
            </button>
            <span className="solve-row-actions">
              <Button action={`penalty:${v.id}:+2`} className={v.penalty === "+2" ? "soft" : ""} title="+2 penalty">
                +2
              </Button>
              <Button action={`penalty:${v.id}:dnf`} className={v.penalty === "dnf" ? "soft" : ""} title="Did not finish">
                DNF
              </Button>
              <Button
                action={"comment:" + v.id}
                icon="IconComment"
                className={v.comment ? "accent" : ""}
                title={v.comment ? "Edit comment" : "Add comment"}
              />
              <Button action={"delete:" + v.id} icon="IconTrash" className="danger" title="Delete solve" />
            </span>
            {v.comment && <p className="solve-comment">{v.comment}</p>}
          </div>
        ))}
        {rows.length > shown && (
          <button type="button" className="button solves-more" onClick={() => setShown(shown + SOLVE_PAGE)}>
            Show more ({rows.length - shown} left)
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * A select menu held by its component rather than the app overlay, so it can open inside a dialog
 * without replacing it. It looks and moves like the app's select menus.
 */
function LocalSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null),
    [anchor, setAnchor] = useState<DOMRect | null>(null),
    [index, setIndex] = useState(0);
  const pick = (id: T) => {
    setAnchor(null);
    onChange(id);
  };
  useEffect(() => {
    if (!anchor) return;
    // Captured before the app overlay's listener, so Escape does not also close a surrounding dialog.
    const key = (e: KeyboardEvent) => {
      if (!["Escape", "ArrowDown", "ArrowUp", "Home", "End", "Enter"].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") setAnchor(null);
      else if (e.key === "Enter") pick(options[index].id);
      else
        setIndex((i) =>
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? options.length - 1
              : (i + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length,
        );
    };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  }, [anchor, index]);
  const host = trigger.current?.closest(".app"),
    height = options.length * 42 + 18,
    below = anchor && anchor.bottom + 6 + height <= innerHeight - 12;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="button active"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={!!anchor}
        onClick={(e) => {
          e.currentTarget.blur();
          setIndex(Math.max(0, options.findIndex((o) => o.id === value)));
          setAnchor(anchor ? null : e.currentTarget.getBoundingClientRect());
        }}
      >
        {options.find((o) => o.id === value)?.label}
        <Icon name="IconChevronDown" size={12} />
      </button>
      {anchor &&
        host &&
        createPortal(
          <div className="menu-backdrop local-menu" onClick={() => setAnchor(null)}>
            <div
              className="select-menu"
              role="listbox"
              aria-label={label}
              style={{
                left: Math.min(innerWidth - 292, Math.max(12, anchor.right - 280)),
                top: below ? anchor.bottom + 6 : Math.max(12, anchor.y - height - 6),
                transformOrigin: below ? "top right" : "bottom right",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {options.map((o, i) => (
                <button
                  key={o.id}
                  type="button"
                  role="option"
                  aria-selected={o.id === value}
                  style={{ "--i": i } as React.CSSProperties}
                  className={"button menu-option " + (index === i ? "active" : "")}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => pick(o.id)}
                >
                  <span>{o.label}</span>
                  {o.id === value && <Icon name="IconCheck" />}
                </button>
              ))}
            </div>
          </div>,
          host,
        )}
    </>
  );
}
