import { afterEach, expect, mock, test } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createStore, Provider } from "jotai";
import { createElement } from "react";
import { applyAlg, solved } from "../../src/shared/cube";
import { solveMethod } from "../../src/client/lib/methodSolver";
import { scannedState } from "../../src/client/lib/cubeScan";
import { COLOUR_NAMES, colours } from "../../src/client/lib/solveAnalysis";
import { mockLucide } from "../tests/lucide-mock";
import catalog from "../../desktop/assets/catalog.json";

// The real assisted solve, painted by hand, with native drawing and the camera's WebView replaced by host nodes.
mock.module("react-native", () => ({
  View: "View", Text: "Text", Pressable: "Pressable",
  AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) },
  BackHandler: { addEventListener: () => ({ remove() {} }) },
  Linking: { openSettings: async () => {} },
  PanResponder: { create: () => ({ panHandlers: {} }) },
  StyleSheet: { create: (styles: unknown) => styles },
}));
mock.module("react-native-svg", () => ({ default: "Svg", Circle: "Circle", G: "G", Path: "Path", Polygon: "Polygon" }));
mock.module("react-native-webview", () => ({ WebView: "WebView" }));
mock.module("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
const stored = new Map<string, string>();
mock.module("../src/platform/storage", () => ({ storage: {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => { stored.set(key, value); },
  removeItem: (key: string) => { stored.delete(key); },
} }));
mock.module("../src/api", () => ({ api: {}, authToken: { get: () => "token" }, local: {
  current: () => null, learned: () => [], read: { catalog: () => catalog, stats: () => [] },
} }));
mock.module("../src/scan/scan-html", () => ({ SCAN_HTML: "<html></html>" }));
mockLucide();
mock.module("../src/components/ui/text", () => ({ Text: "Text" }));
mock.module("../src/components/ui/icon", () => ({ Icon: "Icon" }));
mock.module("../src/components/ui/button", () => ({ Button: "Button" }));
mock.module("../src/components/ui/badge", () => ({ Badge: "Badge" }));
mock.module("../src/components/layout", () => Object.fromEntries(
  ["Alg", "BackButton", "Empty", "Figure", "HeadButton", "Label", "Numeric", "Page", "PageHead", "Segmented"].map(name => [name, name])));
mock.module("../src/components/AppBar", () => ({ PushedBar: ({ children }: { children?: unknown }) => children ?? null }));
mock.module("../src/components/AlgPlayer", () => ({ Pulse: "Pulse", ViewButtons: "ViewButtons" }));
mock.module("../src/components/StaticCubeSvg", () => ({ StaticCubeSvg: "StaticCubeSvg" }));
mock.module("../src/lib/practiceScramble", () => ({ generatePracticeScramble: async () => "R U F" }));
(globalThis as any).requestAnimationFrame = (callback: (time: number) => void) => setTimeout(() => callback(performance.now()), 8) as unknown as number;
(globalThis as any).cancelAnimationFrame = (frame: number) => clearTimeout(frame);
mock.module("../src/hooks/useLayout", () => ({ useLayout: () => ({ width: 390, height: 844, phone: true, tablet: false, wide: false }) }));
// The lesson of a step, as a line naming it while open.
mock.module("../src/pages/LearnPage", () => ({ StepLesson: ({ step }: { step: number | null }) => step === null ? null : createElement("Text", null, `lesson:${step}`) }));
const { AssistedPage } = await import("../src/pages/AssistedPage");
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer;
afterEach(async () => { if (renderer) await act(() => renderer.unmount()); });

const controls = (label: string) => renderer.root.findAll((n: any) => n.props.accessibilityLabel === label && typeof n.props.onPress === "function" && typeof n.type === "string");
const press = async (label: string, index = 0) => {
  const node = controls(label)[index];
  if (!node) throw new Error("No control " + label);
  await act(() => node.props.onPress());
};
/** The control (a Button or a card, named by its text) that holds `text`. */
const button = (text: string) => renderer.root.findAll((n: any) => (n.type === "Button" || n.type === "Pressable") && n.findAll((c: any) => c.type === "Text" && c.props.children === text).length > 0)[0];
/** Every measured box laid out as on a phone, so what waits for its size draws. */
const layout = () => act(() => { for (const n of renderer.root.findAll((n: any) => typeof n.props.onLayout === "function")) n.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 420 } } }); });
const shows = (text: string) => renderer.root.findAll((n: any) => n.type === "Text" && [n.props.children].flat().join("").includes(text)).length > 0;
/** The course's assisted solve opened, the cube painted by hand on the net (it starts with the centres only), then confirmed. */
async function paint(method: string, target: ReturnType<typeof colours>) {
  await act(() => { renderer = create(<Provider store={createStore()}><AssistedPage method={method} /></Provider>); });
  await press("By hand");
  await layout();
  expect(controls("Paint this sticker")).toHaveLength(54);
  for (let slot = 0; slot < 54; slot++) {
    if (slot % 9 === 4) continue;
    await press(COLOUR_NAMES[target[slot]!]);
    // Stickers are listed face by face, the centres among them (disabled).
    await act(() => renderer.root.findAll((n: any) => n.type === "Pressable" && /sticker/.test(n.props.accessibilityLabel ?? ""))[slot]!.props.onPress());
  }
  expect(button("Looks right")!.props.disabled).toBe(false);
  await act(() => button("Looks right")!.props.onPress());
  await layout();
}
/** Every turn of the plan said done, to the end. */
async function finish() {
  let turns = 0;
  while (button("Done, next turn") && turns < 500) { await act(() => button("Done, next turn")!.props.onPress()); turns++; }
  return turns;
}
const turnsOf = (method: string, target: ReturnType<typeof colours>) => solveMethod(method, scannedState(target), catalog.cases as any)!.reduce((sum, p) => sum + p.alg.split(" ").length, 0);

