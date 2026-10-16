import { msg } from "../i18n/msg";
import type { Penalty } from "../../shared/types";
export type TimerPhase = "idle" | "inspecting" | "holding" | "ready" | "running" | "stopped";
export const HOLD_DELAY_MS = 300;
/** WCA inspection: 15 seconds, then a +2 until 17, a DNF after (regulations A3a1, A3d1). */
export const INSPECTION_MS = 15_000, INSPECTION_DNF_MS = 17_000;
export const inspectionPenalty = (ms: number): Penalty => (ms <= INSPECTION_MS ? "none" : ms <= INSPECTION_DNF_MS ? "+2" : "dnf");
/** The worse of two penalties: a DNF over a +2 over none. */
export const worsePenalty = (a: Penalty = "none", b: Penalty = "none"): Penalty => (a === "dnf" || b === "dnf" ? "dnf" : a === "+2" || b === "+2" ? "+2" : "none");
export interface TimerSnapshot {
  phase: TimerPhase; elapsed: number; startedAt: number;
  /** When the inspection began, if one runs; kept while the player holds, for the penalty of the start. */
  inspectedAt?: number;
  /** The inspection's penalty, given at the start of the solve. */
  penalty?: Penalty;
  /** Blindfolded: when the memorisation ended, in milliseconds from the start. */
  memo?: number;
  /** Timed in phases (lib/phases): when each phase ended, in milliseconds from the start. */
  splits?: number[];
}

/** Whether the timer rests on an attempt whose inspection ran past 17 seconds: a DNF, never started. */
export const inspectionExpired = (s: Pick<TimerSnapshot, "phase" | "penalty" | "elapsed">) => s.phase === "stopped" && s.penalty === "dnf" && !s.elapsed;

/** Input-independent timer. Touch, keyboard and live readouts belong to adapters. */
export class PracticeTimer {
  snapshot: TimerSnapshot = { phase: "idle", elapsed: 0, startedAt: 0 };
  private hold: ReturnType<typeof setTimeout> | undefined;
  /** The end of the inspection's 17 seconds, when the attempt becomes a DNF. */
  private expiry: ReturnType<typeof setTimeout> | undefined;
  constructor(private readonly options: {
    canStart: () => boolean;
    onChange: (snapshot: TimerSnapshot) => void;
    onStop: (ms: number, penalty: Penalty, memo?: number, splits?: number[]) => void;
    now?: () => number;
    /** Whether a solve starts with a WCA inspection: the first press begins it, the next one holds. */
    inspection?: () => boolean;
    /** Whether the first press of a running solve marks the end of the memorisation (blindfolded) rather than stops it. */
    memo?: () => boolean;
    /** How many phases a solve is timed in: each press of a running solve but the last ends one (lib/phases). */
    phases?: () => number;
  }) {}
  private now = () => this.options.now?.() ?? performance.now();
  /**
   * When an input happened: the event's own time (`Event.timeStamp`, the clock of `performance.now`) when given, so a
   * busy page cannot delay the start or the stop of a solve; now otherwise, or if it is not a time of this clock.
   */
  private at = (timeStamp?: unknown) => {
    const now = this.now();
    return typeof timeStamp === "number" && timeStamp > 0 && timeStamp <= now ? timeStamp : now;
  };
  private update(patch: Partial<TimerSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.options.onChange(this.snapshot);
  }
  private lastPress = -1;
  /** Where a solve not started rests: in its inspection if one runs, idle otherwise. */
  private rest = (): Partial<TimerSnapshot> => (this.snapshot.inspectedAt !== undefined ? { phase: "inspecting" } : { phase: "idle" });
  /**
   * Starts the solve at `at`, with the penalty of its inspection; past 17 seconds of it, the attempt is a DNF and
   * never starts.
   */
  private start(at: number) {
    const { inspectedAt } = this.snapshot, penalty = inspectedAt !== undefined ? inspectionPenalty(at - inspectedAt) : "none";
    if (penalty === "dnf") return this.expire();
    clearTimeout(this.expiry);
    this.update({ phase: "running", startedAt: at, elapsed: 0, inspectedAt: undefined, memo: undefined, splits: undefined, penalty });
  }
  private stop(elapsed: number) {
    this.update({ phase: "stopped", elapsed });
    this.options.onStop(elapsed, this.snapshot.penalty ?? "none", this.snapshot.memo, this.snapshot.splits);
  }
  /** The inspection ran past 17 seconds: the attempt is recorded as a DNF, with no time. */
  private expire() {
    this.dispose();
    this.update({ phase: "stopped", elapsed: 0, inspectedAt: undefined, memo: undefined, splits: undefined, penalty: "dnf" });
    this.options.onStop(0, "dnf");
  }
  private letGo = () => { clearTimeout(this.hold); this.hold = undefined; };
  dispose = () => { this.letGo(); clearTimeout(this.expiry); };
  press = (timeStamp?: number) => {
    // One input seen twice (the stage and the window both hear a touch) acts once.
    if (timeStamp !== undefined && timeStamp === this.lastPress) return;
    if (timeStamp !== undefined) this.lastPress = timeStamp;
    const { phase, startedAt, memo, splits = [] } = this.snapshot;
    if (phase === "running") {
      const elapsed = this.at(timeStamp) - startedAt;
      if (memo === undefined && this.options.memo?.()) this.update({ memo: elapsed });
      else if (splits.length < (this.options.phases?.() ?? 1) - 1) this.update({ splits: [...splits, elapsed] });
      else this.stop(elapsed);
    } else if ((phase === "idle" || phase === "stopped") && this.options.inspection?.() && this.options.canStart()) {
      this.dispose();
      const inspectedAt = this.at(timeStamp);
      this.update({ phase: "inspecting", elapsed: 0, inspectedAt, penalty: undefined, memo: undefined, splits: undefined });
      this.expiry = setTimeout(() => this.expire(), Math.max(0, inspectedAt + INSPECTION_DNF_MS - this.now()));
    } else this.arm();
  };
  /** Holds, as a key held down does (a Stackmat's hands on its pads): ready after `HOLD_DELAY_MS`. */
  arm = () => {
    const { phase } = this.snapshot;
    if (!["idle", "stopped", "inspecting"].includes(phase) || !this.options.canStart()) return;
    this.update({ phase: "holding", elapsed: 0 });
    this.letGo();
    this.hold = setTimeout(() => {
      this.hold = undefined;
      if (this.snapshot.phase === "holding") this.update({ phase: "ready" });
    }, HOLD_DELAY_MS);
  };
  release = (timeStamp?: number) => {
    this.letGo();
    if (this.snapshot.phase === "holding") this.update(this.rest());
    else if (this.snapshot.phase === "ready") this.start(this.at(timeStamp));
  };
  reset = () => { this.dispose(); this.update({ phase: "idle", elapsed: 0, inspectedAt: undefined, penalty: undefined, memo: undefined, splits: undefined }); };
  /** A solve started by something else than a key, such as a smart cube's first turn or a Stackmat. */
  begin = () => {
    if (this.snapshot.phase === "running" || !this.options.canStart()) return false;
    this.letGo();
    this.start(this.now());
    // An inspection past 17 seconds ends the attempt rather than starting it.
    return !inspectionExpired(this.snapshot);
  };
  /** Ends a running solve with the time measured elsewhere (the cube's own clock, a Stackmat). */
  finish = (ms: number) => {
    if (this.snapshot.phase === "running") this.stop(ms);
  };
  /** Lets go of a hold without starting: back to the inspection if one runs. */
  cancelArming = () => {
    if (this.snapshot.phase === "holding" || this.snapshot.phase === "ready") {
      this.letGo();
      this.update(this.rest());
    }
  };
}

