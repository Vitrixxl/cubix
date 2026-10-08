import { afterEach, expect, mock, test } from "bun:test";
import { createStore, Provider } from "jotai";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { mockLucide } from "../tests/lucide-mock";
import { createElement } from "react";

const timing = mock(() => ({ start: mock(), stop: mock() }));
class Value {
  constructor(public value: number) {}
  setValue(value: number) { this.value = value; }
  interpolate(config: unknown) { return config; }
}
mock.module("react-native", () => ({
  View: "View", Pressable: "Pressable", Animated: { View: "AnimatedView", Value, timing, spring: () => ({ start() {}, stop() {} }) },
  Easing: { bezier: () => (v: number) => v }, StyleSheet: { create: (s: unknown) => s, absoluteFill: {} },
}));
mock.module("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
mock.module("expo-haptics", () => ({ selectionAsync: async () => {} }));
mock.module("../src/platform/storage", () => ({ storage: { getItem: () => null, setItem() {}, removeItem() {} } }));
mock.module("../src/api", () => ({ api: {}, authToken: { get: () => "token" }, local: { current: () => null } }));
mock.module("../src/hooks/useLayout", () => ({ useLayout: () => ({ width: 390 }) }));
mock.module("../src/hooks/useReducedMotion", () => ({ useReducedMotion: () => false }));
mock.module("../src/components/ui/text", () => ({ Text: "Text" }));
mock.module("../src/components/ui/icon", () => ({ Icon: "Icon" }));
mock.module("../src/components/UserAvatar", () => ({ UserAvatar: "UserAvatar" }));
mockLucide();
const { TabBar } = await import("../src/components/TabBar");
const { PageStack } = await import("../src/components/PageStack");
const { settledPageAtom } = await import("../src/tour");
import type { Route } from "../src/state";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).requestAnimationFrame = (run: (time: number) => void) => { run(0); return 0; };
(globalThis as any).cancelAnimationFrame = () => {};
let renderer: ReactTestRenderer;
afterEach(async () => { if (renderer) await act(() => renderer.unmount()); timing.mockClear(); });

test("tab presses navigate synchronously, including consecutive taps", async () => {
  const navigate = mock();
  await act(() => { renderer = create(<Provider><TabBar active="timer" waiting={{ coaching: 2 }} onNavigate={navigate} /></Provider>); });
  const press = (label: string) => renderer.root.findAllByType("Pressable" as any).find(n => n.props.accessibilityLabel === label)!.props.onPress();
  await act(() => {
    press("Account");
    expect(navigate.mock.calls).toEqual([["profile"]]);
    press("Algs");
    expect(navigate.mock.calls).toEqual([["profile"], ["algorithms"]]);
  });
});

test("the web phone's seven tabs, named under their icons, with a dot where something waits", async () => {
  await act(() => { renderer = create(<Provider><TabBar active="timer" waiting={{ coaching: 2 }} onNavigate={() => {}} /></Provider>); });
  const tabs = renderer.root.findAllByType("Pressable" as any);
  expect(tabs.map(n => n.props.accessibilityLabel)).toEqual(["Timer", "Algs", "Learn", "Train", "Duel", "Coach", "Account"]);
  expect(tabs.map(n => n.props.accessibilityValue?.text ?? null)).toEqual([null, null, null, null, null, "2 unread", null]);
});

test("switching tabs shows only the destination immediately and settles the guided tour", async () => {
  const store = createStore();
  const page = (route: Route) => <PageStack route={route} render={r => createElement("screen", { name: r.page })} />;
  await act(() => { renderer = create(<Provider store={store}>{page({ page: "playground" })}</Provider>); });
  for (const name of ["profile", "learn", "training", "playground"] as const) {
    await act(() => renderer.update(<Provider store={store}>{page({ page: name })}</Provider>));
    expect(renderer.root.findAllByType("screen" as any).map(n => n.props.name)).toEqual([name]);
    expect(store.get(settledPageAtom)).toBe(name);
    expect(timing).not.toHaveBeenCalled();
  }
});

test("a tab press interrupts a detail transition without leaving the old screen mounted", async () => {
  const store = createStore();
  const page = (route: Route) => <Provider store={store}><PageStack route={route} render={r => createElement("screen", { name: r.page })} /></Provider>;
  await act(() => { renderer = create(page({ page: "profile" })); });
  await act(() => renderer.update(page({ page: "community" })));
  expect(timing).toHaveBeenCalledTimes(1);
  expect(renderer.root.findAllByType("screen" as any)).toHaveLength(2);
  await act(() => renderer.update(page({ page: "learn" })));
  expect(renderer.root.findAllByType("screen" as any).map(n => n.props.name)).toEqual(["learn"]);
  expect(store.get(settledPageAtom)).toBe("learn");
});
