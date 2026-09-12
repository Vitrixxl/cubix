import { useSetAtom } from "jotai";
import { timerRunningAtom } from "../state";
import { useTimerTouchArea } from "../hooks/useTimerTouchArea";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TimerApi } from "../hooks/useTimer";
import { fmtTime } from "../lib/format";

/** Only this text node rerenders on animation frames, never the practice page. */
function LiveTime({ startedAt }: { startedAt: number }) {
  const [text, setText] = useState(() => fmtTime(performance.now() - startedAt));
  useEffect(() => {
    let frame: number;
    const tick = () => {
      setText(fmtTime(performance.now() - startedAt));
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [startedAt]);
  return text;
}

export function TimerSurface({ timer, disabled = false }: { timer: TimerApi; disabled?: boolean }) {
  const { phase, elapsed } = timer;
  const setRunning = useSetAtom(timerRunningAtom);
  useLayoutEffect(() => { setRunning(phase === "running"); }, [phase, setRunning]);
  useLayoutEffect(() => () => { setRunning(false); }, [setRunning]);
  const [mobile, setMobile] = useState(() => matchMedia("(max-width: 700px), (pointer: coarse)").matches);
  useTimerTouchArea(timer, mobile && !disabled);
  const [stopping, setStopping] = useState(false);
  const livePhase = useRef(phase);
  livePhase.current = phase;
  useEffect(() => {
    const query = matchMedia("(max-width: 700px), (pointer: coarse)");
    const update = () => setMobile(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const armed = phase === "ready" || phase === "holding";
  const text = armed ? "0.00" : fmtTime(elapsed, { blank: "0.00" });
  const hint = disabled ? "Select cases to begin"
    : phase === "running" ? (mobile ? "Tap to stop" : "Any key to stop")
    : phase === "ready" ? "Release to start"
    : phase === "holding" ? "Keep holding…"
    : mobile ? "Hold, then release to start" : "Hold Space, release to start";

  return (
    <><div
      className={`timer-surface ${phase}`}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={disabled ? "Select cases to enable the timer" : "Timer: hold Space or touch to prepare, release to start, any key to stop"}
      aria-disabled={disabled}
      onPointerDown={(e) => {
        if (disabled) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        if (e.pointerType !== "mouse" || phase === "running") timer.press();
      }}
      onPointerUp={() => { if (!disabled) timer.release(); }}
      onPointerCancel={() => { if (timer.phase === "ready" || timer.phase === "holding") timer.reset(); }}
    >
      <div className={`timer-value ${phase === "ready" ? "ready" : phase === "holding" ? "holding" : ""}`}>
        {phase === "running" ? <LiveTime startedAt={timer.startedAt} /> : text}
      </div>
      <div className="timer-hint">{hint}</div>
    </div>
    {timer.saveError && <div className="timer-save-error" role="alert"><p>{timer.saveError}</p><button className="btn" onClick={timer.retrySave}>Retry</button></div>}
    {mobile && (phase === "running" || stopping) && createPortal(
      <div className="timer-stop-surface" role="button" tabIndex={-1} aria-label="Stop timer"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          if (livePhase.current === "running") { setStopping(true); timer.press(); }
        }}
        onPointerUp={() => setStopping(false)}
        onPointerCancel={() => setStopping(false)}
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
      />, document.body
    )}</>
  );
}