/** What a timer device tells: a Stackmat on the audio input, or a smart timer told as one (bluetooth/timers.ts). */
interface TimerDevice {
  subscribe(listener: () => void): () => void;
  snapshot: { packet?: { status: string; ms: number } };
}

/**
 * Lets a timer device drive the timer while `active()`: both hands on its pads hold, lifted they start, its stop
 * stops with its own time; resetting it during a solve cancels the solve. Returns the unsubscription.
 */
export function followTimerDevice(timer: PracticeTimer, device: TimerDevice, active: () => boolean) {
  let last: string | undefined;
  return device.subscribe(() => {
    const packet = device.snapshot.packet,
      before = last;
    last = packet?.status;
    if (!packet || packet.status === before || !active()) return;
    const phase = timer.snapshot.phase;
    if (packet.status === " ") {
      if (phase === "ready") timer.release();
      else if (phase !== "running") timer.begin();
    } else if (phase === "running") {
      if (packet.status === "S") timer.finish(packet.ms);
      else if (packet.status === "I") timer.reset();
    } else if (packet.status === "C" || packet.status === "A") timer.arm();
    else timer.cancelArming();
  });
}

/**
 * The line under the digits for a timer phase. `disabled` replaces it while the timer cannot start; `keyboard` speaks
 * of Space and any key (the desktop) rather than of touches; `unsaved` warns that the timer records nothing.
 */
export function timerHint(phase: TimerPhase, { disabled, unsaved = false, keyboard = false }: { disabled?: string | false; unsaved?: boolean; keyboard?: boolean } = {}) {
  if (disabled) return disabled;
  switch (phase) {
    case "inspecting": return keyboard ? msg("Inspection · hold Space to start") : msg("Inspection · hold to start");
    case "holding": return msg("Keep holding…");
    case "ready": return msg("Release to start");
    case "running": return keyboard ? msg("Any key to stop") : msg("Tap to stop");
    default: {
      const idle = keyboard ? msg("Hold Space, release to start") : msg("Hold, then release to start");
      return unsaved ? msg("Not saved · {0}", { 0: idle }) : idle;
    }
  }
}
