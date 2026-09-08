import { expect, test } from "vitest";
import { EMPTY_TRAINING_HISTORY, TRAINING_HISTORY_LIMIT, trainingHistoryReducer } from "../src/frontend/lib/trainingHistory";
import { CASES } from "./backend";

const pool = CASES.filter(c => c.stage === "F2L").slice(0, 3);
const next = (state = EMPTY_TRAINING_HISTORY, sample = 0, auf = "U") => trainingHistoryReducer(state, { type: "next", pool, sample, auf });

test("previous and next restore skipped cases and their original AUF without generating replacements", () => {
  const first = next();
  const second = next(first, 0.5, "U'");
  expect(second.entries[1]!.c.id).not.toBe(first.entries[0]!.c.id);
  const previous = trainingHistoryReducer(second, { type: "previous" });
  expect(previous.entries[previous.index]).toBe(first.entries[0]);
  const restored = next(previous, 0.9, "U2");
  expect(restored.entries[restored.index]).toBe(second.entries[1]);
  expect(restored.entries[restored.index]!.auf).toBe("U'");
  expect(restored.entries).toHaveLength(2);
});

test("training history is bounded and navigation respects the available pool", () => {
  let state = EMPTY_TRAINING_HISTORY;
  for (let i = 0; i < TRAINING_HISTORY_LIMIT * 3; i++) state = next(state, (i % 10) / 10);
  expect(state.entries).toHaveLength(TRAINING_HISTORY_LIMIT);
  expect(state.index).toBe(TRAINING_HISTORY_LIMIT - 1);
  state = trainingHistoryReducer(state, { type: "previous" });
  const narrowed = trainingHistoryReducer(state, { type: "next", pool: [pool[2]!], sample: 0, auf: "" });
  expect(narrowed.entries[narrowed.index]!.c.id).toBe(pool[2]!.id);
  expect(trainingHistoryReducer(state, { type: "next", pool: [], sample: 0, auf: "" })).toBe(EMPTY_TRAINING_HISTORY);
  expect(trainingHistoryReducer(EMPTY_TRAINING_HISTORY, { type: "previous" })).toBe(EMPTY_TRAINING_HISTORY);
});
