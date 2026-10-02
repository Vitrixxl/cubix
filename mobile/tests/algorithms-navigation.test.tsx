import { afterEach, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createStore, Provider, useAtomValue } from "jotai";
import { mockLucide } from "./lucide-mock";

// Render the real browser, pager and routing atoms with native drawing replaced by host nodes.
// Slides finish at once so each step sees the settled page.
class AnimatedValue { constructor(public value: number) {} interpolate() { return this; } }
mock.module("react-native", () => ({
  Animated: {
    View: "Animated.View", Value: AnimatedValue,
    timing: (value: AnimatedValue, { toValue }: { toValue: number }) => ({ start: (done?: (r: { finished: boolean }) => void) => { value.value = toValue; done?.({ finished: true }); }, stop() {} }),
  },
  Easing: { bezier: () => (t: number) => t },
  AppState: { addEventListener: () => ({ remove() {} }) },
  View: "View", Text: "Text", Pressable: "Pressable", ScrollView: "ScrollView", Linking: { openURL() {} },
  FlatList: ({ renderItem, data, horizontal, ...props }: any) => createElement("FlatList", { ...props, data, horizontal },
    data.map((item: any, index: number) => createElement("Row", { key: item.key }, renderItem({ item, index })))),
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
].map(c => ({ ...c, setup: "R U R' U'", setups_alt: [], stage: c.set.toUpperCase(), name: c.id, setLabel: c.set.toUpperCase(), algorithms: [{ alg: "R U R' U'", source: "jperm" }] }));
const sets = [{ id: "oll", stage: "OLL", label: "OLL" }, { id: "pll", stage: "PLL", label: "PLL" }];
mock.module("../src/api", () => ({ api: {}, authToken: { get: () => "token" }, local: {
  current: () => null, learned: () => ["OLL 4"], read: { catalog: () => ({ cases, sets }), stats: () => [], caseHistory: () => ({ summary: { count: 0 } }) },
} }));
mock.module("../src/hooks/useLayout", () => ({ useLayout: () => ({ phone: true, width: 390, height: 844 }) }));
mock.module("../src/components/CaseDiagram", () => ({ CaseDiagram: () => null }));
mock.module("../src/components/TimesChart", () => ({ TimerStats: () => null }));
mock.module("../src/components/AlgText", () => ({ sourceLabel: (source: string) => source }));
mock.module("../src/components/GuidesDialog", () => ({ MethodsSheet: () => null }));
mock.module("../src/components/PuzzlePicker", () => ({ SessionButton: () => null, PuzzleIcon: () => null }));
mock.module("../src/components/LearnHeader", () => ({ LearnHeader: ({ children, part }: any) => createElement("LearnHeader", { part }, children) }));
mock.module("../src/components/Practice", () => ({ CubePreview: () => null }));
mock.module("../src/components/AlgPlayer", () => ({ AlgPlayerSheet: "AlgPlayerSheet" }));
mockLucide();
mock.module("../src/components/ui/text", () => ({ Text: "Text" }));
mock.module("../src/components/ui/button", () => ({ Button: "Button" }));
mock.module("../src/components/ui/icon", () => ({ Icon: "Icon" }));
mock.module("../src/components/ui/badge", () => ({ Badge: "Badge" }));
mock.module("../src/components/layout", () => Object.fromEntries(
  ["Alg", "BackButton", "Bar", "Choice", "Empty", "Figure", "HeadButton", "Label", "ListGroup", "ListRow", "MenuItem", "Numeric", "MoreMenu", "Page", "PageHead", "SearchField", "Segmented", "Surface", "TouchAction", "TouchBar"].map(name => [name, name])));
const { AlgorithmsPage } = await import("../src/pages/AlgorithmsPage");
const { routeAtom, goBackAtom, previousRouteAtom, learningFilterAtom, collapsedAlgorithmGroupsAtom, stageAtom } = await import("../src/state");
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer;
afterEach(async () => { if (renderer) await act(() => renderer.unmount()); });
/** Pass the route in as the shell does. */
function Routed() {
  const route = useAtomValue(routeAtom);
  return route.page === "algorithms" ? <AlgorithmsPage caseId={route.caseId} caseIds={route.caseIds} /> : <AlgorithmsPage />;
}
async function mount() {
  const store = createStore();
  store.set(routeAtom, { page: "algorithms" });
  store.set(learningFilterAtom, "all");
  store.set(stageAtom, "OLL");
  store.set(collapsedAlgorithmGroupsAtom, {});
  await act(() => { renderer = create(<Provider store={store}><Routed /></Provider>); });
  return store;
}
const browser = () => renderer.root.findAllByType("FlatList" as any).find(node => !node.props.horizontal)!;
const texts = (node: any) => node.findAllByType("Text" as any).map((text: any) => text.props.children);
/** The stage tab of this name. */
const tab = (stage: string) => renderer.root.findAll((node: any) => node.props.accessibilityRole === "tab" && texts(node).includes(stage))[0]!;
/** The learning filter. */
const filter = () => renderer.root.findAllByType("Choice" as any).find(node => node.props.label === "Filter")!;
const pager = () => renderer.root.findAllByType("FlatList" as any).find(node => node.props.horizontal)!;
async function open(id: string) {
  const card = renderer.root.findAllByType("Pressable" as any).find(node => node.props.accessibilityRole === "button" &&
    node.findAllByType("Text" as any).some(text => text.props.children === id.replace("OLL ", "")))!;
  await act(() => card.props.onPress());
  const viewport = renderer.root.findAllByType("View" as any).find(node => node.props.onLayout)!;
  await act(() => viewport.props.onLayout({ nativeEvent: { layout: { width: 362 } } }));
}
async function swipe(index: number) {
  await act(() => pager().props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: 362 * index } } }));
}

