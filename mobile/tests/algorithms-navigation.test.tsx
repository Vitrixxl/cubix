import { afterEach, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createStore, Provider } from "jotai";

// Render the real browser, pager and routing atoms with native drawing replaced by host nodes.
mock.module("react-native", () => ({
  AppState: { addEventListener: () => ({ remove() {} }) },
  View: "View", Text: "Text", Pressable: "Pressable", ScrollView: "ScrollView",
  FlatList: ({ renderItem, data, horizontal, ...props }: any) => createElement("FlatList", { ...props, data, horizontal },
    horizontal ? null : data.map((item: any, index: number) => createElement("Row", { key: item.key }, renderItem({ item, index })))),
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: { position: "absolute", inset: 0 } },
}));
const stored = new Map<string, string>();
mock.module("../src/platform/storage", () => ({ storage: {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => { stored.set(key, value); },
  removeItem: (key: string) => { stored.delete(key); },
} }));
const cases = [
  { id: "OLL 1", set: "oll", group: "Dots" },
  { id: "OLL 2", set: "oll", group: "Lines" },
  { id: "OLL 3", set: "oll", group: "Dots" },
  { id: "OLL 4", set: "oll", group: "Lines" },
  { id: "PLL Aa", set: "pll", group: "Corners" },
].map(c => ({ ...c, name: c.id, setLabel: c.set.toUpperCase() }));
const sets = [{ id: "oll", stage: "OLL", label: "OLL" }, { id: "pll", stage: "PLL", label: "PLL" }];
mock.module("../src/api", () => ({ api: {}, local: {
  current: () => null, learned: () => ["OLL 4"], read: { catalog: () => ({ cases, sets }), stats: () => [] },
} }));
mock.module("../src/hooks/useLayout", () => ({ useLayout: () => ({ navSpace: 80, phone: true, width: 390, pagePadding: 14 }) }));
mock.module("../src/components/CaseDiagram", () => ({ CaseDiagram: () => null }));
mock.module("../src/components/LearnedToggle", () => ({ LearnedToggle: () => null }));
mock.module("../src/components/Select", () => ({ Select: "Select" }));
mock.module("../src/components/TimesChart", () => ({ TimesChart: () => null }));
mock.module("../src/components/AlgText", () => ({ AlgorithmBadges: () => null, AlgText: () => null }));
mock.module("../src/components/icons", () => ({ IconBack: () => null, IconChevronDown: () => null, IconNext: () => null, IconTimer: () => null }));
mock.module("../src/components/ui", () => Object.fromEntries([
  ...["Btn", "Caption", "Chip", "Empty", "H1", "Kpi", "MiniBtn", "Muted", "Segmented"].map(name => [name, name]),
  ["mono", () => ({})],
]));
const { AlgorithmsPage } = await import("../src/pages/AlgorithmsPage");
const { routeAtom, goBackAtom, previousRouteAtom, learningFilterAtom, collapsedAlgorithmGroupsAtom } = await import("../src/state");
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer;
afterEach(async () => { if (renderer) await act(() => renderer.unmount()); });
async function mount() {
  const store = createStore();
  store.set(routeAtom, { page: "algorithms" });
  store.set(learningFilterAtom, "all");
  store.set(collapsedAlgorithmGroupsAtom, {});
  await act(() => { renderer = create(<Provider store={store}><AlgorithmsPage /></Provider>); });
  return store;
}
const browser = () => renderer.root.findAllByType("FlatList" as any).find(node => !node.props.horizontal)!;
const pager = () => renderer.root.findAllByType("FlatList" as any).find(node => node.props.horizontal)!;
async function open(id: string) {
  const card = renderer.root.findAllByType("Pressable" as any).find(node =>
    node.findAllByType("Text" as any).some(text => text.props.children === id.replace("OLL ", "")))!;
  await act(() => card.props.onPress());
  const viewport = renderer.root.findAllByType("View" as any).find(node => node.props.onLayout)!;
  await act(() => viewport.props.onLayout({ nativeEvent: { layout: { width: 362 } } }));
}
async function swipe(index: number) {
  await act(() => pager().props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: 362 * index } } }));
}

test("opening and swiping keep the scrolled list mounted; hardware back returns directly to it", async () => {
  const store = await mount();
  const list = browser();
  await act(() => list.props.onScroll({ nativeEvent: { contentOffset: { y: 1450 } } }));
  await open("OLL 1");
  expect(pager().props.data.map((c: any) => c.id)).toEqual(["OLL 1", "OLL 3", "OLL 2", "OLL 4"]);
  await swipe(1);
  expect(store.get(routeAtom)).toMatchObject({ caseId: "OLL 3" });
  await swipe(2);
  expect(store.get(routeAtom)).toMatchObject({ caseId: "OLL 2" });
  expect(store.get(previousRouteAtom)).toEqual({ page: "algorithms" });
  await act(() => { store.set(goBackAtom); });
  expect(store.get(routeAtom)).toEqual({ page: "algorithms" });
  expect(browser()).toBe(list);
  expect(browser().props.contentOffset.y).toBe(1450);
  await act(() => { store.set(goBackAtom); });
  expect(store.get(routeAtom)).toEqual({ page: "playground" });
});

test("pager snapshots the displayed filter and expanded groups", async () => {
  const store = await mount();
  await act(() => {
    store.set(learningFilterAtom, "not-learned");
    store.set(collapsedAlgorithmGroupsAtom, { "oll:Dots": true });
  });
  await open("OLL 2");
  expect(pager().props.data.map((c: any) => c.id)).toEqual(["OLL 2"]);
  await act(() => store.set(learningFilterAtom, "all"));
  expect(pager().props.data.map((c: any) => c.id)).toEqual(["OLL 2"]);
});

test("the on-screen return pops the details, including after the next-case button", async () => {
  const store = await mount();
  await open("OLL 1");
  await act(() => renderer.root.findAllByType("Btn" as any).find(node => node.props.accessibilityLabel === "Next case")!.props.onPress());
  expect(store.get(routeAtom)).toMatchObject({ caseId: "OLL 3" });
  await act(() => renderer.root.findAllByType("Btn" as any).find(node => node.props.label === "OLL")!.props.onPress());
  expect(store.get(routeAtom)).toEqual({ page: "algorithms" });
  await act(() => { store.set(goBackAtom); });
  expect(store.get(routeAtom)).toEqual({ page: "playground" });
});

test("cases opened from training use grouped order and retain their return destination", async () => {
  const store = await mount();
  await act(() => {
    store.set(routeAtom, { page: "training" });
    store.set(routeAtom, { page: "algorithms", caseId: "OLL 1" });
  });
  const viewport = renderer.root.findAllByType("View" as any).find(node => node.props.onLayout)!;
  await act(() => viewport.props.onLayout({ nativeEvent: { layout: { width: 362 } } }));
  expect(pager().props.data.map((c: any) => c.id)).toEqual(["OLL 1", "OLL 3", "OLL 2", "OLL 4"]);
  await swipe(2);
  await act(() => { store.set(goBackAtom); });
  expect(store.get(routeAtom)).toEqual({ page: "training" });
});
