import { expect, test } from "bun:test";
import { generatePracticeScramble } from "../desktop/engine/practiceScramble";
import { applyAlg, colorOf, slotsFor, solved } from "../src/shared/cube";
import { type ScrambleType, contextOf, validContext } from "../src/shared/puzzles";

test("restricted generators use only their advertised moves", async () => {
  for (const [type,allowed] of Object.entries({"2gen-ru":"RU", "2gen-lu":"LU", "2gen-rf":"RF", "2gen-mu":"MU", "3gen-rul":"RUL", "3gen-ruf":"RUF"})) {
    for (let i=0;i<10;i++) {
      const alg = await generatePracticeScramble({puzzle:"333",solveMode:"one-handed",scrambleType:type as ScrambleType});
      expect(alg.split(" ").every(move => new RegExp(`^[${allowed}](2|')?$`).test(move))).toBe(true);
    }
  }
  const half = await generatePracticeScramble({puzzle:"333",solveMode:"standard",scrambleType:"half-turns"});
  expect(half.split(" ").every(move => /^[URFDLB]2$/.test(move))).toBe(true);
  const outer = await generatePracticeScramble({puzzle:"777",solveMode:"standard",scrambleType:"outer-turns"});
  expect(outer.split(" ")).toHaveLength(100);
  expect(outer.split(" ").every(move => /^[URFDLB](2|')?$/.test(move))).toBe(true);
});

test("last-layer and case scrambles preserve solved blocks", async () => {
  for (const scrambleType of ["last-layer","oll","pll","f2l"] as const) {
    for (let i=0;i<80;i++) {
      const alg = await generatePracticeScramble({puzzle:"333",solveMode:"standard",scrambleType});
      const state = applyAlg(solved(),alg);
      // LL preserves the first two layers. F2L cases preserve the cross and three slots.
      const protectedStickers = slotsFor(3).flatMap((slot,index) => {
        const [x,y,z] = slot.p;
        const protectedPiece = scrambleType === "f2l" ? y === -1 && (x === 0 || z === 0) : y < 1;
        return protectedPiece ? [index] : [];
      });
      expect(protectedStickers.every(index => colorOf(state,index) === colorOf(solved(),index)),`${scrambleType}: ${alg}`).toBe(true);
      if (scrambleType === "f2l") {
        const intactSlots = [[1,1],[1,-1],[-1,1],[-1,-1]].filter(([x,z]) => slotsFor(3).every((slot,index) =>
          slot.p[1] > 0 || slot.p[0] !== x || slot.p[2] !== z || colorOf(state,index) === colorOf(solved(),index)));
        expect(intactSlots.length).toBeGreaterThanOrEqual(3);
      }
      if (scrambleType === "pll") expect(Array.from({length:9},(_,i) => colorOf(state,i))).toEqual(Array.from({length:9},(_,i) => colorOf(solved(),i)));
    }
  }
});

test("legacy records have stable labels", () => {
  expect(contextOf({})).toEqual({puzzle:"333",solveMode:"standard",scrambleType:"normal"});
  expect(contextOf({cube_size:7,case_id:"case"})).toEqual({puzzle:"777",solveMode:"standard",scrambleType:"case"});
  expect(validContext({puzzle:"sq1",solveMode:"standard",scrambleType:"2gen-ru"})).toBe(false);

});

test("Normal uses the WCA event generator for every puzzle and solve mode", async () => {
  const { PUZZLES } = await import("../src/shared/puzzles");
  const events: string[] = [];
  const engine = { randomScrambleForEvent: async (event: string) => { events.push(event); return "R U"; }, orbitScramble: async () => { throw Error("Unexpected orbit generator"); } };
  for (const puzzle of PUZZLES) {
    expect(puzzle.scrambles.filter(type => type === "normal")).toHaveLength(1);
    expect(puzzle.scrambles).not.toContain("competition");
    expect(puzzle.scrambles).not.toContain("random-moves");
    expect(await generatePracticeScramble({ puzzle: puzzle.id, solveMode: "standard", scrambleType: "normal" }, engine)).toBe("R U");
  }
  expect(events).toEqual(PUZZLES.map(puzzle => puzzle.id));
  for (const puzzle of ["333", "444", "555"] as const) await generatePracticeScramble({ puzzle, solveMode: "blindfolded", scrambleType: "normal" }, engine);
  await generatePracticeScramble({ puzzle: "333", solveMode: "one-handed", scrambleType: "normal" }, engine);
  expect(events.slice(-4)).toEqual(["333bf", "444bf", "555bf", "333oh"]);
  for (const scramble_type of ["competition", "random-moves"] as const) expect(contextOf({ scramble_type }).scrambleType).toBe("normal");
});
