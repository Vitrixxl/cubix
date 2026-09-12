import { useAtom } from "jotai";
import { colorModeAtom, themeAtom, type ThemeId } from "../state";
import { helpPath } from "../seo/pages";

const THEMES: { id: ThemeId; name: string; color: string }[] = [
  { id: "t3-code", name: "Blue", color: "#3987e5" },
  { id: "t3-chat", name: "Pink", color: "#ed2677" },
  { id: "grove", name: "Green", color: "#39ad78" },
  { id: "ocean", name: "Cyan", color: "#42a4dc" },
  { id: "ember", name: "Orange", color: "#e1783f" },
  { id: "iris", name: "Purple", color: "#9a67df" },
];

/** Device preferences: they apply to guests as well as signed-in cubers. */
export function AppearanceSettings() {
  const [mode, setMode] = useAtom(colorModeAtom);
  const [theme, setTheme] = useAtom(themeAtom);
  return <section className="settings card" aria-label="Settings">
    <div className="setting-row">
      <span>Theme</span>
      <div className="segmented" role="group" aria-label="Colour mode">
        {(["dark", "light"] as const).map(value => <button type="button" key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{value === "dark" ? "Dark" : "Light"}</button>)}
      </div>
    </div>
    <div className="setting-row">
      <span>Accent</span>
      <div className="swatches" role="group" aria-label="Accent colour">
        {THEMES.map(item => <button type="button" key={item.id} className="swatch" style={{ background: item.color }} aria-label={item.name} aria-pressed={theme === item.id} title={item.name} onClick={() => setTheme(item.id)} />)}
      </div>
    </div>
    <div className="setting-row">
      <span>Help</span>
      <a className="btn small" href={helpPath("overviewGuide")}>Open the guides</a>
    </div>
  </section>;
}
