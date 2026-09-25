import { afterEach, expect, mock, test } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Provider, createStore, atom } from "jotai";
import { learningKey, localDay } from "../../src/client/lib/dailyLearning";
import { cases } from "../../src/client/local/catalog";
const stored = new Map<string, string>();
mock.module("../src/platform/storage", () => ({ storage: { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => stored.set(k, v) } }));
let resume: (state: string) => void;
mock.module("react-native", () => ({ AppState: { addEventListener: (_: string, cb: typeof resume) => { resume = cb; return { remove() {} }; } } }));
const userAtom = atom({ id: "alice" }), puzzleAtom = atom("333"), learnedCaseIdsAtom = atom<string[]>([]), cubeSwitchLockedAtom = atom(false);
mock.module("../src/state", () => ({ userAtom, puzzleAtom, learnedCaseIdsAtom, cubeSwitchLockedAtom, casesAtom: atom(cases) }));
const { useDailyLearning } = await import("../src/hooks/useDailyLearning");
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer;
let daily: ReturnType<typeof useDailyLearning>;
afterEach(async () => { if (renderer) await act(() => renderer.unmount()); stored.clear(); });
async function mount(store = createStore()) {
  function Harness() { daily = useDailyLearning(); return null; }
  await act(() => { renderer = create(<Provider store={store}><Harness /></Provider>); });
  return store;
}
test("mobile advances immediately and preserves the next case across tracks and remounts", async () => {
  const store = await mount();
  await act(() => daily.setMode("F2L"));
  const first = daily.assignment!.caseId;
  expect(first).toBe("F2L 1");
  await act(() => store.set(learnedCaseIdsAtom, [first]));
  const next = daily.assignment!.caseId;
  expect(next).toBe("F2L 2");
  expect(daily.status).toBe("Algorithm to learn · 1/41 learned");
  await act(() => daily.setMode("OLL"));
  expect(daily.assignment?.caseId).toBe("OLL 1");
  await act(() => daily.setMode("F2L"));
  expect(daily.assignment?.caseId).toBe(next);
  await act(() => renderer.unmount()); await mount(store);
  expect(daily.mode).toBe("F2L");
  expect(daily.assignment?.caseId).toBe(next);
  await act(() => store.set(learnedCaseIdsAtom, []));
  expect(daily.assignment?.completedOn).toBeUndefined();
  await act(() => store.set(puzzleAtom, "222"));
  expect(daily.mode).toBe("practice");
  await act(() => store.set(puzzleAtom, "333"));
  expect(daily.assignment?.caseId).toBe(next);
});
test("mobile advances yesterday's completed case on launch and isolates accounts", async () => {
  stored.set(learningKey("alice"), JSON.stringify({ mode: "PLL", tracks: { PLL: { caseId: "PLL Aa", assignedOn: "2020-01-01", completedOn: "2020-01-02" } } }));
  const store = createStore(); store.set(learnedCaseIdsAtom, ["PLL Aa"]);
  await mount(store);
  expect(daily.assignment?.caseId).not.toBe("PLL Aa");
  expect(daily.assignment?.assignedOn).toBe(localDay());
  const pinned = daily.assignment;
  await act(() => resume("active"));
  expect(daily.assignment).toBe(pinned);
  await act(() => renderer.unmount());
  store.set(userAtom, { id: "bob" }); await mount(store);
  expect(daily.mode).toBe("practice");
});

test("mobile global review tracks all learned stages, freezes during attempts, and preserves the daily case", async () => {
  const store = await mount();
  await act(() => daily.setMode("F2L"));
  const pinned = daily.assignment;
  await act(() => { store.set(learnedCaseIdsAtom, ["F2L 2", "OLL 1", "PLL Aa"]); daily.setMode("review"); });
  expect(daily.reviewIds.slice().sort()).toEqual(["F2L 2", "OLL 1", "PLL Aa"].sort());
  await act(() => store.set(cubeSwitchLockedAtom, true));
  await act(() => store.set(learnedCaseIdsAtom, ["F2L 2", "PLL Aa"]));
  expect(daily.reviewIds).toContain("OLL 1");
  await act(() => store.set(cubeSwitchLockedAtom, false));
  expect(daily.reviewIds).not.toContain("OLL 1");
  await act(() => store.set(learnedCaseIdsAtom, []));
  expect(daily.reviewIds).toEqual([]);
  await act(() => daily.setMode("F2L"));
  expect(daily.assignment).toEqual(pinned);
});

test("mobile group order persists per track and keeps the assigned case", async () => {
  const store = await mount();
  await act(() => daily.setMode("PLL"));
  const pinned = daily.assignment;
  const reordered = [...daily.groups];
  reordered.unshift(reordered.splice(2, 1)[0]!);
  await act(() => daily.reorderGroups(reordered));
  expect(daily.groups[0]).toBe("Edges Only");
  expect(daily.assignment).toEqual(pinned);
  await act(() => store.set(cubeSwitchLockedAtom, true));
  await act(() => daily.reorderGroups([...daily.groups].reverse()));
  expect(daily.groups[0]).toBe("Edges Only");
  await act(() => store.set(cubeSwitchLockedAtom, false));
  await act(() => daily.setMode("OLL"));
  expect(daily.groups[0]).toBe("Dot");
  await act(() => daily.setMode("PLL"));
  await act(() => renderer.unmount()); await mount(store);
  expect(daily.groups[0]).toBe("Edges Only");
  expect(daily.assignment).toEqual(pinned);
});

test.each(["F2L", "OLL", "PLL"] as const)("mobile %s drag order survives reopening and ignores unknown or duplicate groups", async track => {
  const store = await mount();
  await act(() => daily.setMode(track));
  const original = [...daily.groups];
  const reordered = [...original].reverse();
  await act(() => daily.reorderGroups([...reordered, reordered[0]!, "unknown"]));
  expect(daily.groups).toEqual(reordered);
  await act(() => renderer.unmount()); await mount(store);
  expect(daily.groups).toEqual(reordered);
  const other = track === "OLL" ? "PLL" : "OLL";
  await act(() => daily.setMode(other));
  await act(() => daily.setMode(track));
  expect(daily.groups).toEqual(reordered);
});

 test("mobile skips a saved case completed today and finishes the track", async () => {
  stored.set(learningKey("alice"), JSON.stringify({ mode: "OLL", tracks: { OLL: { caseId: "OLL 1", assignedOn: localDay(), completedOn: localDay() } } }));
  const store = createStore();
  const ids = cases.filter(c => c.set === "oll").map(c => c.id);
  store.set(learnedCaseIdsAtom, ids.filter(id => id !== "OLL 2"));
  await mount(store);
  expect(daily.assignment?.caseId).toBe("OLL 2");
  await act(() => store.set(learnedCaseIdsAtom, ids));
  expect(daily.assignment).toBeUndefined();
  expect(daily.status).toBe("Track complete · 57/57 learned");
 });
