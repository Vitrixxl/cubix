/**
 * Coaching on the web app: the /api/coaching routes called with the account's token, and the coaching socket that
 * brings chat messages, booking changes and the signalling of calls. Everything lives here; pages read it and the
 * store's `emit` redraws them.
 */
import { toast } from "sonner";
import { store as s } from "../store";
import { call } from "../bridge";
import { go } from "../navigation";

export interface Coach {
  id: string;
  username: string;
  headline: string;
  bio: string;
  events: string[];
  languages: string[];
  priceCents: number;
  sessionMinutes: number;
  timezone: string;
  accepting: boolean;
  active: boolean;
  rating: number | null;
  reviews: number;
  sessions: number;
  students: number;
  since: number;
  nextSlot?: number | null;
  openSlots?: number;
  windows?: Opening[];
  daysOff?: string[];
  reviewList?: { rating: number; comment: string; at: number; username: string }[];
  ratingCounts?: number[];
}
/** A weekly opening: 0 = Monday, minutes of the day on the coach's clock. */
export interface Opening {
  weekday: number;
  start: number;
  end: number;
}
export interface Person {
  id: string;
  username: string;
}
export interface Booking {
  id: string;
  role: "coach" | "student";
  coachId: string;
  coachName: string;
  studentId: string;
  studentName: string;
  with: Person;
  startsAt: number;
  endsAt: number;
  status: "booked" | "cancelled";
  note: string;
  priceCents: number;
  createdAt: number;
  cancelledAt: number | null;
  cancelledByMe: boolean;
  review: { rating: number; comment: string } | null;
  conversationId: number | null;
}
export interface Conversation {
  id: number;
  role: "coach" | "student";
  coachId: string;
  studentId: string;
  with: Person;
  lastMessage: { body: string; at: number; mine: boolean } | null;
  unread: number;
  updatedAt: number;
  note: string | null;
}
export interface Message {
  id: number;
  senderId: string;
  body: string;
  createdAt: number;
  readAt: number | null;
}
export interface Application {
  id: number;
  email: string;
  events: string[];
  experience: string;
  message: string;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
  decidedAt: number | null;
}
export interface Me {
  coach: Coach | null;
  application: Application | null;
  unread: number;
  iceServers: RTCIceServer[];
  lengths: number[];
}
export interface Week {
  from: number;
  to: number;
  sessions: number;
  minutes: number;
  incomeCents: number;
  openSlots: number;
}
export interface Student {
  id: string;
  username: string;
  conversationId: number;
  note: string;
  done: number;
  upcoming: number;
  nextAt: number | null;
  lastAt: number | null;
  rating: number | null;
  unread: number;
}
export interface Dashboard {
  coach: Coach;
  weeks: Week[];
  openSlots: number;
  upcoming: Booking[];
  students: Student[];
}
export interface Slots {
  timezone: string;
  sessionMinutes: number;
  priceCents: number;
  accepting: boolean;
  slots: { start: number; end: number }[];
}
/** What a call hears on the socket. */
export type CallEvent =
  | { type: "joined"; booking: string; peer: boolean }
  | { type: "peer"; booking: string; present: boolean }
  | { type: "signal"; booking: string; data: any }
  | { type: "ended"; booking: string; reason: string }
  /** The socket closed, or came back. */
  | { type: "lost" }
  | { type: "ready" };

export class CoachingError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** The call opens a quarter of an hour before the session and stays open half an hour after it. */
export const callOpen = (b: Booking, now = Date.now()) => b.status === "booked" && now >= b.startsAt - 15 * 60_000 && now <= b.endsAt + 30 * 60_000;
/** An amount in euros: "€25", "€12.50". */
export const euros = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "EUR", minimumFractionDigits: cents % 100 ? 2 : 0 });
/** The price of a session, "Free" when there is none. */
export const price = (cents: number) => (cents ? euros(cents) : "Free");

class Coaching {
  /** The account this state belongs to; null while signed out. */
  user: string | null = null;
  me?: Me;
  coaches?: Coach[];
  profiles = new Map<string, Coach>();
  slots = new Map<string, Slots>();
  bookings?: Booking[];
  conversations?: Conversation[];
  messages = new Map<number, Message[]>();
  dashboard?: Dashboard;
  /** Sessions whose call the other party is waiting in. */
  waiting = new Set<string>();
  /** The conversation on screen: its messages are read as they arrive. */
  open: number | null = null;
  connected = false;
  failure = "";
  private socket?: WebSocket;
  private retry = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private ping?: ReturnType<typeof setInterval>;
  private loading = new Map<string, Promise<unknown>>();
  private callListener?: (event: CallEvent) => void;

