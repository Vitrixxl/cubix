/**
 * A match of a tournament or a battle, on the app's socket (channel "match", go-api/tournament.go): the server keeps
 * the solves and the score; this client mirrors them for the match page, sends the player's times and their timer's
 * phases, and draws the scramble of each solve when it is this app's turn (the first player's, or the second's while
 * the first is away). Whoever is not a player of the match watches it. The web app and the Android app each give it
 * their own host: the API, the account, the scrambler.
 */
import { eventInfo, type PracticeContext, type ScrambleType } from "../../shared/puzzles";
import { solveTime, type DuelPhase } from "./duel";
import { seatIn, type Match, type Result, type SocialHost } from "./community";

/** A timer phase and a solve's time, as in duels. */
export type Phase = DuelPhase;
export const resultTime = (r: Result | null | undefined) => solveTime(r ?? null);

/** What a platform gives a match: the community's host (its socket, account and redraw), a scrambler and errors. */
export interface MatchHost extends Pick<SocialHost, "live" | "account" | "changed"> {
  scramble(context: PracticeContext): Promise<string>;
  fail(error: unknown): void;
}

export class MatchClient {
  constructor(readonly host: MatchHost) {
    host.live.on("match", (m) => (m.type === "state" ? m.match?.id : m.match) === this.id && this.id && this.receive(m));
    host.live.on("live", (m) => {
      if (!this.id) return;
      // Back online, the match is joined again: its state comes with it.
      if (m.type === "ready") this.send({ type: "join" });
      else {
        this.connected = false;
        this.host.changed();
      }
    });
  }
  id = 0;
  match: Match | null = null;
  error = "";
  connected = false;
  /** The other player's timer, and when it started on this device's clock. */
  phases: [Phase, Phase] = ["idle", "idle"];
  started: [number, number] = [0, 0];
  /** The solve whose scramble this app already drew. */
  private drawn = 0;

  get seat() {
    return this.match ? seatIn(this.match, this.host.account().id) : null;
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
    this.send({ type: "join" });
  }
  close() {
    if (this.id) this.send({ type: "leave" });
    this.connected = false;
    this.id = 0;
  }
  private send(value: { type: string; [key: string]: unknown }) {
    this.host.live.send({ channel: "match", match: this.id, ...value });
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
    this.host.changed();
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
      const text = await this.host.scramble({ puzzle: event.puzzle, solveMode: event.solveMode, scrambleType: "normal" as ScrambleType });
      if (this.match?.id === m.id) this.send({ type: "scramble", number, text });
    } catch (e) {
      this.drawn = 0;
      this.host.fail(e);
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
    this.host.changed();
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
