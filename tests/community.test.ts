import { afterEach, expect, test } from "bun:test";
import { adminToken, createRustApi, openDb } from "./backend";
import { createApiClient } from "../src/client/api-client";
const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((fn) => fn()));

function setup() {
  const db = openDb();
  cleanup.push(() => db.db.close());
  const app = createRustApi(db.path);
  return { origin: `http://127.0.0.1:${app.server.port}`, admin: adminToken(db.path) };
}
async function account(origin: string, name: string) {
  const { token, user } = await createApiClient(origin, { getToken: () => null }).register(name, "a-long-test-password");
  const call = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(origin + "/api/" + path, {
      method,
      headers: { authorization: "Bearer " + token, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, value: await response.json() };
  };
  return { token, id: user.id as string, name, call, get: async (path: string) => (await call("GET", path)).value };
}
async function adminSession(origin: string, token: string) {
  const response = await fetch(origin + "/api/admin/login", { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ token }) });
  const cookie = response.headers.get("set-cookie")!.split(";")[0]!;
  return async (method: string, path: string, body?: unknown) => {
    const r = await fetch(origin + "/api/admin/" + path, { method, headers: { cookie, origin, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, value: await r.json() };
  };
}
/** A socket that keeps what it hears: the coaching socket (`auth`) or a match's (`join`). */
async function socket(url: string, hello: object, ready: (m: any) => boolean) {
  const ws = new WebSocket(url);
  cleanup.push(() => ws.close());
  const heard: any[] = [];
  const waiters: [(m: any) => boolean, (m: any) => void][] = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data));
    heard.push(m);
    for (const w of [...waiters]) if (w[0](m)) { waiters.splice(waiters.indexOf(w), 1); w[1](m); }
  };
  await new Promise((r) => (ws.onopen = r));
  const next = (match: (m: any) => boolean) =>
    new Promise<any>((resolve, reject) => {
      const found = heard.find(match);
      if (found) { heard.splice(heard.indexOf(found), 1); return resolve(found); }
      waiters.push([match, (m) => { heard.splice(heard.indexOf(m), 1); resolve(m); }]);
      setTimeout(() => reject(Error("nothing heard")), 4000);
    });
  ws.send(JSON.stringify(hello));
  await next(ready);
  return { send: (v: unknown) => ws.send(JSON.stringify(v)), next, close: () => ws.close() };
}
const live = (origin: string, token: string) => socket(origin.replace("http:", "ws:") + "/api/coaching/live", { type: "auth", token }, (m) => m.type === "ready");
const match = (origin: string, token: string, id: number) =>
  socket(origin.replace("http:", "ws:") + "/api/matches/live", { type: "join", token, match: id }, (m) => m.type === "state");

