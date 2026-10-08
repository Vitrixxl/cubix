import { expect, test } from "bun:test";
import { Alg } from "cubing/alg";
import { puzzles } from "cubing/puzzles";
import { cases, sets } from "../src/client/local/catalog";
import { METHODS } from "../src/shared/methods";
import { PUZZLES, puzzleOf, type PuzzleId } from "../src/shared/puzzles";
import { applyAlg, colorOf, faceOfSlot, invertAlg, slotsFor, solved } from "../src/shared/cube";
import {
  EMPTY_COURSE_PROGRESS, algId, algSetup, courseEntry, goToStep, methodFacts, methodProgress, methodShare, openCourse, readCourseProgress, recommendedMethod,
  stepAlgorithmCount, stepDone, stepId, stepLearned, stepSets, toggleAlgLearned,
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
          if (step.mask === "OLL" || step.mask === "EO" || step.mask === "PLL") expect(untouched(size, text, p => p[1] < 1), where).toBe(true);
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
  const sune = "R U R' U R U2 R'";
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
    expect(repeats).toBeLessThanOrEqual(3);
  }
});

/** Top-layer stickers of the 3×3 by where they sit: the four edges and the four corners, seen from above. */
const slotAt = (p: number[], n: number[]) => slotsFor(3).findIndex(g => g.p.every((v, i) => v === p[i]) && g.n.every((v, i) => v === n[i]));
const UP = [0, 1, 0];
const EDGES = { back: slotAt([0, 1, -1], UP), right: slotAt([1, 1, 0], UP), front: slotAt([0, 1, 1], UP), left: slotAt([-1, 1, 0], UP) };
const yellowEdges = (state: ReturnType<typeof solved>) => Object.entries(EDGES).filter(([, s]) => colorOf(state, s) === "U").map(([k]) => k).sort().join(" ");
const beginnerStep = (title: string) => METHODS["333"].find(m => m.id === "beginner")!.steps.find(s => s.title === title)!;
/** The first two layers and the yellow centre in place. */
const lowerLayersSolved = (state: ReturnType<typeof solved>) => slotsFor(3).every((g, s) => g.p[1] === 1 || colorOf(state, s) === faceOfSlot(s, 3));

test("the yellow cross: each case shows its pattern, held as its note says, and its algorithm advances toward the cross", () => {
  const step = beginnerStep("Yellow cross"), byName = Object.fromEntries(step.algs!.map(a => [a.name, a]));
  expect(Object.keys(byName)).toEqual(["Dot", "L", "Line"]);
  expect(step.mask).toBe("EO");
  // The pattern each case is shown with: no yellow edge, the L at the back left, the line from left to right.
  const shown = { Dot: "", L: "back left", Line: "left right" } as Record<string, string>;
  for (const a of step.algs!) {
    const start = applyAlg(solved(3), algSetup(a));
    expect(yellowEdges(start), a.name).toBe(shown[a.name]!);
    expect(lowerLayersSolved(start), a.name).toBe(true);
    for (const text of [a.alg, ...(a.alternatives ?? [])]) {
      const end = applyAlg(start, text);
      if (a.name === "Dot") expect(yellowEdges(end).split(" ")).toHaveLength(2);
      else expect(yellowEdges(end), `${a.name}: ${text}`).toBe("back front left right");
      expect(lowerLayersSolved(end), `${a.name}: ${text}`).toBe(true);
    }
  }
  // The dot: the line's algorithm from any side gives an L, which the turn of the top brings to the back left.
  const line = byName.Line!.alg, lShape = byName.L!.alg, dot = applyAlg(solved(3), algSetup(byName.Dot!));
  for (const u of ["", "U", "U2", "U'"]) {
    const after = applyAlg(applyAlg(dot, u), line);
    expect(yellowEdges(after).split(" ")).toHaveLength(2);
    const held = ["", "U", "U2", "U'"].map(t => applyAlg(after, t)).find(t => yellowEdges(t) === "back left")!;
    expect(yellowEdges(applyAlg(held, lShape))).toBe("back front left right");
  }
  // Whatever the L or line, held as said, one algorithm finishes the cross.
  for (const [pattern, alg] of [["back left", lShape], ["left right", line]] as const) {
    const start = applyAlg(solved(3), invertAlg(alg));
    expect(yellowEdges(start)).toBe(pattern);
  }
});

