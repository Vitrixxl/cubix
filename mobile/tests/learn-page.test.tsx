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
  View: "View", Text: "Text", Pressable: "Pressable", ScrollView: "ScrollView", Linking: { openURL() {} },
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
/** The account's setup: it solves the 3×3 unless a test says otherwise; updates are recorded. */
const solver = { kind: "profile", knownPuzzles: ["333"], priority: null, completedAt: "2026-10-01T10:00:00.000Z" };
let journey: Record<string, any> = { profile: solver };
const journeyUpdates: any[] = [];
mock.module("../src/api", () => ({ api: { setLearned: async () => {}, updateJourney: async (changes: any) => { journeyUpdates.push(changes); }, algorithmChoices: async () => ({}) }, authToken: { get: () => "token" }, local: {
  current: () => ({ id: "u1", username: "u1", isGuest: false, createdAt: "" }), learned: () => ["2L-OLL I-Shape"], learnedAlg: () => ({}), learningGroupOrder: () => ({}), read: { catalog: () => ({ cases, sets }), stats: () => [], journey: () => journey, caseHistory: () => ({ summary: { count: 0 } }) },
} }));
mock.module("../src/components/CaseDiagram", () => ({ CaseDiagram: () => null }));
mock.module("../src/hooks/useLayout", () => ({ useLayout: () => ({ phone: true, width: 390, height: 844 }) }));
mock.module("../src/components/StaticCubeSvg", () => ({ StaticCubeSvg: () => null }));
mock.module("../src/components/PuzzlePicker", () => ({ SessionButton: () => null, PuzzleIcon: () => null }));
mock.module("../src/components/Sheet", () => ({ Sheet: ({ open, children }: any) => open ? createElement("Sheet", {}, children) : null, SheetScrollView: "SheetScrollView" }));
mock.module("../src/components/TimesChart", () => ({ TimerStats: () => null }));
mock.module("../src/components/AlgText", () => ({ sourceLabel: (source: string) => source }));
mock.module("../src/components/Practice", () => ({ CubePreview: () => null }));
mock.module("../src/components/GuidesDialog", () => ({ MethodsSheet: () => null }));
mock.module("../src/components/ui/button", () => ({ Button: "Button" }));
mock.module("../src/components/ui/badge", () => ({ Badge: "Badge" }));
mock.module("../src/components/AlgPlayer", () => ({ AlgPlayerSheet: "AlgPlayerSheet" }));
mockLucide();
mock.module("../src/components/ui/text", () => ({ Text: "Text" }));
mock.module("../src/components/ui/icon", () => ({ Icon: "Icon" }));
mock.module("../src/components/layout", () => Object.fromEntries(
  ["Alg", "BackButton", "Bar", "Choice", "Empty", "Figure", "GroupToggle", "HeadButton", "IconTile", "Label", "LearnToggle", "ListGroup", "ListRow", "ListSkeleton", "SectionHead", "StatusMark", "MenuItem", "Numeric", "MoreMenu", "Page", "PageHead", "SearchField", "Segmented", "Surface", "TouchAction", "TouchBar"].map(name => [name, name])));
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
/** The control whose accessible name starts with `label`, if shown. */
const control = (label: string) => renderer.root.findAll((n: any) => typeof n.props.accessibilityLabel === "string" && n.props.accessibilityLabel.startsWith(label) && typeof n.props.onPress === "function")[0];
const tap = async (label: string) => {
  const node = control(label);
  if (!node) throw new Error("No control " + label);
  await act(() => node.props.onPress());
};
const rows = () => renderer.root.findAllByType("FlatList" as any)[0]!.props.data;
/** The catalogue's cases the step shows, group box by group box. */
const tiles = () => rows().flatMap((row: any) => row.kind === "box" ? row.members.map((c: any) => c.id) : []);

test("the methods of the puzzle open as courses, remembered per account", async () => {
  const store = await mount();
  const buttons = renderer.root.findAll((n: any) => n.type === "Pressable" && /^Start /.test(n.props.accessibilityLabel ?? ""));
  expect(buttons.map(b => b.props.accessibilityLabel)).toEqual(["Start Beginner", "Start CFOP", "Start Roux", "Start ZZ"]);
  await press("Start CFOP");
  expect(store.get(routeAtom)).toEqual({ page: "learn", method: "cfop" });
  expect(store.get(learnMethodAtom)).toBe("cfop");
  expect(store.get(courseProgressAtom).methods).toEqual({ "333": "cfop" });
  // The cross is intuitive: nothing to train, its tips shown instead.
  expect(control("Train")).toBeUndefined();
  expect(rows()).toEqual([]);
});

