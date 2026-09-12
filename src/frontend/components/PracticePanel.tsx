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

/** A docked side panel on wide screens, a modal sheet everywhere else. */
export function PracticePanel({ open, wide, side, title, onClose, children }: {
  open: boolean; wide: boolean; side: "left" | "right"; title: string; onClose: () => void; children: ReactNode;
}) {
  const content = <>
    <div className="practice-panel-heading"><h2>{title}</h2><button className="btn icon" onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}><IconClose /></button></div>
    <div className="practice-panel-content">{children}</div>
  </>;
  if (wide) return <div className={`practice-rail ${side}`} data-timer-chrome>
    {open && <aside className="practice-panel practice-docked-panel" aria-label={title}>{content}</aside>}
  </div>;
  return <FloatingSheet open={open} title={title} className="practice-dialog practice-panel" onClose={onClose}>{content}</FloatingSheet>;
}
