/**
 * The blindfolded sets (data/bld.json, scripts/build-bld-catalog.ts), checked again on cubing.js: every algorithm of
 * every case does exactly the swap or cycle its id announces in Speffz letters (wings by position on the 4×4 and 5×5),
 * with its method's side effect, and leaves every other piece where it was.
 */
import { expect, test } from "bun:test";
import { cases, sets } from "../src/client/local/catalog";
import { announced, check, effect, describe, mismatches } from "../scripts/bld-model";

const bld = cases.filter((c) => c.stage === "BLD");

test("the blindfolded sets: Old Pochmann, M2, 3-style from UF and UFR, the parities, and r2 on 4×4 and 5×5", () => {
  const count = (id: string) => sets.find((s) => s.id === id)?.count;
  expect([count("3bld-op-edges"), count("3bld-op-corners"), count("3bld-m2"), count("3bld-3style-edges"), count("3bld-3style-corners"), count("3bld-parity"), count("4x4-bld-r2"), count("5x5-bld-r2")]).toEqual([22, 21, 22, 440, 378, 22, 23, 23]);
});

test("every blindfolded algorithm does exactly what its case announces", () => {
  const failures: string[] = [];
  let checked = 0;
  for (const c of bld) for (const a of c.algorithms) {
    checked++;
    const wrong = check(c.id, a.alg);
    if (wrong.length) failures.push(`${c.id}: ${a.alg}: ${wrong.slice(0, 3).join("; ")}`);
  }
  expect(checked).toBeGreaterThan(1700);
  expect(failures).toEqual([]);
});

test("the check tells a wrong algorithm", () => {
  const tPerm = "R U R' U' R' F R2 U' R' U' R U R' F'";
  // The T perm swaps UR with UL (D), not UB (A); and the sticker model reads R as cubing.js turns it.
  expect(mismatches(tPerm, announced("UR D"))).toEqual([]);
  expect(mismatches(tPerm, announced("UR A")).length).toBeGreaterThan(0);
  expect(mismatches(`${tPerm} U`, announced("UR D")).length).toBeGreaterThan(0);
  expect(describe(effect("R").get("CORNERS:0:0")!)).toBe("corner K");
  // r2 alone shoots to UBr, not to UFr; on the 5×5 too.
  expect(check("4x4 r2 UBr", "2R2")).toEqual([]);
  expect(check("4x4 r2 FUr", "2R2").length).toBeGreaterThan(0);
  expect(check("5x5 r2 UBr", "R2").length).toBeGreaterThan(0);
});
