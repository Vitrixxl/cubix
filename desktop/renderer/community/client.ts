/**
 * The community and tournaments on the web app: the /api/social, /api/tournaments and /api/matches routes called with
 * the account's token, and their events, which arrive on the coaching socket (coaching/client.ts passes them here).
 * Everything lives here; pages read it and the store's `emit` redraws them.
 */
import { createElement } from "react";
import { toast } from "sonner";
import { Play, Swords, Users, type LucideIcon } from "lucide-react";
import { Avatar } from "../base";
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
  /** The latest message; `card` when it is a battle or a tournament rather than words. */
  lastMessage: { body: string; at: number; mine: boolean; from: string; card: "match" | "tournament" | null } | null;
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
  /** A battle or a tournament the message shows as a card, as it stood when the message was read. */
  match?: Match;
  tournament?: Tournament;
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
  /** The conversation whose card shows a battle. */
  conversationId: number | null;
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
  /** Sets won, solves won in the set under way, and solves won in all. */
  score: { sets: [number, number]; points: [number, number]; solves: [number, number] };
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

/** A notification's face: its kind's icon, or the avatar of the player it comes from. */
const icon = (I: LucideIcon) => createElement(I);
const face = (p: { username: string; avatar?: string | null }) => createElement(Avatar, { name: p.username, src: p.avatar, size: 36 });

