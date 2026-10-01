import { expect, test } from "bun:test";
import { Alg } from "cubing/alg";
import { puzzles } from "cubing/puzzles";
import { cases, sets } from "../src/client/local/catalog";
import { METHODS } from "../src/shared/methods";
import { PUZZLES, puzzleOf, type PuzzleId } from "../src/shared/puzzles";
import { applyAlg, colorOf, faceOfSlot, slotsFor, solved } from "../src/shared/cube";
import {
  EMPTY_COURSE_PROGRESS, algId, courseEntry, goToStep, methodFacts, methodProgress, openCourse, readCourseProgress, recommendedMethod,
  stepAlgorithmCount, stepId, stepLearned, stepSets, toggleAlgLearned, toggleStepDone,
} from "../src/client/lib/course";

const every = PUZZLES.flatMap(p => METHODS[p.id].map(method => ({ puzzle: p.id, method })));

test("every puzzle has methods and every method a course to follow", () => {
  for (const p of PUZZLES) {
    expect(METHODS[p.id].length, p.label).toBeGreaterThan(0);
    expect(new Set(METHODS[p.id].map(m => m.id)).size, p.label).toBe(METHODS[p.id].length);
    expect(recommendedMethod(p.id), p.label).toBe(METHODS[p.id][0]!.id);
  }
  for (const { puzzle, method } of every) {
    const where = `${puzzle} ${method.name}`;
    expect(method.steps.length, where).toBeGreaterThan(0);
    expect(new Set(method.steps.map(stepId)).size, where).toBe(method.steps.length);
    for (const step of method.steps) {
      // A step teaches algorithms, or says how to go about it, or says what Cubix lacks.
      expect(!!step.sets?.length || !!step.algs?.length || !!step.tips?.length || !!step.missing, `${where} · ${step.title}`).toBe(true);
      expect(step.tips?.length ?? 0, `${where} · ${step.title}`).toBeLessThanOrEqual(3);
      const names = (step.algs ?? []).map(a => algId(step, a));
      expect(new Set(names).size, `${where} · ${step.title}`).toBe(names.length);
    }
    expect(methodFacts(method, cases).algorithms, where).toBeGreaterThanOrEqual(method.steps.reduce((sum, s) => sum + (s.algs?.length ?? 0), 0));
  }
});

test("every set a step names exists in the catalogue for its puzzle", () => {
  for (const { puzzle, method } of every)
    for (const step of method.steps)
      for (const id of step.sets ?? []) {
        const set = sets.find(s => s.id === id);
        expect(set, `${puzzle} ${method.name} · ${step.title}: ${id}`).toBeDefined();
        expect(puzzleOf(set!), `${puzzle} ${method.name} · ${step.title}: ${id}`).toBe(puzzle);
        expect(stepSets(step, sets, puzzle).some(s => s.id === id)).toBe(true);
      }
});

test("every inline algorithm is valid notation for its puzzle, and undoes its own case", async () => {
  for (const { puzzle, method } of every) {
    const algs = method.steps.flatMap(step => step.algs ?? []);
    if (!algs.length) continue;
    const kp = await puzzles[PUZZLES.find(p => p.id === puzzle)!.twisty]!.kpuzzle(), start = kp.defaultPattern();
    for (const a of algs) {
      for (const text of [a.alg, ...(a.alternatives ?? [])]) {
        const alg = new Alg(text);
        const pattern = start.applyAlg(alg);
        expect(pattern.isIdentical(start), `${method.name} · ${a.name}: ${text}`).toBe(false);
        if (puzzle === "333" || puzzle === "222") expect(start.applyAlg(alg.invert()).applyAlg(alg).isIdentical(start), text).toBe(true);
      }
    }
  }
});

/** Stickers of a solved cube still in place after an algorithm, by where they sit. */
function untouched(size: number, alg: string, where: (p: readonly number[], n: readonly number[]) => boolean) {
  const state = applyAlg(solved(size), alg), h = (size - 1) / 2;
  return slotsFor(size).every((g, s) => !where(g.p.map(v => v / h), g.n) || colorOf(state, s) === faceOfSlot(s, size));
}