test("friends, messages and groups", async () => {
  const { origin } = setup();
  const [alice, bob, carol] = await Promise.all(["alice", "bob_cubes", "carol"].map((n) => account(origin, n)));
  const bobLive = await live(origin, bob.token);
  expect((await alice.get("social/users?q=bo")).map((u: any) => [u.username, u.relation])).toEqual([["bob_cubes", "none"]]);
  // An underscore in a name is the name's, not a wildcard.
  expect((await alice.get("social/users?q=bob_c")).map((u: any) => u.username)).toEqual(["bob_cubes"]);
  expect(await alice.get("social/users?q=bob%25")).toEqual([]);
  expect((await alice.call("POST", "social/friends", { username: "BOB_CUBES" })).value.relation).toBe("outgoing");
  expect((await bobLive.next((m) => m.type === "social" && m.kind === "request")).from.username).toBe("alice");
  expect((await bob.get("social/me")).incoming.map((p: any) => p.username)).toEqual(["alice"]);
  expect((await alice.call("POST", "social/friends", { username: "bob_cubes" })).status).toBe(409);
  expect((await bob.call("POST", `social/friends/${alice.id}/accept`)).value.relation).toBe("friend");
  expect((await alice.get("social/me")).friends.map((p: any) => p.username)).toEqual(["bob_cubes"]);

  // Friends write to each other; others cannot.
  const talk = (await alice.call("POST", "social/conversations", { userId: bob.id })).value;
  expect(talk).toMatchObject({ kind: "direct", with: { username: "bob_cubes" }, open: true });
  expect((await carol.call("POST", "social/conversations", { userId: alice.id })).status).toBe(403);
  expect((await alice.call("POST", `social/conversations/${talk.id}/messages`, { body: "  Race tonight?  " })).value.body).toBe("Race tonight?");
  expect((await bobLive.next((m) => m.kind === "message")).message).toMatchObject({ body: "Race tonight?", sender: { username: "alice" } });
  expect((await bob.get("social/me")).unread).toBe(1);
  expect((await bob.call("POST", `social/conversations/${talk.id}/read`)).value.unread).toBe(0);
  expect((await carol.call("GET", `social/conversations/${talk.id}/messages`)).status).toBe(404);

  // A group: its owner invites, the invited join or decline, members talk in its conversation.
  const group = (await alice.call("POST", "social/groups", { name: "Sunday cubers", description: "Weekly races" })).value;
  expect(group).toMatchObject({ role: "owner", members: [{ username: "alice", role: "owner" }] });
  expect((await bob.call("GET", `social/groups/${group.id}`)).status).toBe(404);
  await alice.call("POST", `social/groups/${group.id}/invite`, { username: "bob_cubes" });
  await alice.call("POST", `social/groups/${group.id}/invite`, { username: "carol" });
  expect((await bobLive.next((m) => m.kind === "invitation")).name).toBe("Sunday cubers");
  expect((await bob.get("social/me")).invitations.map((g: any) => g.name)).toEqual(["Sunday cubers"]);
  expect((await bob.call("POST", `social/groups/${group.id}/join`)).value.role).toBe("member");
  expect((await carol.call("DELETE", `social/groups/${group.id}/members/${carol.id}`)).status).toBe(200);
  expect((await bob.call("POST", `social/groups/${group.id}/invite`, { username: "carol" })).status).toBe(403);
  await alice.call("POST", `social/conversations/${group.conversationId}/messages`, { body: "Welcome!" });
  expect((await bobLive.next((m) => m.kind === "message")).title).toBe("Sunday cubers");
  expect((await bob.get("social/conversations")).map((c: any) => c.kind).sort()).toEqual(["direct", "group"]);
  expect((await alice.call("DELETE", `social/groups/${group.id}/members/${alice.id}`)).status).toBe(409);
  expect((await bob.call("DELETE", `social/groups/${group.id}`)).status).toBe(403);
});

test("a group's tournament: registration, the bracket round by round, matches raced on the same scrambles", async () => {
  const { origin } = setup();
  const [alice, bob, dave] = await Promise.all(["alice", "bob_cubes", "dave"].map((n) => account(origin, n)));
  const group = (await alice.call("POST", "social/groups", { name: "Club" })).value;
  for (const p of [bob, dave]) {
    await alice.call("POST", `social/groups/${group.id}/invite`, { username: p.name });
    await p.call("POST", `social/groups/${group.id}/join`);
  }
  const format = { groupId: group.id, name: "Club cup", event: "333", startsAt: Date.now() + 3600_000, points: 2, sets: 1 };
  expect((await bob.call("POST", "tournaments", format)).status).toBe(403);
  expect((await alice.call("POST", "tournaments", { ...format, event: "nope" })).status).toBe(422);
  const cup = (await alice.call("POST", "tournaments", format)).value;
  expect(cup).toMatchObject({ status: "open", canManage: true, players: 0 });
  for (const p of [alice, bob, dave]) expect((await p.call("POST", `tournaments/${cup.id}/register`)).value.registered).toBe(true);
  expect((await bob.get(`social/groups/${group.id}`)).tournaments[0]).toMatchObject({ name: "Club cup", players: 3 });

  // Three players: a bracket of four, one bye; the second round waits for the first round's match.
  const started = (await alice.call("POST", `tournaments/${cup.id}/start`)).value;
  expect(started).toMatchObject({ status: "running", round: 1, rounds: 2 });
  expect((await alice.call("POST", `tournaments/${cup.id}/register`)).status).toBe(409);
  const first = started.matches.filter((m: any) => m.round === 1);
  expect(first.map((m: any) => m.status).sort()).toEqual(["done", "ready"]);
  const raced = first.find((m: any) => m.status === "ready");
  const [a, b] = raced.players.map((p: any) => [alice, bob, dave].find((x) => x.id === p.id)!);
  expect(started.matches.find((m: any) => m.round === 2).status).toBe("waiting");

  // Outside the group, the match cannot be watched.
  const outsider = await account(origin, "eve");
  expect((await outsider.call("GET", `matches/${raced.id}`)).status).toBe(404);
  const sa = await match(origin, a.token, raced.id), sb = await match(origin, b.token, raced.id);
  const both = async (check: (m: any) => boolean) => Promise.all([sa.next((m) => m.type === "state" && check(m.match)), sb.next((m) => m.type === "state" && check(m.match))]);
  await sa.next((m) => m.type === "state" && m.match.present[0] && m.match.present[1]);
  // A solve: the first player's app sends the scramble, then both times; the faster takes the point.
  for (const [n, [ta, tb]] of [[1, [9000, 9500]], [2, [8000, 8200]]] as const) {
    sa.send({ type: "scramble", number: n, text: "R U R' U'" });
    await both((m) => m.solves.length === n && m.solves[n - 1].scramble === "R U R' U'");
    // A second scramble for the same solve is ignored.
    sb.send({ type: "scramble", number: n, text: "F2 B2" });
    sa.send({ type: "timer", phase: "running" });
    expect((await sb.next((m) => m.type === "timer")).phase).toBe("running");
    sa.send({ type: "solve", number: n, ms: ta });
    sb.send({ type: "solve", number: n, ms: tb });
    if (n === 1) await both((m) => !!m.solves[0]?.results.every(Boolean));
  }
  const [done] = await both((m) => m.status === "done");
  expect(done.match).toMatchObject({ winner: a.id, score: { sets: [1, 0] }, forfeit: false });
  // The final opens against the player who had the bye; its organiser gives it to the player who never shows up.
  const after = await alice.get(`tournaments/${cup.id}`);
  const final = after.matches.find((m: any) => m.round === 2);
  expect(after.round).toBe(2);
  expect(final.status).toBe("ready");
  expect(final.players.map((p: any) => p.id)).toContain(a.id);
  expect((await bob.call("POST", `matches/${final.id}/award`, { winner: a.id })).status).toBe(403);
  expect((await alice.call("POST", `matches/${final.id}/award`, { winner: a.id })).value).toMatchObject({ status: "done", forfeit: true });
  expect(await alice.get(`tournaments/${cup.id}`)).toMatchObject({ status: "finished", winner: { id: a.id } });
});

