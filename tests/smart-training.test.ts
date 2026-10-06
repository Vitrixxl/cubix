import { describe, expect, test } from "bun:test";
import { applyAlg, invertAlg, solved } from "../src/shared/cube";
import { executableAlg } from "../src/client/lib/caseState";
import { caseGoal, caseMatcher, goalReached, setupTurns } from "../src/client/lib/smartTraining";
import catalog from "../desktop/assets/catalog.json";

const cases = (catalog as { cases: any[] }).cases;
const find = (set: string, name: string) => cases.find((c) => c.set === set && c.name === name)!;
/** The held cube once a sequence is turned: rotations change nothing a smart cube sees, so they are folded in. */
const turned = (from: ReturnType<typeof solved>, alg: string) => applyAlg(from, setupTurns(alg)!.held);

describe("smart cube training", () => {
  test("knows the cases a smart cube can follow", () => {
    expect(caseGoal(find("pll", "T Perm"))).toBe("solved");
    expect(caseGoal(cases.find((c) => c.set === "oll")!)).toBe("oll");
    expect(caseGoal(cases.find((c) => c.set === "f2l")!)).toBe("f2l");
    expect(caseGoal(cases.find((c) => c.set === "2look-oll" && c.group.startsWith("1"))!)).toBe("eo");
    expect(caseGoal(cases.find((c) => c.set === "4x4-pll")!)).toBeNull();
  });

  test("sees the case set up, from any turn of the top or angle, and its algorithm solving it", () => {
    for (const c of [find("pll", "T Perm"), ...cases.filter((c) => ["oll", "f2l", "pll"].includes(c.set)).slice(0, 40)]) {
      const goal = caseGoal(c)!,
        matches = caseMatcher(c.setup, goal),
        state = turned(solved(3), c.setup);
      expect(matches(solved(3))).toBe(false);
      expect(matches(state)).toBe(true);
      expect(matches(applyAlg(state, "U"))).toBe(true);
      expect(goalReached(state, goal)).toBe(false);
      // The setup's rotations carry on into the algorithm, as the player holds the cube.
      expect(goalReached(turned(solved(3), `${c.setup} ${executableAlg(c.algorithms[0])}`), goal)).toBe(true);
    }
  });

  test("an OLL set up at the end of another one is the same case", () => {
    const [first, second] = cases.filter((c) => c.set === "oll");
    // The first OLL's algorithm leaves the top oriented but not permuted.
    const start = turned(solved(3), `${first.setup} ${executableAlg(first.algorithms.at(-1))}`);
    expect(goalReached(start, "oll")).toBe(true);
    expect(caseMatcher(second.setup, "oll")(turned(start, second.setup))).toBe(true);
  });

  test("a PLL needs the rest of the cube solved", () => {
    const t = find("pll", "T Perm"),
      j = find("pll", "Jb Perm");
    expect(caseMatcher(t.setup, "solved")(turned(solved(3), j.setup))).toBe(false);
    expect(goalReached(applyAlg(solved(3), "U"), "solved")).toBe(true);
    expect(goalReached(applyAlg(solved(3), "R"), "solved")).toBe(false);
  });

  test("a setup with rotations and wide turns is followed as face turns", () => {
    expect(setupTurns("y R U R'")).toEqual({ held: "B U B'", canonical: "B D B'" });
    expect(setupTurns("r U r'")!.held.split(" ")).toHaveLength(3);
    expect(setupTurns("y")).toBeNull();
    const alg = "r U R' U' r' F R F'";
    expect(caseMatcher(invertAlg(alg), "oll")(turned(solved(3), invertAlg(alg)))).toBe(true);
  });
});
