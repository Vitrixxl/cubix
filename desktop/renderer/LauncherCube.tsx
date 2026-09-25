import React, { useEffect, useMemo, useRef, useState } from "react";
import { LAUNCHER_SETTLE, LAUNCHER_VIEWBOX, launcherCubeFrame, launcherFinishAt, launcherProgress, type LauncherPolygon } from "../../src/client/lib/launcherCube";

/**
 * The startup cube of the desktop launcher window: the timer's cube (the phone draws the same frames with
 * react-native-svg). It solves itself, the model stands, then the replay runs backwards and forwards again while loading
 * continues. Once `finish` is set the current pass completes, the model stands still for a moment and
 * `onSettled` fires.
 */
export function LauncherCube({ size, finish, onSettled }: { size: number; finish: boolean; onSettled?: () => void }) {
  const [polygons, setPolygons] = useState<LauncherPolygon[]>([]);
  const start = useRef(performance.now());
  const finishAt = useRef(Infinity);
  const settled = useRef(false);
  const callback = useRef(onSettled);
  callback.current = onSettled;
  const reduced = useMemo(() => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  useEffect(() => {
    if (finish && finishAt.current === Infinity) finishAt.current = reduced ? 0 : launcherFinishAt(performance.now() - start.current);
  }, [finish, reduced]);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const elapsed = performance.now() - start.current;
      setPolygons(launcherCubeFrame(reduced ? 1 : launcherProgress(elapsed, finishAt.current), elapsed));
      if (!settled.current && elapsed >= finishAt.current + LAUNCHER_SETTLE) {
        settled.current = true;
        callback.current?.();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced]);
  return <svg className="launcher-cube" viewBox={LAUNCHER_VIEWBOX} width={size} height={size} aria-hidden="true">
    {polygons.map(p => p.line
      ? <polyline key={p.key} points={p.points} fill="none" stroke={p.color} strokeWidth={120 / size} opacity={p.opacity} />
      : <polygon key={p.key} points={p.points} fill={p.color} opacity={p.opacity} />)}
  </svg>;
}
