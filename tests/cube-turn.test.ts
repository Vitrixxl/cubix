import { describe, expect, test } from "bun:test";
import { CUBE_PITCH, cubeOrientation, turnCube } from "../src/shared/cubeScene";

const close = (a: readonly (readonly number[])[], b: readonly (readonly number[])[]) =>
  a.forEach((v, i) => v.forEach((c, j) => expect(c).toBeCloseTo(b[i]![j]!, 9)));

describe("dragging a 3D cube", () => {
  test("spins it about its own vertical axis only: the up axis and the tilt never move", () => {
    const home = cubeOrientation();
    let m = home;
    for (let i = 0; i < 37; i++) m = turnCube(m, 0.31);
    close([m[1]!], [home[1]!]);
    for (const view of [home, cubeOrientation(1.1, 0.3)]) close([turnCube(view, 2.4, view === home ? CUBE_PITCH : 0.3)[1]!], [view[1]!]);
  });
  test("a whole turn brings it back, and it turns the way the pointer goes", () => {
    const home = cubeOrientation();
    close(turnCube(home, 2 * Math.PI), home);
    close(turnCube(turnCube(home, 0.7), -0.7), home);
    // Dragging right brings the cube's right face (x axis) toward the viewer: its screen x shrinks.
    expect(turnCube(home, 0.2)[0]![0]!).not.toBeCloseTo(home[0]![0]!, 3);
  });
});
