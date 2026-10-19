/** A figure of the timer's band being edited (FiguresEditor.tsx), with motion's drag and layout animation: a chunk of
 * its own, fetched once the band is edited, so the timer starts without motion. */
import { useState } from "react";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { MotionConfig, motion, useDragControls } from "motion/react";
import { averageFigure, AVERAGE_SIZES, figureLabel, parseFigure } from "../../src/client/lib/practiceSummary";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { store as s } from "./store";
import { FOCUS, NUMERIC, StatCard } from "./ui";
import { tr } from "../../src/client/i18n";
import { said } from "./base";
import { act, SINGLES } from "./FiguresEditor";

const WHICH = [
  { id: "current", label: "Current" },
  { id: "best", label: "Best" },
  { id: "worst", label: "Worst" },
] as const;

/**
 * A figure of the band while editing, a tile of the same size: its name above, and where its value stands a handle to
 * drag it elsewhere, "change" (a popover to pick its kind) and "remove". It slides to its new place when the order
 * changes (motion's layout animation).
 */
export function FigureBox({
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
    <MotionConfig reducedMotion="user">
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
    </MotionConfig>
  );
}
