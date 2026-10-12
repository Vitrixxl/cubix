/**
 * The web app's first launch on a device (src/client/lib/firstLaunch.ts): boot.ts hides the page and loads this script,
 * which draws the startup cube solving itself, standing, scrambling back and solving again while the app gets ready.
 * Once the app is ready (its data and its first scramble), the cube finishes its pass, stands, and the screen fades
 * over the app. It never stays longer than LIMIT: the app opens anyway.
 */
import { LAUNCHER_SETTLE, LAUNCHER_VIEWBOX, launcherCubeFrame, launcherFinishAt, launcherProgress } from "../../src/client/lib/launcherCube";
import { FIRST_LAUNCH_TEXT, LAUNCHED_KEY } from "../../src/client/lib/firstLaunch";

/** The text in each language but English (desktop/web.ts, from the dictionaries). */
declare const CUBIX_FIRST_LAUNCH_TEXT: Record<string, string>;
const LIMIT = 30000;

/** The language the app will speak (src/client/i18n `preferred`): the one chosen, a page's own, else the device's. */
function language() {
  try {
    const chosen = localStorage.getItem("cubix.language");
    if (chosen) return chosen;
  } catch {}
  if (root.lang && root.lang !== "en") return root.lang;
  return [...navigator.languages, navigator.language].map((tag) => tag.toLowerCase().split("-")[0]!).find((id) => id === "en" || id in CUBIX_FIRST_LAUNCH_TEXT) ?? "en";
}
const SIZE = 180;

const root = document.documentElement;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const style = document.createElement("style");
style.textContent =
  "#first-launch{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px;" +
  "background:var(--background,#0b0b0e);color:var(--foreground,#fafafa);font-family:Geist,system-ui,sans-serif;transition:opacity .32s ease}" +
  "#first-launch.gone{opacity:0}#first-launch svg{width:min(46vw,28vh," + SIZE + "px);height:auto}" +
  "#first-launch .name{margin:0;font:500 1.5rem/1 'Bricolage Grotesque',Geist,system-ui,sans-serif;letter-spacing:-.025em}" +
  "#first-launch .name b{font-weight:800}" +
  "#first-launch .status{margin:-10px 0 0;min-height:1.25rem;font-size:.875rem;text-align:center;color:var(--muted-foreground,#a1a1aa)}";
const screen = document.createElement("div");
screen.id = "first-launch";
screen.setAttribute("role", "status");
const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
svg.setAttribute("viewBox", LAUNCHER_VIEWBOX);
svg.setAttribute("aria-hidden", "true");
const name = document.createElement("p");
name.className = "name";
name.innerHTML = "<b>Q</b>bix";
const status = document.createElement("p");
status.className = "status";
status.textContent = CUBIX_FIRST_LAUNCH_TEXT[language()] ?? FIRST_LAUNCH_TEXT;
screen.append(svg, name, status);
document.head.append(style);
document.body.append(screen);

const start = performance.now();
let finishAt = Infinity;
const finish = () => {
  if (finishAt === Infinity) finishAt = reduced ? 0 : launcherFinishAt(performance.now() - start);
};
if (root.hasAttribute("data-ready")) finish();
else addEventListener("cubix:ready", finish, { once: true });
setTimeout(finish, LIMIT);

const tick = () => {
  const elapsed = performance.now() - start;
  svg.innerHTML = launcherCubeFrame(reduced ? 1 : launcherProgress(elapsed, finishAt), elapsed)
    .map((p) => p.line
      ? `<polyline points="${p.points}" fill="none" stroke="${p.color}" stroke-width="${120 / SIZE}" opacity="${p.opacity}"/>`
      : `<polygon points="${p.points}" fill="${p.color}" opacity="${p.opacity}"/>`)
    .join("");
  if (elapsed < finishAt + LAUNCHER_SETTLE) return void requestAnimationFrame(tick);
  // The cube stands solved: the app shows under the screen, which fades away.
  try {
    localStorage.setItem(LAUNCHED_KEY, "1");
  } catch {}
  root.removeAttribute("data-first-launch");
  screen.classList.add("gone");
  screen.addEventListener("transitionend", () => { screen.remove(); style.remove(); }, { once: true });
  setTimeout(() => { screen.remove(); style.remove(); }, 600);
};
requestAnimationFrame(tick);
