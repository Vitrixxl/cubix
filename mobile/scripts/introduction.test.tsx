import { expect, mock, test } from "bun:test";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { atom, createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { TOUR_STEPS, journeyProfile, personalGoals, type Journey } from "../../src/client/lib/journey";
import { mockLucide } from "../tests/lucide-mock";

const account = { id: "native-user", isGuest: false };
const userAtom = atom(account), statsVersionAtom = atom(0), eventAtom = atom("333"), puzzleAtom = atom("333"), scrambleTypeAtom = atom("normal"), replaceRouteAtom = atom({ page: "playground" });
const routeAtom = atom({ page: "playground" }), courseProgressAtom = atom({ methods: {}, courses: {} });
const store = createStore();
let saved: Journey = {};
mock.module("../src/state", () => ({ userAtom, statsVersionAtom, eventAtom, puzzleAtom, scrambleTypeAtom, replaceRouteAtom, routeAtom, courseProgressAtom }));
mock.module("../src/api", () => ({ api: {
  updateJourney: async (changes: Journey) => { saved = { ...saved, ...changes }; store.set(statsVersionAtom, n => n + 1); return saved; },
}, local: { current: () => account, restore: async () => {}, read: {
  journey: () => saved,
  goals: () => personalGoals(saved).map(([key, goal]) => ({ key, goal, progress: { complete: false, ratio: 0, detail: "No solve yet" } })),
  catalog: () => ({ cases: [], sets: [] }),
} } }));
mock.module("react-native", () => ({ View: "View", ScrollView: "ScrollView", Pressable: "Pressable", Modal: "Modal", KeyboardAvoidingView: "KeyboardAvoidingView", Platform: { OS: "android" },
  useWindowDimensions: () => ({ width: 360, height: 640 }), Keyboard: { dismiss() {} },
  AccessibilityInfo: { isReduceMotionEnabled: async () => true, addEventListener: () => ({ remove() {} }), announceForAccessibility() {} },
  Animated: { View: "AnimatedView", Value: class { setValue() {} interpolate() { return 0; } }, timing: () => ({ start() {}, stop() {} }) },
}));
mock.module("react-native-svg", () => ({ default: "Svg", Path: "Path" }));
mock.module("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 16 }) }));
mock.module("../src/components/ui/button", () => ({ Button: "Button" }));
mock.module("../src/components/ui/text", () => ({ Text: "Text" }));
mock.module("../src/components/ui/input", () => ({ Input: "Input" }));
mock.module("../src/components/ui/icon", () => ({ Icon: "Icon" }));
// The card renders its heading controls and body in place, so the goals' "Add goal" is reachable.
mock.module("../src/components/ProfileCard", () => ({
  Section: ({ aside, children }: { aside?: ReactNode; children?: ReactNode }) => <>{aside}{children}</>,
  EmptyLine: "EmptyLine", Tag: "Tag",
}));
mockLucide();
const { Introduction, dockSide, roundedRect } = await import("../src/components/Introduction");
const { PersonalGoals } = await import("../src/components/PersonalGoals");
const { introductionAtom, editingGoalAtom } = await import("../src/journey");
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer;
const nodes = (type: string) => renderer.root.findAllByType(type as any);
const label = (n: ReactTestInstance) => n.findAllByType("Text" as any).map(t => [t.props.children].flat().join(""));
const button = (text: string) => nodes("Button").find(n => n.props.accessibilityLabel === text || label(n).includes(text))!;
const choice = (text: string) => nodes("Pressable").find(n => label(n).includes(text))!;
const header = () => nodes("Text").find(n => n.props.accessibilityRole === "header")!.props.children;

test("native onboarding: welcome, then the puzzles and methods the player can solve, then the tour", async () => {
  try {
    await act(async () => { renderer = create(<Provider store={store}><Introduction /></Provider>); });
    expect(store.get(introductionAtom)).toBe("setup");
    expect(nodes("Modal")).toHaveLength(0);
    // A first setup cannot be dismissed.
    expect(button("Close")).toBeUndefined();
    expect(header()).toBe("Welcome to Cubix");
    await act(() => button("Get started").props.onPress());

    // No level any more: only what can be solved.
    expect(header()).toBe("What can you solve?");
    expect(choice("Ortega")).toBeUndefined();
    await act(() => choice("4×4").props.onPress());
    await act(() => choice("Yau").props.onPress());
    // Unpicking a puzzle drops its methods.
    await act(() => choice("4×4").props.onPress());
    expect(choice("Yau")).toBeUndefined();
    await act(() => choice("2×2").props.onPress());
    // The methods of a chosen puzzle show under the tiles right away.
    await act(() => choice("Ortega").props.onPress());
    expect(choice("Ortega").props.accessibilityState.checked).toBe(true);
    await act(async () => button("Start the tour").props.onPress());
    expect(journeyProfile(saved)).toEqual({ kind: "profile", knownPuzzles: ["222"], knownMethods: { "222": ["ortega"] }, priority: null, completedAt: expect.any(String) });
    expect(personalGoals(saved)).toHaveLength(0);
    // The 3×3 cannot be solved yet: the app switches to the 2×2, which can.
    expect(store.get(eventAtom)).toBe("222");
    expect(store.get(introductionAtom)).toBe("tour");

    // The tour opens each step's page, with step dots and "n / N".
    for (const [i, step] of TOUR_STEPS.entries()) {
      expect(store.get(replaceRouteAtom).page).toBe(step.page);
      expect(nodes("Text").some(n => [n.props.children].flat().join("") === `${i + 1} / ${TOUR_STEPS.length}`)).toBe(true);
      await act(() => button(i === TOUR_STEPS.length - 1 ? "Done" : "Next").props.onPress());
    }
    expect(store.get(introductionAtom)).toBeNull();
    await act(() => renderer.unmount());

    // A saved account skips automatic setup on the next mount.
    await act(async () => { renderer = create(<Provider store={store}><PersonalGoals /><Introduction /></Provider>); });
    expect(store.get(introductionAtom)).toBeNull();
    await act(() => button("Add goal").props.onPress());
    expect(store.get(introductionAtom)).toBe("goal");
    const input = nodes("Input").find(n => n.props.accessibilityLabel === "Target (seconds)")!;
    await act(() => input.props.onChangeText("0"));
    const submit = () => nodes("Button").filter(n => label(n).includes("Add goal")).at(-1)!;
    await act(() => submit().props.onPress());
    expect(personalGoals(saved)).toHaveLength(0);
    await act(() => input.props.onChangeText("15"));
    await act(async () => submit().props.onPress());
    expect(personalGoals(saved)).toHaveLength(1);
    const edit = nodes("Button").find(n => String(n.props.accessibilityLabel).startsWith("Edit "))!;
    await act(() => edit.props.onPress());
    expect(store.get(editingGoalAtom)).toBe(personalGoals(saved)[0]![0]);
    await act(() => nodes("Input")[0]!.props.onChangeText("12"));
    await act(async () => button("Save goal").props.onPress());
    expect(personalGoals(saved)[0]![1]).toMatchObject({ targetMs: 12000 });
    await act(async () => nodes("Button").find(n => String(n.props.accessibilityLabel).startsWith("Delete "))!.props.onPress());
    expect(personalGoals(saved)).toHaveLength(0);

    // Opened again from the account, the setup opens on the puzzles, can be closed, and saves without the tour.
    await act(() => store.set(introductionAtom, "setup"));
    expect(button("Close")).toBeDefined();
    expect(header()).toBe("What can you solve?");
    expect(choice("2×2").props.accessibilityState.checked).toBe(true);
    await act(() => choice("3×3").props.onPress());
    expect(button("Start the tour")).toBeUndefined();
    await act(async () => button("Save").props.onPress());
    expect(journeyProfile(saved)).toMatchObject({ knownPuzzles: ["222", "333"], knownMethods: { "222": ["ortega"] } });
    expect(store.get(introductionAtom)).toBeNull();
    expect(store.get(replaceRouteAtom).page).toBe("playground");
  } finally { await act(() => renderer.unmount()); }
});

test("the tour card docks on the side with the most room around the highlighted view", () => {
  // A view high on the page leaves the card the bottom; a low one sends it to the top; no view: bottom.
  expect(dockSide({ x: 0, y: 60, width: 300, height: 120 }, 24, 700)).toBe("bottom");
  expect(dockSide({ x: 0, y: 420, width: 300, height: 200 }, 24, 700)).toBe("top");
  expect(dockSide(null, 24, 700)).toBe("bottom");
  expect(roundedRect({ x: 10, y: 20, width: 100, height: 40 }, 12)).toStartWith("M22 20H98A12 12");
});
