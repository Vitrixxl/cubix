/** Rasterise sample frames of the startup cube (headless): bun scripts/render-launcher-frames.ts → artifacts/launcher/frames.png */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { launcherCubeFrame, LAUNCHER_PALETTE, LAUNCHER_VIEWBOX } from "../src/client/lib/launcherCube";
mkdirSync("artifacts/launcher", { recursive: true });
const frames = [0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1];
const files = frames.map((progress, i) => {
  const polys = launcherCubeFrame(progress, 0);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LAUNCHER_VIEWBOX}" width="240" height="240"><rect width="120" height="120" fill="#0b0b0e"/>${polys.map(p => `<polygon points="${p.points}" fill="${LAUNCHER_PALETTE[p.fill]}" stroke="${LAUNCHER_PALETTE[p.fill]}" stroke-width="0.9" stroke-linejoin="round" fill-opacity="${p.opacity}" stroke-opacity="${p.opacity}"/>`).join("")}</svg>`;
  const path = `artifacts/launcher/frame-${i}.svg`;
  writeFileSync(path, svg);
  spawnSync("rsvg-convert", ["-o", path.replace(".svg", ".png"), path]);
  return path.replace(".svg", ".png");
});
spawnSync("magick", [...files, "+append", "artifacts/launcher/frames.png"]);
console.log("artifacts/launcher/frames.png");
