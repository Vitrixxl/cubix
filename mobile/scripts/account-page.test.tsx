import { afterEach, expect, mock, test } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { atom, createStore, Provider, useAtomValue } from "jotai";
import { mockLucide } from "../tests/lucide-mock";

// The Me section's Profile page with its cards, sheets and native drawing replaced by host nodes: what is checked is
// what the page shows, where its buttons lead, and that its figures are prepared once, never during a render.
mock.module("react-native", () => ({
  View: "View", Text: "Text", Pressable: "Pressable", ScrollView: "ScrollView", FlatList: "FlatList",
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
const achievements = { unlocked: 1, total: 3, xp: 120, achievements: [
  { id: "a", title: "First solve", description: "", group: "General", category: "volume", ratio: 1, unlocked: true, unlockedAt: "2026-09-22T20:00:00Z", detail: "1 / 1" },
  { id: "b", title: "10 solves", description: "", group: "General", category: "volume", ratio: 0.3, unlocked: false, detail: "3 / 10 solves" },
  { id: "c", title: "Sub-15", description: "", group: "3×3", category: "speed", ratio: 0.6, unlocked: false, detail: "Best 9.980" },
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
      return {
        user: account, playground: { summary: summary(timerCount), history: history(), ao5: [], ao12: [] }, cases: [], totalSolves: timerCount, trainingSolves: 2, activeDays: 1,
        records: timerCount ? [{ event: "333", puzzle: "333", solveMode: "standard", count: timerCount, best: 10000, bestAo5: null, bestAo12: null, bestAo100: null, lastAt: "2026-09-23T20:00:00Z" }] : [],
      };
    },
    achievements: () => achievements,
  },
} }));
mock.module("../src/lib/duel", () => ({ battles: () => [], battleRecord: () => "", useDuel: () => ({}), ROUNDS: 5, RESULT_MARK: {}, ao5Text: String }));
mock.module("../src/lib/files", () => ({ exportData }));
mockLucide();
mock.module("../src/components/ProfileProgress", () => ({ ProfileCaseDialog: "ProfileCaseDialog", TrainingProgress: "TrainingProgress" }));
mock.module("../src/components/Achievements", () => ({ AchievementBadge: "AchievementBadge", AchievementDialog: "AchievementDialog", AchievementsScreen: "AchievementsScreen" }));
mock.module("../src/components/AppBar", () => ({ AppBar: "AppBar", PushedBar: "PushedBar", SectionTabs: "SectionTabs" }));
mock.module("../src/components/ImportTimes", () => ({ ImportSheet: "ImportSheet" }));
mock.module("../src/components/Stats", () => ({ StatsScreen: "StatsScreen" }));
mock.module("../src/components/Toast", () => ({ toastAtom: atom(null) }));
mock.module("../src/components/PuzzlePicker", () => ({ EventPicker: "EventPicker" }));
mock.module("../src/components/UserAvatar", () => ({ UserAvatar: "UserAvatar" }));
mock.module("../src/components/ui/text", () => ({ Text: "Text" }));
mock.module("../src/components/ui/button", () => ({ Button: "Button" }));
mock.module("../src/components/ui/icon", () => ({ Icon: "Icon" }));
mock.module("../src/components/ui/skeleton", () => ({ Skeleton: "Skeleton" }));
mock.module("../src/components/ui/dropdown-menu", () => ({ DropdownMenu: "DropdownMenu", DropdownMenuContent: "DropdownMenuContent", DropdownMenuTrigger: "DropdownMenuTrigger" }));
mock.module("../src/components/layout", () => Object.fromEntries(["Bar", "Empty", "Figure", "MenuItem", "Numeric", "Segmented", "Surface"].map(name => [name, name])));
mock.module("../src/theme", () => ({ useColors: () => ({ primary: "#f5609f", variables: {} }) }));
const account = { id: "u1", username: "vitrix", isGuest: false, createdAt: "2026-01-15T00:00:00Z" };
mock.module("../src/hooks/useLayout", () => ({ useLayout: () => ({ width: 390, height: 844, phone: true, tablet: false, wide: false }) }));
const { ProfilePage } = await import("../src/pages/AccountPage");
const { routeAtom, userAtom, profileFiltersAtom, statsVersionAtom, deletedSolveIdAtom } = await import("../src/state");
const { profileDataAtom, profileAchievementsAtom } = await import("../src/profile");
const { settledPageAtom } = await import("../src/tour");
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
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
const texts = () => all("Text").map(node => [node.props.children].flat().join(""));
const pressable = (label: string) => all("Pressable").find(node => node.props.accessibilityLabel === label)!;
const journal = () => all("FlatList").at(-1)!;

test("the profile shows the account, its level, records, shortcuts and journal under the section's tabs", async () => {
  await mount();
  expect(all("AppBar")).toHaveLength(1);
  expect(all("SectionTabs")).toHaveLength(1);
  expect(texts()).toContain("vitrix");
  expect(texts().some(text => text.includes("Joined "))).toBe(true);
  expect(texts()).toContain("Level 2");
  // The records, each event's best single.
  expect(all("Numeric").some(node => node.props.children === "10.000")).toBe(true);
  // The four shortcuts, with their counts.
  expect(["Analysis", "Cases 1", "Awards 1", "Battles 0"].every(label => pressable(label))).toBe(true);
  // The journal: a day per active day, newest first, the profile's puzzle beside it.
  expect(journal().props.data.map((day: { key: string }) => day.key)).toEqual(["2026-09-23", "2026-09-22", "2026-09-21"]);
  expect(all("EventPicker")).toHaveLength(1);
  expect(all("Segmented")[0]!.props.options.map((o: { id: string }) => o.id)).toEqual(["all", "records", "achievements", "battles"]);
});

