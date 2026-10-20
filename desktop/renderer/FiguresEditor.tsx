/**
 * The timer's band of figures, chosen by the player and edited where it stands: "Edit" (shown on hover) turns every
 * figure into a box to move, change or remove, and adds a box to add one; "change" opens a popover on the box to pick
 * its kind (and an average its size, current, best or worst).
 */
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChartLine, Check, Pencil, Plus } from "lucide-react";
import { averageFigure, FIGURE_LIMIT, figureLabel, figureRows, shownFigures } from "../../src/client/lib/practiceSummary";
import { attemptMode } from "../../src/shared/puzzles";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { store as s } from "./store";
import { FADE, FOCUS, StatCard, dots } from "./ui";
import { tr } from "../../src/client/i18n";
import { said } from "./base";
import { SolvesDialog } from "./stats";

/** A figure being edited, with motion (FigureBox.tsx): fetched once the band is edited, its tile shown meanwhile. */
const FigureBox = lazy(() => import("./FigureBox").then((m) => ({ default: m.FigureBox })));

/** An element's width, kept up to date as it resizes. */
export function useWidth(element: HTMLElement | null) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!element) return void setWidth(0);
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, [element]);
  return width;
}

/** The narrowest a figure's tile gets (used by the trainings' tiles). */
const FIGURE_WIDTH = 110;
/**
 * Columns for `count` boxes in `width`: as few rows as fit, then the boxes shared evenly between them (9 in a band of
 * 7 make rows of 5 and 4, not 7 and 2).
 */
export function balancedColumns(count: number, width: number, least = FIGURE_WIDTH) {
  const most = Math.max(1, Math.min(count, Math.floor(width / least))),
    rows = Math.ceil(count / most);
  return Math.max(1, Math.ceil(count / rows));
}
export const SINGLES = ["best", "worst", "mean", "median", "count", "memo"];
export const act = (action: string) => void s.action("figures:" + action);
/** A figure not shown yet: a single first, else an average of a common size. */
const unused = (ids: readonly string[]) =>
  SINGLES.find((id) => id !== "memo" && !ids.includes(id)) ?? [5, 12, 25, 50, 100, 200, 500, 1000].map((n) => averageFigure(n, "current")).find((id) => !ids.includes(id)) ?? "ao3";

/**
 * The timer's figures as tiles (at most `FIGURE_LIMIT`: one line up to 5, else two lines, every line filled), under a
 * row holding `actions` (the last solve's) and the band's own "Edit". Editing turns the tiles into boxes of the same
 * size to move, change or remove, with an "Add" tile at the end.
 */
