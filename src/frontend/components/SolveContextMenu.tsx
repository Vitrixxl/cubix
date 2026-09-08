import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAtomValue, useSetAtom } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { deletedSolveIdAtom, routeAtom, statsVersionAtom, userAtom } from "../state";
import { api } from "../api";
import { usePopoverMotion } from "../hooks/usePopoverMotion";
import { IconClose, IconMessage } from "./icons";

interface Menu { id: number; x: number; y: number; above: boolean; anchor: HTMLElement; host: HTMLElement; }

/** One delegated menu for all times, rather than one component/listener per solve. */
export function SolveContextMenu() {
  const user = useAtomValue(userAtom);
  const route = useAtomValue(routeAtom);
  const setRoute = useSetAtom(routeAtom);
  const notifyDeleted = useSetAtom(deletedSolveIdAtom);
  const bumpStats = useSetAtom(statsVersionAtom);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setMenu(null); }, [route]);
  useEffect(() => {
    if (!user) return;
    let hold: ReturnType<typeof setTimeout> | undefined;
    let start: { x: number; y: number } | undefined;
    let longPressed = false;
    const cancelHold = () => { clearTimeout(hold); hold = undefined; start = undefined; };
    const open = (anchor: HTMLElement, x: number, y: number) => {
      const id = Number(anchor.dataset.solveId);
      if (!anchor.isConnected || !Number.isSafeInteger(id) || id === 0 || anchor.closest("[inert]")) return;
      const rect = anchor.getBoundingClientRect();
      const top = Math.max(8, Math.min(y || rect.bottom, innerHeight - 8));
      setError("");
      setMenu({ id, anchor, host: anchor.closest("dialog") ?? document.body,
        x: Math.max(8, Math.min(x || rect.left, innerWidth - 188)),
        y: top, above: top > innerHeight / 2 });
    };
    const contextMenu = (event: MouseEvent) => {
      const anchor = (event.target as Element)?.closest<HTMLElement>("[data-solve-id]");
      if (!anchor) return;
      event.preventDefault(); cancelHold(); open(anchor, event.clientX, event.clientY);
    };
    const down = (event: PointerEvent) => {
      cancelHold(); longPressed = false;
      const target = event.target as Element;
      if (!target.closest(".solve-context-menu")) setMenu(null);
      if (event.pointerType === "mouse" || target.closest("button, a, input")) return;
      const anchor = target.closest<HTMLElement>("[data-solve-id]");
      if (!anchor) return;
      start = { x: event.clientX, y: event.clientY };
      hold = setTimeout(() => { longPressed = true; open(anchor, event.clientX, event.clientY); }, 500);
    };
    const move = (event: PointerEvent) => { if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) cancelHold(); };
    const click = (event: MouseEvent) => {
      if (!longPressed) return;
      longPressed = false;
      // Suppress the release click on the time, never the next deliberate menu action.
      if ((event.target as Element)?.closest(".solve-context-menu")) return;
      event.preventDefault(); event.stopImmediatePropagation();
    };
    const dismiss = () => { cancelHold(); setMenu(null); };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && document.querySelector(".solve-context-menu")) { event.preventDefault(); dismiss(); }
    };
    document.addEventListener("contextmenu", contextMenu);
    document.addEventListener("pointerdown", down);
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerup", cancelHold);
    document.addEventListener("pointercancel", cancelHold);
    document.addEventListener("click", click, true);
    window.addEventListener("keydown", key);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      cancelHold();
      document.removeEventListener("contextmenu", contextMenu);
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", cancelHold);
      document.removeEventListener("pointercancel", cancelHold);
      document.removeEventListener("click", click, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [user?.id, user?.isGuest]);
  const deleteTime = async () => {
    if (!menu || deleting) return;
    setDeleting(true); setError("");
    try {
      await api.deleteSolve(menu.id);
      notifyDeleted(menu.id); bumpStats(version => version + 1); setMenu(null);
    } catch (error) { setError((error as Error).message); }
    finally { setDeleting(false); }
  };
  return <AnimatePresence>{menu && <TimeMenu menu={menu} canShare={!!user && !user.isGuest} deleting={deleting} error={error} onDelete={deleteTime}
    onShare={() => { setMenu(null); setRoute({ page: "messages", solveId: menu.id }); }} />}</AnimatePresence>;
}

function TimeMenu({ menu, canShare, deleting, error, onShare, onDelete }: {
  menu: Menu; canShare: boolean; deleting: boolean; error: string; onShare: () => void; onDelete: () => void;
}) {
  const chrome = usePopoverMotion(menu.above);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    container.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    return () => { if (menu.anchor.isConnected) menu.anchor.focus({ preventScroll: true }); };
  }, [menu.anchor]);
  return createPortal(<motion.div {...chrome} ref={container} className="case-context-menu solve-context-menu" role="menu" aria-label="Time actions"
    transformTemplate={(_, transform) => `translateY(${menu.above ? "-100%" : "0"}) ${transform === "none" ? "" : transform}`}
    data-placement={menu.above ? "top" : "bottom"}
    style={{ left: menu.x, top: menu.y, width: 180, maxHeight: menu.above ? menu.y - 8 : innerHeight - menu.y - 8, overflowY: "auto" }}
    onKeyDown={event => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    }}>
    {canShare && <button type="button" className="case-context-menu-item" role="menuitem" disabled={deleting} onClick={onShare}><IconMessage />Share</button>}
    <button type="button" className="case-context-menu-item danger" role="menuitem" disabled={deleting} onClick={onDelete}><IconClose />{deleting ? "Deleting…" : "Delete"}</button>
    {error && <p className="form-error" role="alert">{error}</p>}
  </motion.div>, menu.host);
}
