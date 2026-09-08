import { memo, useEffect, useMemo } from "react";
import { solved } from "../../shared/cube";
import { Cube3D, useAlgPlayer, type Cube3DProps } from "./Cube3D";

/** Keep cube playback frames local instead of rerendering the lists and controls. */
export const SetupCube = memo(function SetupCube({ alg, revision = 0, ...props }: Omit<Cube3DProps, "state" | "animation"> & { alg: string; revision?: number }) {
  const initial = useMemo(() => solved(), []);
  const player = useAlgPlayer(initial, alg, { totalDurationMs: 3000, moveGapMs: 12 });
  useEffect(() => {
    player.reset();
    if (alg) player.play();
  }, [alg, revision, player.reset, player.play]);
  return <Cube3D {...props} state={player.state} animation={player.animation} />;
});
