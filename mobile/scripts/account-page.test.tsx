import { afterEach, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createStore, Provider, useAtomValue } from "jotai";

// The account page with its cards, dialogs and native drawing replaced by host nodes: what is checked
// is which sections the overview shows, where they lead, and which filters each page offers.
mock.module("react-native", () => ({
  View: "View", Text: "Text", Pressable: "Pressable", ScrollView: "ScrollView",
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: { position: "absolute", inset: 0 } },
}));
const stored = new Map<string, string>();
mock.module("../src/platform/storage", () => ({ storage: {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => { stored.set(key, value); },
  removeItem: (key: string) => { stored.delete(key); },
} }));
const summary = (count: number) => ({ caseId: "", count, best: count ? 9980 : null, worst: null, mean: null, ao5: null, ao12: null, bestAo5: count ? 11453 : null, bestAo12: null, lastAt: count ? "2026-09-27T20:00:00Z" : null });
let timerCount = 3;
const history = () => Array.from({ length: timerCount }, (_, i) => ({ id: i + 1, time: 10000 + i * 500, timeMs: 10000 + i * 500, penalty: "none", comment: null, at: `2026-09-2${i + 1}T20:00:00Z`, best: 10000, sessionId: 1 }));
const cases = [{ id: "OLL 1", set: "oll", stage: "OLL", group: "Dots", name: "OLL 1" }, { id: "PLL Aa", set: "pll", stage: "PLL", group: "Corners", name: "Aa" }];
const sets = [{ id: "oll", stage: "OLL", label: "OLL" }, { id: "pll", stage: "PLL", label: "PLL" }];
const achievements = { unlocked: 1, total: 3, achievements: [
  { id: "a", title: "First solve", description: "", group: "General", ratio: 1, unlocked: true, detail: "1 / 1" },
  { id: "b", title: "10 solves", description: "", group: "General", ratio: 0.3, unlocked: false, detail: "3 / 10 solves" },
  { id: "c", title: "Sub-15", description: "", group: "3×3", ratio: 0.6, unlocked: false, detail: "Best 9.980" },
] };
const profileCalls: unknown[] = [];
mock.module("../src/api", () => ({ api: {}, authToken: {}, local: {
  current: () => null, learned: () => ["OLL 1"],
  read: {
    catalog: () => ({ cases, sets }),
    profile: (cube: string, filter: unknown) => {
      profileCalls.push({ cube, filter });
      return { user: guest, playground: { summary: summary(timerCount), history: history(), ao5: [], ao12: [] }, cases: [], totalSolves: timerCount, trainingSolves: 0, activeDays: 1 };
    },
    achievements: () => achievements,
  },
} }));
mock.module("../src/lib/duel", () => ({ battles: () => [], battleRecord: () => "", useDuel: () => ({}), ROUNDS: 5 }));
mock.module("../src/hooks/useLayout", () => ({ useLayout: () => ({ navSpace: 16, phone: true, short: false, width: 390, height: 844, pagePadding: 14 }) }));
mock.module("../src/hooks/usePreservedScroll", () => ({ usePreservedScroll: () => ({ ref: { current: null }, onScroll() {}, onContentSizeChange() {} }) }));
mock.module("../src/components/ProfileProgress", () => ({
  Activity: "Activity", MiniBars: "MiniBars", OverviewCard: "OverviewCard", ProfileCaseDialog: "ProfileCaseDialog", Ring: "Ring", Sparkline: "Sparkline", TrainingProgress: "TrainingProgress",
  plural: (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`,
}));
mock.module("../src/components/Achievements", () => ({ AchievementList: "AchievementList", AchievementTotal: "AchievementTotal" }));
mock.module("../src/components/Settings", () => ({ SettingsDialog: "SettingsDialog", AccountForm: "AccountForm" }));
mock.module("../src/components/TimesChart", () => ({ TimerStats: "TimerStats", TimesChart: "TimesChart" }));
mock.module("../src/components/PuzzlePicker", () => ({ PuzzleSelect: "PuzzleSelect" }));
mock.module("../src/components/Select", () => ({ Select: "Select" }));
mock.module("../src/components/ui", () => ({
  Avatar: "Avatar", Btn: "Btn", Empty: "Empty", Label: "Label",
  PageHead: ({ controls, ...props }: any) => createElement("PageHead", props, controls),
  mono: () => ({}),
}));
const guest = { id: "guest", username: "Guest", isGuest: true, createdAt: "2026-09-01T00:00:00Z" };
const { ProfilePage } = await import("../src/pages/AccountPage");
const { routeAtom, userAtom, profileFiltersAtom } = await import("../src/state");
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let renderer: ReactTestRenderer;
afterEach(async () => { if (renderer) await act(() => renderer.unmount()); timerCount = 3; });
function Routed() {
  const route = useAtomValue(routeAtom);
  return route.page === "profile" ? <ProfilePage mode={route.mode} group={route.group} /> : null;
}
async function mount(user = guest) {
  const store = createStore();
  store.set(userAtom, user);
  store.set(routeAtom, { page: "profile" });
  await act(() => { renderer = create(<Provider store={store}><Routed /></Provider>); });
  return store;
}
const all = (type: string) => renderer.root.findAllByType(type as any);
const head = () => all("PageHead")[0];
const card = (title: string) => all("OverviewCard").find(node => node.props.title === title)!;
const button = (label: string) => all("Btn").find(node => node.props.label === label)!;

test("the guest overview shows activity, timer, training and achievements, with sign-in buttons and the profile filters", async () => {
  await mount();
  expect(head().props.title).toBe("Guest");
  expect(head().props.sub).toBe("Times stay on this device");
  expect(all("Activity")).toHaveLength(1);
  expect(card("Timer").props.detail).toBe("Best of 3 solves · Normal");
  expect(all("Sparkline")).toHaveLength(1);
  expect(card("Training")).toBeDefined();
  expect(card("Achievements")).toBeDefined();
  // The event only, no scramble type on the overview.
  expect(all("PuzzleSelect")).toHaveLength(1);
  expect(all("Select").map(node => node.props.accessibilityLabel)).toEqual([]);
  const dialog = () => all("SettingsDialog")[0];
  expect(dialog().props.open).toBe(false);
  await act(() => button("Sign in").props.onPress());
  expect(dialog().props).toMatchObject({ open: true, authMode: "login" });
  await act(() => dialog().props.onClose());
  await act(() => button("Create account").props.onPress());
  expect(dialog().props).toMatchObject({ open: true, authMode: "register" });
});

test("a signed-in account shows its name and no sign-in buttons", async () => {
  await mount({ id: "u1", username: "vitrix", isGuest: false, createdAt: "2026-01-15T00:00:00Z" });
  expect(head().props.title).toBe("vitrix");
  expect(head().props.sub).toMatch(/^Joined /);
  expect(button("Sign in")).toBeUndefined();
  expect(button("Create account")).toBeUndefined();
});

test("each card opens its page, whose back button returns to the overview", async () => {
  const store = await mount();
  await act(() => card("Timer").props.onPress());
  expect(store.get(routeAtom)).toEqual({ page: "profile", mode: "playground" });
  expect(head().props.title).toBe("Timer");
  expect(head().props.sub).toBe("3×3");
  // The timer page adds the scramble type filter and shows the solve statistics.
  expect(all("Select").map(node => node.props.accessibilityLabel)).toEqual(["Scramble type"]);
  expect(all("TimerStats")[0].props.fill).toBe(true);
  await act(() => head().props.onBack());
  expect(store.get(routeAtom)).toEqual({ page: "profile" });

  await act(() => card("Training").props.onPress());
  expect(head().props.title).toBe("Training");
  expect(all("TrainingProgress")).toHaveLength(1);
  await act(() => head().props.onBack());

  await act(() => card("Achievements").props.onPress());
  expect(head().props.title).toBe("Achievements");
  expect(all("AchievementTotal")).toHaveLength(1);
  expect(all("AchievementList")).toHaveLength(1);
  await act(() => head().props.onBack());
  expect(store.get(routeAtom)).toEqual({ page: "profile" });
});

test("the profile filters change the profile's own selection", async () => {
  const store = await mount();
  profileCalls.length = 0;
  await act(() => all("PuzzleSelect")[0].props.onChange("222"));
  expect(store.get(profileFiltersAtom).cube).toBe("222");
  expect(profileCalls.at(-1)).toMatchObject({ cube: "222" });
  await act(() => all("PuzzleSelect")[0].props.onChange("333oh"));
  expect(store.get(profileFiltersAtom)).toMatchObject({ cube: "333", solveMode: "one-handed" });
  expect(profileCalls.at(-1)).toMatchObject({ cube: "333", filter: { solveMode: "one-handed" } });
});

test("an empty timer selection offers to open the timer", async () => {
  timerCount = 0;
  const store = await mount();
  expect(card("Timer").props.detail).toBe("No solves in this selection yet");
  expect(all("Sparkline")).toHaveLength(0);
  await act(() => card("Timer").props.onPress());
  const stats = all("TimerStats")[0];
  expect(stats.props.data.summary.count).toBe(0);
  // The empty state is passed to the statistics, which render it when there is no solve.
  let empty!: ReactTestRenderer;
  await act(() => { empty = create(stats.props.empty); });
  const open = empty.root.findAllByType("Btn" as any).find(node => node.props.label === "Open the timer")!;
  await act(() => open.props.onPress());
  await act(() => empty.unmount());
  expect(store.get(routeAtom)).toEqual({ page: "playground" });
});
