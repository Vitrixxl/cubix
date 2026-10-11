import { observeElementRect, useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import { Fragment, useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactNode, type RefObject } from "react";

/**
 * A long list drawn only where it shows: the rows in view of `scroller` and a few either side, the rest held by two
 * empty blocks of the right height, so thousands of times keep a few dozen nodes in the page. The rows stay in the
 * parent's flow (flex column, grid, subgrid) and are measured once drawn, so they may differ in height: `estimate` only
 * places those not drawn yet. The list may start below other content of the same scroller. Each row is one element of
 * the parent's layout: in a grid of tiles, one row of the grid (see `useColumns` and `inRows`).
 */
export function VirtualList<T>({
  items,
  scroller,
  estimate,
  row,
  rowKey,
  gap = 0,
  overscan = 8,
  spacer,
  spacerAs: Spacer = "div",
  anchorTo,
  handle,
}: {
  items: readonly T[];
  scroller: RefObject<HTMLElement | null>;
  estimate: number | ((i: number) => number);
  /** Draws a row; `measure` goes on its root element as a `ref`, so the list knows its height. */
  row: (item: T, i: number, measure: (el: HTMLElement | null) => void) => ReactNode;
  rowKey?: (item: T, i: number) => string | number;
  gap?: number;
  overscan?: number;
  /** Classes for the two blocks standing for the rows not drawn, as `col-span-full` in a grid. */
  spacer?: string;
  /** The two blocks' element, to stay valid markup in a list (`li`) or a table body (`tr`). */
  spacerAs?: "div" | "li" | "tr";
  /** `"end"` keeps a list read from its bottom (a chat) pinned there while its last rows are measured. */
  anchorTo?: "start" | "end";
  /** Receives the virtualizer, to bring a row not drawn into view (`scrollToIndex`). */
  handle?: { current: Virtualizer<HTMLElement, Element> | null };
}) {
  const start = useRef<HTMLElement>(null);
  const [margin, setMargin] = useState(0);
  // Passive effects: the scroller is a parent, whose ref React sets only after its children's layout effects ran.
  useEffect(() => {
    const el = scroller.current, mark = start.current;
    if (!el || !mark) return;
    const place = () => setMargin(mark.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop);
    place();
    const watch = new ResizeObserver(place);
    watch.observe(el);
    // What stands above the list may grow or shrink without the scroller changing size: another list being measured.
    for (const child of el.children) watch.observe(child);
    return () => watch.disconnect();
  }, [scroller, items.length]);
  const list = useVirtualizer({
    count: items.length,
    getScrollElement: () => scroller.current,
    estimateSize: typeof estimate === "number" ? () => estimate : estimate,
    getItemKey: rowKey ? (i) => rowKey(items[i]!, i) : undefined,
    overscan,
    gap,
    scrollMargin: margin,
    useFlushSync: false,
    anchorTo,
    // A scroller that takes its height from its rows has none before they are drawn: draw a window's worth, it grows.
    observeElementRect: (instance, report) => observeElementRect(instance, (rect) => report({ ...rect, height: rect.height || innerHeight })),
  });
  // The virtualizer looks for its scroller in a layout effect, too early on mounting: once it is there, look again.
  const [, again] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (list.scrollElement !== scroller.current) again();
  });
  if (handle) handle.current = list;
  const shown = list.getVirtualItems();
  const before = shown.length ? shown[0]!.start - margin : 0;
  const after = shown.length ? list.getTotalSize() - (shown[shown.length - 1]!.end - margin) : 0;
  return (
    <>
      <Spacer ref={start as never} aria-hidden className={spacer} style={{ height: before, flexShrink: 0 }} />
      {shown.map((v) => (
        <Fragment key={v.key}>
          {row(items[v.index]!, v.index, (el) => {
            if (el) el.dataset.index = String(v.index);
            list.measureElement(el);
          })}
        </Fragment>
      ))}
      <Spacer aria-hidden className={spacer} style={{ height: Math.max(0, after), flexShrink: 0 }} />
    </>
  );
}

/**
 * How many columns of at least `min` pixels (with `gap` between them) fit in `ref`'s width, as an `auto-fill` grid
 * would lay them out: for cutting a grid of tiles into rows a `VirtualList` can draw.
 */
export function useColumns(ref: RefObject<HTMLElement | null>, min: number, gap = 0) {
  const [columns, setColumns] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const count = () => setColumns(Math.max(1, Math.floor((el.clientWidth - parseFloat(getComputedStyle(el).paddingLeft) - parseFloat(getComputedStyle(el).paddingRight) + gap) / (min + gap))));
    count();
    const watch = new ResizeObserver(count);
    watch.observe(el);
    return () => watch.disconnect();
  }, [ref, min, gap]);
  return columns;
}

/** `items` cut into rows of `columns`. */
export const inRows = <T,>(items: readonly T[], columns: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / columns) }, (_, i) => items.slice(i * columns, (i + 1) * columns));
