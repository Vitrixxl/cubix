import { expect, test } from "bun:test";
import { bindNavigation, go, goPage, pageUrl, readRoute } from "../renderer/navigation";
test("URLs cover every page and encode case IDs, methods, puzzle and course steps", () => {
  expect(pageUrl("playground")).toBe("/timer");
  expect(pageUrl("algorithms", { caseId: "PLL Aa", puzzle: "333" })).toBe("/algorithms/PLL%20Aa?puzzle=333");
  expect(readRoute("/algorithms/PLL%20Aa", "?puzzle=333")).toMatchObject({ page: "algorithms", caseId: "PLL Aa", puzzle: "333" });
  expect(readRoute("/profile/training", "")).toMatchObject({ page: "profile", profileMode: "training" });
  expect(readRoute("/training/practice", "")).toMatchObject({ page: "training", trainingStep: "practice" });
  expect(readRoute("/learn/cfop", "?puzzle=333&step=2")).toMatchObject({ page: "learn", learnMethod: "cfop", learnStep: 2 });
  expect(readRoute("/onboarding", "")?.page).toBe("onboarding");
  for (const path of ["/unknown", "/profile/nope", "/training/nope", "/timer/extra", "/learn/cfop/extra", "/algorithms/%E0%A4%A"]) expect(readRoute(path, "")).toBeNull();
  expect(readRoute("/timer", "?puzzle=nope")).toBeNull();
  expect(readRoute("/learn/cfop", "?step=-1")).toBeNull();
});
test("the community, tournaments and matches keep their view in the address", () => {
  expect(pageUrl("community", { view: "groups/3/battles" })).toBe("/community/groups/3/battles");
  expect(pageUrl("tournaments")).toBe("/tournaments");
  expect(readRoute("/community/messages/12", "")).toMatchObject({ page: "community", view: "messages/12" });
  expect(readRoute("/tournaments/7", "")).toMatchObject({ page: "tournaments", view: "7" });
  expect(readRoute("/match/42", "")).toMatchObject({ page: "match", view: "42" });
  for (const path of ["/match", "/match/nope", "/community/a/b/c/d"]) expect(readRoute(path, "")).toBeNull();
});
test("navigation delegates pushes, replacements and history traversal to React Router", () => {
  const calls: unknown[][] = [];
  const unbind = bindNavigation(((...args: unknown[]) => { calls.push(args); }) as any);
  goPage("learn", { learnMethod: "ortega", puzzle: "222" });
  goPage("profile", {}, true); go(-1); go(1); unbind();
  expect(calls).toEqual([["/learn/ortega?puzzle=222", { replace: false }], ["/profile", { replace: true }], [-1], [1]]);
});
