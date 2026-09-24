import { expect, test } from "bun:test";
import { LAUNCHER_CYCLE, LAUNCHER_SCRAMBLE, LAUNCHER_TIMING, launcherCubeFrame, launcherFinishAt, launcherProgress, type LauncherPolygon } from "../src/client/lib/launcherCube";

const { assemble, hold, disassemble } = LAUNCHER_TIMING;
const count = (frame: LauncherPolygon[], fill: LauncherPolygon["fill"]) => frame.filter(p => p.fill === fill).length;

test("one cycle solves, stands, scrambles back and pauses, then repeats", () => {
  expect(launcherProgress(0)).toBe(0);
  expect(launcherProgress(assemble / 2)).toBeCloseTo(0.5);
  expect(launcherProgress(assemble)).toBe(1);
  expect(launcherProgress(assemble + hold - 1)).toBe(1);
  expect(launcherProgress(assemble + hold + disassemble / 2)).toBeCloseTo(0.5);
  expect(launcherProgress(assemble + hold + disassemble)).toBe(0);
  expect(launcherProgress(LAUNCHER_CYCLE - 1)).toBe(0);
  expect(launcherProgress(LAUNCHER_CYCLE + assemble / 4)).toBeCloseTo(0.25);
});

test("scrambling back is the exact mirror of solving", () => {
  for (const p of [0.1, 0.3, 0.5, 0.75, 0.9]) {
    const forward = launcherCubeFrame(p), backward = launcherCubeFrame(launcherProgress(assemble + hold + disassemble * (1 - p)));
    expect(backward).toEqual(forward);
  }
});

test("loading that finishes mid-solve waits for the solved cube, never cuts a replay", () => {
  expect(launcherFinishAt(400)).toBe(assemble);
  expect(launcherFinishAt(assemble + 100)).toBe(assemble + 100);
  expect(launcherFinishAt(assemble + hold + 10)).toBe(LAUNCHER_CYCLE + assemble);
  expect(launcherFinishAt(LAUNCHER_CYCLE - 5)).toBe(LAUNCHER_CYCLE + assemble);
  expect(launcherFinishAt(LAUNCHER_CYCLE + 5)).toBe(LAUNCHER_CYCLE + assemble);
  const finish = launcherFinishAt(assemble + hold + 10);
  expect(launcherProgress(finish, finish)).toBe(1);
  expect(launcherProgress(finish + 5 * LAUNCHER_CYCLE + 123, finish)).toBe(1);
});

test("the scramble really is undone: the final frame is the solved cube seen like the icon", () => {
  expect(LAUNCHER_SCRAMBLE.length).toBeGreaterThanOrEqual(5);
  const frame = launcherCubeFrame(1);
  expect(count(frame, "core")).toBe(27);
  expect(count(frame, "U")).toBe(9);
  expect(count(frame, "F")).toBe(9);
  expect(count(frame, "R")).toBe(9);
  expect(frame).toHaveLength(54);
  expect(frame.every(p => p.opacity === 1)).toBe(true);
  // The nearest piece, the front corner, is painted last so nothing covers it.
  expect(frame.filter(p => p.fill === "core").at(-1)!.key).toBe("p26");
  for (const polygon of frame) for (const [x, y] of polygon.points.split(" ").map(pair => pair.split(",").map(Number))) {
    expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(120);
    expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(120);
  }
});

test("the cube starts scrambled, showing colours from the hidden faces, and fades in", () => {
  const start = launcherCubeFrame(0.001);
  expect(count(start, "core")).toBe(27);
  const fills = new Set(start.filter(p => p.fill !== "core").map(p => p.fill));
  expect(fills.size).toBeGreaterThanOrEqual(5);
  expect(start.every(p => p.opacity < 0.1)).toBe(true);
  expect(launcherCubeFrame(0.2).every(p => p.opacity === 1)).toBe(true);
  // Mid-move, a turning layer shows more than three faces of some pieces.
  expect(new Set(launcherCubeFrame(0.5).map(p => p.fill)).size).toBeGreaterThan(4);
});

test("the solved cube sways slowly with time but never while solving", () => {
  expect(launcherCubeFrame(1, 0)).not.toEqual(launcherCubeFrame(1, 700));
  expect(launcherCubeFrame(0.5, 0)).toEqual(launcherCubeFrame(0.5, 700));
});