  /** Follows the signed-in account: a new one starts afresh and opens its socket. */
  attach(user: string | null) {
    if (user === this.user) return;
    this.detach();
    this.user = user;
    if (user) {
      this.connect();
      void this.load("me");
    }
  }
  private detach() {
    clearTimeout(this.timer);
    clearInterval(this.ping);
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
    }
    this.socket = undefined;
    this.connected = false;
    this.me = this.coaches = this.bookings = this.conversations = this.dashboard = undefined;
    this.profiles.clear();
    this.slots.clear();
    this.messages.clear();
    this.waiting.clear();
    this.loading.clear();
  }
  get isCoach() {
    return !!this.me?.coach?.active;
  }

  async api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await call("apiToken");
    let response: Response;
    try {
      response = await fetch(location.origin + "/api/coaching/" + path, {
        method,
        headers: { authorization: "Bearer " + token, ...(body === undefined ? {} : { "content-type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new CoachingError(0, "The server cannot be reached.");
    }
    const value = await response.json().catch(() => null);
    if (!response.ok) throw new CoachingError(response.status, typeof value?.error === "string" ? value.error : `The server answered ${response.status}.`);
    return value as T;
  }

  /** Fetches one piece of state (at most once at a time) and redraws. */
  load(what: "me" | "coaches" | "bookings" | "conversations" | "dashboard" | `coach:${string}` | `slots:${string}` | `messages:${number}`) {
    const pending = this.loading.get(what);
    if (pending) return pending;
    const owner = this.user;
    const [kind, arg] = what.includes(":") ? [what.slice(0, what.indexOf(":")), what.slice(what.indexOf(":") + 1)] : [what, ""];
    const path = kind === "coach" ? "coaches/" + encodeURIComponent(arg) : kind === "slots" ? `coaches/${encodeURIComponent(arg)}/slots` : kind === "messages" ? `conversations/${arg}/messages` : kind;
    const request = this.api("GET", path)
      .then((value) => {
        if (owner !== this.user) return;
        if (kind === "me") this.me = value;
        else if (kind === "coaches") this.coaches = value;
        else if (kind === "bookings") this.bookings = value;
        else if (kind === "conversations") this.conversations = value;
        else if (kind === "dashboard") this.dashboard = value;
        else if (kind === "coach") this.profiles.set(arg, value);
        else if (kind === "slots") this.slots.set(arg, value);
        else if (kind === "messages") this.messages.set(Number(arg), value);
        this.failure = "";
        s.emit();
      })
      .catch((e: Error) => {
        if (owner !== this.user) return;
        this.failure = e.message;
        s.emit();
      })
      .finally(() => this.loading.delete(what));
    this.loading.set(what, request);
    return request;
  }

  // Actions: each throws the server's message for the page to show.
  async apply(form: { email: string; events: string[]; experience: string; message: string }) {
    const application = await this.api<Application>("POST", "application", form);
    if (this.me) this.me = { ...this.me, application };
    s.emit();
  }
  async saveProfile(profile: Partial<Coach>) {
    const coach = await this.api<Coach>("PUT", "profile", profile);
    if (this.me) this.me = { ...this.me, coach };
    this.profiles.delete(coach.id);
    s.emit();
  }
  async saveAvailability(availability: { timezone: string; sessionMinutes: number; windows: Opening[]; daysOff: string[] }) {
    const coach = await this.api<Coach>("PUT", "availability", availability);
    if (this.me) this.me = { ...this.me, coach };
    void this.load("dashboard");
    s.emit();
  }
  async book(coachId: string, start: number, note: string) {
    const booking = await this.api<Booking>("POST", "bookings", { coachId, start, note });
    this.bookings = [booking, ...(this.bookings ?? [])];
    void this.load(`slots:${coachId}`);
    void this.load("conversations");
    void this.load("coaches");
    s.emit();
    return booking;
  }
  async cancel(id: string) {
    const booking = await this.api<Booking>("POST", `bookings/${id}/cancel`);
    this.replace(booking);
  }
  async review(id: string, rating: number, comment: string) {
    const booking = await this.api<Booking>("POST", `bookings/${id}/review`, { rating, comment });
    this.replace(booking);
    this.profiles.delete(booking.coachId);
  }
  private replace(booking: Booking) {
    this.bookings = this.bookings?.map((b) => (b.id === booking.id ? booking : b));
    if (this.isCoach) void this.load("dashboard");
    s.emit();
  }
  /** The conversation with a coach, opened if needed. */
  async talkTo(coachId: string) {
    const conversation = await this.api<Conversation>("POST", "conversations", { coachId });
    if (!this.conversations?.some((c) => c.id === conversation.id)) this.conversations = [conversation, ...(this.conversations ?? [])];
    s.emit();
    return conversation;
  }
  async send(conversation: number, body: string) {
    const message = await this.api<Message>("POST", `conversations/${conversation}/messages`, { body });
    this.received(conversation, message);
  }
  async saveNote(conversation: number, note: string) {
    const saved = await this.api<Conversation>("PUT", `conversations/${conversation}/note`, { note });
    this.conversations = this.conversations?.map((c) => (c.id === saved.id ? saved : c));
    if (this.dashboard) this.dashboard = { ...this.dashboard, students: this.dashboard.students.map((st) => (st.conversationId === conversation ? { ...st, note: saved.note ?? "" } : st)) };
    s.emit();
  }
  /** Marks the conversation read, here and on the server. */
  read(conversation: number) {
    const c = this.conversations?.find((c) => c.id === conversation);
    if (!c?.unread && !this.dashboard?.students.some((st) => st.conversationId === conversation && st.unread)) return;
    const was = c?.unread ?? 0;
    this.conversations = this.conversations?.map((c) => (c.id === conversation ? { ...c, unread: 0 } : c));
    if (this.dashboard) this.dashboard = { ...this.dashboard, students: this.dashboard.students.map((st) => (st.conversationId === conversation ? { ...st, unread: 0 } : st)) };
    if (this.me) this.me = { ...this.me, unread: Math.max(0, this.me.unread - was) };
    s.emit();
    void this.api<{ unread: number }>("POST", `conversations/${conversation}/read`).then((r) => {
      if (this.me) this.me = { ...this.me, unread: r.unread };
      s.emit();
    }, () => {});
  }
  /** A message of the conversation, sent from here or arriving on the socket (each once). */
  private received(conversation: number, message: Message, from?: string) {
    const list = this.messages.get(conversation);
    if (list?.some((m) => m.id === message.id)) return;
    if (list) this.messages.set(conversation, [...list, message]);
    const mine = message.senderId === s.user.id;
    const shown = this.open === conversation && document.visibilityState === "visible";
    let known = false;
    this.conversations = this.conversations?.map((c) => {
      if (c.id !== conversation) return c;
      known = true;
      return { ...c, lastMessage: { body: message.body, at: message.createdAt, mine }, updatedAt: message.createdAt, unread: c.unread + (mine || shown ? 0 : 1) };
    });
    this.conversations?.sort((a, b) => b.updatedAt - a.updatedAt);
    if (this.conversations && !known) void this.load("conversations");
    if (!mine && !shown) {
      if (this.me) this.me = { ...this.me, unread: this.me.unread + 1 };
      if (this.dashboard) this.dashboard = { ...this.dashboard, students: this.dashboard.students.map((st) => (st.conversationId === conversation ? { ...st, unread: st.unread + 1 } : st)) };
      toast(from ?? "New message", {
        id: "coaching-message-" + conversation,
        description: message.body.length > 120 ? message.body.slice(0, 120) + "…" : message.body,
        action: { label: "Open", onClick: () => go("/coaching/messages/" + conversation) },
      });
    }
    if (!mine && shown) this.read(conversation);
    s.emit();
  }

  /** The page of a call takes the call events while it is open. */
  onCall(listener?: (event: CallEvent) => void) {
    this.callListener = listener;
  }
  signal(value: object) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(value));
  }
  private connect() {
    const owner = this.user;
    const ws = new WebSocket(location.origin.replace(/^http/, "ws") + "/api/coaching/live");
    this.socket = ws;
    ws.onopen = async () => {
      const token = await call("apiToken").catch(() => null);
      if (!token || owner !== this.user) return ws.close();
      ws.send(JSON.stringify({ type: "auth", token }));
    };
    ws.onmessage = (e) => {
      let event: any;
      try {
        event = JSON.parse(String(e.data));
      } catch {
        return;
      }
      this.event(event);
    };
    ws.onclose = () => {
      clearInterval(this.ping);
      if (this.socket !== ws) return;
      this.connected = false;
      this.callListener?.({ type: "lost" });
      s.emit();
      // Back off up to half a minute; a signed-out app stays closed.
      this.timer = setTimeout(() => owner === this.user && this.connect(), Math.min(30_000, 1000 * 2 ** this.retry++));
    };
  }
  private event(event: any) {
    switch (event.type) {
      case "ready":
        this.connected = true;
        this.retry = 0;
        clearInterval(this.ping);
        this.ping = setInterval(() => this.signal({ type: "ping" }), 25_000);
        // Whatever changed while the socket was down.
        void this.load("me");
        if (this.bookings) void this.load("bookings");
        if (this.conversations) void this.load("conversations");
        if (this.dashboard) void this.load("dashboard");
        this.callListener?.({ type: "ready" });
        s.emit();
        break;
      case "message":
        this.received(event.conversation, event.message, event.from);
        break;
      case "read":
        void this.load("me");
        if (this.conversations) void this.load("conversations");
        break;
      case "bookings":
        void this.load("bookings");
        if (this.isCoach) void this.load("dashboard");
        this.slots.clear();
        break;
      case "presence":
        if (event.inCall) {
          this.waiting.add(event.booking);
          if (!location.pathname.startsWith("/coaching/call/"))
            toast(`${event.user} is waiting in your session`, {
              id: "coaching-call-" + event.booking,
              duration: 30_000,
              action: { label: "Join", onClick: () => go("/coaching/call/" + event.booking) },
            });
        } else this.waiting.delete(event.booking);
        s.emit();
        break;
      case "joined":
      case "peer":
      case "signal":
      case "ended":
        this.callListener?.(event);
        break;
    }
  }
}

export const coaching = new Coaching();
