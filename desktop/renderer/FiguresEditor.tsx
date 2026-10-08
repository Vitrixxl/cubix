/**
 * The timer's band of figures, chosen by the player and edited where it stands: "Edit" (shown on hover) turns every
 * figure into a box to move, change or remove, and adds a box to add one; "change" opens a popover on the box to pick
 * its kind (and an average its size, current, best or worst).
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { motion, useDragControls } from "motion/react";
import { averageFigure, AVERAGE_SIZES, FIGURE_LIMIT, figureLabel, parseFigure } from "../../src/client/lib/practiceSummary";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { store as s } from "./store";
import { FADE, FOCUS, Figure, NUMERIC, Strip } from "./ui";
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

/** The narrowest a figure of the band gets, label and value on one line; a box being edited needs more. */
const FIGURE_WIDTH = 176,
  EDITING_WIDTH = 216;
/**
 * Columns for `count` boxes in `width`: as few rows as fit, then the boxes shared evenly between them (9 in a band of
 * 7 make rows of 5 and 4, not 7 and 2).
 */
export function balancedColumns(count: number, width: number, least = FIGURE_WIDTH) {
  const most = Math.max(1, Math.min(count, Math.floor(width / least))),
    rows = Math.ceil(count / most);
  return Math.max(1, Math.ceil(count / rows));
}
/** Lines between the boxes of a row, and between the rows across the whole band. */
export const cellLines = (i: number, columns: number, rows: number) =>
  cn("px-4", i % columns > 0 && "border-l", Math.floor(i / columns) < rows - 1 && "border-b pb-2.5", i >= columns && "pt-2.5");

const SINGLES = ["best", "worst", "mean", "median", "count"];
const WHICH = [
  { id: "current", label: "Current" },
  { id: "best", label: "Best" },
  { id: "worst", label: "Worst" },
] as const;
const act = (action: string) => void s.action("figures:" + action);
/** A figure not shown yet: a single first, else an average of a common size. */
const unused = (ids: readonly string[]) =>
  SINGLES.find((id) => !ids.includes(id)) ?? [5, 12, 25, 50, 100, 200, 500, 1000].map((n) => averageFigure(n, "current")).find((id) => !ids.includes(id)) ?? "ao3";