test("a step lists its sets' cases, trains the shown set, and Next step only moves on", async () => {
  const store = await mount();
  await press("Start CFOP");
  // Next step shows the next one; a step is checked by its learned algorithms, not by moving on.
  await tap("Next step: F2L");
  expect(store.get(courseProgressAtom).courses["333:cfop"]).toEqual({ step: 1, learned: [] });
  await tap("Next step: OLL");
  expect(store.get(courseProgressAtom).courses["333:cfop"]!.step).toBe(2);
  // 2-Look OLL first, since some of its cases are still to learn; each group in a box with its learned count.
  expect(tiles()).toEqual(["2L-OLL I-Shape", "2L-OLL Sune"]);
  expect(rows().map((row: any) => row.name)).toEqual(["1: Edges", "2: Corners"]);
  // The learned filter hides the learned ones inside the step.
  const choice = (label: string) => renderer.root.findAllByType("Choice" as any).find((n: any) => n.props.label === label)!;
  await act(() => choice("Filter").props.onChange("not-learned"));
  expect(tiles()).toEqual(["2L-OLL Sune"]);
  await act(() => choice("Filter").props.onChange("all"));
  // A tile opens its case over the course.
  await tap("2L-OLL Sune");
  expect(renderer.root.findAll((n: any) => n.type === "Sheet").length).toBe(1);
  await act(() => choice("Set").props.onChange("oll"));
  expect(tiles()).toEqual(["OLL 1"]);
  // The set picked stays for the session, even after leaving the step.
  await tap("Previous step");
  await tap("Next step: OLL");
  expect(tiles()).toEqual(["OLL 1"]);
  await tap("Train OLL");
  expect(store.get(selectedCaseIdsAtom)).toEqual(["OLL 1"]);
  expect(store.get(routeAtom)).toEqual({ page: "training", autostart: true });
});

test("a beginner step teaches its own algorithms, plays them in 3D and keeps their learned marks", async () => {
  const store = await mount();
  await press("Start Beginner");
  await tap("Next step");
  const own = rows().filter((row: any) => row.kind === "alg");
  expect(own.map((row: any) => row.item.alg)).toEqual(["R U R' U'"]);
  await press("Mark Corner insertion learned");
  expect(store.get(courseProgressAtom).courses["333:beginner"]!.learned).toEqual(["first-layer-corners:corner-insertion"]);
  expect(rows()[0].item.learned).toBe(true);
  expect(control("Corner insertion learned")).toBeDefined();
  // The case diagram opens the 3D player on the algorithm, shown on its stage's cube.
  const sheet = () => renderer.root.findAllByType("AlgPlayerSheet" as any)[0]!;
  expect(sheet().props.index).toBeNull();
  await tap("Play Corner insertion in 3D");
  expect(sheet().props.index).toBe(0);
  expect(sheet().props.items[0]).toMatchObject({ name: "Corner insertion", algs: ["R U R' U'"], size: 3, mask: "F1L" });
  await act(() => sheet().props.onClose());
  expect(sheet().props.index).toBeNull();
  // Back to the methods: the beginner course now continues.
  await act(() => renderer.root.findAllByType("PageHead" as any)[0]!.props.lead.props.onPress());
  expect(store.get(routeAtom)).toEqual({ page: "learn" });
  expect(renderer.root.findAll((n: any) => n.props.accessibilityLabel === "Continue Beginner").length).toBeGreaterThan(0);
});

test("the yellow cross and yellow face cases play from their own setups; Finish completes the method", async () => {
  // A player who cannot solve the 3×3 yet: Finish records the puzzle as one they solve.
  journey = { profile: { ...solver, knownPuzzles: [] } };
  const store = await mount();
  await press("Start Beginner");
  for (let i = 0; i < 3; i++) await tap("Next step");
  const sheet = () => renderer.root.findAllByType("AlgPlayerSheet" as any)[0]!;
  expect(sheet().props.items.map((item: any) => item.name)).toEqual(["Dot", "L", "Line"]);
  expect(sheet().props.items[0]).toMatchObject({ mask: "EO", setup: "f U R U' R' f' F U R U' R' F'" });
  await tap("Next step: Yellow face");
  expect(sheet().props.items.map((item: any) => item.detail)).toEqual(["Sunes needed: 1", "Sunes needed: 2", "Sunes needed: 2", "Sunes needed: 2", "Sunes needed: 3", "Sunes needed: 3", "Sunes needed: 3"]);
  await tap("Next step: Last layer permutation");
  // The last step finishes the course: the page says so and offers what next.
  expect(control("Next step")).toBeUndefined();
  expect(control("Train")).toBeUndefined();
  await tap("Finish");
  expect(journeyUpdates.at(-1)).toEqual({ profile: { ...solver, knownPuzzles: ["333"], knownMethods: { "333": ["beginner"] } } });
  journey = { profile: solver };
  // Finishing marks nothing learned: the steps stay as their algorithms' marks say.
  expect(store.get(courseProgressAtom).courses["333:beginner"]).toEqual({ step: 5, learned: [] });
  expect(renderer.root.findAll((n: any) => n.type === "Text" && [n.props.children].flat().join("") === "Beginner done").length).toBeGreaterThan(0);
  await tap("Beginner done");
});

test("picking a puzzle opens its timer, even one the player cannot solve yet", async () => {
  const { pickEventAtom } = await import("../src/journey");
  const store = createStore();
  journey = { profile: solver };
  store.set(routeAtom, { page: "algorithms" });
  store.set(pickEventAtom, "444");
  expect(store.get(routeAtom)).toEqual({ page: "playground" });
  store.set(routeAtom, { page: "learn" });
  store.set(pickEventAtom, "333");
  expect(store.get(routeAtom)).toEqual({ page: "playground" });
});
