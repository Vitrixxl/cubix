import { afterEach, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createStore, Provider, useAtomValue } from "jotai";
import { mockLucide } from "../tests/lucide-mock";

// Render the real catalogue, set, search and case screens and the routing atoms, with native drawing replaced by host nodes.
mock.module("react-native", () => ({
  AppState: { addEventListener: () => ({ remove() {} }) },
  BackHandler: { addEventListener: () => ({ remove() {} }) },
  PanResponder: { create: () => ({ panHandlers: {} }) },
  View: "View", Text: "Text", Pressable: "Pressable", ScrollView: "ScrollView", Linking: { openURL() {} },
  FlatList: ({ renderItem, data, ...props }: any) => createElement("FlatList", { ...props, data },
    data.map((item: any, index: number) => createElement("Row", { key: item.key ?? item.id }, renderItem({ item, index })))),
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
].map(c => ({ ...c, setup: "R U R' U'", setups_alt: [], stage: c.set.toUpperCase(), name: c.id, setLabel: c.set.toUpperCase(),
  algorithms: [{ alg: "R U R' U'", source: "jperm" }, { alg: "R U2 R'", source: "speedcubedb", votes: 12 }] }));
const sets = [{ id: "oll", stage: "OLL", label: "OLL", description: "Orient the last layer." }, { id: "pll", stage: "PLL", label: "PLL", description: "Permute it." }];
const learnedCalls: unknown[][] = [];
mock.module("../src/api", () => ({
  api: { algorithmChoices: async () => ({}), setLearned: async (...args: unknown[]) => { learnedCalls.push(args); } },
  authToken: { get: () => "token" },
  local: {
    current: () => null, learned: () => ["OLL 4"], learnedAlgs: () => ({}),
    read: { catalog: (puzzle: string) => puzzle === "333" ? { cases, sets } : { cases: [], sets: [] }, stats: () => [], caseHistory: () => ({ summary: { count: 0 } }) },
  },
}));
mock.module("../src/hooks/useLayout", () => ({ useLayout: () => ({ phone: true, width: 390, height: 844 }) }));
mock.module("../src/components/CaseDiagram", () => ({ CaseDiagram: () => null }));
mock.module("../src/components/TimesChart", () => ({ TimerStats: () => null }));
mock.module("../src/components/AlgText", () => ({ sourceLabel: (source: string) => source }));
mock.module("../src/components/GuidesDialog", () => ({ MethodsSheet: () => null }));
mock.module("../src/components/PuzzlePicker", () => ({ PuzzleIcon: () => null }));
mock.module("../src/components/AppBar", () => ({ AppBar: "AppBar", PushedBar: "PushedBar" }));
mock.module("../src/components/AlgPlayer", () => ({ PlayerAlg: () => null, PlayerControls: () => null, PlayerCube: () => null, ViewButtons: () => null, useAlgPlayer: () => null }));
mock.module("../src/components/Sheet", () => ({ Sheet: "Sheet", SheetScrollView: "SheetScrollView", SheetInput: "SheetInput" }));
mockLucide();
mock.module("../src/components/ui/text", () => ({ Text: "Text" }));
mock.module("../src/components/ui/button", () => ({ Button: "Button" }));
mock.module("../src/components/ui/icon", () => ({ Icon: "Icon" }));
mock.module("../src/components/layout", () => Object.fromEntries(
  ["Alg", "Empty", "HeadButton", "MenuItem", "MoreMenu", "Numeric", "SearchField", "StatusMark"].map(name => [name, name])));
const { AlgorithmsPage } = await import("../src/pages/AlgorithmsPage");
const { routeAtom, goBackAtom, learningFilterAtom, selectedCaseIdsAtom } = await import("../src/state");
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer;
afterEach(async () => { if (renderer) await act(() => renderer.unmount()); learnedCalls.length = 0; });
/** Pass the route in as the shell does. */
function Routed() {
  const route = useAtomValue(routeAtom);
  return route.page === "algorithms" ? <AlgorithmsPage {...route} /> : null;
}
async function mount() {
  const store = createStore();
  store.set(routeAtom, { page: "algorithms" });
  store.set(learningFilterAtom, "all");
  await act(() => { renderer = create(<Provider store={store}><Routed /></Provider>); });
  return store;
}
const texts = (node: any): string[] => node.findAllByType("Text" as any).flatMap((text: any) => [text.props.children].flat().filter((v: unknown) => typeof v === "string" || typeof v === "number").map(String));
/** The pressable whose label or text is `label`. */
const press = async (label: string) => {
  const node = renderer.root.findAll((n: any) => (n.type === "Pressable" || n.type === "Button" || n.type === "HeadButton") && (n.props.accessibilityLabel === label || n.props.label === label || (n.type !== "HeadButton" && texts(n).includes(label))))[0];
  if (!node) throw new Error(`No control "${label}"`);
  await act(() => node.props.onPress());
};
const list = () => renderer.root.findAllByType("FlatList" as any)[0]!;
/** The cases of the set's tiles, in order. */
const tileIds = () => list().props.data.flatMap((row: any) => row.kind === "tiles" ? row.cases.map((c: any) => c.id) : []);

test("the catalogue lists the sets by step with what is learned, and opens a set", async () => {
  const store = await mount();
  const rows = list().props.data;
  expect(rows.map((row: any) => row.kind === "set" ? `${row.set.id} ${row.learned}/${row.total}` : row.label)).toEqual(["OLL", "oll 1/4", "PLL", "pll 0/1"]);
  await press("OLL");
  expect(store.get(routeAtom)).toEqual({ page: "algorithms", set: "oll" });
  expect(renderer.root.findByType("PushedBar" as any).props.title).toBe("OLL");
  expect(tileIds()).toEqual(["OLL 1", "OLL 3", "OLL 2", "OLL 4"]);
  await act(() => store.set(learningFilterAtom, "not-learned"));
  expect(tileIds()).toEqual(["OLL 1", "OLL 3", "OLL 2"]);
});

test("a case opens from its set with the set's order, steps through it and closes back to the set", async () => {
  const store = await mount();
  await press("OLL");
  await press("OLL 3");
  expect(store.get(routeAtom)).toEqual({ page: "algorithms", caseId: "OLL 3", caseIds: ["OLL 1", "OLL 3", "OLL 2", "OLL 4"] });
  await press("Next case");
  expect(store.get(routeAtom)).toMatchObject({ caseId: "OLL 2" });
  const bar = renderer.root.findByType("PushedBar" as any);
  expect(bar.props.title).toBe("OLL 2");
  await act(() => bar.props.onBack());
  expect(store.get(routeAtom)).toEqual({ page: "algorithms", set: "oll" });
  await act(() => { store.set(goBackAtom); });
  expect(store.get(routeAtom)).toEqual({ page: "algorithms" });
});

test("a case opened from training follows its set's group order and goes back to training", async () => {
  const store = await mount();
  await act(() => {
    store.set(routeAtom, { page: "training" });
    store.set(routeAtom, { page: "algorithms", caseId: "OLL 3" });
  });
  await press("Next case");
  expect(store.get(routeAtom)).toMatchObject({ caseId: "OLL 2" });
  await act(() => renderer.root.findByType("PushedBar" as any).props.onBack());
  expect(store.get(routeAtom)).toEqual({ page: "training" });
});

test("a selection trains or marks learned the cases picked", async () => {
  const store = await mount();
  await press("OLL");
  await press("Select");
  await press("OLL 1");
  await press("OLL 2");
  expect(texts(renderer.root)).toContain("2 selected");
  await press("Train selection");
  expect(store.get(selectedCaseIdsAtom)).toEqual(["OLL 1", "OLL 2"]);
  expect(store.get(routeAtom)).toEqual({ page: "training", autostart: true });
});

test("the case's other algorithms wait in a drawer, where choosing one makes it the one used", async () => {
  const store = await mount();
  await act(() => store.set(routeAtom, { page: "algorithms", caseId: "OLL 1" }));
  const drawer = () => renderer.root.findAllByType("Sheet" as any).find(sheet => sheet.props.title === "Algorithms of OLL 1")!;
  expect(drawer().props.open).toBe(false);
  await press("Choose an algorithm · 2");
  expect(drawer().props.open).toBe(true);
  const second = drawer().findAll((n: any) => n.type === "Pressable" && n.props.accessibilityRole === "button" && n.findAllByType("Alg" as any).some((alg: any) => alg.props.text === "R U2 R'"))[0]!;
  await act(() => second.props.onPress());
  expect(learnedCalls).toEqual([["OLL 1", true, ["R U2 R'"]]]);
  expect(drawer().props.open).toBe(false);
});

test("the search finds cases across the catalogue and opens one", async () => {
  const store = await mount();
  await press("Search cases");
  expect(store.get(routeAtom)).toEqual({ page: "algorithms", search: true });
  await act(() => renderer.root.findByType("SearchField" as any).props.onChangeText("pll"));
  expect(list().props.data.map((c: any) => c.id)).toEqual(["PLL Aa"]);
  await press("PLL Aa");
  expect(store.get(routeAtom)).toEqual({ page: "algorithms", caseId: "PLL Aa" });
  await act(() => { store.set(goBackAtom); });
  expect(store.get(routeAtom)).toEqual({ page: "algorithms", search: true });
  expect(renderer.root.findByType("SearchField" as any).props.value).toBe("pll");
});
