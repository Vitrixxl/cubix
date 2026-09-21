import { createContext, useContext } from "react";
import { buildTheme, type Theme } from "../../src/client/lib/theme";
export { buildTheme, mix, alpha, type Theme } from "../../src/client/lib/theme";

export const ThemeContext = createContext<Theme>(buildTheme("t3-code", "dark"));
export const useTheme = () => useContext(ThemeContext);

export const FONT = { sans: undefined as string | undefined, mono: "monospace" };