test("the yellow face with Sunes only: each of the seven cases is held as its note says and takes the Sunes it shows", () => {
  const step = beginnerStep("Yellow face"), sune = "R U R' U R U2 R'";
  const top = slotAt([-1, 1, 1], UP), left = slotAt([-1, 1, 1], [-1, 0, 0]), front = slotAt([-1, 1, 1], [0, 0, 1]);
  const corners = [[1, 1, 1], [1, 1, -1], [-1, 1, -1], [-1, 1, 1]].map(p => slotAt(p, UP));
  const yellow = (state: ReturnType<typeof solved>) => corners.filter(s => colorOf(state, s) === "U").length;
  /** The sticker of the front-left corner the hold looks at: yellow on top for one, on the left for none, in front for two. */
  const holdSlot = (state: ReturnType<typeof solved>) => { const n = yellow(state); return n === 1 ? top : n === 0 ? left : front; };
  expect(step.algs!.map(a => a.name)).toEqual(["Sune", "Antisune", "H", "Pi", "Headlights", "T", "Bowtie"]);
  const patterns = new Set<string>();
  for (const a of step.algs!) {
    let state = applyAlg(solved(3), algSetup(a));
    expect(lowerLayersSolved(state), a.name).toBe(true);
    // The four edges are already up (the cross), the case already held for its first Sune.
    expect(yellowEdges(state), a.name).toBe("back front left right");
    expect(colorOf(state, holdSlot(state)), a.name).toBe("U");
    expect(a.note, a.name).toContain(yellow(state) === 0 ? "No yellow corner up" : yellow(state) === 1 ? "One yellow corner up" : "Two yellow corners up");
    patterns.add(corners.map(s => colorOf(state, s)).join() + yellow(state));
    // Doing as the step says: Sune, look again, hold, Sune… reaches the yellow face in the number of Sunes shown.
    let sunes = 0, held = state;
    const steps: string[] = [];
    while (yellow(held) < 4) {
      const turn = ["", "U", "U2", "U'"].find(u => colorOf(applyAlg(held, u), holdSlot(applyAlg(held, u))) === "U")!;
      if (turn) steps.push(turn);
      held = applyAlg(applyAlg(held, turn), sune);
      steps.push(`(${sune})`);
      sunes++;
    }
    expect(sunes, a.name).toBeLessThanOrEqual(3);
    expect(a.detail, a.name).toBe(`Sunes needed: ${sunes}`);
    // The algorithm shown is exactly that: the Sunes and the turns of the top between them.
    expect(applyAlg(state, a.alg).join(), a.name).toBe(held.join());
    expect(a.alg.replace(`(${sune})2`, `(${sune}) (${sune})`), a.name).toBe(steps.join(" "));
  }
  // Seven different cases.
  expect(patterns.size).toBe(7);
});

test("cubing.js agrees: the cross cases end with every edge oriented, the Sune cases with every piece oriented", async () => {
  const kp = await puzzles["3x3x3"]!.kpuzzle(), start = kp.defaultPattern();
  const oriented = (alg: string, orbit: "EDGES" | "CORNERS") => start.applyAlg(new Alg(alg)).patternData[orbit]!.orientation.every(o => o === 0);
  for (const a of beginnerStep("Yellow cross").algs!)
    for (const text of [a.alg, ...(a.alternatives ?? [])]) {
      expect(oriented(algSetup(a), "EDGES"), a.name).toBe(false);
      expect(oriented(`${algSetup(a)} ${text}`, "EDGES"), `${a.name}: ${text}`).toBe(a.name !== "Dot");
    }
  for (const a of beginnerStep("Yellow face").algs!) {
    expect(oriented(algSetup(a), "EDGES") && !oriented(algSetup(a), "CORNERS"), a.name).toBe(true);
    expect(oriented(`${algSetup(a)} ${a.alg}`, "EDGES") && oriented(`${algSetup(a)} ${a.alg}`, "CORNERS"), a.name).toBe(true);
  }
});

