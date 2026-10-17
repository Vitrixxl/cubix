import { expect, test } from "bun:test";
import { remindersDue } from "../src/client/lib/reminders";
import { dayKey, streaks } from "../src/client/lib/profile";

const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

test("the cases due and a streak at stake remind once a day", () => {
  const streak = streaks([{ at: at(1) }, { at: at(2) }, { at: at(3) }]);
  expect(streak).toMatchObject({ current: 3, today: false });
  expect(remindersDue(true, null, { due: 4, streak }).map((r) => r.id)).toEqual(["review", "streak"]);
  expect(remindersDue(true, dayKey(new Date()), { due: 4, streak })).toEqual([]);
  expect(remindersDue(false, null, { due: 4, streak })).toEqual([]);
});

test("a solve today or no streak leaves only the review", () => {
  expect(remindersDue(true, null, { due: 2, streak: streaks([{ at: at(0) }, { at: at(1) }]) }).map((r) => r.id)).toEqual(["review"]);
  expect(remindersDue(true, null, { due: 0, streak: streaks([]) })).toEqual([]);
});
