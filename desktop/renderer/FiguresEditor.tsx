/**
 * The timer's band of figures, chosen by the player and edited where it stands: "Edit" (shown on hover) turns every
 * figure into a box to move, change or remove, and adds a box to add one; "change" opens a popover on the box to pick
 * its kind (and an average its size, current, best or worst).
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { motion, useDragControls } from "motion/react";
import { averageFigure, AVERAGE_SIZES, FIGURE_LIMIT, figureLabel, figureRows, parseFigure } from "../../src/client/lib/practiceSummary";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { store as s } from "./store";
import { FADE, FOCUS, NUMERIC, StatCard, dots } from "./ui";
import { tr } from "../../src/client/i18n";
import { said } from "./base";

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
const SINGLES = ["best", "worst", "mean", "median", "count", "memo"];
const WHICH = [
  { id: "current", label: "Current" },
  { id: "best", label: "Best" },
  { id: "worst", label: "Worst" },
] as const;
const act = (action: string) => void s.action("figures:" + action);
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
    /** A key per box that follows its figure through changes of kind, so its popover stays open. */
    keys = useRef(new Map<string, number>()),
    serial = useRef(0),
    metrics = s.figuresShown(),
    byId = new Map(s.figures.map((id, i) => [id, metrics[i]!])),
    ids = order ?? s.figures,
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
    return editing ? (
      <FigureBox
        key={keys.current.get(id)}
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
    ) : (
      <StatCard key={id} label={label} value={value} dot={colours[i]} size={size} style={style} />
    );
  };
  return (
    <div className="group/stats relative flex shrink-0 flex-col gap-3" data-tour="session" data-no-timer={editing || undefined}>
      <div className={cn("flex gap-2", FADE)} data-no-timer>
        {actions}
        <Button
          variant={editing ? "default" : "ghost"}
          size={editing ? "default" : "icon"}
          aria-label={editing ? undefined : tr("Edit the figures")}
          title={editing ? undefined : tr("Edit the figures")}
          data-action="figures:edit"
          onClick={() => (editing ? finish() : setEditing(true))}
          className={cn("shrink-0", !editing && "bg-card text-muted-foreground hover:bg-muted")}
        >
          {editing ? <Check data-icon="inline-start" /> : <Pencil />}
          {editing && tr("Done")}
        </Button>
      </div>
      {/* One wrapping line of siblings (so a dragged box keeps its place in the tree), each tile as wide as its line asks. */}
      <section aria-label={tr("Statistics")} className={cn("flex flex-wrap gap-3", FADE)}>
        {rows.flatMap((length, row) => Array.from({ length }, (_, j) => tile(rows.slice(0, row).reduce((a, b) => a + b, 0) + j, length)))}
      </section>
    </div>
  );
}

/**
 * A figure of the band while editing, a tile of the same size: its name above, and where its value stands a handle to
 * drag it elsewhere, "change" (a popover to pick its kind) and "remove". It slides to its new place when the order
 * changes (motion's layout animation).
 */
