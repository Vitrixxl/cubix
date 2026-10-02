/**
 * One-on-one races against another player on the same five scrambles, an Ao5 each, through the API's duel socket
 * (rust-api/src/duel.rs). The server pairs players of similar levels and keeps the score; this client mirrors its
 * state for a page. The web app and the Android app each give it their own host: scrambles, level, token and storage.
 */
import { averageOf, effective, fmtSolve, fmtTime } from "./format";
import { eventInfo, type PracticeContext, type ScrambleType } from "../../shared/puzzles";
import type { Penalty } from "../../shared/types";

export const ROUNDS = 5;
export type DuelSolve = { ms: number; penalty: Penalty } | null;
export type DuelPhase = "idle" | "holding" | "ready" | "running";
export type DuelPlayer = { name: string; level: number | null };
/** A finished race, kept on the device for the profile. */
export type DuelRecord = {
  id: string;
  at: string;
  event: string;
  opponent: string;
  mine: DuelSolve[];
  theirs: DuelSolve[];
  /** Ao5 of each side, null for a DNF average. */
  ao5: [number | null, number | null];
  result: "win" | "loss" | "draw";
};
/** Where the battles are kept, in the web engine's storage and in the app's. */
export const DUELS_KEY = "cubix.duels";
const KEPT = 200;

export const solveTime = (v: DuelSolve) => (v ? effective(v.ms, v.penalty) : null);
/** The Ao5 of a side once its five solves are in; null for a DNF average. */
export const ao5 = (solves: DuelSolve[]) => (solves.filter(Boolean).length < ROUNDS ? undefined : averageOf(solves.map(solveTime)));
/** Lower wins, a DNF loses to any time, two DNFs draw. */
export function compare(a: number | null | undefined, b: number | null | undefined): "win" | "loss" | "draw" {
  if (a === b || (a == null && b == null)) return "draw";
  if (a == null) return "loss";
  if (b == null) return "win";
  return a < b ? "win" : "loss";
}
/** The level of a player: the mean of their last twelve timer solves without the best and the worst, once five of
 * them count; null before. */
export function levelOf(solves: readonly { time_ms: number; penalty: Penalty }[]): number | null {
  const times = solves.slice(0, 12).map((v) => effective(v.time_ms, v.penalty)).filter((t): t is number => t !== null).sort((a, b) => a - b);
  return times.length < 5 ? null : times.slice(1, -1).reduce((a, b) => a + b, 0) / (times.length - 2);
}
/** A battle list with `record` kept once, newest first; the first time it was kept stays its date. */
export function keepRecord(list: DuelRecord[], record: DuelRecord): DuelRecord[] {
  const existing = list.find((v) => v.id === record.id);
  return [{ ...record, at: existing?.at ?? record.at }, ...list.filter((v) => v.id !== record.id)].slice(0, KEPT);
}
/** "3 won · 2 lost", with the draws when there are some. */
export function battleRecord(list: DuelRecord[]) {
  const count = (r: DuelRecord["result"]) => list.filter((b) => b.result === r).length;
  return `${count("win")} won · ${count("loss")} lost` + (count("draw") ? ` · ${count("draw")} drawn` : "");
}

