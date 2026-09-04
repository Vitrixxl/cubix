import { useEffect } from "react";
import { useAtom } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { themeAtom, type ThemeId } from "../state";
import { IconCheck, IconClose } from "./icons";

export const THEMES: { id: ThemeId; name: string; light: string; dark: string }[] = [
  { id: "t3-code", name: "T3 Code", light: "#f2f2ff", dark: "#111522" },
  { id: "t3-chat", name: "T3 Chat", light: "#ff74ad", dark: "#8f0044" },
  { id: "grove", name: "Grove", light: "#5ec99a", dark: "#325d43" },
  { id: "ocean", name: "Ocean", light: "#68b7e7", dark: "#19435a" },
  { id: "ember", name: "Ember", light: "#eb8b55", dark: "#613a33" },
  { id: "iris", name: "Iris", light: "#b692f1", dark: "#4d326e" },
];

export function ThemeController() {
  const [theme] = useAtom(themeAtom);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return null;
}

export function ThemePicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [theme, setTheme] = useAtom(themeAtom);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="theme-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
          <motion.section
            className="theme-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="themes-title"
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={{ duration: 0.16 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="theme-header">
              <div>
                <h1 id="themes-title">Themes</h1>
                <p>Choose the atmosphere that helps you focus.</p>
              </div>
              <button className="btn icon" onClick={onClose} aria-label="Close themes"><IconClose /></button>
            </header>
            <div className="theme-grid">
              {THEMES.map((item) => (
                <button
                  key={item.id}
                  className={`theme-card ${theme === item.id ? "selected" : ""}`}
                  onClick={() => setTheme(item.id)}
                  aria-pressed={theme === item.id}
                >
                  <div className="theme-orbs" aria-hidden="true">
                    <span style={{ "--orb": item.light } as React.CSSProperties} />
                    <span style={{ "--orb": item.dark } as React.CSSProperties} />
                  </div>
                  <strong>{item.name}</strong>
                  {theme === item.id && <span className="theme-check"><IconCheck /></span>}
                </button>
              ))}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
