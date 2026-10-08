import { afterEach, expect, mock, test } from "bun:test";
import { createStore, Provider, useAtomValue } from "jotai";
import { useSyncExternalStore } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { mockLucide } from "../tests/lucide-mock";

// The messages page on a mocked community client, its native drawing replaced by host nodes: what is checked is the
// list (search, unread, last words), opening a conversation from it, reading it, and sending a message.
mock.module("react-native", () => ({
  View: "View", Text: "Text", Pressable: "Pressable", ScrollView: "ScrollView", TextInput: "TextInput", Image: "Image", Modal: "Modal",
  AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) }, Share: { share: async () => ({}) },
  StyleSheet: { create: (s: unknown) => s, absoluteFill: {} },
}));
mock.module("../src/platform/storage", () => ({ storage: { getItem: () => null, setItem() {}, removeItem() {} } }));
mock.module("../src/api", () => ({ API_ORIGIN: "https://qbix.test", api: {}, authToken: { get: () => "token" }, local: { current: () => null } }));
mock.module("../src/theme", () => ({ useColors: () => ({ mutedForeground: "#888", primary: "#36f", foreground: "#fff" }) }));
mock.module("expo-clipboard", () => ({ setStringAsync: async () => {} }));
mockLucide();
for (const [path, names] of Object.entries({
  "../src/components/ui/text": ["Text"], "../src/components/ui/button": ["Button"], "../src/components/ui/icon": ["Icon"],
  "../src/components/ui/skeleton": ["Skeleton"], "../src/components/ui/badge": ["Badge"],
  "../src/components/Sheet": ["Sheet", "SheetInput", "SheetScrollView"],
  "../src/components/PuzzlePicker": ["ChoiceButton", "PuzzleIcon"],
  "../src/components/duel/parts": ["SolveTime"],
  "../src/components/layout": ["BackButton", "Empty", "Figure", "HeadButton", "IconTile", "Label", "ListSkeleton", "MenuItem", "MoreMenu", "Numeric", "Page", "PageHead", "SearchField", "SectionHead", "Surface"],
})) mock.module(path, () => Object.fromEntries(names.map(name => [name, name])));
mock.module("../src/components/tournaments/format", () => ({
  EventTile: "EventTile", MatchStatusBadge: "MatchStatusBadge", PlayerLine: "PlayerLine", StatusBadge: "StatusBadge", Strip: "Strip",
  day: () => "Thu 8 Oct", time: () => "18:00", relative: () => "now", when: () => "",
}));

// The community: two conversations, one unread; sending adds the message and redraws.
const listeners = new Set<() => void>();
let version = 0;
const changed = () => { version++; listeners.forEach(l => l()); };
const navigate = mock((_url: string) => {});
const now = Date.now();
const lena = { id: "u2", username: "lena_speed", avatar: null };
const community = {
  host: { account: () => ({ id: "u1", username: "dev" }), navigate: (url: string) => navigate(url) },
  me: { friends: [{ ...lena, since: now - 86_400_000 }], incoming: [], outgoing: [], groups: [], invitations: [], unread: 2 },
  conversations: [
    { id: 4, kind: "direct", with: lena, group: null, lastMessage: { body: "gg!", at: now, mine: false, from: "lena_speed", card: null }, unread: 2, updatedAt: now, open: true },
    { id: 5, kind: "direct", with: { id: "u3", username: "alex_cubes", avatar: null }, group: null, lastMessage: { body: "see you", at: now - 1000, mine: true, from: "dev", card: null }, unread: 0, updatedAt: now - 1000, open: true },
  ],
  messages: new Map<number, any[]>([[4, [
    { id: 1, senderId: "u2", sender: lena, body: "ready?", createdAt: now - 60_000 },
    { id: 2, senderId: "u2", sender: lena, body: "gg!", createdAt: now - 30_000 },
  ]]]),
  groups: new Map(), open: null as number | null,
  load: mock(async (_key: string) => {}),
  read: mock((id: number) => { community.conversations = community.conversations.map(c => c.id === id ? { ...c, unread: 0 } : c); changed(); }),
  send: mock(async (id: number, body: string) => {
    community.messages.set(id, [...community.messages.get(id)!, { id: 3, senderId: "u1", sender: { id: "u1", username: "dev", avatar: null }, body, createdAt: Date.now() }]);
    changed();
    return true;
  }),
  waiting: () => 0, shareLink: () => "https://qbix.test/community/add/dev", card: (m: unknown) => m, summary: (t: unknown) => t,
};
mock.module("../src/lib/social", () => ({ community, useSocial: () => useSyncExternalStore(l => { listeners.add(l); return () => listeners.delete(l); }, () => version) }));

