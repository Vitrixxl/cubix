import { describe, expect, test } from "bun:test";
import { CUBE_PITCH, CUBE_TILT, cubeOrientation, cubePitch, turnCube } from "../src/shared/cubeScene";

const close = (a: readonly (readonly number[])[], b: readonly (readonly number[])[]) =>
  a.forEach((v, i) => v.forEach((c, j) => expect(c).toBeCloseTo(b[i]![j]!, 9)));

describe("dragging a 3D cube", () => {
  test("across spins it about its own vertical axis, endlessly, without changing its tilt", () => {
    const home = cubeOrientation();
    let m = home;
    for (let i = 0; i < 37; i++) m = turnCube(m, 0.31);
    close([m[1]!], [home[1]!]);
    close(turnCube(home, 2 * Math.PI), home);
    close(turnCube(turnCube(home, 0.7), -0.7), home);
    expect(cubePitch(home)).toBeCloseTo(CUBE_PITCH, 9);
  });
  test("down tilts it, but never past the bound: it can't be turned over", () => {
    const home = cubeOrientation();
    expect(cubePitch(turnCube(home, 0, 0.3))).toBeCloseTo(CUBE_PITCH + 0.3, 9);
    let m = home;
    for (let i = 0; i < 100; i++) m = turnCube(m, 0.05, 0.2);
    expect(cubePitch(m)).toBeCloseTo(CUBE_TILT, 9);
    for (let i = 0; i < 100; i++) m = turnCube(m, -0.05, -0.2);
    expect(cubePitch(m)).toBeCloseTo(-CUBE_TILT, 9);
    // The up axis still points up on screen: the cube is tilted, never upside down.
    expect(m[1]![1]!).toBeGreaterThan(0);
    // Each axis stays a unit vector, the three at right angles.
    const dot = (a: readonly number[], b: readonly number[]) => a.reduce((s, v, i) => s + v * b[i]!, 0);
    for (const v of m) expect(dot(v, v)).toBeCloseTo(1, 9);
    expect(dot(m[0]!, m[1]!)).toBeCloseTo(0, 9);
    expect(dot(m[1]!, m[2]!)).toBeCloseTo(0, 9);
  });
});
