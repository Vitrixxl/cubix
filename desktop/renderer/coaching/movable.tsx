/** A picture laid over a room, dragged anywhere in it and resized from its edges: one's own picture, the floating call. */
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Where a picture sits, as fractions of the room left around it (0 against the left or top, 1 against the right or
 * bottom), so it keeps to its corner when the room changes size; and how wide it is in pixels, none until resized.
 */
export type Place = { x: number; y: number; w?: number };

/**
 * The strips along the sides and the squares at the corners that resize, each with its cursor; invisible, half outside
 * the picture so its rounded corners do not clip them.
 */
const EDGES: [string, string][] = [
  ["t", "inset-x-3 -top-1 h-2 cursor-ns-resize"],
  ["b", "inset-x-3 -bottom-1 h-2 cursor-ns-resize"],
  ["l", "inset-y-3 -left-1 w-2 cursor-ew-resize"],
  ["r", "inset-y-3 -right-1 w-2 cursor-ew-resize"],
  ["tl", "-top-1 -left-1 size-4 cursor-nwse-resize"],
  ["br", "-right-1 -bottom-1 size-4 cursor-nwse-resize"],
  ["tr", "-top-1 -right-1 size-4 cursor-nesw-resize"],
  ["bl", "-bottom-1 -left-1 size-4 cursor-nesw-resize"],
];

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * The picture, in its parent as its room: dragged from anywhere, resized from any side or corner at `ratio` (width over
 * height), at least `min` pixels wide and never past the room; `place` keeps where it is between mounts. `className`
 * sizes it, `frame` dresses what it shows (rounded, clipped). A press only becomes a drag past a few pixels, and then
 * swallows the click, so the buttons on the picture keep working.
 */
export function Movable({ place, ratio, min, frame, className, style, children, ...props }: { place: Place; ratio: number; min: number; frame?: string; children: (at: Place) => React.ReactNode } & Omit<React.ComponentProps<"div">, "children">) {
  // A copy: the drag measures from where the picture was, which writing `place` must not move.
  const [at, setAt] = useState(() => ({ ...place }));
  const drag = useRef<{ x: number; y: number; edge: string; left: number; top: number; width: number; height: number; roomW: number; roomH: number; captured: boolean } | null>(null);
  const dragged = useRef(false);
  return (
    <div
      {...props}
      className={cn("pointer-events-auto absolute cursor-grab touch-none select-none active:cursor-grabbing", className)}
      style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%`, translate: `${-at.x * 100}% ${-at.y * 100}%`, width: at.w, aspectRatio: ratio, ...style }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const tile = e.currentTarget,
          room = tile.parentElement!;
        const edge = (e.target as HTMLElement).closest<HTMLElement>("[data-edge]")?.dataset.edge ?? "",
          width = tile.offsetWidth,
          height = tile.offsetHeight;
        drag.current = { x: e.clientX, y: e.clientY, edge, width, height, left: at.x * (room.clientWidth - width), top: at.y * (room.clientHeight - height), roomW: room.clientWidth, roomH: room.clientHeight, captured: !!edge };
        dragged.current = false;
        if (edge) tile.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x,
          dy = e.clientY - d.y;
        if (!d.captured) {
          if (Math.hypot(dx, dy) < 4) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          d.captured = true;
        }
        dragged.current = true;
        let { left, top, width } = d;
        if (d.edge) {
          // Pulling a side away from the picture grows it, whichever of the two sides of a corner says more; the
          // opposite sides stay put.
          const across = d.edge.includes("l") ? -dx : d.edge.includes("r") ? dx : -Infinity,
            down = d.edge.includes("t") ? -dy * ratio : d.edge.includes("b") ? dy * ratio : -Infinity;
          width = clamp(d.width + Math.max(across, down), min, Math.min(d.roomW, d.roomH * ratio));
          if (d.edge.includes("l")) left = d.left + d.width - width;
          if (d.edge.includes("t")) top = d.top + d.height - width / ratio;
        } else {
          left += dx;
          top += dy;
        }
        const height = d.edge ? width / ratio : d.height,
          spareW = d.roomW - width,
          spareH = d.roomH - height;
        const next = { x: spareW > 0 ? clamp(left / spareW, 0, 1) : 0, y: spareH > 0 ? clamp(top / spareH, 0, 1) : 0, w: d.edge ? width : at.w };
        Object.assign(place, next);
        setAt(next);
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onClickCapture={(e) => {
        if (!dragged.current) return;
        dragged.current = false;
        e.stopPropagation();
        e.preventDefault();
      }}
    >
      <div className={cn("relative size-full", frame)}>{children(at)}</div>
      {EDGES.map(([edge, zone]) => (
        <span key={edge} data-edge={edge} className={cn("absolute z-20", zone)} />
      ))}
    </div>
  );
}
