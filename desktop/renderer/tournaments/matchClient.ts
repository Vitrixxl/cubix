/**
 * A match of a tournament or a battle, on the socket /api/matches/live (rust-api/src/tournament.rs): the server keeps
 * the solves and the score; this client mirrors them for the match page, sends the player's times and their timer's
 * phases, and draws the scramble of each solve when it is this app's turn (the first player's, or the second's while
 * the first is away). Whoever is not a player of the match watches it.
 */
import { store as s } from "../store";
import { call } from "../bridge";
import { eventInfo, type ScrambleType } from "../../../src/shared/puzzles";
import { solveTime, type DuelPhase } from "../../../src/client/lib/duel";
import { seatIn, type Match, type Result } from "../community/client";

/** A timer phase and a solve's time, as in duels. */
export type Phase = DuelPhase;
export const resultTime = (r: Result | null | undefined) => solveTime(r ?? null);

export class MatchClient {
  id = 0;
  match: Match | null = null;
  error = "";
  connected = false;
  /** The other player's timer, and when it started on this device's clock. */
  phases: [Phase, Phase] = ["idle", "idle"];
  started: [number, number] = [0, 0];
  private socket?: WebSocket;
  private ping?: ReturnType<typeof setInterval>;
  private retry?: ReturnType<typeof setTimeout>;
  /** The solve whose scramble this app already drew. */
  private drawn = 0;

  get seat() {
    return this.match ? seatIn(this.match, s.user.id) : null;
  }
  get solves() {
    return this.match?.solves ?? [];
  }
  /** The solve being raced: the last one, while someone still has to solve it. */
  get current() {
    const last = this.solves.at(-1);
    return last && last.results.some((r) => !r) ? last : null;
  }
  get over() {
    return this.match?.status === "done" || this.match?.status === "cancelled";
  }
  get opponentHere() {
    const seat = this.seat;
    return seat === null || !!this.match?.present?.[1 - seat];
  }
  /** Whether the player's timer may start: a solve is on, theirs to do, both players here. */
  get canSolve() {
    const seat = this.seat;
    return seat !== null && !this.over && !!this.current && !this.current.results[seat] && this.opponentHere;
  }
  /** The player's latest time, while the other player has not solved that scramble yet. */
  get canCancel() {
    const seat = this.seat, c = this.current;
    return seat !== null && !this.over && !!c && !!c.results[seat] && !c.results[1 - seat];
  }

  open(id: number) {
    this.close();
    this.id = id;
    this.match = null;
    this.error = "";
    this.drawn = 0;
    this.connect();
  }
  close() {
    clearTimeout(this.retry);
    clearInterval(this.ping);
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
    }
    this.socket = undefined;
    this.connected = false;
    this.id = 0;
  }
  private send(value: object) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(value));
  }
  private connect(attempt = 0) {
    const id = this.id;
    const ws = new WebSocket(location.origin.replace(/^http/, "ws") + "/api/matches/live");
    this.socket = ws;
    ws.onopen = async () => {
      const token = await call("apiToken").catch(() => null);
      if (this.socket !== ws) return;
      ws.send(JSON.stringify({ type: "join", token, match: id }));
      clearInterval(this.ping);
      this.ping = setInterval(() => this.send({ type: "ping" }), 20_000);
    };
    ws.onmessage = (e) => {
      try {
        this.receive(JSON.parse(String(e.data)));
      } catch {}
    };
    ws.onclose = () => {
      if (this.socket !== ws) return;
      this.connected = false;
      clearInterval(this.ping);
      s.emit();
      this.retry = setTimeout(() => this.id === id && this.connect(attempt + 1), Math.min(10_000, 500 * 2 ** attempt));
    };
  }
  private receive(m: any) {
    if (m.type === "state") {
      this.connected = true;
      this.error = "";
      this.match = m.match;
      // A solve recorded stops that player's digits, as does a player gone.
      for (const seat of [0, 1] as const) if (!this.current || this.current.results[seat] || !m.match.present?.[seat]) this.phases[seat] = "idle";
      void this.draw();
    } else if (m.type === "timer") {
      this.phases[m.seat as 0 | 1] = m.phase;
      if (m.phase === "running") this.started[m.seat as 0 | 1] = performance.now();
    } else if (m.type === "error") this.error = m.message;
    s.emit();
  }
  /**
   * The next solve's scramble, drawn by the first player's app, or by the second's while the first is away; only once
   * both are here, so that no one starts alone.
   */
  private async draw() {
    const m = this.match, seat = this.seat;
    if (!m || seat === null || this.over || this.current || !m.present?.every(Boolean)) return;
    if (seat === 1 && m.present[0]) return;
    const number = this.solves.length + 1;
    if (this.drawn >= number) return;
    this.drawn = number;
    const event = eventInfo(m.event);
    if (!event) return;
    try {
      const text = await call("scramble", { puzzle: event.puzzle, solveMode: event.solveMode, scrambleType: "normal" as ScrambleType });
      if (this.match?.id === m.id) this.send({ type: "scramble", number, text });
    } catch (e) {
      this.drawn = 0;
      s.fail(e);
    }
  }
  timer(phase: Phase) {
    const seat = this.seat;
    if (seat === null) return;
    this.phases[seat] = phase;
    if (phase === "running") this.started[seat] = performance.now();
    this.send({ type: "timer", phase });
  }
  solve(ms: number) {
    const c = this.current, seat = this.seat;
    if (!this.canSolve || !c || seat === null) return;
    // Shown at once; the server's state confirms it.
    c.results[seat] = { ms: Math.round(ms), penalty: "none" };
    this.send({ type: "solve", number: c.number, ms });
    s.emit();
  }
  /** +2 or DNF on the player's latest solve, or back to none when it already has it. */
  penalty(penalty: "+2" | "dnf") {
    const seat = this.seat, last = this.solves.at(-1);
    const result = seat === null ? null : last?.results[seat];
    if (!last || !result || this.over) return;
    this.send({ type: "penalty", number: last.number, penalty: result.penalty === penalty ? "none" : penalty });
  }
  cancel() {
    const c = this.current;
    if (this.canCancel && c) this.send({ type: "cancel", number: c.number });
  }
  forfeit() {
    this.send({ type: "forfeit" });
  }
}

export const live = new MatchClient();
