import { useEffect, useRef, useState } from "react";
import { Reorder } from "motion/react";
import { GripVertical } from "lucide-react";
import { store as s } from "./store";
import { tr } from "../../src/client/i18n";
import { said } from "./base";
import { cn } from "@/lib/utils";

/**
 * A list put in order by dragging or with the keys of its handles: the order shown, kept until a drop, then `persist`
 * saves it and the new place is announced. A new list from outside replaces it, unless a drag is under way.
 */
export function useReorder(items: string[], persist: (order: string[]) => void) {
  const [order, setOrder] = useState(items),
    current = useRef(order),
    dragging = useRef(false),
    [announcement, announce] = useState(""),
    key = items.join("\n");
  useEffect(() => {
    if (dragging.current || key === current.current.join("\n")) return;
    current.current = items;
    setOrder(items);
  }, [key]);
  const reorder = (next: string[]) => {
    current.current = next;
    setOrder(next);
  };
  const save = (item: string) => {
    dragging.current = false;
    persist(current.current);
    announce(tr("{0}, position {1} of {2}", { 0: item, 1: current.current.indexOf(item) + 1, 2: current.current.length }));
  };
  const move = (item: string, key: string) => {
    const next = [...current.current],
      index = next.indexOf(item),
      target = key === "Home" ? 0 : key === "End" ? next.length - 1 : index + (key === "ArrowUp" ? -1 : 1);
    if (target < 0 || target >= next.length || target === index) return;
    next.splice(index, 1);
    next.splice(target, 0, item);
    reorder(next);
    save(item);
  };
  const start = () => {
    dragging.current = true;
  };
  const status = <span className="sr-only" role="status">{said(announcement)}</span>;
  return { order, reorder, save, move, start, status };
}

/** The handle of an item of such a list: dragged (`onPointerDown` when only the handle drags), or moved with the keys. */
export function ReorderHandle({ name, index, count, move, onPointerDown, className }: { name: string; index: number; count: number; move: (key: string) => void; onPointerDown?: (e: React.PointerEvent) => void; className?: string }) {
  return (
    <button
      type="button"
      className={cn("flex size-8 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 active:cursor-grabbing", className)}
      aria-label={tr("Move {0}", { 0: name })}
      aria-description={`Position ${index + 1} of ${count}. Drag or use the arrow keys, Home and End to reorder.`}
      aria-keyshortcuts="ArrowUp ArrowDown Home End"
      title={tr("Drag to reorder · ↑ / ↓")}
      onPointerDown={onPointerDown}
      onKeyDown={(event) => {
        if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const handle = event.currentTarget;
        move(event.key);
        requestAnimationFrame(() => {
          handle.focus();
          handle.scrollIntoView({ block: "nearest" });
        });
      }}
    >
      <GripVertical className="size-4" aria-hidden="true" />
    </button>
  );
}

export function LearningGroups() {
  const { order, reorder, save, move, start, status } = useReorder(s.learningGroups, (next) => void s.reorderLearningGroups(next).catch(s.fail));
  return (
    <>
      <Reorder.Group as="ol" axis="y" layoutScroll className="-mx-2 flex max-h-[60vh] flex-col gap-0.5 overflow-y-auto px-2" aria-label={tr("Learning group order")} values={order} onReorder={reorder}>
        {order.map((group, index) => (
          <Reorder.Item key={group} value={group} className="flex h-10 items-center gap-3 rounded-lg bg-popover pr-1 pl-3 hover:bg-muted/50" onDragStart={start} onDragEnd={() => save(group)} whileDrag={{ boxShadow: "0 8px 24px rgb(0 0 0 / 0.25)" }}>
            <span className="w-6 font-sans text-xs text-muted-foreground tabular-nums" aria-hidden="true">{index + 1}.</span>
            <span className="flex-1 truncate text-sm">{group}</span>
            <ReorderHandle name={group} index={index} count={order.length} move={(key) => move(group, key)} />
          </Reorder.Item>
        ))}
      </Reorder.Group>
      {status}
    </>
  );
}