export function FiguresBand({ actions }: { actions?: React.ReactNode }) {
  const [editing, setEditing] = useState(false),
    /** The figure being changed, by its id. */
    [open, setOpen] = useState<string | null>(null),
    /** The order while a figure is dragged: the others make room as it goes. */
    [order, setOrder] = useState<string[] | null>(null),
    /** Every solve of the event as a curve, in a dialog. */
    [chart, setChart] = useState(false),
    /** A key per box that follows its figure through changes of kind, so its popover stays open. */
    keys = useRef(new Map<string, number>()),
    serial = useRef(0),
    metrics = s.figuresShown(),
    // Fewest Moves and Multi-Blind show their own figures (shownFigures), not to edit.
    fixed = attemptMode(s.solveMode),
    figures = fixed ? shownFigures(s.solveMode, s.figures) : s.figures,
    byId = new Map(figures.map((id, i) => [id, metrics[i]!])),
    ids = order ?? figures,
    adding = editing && ids.length < FIGURE_LIMIT,
    colours = dots(ids.map((id) => byId.get(id)?.[2] ?? "")),
    rows = figureRows(ids.length, adding ? 1 : 0),
    // Several lines take the smaller tiles, so the timer keeps its room.
    size = rows.length > 1 ? "sm" : "lg";
  const finish = () => {
    setEditing(false);
    setOpen(null);
  };
  // A solve starting closes the editor: the band is the timer's again.
  useEffect(() => {
    if (s.running) finish();
  }, [s.running]);
  // Escape closes a box's popover first, then the editor.
  useEffect(() => {
    if (!editing || open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && finish();
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [editing, open]);
  /** The dragged figure goes where the pointer is, over another figure. */
  const dragOver = (id: string, x: number, y: number) => {
    const over = document
      .elementsFromPoint(x, y)
      .map((element) => element.closest<HTMLElement>("[data-figure]")?.dataset.figure)
      .find((figure) => figure && figure !== id);
    if (!over) return;
    setOrder((current) => {
      const list = [...(current ?? s.figures)],
        from = list.indexOf(id),
        to = list.indexOf(over);
      if (from < 0 || to < 0) return current;
      list.splice(to, 0, ...list.splice(from, 1));
      return list;
    });
  };
  /** The `i`th tile, on a line of `line` tiles. */
  const tile = (i: number, line: number) => {
    const id = ids[i],
      // A pixel short of its share, then grown to it: rounding never pushes a tile to the next line.
      style = { flex: `1 1 calc((100% - ${line - 1} * 0.75rem) / ${line} - 1px)` };
    if (id === undefined)
      return (
        <StatCard
          key="add"
          label="Add"
          value={<Plus className="inline size-[0.9em] align-[-0.1em] text-muted-foreground" />}
          dot="hidden"
          size={size}
          style={style}
          // Sized like the other tiles by its hidden label and value; "+ Add" centred over it.
          className="relative bg-transparent outline-1 -outline-offset-1 outline-border outline-dashed hover:bg-card [&>span]:invisible [&>strong]:invisible"
        >
          <button
            type="button"
            className={cn("absolute inset-0 flex items-center justify-center gap-2 rounded-[20px] text-sm font-semibold text-muted-foreground hover:text-foreground", FOCUS)}
            onClick={() => {
              const next = unused(s.figures);
              act("add:" + next);
              setOpen(next);
            }}
          >
            <Plus className="size-4" />
            {tr("Add")}
          </button>
        </StatCard>
      );
    const [label, value] = byId.get(id) ?? [figureLabel(id), "", ""];
    if (!keys.current.has(id)) keys.current.set(id, ++serial.current);
    const shown = <StatCard key={id} label={label} value={value} dot={colours[i]} size={size} style={style} />;
    return editing ? (
      <Suspense key={keys.current.get(id)} fallback={shown}>
        <FigureBox
          id={id}
          index={s.figures.indexOf(id)}
          label={said(label)}
          dot={colours[i]!}
          tileSize={size}
          style={style}
          open={open === id}
          onOpen={(next) => setOpen(next)}
          onChange={(next) => {
            // The key moves to the new figure: left on the old one too, a figure added again later would share it, and
            // React would keep a stale box of the editor on screen.
            keys.current.set(next, keys.current.get(id)!);
            keys.current.delete(id);
            setOpen(next);
          }}
          onDragStart={() => {
            setOpen(null);
            setOrder(s.figures);
          }}
          onDrag={(x, y) => dragOver(id, x, y)}
          onDragEnd={() => {
            if (order) act("order:" + order.join(","));
            setOrder(null);
          }}
        />
      </Suspense>
    ) : (
      shown
    );
  };
  return (
    <div className="group/stats relative flex shrink-0 flex-col gap-3" data-tour="session" data-no-timer={editing || undefined}>
      <div className={cn("flex gap-2", FADE)} data-no-timer>
        {actions}
        {!editing && <Button
          variant="ghost"
          size="icon"
          aria-label={tr("All solves")}
          title={tr("All solves")}
          data-action="figures:chart"
          onClick={() => setChart(true)}
          className="ml-auto shrink-0 bg-card text-muted-foreground hover:bg-muted"
        >
          <ChartLine />
        </Button>}
        {!fixed && <Button
          variant={editing ? "default" : "ghost"}
          size={editing ? "default" : "icon"}
          aria-label={editing ? undefined : tr("Edit the figures")}
          title={editing ? undefined : tr("Edit the figures")}
          data-action="figures:edit"
          onClick={() => (editing ? finish() : setEditing(true))}
          className={cn("shrink-0", editing ? "ml-auto" : "bg-card text-muted-foreground hover:bg-muted")}
        >
          {editing ? <Check data-icon="inline-start" /> : <Pencil />}
          {editing && tr("Done")}
        </Button>}
      </div>
      <SolvesDialog open={chart} onOpenChange={setChart} />
      {/* One wrapping line of siblings (so a dragged box keeps its place in the tree), each tile as wide as its line asks. */}
      <section aria-label={tr("Statistics")} className={cn("flex flex-wrap gap-3", FADE)}>
        {rows.flatMap((length, row) => Array.from({ length }, (_, j) => tile(rows.slice(0, row).reduce((a, b) => a + b, 0) + j, length)))}
      </section>
    </div>
  );
}
