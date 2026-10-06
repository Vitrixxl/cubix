/**
 * The community and tournaments on the web app: the /api/social, /api/tournaments and /api/matches routes called with
 * the account's token, and their events, which arrive on the coaching socket (coaching/client.ts passes them here).
 * Everything lives here; pages read it and the store's `emit` redraws them.
 */
import { toast } from "sonner";
import { store as s } from "../store";
import { call } from "../bridge";
import { go } from "../navigation";
import { eventInfo } from "../../../src/shared/puzzles";
import { tr } from "../../../src/client/i18n";

export interface Person {
  id: string;
  username: string;
  avatar: string | null;
}
export interface GroupSummary {
  id: number;
  name: string;
  description: string;
  members: number;
  role: Role;
  createdAt: number;
  /** Who invited the account, for an invitation. */
  invitedBy?: string;
}
export type Role = "owner" | "admin" | "member" | "invited";
export interface Me {
  friends: (Person & { since: number })[];
  incoming: (Person & { at: number })[];
  outgoing: (Person & { at: number })[];
  groups: GroupSummary[];
  invitations: GroupSummary[];
  unread: number;
}
export interface Conversation {
  id: number;
  kind: "direct" | "group";
  with: Person | null;
  group: { id: number; name: string } | null;
  lastMessage: { body: string; at: number; mine: boolean; from: string } | null;
  unread: number;
  updatedAt: number;
  /** Whether messages may be written: two players while they are friends, a group always. */
  open: boolean;
}
export interface Message {
  id: number;
  senderId: string;
  sender: Person;
  body: string;
  createdAt: number;
}
export type MatchStatus = "waiting" | "ready" | "live" | "done" | "cancelled";
export interface Result {
  ms: number;
  penalty: "none" | "+2" | "dnf";
}
export interface MatchSolve {
  number: number;
  scramble: string;
  results: [Result | null, Result | null];
  /** The seat that took the solve, null for a tie or while it is open. */
  winner: number | null;
}
export interface Match {
  id: number;
  tournamentId: number | null;
  tournament: string | null;
  groupId: number | null;
  group: string | null;
  round: number;
  slot: number;
  event: string;
  /** Solves won to take a set. */
  points: number;
  /** Sets won to take the match. */
  sets: number;
  status: MatchStatus;
  /** The winner's account. */
  winner: string | null;
  forfeit: boolean;
  players: [Person | null, Person | null];
  score: { sets: [number, number]; points: [number, number] };
  solved: number;
  createdBy: string | null;
  creator: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  solves?: MatchSolve[];
  /** On the match socket: which players have the match open. */
  present?: [boolean, boolean];
}
export type TournamentStatus = "open" | "running" | "finished" | "cancelled";
export interface Tournament {
  id: number;
  name: string;
  description: string;
  event: string;
  groupId: number | null;
  group: string | null;
  startsAt: number;
  points: number;
  sets: number;
  maxPlayers: number | null;
  status: TournamentStatus;
  /** The round being played, from 1, and how many the bracket has. */
  round: number;
  rounds: number;
  players: number;
  winner: Person | null;
  registered?: boolean;
  /** The account's match to play now. */
  myMatch?: number | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}
export interface TournamentDetail extends Tournament {
  entrants: (Person & { seed: number | null; registeredAt: number })[];
  matches: Match[];
  canManage: boolean;
}
export interface Group {
  id: number;
  name: string;
  description: string;
  ownerId: string;
  createdAt: number;
  role: Role;
  conversationId: number;
  members: (Person & { role: Role; joinedAt: number })[];
  tournaments: Tournament[];
  battles: Match[];
}

export const communityUrl = (view = "") => "/community" + (view ? "/" + view : "");
export const tournamentUrl = (id?: number) => "/tournaments" + (id ? "/" + id : "");
export const matchUrl = (id: number) => "/match/" + id;
export { eventName, formatText, type Format } from "../tournaments/format";
import type { Format } from "../tournaments/format";
/** The seat of the account in a match, or null when it only watches. */
export const seatIn = (m: Pick<Match, "players">, user: string | undefined) => (m.players[0]?.id === user ? 0 : m.players[1]?.id === user ? 1 : null);

