import { afterEach, expect, mock, test } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { atom, createStore, Provider, useAtomValue } from "jotai";
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
const exportData = mock(async (_kind: string) => {});
mock.module("../src/api", () => ({ api: { logout }, authToken: { get: () => "token" }, local: {
  current: () => null, learned: () => ["OLL 1"],
  read: {
    journey: () => ({}), goals: () => [],
    catalog: () => ({ cases, sets }),
    profile: (cube: string, filter: unknown) => {
      profileCalls.push({ cube, filter });
      return { user: account, playground: { summary: summary(timerCount), history: history(), ao5: [], ao12: [] }, cases: [], totalSolves: timerCount, trainingSolves: 2, activeDays: 1 };
    },
    achievements: () => achievements,
  },
} }));
mock.module("../src/lib/duel", () => ({ battles: () => [], battleRecord: () => "", useDuel: () => ({}), ROUNDS: 5, RESULT_MARK: {}, ao5Text: String }));
mock.module("../src/lib/files", () => ({ exportData }));
mock.module("../src/hooks/usePreservedScroll", () => ({ usePreservedScroll: () => ({ ref: { current: null }, onScroll() {}, onContentSizeChange() {} }) }));
mockLucide();
mock.module("../src/components/ProfileProgress", () => ({
  ...Object.fromEntries(["AchievementBadge", "EmptyLine", "Goal", "Heatmap", "LatestSolves", "MoreLink", "ProfileCaseDialog", "Section", "Stat", "Stats", "SubHead", "Tag", "TrainingProgress", "Trend", "TrendLegend", "TwoTone"]
    .map(name => [name, name])),
}));
mock.module("../src/components/ProfileCard", () => Object.fromEntries(["EmptyLine", "MoreLink", "Section", "SubHead", "Tag"].map(name => [name, name])));
mock.module("../src/components/Achievements", () => ({ AchievementList: "AchievementList", AchievementTotal: "AchievementTotal" }));
mock.module("../src/components/ImportTimes", () => ({ ImportTimes: "ImportTimes" }));
mock.module("../src/components/Sheet", () => ({ Sheet: "Sheet" }));
mock.module("../src/components/Toast", () => ({ toastAtom: atom(null) }));
mock.module("../src/components/TimesChart", () => ({ TimerStats: "TimerStats" }));
mock.module("../src/components/PuzzlePicker", () => ({ EventPicker: "EventPicker", ChoiceButton: "ChoiceButton" }));
mock.module("../src/components/UserAvatar", () => ({ UserAvatar: "UserAvatar" }));
mock.module("../src/components/ui/text", () => ({ Text: "Text" }));
mock.module("../src/components/ui/button", () => ({ Button: "Button" }));
mock.module("../src/components/ui/icon", () => ({ Icon: "Icon" }));
mock.module("../src/components/ui/skeleton", () => ({ Skeleton: "Skeleton" }));
mock.module("../src/components/ui/tabs", () => ({ Tabs: "Tabs", TabsList: "TabsList", TabsTrigger: "TabsTrigger" }));
mock.module("../src/components/layout", () => Object.fromEntries(["Bar", "Empty", "Figure", "ListGroup", "ListRow", "ListSkeleton", "MenuItem", "MoreMenu", "Numeric", "Page", "PageHead", "SectionHead", "Surface"].map(name => [name, name])));
const account = { id: "u1", username: "vitrix", isGuest: false, createdAt: "2026-01-15T00:00:00Z" };
const { ProfilePage } = await import("../src/pages/AccountPage");
const { routeAtom, userAtom, profileFiltersAtom, settingsOpenAtom, guidesAtom, notationAtom, statsVersionAtom, deletedSolveIdAtom } = await import("../src/state");
const { profileDataAtom, profileAchievementsAtom } = await import("../src/profile");
const { settledPageAtom } = await import("../src/tour");
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
// The sections under the fold come a frame later: here, at once.
(globalThis as any).requestAnimationFrame = (run: (time: number) => void) => { run(0); return 0; };
(globalThis as any).cancelAnimationFrame = () => {};

