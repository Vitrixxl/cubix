/** The community, coaching and match clients the web and Android apps share, on a fake host: no network. */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { Community, type Notice, type Question, type SocialHost } from "../src/client/lib/community";
import { Coaching } from "../src/client/lib/coaching";
import { MatchClient } from "../src/client/lib/match";
import { readRoute } from "../src/client/lib/route";

const realFetch = globalThis.fetch, RealSocket = globalThis.WebSocket;
let requests: { method: string; url: string; auth: string | null; body: unknown }[];
let answers: Record<string, unknown>;
let sockets: FakeSocket[];
class FakeSocket {
  static OPEN = 1;
  readyState = 1;
  sent: any[] = [];
  onopen?: () => void;
  onmessage?: (e: { data: string }) => void;
  onclose: (() => void) | null = null;
  constructor(readonly url: string) {
    sockets.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {}
  hear(m: object) {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
}
beforeEach(() => {
  requests = [];
  answers = {};
  sockets = [];
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET", path = url.replace("http://api.test/api/", "");
    requests.push({ method, url, auth: new Headers(init.headers).get("authorization"), body: init.body && typeof init.body === "string" ? JSON.parse(init.body) : init.body });
    const answer = answers[`${method} ${path}`];
    return answer instanceof Response ? answer : Response.json(answer ?? {});
  }) as typeof fetch;
  globalThis.WebSocket = FakeSocket as any;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  globalThis.WebSocket = RealSocket;
});
const tick = () => new Promise((r) => setTimeout(r, 0));

function fakeHost(over: Partial<SocialHost> = {}) {
  const seen = { notices: [] as Notice[], questions: [] as Question[], urls: [] as string[], changes: 0 };
  const host: SocialHost = {
    origin: "http://api.test",
    token: async () => "tok",
    account: () => ({ id: "me", username: "Me Too" }),
    changed: () => void seen.changes++,
    notify: (n) => void seen.notices.push(n),
    confirm: async (q) => (seen.questions.push(q), false),
    navigate: (url) => void seen.urls.push(url),
    path: () => "/timer",
    visible: () => true,
    ...over,
  };
  return { host, seen };
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
  community.event({ kind: "request", from: person("bob") });
  const request = seen.notices.at(-1)!;
  expect(request).toMatchObject({ title: "BOB wants to be friends", id: "community-request-bob", face: { username: "BOB" } });
  request.action!.run();
  await tick();
  expect(requests.some((r) => r.method === "POST" && r.url.endsWith("social/friends/bob/accept"))).toBe(true);

  community.conversations = [{ id: 4, kind: "direct", with: person("bob"), group: null, lastMessage: null, unread: 0, updatedAt: 0, open: true }];
  community.open = 4;
  community.event({ kind: "message", conversation: 4, message: { id: 1, senderId: "bob", sender: person("bob"), body: "hi", createdAt: 5 } });
  // Hidden app: it counts as unread and is announced.
  expect(community.conversations[0]!.unread).toBe(1);
  seen.notices.at(-1)!.action!.run();
  expect(seen.urls.at(-1)).toBe("/community/messages/4");

  // A ready match is announced to its players, but not on its own page.
  community.event({ kind: "match", match: 9, status: "ready", players: ["me", "bob"] });
  expect(seen.notices.at(-1)).toMatchObject({ id: "community-match-9", icon: "play", duration: 30_000 });
  const page = fakeHost({ path: () => "/match/9" }), onPage = new Community(page.host);
  onPage.attach("me");
  onPage.event({ kind: "match", match: 9, status: "ready", players: ["me", "bob"] });
  expect(page.seen.notices).toEqual([]);
});

test("coaching opens its socket with the token, passes the community's events on and announces a waiting call", async () => {
  const { host, seen } = fakeHost();
  const community = new Community(host);
  const coaching = new Coaching(host, community);
  coaching.attach("me");
  const socket = sockets[0]!;
  expect(socket.url).toBe("ws://api.test/api/coaching/live");
  await socket.onopen!();
  expect(socket.sent).toEqual([{ type: "auth", token: "tok" }]);
  socket.hear({ type: "ready" });
  expect(coaching.connected).toBe(true);

  community.attach("me");
  socket.hear({ type: "social", kind: "invitation", from: "ann", name: "Cubers", group: 3 });
  expect(seen.notices.at(-1)).toMatchObject({ title: "ann invites you to Cubers", icon: "group" });

  socket.hear({ type: "presence", inCall: true, booking: "b1", user: "ann" });
  expect(coaching.waiting.has("b1")).toBe(true);
  seen.notices.at(-1)!.action!.run();
  expect(seen.urls.at(-1)).toBe("/coaching/call/b1");

  expect(coaching.sections().flat().map(([id]) => id)).toEqual(["coaches", "sessions", "messages", "apply"]);
  coaching.me = { coach: null, application: null, unread: 2, iceServers: [], lengths: [] };
  expect(coaching.badge("messages")).toBe(2);
  expect(await coaching.mediaSource("m1")).toEqual({ uri: "http://api.test/api/coaching/media/m1", headers: { authorization: "Bearer tok" } });
  await expect(coaching.sendMedia(1, Object.assign(new Blob(["x"], { type: "text/plain" }), { name: "a.txt" }))).rejects.toThrow("a.txt is neither a picture nor a video.");
});

test("a match joins with the token, draws the scramble from the first seat once both players are here", async () => {
  const scrambles: unknown[] = [];
  const { host } = fakeHost();
  const live = new MatchClient({ ...host, scramble: async (context) => (scrambles.push(context), "R U"), fail: () => {} });
  live.open(7);
  const socket = sockets[0]!;
  expect(socket.url).toBe("ws://api.test/api/matches/live");
  await socket.onopen!();
  expect(socket.sent[0]).toEqual({ type: "join", token: "tok", match: 7 });
  const match = { id: 7, event: "333", status: "live", players: [person("me"), person("bob")], solves: [], present: [true, true] };
  socket.hear({ type: "state", match });
  await tick();
  expect(live.seat).toBe(0);
  expect(scrambles).toEqual([{ puzzle: "333", solveMode: "standard", scrambleType: "normal" }]);
  expect(socket.sent.at(-1)).toEqual({ type: "scramble", number: 1, text: "R U" });
  live.close();
});

test("the app's addresses read back as routes, for the links the phone opens", () => {
  expect(readRoute("/community/add/ann", "")).toMatchObject({ page: "community", view: "add/ann" });
  expect(readRoute("/match/42", "")).toMatchObject({ page: "match", view: "42" });
  expect(readRoute("/coaching/messages/3", "")).toMatchObject({ page: "coaching", coaching: "messages/3" });
});
