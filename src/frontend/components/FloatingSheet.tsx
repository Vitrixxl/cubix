import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const SheetPortalContext = createContext<HTMLElement | null>(null);

/** Keep nested popovers inside the native dialog's interactive top layer. */
export function useFloatingPortalTarget() {
  return useContext(SheetPortalContext) ?? document.body;
}

/** A native modal dialog: focus trapping, Escape and backdrop clicks come for free. */
export function FloatingSheet({ open, ...props }: { open: boolean; title: string; className: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return createPortal(<SheetContent {...props} />, document.body);
}

function SheetContent({ title, className, onClose, children }: { title: string; className: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    setPortalTarget(dialog);
    return () => { dialog?.close(); previous?.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} className={`floating-sheet ${className}`} aria-label={title} aria-modal="true"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
    <SheetPortalContext.Provider value={portalTarget}>{children}</SheetPortalContext.Provider>
  </dialog>;
}
