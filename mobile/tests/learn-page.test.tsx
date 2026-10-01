import { afterEach, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createStore, Provider, useAtomValue } from "jotai";
import { mockLucide } from "./lucide-mock";

// The real Learn page, its routing and progress atoms, with native drawing replaced by host nodes.
mock.module("react-native", () => ({
  Animated: { View: "Animated.View", Value: class { interpolate() { return this; } } },
  Easing: { bezier: () => (t: number) => t },
  AppState: { addEventListener: () => ({ remove() {} }) },
  View: "View", Text: "Text", Pressable: "Pressable", ScrollView: "ScrollView",
  FlatList: ({ renderItem, data, ListHeaderComponent, ...props }: any) => createElement("FlatList", { ...props, data }, ListHeaderComponent,
    data.map((item: any, index: number) => createElement("Row", { key: item.key }, renderItem({ item, index })))),
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: { position: "absolute", inset: 0 } },
}));
const stored = new Map<string, string>();
mock.module("../src/platform/storage", () => ({ storage: {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => { stored.set(key, value); },
  removeItem: (key: string) => { stored.delete(key); },
} }));
const algorithms = [{ alg: "F R U R' U' F'", source: "jperm" }];
const cases = [
  { id: "2L-OLL I-Shape", name: "I-Shape", set: "2look-oll", group: "1: Edges" },
  { id: "2L-OLL Sune", name: "Sune", set: "2look-oll", group: "2: Corners" },
  { id: "OLL 1", name: "Runway", set: "oll", group: "Dot" },
].map(c => ({ ...c, stage: "OLL", setLabel: c.set, setup: "F U R U' R' F'", setups_alt: [], algorithms }));
const sets = [{ id: "2look-oll", stage: "OLL", label: "2-Look OLL", count: 2 }, { id: "oll", stage: "OLL", label: "OLL", count: 1 }];
mock.module("../src/api", () => ({ api: { setLearned: async () => {} }, authToken: { get: () => "token" }, local: {
  current: () => ({ id: "u1", username: "u1", isGuest: false, createdAt: "" }), learned: () => ["2L-OLL I-Shape"], read: { catalog: () => ({ cases, sets }), stats: () => [] },
} }));
mock.module("../src/components/CaseDiagram", () => ({ CaseDiagram: () => null }));
mock.module("../src/components/StaticCubeSvg", () => ({ StaticCubeSvg: () => null }));
mock.module("../src/components/PuzzlePicker", () => ({ SessionButton: () => null, PuzzleIcon: () => null }));
mock.module("../src/components/Sheet", () => ({ Sheet: ({ open, children }: any) => open ? createElement("Sheet", {}, children) : null }));
mockLucide();
mock.module("../src/components/ui/text", () => ({ Text: "Text" }));
mock.module("../src/components/ui/icon", () => ({ Icon: "Icon" }));
mock.module("../src/components/layout", () => Object.fromEntries(
  ["Alg", "BackButton", "Bar", "Choice", "Empty", "Figure", "Label", "MenuItem", "Mono", "MoreMenu", "Page", "PageHead", "SearchField", "Surface", "TouchAction", "TouchBar"].map(name => [name, name])));
const { LearnPage } = await import("../src/pages/LearnPage");
const { routeAtom, learnMethodAtom, selectedCaseIdsAtom, courseProgressAtom } = await import("../src/state");
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer;
afterEach(async () => { if (renderer) await act(() => renderer.unmount()); stored.clear(); });

function Routed() {
  const route = useAtomValue(routeAtom);
  return <LearnPage method={route.page === "learn" ? route.method : undefined} />;
}
async function mount() {
  const store = createStore();
  store.set(routeAtom, { page: "learn" });
  // Test files share one module registry: the storage in use may be another file's mock, so start from no progress.
  store.set(courseProgressAtom, { methods: {}, courses: {} });
  await act(() => { renderer = create(<Provider store={store}><Routed /></Provider>); });
  return store;
}
const press = async (label: string) => {
  const node = renderer.root.findAll((n: any) => n.props.accessibilityLabel === label && typeof n.props.onPress === "function")[0];
  if (!node) throw new Error("No control " + label);
  await act(() => node.props.onPress());
};
const touch = (label: string) => renderer.root.findAllByType("TouchAction" as any).find(node => node.props.label === label);
const rows = () => renderer.root.findAllByType("FlatList" as any)[0]!.props.data;

test("the methods of the puzzle open as courses, remembered per account", async () => {
  const store = await mount();
  const buttons = renderer.root.findAll((n: any) => n.props.accessibilityRole === "button" && /^Start /.test(n.props.accessibilityLabel ?? ""));
  expect(buttons.map(b => b.props.accessibilityLabel)).toEqual(["Start Beginner", "Start CFOP", "Start Roux", "Start ZZ"]);
  await press("Start CFOP");
  expect(store.get(routeAtom)).toEqual({ page: "learn", method: "cfop" });
  expect(store.get(learnMethodAtom)).toBe("cfop");
  expect(store.get(courseProgressAtom).methods).toEqual({ "333": "cfop" });
  // The cross is intuitive: nothing to train, its tips shown instead.
  expect(touch("Train")).toBeUndefined();
  expect(rows()).toEqual([]);
});

test("a step lists its sets' cases, trains the shown set and is marked done", async () => {
  const store = await mount();
  await press("Start CFOP");
  await act(() => touch("Next")!.props.onPress());
  await act(() => touch("Next")!.props.onPress());
  expect(store.get(courseProgressAtom).courses["333:cfop"]!.step).toBe(2);
  // 2-Look OLL first, since some of its cases are still to learn.
  expect(rows().filter((row: any) => row.kind === "alg").map((row: any) => row.key)).toEqual(["2L-OLL I-Shape", "2L-OLL Sune"]);
  expect(rows().find((row: any) => row.key === "2L-OLL I-Shape").item.learned).toBe(true);
  await act(() => renderer.root.findAllByType("Choice" as any)[0]!.props.onChange("oll"));
  expect(rows().filter((row: any) => row.kind === "alg").map((row: any) => row.key)).toEqual(["OLL 1"]);
  await act(() => touch("Mark done")!.props.onPress());
  expect(touch("Done")!.props.pressed).toBe(true);
  expect(store.get(courseProgressAtom).courses["333:cfop"]!.done).toEqual(["oll"]);
  await act(() => touch("Train")!.props.onPress());
  expect(store.get(selectedCaseIdsAtom)).toEqual(["OLL 1"]);
  expect(store.get(routeAtom)).toEqual({ page: "training", autostart: true });
});

test("a beginner step teaches its own algorithms and keeps their learned marks", async () => {
  const store = await mount();
  await press("Start Beginner");
  await act(() => touch("Next")!.props.onPress());
  const own = rows().filter((row: any) => row.kind === "alg");
  expect(own.map((row: any) => row.item.alg)).toEqual(["R U R' U'"]);
  await press("Mark Corner insertion learned");
  expect(store.get(courseProgressAtom).courses["333:beginner"]!.learned).toEqual(["first-layer-corners:corner-insertion"]);
  expect(rows()[0].item.learned).toBe(true);
  // Back to the methods: the beginner course now continues.
  await act(() => renderer.root.findAllByType("PageHead" as any)[0]!.props.lead.props.onPress());
  expect(store.get(routeAtom)).toEqual({ page: "learn" });
  expect(renderer.root.findAll((n: any) => n.props.accessibilityLabel === "Continue Beginner").length).toBeGreaterThan(0);
});