test("a cube painted by hand is planned, then solved turn by turn to the end", async () => {
  const target = colours(applyAlg(solved(3), "R U2 F' L D2 B R' U F2 L'"));
  await paint("beginner", target);
  expect(shows("Step 1 · White cross")).toBe(true);
  expect(controls("Previous turn")[0]!.props.disabled).toBe(true);
  // A turn made, then taken back.
  await act(() => button("Done, next turn")!.props.onPress());
  expect(controls("Previous turn")[0]!.props.disabled).toBe(false);
  await press("Previous turn");
  expect(controls("Previous turn")[0]!.props.disabled).toBe(true);
  // A step's lesson opens over the solve, from the part under way or any step across the top, and the solve stays where it was.
  await act(() => button("Done, next turn")!.props.onPress());
  await press("Review the lesson");
  expect(shows("lesson:0")).toBe(true);
  await press("Yellow cross · Lesson");
  expect(shows("lesson:3")).toBe(true);
  expect(shows("Step 1 · White cross")).toBe(true);
  expect(controls("Previous turn")[0]!.props.disabled).toBe(false);
  await press("Previous turn");
  expect(await finish()).toBe(turnsOf("beginner", target));
  expect(shows("Solved!")).toBe(true);
  expect(button("Solve again")).toBeDefined();
});

test("another course plans with its own steps and opens their lessons", async () => {
  const target = colours(applyAlg(solved(3), "F2 D' L B2 U R' F L2 D B' R2 U'"));
  await paint("roux", target);
  expect(shows("Step 1 · First block")).toBe(true);
  // Roux's four steps across the top, CMLL's lesson from its tile.
  await press("CMLL · Lesson");
  expect(shows("lesson:2")).toBe(true);
  expect(controls("LSE · Lesson")).toHaveLength(1);
  expect(await finish()).toBe(turnsOf("roux", target));
  expect(shows("Solved!")).toBe(true);
  expect(shows("Every step of the Roux method, on your own cube.")).toBe(true);
});

test("a solved cube says so instead of planning", async () => {
  await paint("cfop", colours(solved(3)));
  expect(shows("Your cube is already solved")).toBe(true);
  // Read again: back on the net, painted as the cube stands.
  await act(() => button("Read the cube again")!.props.onPress());
  await layout();
  expect(button("Looks right")!.props.disabled).toBe(false);
});
