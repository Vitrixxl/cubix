import { ThreeDSetting } from "./ThreeDSetting";
import { useEffect } from "react";
import { useAtom } from "jotai";
import { FloatingSheet } from "./FloatingSheet";
import { AnimationSetting } from "./AnimationSetting";
import { colorModeAtom, themeAtom, type ThemeId } from "../state";
import { IconCheck, IconClose } from "./icons";

export const THEMES: { id: ThemeId; name: string; light: string; dark: string }[] = [
  { id: "t3-code", name: "Brume", light: "#f2f2ff", dark: "#111522" },
  { id: "t3-chat", name: "Rose", light: "#ff74ad", dark: "#8f0044" },
  { id: "grove", name: "Forêt", light: "#5ec99a", dark: "#325d43" },
  { id: "ocean", name: "Océan", light: "#68b7e7", dark: "#19435a" },
  { id: "ember", name: "Braise", light: "#eb8b55", dark: "#613a33" },
  { id: "iris", name: "Lavande", light: "#b692f1", dark: "#4d326e" },
];

export function ThemeController() {
  const [theme, setTheme] = useAtom(themeAtom);
  const [mode, setMode] = useAtom(colorModeAtom);
  useEffect(() => {
    // Migrate the briefly available standalone light palette to the independent mode.
    if ((theme as string) === "light") { setTheme("t3-code"); setMode("light"); return; }
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.mode = mode;
    const background = getComputedStyle(document.body).backgroundColor;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", background);
  }, [theme, mode, setTheme, setMode]);
  return null;
}

export function ThemePicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [theme, setTheme] = useAtom(themeAtom);
  return (
    <FloatingSheet open={open} title="Themes" className="theme-dialog" onClose={onClose}>
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
            <ThreeDSetting />
            <AnimationSetting />
    </FloatingSheet>
  );
}
