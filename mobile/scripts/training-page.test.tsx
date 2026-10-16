import { afterEach, expect, mock, test } from "bun:test";
import { createElement, Fragment } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createStore, Provider } from "jotai";
import { mockLucide } from "../tests/lucide-mock";

// The real Training page and its atoms, with native drawing, the timer and the session replaced by host nodes.
mock.module("react-native", () => ({
  Animated: { View: "Animated.View", Value: class { interpolate() { return this; } }, timing: () => ({ start() {}, stop() {} }) },
  Easing: { linear: (t: number) => t, bezier: () => (t: number) => t },
  AppState: { addEventListener: () => ({ remove() {} }) }, BackHandler: { addEventListener: () => ({ remove() {} }) },
  View: "View", Text: "Text", Pressable: "Pressable", ScrollView: "ScrollView", Linking: { openURL() {} },
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: { position: "absolute", inset: 0 } },
}));
const stored = new Map<string, string>();
mock.module("../src/platform/storage", () => ({ storage: {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => { stored.set(key, value); },
  removeItem: (key: string) => { stored.delete(key); },
} }));
const algorithms = [{ alg: "R U R' U'", source: "jperm" }];
const cases = [
  { id: "OLL 1", name: "Runway", set: "oll", group: "Dot" },
  { id: "OLL 2", name: "Zamboni", set: "oll", group: "Dot" },
  { id: "OLL 3", name: "Anti-Nazi", set: "oll", group: "Dot" },
  { id: "PLL Aa", name: "Aa", set: "pll", group: "Corners" },
].map(c => ({ ...c, stage: c.set.toUpperCase(), setLabel: c.set.toUpperCase(), setup: "R U R' U'", setups_alt: [], algorithms }));
const sets = [{ id: "oll", stage: "OLL", label: "OLL", count: 3 }, { id: "pll", stage: "PLL", label: "PLL", count: 1 }];
// Three learned OLL cases, timed: OLL 3 is the slow one against the set's usual.
const stats = [["OLL 1", 1000], ["OLL 2", 1100], ["OLL 3", 2500]].map(([caseId, mean]) => ({ caseId, count: 5, mean, best: mean, lastAt: new Date().toISOString() }));
mock.module("../src/api", () => ({ api: { setLearned: async () => {} }, authToken: { get: () => "token" }, local: {
  current: () => ({ id: "u1", username: "u1", isGuest: false, createdAt: "" }), learned: () => ["OLL 1", "OLL 2", "OLL 3"], learningGroupOrder: () => ({}),
  read: { catalog: () => ({ cases, sets }), stats: () => stats },
} }));
mock.module("expo-keep-awake", () => ({ useKeepAwake() {} }));
mock.module("../src/components/CaseDiagram", () => ({ CaseDiagram: "CaseDiagram" }));
mock.module("../src/components/AlgPlayer", () => ({ PlayerAlg: "PlayerAlg", PlayerControls: "PlayerControls", PlayerCube: "PlayerCube", useAlgPlayer: () => null }));
mock.module("../src/components/CaseSelector", () => ({ CaseSelector: "CaseSelector" }));
mock.module("../src/components/CrossPractice", () => ({ CrossPractice: "CrossPractice" }));
mock.module("../src/components/Bld", () => ({ BldRun: "BldRun" }));
mock.module("../src/components/SlideSwitch", () => ({ SlideSwitch: ({ children }: any) => createElement(Fragment, {}, children) }));
mock.module("../src/components/Sheet", () => ({ Sheet: ({ open, children }: any) => open ? createElement("Sheet", {}, children) : null }));
mock.module("../src/components/AppBar", () => ({ AppBar: "AppBar", PushedBar: "PushedBar", SectionTabs: "SectionTabs" }));
mock.module("../src/components/Chips", () => ({ Chip: "Chip", ChipMenu: "ChipMenu" }));
mock.module("../src/components/SolveMenus", () => ({ LastSolveBar: "LastSolveBar", SolveMenu: "SolveMenu" }));
mock.module("../src/components/Confirm", () => ({ ask: async () => true }));
mock.module("../src/tour", () => ({ useTourTarget: () => ({}) }));
mock.module("../src/hooks/useLayout", () => ({ useLayout: () => ({ phone: true, width: 390, height: 844 }) }));
mock.module("../src/hooks/useTimer", () => ({ useTimer: () => ({ phase: "idle", elapsed: 0, startedAt: 0, reset() {}, saveError: "" }) }));
mock.module("../src/lib/launchSession", () => ({ ensureLaunchSession: async () => 1 }));
mock.module("../src/components/Practice", () => ({
  CubePreview: "CubePreview", Hint: "Hint", SaveError: "SaveError", StopSurface: "StopSurface", TimerDigits: "TimerDigits", timerHint: () => "",
  Stage: ({ prompt, bar }: any) => createElement("Stage", {}, prompt, bar),
  useBackTo() {}, useNotice: () => [null, () => {}], usePracticeLock: () => ({ busy: false, running: false, locked: false }),
  useSessionSolves: () => [[], () => {}], useShownSolves: (solves: unknown) => solves, useTimerChrome() {},
}));
mockLucide();
mock.module("../src/components/ui/text", () => ({ Text: "Text" }));
mock.module("../src/components/ui/icon", () => ({ Icon: "Icon" }));
mock.module("../src/components/ui/badge", () => ({ Badge: "Badge" }));
mock.module("../src/components/ui/button", () => ({ Button: "Button" }));
mock.module("../src/components/layout", () => Object.fromEntries(
  ["Alg", "Bar", "Choice", "Empty", "Fade", "Figure", "HeadButton", "Label", "MenuItem", "MoreMenu", "Numeric", "SearchField", "Segmented"].map(name => [name, name])));
