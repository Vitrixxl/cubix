import { expect, test } from "bun:test";
import { learningGoalMet, pendingCases } from "../src/client/lib/learningGoal";

const learned = (...ids: string[]) => new Set(ids);

test("the goal is met when learning clears every selected case that was pending", () => {
  const selected = ["F2L 1", "F2L 2", "F2L 3"];
  const before = pendingCases(selected, learned("F2L 1"));
  expect(before).toEqual(["F2L 2", "F2L 3"]);
  expect(learningGoalMet(before, selected, learned("F2L 1", "F2L 2"))).toBe(false);
  expect(learningGoalMet(["F2L 3"], selected, learned("F2L 1", "F2L 2", "F2L 3"))).toBe(true);
});

test("deselecting the remaining cases or starting fully learned never celebrates", () => {
  expect(learningGoalMet(["F2L 2"], ["F2L 1"], learned("F2L 1"))).toBe(false);
  expect(learningGoalMet([], ["F2L 1"], learned("F2L 1"))).toBe(false);
  expect(learningGoalMet(["F2L 2"], [], learned("F2L 2"))).toBe(false);
});

test("unlearning a selected case reopens the goal and learning it again celebrates", () => {
  const selected = ["F2L 1", "F2L 2"];
  const reopened = pendingCases(selected, learned("F2L 1"));
  expect(reopened).toEqual(["F2L 2"]);
  expect(learningGoalMet(reopened, selected, learned("F2L 1", "F2L 2"))).toBe(true);
});
