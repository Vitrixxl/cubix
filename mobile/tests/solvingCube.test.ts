import { expect, test } from "bun:test";
import { parseAlg, solved } from "../../src/shared/cube";
import { frame, PIECE_COLORS, plan, play } from "../src/lib/solvingCube";

const CORE = "#000000";
const subpaths = (d: string) => d.split("M").length - 1;

test("the plan scrambles, pauses, solves and rests, and leaves the cube solved", () => {
  const steps = plan();
  expect(steps[7].move).toBeNull();
  expect(steps[steps.length - 1].move).toBeNull();
  expect(steps.filter(step => step.move).length).toBe(14);
  expect(Array.from(play(steps))).toEqual(Array.from(solved()));
});

test("an idle solved cube is one body and three coloured faces of nine pieces each", () => {
  const layers = frame(solved(), null, 0, CORE);
  expect(layers.map(layer => layer.fill === CORE)).toEqual([true, false, false, false]);
  expect(subpaths(layers[0].d)).toBe(27);
  for (const layer of layers.slice(1)) expect(subpaths(layer.d)).toBe(9);
  // White stays brightest: the top face is lit and never darkened below the others.
  const brightest = layers.slice(1).map(layer => parseInt(layer.fill.slice(1, 3), 16)).sort((a, b) => b - a)[0];
  expect(brightest).toBeGreaterThanOrEqual(parseInt(PIECE_COLORS.U.slice(1, 3), 16) - 8);
});

test("mid-turn the turning layer and the rest are painted as separate boxes, far to near", () => {
  const [move] = parseAlg("U");
  const layers = frame(solved(), move, -45, CORE);
  const bodies = layers.filter(layer => layer.fill === CORE);
  expect(bodies.length).toBe(2);
  // The lower two layers sit behind the turning top layer from the camera's viewpoint.
  expect(layers[0].fill).toBe(CORE);
  expect(subpaths(layers[0].d)).toBeGreaterThan(subpaths(bodies[1].d));
  // The mechanism shows: more polygons than the 27 exterior faces of an idle cube.
  expect(bodies.reduce((sum, body) => sum + subpaths(body.d), 0)).toBeGreaterThan(27);
});

test("a middle-slice turn yields three boxes", () => {
  const [move] = parseAlg("M");
  expect(frame(solved(), move, 30, CORE).filter(layer => layer.fill === CORE).length).toBe(3);
});
