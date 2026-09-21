export type TimerPhase = "idle" | "holding" | "ready" | "running" | "stopped";
export const HOLD_DELAY_MS = 300;
export interface TimerSnapshot { phase: TimerPhase; elapsed: number; startedAt: number }

/** Input-independent timer. Touch, keyboard and live readouts belong to adapters. */
export class PracticeTimer {
  snapshot: TimerSnapshot = { phase: "idle", elapsed: 0, startedAt: 0 };
  private hold: ReturnType<typeof setTimeout> | undefined;
  constructor(private readonly options: {
    canStart: () => boolean;
    onChange: (snapshot: TimerSnapshot) => void;
    onStop: (ms: number) => void;
    now?: () => number;
  }) {}
  private now = () => this.options.now?.() ?? performance.now();
  private update(patch: Partial<TimerSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.options.onChange(this.snapshot);
  }
  dispose = () => { clearTimeout(this.hold); this.hold = undefined; };
  press = () => {
    const { phase, startedAt } = this.snapshot;
    if (phase === "running") {
      const elapsed = this.now() - startedAt;
      this.update({ phase: "stopped", elapsed });
      this.options.onStop(elapsed);
    } else if ((phase === "idle" || phase === "stopped") && this.options.canStart()) {
      this.update({ phase: "holding", elapsed: 0 });
      this.dispose();
      this.hold = setTimeout(() => {
        this.hold = undefined;
        if (this.snapshot.phase === "holding") this.update({ phase: "ready" });
      }, HOLD_DELAY_MS);
    }
  };
  release = () => {
    this.dispose();
    if (this.snapshot.phase === "holding") this.update({ phase: "idle" });
    else if (this.snapshot.phase === "ready") this.update({ phase: "running", startedAt: this.now() });
  };
  reset = () => { this.dispose(); this.update({ phase: "idle", elapsed: 0 }); };
  cancelArming = () => {
    if (this.snapshot.phase === "holding" || this.snapshot.phase === "ready") this.reset();
  };
}