test("the stage tabs display only their stage, including when the learning filter has no matches", async () => {
  await mount();
  const visibleIds = () => browser().props.data.flatMap((row: any) => row.kind === "case" ? [row.c.id] : []);
  expect(visibleIds()).toEqual(["OLL 1", "OLL 3", "OLL 2", "OLL 4"]);
  await act(() => tab("PLL").props.onPress());
  expect(visibleIds()).toEqual(["PLL Aa"]);
  expect(filter().props.options.find((option: any) => option.id === "learned").count).toBe(0);
  await act(() => filter().props.onChange("learned"));
  expect(tab("PLL").props.accessibilityState.selected).toBe(true);
  expect(visibleIds()).toEqual([]);
  expect(browser().props.data.some((row: any) => row.kind === "empty")).toBe(true);
  await act(() => tab("OLL").props.onPress());
  expect(visibleIds()).toEqual(["OLL 4"]);
  // The counts describe the whole set whatever the filter.
  expect(filter().props.options.map((option: any) => option.count)).toEqual([4, 1, 3]);
});

test("the library sits under Learn's head, its search counts every case, and a group folds under its title", async () => {
  const store = await mount();
  expect(renderer.root.findAllByType("LearnHeader" as any)[0]!.props.part).toBe("algorithms");
  expect(renderer.root.findAllByType("SearchField" as any)[0]!.props.placeholder).toContain("5 cases");
  const dots = renderer.root.findAllByType("Pressable" as any).find(node => node.props.accessibilityState?.expanded !== undefined && node.findAllByType("Text" as any).some(text => text.props.children === "Dots"))!;
  await act(() => dots.props.onPress());
  expect(store.get(collapsedAlgorithmGroupsAtom)).toEqual({ "oll:Dots": true });
  expect(browser().props.data.flatMap((row: any) => row.kind === "case" ? [row.c.id] : [])).toEqual(["OLL 2", "OLL 4"]);
});

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
  await act(() => renderer.root.findAllByType("HeadButton" as any).find(node => node.props.label === "Next case")!.props.onPress());
  expect(store.get(routeAtom)).toMatchObject({ caseId: "OLL 3" });
  const head = renderer.root.findAllByType("PageHead" as any).find(node => node.props.lead)!;
  expect(head.props.title).toBe("OLL 3");
  await act(() => head.props.lead.props.onPress());
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

test("a cube case plays its algorithms in 3D from its diagram; the sheet opens on the case's cube and stage", async () => {
  await mount();
  await open("OLL 1");
  const sheet = () => renderer.root.findAllByType("AlgPlayerSheet" as any)[0]!;
  expect(sheet().props.index).toBeNull();
  const play = renderer.root.findAllByType("Pressable" as any).find(node => node.props.accessibilityLabel === "Play the algorithm in 3D")!;
  await act(() => play.props.onPress());
  expect(sheet().props.index).toBe(0);
  expect(sheet().props.choice).toBe(0);
  expect(sheet().props.items[0]).toMatchObject({ key: "OLL 1", algs: ["R U R' U'"], size: 3 });
  await act(() => sheet().props.onClose());
  expect(sheet().props.index).toBeNull();
});