test("opening the profile never works it out during its render: placeholders first, the figures a frame later", async () => {
  const store = createStore();
  store.set(userAtom, account);
  store.set(routeAtom, { page: "profile" });
  profileCalls.length = 0;
  await act(() => { renderer = create(<Provider store={store}><Routed /></Provider>); });
  expect(profileCalls).toHaveLength(0);
  expect(texts()).toContain("vitrix");
  expect(all("FlatList")).toHaveLength(0);
  await prepared();
  expect(profileCalls).toHaveLength(1);
  expect(all("FlatList")).toHaveLength(1);
});

test("the identity's buttons: import, exports, the settings and signing out", async () => {
  const store = await mount();
  expect(all("ImportSheet")[0]!.props.open).toBe(false);
  await act(() => pressable("Import").props.onPress());
  expect(all("ImportSheet")[0]!.props.open).toBe(true);
  const item = (label: string) => all("MenuItem").find(node => node.props.children === label)!;
  await act(() => item("My solves, as a table (CSV)").props.onPress());
  await act(() => item("All my profile's data (JSON)").props.onPress());
  expect(exportData.mock.calls.map(call => call[0])).toEqual(["csv", "json"]);
  await act(() => pressable("Account").props.onPress());
  expect(store.get(routeAtom)).toEqual({ page: "settings" });
  await act(() => store.set(routeAtom, { page: "profile" }));
  await act(async () => { pressable("Log out").props.onPress(); await Promise.resolve(); });
  expect(logout).toHaveBeenCalled();
});

test("the statistics, the shortcuts and the activity are screens pushed over the profile", async () => {
  const store = await mount();
  const link = all("Pressable").find(node => node.findAllByType("Text" as any).some(t => t.props.children === "Statistics"))!;
  await act(() => link.props.onPress());
  expect(store.get(routeAtom)).toEqual({ page: "profile", mode: "playground" });
  expect(all("StatsScreen")).toHaveLength(1);
  for (const [label, route, shown] of [
    ["Cases 1", { page: "profile", mode: "training" }, "TrainingProgress"],
    ["Awards 1", { page: "profile", mode: "achievements" }, "AchievementsScreen"],
    ["Battles 0", { page: "profile", mode: "duels" }, "PushedBar"],
  ] as const) {
    await act(() => store.set(routeAtom, { page: "profile" }));
    await act(() => pressable(label).props.onPress());
    expect(store.get(routeAtom)).toEqual(route);
    expect(all(shown)).toHaveLength(1);
  }
  expect(all("Empty").some(node => node.props.title === "No battles yet")).toBe(true);
  await act(() => store.set(routeAtom, { page: "profile" }));
  await act(() => pressable("Analysis").props.onPress());
  expect(store.get(routeAtom)).toEqual({ page: "analysis" });
  // The streak and the journal's calendar open the activity.
  await act(() => store.set(routeAtom, { page: "profile" }));
  await act(() => pressable("Activity").props.onPress());
  expect(store.get(routeAtom)).toEqual({ page: "profile", mode: "activity" });
  expect(all("PushedBar")[0]!.props.title).toBe("Activity");
  expect(texts()).toContain("solves in all");
});

test("the journal's puzzle changes the profile's own selection", async () => {
  const store = await mount();
  profileCalls.length = 0;
  await act(() => all("EventPicker")[0]!.props.onChange("222"));
  await prepared();
  expect(store.get(profileFiltersAtom).cube).toBe("222");
  expect(profileCalls.at(-1)).toMatchObject({ cube: "222" });
  await act(() => all("EventPicker")[0]!.props.onChange("333oh"));
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
  for (const route of [{ page: "profile" }, { page: "profile", mode: "activity" }, { page: "playground" }, { page: "profile" }] as const) {
    await act(() => store.set(routeAtom, route));
  }
  // Clearing already-default filters on leaving the profile must not invalidate its histories.
  await act(() => store.set(profileFiltersAtom, {}));
  await prepared();
  expect(store.get(profileDataAtom)).toBe(data);
  expect(store.get(profileAchievementsAtom)).toBe(awards);
  expect(profileCalls).toHaveLength(0);
  expect(journal().props.data).toHaveLength(3);
});

test("cached profile updates after sync, deletion and account changes, including while unmounted", async () => {
  const store = await mount();
  const days = () => journal().props.data.length;
  await act(() => store.set(routeAtom, { page: "playground" }));
  timerCount = 4;
  await act(() => store.set(statsVersionAtom, v => v + 1));
  await act(() => store.set(routeAtom, { page: "profile" }));
  await prepared();
  expect(days()).toBe(4);
  timerCount = 2;
  await act(() => store.set(deletedSolveIdAtom, 3));
  await prepared();
  expect(days()).toBe(2);
  timerCount = 1;
  await act(() => store.set(userAtom, { ...account, id: "u2", username: "other" }));
  await prepared();
  expect(days()).toBe(1);
  expect(texts()).toContain("other");
});

test("without timed solves, the records say where they will appear", async () => {
  timerCount = 0;
  await mount();
  expect(texts()).toContain("Your records appear after your first timed solves.");
});
