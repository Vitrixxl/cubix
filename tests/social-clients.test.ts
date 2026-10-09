/** The community, coaching and match clients the web and Android apps share, on a fake host: no network. */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { Community, type Notice, type Question, type SocialHost } from "../src/client/lib/community";
import { Coaching } from "../src/client/lib/coaching";
import { MatchClient } from "../src/client/lib/match";
import { readRoute } from "../src/client/lib/route";
import type { LiveLink, LiveMessage } from "../src/client/live";

const realFetch = globalThis.fetch;
let requests: { method: string; url: string; auth: string | null; body: unknown }[];
let answers: Record<string, unknown>;
/** The app's socket (src/client/live.ts), as the clients see it: what they send, and what they hear by channel. */
class FakeLive implements LiveLink {
  sent: LiveMessage[] = [];
  online = false;
  listeners: [string, (m: any) => void][] = [];
  send(message: LiveMessage) {
    if (this.online) this.sent.push(message);
    return this.online;
  }
  on(channel: string, listener: (m: any) => void) {
    this.listeners.push([channel, listener]);
    return () => {};
  }
  connected() {
    return this.online;
  }
  hear(m: LiveMessage) {
    if (m.channel === "live") this.online = m.type === "ready";
    for (const [channel, listener] of this.listeners) if (channel === m.channel || channel === "*") listener(m);
  }
}
beforeEach(() => {
  requests = [];
  answers = {};
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET", path = url.replace("http://api.test/api/", "");
    requests.push({ method, url, auth: new Headers(init.headers).get("authorization"), body: init.body && typeof init.body === "string" ? JSON.parse(init.body) : init.body });
    const answer = answers[`${method} ${path}`];
    return answer instanceof Response ? answer : Response.json(answer ?? {});
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});
const tick = () => new Promise((r) => setTimeout(r, 0));

function fakeHost(over: Partial<SocialHost> = {}) {
  const seen = { notices: [] as Notice[], questions: [] as Question[], urls: [] as string[], changes: 0 };
  const host: SocialHost = {
    origin: "http://api.test",
    token: async () => "tok",
    live: new FakeLive(),
    account: () => ({ id: "me", username: "Me Too" }),
    changed: () => void seen.changes++,
    notify: (n) => void seen.notices.push(n),
    confirm: async (q) => (seen.questions.push(q), false),
    navigate: (url) => void seen.urls.push(url),
    path: () => "/timer",
    visible: () => true,
    ...over,
  };
  return { host, seen, live: host.live as FakeLive };
}
const person = (id: string) => ({ id, username: id.toUpperCase(), avatar: null });

test("the community loads with the account's token, notifies a failure, and asks before what cannot be undone", async () => {
  const { host, seen } = fakeHost();
  const community = new Community(host);
  answers["GET social/me"] = { friends: [{ ...person("ann"), since: 1 }], incoming: [], outgoing: [], groups: [], invitations: [], unread: 0 };
  community.attach("me");
  await tick();
  expect(requests.map((r) => `${r.method} ${r.url} ${r.auth}`)).toEqual(["GET http://api.test/api/social/me Bearer tok", "GET http://api.test/api/competition Bearer tok"]);
  expect(community.me?.friends[0]?.username).toBe("ANN");
  expect(seen.changes).toBeGreaterThan(0);

  answers["POST social/friends"] = Response.json({ error: "No such player." }, { status: 404 });
  expect(await community.addFriend("nobody")).toBeUndefined();
  expect(seen.notices.at(-1)).toEqual({ error: true, title: "No such player." });

  // Declined: nothing is removed.
  await community.removeFriend("ann");
  expect(seen.questions.at(-1)).toMatchObject({ title: "Remove ANN from your friends?", action: "Remove" });
  expect(requests.some((r) => r.method === "DELETE")).toBe(false);
  expect(community.shareLink()).toBe("http://api.test/community/add/Me%20Too");
});

test("socket events become notices whose actions act and navigate; a message on screen is read", async () => {
  const { host, seen } = fakeHost({ visible: () => false });
  const community = new Community(host);
  community.attach("me");
  await tick();
  community.event({ type: "request", from: person("bob") });
  const request = seen.notices.at(-1)!;
  expect(request).toMatchObject({ title: "BOB wants to be friends", id: "community-request-bob", face: { username: "BOB" } });
  request.action!.run();
  await tick();
  expect(requests.some((r) => r.method === "POST" && r.url.endsWith("social/friends/bob/accept"))).toBe(true);

  community.conversations = [{ id: 4, kind: "direct", with: person("bob"), group: null, lastMessage: null, unread: 0, updatedAt: 0, open: true }];
  community.open = 4;
  community.event({ type: "message", conversation: 4, message: { id: 1, senderId: "bob", sender: person("bob"), body: "hi", createdAt: 5 } });
  // Hidden app: it counts as unread and is announced.
  expect(community.conversations[0]!.unread).toBe(1);
  seen.notices.at(-1)!.action!.run();
  expect(seen.urls.at(-1)).toBe("/community/messages/4");

  // A ready match is announced to its players, but not on its own page.
  community.event({ type: "match", match: 9, status: "ready", players: ["me", "bob"] });
  expect(seen.notices.at(-1)).toMatchObject({ id: "community-match-9", icon: "play", duration: 30_000 });
  const page = fakeHost({ path: () => "/match/9" }), onPage = new Community(page.host);
  onPage.attach("me");
  onPage.event({ type: "match", match: 9, status: "ready", players: ["me", "bob"] });
  expect(page.seen.notices).toEqual([]);
});