const { TrainingPage } = await import("../src/pages/TrainingPage");
const { trainingRunAtom, trainingStepAtom, trainingSetupModeAtom, routeAtom, selectedCaseIdsAtom } = await import("../src/state");
const { recognitionSecondsAtom, trainPicksAtom, trainSetsAtom } = await import("../src/components/TrainingSetup");
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer;
afterEach(async () => { if (renderer) await act(() => renderer.unmount()); stored.clear(); });

async function mount(prepare?: (store: ReturnType<typeof createStore>) => void) {
  const store = createStore();
  store.set(routeAtom, { page: "training" });
  prepare?.(store);
  await act(() => { renderer = create(<Provider store={store}><TrainingPage /></Provider>); });
  return store;
}
const texts = () => renderer.root.findAll((n: any) => n.type === "Text" || n.type === "Numeric").map((n: any) => [n.props.children].flat().filter((c: any) => typeof c === "string" || typeof c === "number").join(""));
const chip = (label: string) => renderer.root.findAll((n: any) => n.type === "Chip" && (n.props.accessibilityLabel === label || n.props.children === label))[0];
const pressable = (label: string) => renderer.root.findAll((n: any) => n.props.accessibilityLabel === label && typeof n.props.onPress === "function")[0];

test("the six ways of training, each with its count and one action; Train drills the recommended cases and the whole sets picked, learned ones only", async () => {
  const store = await mount();
  expect(texts()).toEqual(expect.arrayContaining(["Steps", "Recognition", "Learned", "Whole sets", "Free practice", "BLD"]));
  // No bar under the ways: each starts from its own card, without a line of settings.
  expect(pressable("Train")).toBeUndefined();
  expect(texts().some(t => t.includes("picked by hand") || t.includes(" s · "))).toBe(false);
  expect(renderer.root.findAll((n: any) => n.type === "Chip" && ["Start", "Pick…"].includes(n.props.children)).length).toBe(6);
  // The whole sets are chosen in their drawer.
  expect(chip("OLL, 3 learned")).toBeUndefined();
  await act(() => pressable("Whole sets")!.props.onPress());
  await act(() => chip("OLL, 3 learned")!.props.onPress());
  expect(store.get(trainSetsAtom)).toEqual(["oll"]);
  // The PLL has nothing learned: it leads to its course.
  expect(chip("PLL · see Courses")).toBeUndefined();
  await act(() => pressable("Train")!.props.onPress());
  expect(store.get(trainingStepAtom)).toBe("practice");
  expect(store.get(trainingRunAtom)).toBe("cases");
  // The recommended picked are kept as they were at the start.
  expect(store.get(trainPicksAtom)).toEqual(["OLL 3"]);
  expect(texts().some(t => ["Runway", "Zamboni", "Anti-Nazi"].includes(t))).toBe(true);
});

