/**
 * One-on-one races against another player on the same five scrambles, an Ao5 each, through the API's duel socket.
 * The server pairs players of similar levels and keeps the score; this client mirrors its state for the page.
 */
import { store as s } from "./store";
import { call } from "./bridge";
import { averageOf, effective } from "../../src/client/lib/format";
import { eventInfo } from "../../src/shared/puzzles";
import type { Penalty } from "../../src/shared/types";

export const ROUNDS = 5;
export type DuelSolve = { ms: number; penalty: Penalty } | null;
export type DuelPhase = "idle" | "holding" | "ready" | "running";
export type DuelPlayer = { name: string; level: number | null };
/** A finished race, kept on this device for the profile. */
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
export const DUELS_KEY = "cubix.duels";

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

class Duel {
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
  opponentStart = 0;
  chat: { seat: number; text: string }[] = [];
  unread = 0;
  chatOpen = false;
  /** Game whose scrambles this client (the host) already generated. */
  generated = 0;
  /** Game whose result dialog was closed. */
  dismissed = 0;
  notice = "";
  private ping: ReturnType<typeof setInterval> | undefined;

  get showCube(): boolean {
    return s.prefs["cubix.duel.showCube"] ?? true;
  }
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
  /** Index of the last solve of a side, -1 before its first. */
  latest(solves: DuelSolve[]) {
    return solves.findLastIndex(Boolean);
  }

  private emit() {
    s.emit();
  }
  private send(message: object) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  /** The player's level on the app's event: what the matchmaking compares. */
  async loadLevel() {
    const event = s.event().id;
    if (this.levelEvent === event && this.level !== undefined) return;
    this.levelEvent = event;
    this.level = undefined;
    this.emit();
    const level = await call("duelLevel", s.puzzle, s.solveMode).catch(() => null);
    if (this.levelEvent !== event) return;
    this.level = level;
    this.emit();
  }

  private connect() {
    return new Promise<WebSocket>((resolve, reject) => {
      if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
        if (this.socket.readyState === WebSocket.OPEN) return resolve(this.socket);
        this.socket.addEventListener("open", () => resolve(this.socket!), { once: true });
        this.socket.addEventListener("error", () => reject(Error("The duel server cannot be reached.")), { once: true });
        return;
      }
      const socket = new WebSocket(location.origin.replace(/^http/, "ws") + "/api/duel");
      this.socket = socket;
      socket.onopen = () => resolve(socket);
      socket.onerror = () => reject(Error("The duel server cannot be reached."));
      socket.onmessage = ({ data }) => {
        if (this.socket !== socket) return;
        try {
          this.receive(JSON.parse(data));
        } catch {}
      };
      socket.onclose = () => {
        if (this.socket !== socket) return;
        this.socket = null;
        clearInterval(this.ping);
        if (this.status !== "off") {
          this.status = "off";
          this.notice = "Connection lost.";
          this.emit();
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
        s.timerEpoch++;
        break;
      case "state": {
        const newGame = m.game !== this.game;
        this.game = m.game;
        this.scrambles = m.scrambles;
        this.results = m.results;
        this.rematch = m.rematch;
        this.present = m.present;
        if (newGame) {
          this.opponentPhase = "idle";
          s.timerEpoch++;
        }
        // The opponent's time stops where the server recorded it.
        if (this.them[this.round] || this.round === ROUNDS) this.opponentPhase = "idle";
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
    this.emit();
  }

  /** The first player draws the five scrambles of each race, for both. */
  private async generate(game: number) {
    this.generated = game;
    const event = eventInfo(this.event);
    if (!event) return;
    const context = { puzzle: event.puzzle, solveMode: event.solveMode, scrambleType: "normal" };
    try {
      const list: string[] = [];
      for (let i = 0; i < ROUNDS; i++) list.push(await call("scramble", context));
      if (this.game === game && this.status === "racing") this.send({ type: "scrambles", list });
    } catch (e) {
      s.fail(e);
    }
  }

  /** Keeps the finished race among this device's battles, updated if a penalty changes afterwards. */
  private record() {
    if (!this.over) return;
    const mine = this.me.slice(0, ROUNDS),
      theirs = this.them.slice(0, ROUNDS),
      averages: [number | null, number | null] = [ao5(mine) ?? null, ao5(theirs) ?? null],
      record: DuelRecord = {
        id: `${this.race}:${this.game}:${this.seat}`,
        at: new Date().toISOString(),
        event: this.event,
        opponent: this.opponent.name,
        mine,
        theirs,
        ao5: averages,
        result: compare(averages[0], averages[1]),
      },
      existing = (s.prefs[DUELS_KEY] ?? []).find((v: DuelRecord) => v.id === record.id);
    if (existing && JSON.stringify({ ...existing, at: record.at }) === JSON.stringify(record)) return;
    void call("duelRecord", record)
      .then((list) => {
        s.prefs[DUELS_KEY] = list;
        this.emit();
      })
      .catch(s.fail);
  }

  async search() {
    this.notice = "";
    this.searchSince = Date.now();
    this.searching = 0;
    this.status = "searching";
    this.emit();
    try {
      await this.loadLevel();
      const socket = await this.connect(),
        token = await call("duelToken").catch(() => null);
      if (this.status !== "searching" || this.socket !== socket) return;
      this.send({ type: "queue", event: s.event().id, level: this.level ?? null, ...(token ? { token } : {}) });
    } catch (e: any) {
      this.status = "off";
      this.notice = e.message ?? String(e);
      this.emit();
    }
  }
  /** Stops searching, or leaves the race; the socket stays open for the next search. */
  leave() {
    this.send({ type: "leave" });
    this.status = "off";
    this.chatOpen = false;
    s.running = false;
    this.emit();
  }
  timer(phase: DuelPhase) {
    this.send({ type: "timer", phase });
  }
  solve(ms: number) {
    if (!this.canSolve) return;
    const round = this.round;
    // Shown at once; the server's state confirms it.
    this.results[this.seat] = Object.assign([...this.me], { [round]: { ms: Math.round(ms), penalty: "none" } });
    this.send({ type: "solve", round, ms, penalty: "none" });
    this.emit();
  }
  /** +2 or DNF on the latest solve, or back to none when it already has it. */
  penalty(penalty: Penalty) {
    const round = this.latest(this.me),
      solve = this.me[round];
    if (!solve) return;
    this.send({ type: "penalty", round, penalty: solve.penalty === penalty ? "none" : penalty });
  }
  /** Takes the latest solve back to redo it on the same scramble, while the opponent is still on that round. */
  get canCancel() {
    const round = this.latest(this.me);
    return round >= 0 && !this.them[round];
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
  /** Leaves this opponent and looks for another at once. */
  async next() {
    this.leave();
    await this.search();
  }

  async action(arg: string) {
    switch (arg) {
      case "search":
        return this.search();
      case "leave":
        return this.leave();
      case "next":
        return this.next();
      case "rematch":
        return this.askRematch();
      case "+2":
      case "dnf":
        return this.penalty(arg);
      case "cancel":
        return this.cancel();
      case "cube":
        s.pref("cubix.duel.showCube", !this.showCube);
        return;
      case "chat":
        this.chatOpen = !this.chatOpen;
        if (this.chatOpen) this.unread = 0;
        return;
      case "dismiss":
        this.dismissed = this.game;
        return;
      case "result":
        this.dismissed = 0;
        return;
    }
  }
}

export const duel = new Duel();
