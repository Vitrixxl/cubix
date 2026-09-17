import { memo, useEffect, useState } from "react";
import Svg, { Path } from "react-native-svg";
import { applyMove, moveAngleDeg, solved, type CubeState } from "../../../src/shared/cube";
import { easeInOut, frame, plan, VIEWBOX, type Layer, type Step } from "../lib/solvingCube";
import { useTheme } from "../theme";

/** A stickerless cube that scrambles and solves itself in a loop, shown while data loads. */
export const SolvingCube = memo(function SolvingCube({ size = 120 }: { size?: number }) {
  const t = useTheme();
  const core = t.mode === "dark" ? "#2b2b32" : "#18181c";
  const [layers, setLayers] = useState<Layer[]>(() => frame(solved(), null, 0, core));
  useEffect(() => {
    const cube: { state: CubeState; steps: Step[]; index: number; startedAt: number; resting: boolean } = { state: solved(), steps: plan(), index: 0, startedAt: 0, resting: false };
    let request = requestAnimationFrame(function tick(now) {
      // After a long gap (the app was in the background) resume from the current step instead of catching up.
      if (cube.startedAt === 0 || now - cube.startedAt > 5000) cube.startedAt = now;
      let step = cube.steps[cube.index];
      let progress = (now - cube.startedAt) / step.ms;
      while (progress >= 1) {
        if (step.move) cube.state = applyMove(cube.state, step.move);
        cube.startedAt += step.ms;
        if (++cube.index >= cube.steps.length) { cube.steps = plan(); cube.index = 0; }
        step = cube.steps[cube.index];
        progress = (now - cube.startedAt) / step.ms;
      }
      if (step.move) {
        cube.resting = false;
        setLayers(frame(cube.state, step.move, easeInOut(progress) * moveAngleDeg(step.move), core));
      } else if (!cube.resting) {
        cube.resting = true;
        setLayers(frame(cube.state, null, 0, core));
      }
      request = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(request);
  }, [core]);
  return <Svg width={size} height={size} viewBox={VIEWBOX} accessibilityLabel="Loading">
    {layers.map((layer, i) => <Path key={i} d={layer.d} fill={layer.fill} />)}
  </Svg>;
});
