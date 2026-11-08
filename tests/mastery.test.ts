import { describe, expect, test } from "bun:test";
import { advanceLesson, chunkAlg, masteryOf, startLesson, usualTimes, type CaseLesson, type Outcome } from "../src/client/lib/mastery";
import { reviewOf } from "../src/client/lib/trainingPicks";

const NOW = Date.parse("2026-11-08T12:00:00Z");
const play = (lesson: CaseLesson, outcomes: Outcome[], chunks: number) => outcomes.reduce((l, o) => advanceLesson(l, o, chunks), lesson);

describe("the ladder", () => {
  test("a case not known stands on its lesson's rung", () => {
    expect(masteryOf({ learned: false })).toBe(0);
    expect(masteryOf({ learned: false, stage: 2 })).toBe(2);
  });
  test("known, it is fluent on its attempts, anchored on its reviews", () => {
    expect(masteryOf({ learned: true })).toBe(3);
    const stat = { count: 12, ao5: 2000, box: 1 };
    expect(masteryOf({ learned: true, stat, usual: 2000 }, NOW)).toBe(4);
    expect(masteryOf({ learned: true, stat: { ...stat, ao5: 3000 }, usual: 2000 }, NOW)).toBe(3);
    expect(masteryOf({ learned: true, stat: { ...stat, box: 4, dueAt: new Date(NOW + 86_400_000).toISOString() }, usual: 2000 }, NOW)).toBe(5);
  });
  test("left long past its review, it has to show it again", () => {
    expect(masteryOf({ learned: true, stat: { count: 12, ao5: 2000, box: 5, dueAt: new Date(NOW - 30 * 86_400_000).toISOString() }, usual: 2000 }, NOW)).toBe(3);
  });
  test("a set's usual is the mean of its known cases timed enough", () => {
    const cases = [{ id: "a", set: "s" }, { id: "b", set: "s" }, { id: "c", set: "s" }];
    expect(usualTimes(cases, new Set(["a", "b"]), [{ caseId: "a", mean: 2, count: 3 }, { caseId: "b", mean: 4, count: 3 }, { caseId: "c", mean: 90, count: 9 }]).get("s")).toBe(3);
  });
  test("the review's box counts reviews passed in a row", () => {
    const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n, 12)).toISOString();
    expect(reviewOf([{ time: 1000, at: day(0) }, { time: 1000, at: day(2) }]).box).toBe(2);
    expect(reviewOf([{ time: 1000, at: day(0) }, { time: null, at: day(2) }]).box).toBe(0);
  });
});

describe("a case's lesson", () => {
  test("opens where the ladder stands", () => {
    expect(startLesson(0).phase).toBe("understand");
    expect(startLesson(1).phase).toBe("guided");
    expect(startLesson(2).phase).toBe("fading");
  });
  test("goes from watching to memory, a hesitation earning nothing", () => {
    let lesson = startLesson(0);
    lesson = play(lesson, ["good", "good", "hesitant", "good"], 3);
    expect(lesson).toMatchObject({ phase: "fading", hidden: 1 });
    lesson = play(lesson, ["good", "good"], 3);
    expect(lesson.phase).toBe("recall");
    expect(play(lesson, ["good", "hesitant"], 3).phase).toBe("recall");
    expect(play(lesson, ["good", "good"], 3).phase).toBe("done");
  });
  test("a miss goes a step back", () => {
    const recall = play(startLesson(0), ["good", "good", "good", "good", "good"], 3);
    expect(recall.phase).toBe("recall");
    expect(advanceLesson(recall, "miss", 3).phase).toBe("fading");
    expect(advanceLesson({ phase: "fading", reps: 0, hidden: 1 }, "miss", 3).phase).toBe("guided");
  });
  test("an algorithm of one gesture has nothing to hide", () => {
    expect(play(startLesson(0), ["good", "good", "good"], 1).phase).toBe("recall");
  });
});

describe("gestures", () => {
  test("named sequences are kept whole", () => {
    expect(chunkAlg("(U) R U R' U' R' F R F'").map((c) => c.name)).toEqual([undefined, "Sexy move", "Sledgehammer"]);
  });
  test("what is left goes three or four turns at a time, every turn kept", () => {
    const alg = "F2 U L D2 B R' L' U2";
    expect(chunkAlg(alg).flatMap((c) => c.turns).join(" ")).toBe(alg);
    expect(chunkAlg(alg).every((c) => c.turns.length <= 4)).toBe(true);
  });
});
