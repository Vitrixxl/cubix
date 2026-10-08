import { expect, mock, test } from "bun:test";
import { createElement, useState, useSyncExternalStore } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { atom } from "jotai";
import { mockLucide } from "../tests/lucide-mock";

// Tournaments and a live match with the community and the match client replaced by fakes, the native drawing by host
// nodes: what is checked is the way from the list to a tournament, registering there, and a match's result.
mock.module("react-native", () => ({ View: "View", Text: "Text", Pressable: "Pressable", ScrollView: "ScrollView" }));
mockLucide();
for (const [path, names] of Object.entries({
  "../src/components/ui/text": ["Text"], "../src/components/ui/button": ["Button"], "../src/components/ui/icon": ["Icon"],
  "../src/components/ui/skeleton": ["Skeleton"], "../src/components/ui/badge": ["Badge"], "../src/components/ui/alert": ["Alert"],
  "../src/components/PuzzlePicker": ["PuzzleIcon"], "../src/components/UserAvatar": ["UserAvatar"],
  "../src/components/duel/parts": ["LiveDot", "Ping", "SolveTime"],
  "../src/components/layout": ["Alg", "BackButton", "Empty", "Fade", "Figure", "Label", "ListSkeleton", "MenuItem", "MoreMenu", "Numeric", "Page", "PageHead", "SectionHead", "Segmented", "Surface", "TouchAction", "TouchBar"],
})) mock.module(path, () => Object.fromEntries(names.map(name => [name, name])));
mock.module("../src/components/Practice", () => ({
  Digits: "Digits", LiveDigits: "LiveDigits", StopSurface: "StopSurface",
  digitsSize: () => 64, responder: () => ({}), timerHint: () => "", useTimerChrome() {},
}));
mock.module("../src/hooks/useTimer", () => ({ useTimer: () => ({ phase: "idle", elapsed: 0, startedAt: 0, press() {}, release() {}, reset() {}, saveError: "", retrySave() {} }) }));
mock.module("../src/components/Sheet", () => ({ Sheet: "Sheet" }));
mock.module("../src/components/Confirm", () => ({ ask: async () => true }));
mock.module("../src/components/Toast", () => ({ toastAtom: atom(null) }));
mock.module("../src/theme", () => ({ useColors: () => ({ foreground: "#fff", mutedForeground: "#888" }), alpha: (c: string) => c }));
mock.module("../src/state", () => ({ goBackAtom: atom(null, () => {}), previousRouteAtom: atom(null) }));

// The fake community: one tournament open, registered for on demand; the account "u1".
const listeners = new Set<() => void>();
let version = 0;
const changed = () => { version++; listeners.forEach(listener => listener()); };
const me = { id: "u1", username: "vitrix", avatar: null }, rival = { id: "u2", username: "lena_speed", avatar: null };
const tournament = {
  id: 7, name: "Spring Open", description: "", event: "333", groupId: null, group: null, startsAt: Date.now() + 2 * 86_400_000, points: 3, sets: 1,
  maxPlayers: 8, status: "open" as const, round: 0, rounds: 3, players: 3, winner: null, registered: false, myMatch: null, createdAt: 0, startedAt: null, finishedAt: null,
};
const community = {
  tournaments: undefined as unknown,
  details: new Map<number, unknown>(),
  competition: undefined,
  host: { account: () => ({ id: me.id, username: me.username }) },
  load: mock(async (key: string) => {
    if (key === "tournaments") community.tournaments = [tournament];
    else if (key === "tournament:7") community.details.set(7, { ...tournament, entrants: [], matches: [], canManage: false });
    changed();
  }),
  register: mock(async (id: number, join: boolean) => {
    const t = community.details.get(id) as typeof tournament;
    community.details.set(id, { ...t, registered: join, players: t.players + (join ? 1 : -1) });
    changed();
  }),
  withdraw: mock(async () => {}), manage: mock(async () => {}), award: mock(async () => {}),
};
// The match: a tournament's, won by the account 3 – 1.
const solve = (number: number, a: number, b: number) => ({ number, scramble: "R U", results: [{ ms: a, penalty: "none" }, { ms: b, penalty: "none" }], winner: a < b ? 0 : 1 });
const match = {
  id: 3, tournamentId: 7, tournament: "Spring Open", groupId: null, group: null, conversationId: null, round: 1, slot: 0, event: "333", points: 3, sets: 1,
  status: "done", winner: "u1", forfeit: false, players: [me, rival], score: { sets: [0, 0], points: [0, 0], solves: [3, 1] }, solved: 4,
  createdBy: null, creator: null, createdAt: 0, startedAt: 0, finishedAt: 0, present: [true, true],
  solves: [solve(1, 9000, 10000), solve(2, 11000, 10500), solve(3, 8900, 9900), solve(4, 9100, 9800)],
};
const live = {
  id: 0, match: null as typeof match | null, error: "", connected: true, phases: ["idle", "idle"], started: [0, 0],
  get seat() { return 0; }, get solves() { return this.match?.solves ?? []; }, current: null, get over() { return this.match?.status === "done"; },
  canSolve: false, canCancel: false,
  open: mock((id: number) => { live.id = id; live.match = match; changed(); }), close: mock(() => {}),
  timer() {}, solve() {}, penalty() {}, cancel() {}, forfeit() {},
};
let navigate: (url: string) => void = () => {};
const openUrl = mock((url: string) => { navigate(url); return true; });
mock.module("../src/lib/social", () => ({
  community, live, openUrl,
  useSocial: () => useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => version),
}));

