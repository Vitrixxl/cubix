import { useEffect, useState, type ReactNode } from "react";
import { FloatingSheet } from "./FloatingSheet";
import { ShortcutKey } from "./ShortcutKey";
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

interface Props {
  open: boolean; wide: boolean; side: "left" | "right"; title: string; icon: ReactNode; count?: number; shortcut: string;
  disabled?: boolean; onOpen: () => void; onClose: () => void; children: ReactNode;
}

/**
 * On wide screens the panel owns a column: open, it shows its heading and content;
 * closed, only its opening button remains at the top of that column.
 * On narrow screens it is a modal sheet and the page provides the opening button.
 */
export function PracticePanel({ open, wide, side, title, icon, count, shortcut, disabled, onOpen, onClose, children }: Props) {
  const content = <>
    <div className="practice-panel-heading"><h2>{title}</h2><button className="btn icon" onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}><IconClose /></button></div>
    <div className="practice-panel-content">{children}</div>
  </>;
  if (wide) return <div className={`practice-rail ${side}`} data-timer-chrome>
    {open ? <aside className="practice-panel" aria-label={title}>{content}</aside>
      : <button type="button" className="rail-open" disabled={disabled} onClick={onOpen} aria-keyshortcuts={`Alt+${shortcut.toLowerCase()}`}>
        {icon}<span>{title}{count !== undefined && <small>{count}</small>}</span><ShortcutKey letter={shortcut} />
      </button>}
  </div>;
  return <FloatingSheet open={open} title={title} className="practice-dialog practice-panel" onClose={onClose}>{content}</FloatingSheet>;
}

/** The opening button used on narrow screens, where panels are sheets. */
export function PanelButton({ title, icon, count, shortcut, disabled, onClick }: { title: string; icon: ReactNode; count?: number; shortcut: string; disabled?: boolean; onClick: () => void }) {
  return <button type="button" className="action" disabled={disabled} onClick={onClick} aria-keyshortcuts={`Alt+${shortcut.toLowerCase()}`}>
    {icon}<span>{title}{count !== undefined && <small>{count}</small>}</span><ShortcutKey letter={shortcut} />
  </button>;
}
