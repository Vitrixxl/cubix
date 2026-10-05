import { describe, expect, test } from "bun:test";
import { solved } from "../src/shared/cube";
import { SmartCube } from "../src/client/lib/smartCube";
import { ScrambleTracker, trackable } from "../src/client/lib/scrambleTracker";

/** A cube and a tracker of `scramble` on it, and a way to turn it. */
function scrambling(scramble: string) {
  const cube = new SmartCube(),
    tracker = new ScrambleTracker(scramble, cube.snapshot.state);
  const turn = (...moves: string[]) => {
    for (const move of moves) {
      cube.receive({ type: "move", move, at: 0 });
      tracker.turn(move, cube.snapshot.state);
    }
    return tracker.progress;
  };
  return { cube, tracker, turn };
}

describe("following a scramble on a smart cube", () => {
  test("turn by turn, to the end", () => {
    const { tracker, turn } = scrambling("R U2 F'");
    expect(tracker.progress).toEqual({ turns: ["next", "todo", "todo"], undo: [], scrambled: false, lost: false });
    expect(turn("R").turns).toEqual(["done", "next", "todo"]);
    // Half of U2, either way.
    expect(turn("U'").turns).toEqual(["done", "partial", "todo"]);
    expect(turn("U'").turns).toEqual(["done", "done", "next"]);
    expect(turn("F'")).toEqual({ turns: ["done", "done", "done"], undo: [], scrambled: true, lost: false });
  });

  test("opposite faces in either order", () => {
    const { turn } = scrambling("R L2 U");
    expect(turn("L").turns).toEqual(["todo", "partial", "todo"]);
    expect(turn("L").turns).toEqual(["next", "done", "todo"]);
    expect(turn("R").turns).toEqual(["done", "done", "next"]);
  });

  test("a wrong turn asks to undo it, simplified, and the scramble goes on once undone", () => {
    const { turn } = scrambling("R U F");
    turn("R");
    expect(turn("F")).toMatchObject({ turns: ["done", "next", "todo"], undo: ["F'"] });
    // R U' instead of R U, then on: undo in reverse order.
    expect(turn("D2").undo).toEqual(["D2", "F'"]);
    expect(turn("D2").undo).toEqual(["F'"]);
    // The wrong way round on a quarter turn is a mistake, not half of it.
    expect(turn("F'").turns).toEqual(["done", "next", "todo"]);
    expect(turn("U'").undo).toEqual(["U"]);
    expect(turn("U2")).toMatchObject({ turns: ["done", "done", "next"], undo: [] });
  });

  test("once scrambled, the next turns start the solve", () => {
    const { tracker, turn } = scrambling("R");
    turn("R");
    expect(turn("U", "F")).toEqual({ turns: ["done"], undo: [], scrambled: true, lost: false });
    tracker.sync(solved(3));
    expect(tracker.progress.scrambled).toBe(true);
  });

  test("a cube not solved at the start is lost until solved", () => {
    const { cube, turn } = scrambling("R U");
    cube.receive({ type: "move", move: "F", at: 0 });
    const tracker = new ScrambleTracker("R U", cube.snapshot.state);
    expect(tracker.progress.lost).toBe(true);
    cube.receive({ type: "move", move: "F'", at: 0 });
    tracker.turn("F'", cube.snapshot.state);
    expect(tracker.progress).toMatchObject({ lost: false, turns: ["next", "todo"] });
    expect(turn().lost).toBe(false);
  });

  test("a state sent whole is placed on the scramble", () => {
    const { cube, tracker } = scrambling("R U F");
    cube.receive({ type: "move", move: "R", at: 0 });
    cube.receive({ type: "move", move: "U", at: 0 });
    tracker.sync(cube.snapshot.state);
    expect(tracker.progress.turns).toEqual(["done", "done", "next"]);
    tracker.sync(solved(3));
    expect(tracker.progress.turns).toEqual(["next", "todo", "todo"]);
  });

  test("only outer face turns can be followed", () => {
    expect(trackable("R U2 F' D L2 B")).toBe(true);
    expect(trackable("Rw U")).toBe(false);
    expect(trackable("")).toBe(false);
  });
});