const { TournamentsPage } = await import("../src/pages/TournamentsPage");
const { MatchPage } = await import("../src/pages/MatchPage");
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/** The pages behind the web addresses they open. */
function Routed() {
  const [url, setUrl] = useState("/tournaments");
  navigate = setUrl;
  const [, page, id] = url.split("/");
  return page === "match" ? createElement(MatchPage, { id: Number(id) }) : createElement(TournamentsPage, { view: id });
}
let renderer: ReactTestRenderer;
const all = (type: string) => renderer.root.findAllByType(type as any);
const textOf = (node: ReactTestInstance): string => node.children.map(child => typeof child === "string" ? child : textOf(child)).join("");
const texts = () => all("Text").map(textOf);
const button = (label: string) => all("Button").find(node => textOf(node) === label)!;

test("the list opens a tournament, where the player registers", async () => {
  await act(() => { renderer = create(createElement(Routed)); });
  expect(community.load).toHaveBeenCalledWith("tournaments");
  expect(all("SectionHead").map(node => node.props.title)).toEqual(["Registration open"]);
  const card = all("Pressable").find(node => node.props.accessibilityLabel === "Open Spring Open")!;
  expect(textOf(card)).toContain("First to 3 solves");
  await act(() => card.props.onPress());
  expect(openUrl).toHaveBeenLastCalledWith("/tournaments/7");
  expect(community.load).toHaveBeenCalledWith("tournament:7");
  expect(all("PageHead")[0]!.props.title).toBe("Spring Open");
  expect(all("Figure").find(node => node.props.label === "Players")!.props.value).toBe("3 / 8");
  expect(all("Empty")[0] && textOf(all("Empty")[0]!)).toStartWith("The players are drawn into the bracket in 2 days");
  await act(async () => { button("Register").props.onPress(); });
  expect(community.register).toHaveBeenCalledWith(7, true);
  expect(button("Registered")).toBeDefined();
  expect(all("Figure").find(node => node.props.label === "Players")!.props.value).toBe("4 / 8");
  // Tapping it again takes the registration back.
  await act(async () => { button("Registered").props.onPress(); });
  expect(community.register).toHaveBeenLastCalledWith(7, false);
  await act(() => renderer.unmount());
});

test("a match over shows its result, and goes back to its tournament", async () => {
  await act(() => { renderer = create(createElement(Routed)); });
  await act(() => navigate("/match/3"));
  expect(live.open).toHaveBeenCalledWith(3);
  const result = () => all("Sheet").find(node => node.props.title === "Result")!;
  expect(result().props.open).toBe(true);
  expect(texts()).toContain("You win");
  expect(texts()).toContain("Fastest solve 8.900.");
  expect(all("Figure").filter(node => node.props.label === "Solves").map(node => node.props.value)).toEqual([3, 1]);
  // Stay closes it on the race.
  await act(() => button("Stay").props.onPress());
  expect(result().props.open).toBe(false);
  await act(() => button("Back to the tournament").props.onPress());
  expect(openUrl).toHaveBeenLastCalledWith("/tournaments/7");
  expect(live.close).toHaveBeenCalled();
  await act(() => renderer.unmount());
});
