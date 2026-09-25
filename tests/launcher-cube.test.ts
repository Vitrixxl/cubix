import { expect, test } from "bun:test";
import { LAUNCHER_CYCLE, LAUNCHER_SCRAMBLE, LAUNCHER_TIMING, launcherCubeFrame, launcherFinishAt, launcherProgress, type LauncherPolygon } from "../src/client/lib/launcherCube";
import { CUBE_BODY, cubeScene, cubeShapes } from "../src/shared/cubeScene";
import { FACE_COLORS } from "../src/shared/cubeAppearance";

const { assemble, hold, disassemble } = LAUNCHER_TIMING;
const count = (frame: LauncherPolygon[], color: string) => frame.filter(p => !p.line && p.color === color).length;

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

test("the scramble really is undone: the final frame is the solved timer cube", () => {
  expect(LAUNCHER_SCRAMBLE.length).toBeGreaterThanOrEqual(5);
  const frame = launcherCubeFrame(1);
  const expected = cubeShapes(cubeScene("", 3, "full"), 0);
  expect(frame).toHaveLength(expected.length);
  expect(frame.map(p => [p.color, p.line])).toEqual(expected.map(s => ["#" + s.color.toString(16).padStart(6, "0"), s.line]));
  // Top, front and right faces in the timer's colours, over the timer's dark body.
  for (const face of ["U", "F", "R"] as const) expect(count(frame, FACE_COLORS[face])).toBe(9);
  expect(frame[0].color).toBe("#" + CUBE_BODY.toString(16).padStart(6, "0"));
  expect(frame.every(p => p.opacity === 1)).toBe(true);
  for (const polygon of frame) for (const [x, y] of polygon.points.split(" ").map(pair => pair.split(",").map(Number))) {
    expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(120);
    expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(120);
  }
});

test("the cube starts scrambled, showing colours from the hidden faces, fully drawn from the first frame", () => {
  const start = launcherCubeFrame(0.001);
  const colors = new Set(start.filter(p => !p.line).map(p => p.color));
  expect(colors.size).toBeGreaterThanOrEqual(6);
  for (const frame of [launcherCubeFrame(0), start, launcherCubeFrame(0.2)]) expect(frame.every(p => p.opacity === 1)).toBe(true);
  // Mid-move, the turning layer is drawn as its own block.
  expect(launcherCubeFrame(0.5 + 0.5 / LAUNCHER_SCRAMBLE.length).filter(p => p.color === "#121216" && !p.line).length).toBe(2);
});

test("the solved cube sways slowly with time but never while solving", () => {
  expect(launcherCubeFrame(1, 0)).not.toEqual(launcherCubeFrame(1, 700));
  expect(launcherCubeFrame(0.5, 0)).toEqual(launcherCubeFrame(0.5, 700));
});
