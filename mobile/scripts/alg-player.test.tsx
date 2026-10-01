import { afterEach, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createStore, Provider } from "jotai";
import { mockLucide } from "../tests/lucide-mock";

// The real player sheet and notation sheet, with native drawing replaced by host nodes and frames run by timers.
let responders = 0;
mock.module("react-native", () => ({
  View: "View", Text: "Text", Pressable: "Pressable", ScrollView: "ScrollView",
  PanResponder: { create: (config: any) => { responders++; return { panHandlers: { config } }; } },
}));
mock.module("react-native-svg", () => ({ default: "Svg", Polygon: "Polygon", Polyline: "Polyline" }));
const stored = new Map<string, string>();
mock.module("../src/platform/storage", () => ({ storage: {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => { stored.set(key, value); },
  removeItem: (key: string) => { stored.delete(key); },
} }));
mock.module("../src/api", () => ({ api: {}, authToken: { get: () => "token" }, local: {
  current: () => null, learned: () => [], read: { catalog: () => ({ cases: [], sets: [] }), stats: () => [] },
} }));
mock.module("../src/components/Sheet", () => ({
  Sheet: ({ open, children, contentPanning }: any) => open ? createElement("Sheet", { contentPanning }, children) : null,
  SheetScrollView: "SheetScrollView",
}));
mockLucide();
mock.module("../src/components/ui/text", () => ({ Text: "Text" }));
mock.module("../src/components/ui/icon", () => ({ Icon: "Icon" }));
mock.module("../src/components/layout", () => Object.fromEntries(["Choice", "Label", "Numeric"].map(name => [name, name])));
(globalThis as any).requestAnimationFrame = (callback: (time: number) => void) => setTimeout(() => callback(performance.now()), 8) as unknown as number;
(globalThis as any).cancelAnimationFrame = (frame: number) => clearTimeout(frame);
const { AlgPlayerSheet } = await import("../src/components/AlgPlayer");
const { NotationSheet } = await import("../src/components/Notation");
const { notationAtom } = await import("../src/state");
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer;
afterEach(async () => { if (renderer) await act(() => renderer.unmount()); });

const SUNE = { key: "sune", name: "Sune", algs: ["(R U R' U R U2 R')", "R U R' U R U' R' U R U2 R'"], size: 3, mask: "OLL" as const, setup: "R U2 R' U' R U' R'" };
const byLabel = (label: string) => renderer.root.findAll((n: any) => n.props.accessibilityLabel === label && typeof n.props.onPress === "function")[0]!;
const lit = () => renderer.root.findAll((n: any) => n.props.accessibilityState?.selected === true && /^Move /.test(n.props.accessibilityLabel)).map((n: any) => n.props.accessibilityLabel);
/** What the cube shows: every sticker's place and colour, in painting order. */
const polygons = () => renderer.root.findAllByType("Polygon" as any).map((n: any) => n.props.fill + n.props.points).join("|");

