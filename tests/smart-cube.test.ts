import { describe, expect, test } from "bun:test";
import { applyAlg, faceOfSlot, parseMove, parseScramble, solved } from "../src/shared/cube";
import { canonicalTurn, compose, slerp, faceletsToState, heldTurn, isSolved, rotate, rotation, SmartCube, stateToFacelets, type SmartCubeDriver, type SmartCubeEvent } from "../src/client/lib/smartCube";

const SOLVED = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
const colours = (state: ArrayLike<number>) => Array.from(state, (origin) => faceOfSlot(origin));

describe("smart cube state", () => {
  test("Kociemba facelets of the solved cube and of an R turn", () => {
    expect(stateToFacelets(solved(3))).toBe(SOLVED);
    expect(isSolved(faceletsToState(SOLVED))).toBe(true);
    const cube = new SmartCube();
    cube.receive({ type: "move", move: "R", at: 0 });
    expect(stateToFacelets(cube.snapshot.state)).toBe("UUFUUFUUFRRRRRRRRRFFDFFDFFDDDBDDBDDBLLLLLLLLLUBBUBBUBB");
    expect(isSolved(cube.snapshot.state)).toBe(false);
  });

  test("turns reported by the cube follow the timer's held scramble preview", () => {
    const scramble = "D2 F' R2 U' L2 B2 D' R2 U2 F2 R' B' U2 L D' F R' U2 B";
    const cube = new SmartCube();
    for (const move of scramble.split(" ")) cube.receive({ type: "move", move, at: 0 });
    expect(colours(cube.snapshot.state)).toEqual(colours(applyAlg(solved(3), parseScramble(scramble))));
    expect(cube.moves).toHaveLength(19);
    // Facelets carry the colours: back and forth, the cube looks the same.
    expect(colours(faceletsToState(stateToFacelets(cube.snapshot.state)))).toEqual(colours(cube.snapshot.state));
  });

  test("a key pressed on the held cube is reported as the face the cube knows", () => {
    for (const key of ["R", "U'", "F2", "L", "D2'", "B'"]) expect(heldTurn(canonicalTurn(key))).toMatchObject({ ...parseMove(key)!, token: expect.any(String) });
    expect(canonicalTurn("R'")).toBe("L'");
    expect(() => heldTurn("M")).toThrow();
    expect(() => faceletsToState("U".repeat(54))).toThrow();
  });

  test("a driver connects, reports turns, and its disconnection turns the cube off", async () => {
    let listen!: (event: SmartCubeEvent) => void;
    const driver: SmartCubeDriver = {
      label: "Test cube",
      async connect(listener) {
        listen = listener;
        listen({ type: "facelets", facelets: SOLVED });
        return { name: "Test cube 1", disconnect() {} };
      },
    };
    const cube = new SmartCube();
    const seen: string[] = [];
    cube.subscribe(() => seen.push(cube.snapshot.status));
    await cube.connect(driver);
    expect(cube.snapshot).toMatchObject({ status: "on", name: "Test cube 1" });
    listen({ type: "move", move: "U", at: 5 });
    expect(cube.snapshot.turn?.at).toBe(5);
    listen({ type: "disconnected", reason: "Gone" });
    expect(cube.snapshot).toMatchObject({ status: "off", error: "Gone" });
    expect(seen[0]).toBe("connecting");
  });
});

describe("smart cube orientation", () => {
  test("quarter turns of the whole cube", () => {
    const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 9));
    // y: the front goes left, as U turns the top layer.
    close(rotate(rotation([0, 1, 0], -Math.PI / 2), [0, 0, 1]), [-1, 0, 0]);
    // x then y, applied in the player's axes.
    const q = compose(rotation([0, 1, 0], -Math.PI / 2), rotation([1, 0, 0], -Math.PI / 2));
    close(rotate(q, [0, 1, 0]), [1, 0, 0]);
    const cube = new SmartCube();
    cube.receive({ type: "orientation", quaternion: q });
    expect(cube.snapshot.orientation).toEqual(q);
  });

  test("a rotation in hand goes the short way, through each step", () => {
    const close = (a: readonly number[], b: readonly number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 9));
    const a = rotation([0, 1, 0], 0), b = rotation([0, 1, 0], -Math.PI / 2);
    close(slerp(a, b, 0), a);
    close(slerp(a, b, 1), b);
    close(slerp(a, b, 0.5), rotation([0, 1, 0], -Math.PI / 4));
    // The same rotation written with the opposite sign: still the short way.
    close(slerp(a, b.map((v) => -v) as unknown as typeof b, 0.5), rotation([0, 1, 0], -Math.PI / 4));
  });
});
