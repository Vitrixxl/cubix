import { Asset } from "expo-asset";
import { Appearance } from "react-native";

// The browser has the Web Crypto the shared code uses, but randomUUID only in secure contexts (not on http://<LAN ip>).
if (typeof crypto.randomUUID !== "function")
  crypto.randomUUID = () => {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6]! & 15) | 64; b[8] = (b[8]! & 63) | 128;
    const h = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` as `${string}-${string}-${string}-${string}-${string}`;
  };

// react-native-web cannot force a scheme: ThemeProvider reads the chosen mode itself, the system one from the browser.
const appearance = Appearance as { setColorScheme?: (scheme: string) => void };
appearance.setColorScheme ??= () => {};

// Android links the fonts natively (app.json's expo-font plugin); the browser gets them as @font-face rules.
const fonts: [string, number, number][] = [
  ["Bricolage", 400, require("../../assets/fonts/BricolageGrotesque-Regular.ttf")],
  ["Bricolage", 500, require("../../assets/fonts/BricolageGrotesque-Medium.ttf")],
  ["Bricolage", 600, require("../../assets/fonts/BricolageGrotesque-SemiBold.ttf")],
  ["Bricolage", 700, require("../../assets/fonts/BricolageGrotesque-Bold.ttf")],
  ["Bricolage", 800, require("../../assets/fonts/BricolageGrotesque-ExtraBold.ttf")],
  ["cubing-icons", 400, require("../../assets/fonts/cubing-icons.ttf")],
];
const style = document.createElement("style");
style.textContent = fonts.map(([family, weight, module]) =>
  `@font-face{font-family:"${family}";font-weight:${weight};font-display:swap;src:url("${Asset.fromModule(module).uri}")}`).join("\n");
document.head.append(style);