let renderer: ReactTestRenderer;
/** The profile is prepared after a painted frame: let it land. */
const prepared = () => act(() => new Promise(resolve => setTimeout(resolve, 5)));
afterEach(async () => { if (renderer) await act(() => renderer.unmount()); timerCount = 3; });
function Routed() {
  const route = useAtomValue(routeAtom);
  return route.page === "profile" ? <ProfilePage mode={route.mode} group={route.group} /> : null;
}
async function mount() {
  const store = createStore();
  store.set(userAtom, account);
  store.set(routeAtom, { page: "profile" });
  store.set(settledPageAtom, "profile");
  await act(() => { renderer = create(<Provider store={store}><Routed /></Provider>); });
  await prepared();
  return store;
}
const all = (type: string) => renderer.root.findAllByType(type as any);
const head = () => all("PageHead")[0]!;
const card = (label: string) => all("Section").find(node => node.props.label === label)!;
const texts = () => all("Text").map(node => [node.props.children].flat().join(""));
const item = (label: string) => all("MenuItem").find(node => node.props.children === label)!;
const row = (title: string) => all("ListRow").find(node => node.props.title === title)!;
const picker = () => card("Timer").props.title;

test("the overview shows the account, its activity, timer, training, awards and battles, with the profile's puzzle", async () => {
  await mount();
  expect(texts()).toContain("vitrix");
  expect(texts().some(text => text.startsWith("Joined "))).toBe(true);
  // The sections as tabs on top, as on the web's phone; no page head on the overview.
  expect(all("TabsTrigger").map(node => node.props.value)).toEqual(["overview", "playground", "training", "achievements", "duels"]);
  expect(all("Tabs")[0]!.props.value).toBe("overview");
  expect(all("PageHead")).toHaveLength(0);
  expect(all("Heatmap")).toHaveLength(1);
  // The timer card's title picks its event.
  expect(picker().type).toBe("EventPicker");
  expect(card("Timer").props.onMore).toBeDefined();
  expect(all("Trend")).toHaveLength(1);
  expect(all("LatestSolves")).toHaveLength(1);
  expect(card("Training").props.meta).toBe("1 of 2 learned");
  expect(card("Achievements").props.meta).toBe("1 of 3 unlocked");
  expect(card("Battles")).toBeDefined();
  // The scramble type only on the timer section.
  expect(all("ChoiceButton")).toHaveLength(0);
});

test("opening the profile never works it out during its render: placeholders first, the figures a frame later", async () => {
  const store = createStore();
  store.set(userAtom, account);
  store.set(routeAtom, { page: "profile" });
  store.set(settledPageAtom, "profile");
  profileCalls.length = 0;
  await act(() => { renderer = create(<Provider store={store}><Routed /></Provider>); });
  expect(profileCalls).toHaveLength(0);
  expect(texts()).toContain("vitrix");
  expect(all("Heatmap")).toHaveLength(0);
  expect(all("Section").map(node => [node.props.label, node.props.meta])).toEqual(expect.arrayContaining([["Timer", undefined], ["Achievements", undefined]]));
  await prepared();
  expect(profileCalls).toHaveLength(1);
  expect(all("Heatmap")).toHaveLength(1);
  expect(card("Achievements").props.meta).toBe("1 of 3 unlocked");
});

test("the identity's menu: import, exports, notation, guides and settings; signing out closes the overview", async () => {
  const store = await mount();
  expect(all("MenuItem").map(node => node.props.children)).toEqual(["Import times", "Export my solves (CSV)", "Export all my data (JSON)", "Notation", "Guides", "Settings"]);
  await act(() => item("Settings").props.onPress());
  expect(store.get(settingsOpenAtom)).toBe(true);
  await act(() => item("Guides").props.onPress());
  expect(store.get(guidesAtom)).toBe("about");
  await act(() => item("Notation").props.onPress());
  expect(store.get(notationAtom)).toBe(true);
  await act(() => item("Export my solves (CSV)").props.onPress());
  await act(() => item("Export all my data (JSON)").props.onPress());
  expect(exportData.mock.calls.map(call => call[0])).toEqual(["csv", "json"]);
  const importSheet = () => all("Sheet").find(node => node.props.title === "Import times")!;
  expect(importSheet().props.open).toBe(false);
  await act(() => item("Import times").props.onPress());
  expect(importSheet().props.open).toBe(true);
  const logOut = all("Button").find(node => node.findAllByType("Text" as any).some(t => t.props.children === "Log out"))!;
  await act(async () => { logOut.props.onPress(); await Promise.resolve(); });
  expect(logout).toHaveBeenCalled();
});

test("messages and tournaments open from the account page", async () => {
  const store = await mount();
  await act(() => row("Messages").props.onPress());
  expect(store.get(routeAtom)).toEqual({ page: "community" });
  await act(() => store.set(routeAtom, { page: "profile" }));
  await act(() => row("Tournaments").props.onPress());
  expect(store.get(routeAtom)).toEqual({ page: "tournaments" });
});