/** A battle's result as its letter. */
export const RESULT_MARK = { win: "W", loss: "L", draw: "D" } as const;
/** A battle's average: DNF when it is one. */
export const ao5Text = (v: number | null) => fmtTime(v, { blank: "DNF" });
/** An Ao5 of the race: nothing until the five solves are in, DNF when it is one. */
export const raceAverage = (v: number | null | undefined) => (v === undefined ? "" : ao5Text(v));
/** The time of a side at rest: its latest solve, or zero before its first. */
export const shownSolve = (v: DuelSolve | undefined) => (v ? fmtSolve(v.ms, v.penalty) : "0.000");
/** Minutes and seconds, for how long a search has been running. */
export function clock(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
/** What the opponent is doing, in a word or two. */
export function opponentStatus(d: Pick<DuelClient, "opponentHere" | "over" | "opponentPhase" | "them" | "round" | "scrambles">) {
  if (!d.opponentHere) return "Left";
  if (d.over) return "Finished";
  if (d.opponentPhase === "running") return "Solving";
  if (d.opponentPhase !== "idle") return "Ready";
  if (d.them[d.round]) return "Done";
  return d.scrambles.length ? `Round ${d.round + 1}` : "Waiting";
}

/** What a platform gives the duel: its API, scrambles, the player's level and token, and where battles go. */
export interface DuelHost {
  /** The API's origin, http(s). */
  origin: string;
  /** The state changed: draw it again. */
  changed(): void;
  /** A new race or game: the player's timer starts over. */
  reset(): void;
  scramble(context: PracticeContext): Promise<string>;
  /** The player's level on an event (see the duel guide), null without enough solves. */
  level(event: string): Promise<number | null>;
  /** The account's token, so the player races under their username; null for a guest. */
  token(): Promise<string | null>;
  /** Keeps a finished race, again whenever a penalty changes it. */
  record(record: DuelRecord): void;
  fail(error: unknown): void;
}

export class DuelClient {
  /** Off, looking for an opponent, or racing one. */
  status: "off" | "searching" | "racing" = "off";
  socket: WebSocket | null = null;
  /** Other players searching the same event. */
  searching = 0;
  searchSince = 0;
  /** Undefined while it is being worked out. */
  level: number | null | undefined = undefined;
  levelEvent = "";
  race = "";
  seat = 0;
  host = false;
  event = "";
  players: DuelPlayer[] = [];
  game = 0;
  scrambles: string[] = [];
  results: DuelSolve[][] = [[], []];
  rematch = [false, false];
  present = [true, true];
  opponentPhase: DuelPhase = "idle";
  /** When the opponent's running time started, on this device's `performance.now()` clock. */
  opponentStart = 0;
  chat: { seat: number; text: string }[] = [];
  unread = 0;
  chatOpen = false;
  /** Game whose scrambles this client (the host) already generated. */
  generated = 0;
  /** Game whose result dialog was closed. */
  dismissed = 0;
  notice = "";
  private searchEvent = "";
  private ping: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly platform: DuelHost) {}

  get me() {
    return this.results[this.seat] ?? [];
  }
  get them() {
    return this.results[1 - this.seat] ?? [];
  }
  get opponent(): DuelPlayer {
    return this.players[1 - this.seat] ?? { name: "", level: null };
  }
  /** The round being raced: the first one someone has not finished, ROUNDS once the race is over. */
  get round() {
    for (let r = 0; r < ROUNDS; r++) if (!this.me[r] || !this.them[r]) return r;
    return ROUNDS;
  }
  get over() {
    return this.status === "racing" && this.scrambles.length === ROUNDS && this.round === ROUNDS;
  }
  get opponentHere() {
    return this.present[1 - this.seat] ?? false;
  }
  /** Whether the timer may start: the scrambles are in, this round is still to solve and the opponent is here. */
  get canSolve() {
    return this.status === "racing" && this.scrambles.length === ROUNDS && !this.over && !this.me[this.round] && this.opponentHere;
  }
  /** Takes the latest solve back to redo it on the same scramble, while the opponent is still on that round. */
  get canCancel() {
    const round = this.latest(this.me);
    return round >= 0 && !this.them[round];
  }
  /** Index of the last solve of a side, -1 before its first. */
  latest(solves: DuelSolve[]) {
    return solves.findLastIndex(Boolean);
  }

  private changed() {
    this.platform.changed();
  }
  private send(message: object) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  /** The player's level on an event: what the matchmaking compares. */
  async loadLevel(event: string) {
    if (this.levelEvent === event && this.level !== undefined) return;
    this.levelEvent = event;
    this.level = undefined;
    this.changed();
    const level = await this.platform.level(event).catch(() => null);
    if (this.levelEvent !== event) return;
    this.level = level;
    this.changed();
  }

  private connect() {
    return new Promise<WebSocket>((resolve, reject) => {
      const unreachable = () => reject(Error("The duel server cannot be reached."));
      if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
        if (this.socket.readyState === WebSocket.OPEN) return resolve(this.socket);
        this.socket.addEventListener("open", () => resolve(this.socket!), { once: true });
        this.socket.addEventListener("error", unreachable, { once: true });
        return;
      }
      const socket = new WebSocket(this.platform.origin.replace(/\/$/, "").replace(/^http/, "ws") + "/api/duel");
      this.socket = socket;
      socket.onopen = () => resolve(socket);
      socket.onerror = unreachable;
      socket.onmessage = ({ data }) => {
        if (this.socket !== socket) return;
        try {
          this.receive(JSON.parse(String(data)));
        } catch {}
      };
      socket.onclose = () => {
        if (this.socket !== socket) return;
        this.socket = null;
        clearInterval(this.ping);
        if (this.status !== "off") {
          this.status = "off";
          this.notice = "Connection lost.";
          this.changed();
        }
      };
      clearInterval(this.ping);
      this.ping = setInterval(() => this.send({ type: "ping" }), 20000);
    });
  }

  private receive(m: any) {
    switch (m.type) {
      case "queued":
        this.status = "searching";
        break;
      case "queue":
        this.searching = m.searching;
        break;
      case "match":
        this.status = "racing";
        this.race = m.race;
        this.seat = m.seat;
        this.host = m.host;
        this.event = m.event;
        this.players = m.players;
        this.game = 0;
        this.generated = 0;
        this.dismissed = 0;
        this.scrambles = [];
        this.results = [[], []];
        this.chat = [];
        this.unread = 0;
        this.opponentPhase = "idle";
        this.platform.reset();
        break;
      case "state": {
        const newGame = m.game !== this.game,
          before = this.them.filter(Boolean).length;
        this.game = m.game;
        this.scrambles = m.scrambles;
        this.results = m.results;
        this.rematch = m.rematch;
        this.present = m.present;
        if (newGame) {
          this.opponentPhase = "idle";
          this.platform.reset();
        }
        // The opponent's time stops where the server recorded it, also when their solve closes the round and the
        // race moves on to the next one, still empty on their side.
        if (this.them.filter(Boolean).length > before || this.them[this.round] || this.round === ROUNDS) this.opponentPhase = "idle";
        if (this.host && !this.scrambles.length && this.generated !== this.game) void this.generate(this.game);
        this.record();
        break;
      }
      case "timer":
        this.opponentPhase = m.phase;
        if (m.phase === "running") this.opponentStart = performance.now();
        break;
      case "chat":
        this.chat = [...this.chat, { seat: m.seat, text: m.text }].slice(-200);
        if (m.seat !== this.seat && !this.chatOpen) this.unread++;
        break;
      case "left":
        this.opponentPhase = "idle";
        break;
    }
    this.changed();
  }

  /** The first player draws the five scrambles of each race, for both. */
  private async generate(game: number) {
    this.generated = game;
    const event = eventInfo(this.event);
    if (!event) return;
    const context = { puzzle: event.puzzle, solveMode: event.solveMode, scrambleType: "normal" as ScrambleType };
    try {
      const list: string[] = [];
      for (let i = 0; i < ROUNDS; i++) list.push(await this.platform.scramble(context));
      if (this.game === game && this.status === "racing") this.send({ type: "scrambles", list });
    } catch (e) {
      this.platform.fail(e);
    }
  }

  /** Hands the finished race to the platform, each side of it under its own id. */
  private record() {
    if (!this.over) return;
    const mine = this.me.slice(0, ROUNDS),
      theirs = this.them.slice(0, ROUNDS),
      averages: [number | null, number | null] = [ao5(mine) ?? null, ao5(theirs) ?? null];
    this.platform.record({
      id: `${this.race}:${this.game}:${this.seat}`,
      at: new Date().toISOString(),
      event: this.event,
      opponent: this.opponent.name,
      mine,
      theirs,
      ao5: averages,
      result: compare(averages[0], averages[1]),
    });
  }

  async search(event: string) {
    this.notice = "";
    this.searchEvent = event;
    this.searchSince = Date.now();
    this.searching = 0;
    this.status = "searching";
    this.changed();
    try {
      await this.loadLevel(event);
      const socket = await this.connect(),
        token = await this.platform.token().catch(() => null);
      if (this.status !== "searching" || this.socket !== socket || this.searchEvent !== event) return;
      this.send({ type: "queue", event, level: this.level ?? null, ...(token ? { token } : {}) });
    } catch (e: any) {
      this.status = "off";
      this.notice = e?.message ?? String(e);
      this.changed();
    }
  }
  /** Stops searching, or leaves the race; the socket stays open for the next search. */
  leave() {
    this.send({ type: "leave" });
    this.status = "off";
    this.chatOpen = false;
    this.changed();
  }
  /** Relays a phase of the player's timer; a stop reaches the opponent as the solve itself. */
  timer(phase: DuelPhase) {
    this.send({ type: "timer", phase });
  }
  solve(ms: number) {
    if (!this.canSolve) return;
    const round = this.round;
    // Shown at once; the server's state confirms it.
    this.results[this.seat] = Object.assign([...this.me], { [round]: { ms: Math.round(ms), penalty: "none" } });
    this.send({ type: "solve", round, ms, penalty: "none" });
    this.changed();
  }
  /** +2 or DNF on the latest solve, or back to none when it already has it. */
  penalty(penalty: Penalty) {
    const round = this.latest(this.me),
      solve = this.me[round];
    if (!solve) return;
    this.send({ type: "penalty", round, penalty: solve.penalty === penalty ? "none" : penalty });
  }
  cancel() {
    if (this.canCancel) this.send({ type: "cancel", round: this.latest(this.me) });
  }
  say(text: string) {
    const value = text.trim().slice(0, 300);
    if (value) this.send({ type: "chat", text: value });
  }
  askRematch() {
    this.send({ type: "rematch" });
  }
  /** Leaves this opponent and looks for another on the same event at once. */
  async next() {
    const event = this.event || this.searchEvent;
    this.leave();
    await this.search(event);
  }
  toggleChat() {
    this.chatOpen = !this.chatOpen;
    if (this.chatOpen) this.unread = 0;
    this.changed();
  }
  /** Closes the result dialog, or brings it back. */
  showResult(shown: boolean) {
    this.dismissed = shown ? 0 : this.game;
    this.changed();
  }
}