const { CommunityPage } = await import("../src/pages/CommunityPage");
const { routeAtom } = await import("../src/state");
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let renderer: ReactTestRenderer;
afterEach(async () => { if (renderer) await act(() => renderer.unmount()); });
function Routed() {
  const route = useAtomValue(routeAtom);
  return route.page === "community" ? <CommunityPage view={route.view} /> : null;
}
const all = (type: string) => renderer.root.findAllByType(type as any);
const pressable = (label: string) => all("Pressable").find(n => n.props.accessibilityLabel === label);
const texts = () => [...all("Text"), ...all("Numeric")].map(n => [n.props.children].flat().join(""));

test("the list shows each conversation with its unread count and last words; a row opens it, which reads it; Send sends", async () => {
  const store = createStore();
  store.set(routeAtom, { page: "profile" });
  store.set(routeAtom, { page: "community" });
  navigate.mockImplementation(url => store.set(routeAtom, { page: "community", view: url.replace("/community/", "") }));
  await act(() => { renderer = create(<Provider store={store}><Routed /></Provider>); });
  expect(all("PageHead")[0]!.props.title).toBe("Messages");
  expect(all("PageHead")[0]!.props.sub).toBe("1 friend · 0 groups");
  // The rows: the unread one bold with its count, the other's last words as the account's.
  expect(pressable("lena_speed, 2 unread")).toBeDefined();
  expect(texts()).toContain("gg!");
  expect(texts()).toContain("You: see you");
  // The search keeps the conversations whose name holds what is typed.
  await act(() => all("SearchField")[0]!.props.onChangeText("alex"));
  expect(pressable("lena_speed, 2 unread")).toBeUndefined();
  expect(pressable("alex_cubes")).toBeDefined();
  await act(() => all("SearchField")[0]!.props.onChangeText(""));

  await act(() => pressable("lena_speed, 2 unread")!.props.onPress());
  expect(navigate).toHaveBeenCalledWith("/community/messages/4");
  expect(store.get(routeAtom)).toEqual({ page: "community", view: "messages/4" });
  expect(community.load).toHaveBeenCalledWith("messages:4");
  // On screen, the conversation is read.
  expect(community.read).toHaveBeenCalledWith(4);
  expect(community.open).toBe(4);
  // Two messages of one sender a moment apart make one group, its time once.
  expect(texts().filter(t => t === "ready?" || t === "gg!")).toEqual(["ready?", "gg!"]);
  expect(texts()).toContain("Today");

  const input = () => all("TextInput").find(n => n.props.accessibilityLabel === "Message lena_speed")!;
  expect(pressable("Send")!.props.disabled).toBe(true);
  await act(() => input().props.onChangeText("  see you at 6  "));
  expect(pressable("Send")!.props.disabled).toBe(false);
  await act(async () => { pressable("Send")!.props.onPress(); await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(community.send).toHaveBeenCalledWith(4, "see you at 6");
  expect(input().props.value).toBe("");
  expect(texts()).toContain("see you at 6");

  // The way back returns to the list, a step back in the history.
  await act(() => pressable("Conversations")!.props.onPress());
  expect(store.get(routeAtom)).toEqual({ page: "community" });
});
