import { expect, test } from "bun:test";
import { applyAlg, mirrorAlg, solved } from "../src/shared/cube";
import { leftHandAlgs } from "../src/client/lib/caseState";
import { caseGoal, goalReached } from "../src/client/lib/smartTraining";
import { cases } from "../src/client/local/catalog";

test("a mirrored algorithm swaps R and L and turns the other way, but M and x", () => {
  expect(mirrorAlg("R U R' U' M x r2 E S y z2")).toBe("L' U' L U M x l2 E' S' y' z2");
  // Mirrored twice, it is the same again.
  expect(mirrorAlg(mirrorAlg("R U2 R' F' r U' l"))).toBe("R U2 R' F' r U' l");
});

test("each last layer case gets the mirror of its set's algorithms that solve it, and only those", () => {
  for (const set of ["pll", "oll"]) {
    const all = cases.filter((c) => c.set === set);
    for (const c of all) {
      const found = leftHandAlgs(c, all)!;
      const goal = caseGoal(c)!;
      for (const a of found) expect(goalReached(applyAlg(applyAlg(solved(3), c.setup), `${a.pre_auf ?? ""} ${a.alg}`), goal)).toBe(true);
    }
  }
  const pll = cases.filter((c) => c.set === "pll"), ja = pll.find((c) => c.id.endsWith("Ja"))!, jb = pll.find((c) => c.id.endsWith("Jb"))!;
  // Jb's algorithms mirrored solve Ja.
  expect(leftHandAlgs(ja, [jb])!.length).toBeGreaterThan(0);
  expect(leftHandAlgs(cases.find((c) => c.set === "f2l")!, [])).toBeNull();
});