test("battles in a group, and tournaments the administration opens to everyone", async () => {
  const { origin, admin } = setup();
  const [alice, bob, carol] = await Promise.all(["alice", "bob_cubes", "carol"].map((n) => account(origin, n)));
  const group = (await alice.call("POST", "social/groups", { name: "Club" })).value;
  await alice.call("POST", `social/groups/${group.id}/invite`, { username: "bob_cubes" });
  await bob.call("POST", `social/groups/${group.id}/join`);
  const bobLive = await live(origin, bob.token);
  // An open battle: anyone in the group may take it up, no one outside it.
  const battle = (await alice.call("POST", "matches", { groupId: group.id, event: "222", points: 3, sets: 2 })).value;
  expect(battle).toMatchObject({ status: "waiting", players: [{ username: "alice" }, null] });
  expect((await bobLive.next((m) => m.kind === "battle")).open).toBe(true);
  expect((await carol.call("POST", `matches/${battle.id}/accept`)).status).toBe(404);
  expect((await alice.call("POST", `matches/${battle.id}/accept`)).status).toBe(409);
  expect((await bob.call("POST", `matches/${battle.id}/accept`)).value.status).toBe("ready");
  expect((await bob.get(`social/groups/${group.id}`)).battles[0]).toMatchObject({ id: battle.id, status: "ready" });
  expect((await bob.call("DELETE", `matches/${battle.id}`)).status).toBe(200);

  const adm = await adminSession(origin, admin);
  expect((await alice.call("POST", "tournaments", { name: "Open", event: "333", startsAt: Date.now() + 1000, points: 1, sets: 1 })).status).toBe(422);
  // A tournament takes from 2 to 100 players.
  for (const maxPlayers of [1, 101]) expect((await adm("POST", "tournaments", { name: "Too many", event: "333", startsAt: Date.now() + 3600_000, points: 1, sets: 1, maxPlayers })).status).toBe(422);
  const open = (await adm("POST", "tournaments", { name: "Autumn open", event: "333", startsAt: Date.now() + 3600_000, points: 3, sets: 2, maxPlayers: 2 })).value;
  expect((await alice.get("tournaments")).map((t: any) => t.name)).toEqual(["Autumn open"]);
  await alice.call("POST", `tournaments/${open.id}/register`);
  await bob.call("POST", `tournaments/${open.id}/register`);
  expect((await carol.call("POST", `tournaments/${open.id}/register`)).status).toBe(409);
  expect((await alice.call("POST", `tournaments/${open.id}/start`)).status).toBe(403);
  const started = (await adm("POST", `tournaments/${open.id}/start`)).value;
  expect(started).toMatchObject({ status: "running", rounds: 1 });
  expect((await alice.get("tournaments"))[0].myMatch).toBe(started.matches[0].id);
  await adm("POST", `matches/${started.matches[0].id}/award`, { winner: bob.id });
  expect((await adm("GET", `tournaments/${open.id}`)).value).toMatchObject({ status: "finished", winner: { username: "bob_cubes" } });

  // A tournament starts by itself at its date; one with fewer than two players is called off.
  const soon = (await adm("POST", "tournaments", { name: "Lonely", event: "333", startsAt: Date.now(), points: 1, sets: 1 })).value;
  expect(soon.maxPlayers).toBe(100);
  await alice.call("POST", `tournaments/${soon.id}/register`);
  for (let i = 0; i < 40 && (await alice.get(`tournaments/${soon.id}`)).status === "open"; i++) await Bun.sleep(250);
  expect((await alice.get(`tournaments/${soon.id}`)).status).toBe("cancelled");
}, 20000);

