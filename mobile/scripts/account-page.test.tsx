import { afterEach, expect, mock, test } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createStore, Provider, useAtomValue } from "jotai";
import { mockLucide } from "../tests/lucide-mock";

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
const logout = mock(async () => ({ ok: true }));
mock.module("../src/api", () => ({ api: { logout }, authToken: { get: () => "token" }, local: {
  current: () => null, learned: () => ["OLL 1"],
  read: {
    journey: () => ({}), goals: () => [],
    catalog: () => ({ cases, sets }),
    profile: (cube: string, filter: unknown) => {
      profileCalls.push({ cube, filter });
      return { user: account, playground: { summary: summary(timerCount), history: history(), ao5: [], ao12: [] }, cases: [], totalSolves: timerCount, trainingSolves: 0, activeDays: 1 };
    },
    achievements: () => achievements,
  },
} }));
mock.module("../src/lib/duel", () => ({ battles: () => [], battleRecord: () => "", useDuel: () => ({}), ROUNDS: 5, RESULT_MARK: {}, ao5Text: String }));
mock.module("../src/hooks/usePreservedScroll", () => ({ usePreservedScroll: () => ({ ref: { current: null }, onScroll() {}, onContentSizeChange() {} }) }));
mockLucide();
mock.module("../src/components/ProfileProgress", () => ({
  ...Object.fromEntries(["AchievementBadge", "EmptyLine", "Goal", "Heatmap", "LatestSolves", "MoreLink", "ProfileCaseDialog", "Section", "Stat", "Stats", "SubHead", "Tag", "TrainingProgress", "Trend", "TrendLegend", "TwoTone"]
    .map(name => [name, name])),
}));
mock.module("../src/components/ProfileCard", () => Object.fromEntries(["EmptyLine", "MoreLink", "Section", "SubHead", "Tag"].map(name => [name, name])));
mock.module("../src/components/Achievements", () => ({ AchievementList: "AchievementList", AchievementTotal: "AchievementTotal" }));
mock.module("../src/components/TimesChart", () => ({ TimerStats: "TimerStats" }));
mock.module("../src/components/PuzzlePicker", () => ({ EventPicker: "EventPicker", ChoiceButton: "ChoiceButton" }));
mock.module("../src/components/UserAvatar", () => ({ UserAvatar: "UserAvatar" }));
mock.module("../src/components/ui/text", () => ({ Text: "Text" }));
mock.module("../src/components/ui/button", () => ({ Button: "Button" }));
mock.module("../src/components/ui/icon", () => ({ Icon: "Icon" }));
mock.module("../src/components/ui/tabs", () => ({ Tabs: "Tabs", TabsList: "TabsList", TabsTrigger: "TabsTrigger" }));
mock.module("../src/components/layout", () => Object.fromEntries(["Empty", "MenuItem", "Numeric", "MoreMenu", "Page", "PageHead"].map(name => [name, name])));
const account = { id: "u1", username: "vitrix", isGuest: false, createdAt: "2026-01-15T00:00:00Z" };
const { ProfilePage } = await import("../src/pages/AccountPage");
const { routeAtom, userAtom, profileFiltersAtom, settingsOpenAtom, guidesAtom } = await import("../src/state");
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let renderer: ReactTestRenderer;
afterEach(async () => { if (renderer) await act(() => renderer.unmount()); timerCount = 3; });
function Routed() {
  const route = useAtomValue(routeAtom);
  return route.page === "profile" ? <ProfilePage mode={route.mode} group={route.group} /> : null;
}
async function mount() {
  const store = createStore();
  store.set(userAtom, account);
  store.set(routeAtom, { page: "profile" });
  await act(() => { renderer = create(<Provider store={store}><Routed /></Provider>); });
  return store;
}
const all = (type: string) => renderer.root.findAllByType(type as any);
const head = () => all("PageHead")[0]!;
const card = (title: string) => all("Section").find(node => node.props.title === title)!;
const texts = () => all("Text").map(node => [node.props.children].flat().join(""));
const tabs = () => all("Tabs")[0]!;
const item = (label: string) => all("MenuItem").find(node => node.props.children === label)!;
const button = (label: string) => all("Button").find(node => node.props.accessibilityLabel === label || node.findAllByType("Text" as any).some(t => [t.props.children].flat().join("") === label))!;

