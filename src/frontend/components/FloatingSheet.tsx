import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { useAtomValue } from "jotai";
import { animationsEnabledAtom } from "../state";

const SheetPortalContext = createContext<HTMLElement | null>(null);

/** Keep nested popovers inside the native dialog's interactive top layer. */
export function useFloatingPortalTarget() {
  return useContext(SheetPortalContext) ?? document.body;
}

export function FloatingSheet({ open, ...props }: { open: boolean; title: string; className: string; onClose: () => void; children: ReactNode }) {
  return createPortal(<AnimatePresence>{open && <SheetContent {...props} />}</AnimatePresence>, document.body);
}

function SheetContent({ title, className, onClose, children }: { title: string; className: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const present = useIsPresent();
  const reduced = useReducedMotion();
  const enabled = useAtomValue(animationsEnabledAtom);
  const [mobile, setMobile] = useState(() => matchMedia("(max-width: 700px)").matches);
  useLayoutEffect(() => {
    const query = matchMedia("(max-width: 700px)");
    const update = () => setMobile(query.matches);
    query.addEventListener("change", update);
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    setPortalTarget(dialog);
    return () => { query.removeEventListener("change", update); dialog?.close(); previous?.focus({ preventScroll: true }); };
  }, []);
  const offset = reduced || !enabled ? 0 : mobile ? "100%" : 24;
  return <motion.dialog ref={ref} className={`floating-sheet ${className}`} aria-label={title} aria-modal="true"
    data-exiting={!present || undefined}
    initial={{ y: offset, opacity: mobile && enabled && !reduced ? 1 : 0, "--sheet-shade": 0 }}
    animate={{ y: 0, opacity: 1, "--sheet-shade": 1 }}
    exit={{ y: offset, opacity: mobile && enabled && !reduced ? 1 : 0, "--sheet-shade": 0 }}
    transition={{ duration: !enabled ? 0 : reduced ? 0.12 : present ? 0.3 : 0.22, ease: [0.22, 1, 0.36, 1] }}
    onCancel={event => { event.preventDefault(); if (present) onClose(); }}
    onClick={event => {
      if (!present || event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
    <SheetPortalContext.Provider value={portalTarget}>{children}</SheetPortalContext.Provider>
  </motion.dialog>;
}