test("the sheet plays the case: moves lit as they turn, stepping, alternatives, and the cube drawn from the shared shapes", async () => {
  let index: number | null = 0;
  const render = () => createElement(AlgPlayerSheet, { items: [SUNE, { ...SUNE, key: "h", name: "H" }], index, onIndex: (i: number) => { index = i; }, onClose: () => { index = null; } });
  await act(() => { renderer = create(render()); });
  // Dragging the cube must not move the sheet.
  expect(renderer.root.findByType("Sheet" as any).props.contentPanning).toBe(false);
  expect(renderer.root.findAllByType("Polygon" as any).length).toBeGreaterThanOrEqual(28);
  const start = polygons();
  expect(lit()).toEqual([]);
  const scrubber = () => renderer.root.findAll((n: any) => n.props.accessibilityRole === "adjustable")[0]!;
  await act(() => scrubber().props.onLayout({ nativeEvent: { layout: { width: 200 } } }));
  const drag = scrubber().props.config;
  await act(() => drag.onPanResponderGrant({ nativeEvent: { locationX: 50 } }));
  expect(scrubber().props.accessibilityValue.now).toBe(2);
  expect(scrubber().props.config).toBe(drag);
  await act(() => drag.onPanResponderMove({ nativeEvent: { locationX: 100 } }));
  expect(scrubber().props.accessibilityValue.now).toBe(4);
  await act(() => drag.onPanResponderRelease({ nativeEvent: { locationX: 200 } }));
  expect(scrubber().props.accessibilityValue.now).toBe(7);
  await act(() => byLabel("Restart").props.onPress());
  // A tap on a move turns it: the third move, R', is lit once turned.
  await act(async () => { byLabel("Move R'").props.onPress(); await Bun.sleep(900); });
  expect(lit()).toEqual(["Move R'"]);
  expect(polygons() === start).toBe(false);
  await act(async () => { byLabel("Previous move").props.onPress(); await Bun.sleep(900); });
  expect(lit()).toEqual(["Move U"]);
  await act(async () => { byLabel("Restart").props.onPress(); });
  expect(lit()).toEqual([]);
  expect(polygons() === start).toBe(true);
  // Speed cycles 1× → 2× → 0.5×.
  await act(() => byLabel("Speed 1×").props.onPress());
  expect(byLabel("Speed 2×")).toBeDefined();
  // The alternative is played on its own.
  await act(() => renderer.root.findByType("Choice" as any).props.onChange("1"));
  expect(renderer.root.findAll((n: any) => /^Move /.test(n.props.accessibilityLabel ?? "")).length).toBe(11);
  // Next algorithm.
  await act(() => byLabel("Next algorithm").props.onPress());
  expect(index).toBe(1);
  // Double tap on the cube resets the view; a drag turns it.
  const cube = renderer.root.findAll((n: any) => n.props.accessibilityRole === "image")[0]!;
  const config = cube.props.config ?? renderer.root.findAll((n: any) => n.props.config)[0]!.props.config;
  const before = polygons();
  await act(() => {
    config.onPanResponderGrant({ nativeEvent: { pageX: 0, pageY: 0 } });
    config.onPanResponderMove({ nativeEvent: { pageX: 40, pageY: 10 } });
  });
  expect(polygons() === before).toBe(false);
  await act(() => {
    config.onPanResponderRelease({}, { dx: 0, dy: 0 });
    config.onPanResponderRelease({}, { dx: 0, dy: 0 });
  });
  expect(polygons() === before).toBe(true);
});

test("the notation sheet shows every face with its three moves; a tile plays its move on the cube", async () => {
  const store = createStore();
  store.set(notationAtom, true);
  await act(() => { renderer = create(createElement(Provider, { store }, createElement(NotationSheet))); });
  const tile = (move: string) => renderer.root.findAll((n: any) => typeof n.props.accessibilityLabel === "string" && n.props.accessibilityLabel.startsWith(move + ": ") && n.props.accessibilityRole === "button")[0]!;
  for (const move of ["U", "U'", "U2", "D'", "R2", "M'", "x2", "Rw'"]) expect(tile(move), move).toBeDefined();
  expect(tile("R").props.accessibilityState.selected).toBe(true);
  await act(() => tile("L'").props.onPress());
  expect(tile("L'").props.accessibilityState.selected).toBe(true);
  expect(renderer.root.findAll((n: any) => n.type === "Text" && n.props.children === "Left: the left face, counter-clockwise").length).toBe(1);
  expect(renderer.root.findAllByType("Polygon" as any).length).toBeGreaterThanOrEqual(28);
  // Other puzzles get their notation in words.
  await act(() => renderer.root.findByType("Choice" as any).props.onChange("sq1"));
  expect(renderer.root.findAllByType("Polygon" as any).length).toBe(0);
  expect(renderer.root.findAll((n: any) => n.props.children === "Slash").length).toBe(1);
  expect(responders).toBeGreaterThan(0);
});
