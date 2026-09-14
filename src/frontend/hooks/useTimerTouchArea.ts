import { useEffect, useRef } from "react";
import type { TimerApi } from "./useTimer";

// Include custom controls and their children, even when a control is disabled.
const CONTROLS = 'button, a, input, textarea, select, label, summary, [tabindex], [contenteditable], [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="slider"], [role="combobox"], [aria-haspopup], [data-practice-control], [data-timer-ignore], [data-solve-id], video, audio, iframe';
const OPEN_OVERLAYS = 'dialog[open], [aria-modal="true"], [role="menu"], [role="listbox"], [data-puzzle-popover]';

/** Extend touch arming to the page background while keeping controls and scrolling usable. */
export function useTimerTouchArea(timer: TimerApi, enabled: boolean) {
  const latest = useRef(timer);
  latest.current = timer;

  useEffect(() => {
    if (!enabled) return;
    let active: { id: number; target: Element } | null = null;

    const clearPointer = () => {
      const pointer = active;
      active = null;
      if (pointer?.target.hasPointerCapture(pointer.id)) pointer.target.releasePointerCapture(pointer.id);
    };
    const cancel = () => {
      if (!active) return;
      clearPointer();
      if (latest.current.phase === "holding" || latest.current.phase === "ready") latest.current.reset();
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType === "mouse") return;
      if (active) { cancel(); return; }
      if (!event.isPrimary || event.defaultPrevented || latest.current.phase === "running") return;
      const target = event.target;
      if (!(target instanceof Element) || target.closest(CONTROLS) || document.querySelector(OPEN_OVERLAYS)) return;
      event.preventDefault();
      active = { id: event.pointerId, target };
      target.setPointerCapture(event.pointerId);
      latest.current.press();
    };
    const move = (event: TouchEvent) => {
      // Keep an accepted hold active while the finger moves. Prevent native panning
      // from cancelling the pointer; gestures begun on controls still scroll normally.
      if (active && event.cancelable) event.preventDefault();
    };
    const up = (event: PointerEvent) => {
      if (!active || event.pointerId !== active.id) return;
      if (document.querySelector(OPEN_OVERLAYS)) { cancel(); return; }
      clearPointer();
      latest.current.release();
    };
    const pointerCancel = (event: PointerEvent) => {
      if (event.pointerId === active?.id) cancel();
    };
    const contextMenu = (event: MouseEvent) => {
      if (active) event.preventDefault();
    };

    document.addEventListener("pointerdown", down);
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", pointerCancel);
    document.addEventListener("lostpointercapture", pointerCancel);
    document.addEventListener("contextmenu", contextMenu);
    document.addEventListener("visibilitychange", cancel);
    window.addEventListener("blur", cancel);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", pointerCancel);
      document.removeEventListener("lostpointercapture", pointerCancel);
      document.removeEventListener("contextmenu", contextMenu);
      document.removeEventListener("visibilitychange", cancel);
      window.removeEventListener("blur", cancel);
      cancel();
    };
  }, [enabled]);
}