test("battles and tournaments show in their conversations as cards; two friends battle in theirs", async () => {
  const { origin } = setup();
  const [alice, bob, carol] = await Promise.all(["alice", "bob_cubes", "carol"].map((n) => account(origin, n)));
  for (const p of [bob, carol]) {
    await alice.call("POST", "social/friends", { username: p.name });
    await p.call("POST", `social/friends/${alice.id}/accept`);
  }
  const bobLive = await live(origin, bob.token);
  // A group made with friends picked at once: they are invited.
  const group = (await alice.call("POST", "social/groups", { name: "Club", invite: [bob.id, "not-a-friend"] })).value;
  expect(group.members.map((m: any) => [m.username, m.role])).toEqual([["alice", "owner"], ["bob_cubes", "invited"]]);
  expect((await bobLive.next((m) => m.kind === "invitation")).name).toBe("Club");
  await bob.call("POST", `social/groups/${group.id}/join`);
  // An invitation by account, among the friends.
  expect((await alice.call("POST", `social/groups/${group.id}/invite`, { userId: carol.id })).value.members.map((m: any) => m.username)).toContain("carol");

  // A battle launched from the friends' conversation: against the other, its card in the conversation.
  const talk = (await alice.call("POST", "social/conversations", { userId: bob.id })).value;
  const duel = (await alice.call("POST", "matches", { conversationId: talk.id, event: "333", points: 2, sets: 1 })).value;
  expect(duel).toMatchObject({ status: "waiting", groupId: null, conversationId: talk.id, players: [{ username: "alice" }, { username: "bob_cubes" }] });
  const heard = await bobLive.next((m) => m.kind === "message" && m.conversation === talk.id);
  expect(heard.message).toMatchObject({ body: "", match: { id: duel.id, status: "waiting" } });
  expect((await bobLive.next((m) => m.kind === "battle")).conversation).toBe(talk.id);
  expect((await bob.get("social/conversations")).find((c: any) => c.id === talk.id).lastMessage.card).toBe("match");
  // Only the two see it; accepted, its card says so the next time it is read.
  expect((await carol.call("GET", `matches/${duel.id}`)).status).toBe(404);
  expect((await carol.call("POST", "matches", { conversationId: talk.id, event: "333", points: 1, sets: 1 })).status).toBe(404);
  expect((await bob.call("POST", `matches/${duel.id}/accept`)).value.status).toBe("ready");
  expect((await bobLive.next((m) => m.kind === "match" && m.match === duel.id)).players).toEqual([alice.id, bob.id]);
  const messages = await bob.get(`social/conversations/${talk.id}/messages`);
  expect(messages.at(-1).match).toMatchObject({ id: duel.id, status: "ready" });

  // A group's tournament and battles: cards in its conversation, its members told as its matches change.
  const cup = (await alice.call("POST", "tournaments", { groupId: group.id, name: "Club cup", event: "222", startsAt: Date.now() + 3600_000, points: 1, sets: 1 })).value;
  const card = await bobLive.next((m) => m.kind === "message" && m.conversation === group.conversationId);
  expect(card.message.tournament).toMatchObject({ id: cup.id, name: "Club cup" });
  await bob.call("POST", `tournaments/${cup.id}/register`);
  const read = await bob.get(`social/conversations/${group.conversationId}/messages`);
  expect(read.at(-1).tournament).toMatchObject({ id: cup.id, registered: true, players: 1 });
  const open = (await bob.call("POST", "matches", { conversationId: group.conversationId, event: "222", points: 1, sets: 1 })).value;
  expect(open).toMatchObject({ groupId: group.id, players: [{ username: "bob_cubes" }, null] });
  await alice.call("POST", `matches/${open.id}/accept`);
  expect((await bobLive.next((m) => m.kind === "match" && m.match === open.id)).status).toBe("ready");
  // Every account sees the open tournaments and those of its groups.
  expect((await bob.get("tournaments")).map((t: any) => t.name)).toEqual(["Club cup"]);
  expect(await (await account(origin, "dave")).get("tournaments")).toEqual([]);
});

