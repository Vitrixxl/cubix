import { AnimatePresence, motion } from "motion/react";
import { usePopoverMotion } from "../hooks/usePopoverMotion";
import { useFloatingPortalTarget } from "./FloatingSheet";
import { AlgText } from "./AlgorithmList";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SolveDto } from "../../shared/types";

export function SolveInfoButton({ solve }: { solve: SolveDto }) {
  const id = useId();
  const portalTarget = useFloatingPortalTarget();
  const button = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const focusMotion = usePopoverMotion(position?.above ?? false);
  useEffect(() => {
    if (!position) return;
    const dismiss = () => setPosition(null);
    const outside = (event: PointerEvent) => {
      if (!button.current?.contains(event.target as Node) && !popover.current?.contains(event.target as Node)) dismiss();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { dismiss(); button.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", dismiss);
    const scroll = (event: Event) => { if (!popover.current?.contains(event.target as Node)) dismiss(); };
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [position]);
  return <>
    <button ref={button} type="button" className="mini-btn solve-info-button" aria-label="Show solve details" title="Date and scramble" aria-expanded={!!position} aria-controls={position ? id : undefined} onClick={() => {
      if (position) return setPosition(null);
      const rect = button.current!.getBoundingClientRect();
      const width = Math.min(280, window.innerWidth - 16);
      const above = rect.top > window.innerHeight / 2;
      setPosition({ left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)), top: above ? rect.top - 8 : rect.bottom + 8, above });
    }}><svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="10" cy="10" r="8" /><path d="M10 9v5" /><circle cx="10" cy="6" r=".7" fill="currentColor" stroke="none" /></svg></button>
    {createPortal(<AnimatePresence>{position && <motion.div {...focusMotion} data-placement={position.above ? "top" : "bottom"} transformTemplate={(_, transform) => `translateY(${position.above ? "-100%" : "0"}) ${transform === "none" ? "" : transform}`} id={id} ref={popover} className="solve-details-popover" role="region" aria-label="Solve details" style={{ left: position.left, top: position.top, maxHeight: position.above ? position.top - 8 : window.innerHeight - position.top - 8 }}>
      <span className="label">Date</span>
      <time dateTime={solve.created_at}>{new Date(solve.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" })}</time>
      <span className="label">Scramble</span>
      <p>{solve.scramble ? <AlgText alg={solve.scramble} /> : "No scramble recorded."}</p>
    </motion.div>}</AnimatePresence>, portalTarget)}
  </>;
}