test("coaching and the community hear their channels of the app's socket, reload after a reconnection, and announce a waiting call", async () => {
  const { host, seen, live } = fakeHost();
  const community = new Community(host);
  const coaching = new Coaching(host);
  coaching.attach("me");
  live.hear({ channel: "live", type: "ready", again: false });
  expect(coaching.connected).toBe(true);
  coaching.signal({ type: "join", booking: "b1" });
  expect(live.sent).toEqual([{ channel: "coaching", type: "join", booking: "b1" }]);

  community.attach("me");
  await tick();
  live.hear({ channel: "social", type: "invitation", from: "ann", name: "Cubers", group: 3 });
  expect(seen.notices.at(-1)).toMatchObject({ title: "ann invites you to Cubers", icon: "group" });

  // Lost, then back: only now does each reload what it shows.
  live.hear({ channel: "live", type: "lost" });
  expect(coaching.connected).toBe(false);
  requests = [];
  live.hear({ channel: "live", type: "ready", again: true });
  await tick();
  expect(requests.map((r) => r.url.replace("http://api.test/api/", "")).sort()).toEqual(["coaching/me", "competition", "social/me"]);

  live.hear({ channel: "coaching", type: "presence", inCall: true, booking: "b1", user: "ann" });
  expect(coaching.waiting.has("b1")).toBe(true);
  seen.notices.at(-1)!.action!.run();
  expect(seen.urls.at(-1)).toBe("/coaching/call/b1");

  expect(coaching.sections().flat().map(([id]) => id)).toEqual(["coaches", "sessions", "messages", "apply"]);
  coaching.me = { coach: null, application: null, unread: 2, iceServers: [], lengths: [] };
  expect(coaching.badge("messages")).toBe(2);
  expect(await coaching.mediaSource("m1")).toEqual({ uri: "http://api.test/api/coaching/media/m1", headers: { authorization: "Bearer tok" } });
  await expect(coaching.sendMedia(1, Object.assign(new Blob(["x"], { type: "text/plain" }), { name: "a.txt" }))).rejects.toThrow("a.txt is neither a picture nor a video.");
});

test("a match joins once the socket is ready, again after a reconnection, and draws the scramble from the first seat once both players are here", async () => {
  const scrambles: unknown[] = [];
  const { host, live: socket } = fakeHost();
  const live = new MatchClient({ ...host, scramble: async (context) => (scrambles.push(context), "R U"), fail: () => {} });
  live.open(7);
  expect(socket.sent).toEqual([]);
  socket.hear({ channel: "live", type: "ready", again: false });
  expect(socket.sent).toEqual([{ channel: "match", match: 7, type: "join" }]);
  const match = { id: 7, event: "333", status: "live", players: [person("me"), person("bob")], solves: [], present: [true, true] };
  // Another match's state is not this one's.
  socket.hear({ channel: "match", type: "state", match: { ...match, id: 8 } });
  expect(live.match).toBeNull();
  socket.hear({ channel: "match", type: "state", match });
  await tick();
  expect(live.seat).toBe(0);
  expect(scrambles).toEqual([{ puzzle: "333", solveMode: "standard", scrambleType: "normal" }]);
  expect(socket.sent.at(-1)).toEqual({ channel: "match", match: 7, type: "scramble", number: 1, text: "R U" });
  socket.hear({ channel: "live", type: "lost" });
  expect(live.connected).toBe(false);
  socket.hear({ channel: "live", type: "ready", again: true });
  expect(socket.sent.at(-1)).toEqual({ channel: "match", match: 7, type: "join" });
  live.close();
  expect(socket.sent.at(-1)).toEqual({ channel: "match", match: 7, type: "leave" });
});

test("the app's addresses read back as routes, for the links the phone opens", () => {
  expect(readRoute("/community/add/ann", "")).toMatchObject({ page: "community", view: "add/ann" });
  expect(readRoute("/match/42", "")).toMatchObject({ page: "match", view: "42" });
  expect(readRoute("/coaching/messages/3", "")).toMatchObject({ page: "coaching", coaching: "messages/3" });
});
