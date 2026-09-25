/** Rasterise sample frames of the startup cube (headless): bun scripts/render-launcher-frames.ts → artifacts/launcher/frames.png */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { launcherCubeFrame, LAUNCHER_VIEWBOX } from "../src/client/lib/launcherCube";
mkdirSync("artifacts/launcher", { recursive: true });
const frames = [0.04, 0.25, 0.42, 0.6, 0.75, 0.92, 1];
const files = frames.map((progress, i) => {
  const polys = launcherCubeFrame(progress, 0);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LAUNCHER_VIEWBOX}" width="240" height="240"><rect width="120" height="120" fill="#0b0b0e"/>${polys.map(p => p.line ? `<polyline points="${p.points}" fill="none" stroke="${p.color}" stroke-width="0.5" opacity="${p.opacity}"/>` : `<polygon points="${p.points}" fill="${p.color}" opacity="${p.opacity}"/>`).join("")}</svg>`;
  const path = `artifacts/launcher/frame-${i}.svg`;
  writeFileSync(path, svg);
  spawnSync("rsvg-convert", ["-o", path.replace(".svg", ".png"), path]);
  return path.replace(".svg", ".png");
});
spawnSync("magick", [...files, "+append", "artifacts/launcher/frames.png"]);
console.log("artifacts/launcher/frames.png");
