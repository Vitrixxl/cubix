import { AnimatePresence, motion } from "motion/react";
import type { TimerApi } from "../hooks/useTimer";
import { fmtTime } from "../lib/format";

export function TimerSurface({ timer, hint, flat }: { timer: TimerApi; hint?: string; /** no background box (floating layout) */ flat?: boolean }) {
  const { phase, elapsed } = timer;
  const text = phase === "ready" ? "0.00" : fmtTime(elapsed, { blank: "0.00" });
  const hintText = phase === "running" ? "Press any key or tap to stop" : phase === "ready" ? "Release to start" : hint ?? "Hold Space or press here, release to start";

  return (
    <div
      className={`timer-surface ${phase} ${flat ? "flat" : ""}`}
      onPointerDown={(e) => {
        e.preventDefault();
        timer.press();
      }}
      onPointerUp={timer.release}
      onPointerCancel={timer.release}
    >
      <div style={{ textAlign: "center" }}>
        <motion.div
          key={phase === "stopped" ? "stopped" : phase === "ready" ? "ready" : "live"}
          className={`timer-value ${phase === "ready" ? "ready" : ""}`}
          initial={phase === "stopped" ? { scale: 1.12, opacity: 0.6 } : phase === "ready" ? { scale: 0.96 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
        >
          {text}
        </motion.div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={hintText} className="timer-hint" style={{ marginTop: 14 }} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
            {hintText}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