class Community {
  user: string | null = null;
  me?: Me;
  conversations?: Conversation[];
  messages = new Map<number, Message[]>();
  groups = new Map<number, Group>();
  tournaments?: Tournament[];
  details = new Map<number, TournamentDetail>();
  /** The conversation on screen: its messages are read as they arrive. */
  open: number | null = null;
  private loading = new Map<string, Promise<unknown>>();

  /** Follows the signed-in account: a new one starts afresh. */
  attach(user: string | null) {
    if (user === this.user) return;
    this.user = user;
    this.me = this.conversations = this.tournaments = undefined;
    this.messages.clear();
    this.groups.clear();
    this.details.clear();
    this.loading.clear();
    if (user) void this.load("me");
  }

  async api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await call("apiToken");
    let response: Response;
    try {
      response = await fetch(location.origin + "/api/" + path, {
        method,
        headers: { ...(token ? { authorization: "Bearer " + token } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new Error(tr("The server cannot be reached."));
    }
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(tr(value.error ?? "Request failed ({0})", { 0: response.status }));
    return value as T;
  }

  /** Loads something once at a time: `me`, `conversations`, `messages:<id>`, `group:<id>`, `tournaments`, `tournament:<id>`. */
  load(key: string): Promise<unknown> {
    const running = this.loading.get(key);
    if (running) return running;
    const [kind, arg] = key.split(":") as [string, string | undefined];
    const owner = this.user;
    const task = (async () => {
      try {
        if (kind === "me") this.me = await this.api("GET", "social/me");
        else if (kind === "conversations") this.conversations = await this.api("GET", "social/conversations");
        else if (kind === "messages") this.messages.set(Number(arg), await this.api("GET", `social/conversations/${arg}/messages`));
        else if (kind === "group") this.groups.set(Number(arg), await this.api("GET", `social/groups/${arg}`));
        else if (kind === "tournaments") this.tournaments = await this.api("GET", "tournaments");
        else if (kind === "tournament") this.details.set(Number(arg), await this.api("GET", `tournaments/${arg}`));
      } catch (error) {
        if (owner === this.user && kind !== "me") toast.error((error as Error).message, { id: "community-" + key });
        if (kind === "group") this.groups.delete(Number(arg));
      } finally {
        this.loading.delete(key);
        if (owner === this.user) s.emit();
      }
    })();
    this.loading.set(key, task);
    return task;
  }
  /** Runs a change, then reloads what it touched; failures become toasts. Returns the answer, undefined on failure. */
  async act<T = any>(method: string, path: string, body?: unknown, reload: string[] = []): Promise<T | undefined> {
    try {
      const value = await this.api<T>(method, path, body);
      await Promise.all(reload.map((key) => this.load(key)));
      return value;
    } catch (error) {
      toast.error((error as Error).message);
      return undefined;
    } finally {
      s.emit();
    }
  }

  // Friends.
  search(query: string): Promise<(Person & { relation: "friend" | "incoming" | "outgoing" | "none" })[]> {
    return this.api("GET", "social/users?q=" + encodeURIComponent(query)).catch(() => []);
  }
  addFriend = (username: string) => this.act("POST", "social/friends", { username }, ["me"]);
  acceptFriend = (id: string) => this.act("POST", `social/friends/${id}/accept`, undefined, ["me"]);
  removeFriend = (id: string) => this.act("DELETE", `social/friends/${id}`, undefined, ["me"]);
  /** Opens the conversation with a friend, creating it on first need. */
  async message(userId: string) {
    const c = await this.act<Conversation>("POST", "social/conversations", { userId }, ["conversations"]);
    if (c) go(communityUrl("messages/" + c.id));
  }

  // Conversations.
  async send(conversation: number, body: string) {
    const message = await this.act<Message>("POST", `social/conversations/${conversation}/messages`, { body });
    if (message) this.received(conversation, message);
    return !!message;
  }
  /** Marks the conversation read, here at once and on the server. */
  read(conversation: number) {
    const c = this.conversations?.find((c) => c.id === conversation);
    if (!c?.unread) return;
    if (this.me) this.me = { ...this.me, unread: Math.max(0, this.me.unread - c.unread) };
    this.conversations = this.conversations?.map((c) => (c.id === conversation ? { ...c, unread: 0 } : c));
    s.emit();
    void this.api<{ unread: number }>("POST", `social/conversations/${conversation}/read`).then((r) => {
      if (this.me) this.me = { ...this.me, unread: r.unread };
      s.emit();
    }, () => {});
  }
  /** A message, sent from here or arriving on the socket (each once). */
  private received(conversation: number, message: Message, title?: string) {
    const list = this.messages.get(conversation);
    if (list?.some((m) => m.id === message.id)) return;
    if (list) this.messages.set(conversation, [...list, message]);
    const mine = message.senderId === s.user.id,
      shown = this.open === conversation && document.visibilityState === "visible";
    let known = false;
    this.conversations = this.conversations
      ?.map((c) => {
        if (c.id !== conversation) return c;
        known = true;
        return { ...c, lastMessage: { body: message.body, at: message.createdAt, mine, from: message.sender.username }, updatedAt: message.createdAt, unread: c.unread + (mine || shown ? 0 : 1) };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
    if (this.conversations && !known) void this.load("conversations");
    if (!mine && !shown) {
      if (this.me) this.me = { ...this.me, unread: this.me.unread + 1 };
      const text = message.body.length > 120 ? message.body.slice(0, 120) + "…" : message.body;
      toast(title && title !== message.sender.username ? `${message.sender.username} · ${title}` : message.sender.username, {
        id: "community-message-" + conversation,
        description: text,
        action: { label: tr("Open"), onClick: () => go(communityUrl("messages/" + conversation)) },
      });
    }
    if (!mine && shown) this.read(conversation);
    s.emit();
  }

  // Groups.
  async createGroup(name: string, description: string) {
    const group = await this.act<Group>("POST", "social/groups", { name, description }, ["me", "conversations"]);
    if (group) {
      this.groups.set(group.id, group);
      go(communityUrl("groups/" + group.id));
    }
    return group;
  }
  /** A change of a group, whose answer is the group as it now stands: kept as it comes. */
  private async regroup(method: string, path: string, body?: unknown, reload: string[] = []) {
    const group = await this.act<Group>(method, path, body, reload);
    if (group) this.groups.set(group.id, group);
    return group;
  }
  invite = (group: number, username: string) => this.regroup("POST", `social/groups/${group}/invite`, { username });
  async join(group: number) {
    if (await this.regroup("POST", `social/groups/${group}/join`, undefined, ["me", "conversations"])) go(communityUrl("groups/" + group));
  }
  /** Leaves a group, declines its invitation, or removes a member. */
  async remove(group: number, user: string) {
    const own = user === s.user.id;
    if (!(await this.act("DELETE", `social/groups/${group}/members/${user}`, undefined, own ? ["me", "conversations"] : [`group:${group}`]))) return;
    if (own) {
      this.groups.delete(group);
      go(communityUrl("groups"));
    }
  }
  setRole = (group: number, user: string, role: "admin" | "member") => this.regroup("POST", `social/groups/${group}/members/${user}/role`, { role });
  updateGroup = (group: number, name: string, description: string) => this.regroup("PUT", `social/groups/${group}`, { name, description }, ["me"]);
  async deleteGroup(group: number) {
    if (!(await this.act("DELETE", `social/groups/${group}`, undefined, ["me", "conversations"]))) return;
    this.groups.delete(group);
    go(communityUrl("groups"));
  }

  // Tournaments and battles.
  /** A change of a tournament, whose answer is the tournament as it now stands: kept, the lists around it reloaded. */
  private async retournament(id: number, method: string, path: string) {
    const t = await this.act<TournamentDetail>(method, path, undefined, this.tournamentKeys(id));
    if (t) this.details.set(id, t);
    return t;
  }
  register = (id: number, join: boolean) => this.retournament(id, join ? "POST" : "DELETE", `tournaments/${id}/register`);
  async createTournament(group: number, form: Format & { name: string; description: string; startsAt: number; maxPlayers: number | null }) {
    const t = await this.act<TournamentDetail>("POST", "tournaments", { groupId: group, ...form }, [`group:${group}`]);
    if (t) {
      this.details.set(t.id, t);
      go(tournamentUrl(t.id));
    }
    return t;
  }
  manage = (id: number, action: "start" | "cancel") => this.retournament(id, "POST", `tournaments/${id}/${action}`);
  award = (match: number, winner: string, tournament: number) => this.act("POST", `matches/${match}/award`, { winner }, [`tournament:${tournament}`, ...this.tournamentKeys(tournament)]);
  battle = (group: number, form: Format & { opponentId: string | null }) => this.act<Match>("POST", "matches", { groupId: group, ...form }, [`group:${group}`]);
  async acceptBattle(match: Match) {
    if (await this.act("POST", `matches/${match.id}/accept`, undefined, match.groupId ? [`group:${match.groupId}`] : [])) go(matchUrl(match.id));
  }
  cancelBattle = (match: Match) => this.act("DELETE", `matches/${match.id}`, undefined, match.groupId ? [`group:${match.groupId}`] : []);
  /** What to reload when a tournament changes: its page, the list, and its group's page. */
  private tournamentKeys(id: number) {
    const group = this.details.get(id)?.groupId ?? this.tournaments?.find((t) => t.id === id)?.groupId;
    return [...(this.tournaments ? ["tournaments"] : []), ...(group && this.groups.has(group) ? [`group:${group}`] : [])];
  }

  /** The socket came back: whatever changed meanwhile. */
  reconnected() {
    if (!this.user) return;
    void this.load("me");
    if (this.conversations) void this.load("conversations");
    for (const id of this.groups.keys()) void this.load(`group:${id}`);
    if (this.tournaments) void this.load("tournaments");
    for (const id of this.details.keys()) void this.load(`tournament:${id}`);
  }
  /** An event of the coaching socket about the community. */
  event(e: any) {
    switch (e.kind) {
      case "request":
        toast(tr("{0} wants to be friends", { 0: e.from.username }), {
          id: "community-request-" + e.from.id,
          action: { label: tr("Accept"), onClick: () => void this.acceptFriend(e.from.id) },
        });
        void this.load("me");
        break;
      case "accepted":
        toast(tr("{0} accepted your friend request", { 0: e.by.username }), { action: { label: tr("Message"), onClick: () => void this.message(e.by.id) } });
        void this.load("me");
        break;
      case "friends":
        void this.load("me");
        if (this.conversations) void this.load("conversations");
        break;
      case "message":
        this.received(e.conversation, e.message, e.title);
        break;
      case "invitation":
        toast(tr("{0} invites you to {1}", { 0: e.from, 1: e.name }), { action: { label: tr("Join"), onClick: () => void this.join(e.group) } });
        void this.load("me");
        break;
      case "groups":
        void this.load("me");
        if (this.conversations) void this.load("conversations");
        for (const id of [e.deleted, e.left]) if (id) this.groups.delete(id);
        break;
      case "group":
        if (this.groups.has(e.group)) void this.load(`group:${e.group}`);
        void this.load("me");
        break;
      case "tournament":
        if (e.deleted) this.details.delete(e.tournament);
        else if (this.details.has(e.tournament)) void this.load(`tournament:${e.tournament}`);
        if (this.tournaments) void this.load("tournaments");
        if (e.group && this.groups.has(e.group)) void this.load(`group:${e.group}`);
        for (const [id, g] of this.groups) if (g.tournaments.some((t) => t.id === e.tournament)) void this.load(`group:${id}`);
        break;
      case "match":
        if (e.status === "ready" && !location.pathname.startsWith(matchUrl(e.match)))
          toast(e.tournament ? tr("Your match in {0} is ready", { 0: e.tournament }) : tr("Your battle is ready"), {
            id: "community-match-" + e.match,
            description: e.round ? tr("Round {0}", { 0: e.round }) : e.group ?? undefined,
            duration: 30_000,
            action: { label: tr("Play"), onClick: () => go(matchUrl(e.match)) },
          });
        if (this.tournaments) void this.load("tournaments");
        for (const id of this.details.keys()) void this.load(`tournament:${id}`);
        break;
      case "battle":
        toast(e.open ? tr("{0} opened a battle in {1}", { 0: e.from, 1: e.groupName }) : tr("{0} challenges you in {1}", { 0: e.from, 1: e.groupName }), {
          id: "community-battle-" + e.match,
          duration: 30_000,
          action: { label: tr("View"), onClick: () => go(communityUrl(`groups/${e.group}/battles`)) },
        });
        break;
    }
    s.emit();
  }
}

export const community = new Community();
