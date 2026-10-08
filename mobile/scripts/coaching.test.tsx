import { afterEach, expect, mock, test } from "bun:test";
import { atom, createStore, Provider, useAtomValue } from "jotai";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { mockLucide } from "../tests/lucide-mock";

// The coaching page on a mocked coaching client, its cards, sheets and native drawing replaced by host nodes: what is
// checked is the way from the list of coaches to a booked slot, and what a coach's dashboard shows and leads to.
mock.module("react-native", () => ({
  View: "View", Text: "Text", Pressable: "Pressable", ScrollView: "ScrollView", TextInput: "TextInput", Image: "Image",
  FlatList: ({ data, renderItem }: { data: unknown[]; renderItem: (info: { item: unknown; index: number }) => unknown }) => data.map((item, index) => ({ ...(renderItem({ item, index }) as object), key: String(index) })),
  Linking: { openURL: async () => {} },
  StyleSheet: { create: (styles: unknown) => styles },
}));
mock.module("react-native-svg", () => ({ default: "Svg", Polyline: "Polyline", Rect: "Rect" }));
mock.module("expo-image-picker", () => ({ launchImageLibraryAsync: async () => ({ canceled: true }) }));
mock.module("../src/platform/storage", () => ({ storage: { getItem: () => null, setItem() {}, removeItem() {} } }));
mock.module("../src/api", () => ({ API_ORIGIN: "https://qbix.test", api: {}, authToken: { get: () => "token" }, local: { current: () => account } }));
mock.module("../src/theme", () => ({
  useColors: () => ({ primary: "#3987e5", muted: "#222", mutedForeground: "#888", foreground: "#fff", variables: { "--warning": "#fa0" } }),
  alpha: (color: string) => color,
}));
mockLucide();
for (const [path, names] of [
  ["../src/components/ui/text", ["Text"]], ["../src/components/ui/icon", ["Icon"]], ["../src/components/ui/button", ["Button"]],
  ["../src/components/ui/badge", ["Badge"]], ["../src/components/ui/alert", ["Alert"]], ["../src/components/ui/input", ["Input"]],
  ["../src/components/ui/skeleton", ["Skeleton"]], ["../src/components/Sheet", ["Sheet", "SheetInput", "SheetScrollView"]],
  ["../src/components/PuzzlePicker", ["ChoiceButton", "PuzzleIcon"]], ["../src/components/coaching/CoachingMessages", ["CoachingMessages"]],
  ["../src/components/layout", ["BackButton", "Bar", "Empty", "Figure", "Label", "ListSkeleton", "Numeric", "Page", "PageHead", "SearchField", "SectionHead", "Segmented", "Surface"]],
] as const) mock.module(path, () => Object.fromEntries(names.map(name => [name, name])));
mock.module("../src/components/Confirm", () => ({ ask: async () => true }));
const toastAtom = atom<{ title: string; description?: string } | null>(null);
mock.module("../src/components/Toast", () => ({ toastAtom }));

const account = { id: "u1", username: "me", isGuest: false };
const start = new Date();
start.setDate(start.getDate() + 3);
start.setHours(18, 0, 0, 0);
const slot = { start: start.getTime(), end: start.getTime() + 3_600_000 };
const lena = {
  id: "c1", username: "lena_speed", headline: "Sub-8 CFOP coach", bio: "", events: ["333"], languages: ["English"], priceCents: 2500, sessionMinutes: 60,
  timezone: "Europe/Paris", accepting: true, active: true, rating: 4.5, reviews: 2, sessions: 10, students: 3, since: Date.UTC(2026, 0, 1), avatar: null,
  newStudents: true, nextSlot: slot.start, practice: { solves: 1200, activeDays: 20, lastAt: null, learned: 57, puzzles: [{ puzzle: "333", solves: 1200, best: 6900, ao5: 8100 }] },
  history: { days: [], puzzles: {}, learned: [] }, reviewList: [{ rating: 5, comment: "Great", at: Date.UTC(2026, 8, 1), username: "alex_cubes" }], ratingCounts: [0, 0, 0, 1, 1],
};
const booking = {
  id: "b1", role: "coach", coachId: "u1", coachName: "me", studentId: "s1", studentName: "alex_cubes", with: { id: "s1", username: "alex_cubes" },
  startsAt: slot.start, endsAt: slot.end, status: "booked", note: "F2L", priceCents: 2500, createdAt: 0, cancelledAt: null, cancelledByMe: false,
  review: null, conversationId: 7, proposal: null,
};
const book = mock(async (_coach: string, _start: number, _note: string) => ({ ...booking, role: "student", with: { id: "c1", username: "lena_speed" } }));
const PLAYER = [["coaches", "Find a coach"], ["sessions", "Sessions"], ["messages", "Messages"]];
const fake = {
  me: { coach: null as any, application: null, unread: 0, iceServers: [], lengths: [30, 60] },
  isCoach: false, failure: "", coaches: [lena], profiles: new Map([["c1", lena]]), slots: new Map([["c1", { timezone: "Europe/Paris", sessionMinutes: 60, priceCents: 2500, accepting: true, welcome: true, slots: [slot] }]]),
  bookings: [] as any[], dashboard: undefined as any, waiting: new Set<string>(), people: new Map(),
  load: mock(async () => {}), book,
  sections: () => (fake.isCoach ? [[["dashboard", "Dashboard"], ["students", "Students"], ["schedule", "Schedule"], ["profile", "Coach profile"]], PLAYER] : [PLAYER, [["apply", "Become a coach"]]]),
  badge: () => 0,
};
mock.module("../src/lib/social", () => ({ coaching: fake, useCoaching: () => fake }));