export const communityUrl = (view = "") => "/community" + (view ? "/" + view : "");
export const tournamentUrl = (id?: number) => "/tournaments" + (id ? "/" + id : "");
export const matchUrl = (id: number) => "/match/" + id;
export { eventName, formatText, scoreOf, type Format } from "../tournaments/format";
import { eventName, type Format } from "../tournaments/format";
import { ask } from "../confirm";
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
  /** Battles and tournaments shown as cards, kept up to date as they change. */
  cards = new Map<number, Match>();
  summaries = new Map<number, Tournament>();
  /**
   * What the account is in the middle of: a battle ready or under way, or a tournament under way it is still in. The
   * app keeps it there, full screen, until it is over or given up.
   */
  competition?: { match: number | null; tournament: number | null };
  /** The conversation on screen: its messages are read as they arrive. */
  open: number | null = null;
  private loading = new Map<string, Promise<unknown>>();

  /** Follows the signed-in account: a new one starts afresh. */
  attach(user: string | null) {
    if (user === this.user) return;
    this.user = user;
    this.me = this.conversations = this.tournaments = this.competition = undefined;
    this.messages.clear();
    this.groups.clear();
    this.details.clear();
    this.cards.clear();
    this.summaries.clear();
    this.loading.clear();
    if (user) {
      void this.load("me");
      void this.load("competition");
    }
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

  /**
   * Loads something once at a time: `me`, `conversations`, `messages:<id>`, `group:<id>`, `tournaments`,
   * `tournament:<id>`, `match:<id>` (a battle with its solves).
   */
  load(key: string): Promise<unknown> {
    const running = this.loading.get(key);
    if (running) return running;
    const [kind, arg] = key.split(":") as [string, string | undefined];
    const owner = this.user;
    const task = (async () => {
      try {
        if (kind === "me") this.me = await this.api("GET", "social/me");
        else if (kind === "competition") this.competition = await this.api("GET", "competition");
        else if (kind === "conversations") this.conversations = await this.api("GET", "social/conversations");
        else if (kind === "messages") {
          const list: Message[] = await this.api("GET", `social/conversations/${arg}/messages`);
          for (const m of list) this.keep(m);
          this.messages.set(Number(arg), list);
        } else if (kind === "group") this.groups.set(Number(arg), await this.api("GET", `social/groups/${arg}`));
        else if (kind === "tournaments") this.tournaments = await this.api("GET", "tournaments");
        else if (kind === "tournament") {
          const t: TournamentDetail = await this.api("GET", `tournaments/${arg}`);
          this.details.set(t.id, t);
          if (this.summaries.has(t.id)) this.summaries.set(t.id, t);
        } else if (kind === "match") {
          const m: Match = await this.api("GET", `matches/${arg}`);
          this.cards.set(m.id, m);
        }
      } catch (error) {
        if (owner === this.user && kind !== "me" && kind !== "match" && kind !== "competition") toast.error((error as Error).message, { id: "community-" + key });
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

  /** The cards a message carries, kept to be updated as they change. */
  private keep(m: Message) {
    // A battle's solves, once loaded, stay: the message only has its summary.
    if (m.match) this.cards.set(m.match.id, { ...this.cards.get(m.match.id), ...m.match });
    // A tournament heard on the socket does not say whether the account registered: it is read again.
    if (m.tournament) {
      this.summaries.set(m.tournament.id, { ...this.summaries.get(m.tournament.id), ...m.tournament });
      if (m.tournament.registered === undefined) void this.load(`tournament:${m.tournament.id}`);
    }
  }
  /** A battle or a tournament as it stands now. */
  card = (m: Match) => this.cards.get(m.id) ?? m;
  summary = (t: Tournament) => this.details.get(t.id) ?? this.summaries.get(t.id) ?? t;
  /** Reads a battle's card again once it changed. */
  private refreshMatch(id: number) {
    if (this.cards.has(id)) void this.load(`match:${id}`);
  }

  // Friends.
  search(query: string): Promise<(Person & { relation: "friend" | "incoming" | "outgoing" | "none" })[]> {
    return this.api("GET", "social/users?q=" + encodeURIComponent(query)).catch(() => []);
  }
  addFriend = (username: string) => this.act("POST", "social/friends", { username }, ["me"]);
  acceptFriend = (id: string) => this.act("POST", `social/friends/${id}/accept`, undefined, ["me"]);
  /** Ends a friendship, declines a request or takes one back, once confirmed. */
  async removeFriend(id: string) {
    const me = this.me,
      name = [...(me?.friends ?? []), ...(me?.incoming ?? []), ...(me?.outgoing ?? [])].find((p) => p.id === id)?.username ?? "";
    const question = me?.incoming.some((p) => p.id === id)
      ? { title: tr("Decline {0}'s request?", { 0: name }), action: tr("Decline") }
      : me?.outgoing.some((p) => p.id === id)
        ? { title: tr("Take back your request to {0}?", { 0: name }), action: tr("Take back") }
        : { title: tr("Remove {0} from your friends?", { 0: name }), text: tr("Your conversation stays, but neither of you can write in it any more."), action: tr("Remove") };
    if (await ask(question)) return this.act("DELETE", `social/friends/${id}`, undefined, ["me"]);
  }
  /** Opens the conversation with a friend, creating it on first need. */
  async message(userId: string) {
    const c = await this.act<Conversation>("POST", "social/conversations", { userId }, ["conversations"]);
    if (c) go(communityUrl("messages/" + c.id));
    return c;
  }
  /** The link that opens the app on the account's friend request (see `add/<username>` on the community page). */
  shareLink = () => location.origin + communityUrl("add/" + encodeURIComponent(s.user.username));
  /** Requests and invitations waiting for an answer. */
  waiting = () => (this.me ? this.me.incoming.length + this.me.invitations.length : 0);

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
    this.keep(message);
    const card = message.match ? ("match" as const) : message.tournament ? ("tournament" as const) : null;
    if (list) this.messages.set(conversation, [...list, message]);
    const mine = message.senderId === s.user.id,
      shown = this.open === conversation && document.visibilityState === "visible";
    let known = false;
    this.conversations = this.conversations
      ?.map((c) => {
        if (c.id !== conversation) return c;
        known = true;
        return { ...c, lastMessage: { body: message.body, at: message.createdAt, mine, from: message.sender.username, card }, updatedAt: message.createdAt, unread: c.unread + (mine || shown ? 0 : 1) };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
    if (this.conversations && !known) void this.load("conversations");
    if (!mine && !shown) {
      if (this.me) this.me = { ...this.me, unread: this.me.unread + 1 };
      const text = card ? cardText(message) : message.body.length > 120 ? message.body.slice(0, 120) + "…" : message.body;
      // A battle's card has its own notice, the challenge (`battle`).
      if (card !== "match") toast(title && title !== message.sender.username ? `${message.sender.username} · ${title}` : message.sender.username, {
        id: "community-message-" + conversation,
        icon: face(message.sender),
        description: text,
        action: { label: tr("Open"), onClick: () => go(communityUrl("messages/" + conversation)) },
      });
    }
    if (!mine && shown) this.read(conversation);
    s.emit();
  }

  // Groups.
  /** A new group, its friends picked (`invite`, accounts) invited at once; its conversation opens. */
  async createGroup(name: string, description: string, invite: string[] = []) {
    const group = await this.act<Group>("POST", "social/groups", { name, description, invite }, ["me", "conversations"]);
    if (group) {
      this.groups.set(group.id, group);
      go(communityUrl("messages/" + group.conversationId));
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
  inviteFriend = (group: number, userId: string) => this.regroup("POST", `social/groups/${group}/invite`, { userId });
  async join(group: number) {
    const g = await this.regroup("POST", `social/groups/${group}/join`, undefined, ["me", "conversations"]);
    if (g) go(communityUrl("messages/" + g.conversationId));
  }
  /** Leaves a group, declines its invitation, or removes a member, once confirmed. */
  async remove(group: number, user: string) {
    const own = user === s.user.id,
      g = this.groups.get(group) ?? this.me?.groups.find((x) => x.id === group) ?? this.me?.invitations.find((x) => x.id === group),
      member = this.groups.get(group)?.members.find((m) => m.id === user),
      invited = own ? this.me?.invitations.some((x) => x.id === group) : member?.role === "invited";
    const question = own
      ? invited
        ? { title: tr("Decline the invitation to {0}?", { 0: g?.name }), action: tr("Decline") }
        : { title: tr("Leave {0}?", { 0: g?.name }), text: tr("You no longer see its conversation; an organiser can invite you again."), action: tr("Leave") }
      : invited
        ? { title: tr("Withdraw {0}'s invitation?", { 0: member?.username }), action: tr("Withdraw") }
        : { title: tr("Remove {0} from {1}?", { 0: member?.username, 1: g?.name }), action: tr("Remove") };
    if (!(await ask(question))) return;
    if (!(await this.act("DELETE", `social/groups/${group}/members/${user}`, undefined, own ? ["me", "conversations"] : [`group:${group}`]))) return;
    if (own) {
      this.groups.delete(group);
      go(communityUrl());
    }
  }
  setRole = (group: number, user: string, role: "admin" | "member") => this.regroup("POST", `social/groups/${group}/members/${user}/role`, { role });
  updateGroup = (group: number, name: string, description: string) => this.regroup("PUT", `social/groups/${group}`, { name, description }, ["me"]);
  async deleteGroup(group: number) {
    const name = this.groups.get(group)?.name;
    if (!(await ask({ title: tr("Delete {0}?", { 0: name }), text: tr("Its chat, tournaments and battles go with it, for every member. This cannot be undone."), action: tr("Delete the group") }))) return;
    if (!(await this.act("DELETE", `social/groups/${group}`, undefined, ["me", "conversations"]))) return;
    this.groups.delete(group);
    go(communityUrl());
  }

  // Tournaments and battles.
  /** A change of a tournament, whose answer is the tournament as it now stands: kept, the lists around it reloaded. */
  private async retournament(id: number, method: string, path: string) {
    const t = await this.act<TournamentDetail>(method, path, undefined, this.tournamentKeys(id));
    if (t) this.details.set(id, t);
    return t;
  }
  register = (id: number, join: boolean) => this.retournament(id, join ? "POST" : "DELETE", `tournaments/${id}/register`);
  /** A group's new tournament: its card comes into the group's conversation. */
  async createTournament(group: number, form: Format & { name: string; description: string; startsAt: number; maxPlayers: number | null }) {
    const t = await this.act<TournamentDetail>("POST", "tournaments", { groupId: group, ...form }, [`group:${group}`]);
    if (t) this.details.set(t.id, t);
    return t;
  }
  /** Gives up a tournament under way, once confirmed: the match under way and every later one go to the opponents. */
  async withdraw(t: Pick<Tournament, "id" | "name">) {
    if (!(await ask({ title: tr("Give up {0}?", { 0: t.name }), text: tr("Your match under way and every later one go to your opponents. You cannot come back into this tournament."), action: tr("Give up") }))) return;
    const done = await this.retournament(t.id, "POST", `tournaments/${t.id}/withdraw`);
    await this.load("competition");
    return done;
  }
  manage = (id: number, action: "start" | "cancel") => this.retournament(id, "POST", `tournaments/${id}/${action}`);
  /** A battle launched from a conversation: against the friend, or in a group against a member or anyone. */
  battle = (conversation: number, form: Format & { opponentId: string | null }) => this.act<Match>("POST", "matches", { conversationId: conversation, ...form });
  award = (match: number, winner: string, tournament: number) => this.act("POST", `matches/${match}/award`, { winner }, [`tournament:${tournament}`, ...this.tournamentKeys(tournament)]);
  async acceptBattle(match: Match) {
    if (await this.act("POST", `matches/${match.id}/accept`, undefined, [`match:${match.id}`, ...(match.groupId && this.groups.has(match.groupId) ? [`group:${match.groupId}`] : [])])) go(matchUrl(match.id));
  }
  /** Calls a battle off, or declines it, once confirmed. */
  async cancelBattle(match: Match) {
    const mine = match.players[0]?.id === s.user.id;
    if (!(await ask({ title: mine ? tr("Call off the battle?") : tr("Decline the battle?"), text: tr("It is cancelled for both of you."), action: mine ? tr("Call off") : tr("Decline") }))) return;
    return this.act("DELETE", `matches/${match.id}`, undefined, [`match:${match.id}`, ...(match.groupId && this.groups.has(match.groupId) ? [`group:${match.groupId}`] : [])]);
  }
  /** What to reload when a tournament changes: its page, the list, and its group's page. */
  private tournamentKeys(id: number) {
    const group = this.details.get(id)?.groupId ?? this.tournaments?.find((t) => t.id === id)?.groupId;
    return [...(this.tournaments ? ["tournaments"] : []), ...(group && this.groups.has(group) ? [`group:${group}`] : [])];
  }

  /** The socket came back: whatever changed meanwhile. */
  reconnected() {
    if (!this.user) return;
    void this.load("me");
    void this.load("competition");
    if (this.conversations) void this.load("conversations");
    for (const id of this.groups.keys()) void this.load(`group:${id}`);
    if (this.tournaments) void this.load("tournaments");
    for (const id of this.details.keys()) void this.load(`tournament:${id}`);
    for (const id of this.cards.keys()) void this.load(`match:${id}`);
    for (const id of this.summaries.keys()) if (!this.details.has(id)) void this.load(`tournament:${id}`);
  }
  /** An event of the coaching socket about the community. */
  event(e: any) {
    switch (e.kind) {
      case "request":
        toast(tr("{0} wants to be friends", { 0: e.from.username }), {
          id: "community-request-" + e.from.id,
          icon: face(e.from),
          action: { label: tr("Accept"), onClick: () => void this.acceptFriend(e.from.id) },
        });
        void this.load("me");
        break;
      case "accepted":
        toast(tr("{0} accepted your friend request", { 0: e.by.username }), { icon: face(e.by), action: { label: tr("Message"), onClick: () => void this.message(e.by.id) } });
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
        toast(tr("{0} invites you to {1}", { 0: e.from, 1: e.name }), { icon: icon(Users), action: { label: tr("Join"), onClick: () => void this.join(e.group) } });
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
        void this.load("competition");
        if (e.deleted) this.details.delete(e.tournament);
        else if (this.details.has(e.tournament) || this.summaries.has(e.tournament)) void this.load(`tournament:${e.tournament}`);
        if (this.tournaments) void this.load("tournaments");
        if (e.group && this.groups.has(e.group)) void this.load(`group:${e.group}`);
        for (const [id, g] of this.groups) if (g.tournaments.some((t) => t.id === e.tournament)) void this.load(`group:${id}`);
        break;
      case "match":
        void this.load("competition");
        this.refreshMatch(e.match);
        if (e.groupId && this.groups.has(e.groupId)) void this.load(`group:${e.groupId}`);
        // The group's members hear of its matches too; only the players are called to theirs.
        if (e.status === "ready" && (!e.players || e.players.includes(this.user)) && !location.pathname.startsWith(matchUrl(e.match)))
          toast(e.tournament ? tr("Your match in {0} is ready", { 0: e.tournament }) : tr("Your battle is ready"), {
            id: "community-match-" + e.match,
            icon: icon(Play),
            description: e.tournament ? tr("Round {0}", { 0: e.round }) : e.group ?? undefined,
            duration: 30_000,
            action: { label: tr("Play"), onClick: () => go(matchUrl(e.match)) },
          });
        if (this.tournaments) void this.load("tournaments");
        for (const id of this.details.keys()) void this.load(`tournament:${id}`);
        break;
      case "battle":
        toast(e.open ? tr("{0} opened a battle in {1}", { 0: e.from, 1: e.groupName }) : e.groupName ? tr("{0} challenges you in {1}", { 0: e.from, 1: e.groupName }) : tr("{0} challenges you to a battle", { 0: e.from }), {
          id: "community-battle-" + e.match,
          icon: icon(Swords),
          duration: 30_000,
          action: { label: tr("View"), onClick: () => go(communityUrl("messages/" + e.conversation)) },
        });
        break;
    }
    s.emit();
  }
}

export const community = new Community();

/** What a card says where only words fit: a conversation's last message, a notification. */
export function cardText(m: Pick<Message, "match" | "tournament"> | { card: "match" | "tournament" | null }) {
  const kind = "card" in m ? m.card : m.match ? "match" : m.tournament ? "tournament" : null;
  if ("card" in m) return kind === "match" ? tr("Battle") : tr("Tournament");
  return kind === "match" ? tr("Battle · {0}", { 0: eventName(m.match!.event) }) : tr("Tournament · {0}", { 0: m.tournament!.name });
}