export function FiguresBand() {
  const [editing, setEditing] = useState(false),
    /** The figure being changed, by its id. */
    [open, setOpen] = useState<string | null>(null),
    /** The order while a figure is dragged: the others make room as it goes. */
    [order, setOrder] = useState<string[] | null>(null),
    [band, setBand] = useState<HTMLDivElement | null>(null),
    /** A key per box that follows its figure through changes of kind, so its popover stays open. */
    keys = useRef(new Map<string, number>()),
    serial = useRef(0),
    width = useWidth(band),
    metrics = s.figuresShown(),
    byId = new Map(s.figures.map((id, i) => [id, metrics[i]!])),
    ids = order ?? s.figures,
    adding = editing && ids.length < FIGURE_LIMIT,
    count = ids.length + (adding ? 1 : 0),
    columns = balancedColumns(count, width, editing ? EDITING_WIDTH : FIGURE_WIDTH),
    rows = Math.ceil(count / columns);
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
  return (
    <div ref={setBand} className="group/stats relative shrink-0" data-tour="session" data-no-timer={editing || undefined} style={{ "--columns": columns } as React.CSSProperties}>
      <Strip label={tr("Statistics")} className="grid-cols-[repeat(var(--columns),minmax(0,1fr))] gap-0 px-0 py-2.5">
        {ids.map((id, i) => {
          const [label, value, tone] = byId.get(id) ?? [figureLabel(id), "", ""];
          if (!keys.current.has(id)) keys.current.set(id, ++serial.current);
          return editing ? (
            <FigureBox
              key={keys.current.get(id)}
              id={id}
              index={s.figures.indexOf(id)}
              label={said(label)}
              open={open === id}
              onOpen={(next) => setOpen(next)}
              onChange={(next) => {
                keys.current.set(next, keys.current.get(id)!);
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
              className={cellLines(i, columns, rows)}
            />
          ) : (
            <Figure key={id} label={said(label)} value={value} tone={tone} size="lg" inline className={cellLines(i, columns, rows)} />
          );
        })}
        {adding && (
          // The rest of the last row (a whole row when it is full): "Add" in the middle of the room left.
          <div
            className={cn(cellLines(ids.length, columns, rows), "flex items-stretch")}
            style={{ gridColumn: `span ${columns - (ids.length % columns)}` }}
          >
            <Button
              variant="ghost"
              size="sm"
              className="h-auto flex-1 rounded-none text-muted-foreground"
              onClick={() => {
                const id = unused(s.figures);
                act("add:" + id);
                setOpen(id);
              }}
            >
              <Plus data-icon="inline-start" />
              {tr("Add")}</Button>
          </div>
        )}
      </Strip>
      <Button
        size="xs"
        onClick={() => (editing ? finish() : setEditing(true))}
        className={cn("absolute -top-3.5 right-3 transition-opacity", editing ? "opacity-100" : "opacity-0 group-hover/stats:opacity-100 focus-visible:opacity-100", FADE)}
      >
        {editing ? <Check data-icon="inline-start" /> : <Pencil data-icon="inline-start" />}
        {editing ? tr("Done") : tr("Edit")}
      </Button>
    </div>
  );
}

/**
 * A figure of the band while editing: a handle to drag it elsewhere, its name, "change" (a popover to pick its kind)
 * and "remove". It slides to its new place when the order changes (motion's layout animation).
 */
function FigureBox({ id, index, label, open, onOpen, onChange, onDragStart, onDrag, onDragEnd, className }: {
  id: string;
  index: number;
  label: string;
  open: boolean;
  /** Opens this figure's popover, or closes it with null. */
  onOpen: (id: string | null) => void;
  /** The figure became another one (its new id). */
  onChange: (id: string) => void;
  onDragStart: () => void;
  onDrag: (x: number, y: number) => void;
  onDragEnd: () => void;
  className: string;
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
    kinds = [...SINGLES.filter((single) => single === id || !s.figures.includes(single)).map((single) => ({ value: single, label: figureLabel(single) })), { value: "average", label: "Average" }];
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
      whileDrag={{ zIndex: 10, scale: 1.03, backgroundColor: "var(--popover)", borderRadius: 8, boxShadow: "0 8px 24px rgb(0 0 0 / 0.3)" }}
      transition={{ type: "spring", stiffness: 500, damping: 40 }}
      className={cn(className, "relative flex min-h-7 items-center gap-1")}
    >
      <button
        type="button"
        aria-label={tr("Move {0}", { 0: label })}
        onPointerDown={(e) => controls.start(e)}
        className={cn("-ml-2 flex h-7 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:text-foreground active:cursor-grabbing", FOCUS)}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="min-w-0 flex-1 truncate text-sm">{said(label)}</span>
      <Popover open={open} onOpenChange={(next) => onOpen(next ? id : null)}>
        <PopoverTrigger
          render={
            <Button variant="ghost" size="icon-xs" aria-label={tr("Change {0}", { 0: label })}>
              <Pencil />
            </Button>
          }
        />
        <PopoverContent side="top" align="end" className="flex w-64 flex-col gap-2 p-3">
          <Select
            items={kinds}
            value={figure.size ? "average" : id}
            onValueChange={(value) => set(value === "average" ? averageFigure(Number(size) || 50, which) : String(value))}
          >
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
                  <ToggleGroupItem key={option.id} value={option.id} className="flex-1 text-xs">
                    {said(option.label)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </>
          )}
        </PopoverContent>
      </Popover>
      <Button variant="ghost" size="icon-xs" aria-label={tr("Remove {0}", { 0: label })} className="hover:text-destructive" onClick={() => act("remove:" + id)}>
        <Trash2 />
      </Button>
    </motion.div>
  );
}