test("a step is done once all its algorithms are learned; an intuitive one once marked mastered", () => {
  const puzzle: PuzzleId = "333", beginner = METHODS[puzzle][0]!;
  const withAlgs = beginner.steps.filter(st => stepLearned(st, cases, new Set(), courseEntry(EMPTY_COURSE_PROGRESS, puzzle, "beginner")).total > 0);
  let progress = openCourse(EMPTY_COURSE_PROGRESS, puzzle, "beginner");
  const counted = beginner.steps.filter(st => !st.missing || withAlgs.includes(st));
  expect(methodProgress(progress, puzzle, beginner, cases, new Set())).toEqual({ started: true, done: 0, total: counted.length, step: 0, learned: false });
  const step = beginner.steps[1]!;
  expect(stepDone(step, cases, new Set(), courseEntry(progress, puzzle, "beginner"))).toBe(false);
  for (const a of step.algs!) progress = toggleAlgLearned(progress, puzzle, "beginner", algId(step, a));
  expect(stepDone(step, cases, new Set(), courseEntry(progress, puzzle, "beginner"))).toBe(true);
  expect(methodProgress(progress, puzzle, beginner, cases, new Set()).done).toBe(1);
  const intuitive = beginner.steps.find(st => !withAlgs.includes(st));
  expect(intuitive && !intuitive.missing).toBeTruthy();
  expect(stepDone(intuitive!, cases, new Set(), courseEntry(progress, puzzle, "beginner"))).toBe(false);
  progress = toggleAlgLearned(progress, puzzle, "beginner", stepId(intuitive!));
  expect(stepDone(intuitive!, cases, new Set(), courseEntry(progress, puzzle, "beginner"))).toBe(true);
  expect(methodProgress(progress, puzzle, beginner, cases, new Set()).done).toBe(2);
  // Every algorithm known is not the method learned while an intuitive step is not mastered.
  const zz = METHODS[puzzle].find(m => m.id === "zz")!, all = new Set(cases.map(c => c.id));
  let zzProgress = openCourse(EMPTY_COURSE_PROGRESS, puzzle, "zz");
  for (const st of zz.steps) for (const a of st.algs ?? []) zzProgress = toggleAlgLearned(zzProgress, puzzle, "zz", algId(st, a));
  expect(methodProgress(zzProgress, puzzle, zz, cases, all).learned).toBe(false);
  expect(methodShare(zz, cases, all, zzProgress, puzzle)).toBeLessThan(1);
  for (const st of zz.steps) if (!stepAlgorithmCount(st, cases) && !st.missing) zzProgress = toggleAlgLearned(zzProgress, puzzle, "zz", stepId(st));
  expect(methodProgress(zzProgress, puzzle, zz, cases, all).learned).toBe(true);
  expect(methodShare(zz, cases, all, zzProgress, puzzle)).toBe(1);
});

test("a course remembers its method, its step and its own learned algorithms", () => {
  const puzzle: PuzzleId = "333";
  const beginner = METHODS[puzzle][0]!;
  let progress = openCourse(EMPTY_COURSE_PROGRESS, puzzle, "beginner");
  expect(progress.methods[puzzle]).toBe("beginner");
  progress = goToStep(progress, puzzle, "beginner", 99);
  expect(courseEntry(progress, puzzle, "beginner").step).toBe(5);
  const step = beginner.steps[1]!, id = algId(step, step.algs![0]!);
  progress = toggleAlgLearned(progress, puzzle, "beginner", id);
  expect(stepLearned(step, cases, new Set(), courseEntry(progress, puzzle, "beginner"))).toEqual({ learned: 1, total: 1 });
  expect(toggleAlgLearned(progress, puzzle, "beginner", id).courses["333:beginner"]!.learned).toEqual([]);
  // A stored value read back, and junk ignored.
  expect(readCourseProgress(JSON.parse(JSON.stringify(progress)))).toEqual(progress);
  expect(readCourseProgress({ methods: { "333": 4 }, courses: { x: { step: -1, done: "a" } } })).toEqual({ methods: {}, courses: { x: { step: 0, learned: [] } } });
  expect(readCourseProgress(null)).toEqual(EMPTY_COURSE_PROGRESS);
  // CFOP's OLL step teaches 2-look OLL and full OLL.
  const oll = METHODS[puzzle].find(m => m.id === "cfop")!.steps.find(s => s.title === "OLL")!;
  expect(stepAlgorithmCount(oll, cases)).toBe(67);
});
