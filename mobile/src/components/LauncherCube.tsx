import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";
import Svg, { Polygon } from "react-native-svg";
import { LAUNCHER_PALETTE, LAUNCHER_SETTLE, LAUNCHER_VIEWBOX, launcherCubeFrame, launcherFinishAt, launcherProgress, type LauncherPolygon } from "../../../src/client/lib/launcherCube";

/**
 * The startup cube, drawn from the same frames as the desktop launcher window. Pieces assemble, the
 * model stands, then the replay runs backwards and forwards again while loading continues. Once
 * `finish` is set the current pass completes, the model stands for a moment and `onSettled` fires.
 */
export function LauncherCube({ size, finish, onSettled }: { size: number; finish: boolean; onSettled?: () => void }) {
  const [polygons, setPolygons] = useState<LauncherPolygon[]>([]);
  const start = useRef(Date.now());
  const finishAt = useRef(Infinity);
  const settled = useRef(false);
  const reduced = useRef(false);
  const callback = useRef(onSettled);
  callback.current = onSettled;
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(value => { reduced.current = value; }, () => {});
  }, []);
  useEffect(() => {
    if (finish && finishAt.current === Infinity) finishAt.current = reduced.current ? 0 : launcherFinishAt(Date.now() - start.current);
  }, [finish]);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const elapsed = Date.now() - start.current;
      setPolygons(launcherCubeFrame(reduced.current ? 1 : launcherProgress(elapsed, finishAt.current), elapsed));
      if (!settled.current && elapsed >= finishAt.current + LAUNCHER_SETTLE) {
        settled.current = true;
        callback.current?.();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return <Svg width={size} height={size} viewBox={LAUNCHER_VIEWBOX}>
    {polygons.map(p => <Polygon key={p.key} points={p.points} fill={LAUNCHER_PALETTE[p.fill]} stroke={LAUNCHER_PALETTE[p.fill]} strokeWidth={0.9} strokeLinejoin="round" opacity={p.opacity} />)}
  </Svg>;
}