function FigureBox({
  id,
  index,
  label,
  dot,
  tileSize,
  style,
  open,
  onOpen,
  onChange,
  onDragStart,
  onDrag,
  onDragEnd,
}: {
  id: string;
  index: number;
  label: string;
  dot: string;
  tileSize: "sm" | "lg";
  style: React.CSSProperties;
  open: boolean;
  /** Opens this figure's popover, or closes it with null. */
  onOpen: (id: string | null) => void;
  /** The figure became another one (its new id). */
  onChange: (id: string) => void;
  onDragStart: () => void;
  onDrag: (x: number, y: number) => void;
  onDragEnd: () => void;
}) {
  const figure = parseFigure(id)!,
    controls = useDragControls(),
    [size, setSize] = useState(String(figure.size ?? 50)),
    set = (next: string) => {
      act(`set:${index}:${next}`);
      onChange(next);
    };
  const which = figure.which ?? "current",
    // The kinds not shown elsewhere in the band, and averages.
    kinds = [
      ...SINGLES.filter((single) => single === id || !s.figures.includes(single)).map((single) => ({
        value: single,
        label: figureLabel(single),
      })),
      { value: "average", label: "Average" },
    ];
  const applySize = () => {
    const n = Number(size);
    if (figure.size && n >= AVERAGE_SIZES.min && n <= AVERAGE_SIZES.max && n !== figure.size) set(averageFigure(n, which));
    else setSize(String(figure.size ?? 50));
  };
  return (
    <motion.div
      layout
      data-figure={id}
      drag
      dragControls={controls}
      dragListener={false}
      dragSnapToOrigin
      dragElastic={0}
      onDragStart={onDragStart}
      onDrag={(e) => onDrag((e as PointerEvent).clientX, (e as PointerEvent).clientY)}
      onDragEnd={onDragEnd}
      // Lifted while dragged: above the others, on the popover's colour, with a shadow.
      whileDrag={{
        zIndex: 10,
        scale: 1.03,
        backgroundColor: "var(--popover)",
        borderRadius: 8,
        boxShadow: "0 8px 24px rgb(0 0 0 / 0.3)",
      }}
      transition={{ type: "spring", stiffness: 500, damping: 40 }}
      style={style}
      className="relative min-w-0 rounded-[20px]"
    >
      <StatCard
        label={label}
        dot={dot}
        size={tileSize}
        className="h-full"
        value={
          // One line of the value's own height, so a tile being edited stays the size of the others.
          <span className="flex h-[1lh] items-center gap-1">
            <button
              type="button"
              aria-label={tr("Move {0}", { 0: label })}
              onPointerDown={(e) => controls.start(e)}
              className={cn("-ml-2 flex h-7 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:text-foreground active:cursor-grabbing", FOCUS)}
            >
              <GripVertical className="size-4" />
            </button>
            <span className="flex-1" />
            <Popover open={open} onOpenChange={(next) => onOpen(next ? id : null)}>
              <PopoverTrigger
                render={
                  <Button variant="ghost" size="icon-sm" aria-label={tr("Change {0}", { 0: label })}>
                    <Pencil />
                  </Button>
                }
              />
              <PopoverContent side="top" align="end" className="flex w-64 flex-col gap-2 p-3">
                <Select items={kinds} value={figure.size ? "average" : id} onValueChange={(value) => set(value === "average" ? averageFigure(Number(size) || 50, which) : String(value))}>
                  <SelectTrigger size="sm" aria-label={tr("Figure")} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {kinds.map((kind) => (
                      <SelectItem key={kind.value} value={kind.value}>
                        {said(kind.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {figure.size && (
                  <>
                    <InputGroup className="h-7">
                      <InputGroupAddon>{tr("Average of")}</InputGroupAddon>
                      <InputGroupInput
                        aria-label={tr("Average size")}
                        inputMode="numeric"
                        value={size}
                        onChange={(e) => setSize(e.target.value.replace(/\D/g, "").slice(0, 4))}
                        onBlur={applySize}
                        onKeyDown={(e) => e.key === "Enter" && applySize()}
                        className={NUMERIC}
                      />
                    </InputGroup>
                    <ToggleGroup
                      aria-label={tr("Which average")}
                      size="sm"
                      spacing={0}
                      variant="outline"
                      value={[which]}
                      onValueChange={(next: string[]) => next[0] && set(averageFigure(figure.size!, next[0] as (typeof WHICH)[number]["id"]))}
                      className="w-full"
                    >
                      {WHICH.map((option) => (
                        <ToggleGroupItem key={option.id} value={option.id} className="flex-1">
                          {said(option.label)}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </>
                )}
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="icon-sm" aria-label={tr("Remove {0}", { 0: label })} className="hover:text-destructive" onClick={() => act("remove:" + id)}>
              <Trash2 />
            </Button>
          </span>
        }
      />
    </motion.div>
  );
}