const { CoachingPage } = await import("../src/pages/CoachingPage");
const { routeAtom, userAtom } = await import("../src/state");
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let renderer: ReactTestRenderer;
afterEach(async () => { if (renderer) await act(() => renderer.unmount()); });
function Routed() {
  const route = useAtomValue(routeAtom);
  return route.page === "coaching" ? <CoachingPage view={route.view} /> : null;
}
async function mount(view: string) {
  const store = createStore();
  store.set(userAtom, account as any);
  store.set(routeAtom, { page: "coaching", view });
  await act(() => { renderer = create(<Provider store={store}><Routed /></Provider>); });
  return store;
}
const all = (type: string) => renderer.root.findAllByType(type as any);
const byTest = (id: string) => renderer.root.findAll(node => node.props.testID === id && typeof node.type === "string")[0]!;
const texts = () => all("Text").map(node => [node.props.children].flat().join(""));
const press = (node: { props: Record<string, any> }) => act(async () => { await node.props.onPress(); });

test("a player finds a coach, opens their page and books one of their free slots", async () => {
  const store = await mount("coaches");
  expect(all("PageHead")[0]!.props.title).toBe("Coaching");
  expect(all("SearchField")[0]!.props.placeholder).toBe("Name, language, method…");
  expect(all("ChoiceButton")[0]!.props.options.map((o: { label: string }) => o.label)).toEqual(["Every event", "3×3"]);
  await press(byTest("coach-lena_speed"));
  expect(store.get(routeAtom)).toEqual({ page: "coaching", view: "coach/c1" });
  // The coach's page: the way to book, their figures and their reviews.
  expect(texts()).toEqual(expect.arrayContaining(["Sub-8 CFOP coach", "alex_cubes", "Great"]));
  expect(all("SectionHead").map(node => node.props.title)).toEqual(["As a coach", "As a cuber", "Activity", "Cases learned", "Times per puzzle", "Reviews"]);
  await press(byTest("open-booking"));
  expect(store.get(routeAtom)).toEqual({ page: "coaching", view: "coach/c1/book" });
  expect(all("PageHead")[0]!.props.title).toBe("Book a session");
  // Nothing to book before a time is picked and the policy accepted.
  expect(byTest("book").props.disabled).toBe(true);
  await press(byTest("slot-" + slot.start));
  expect(byTest("book").props.disabled).toBe(true);
  await press(all("Pressable").find(node => node.props.accessibilityRole === "checkbox")!);
  expect(byTest("book").props.disabled).toBe(false);
  await press(byTest("book"));
  expect(book.mock.calls).toEqual([["c1", slot.start, ""]]);
  expect(store.get(toastAtom)?.title).toBe("Session booked");
  expect(store.get(routeAtom)).toEqual({ page: "coaching", view: "sessions" });
});

test("a coach's dashboard: the figures, the forecast, the next sessions and what is left to set up", async () => {
  fake.isCoach = true;
  fake.me.coach = { ...lena, id: "u1", username: "me", windows: [], overrides: [] };
  const week = (i: number) => ({ from: Date.UTC(2026, 9, 5 + 7 * i), to: Date.UTC(2026, 9, 12 + 7 * i), sessions: i ? 0 : 1, minutes: i ? 0 : 60, incomeCents: i ? 0 : 2500, openSlots: 4 });
  fake.dashboard = { coach: fake.me.coach, weeks: [0, 1, 2, 3].map(week), openSlots: 16, upcoming: [booking], students: [] };
  const store = await mount("dashboard");
  expect(all("Figure").map(node => node.props.label)).toEqual(["Sessions · 7 days", "Booked · 7 days", "Expected · 4 weeks", "Free slots · 7 days", "Students", "Rating"]);
  expect(all("Figure")[0]!.props.value).toBe("1");
  expect(texts()).toEqual(expect.arrayContaining(["This week", "Next week", "In 2 weeks", "In 3 weeks"]));
  expect(all("SectionHead").find(node => node.props.title === "Next sessions")!.props.meta).toBe(1);
  expect(byTest("booking-b1")).toBeDefined();
  // No hours yet: the alert leads to the schedule.
  const todo = all("Alert").find(node => node.props.children === "Add your hours so players can book you.")!;
  await press(todo.props.action);
  expect(store.get(routeAtom)).toEqual({ page: "coaching", view: "schedule" });
  // The section menu groups a coach's own sections apart from a player's.
  expect(all("Label").map(node => node.props.children)).toEqual(["Your coaching", "Get coached"]);
  await press(byTest("coaching-students"));
  expect(store.get(routeAtom)).toEqual({ page: "coaching", view: "students" });
});