test("inline cube algorithms keep what their stage has already solved", () => {
  for (const { puzzle, method } of every) {
    if (puzzle !== "333" && puzzle !== "222") continue;
    const size = puzzle === "333" ? 3 : 2;
    for (const step of method.steps)
      for (const a of step.algs ?? []) {
        const where = `${method.name} · ${a.name}`;
        for (const text of [a.alg, ...(a.alternatives ?? [])]) {
          // Last-layer algorithms keep both lower layers; permutations also keep the top face's colour on top.
          if (step.mask === "OLL" || step.mask === "PLL") expect(untouched(size, text, p => p[1] < 1), where).toBe(true);
          if (step.mask === "PLL") {
            const state = applyAlg(solved(size), text);
            expect(slotsFor(size).every((g, s) => g.n[1] !== 1 || colorOf(state, s) === "U"), where).toBe(true);
          }
          // Second-layer insertions keep the first layer.
          if (step.title === "Second-layer edges") expect(untouched(size, text, p => p[1] === -1), where).toBe(true);
        }
      }
  }
});

test("repeating the Sune as the beginner step says orients every last layer whose edges are done", () => {
  const slots = slotsFor(3), at = (p: number[], n: number[]) => slots.findIndex(g => g.p.every((v, i) => v === p[i]) && g.n.every((v, i) => v === n[i]));
  const sune = METHODS["333"].find(m => m.id === "beginner")!.steps.find(s => s.title === "Yellow face")!.algs![0]!.alg;
  const top = at([-1, 1, 1], [0, 1, 0]), left = at([-1, 1, 1], [-1, 0, 0]), front = at([-1, 1, 1], [0, 0, 1]);
  const corners = [[1, 1, 1], [1, 1, -1], [-1, 1, -1], [-1, 1, 1]].map(p => at(p, [0, 1, 0]));
  const yellow = (state: ReturnType<typeof solved>) => corners.filter(s => colorOf(state, s) === "U").length;
  const seen = new Map<string, ReturnType<typeof solved>>();
  let frontier = [solved(3)];
  for (let depth = 0; depth < 7; depth++)
    frontier = frontier.flatMap(state => [sune, "U"].map(alg => applyAlg(state, alg)).filter(next => !seen.has(next.join()) && !!seen.set(next.join(), next)));
  expect(seen.size).toBeGreaterThan(100);
  for (let state of seen.values()) {
    let repeats = 0;
    while (yellow(state) < 4 && repeats < 4) {
      const count = yellow(state), wanted = count === 1 ? top : count === 0 ? left : front;
      state = applyAlg(["", "U", "U2", "U'"].map(u => applyAlg(state, u)).find(t => colorOf(t, wanted) === "U") ?? state, sune);
      repeats++;
    }
    expect(yellow(state)).toBe(4);
  }
});

test("a course remembers its method, its step, the steps done and its own learned algorithms", () => {
  const puzzle: PuzzleId = "333";
  const beginner = METHODS[puzzle][0]!;
  let progress = openCourse(EMPTY_COURSE_PROGRESS, puzzle, "beginner");
  expect(progress.methods[puzzle]).toBe("beginner");
  expect(methodProgress(progress, puzzle, beginner)).toEqual({ started: true, done: 0, total: 6, step: 0 });
  progress = goToStep(progress, puzzle, "beginner", 99);
  expect(courseEntry(progress, puzzle, "beginner").step).toBe(5);
  progress = toggleStepDone(goToStep(progress, puzzle, "beginner", 1), puzzle, "beginner", 1);
  expect(methodProgress(progress, puzzle, beginner).done).toBe(1);
  const step = beginner.steps[1]!, id = algId(step, step.algs![0]!);
  progress = toggleAlgLearned(progress, puzzle, "beginner", id);
  expect(stepLearned(step, cases, new Set(), courseEntry(progress, puzzle, "beginner"))).toEqual({ learned: 1, total: 1 });
  expect(toggleAlgLearned(progress, puzzle, "beginner", id).courses["333:beginner"]!.learned).toEqual([]);
  // A stored value read back, and junk ignored.
  expect(readCourseProgress(JSON.parse(JSON.stringify(progress)))).toEqual(progress);
  expect(readCourseProgress({ methods: { "333": 4 }, courses: { x: { step: -1, done: "a" } } })).toEqual({ methods: {}, courses: { x: { step: 0, done: [], learned: [] } } });
  expect(readCourseProgress(null)).toEqual(EMPTY_COURSE_PROGRESS);
  // CFOP's OLL step teaches 2-look OLL and full OLL.
  const oll = METHODS[puzzle].find(m => m.id === "cfop")!.steps.find(s => s.title === "OLL")!;
  expect(stepAlgorithmCount(oll, cases)).toBe(67);
});