test("the identity's figures are the web's, every event together, two by two", async () => {
  await mount();
  const cells = all("Figure");
  expect(cells.map(node => node.props.label)).toEqual(expect.arrayContaining(["Solves", "Active days", "Streak", "Best streak", "This week", "Trained"]));
  const value = (label: string) => cells.find(node => node.props.label === label)!.props.value;
  expect([value("Solves"), value("Active days"), value("Trained")]).toEqual(["3", "3", "2"]);
});

test("a card opens its section's tab, and the tabs switch the section in place", async () => {
  const store = await mount();
  await act(() => card("Timer").props.onMore());
  expect(store.get(routeAtom)).toEqual({ page: "profile", mode: "playground" });
  expect(all("Tabs")[0]!.props.value).toBe("playground");
  expect(head().props.title).toBe("Timer");
  expect(all("ChoiceButton").map(node => node.props.label)).toEqual(["Scramble type"]);
  expect(all("TimerStats")[0]!.props.fill).toBe(true);
  await act(() => all("Tabs")[0]!.props.onValueChange("overview"));
  expect(store.get(routeAtom)).toEqual({ page: "profile" });
  await act(() => card("Training").props.onMore());
  expect(all("TrainingProgress")).toHaveLength(1);
  await act(() => all("Tabs")[0]!.props.onValueChange("achievements"));
  expect(store.get(routeAtom)).toEqual({ page: "profile", mode: "achievements" });
  expect(head().props.title).toBe("Achievements");
  expect(all("AchievementTotal")).toHaveLength(1);
  expect(all("AchievementList")).toHaveLength(1);
  await act(() => all("Tabs")[0]!.props.onValueChange("duels"));
  expect(head().props.title).toBe("Battles");
  expect(all("Empty").some(node => node.props.title === "No battles yet")).toBe(true);
});

test("the profile's puzzle changes the profile's own selection", async () => {
  const store = await mount();
  profileCalls.length = 0;
  await act(() => picker().props.onChange("222"));
  await prepared();
  expect(store.get(profileFiltersAtom).cube).toBe("222");
  expect(profileCalls.at(-1)).toMatchObject({ cube: "222" });
  await act(() => picker().props.onChange("333oh"));
  await prepared();
  expect(store.get(profileFiltersAtom)).toMatchObject({ cube: "333", solveMode: "one-handed" });
  expect(profileCalls.at(-1)).toMatchObject({ cube: "333", filter: { solveMode: "one-handed" } });
});

test("prepared profile data survives page changes and unmounts without rebuilding histories", async () => {
  const store = createStore();
  store.set(userAtom, account);
  store.set(settledPageAtom, "profile");
  store.get(profileDataAtom); store.get(profileAchievementsAtom);
  await prepared();
  const data = store.get(profileDataAtom);
  const awards = store.get(profileAchievementsAtom);
  expect(data).not.toBeNull();
  profileCalls.length = 0;
  await act(() => { renderer = create(<Provider store={store}><Routed /></Provider>); });
  for (const route of [{ page: "profile" }, { page: "profile", mode: "playground" }, { page: "playground" }, { page: "profile" }] as const) {
    await act(() => store.set(routeAtom, route));
  }
  // Clearing already-default filters on leaving the profile must not invalidate its histories.
  await act(() => store.set(profileFiltersAtom, {}));
  await prepared();
  expect(store.get(profileDataAtom)).toBe(data);
  expect(store.get(profileAchievementsAtom)).toBe(awards);
  expect(profileCalls).toHaveLength(0);
  expect(all("Figure").find(node => node.props.label === "Solves")!.props.value).toBe("3");
});

test("cached profile updates after sync, deletion and account changes, including while unmounted", async () => {
  const store = await mount();
  const solves = () => all("Figure").find(node => node.props.label === "Solves")!.props.value;
  await act(() => store.set(routeAtom, { page: "playground" }));
  timerCount = 4;
  await act(() => store.set(statsVersionAtom, v => v + 1));
  await act(() => store.set(routeAtom, { page: "profile" }));
  await prepared();
  expect(solves()).toBe("4");
  timerCount = 2;
  await act(() => store.set(deletedSolveIdAtom, 3));
  await prepared();
  expect(solves()).toBe("2");
  timerCount = 1;
  await act(() => store.set(userAtom, { ...account, id: "u2", username: "other" }));
  await prepared();
  expect(solves()).toBe("1");
  expect(texts()).toContain("other");
});

test("an empty timer selection offers to open the timer", async () => {
  timerCount = 0;
  const store = await mount();
  // No statistics link without a solve, but a way to the timer.
  expect(card("Timer").props.onMore).toBeUndefined();
  expect(all("Trend")).toHaveLength(0);
  await act(() => store.set(routeAtom, { page: "profile", mode: "playground" }));
  await prepared();
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
