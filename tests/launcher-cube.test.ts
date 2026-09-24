import { expect, test } from "bun:test";
import { LAUNCHER_CYCLE, LAUNCHER_TIMING, launcherCubeFrame, launcherFinishAt, launcherProgress } from "../src/client/lib/launcherCube";

const { assemble, hold, disassemble } = LAUNCHER_TIMING;

test("one cycle assembles, stands, replays backwards and pauses, then repeats", () => {
  expect(launcherProgress(0)).toBe(0);
  expect(launcherProgress(assemble / 2)).toBeCloseTo(0.5);
  expect(launcherProgress(assemble)).toBe(1);
  expect(launcherProgress(assemble + hold - 1)).toBe(1);
  expect(launcherProgress(assemble + hold + disassemble / 2)).toBeCloseTo(0.5);
  expect(launcherProgress(assemble + hold + disassemble)).toBe(0);
  expect(launcherProgress(LAUNCHER_CYCLE - 1)).toBe(0);
  expect(launcherProgress(LAUNCHER_CYCLE + assemble / 4)).toBeCloseTo(0.25);
});

test("the reverse replay is the exact mirror of the forward one", () => {
  for (const p of [0.1, 0.3, 0.5, 0.75, 0.9]) {
    const forward = launcherCubeFrame(p), backward = launcherCubeFrame(launcherProgress(assemble + hold + disassemble * (1 - p)));
    expect(backward).toEqual(forward);
  }
});

test("loading that finishes mid-flight waits for the model to stand, never cuts a replay", () => {
  // During assembly: the end of that assembly.
  expect(launcherFinishAt(400)).toBe(assemble);
  // While the model stands: right away.
  expect(launcherFinishAt(assemble + 100)).toBe(assemble + 100);
  // While pieces fly apart or during the pause: the end of the next assembly.
  expect(launcherFinishAt(assemble + hold + 10)).toBe(LAUNCHER_CYCLE + assemble);
  expect(launcherFinishAt(LAUNCHER_CYCLE - 5)).toBe(LAUNCHER_CYCLE + assemble);
  expect(launcherFinishAt(LAUNCHER_CYCLE + 5)).toBe(LAUNCHER_CYCLE + assemble);
  // Once finished the model stays assembled whatever the clock says.
  const finish = launcherFinishAt(assemble + hold + 10);
  expect(launcherProgress(finish, finish)).toBe(1);
  expect(launcherProgress(finish + 5 * LAUNCHER_CYCLE + 123, finish)).toBe(1);
});

test("the finished model shows 27 pieces with 27 coloured stickers, painted back to front", () => {
  const frame = launcherCubeFrame(1);
  const cores = frame.filter(p => p.fill === "core"), stickers = frame.filter(p => p.fill !== "core");
  expect(cores).toHaveLength(27);
  expect(stickers).toHaveLength(27);
  expect(stickers.filter(p => p.fill === "U")).toHaveLength(9);
  expect(stickers.filter(p => p.fill === "F")).toHaveLength(9);
  expect(stickers.filter(p => p.fill === "R")).toHaveLength(9);
  expect(frame.every(p => p.opacity === 1)).toBe(true);
  // The nearest piece, the front corner, is painted last so nothing covers it.
  expect(cores.at(-1)!.key).toBe("p26");
  // Every point lies in the 120×120 view box.
  for (const polygon of frame) for (const [x, y] of polygon.points.split(" ").map(pair => pair.split(",").map(Number))) {
    expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(120);
    expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(120);
  }
});

test("pieces fade in as they fly and nothing is drawn before the first one starts", () => {
  expect(launcherCubeFrame(0)).toHaveLength(0);
  const early = launcherCubeFrame(0.08);
  expect(early.length).toBeGreaterThan(0);
  expect(early.length).toBeLessThan(54);
  expect(early.some(p => p.opacity < 1)).toBe(true);
  expect(launcherCubeFrame(0.5).length).toBeGreaterThan(early.length);
});

test("the standing model sways slowly with time but never while assembling", () => {
  expect(launcherCubeFrame(1, 0)).not.toEqual(launcherCubeFrame(1, 700));
  expect(launcherCubeFrame(0.5, 0)).toEqual(launcherCubeFrame(0.5, 700));
});