test("a way's settings are in its drawer, and its Start runs it with them", async () => {
  const store = await mount();
  expect(renderer.root.findAll((n: any) => n.type === "Segmented").length).toBe(0);
  await act(() => pressable("Recognition")!.props.onPress());
  const seconds = renderer.root.findAll((n: any) => n.type === "Segmented" && n.props.label === "Seconds per case")[0]!;
  await act(() => seconds.props.onChange("5"));
  expect(texts()).not.toContain("OLL · 3 of 3 · 5 s · AUF");
  await act(() => pressable("Start")!.props.onPress());
  expect(store.get(recognitionSecondsAtom)).toBe(5);
  expect(store.get(trainingRunAtom)).toBe("recognition");
  expect(store.get(trainingStepAtom)).toBe("practice");
});

test("nothing recommended nor picked: Learned drills every learned case", async () => {
  const store = await mount(s => s.set(trainPicksAtom, []));
  expect(pressable("Learned, 3 cases")).toBeDefined();
  await act(() => pressable("Learned, 3 cases")!.props.onPress());
  expect(texts()).toContain("All learned cases");
  await act(() => pressable("Train")!.props.onPress());
  expect(store.get(trainingRunAtom)).toBe("cases");
  expect(renderer.root.findByType("PushedBar" as any).props.sub).toBe("3 cases");
});

test("Learned opens its screen; a selection from elsewhere drills its learned cases alone", async () => {
  const store = await mount();
  await act(() => pressable("Learned, 1 case")!.props.onPress());
  expect(store.get(trainingSetupModeAtom)).toBe("learned");
  expect(renderer.root.findAll((n: any) => n.type === "PushedBar" && n.props.title === "Learned").length).toBe(1);
  await act(() => renderer.unmount());
  const started = await mount(s => { s.set(selectedCaseIdsAtom, ["PLL Aa", "OLL 2"]); s.set(trainSetsAtom, ["oll"]); s.set(routeAtom, { page: "training", autostart: true }); });
  expect(started.get(trainSetsAtom)).toEqual([]);
  expect(started.get(trainPicksAtom)).toEqual([]);
  expect(started.get(routeAtom)).toEqual({ page: "training" });
  expect(texts()).toContain("Zamboni");
  expect(texts()).not.toContain("Aa");
});

test("a recognition run counts down, shows cases without their names, a tap pausing one to show its algorithm and Next moving on, until Close, then how many were done", async () => {
  await mount(s => { s.set(trainingRunAtom, "recognition"); s.set(trainingStepAtom, "practice"); });
  expect(texts()).toContain("3");
  // Each second is its own step of the countdown.
  for (let i = 0; i < 3; i++) await act(() => new Promise(resolve => setTimeout(resolve, 1020)));
  expect(renderer.root.findAllByType("CubePreview" as any).length).toBe(1);
  expect(texts().some(t => ["Runway", "Zamboni", "Anti-Nazi", "R U R' U'"].includes(t))).toBe(false);
  const first = renderer.root.findAllByType("CubePreview" as any)[0]!.props.alg;
  for (let i = 0; i < 2; i++) {
    await act(() => pressable("Show the algorithm")!.props.onPress());
    // Paused: the case named, its algorithm shown, no cube waiting for a tap.
    expect(renderer.root.findAllByType("CubePreview" as any).length).toBe(0);
    expect(renderer.root.findAll((n: any) => n.type === "Alg" && typeof n.props.text === "string" && n.props.text.length > 0).length).toBe(1);
    await act(() => chip("Next")!.props.onPress());
  }
  expect(typeof first).toBe("string");
  await act(() => chip("Close")!.props.onPress());
  expect(texts()).toEqual(expect.arrayContaining(["2", "cases done"]));
});

test("a recognition run left for another page goes on where it was when the page comes back", async () => {
  const store = await mount(s => { s.set(trainingRunAtom, "recognition"); s.set(trainingStepAtom, "practice"); });
  for (let i = 0; i < 3; i++) await act(() => new Promise(resolve => setTimeout(resolve, 1020)));
  await act(() => pressable("Show the algorithm")!.props.onPress());
  await act(() => chip("Next")!.props.onPress());
  const shown = renderer.root.findAllByType("CubePreview" as any)[0]!.props.alg;
  await act(() => renderer.unmount());
  await act(() => { renderer = create(<Provider store={store}><TrainingPage /></Provider>); });
  // No countdown again: the same case, the count kept.
  expect(renderer.root.findAllByType("CubePreview" as any)[0]!.props.alg).toBe(shown);
  expect(renderer.root.findByType("PushedBar" as any).props.sub).toBe("OLL · 3 cases");
});
