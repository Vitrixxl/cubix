import { useEffect, useRef, useState } from "react";
import { call } from "./bridge";
import {
  CUBE_PITCH,
  CUBE_YAW,
  cubeSceneDuration,
  cubeShapes,
  cubeViewRadius,
  type CubeScene as Scene,
} from "../../src/shared/cubeScene";
export function paintCube(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  seconds: number,
  size: number,
  yaw = CUBE_YAW,
  pitch = CUBE_PITCH,
) {
  ctx.clearRect(0, 0, size, size);
  const unit = size / 2 / cubeViewRadius(scene);
  for (const { points, color, line } of cubeShapes(scene, seconds, yaw, pitch)) {
    ctx.beginPath();
    points.forEach((v, i) => {
      const x = size / 2 + v[0] * unit,
        y = size / 2 - v[1] * unit;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    const hex = "#" + color.toString(16).padStart(6, "0");
    if (line) {
      ctx.strokeStyle = hex;
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      ctx.closePath();
      ctx.fillStyle = hex;
      ctx.fill();
    }
  }
}
export function Cube({
  scene,
  setup = "",
  cubeSize = 3,
  mask = "full",
  size = 156,
  replay = 0,
  animated = true,
}: {
  scene?: Scene;
  setup?: string;
  cubeSize?: number;
  mask?: string;
  size?: number;
  replay?: number;
  animated?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [loaded, setLoaded] = useState<Scene | undefined>(scene),
    rotation = useRef([CUBE_YAW, CUBE_PITCH]),
    drag = useRef<number[] | null>(null),
    start = useRef(0),
    redraw = useRef<() => void>(() => {});
  useEffect(() => {
    let cancelled = false;
    if (scene) setLoaded(scene);
    else
      call("cubePreview", setup, cubeSize, mask)
        .then((v) => {
          if (!cancelled) setLoaded(v);
        })
        .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [scene, setup, cubeSize, mask]);
  useEffect(() => {
    start.current = performance.now();
    rotation.current = [CUBE_YAW, CUBE_PITCH];
    let frame = 0;
    const draw = () => {
      if (!canvas.current || !loaded) return;
      const ratio = devicePixelRatio;
      canvas.current.width = Math.round(size * ratio);
      canvas.current.height = Math.round(size * ratio);
      const ctx = canvas.current.getContext("2d")!;
      ctx.scale(ratio, ratio);
      paintCube(
        ctx,
        loaded,
        animated ? (performance.now() - start.current) / 1000 : 99,
        size,
        ...(rotation.current as [number, number]),
      );
      if (
        animated &&
        (performance.now() - start.current) / 1000 < cubeSceneDuration(loaded)
      )
        frame = requestAnimationFrame(draw);
    };
    redraw.current = () => {
      cancelAnimationFrame(frame);
      draw();
    };
    draw();
    return () => {
      cancelAnimationFrame(frame);
      redraw.current = () => {};
    };
  }, [loaded, size, replay, animated]);
  return (
    <canvas
      ref={canvas}
      aria-label="Cube preview"
      style={{ width: size, height: size, flexShrink: 0, touchAction: "none" }}
      onPointerDown={(e) => {
        if (!animated) return;
        drag.current = [e.clientX, e.clientY];
        e.currentTarget.setPointerCapture(e.pointerId);
        e.stopPropagation();
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        rotation.current = [
          rotation.current[0] - (e.clientX - drag.current[0]) * 0.012,
          Math.max(
            -1.4,
            Math.min(
              1.4,
              rotation.current[1] + (e.clientY - drag.current[1]) * 0.012,
            ),
          ),
        ];
        drag.current = [e.clientX, e.clientY];
        redraw.current();
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
    />
  );
}
