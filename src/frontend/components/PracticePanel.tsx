import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTimerChrome } from "../hooks/useTimerChrome";
import { useEffect, useState, type ReactNode } from "react";
import { FloatingSheet } from "./FloatingSheet";
import { IconClose } from "./icons";

export function useWidePractice() {
  const [wide, setWide] = useState(() => matchMedia("(min-width: 1024px) and (min-height: 600px)").matches);
  useEffect(() => {
    const query = matchMedia("(min-width: 1024px) and (min-height: 600px)");
    const update = () => setWide(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}

export function PracticePanel({ open, wide, side, title, onClose, children }: {
  open: boolean; wide: boolean; side: "left" | "right"; title: string; onClose: () => void; children: ReactNode;
}) {
  const focusMotion = useTimerChrome(side);
  const reduced = useReducedMotion();
  const offset = reduced ? 0 : side === "left" ? -48 : 48;
  const content = <>
    <div className="practice-panel-heading"><h2>{title}</h2><button className="btn icon" onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}><IconClose /></button></div>
    <div className="practice-panel-content">{children}</div>
  </>;
  if (wide) return <motion.div {...focusMotion} className={`practice-rail ${side}`}>
    <AnimatePresence>
      {open && <motion.aside className="practice-panel practice-docked-panel" aria-label={title}
        initial={{ x: offset, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: offset, opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
        {content}
      </motion.aside>}
    </AnimatePresence>
  </motion.div>;
  return <FloatingSheet open={open} title={title} className="practice-dialog practice-panel" onClose={onClose}>{content}</FloatingSheet>;
}