test("the competition an account is in, and giving up a tournament under way", async () => {
  const { origin } = setup();
  const [alice, bob, dave, eve] = await Promise.all(["alice", "bob_cubes", "dave", "eve"].map((n) => account(origin, n)));
  const group = (await alice.call("POST", "social/groups", { name: "Club" })).value;
  for (const p of [bob, dave, eve]) {
    await alice.call("POST", `social/groups/${group.id}/invite`, { username: p.name });
    await p.call("POST", `social/groups/${group.id}/join`);
  }
  expect(await alice.get("competition")).toEqual({ match: null, tournament: null });
  const cup = (await alice.call("POST", "tournaments", { groupId: group.id, name: "Cup", event: "222", startsAt: Date.now() + 3600_000, points: 1, sets: 1 })).value;
  for (const p of [alice, bob, dave, eve]) await p.call("POST", `tournaments/${cup.id}/register`);
  // Registered but not started: free to go anywhere.
  expect((await bob.get("competition")).tournament).toBeNull();
  const started = (await alice.call("POST", `tournaments/${cup.id}/start`)).value;
  for (const p of [alice, bob, dave, eve]) expect((await p.get("competition")).tournament).toBe(cup.id);
  // Bob gives up: his match goes to his opponent, who stays in; he is free.
  const his = started.matches.find((m: any) => m.round === 1 && m.players.some((x: any) => x?.id === bob.id));
  const opponent = [alice, dave, eve].find((p) => his.players.some((x: any) => x?.id === p.id))!;
  const after = (await bob.call("POST", `tournaments/${cup.id}/withdraw`)).value;
  expect(after.matches.find((m: any) => m.id === his.id)).toMatchObject({ status: "done", winner: opponent.id, forfeit: true });
  expect(after.entrants.find((p: any) => p.id === bob.id).withdrawn).toBe(true);
  expect((await bob.get("competition")).tournament).toBeNull();
  expect((await opponent.get("competition")).tournament).toBe(cup.id);
  expect((await bob.call("POST", `tournaments/${cup.id}/withdraw`)).status).toBe(200);
  // A battle accepted holds both players until it is over.
  const talk = (await alice.call("POST", "matches", { conversationId: group.conversationId, event: "333", points: 1, sets: 1, opponentId: dave.id })).value;
  expect((await dave.get("competition")).match).toBeNull();
  await dave.call("POST", `matches/${talk.id}/accept`);
  expect((await dave.get("competition")).match).toBe(talk.id);
});

test("an account deleted by its owner takes its practice and its community with it", async () => {
  const { origin } = setup();
  const [alice, bob] = await Promise.all(["alice", "bob_cubes"].map((n) => account(origin, n)));
  await alice.call("POST", "social/friends", { username: "bob_cubes" });
  await bob.call("POST", `social/friends/${alice.id}/accept`);
  const group = (await alice.call("POST", "social/groups", { name: "Club" })).value;
  await alice.call("POST", `social/groups/${group.id}/invite`, { username: "bob_cubes" });
  await bob.call("POST", `social/groups/${group.id}/join`);
  expect((await alice.call("POST", "account/delete", { password: "not-the-password" })).status).toBe(401);
  expect((await alice.call("POST", "account/delete", { password: "a-long-test-password" })).value).toEqual({ ok: true });
  // Signed out everywhere, and gone for the others: no friend, and the group it owned with it.
  expect((await alice.call("GET", "social/me")).status).toBe(401);
  expect((await bob.get("social/me")).friends).toEqual([]);
  expect((await bob.call("GET", `social/groups/${group.id}`)).status).toBe(404);
  const login = await fetch(origin + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "alice", password: "a-long-test-password" }) });
  expect(login.status).toBe(401);
});