test("the overview shows the account, its activity, timer, training, awards and battles, with the profile's puzzle", async () => {
  await mount();
  expect(texts()).toContain("vitrix");
  expect(texts().some(text => text.startsWith("Joined "))).toBe(true);
  // No page head on the overview: the user is its header.
  expect(all("PageHead")).toHaveLength(0);
  expect(tabs().props.value).toBe("overview");
  expect(all("TabsTrigger").map(node => node.props.value)).toEqual(["overview", "playground", "training", "achievements", "duels"]);
  expect(all("Heatmap")).toHaveLength(1);
  expect(card("Timer").props.meta).toBe("3 solves");
  expect(all("Trend")).toHaveLength(1);
  expect(all("LatestSolves")).toHaveLength(1);
  expect(card("Training").props.meta).toBe("1 of 2 learned");
  expect(card("Achievements").props.meta).toBe("1 of 3 unlocked");
  expect(card("Battles")).toBeDefined();
  expect(all("EventPicker")).toHaveLength(1);
  // The scramble type only on the timer section.
  expect(all("ChoiceButton")).toHaveLength(0);
});

test("the account's menu opens the settings and the guides; logging out is its own centred button at the end", async () => {
  const store = await mount();
  await act(() => item("Settings").props.onPress());
  expect(store.get(settingsOpenAtom)).toBe(true);
  await act(() => item("Guides").props.onPress());
  expect(store.get(guidesAtom)).toBe("about");
  expect(all("MenuItem").map(node => node.props.children)).toEqual(["Notation", "Guides", "Settings"]);
  const logOut = button("Log out");
  expect(logOut.props.className).toContain("w-full");
  expect(logOut.props.className).toContain("justify-center");
  // Last thing of the overview, apart from the identity row.
  const scroll = all("ScrollView")[0]!;
  const last = scroll.children.at(-1) as any;
  expect(last.findAllByType("Button" as any)[0]).toBe(logOut);
  await act(async () => logOut.props.onPress());
  expect(logout).toHaveBeenCalledTimes(1);
});

test("the overview reads as identity, figures, activity, then the sections", async () => {
  await mount();
  const titles = all("Section").map(node => node.props.title);
  expect(titles).toEqual(["Timer", "Training", "Achievements", "Battles"]);
  // The figures as an even grid of labelled cells, not a sentence.
  const figures = ["Solves", "Active day", "Day streak", "Cases learned", "Best single"];
  for (const label of figures) expect(texts()).toContain(label);
  expect(all("Numeric").map(node => node.props.children)).toEqual(expect.arrayContaining(["3", "1", "9.980"]));
});

test("the cards and the tabs switch sections without adding history", async () => {
  const store = await mount();
  await act(() => card("Timer").props.onMore());
  expect(store.get(routeAtom)).toEqual({ page: "profile", mode: "playground" });
  expect(tabs().props.value).toBe("playground");
  expect(head().props.title).toBe("Timer");
  expect(all("ChoiceButton").map(node => node.props.label)).toEqual(["Scramble type"]);
  expect(all("TimerStats")[0]!.props.fill).toBe(true);
  await act(() => tabs().props.onValueChange("training"));
  expect(store.get(routeAtom)).toEqual({ page: "profile", mode: "training" });
  expect(all("TrainingProgress")).toHaveLength(1);
  await act(() => tabs().props.onValueChange("achievements"));
  expect(all("AchievementTotal")).toHaveLength(1);
  expect(all("AchievementList")).toHaveLength(1);
  await act(() => tabs().props.onValueChange("overview"));
  expect(store.get(routeAtom)).toEqual({ page: "profile" });
});

test("the profile's puzzle changes the profile's own selection", async () => {
  const store = await mount();
  profileCalls.length = 0;
  await act(() => all("EventPicker")[0]!.props.onChange("222"));
  expect(store.get(profileFiltersAtom).cube).toBe("222");
  expect(profileCalls.at(-1)).toMatchObject({ cube: "222" });
  await act(() => all("EventPicker")[0]!.props.onChange("333oh"));
  expect(store.get(profileFiltersAtom)).toMatchObject({ cube: "333", solveMode: "one-handed" });
  expect(profileCalls.at(-1)).toMatchObject({ cube: "333", filter: { solveMode: "one-handed" } });
});

test("an empty timer selection offers to open the timer", async () => {
  timerCount = 0;
  const store = await mount();
  // No statistics link without a solve, but a way to the timer.
  expect(card("Timer").props.onMore).toBeUndefined();
  expect(all("Trend")).toHaveLength(0);
  await act(() => tabs().props.onValueChange("playground"));
  const stats = all("TimerStats")[0]!;
  expect(stats.props.data.summary.count).toBe(0);
  // The empty state is passed to the statistics, which render it when there is no solve.
  let empty!: ReactTestRenderer;
  await act(() => { empty = create(stats.props.empty); });
  const open = empty.root.findAllByType("Button" as any)[0]!;
  await act(() => open.props.onPress());
  await act(() => empty.unmount());
  expect(store.get(routeAtom)).toEqual({ page: "playground" });
});
