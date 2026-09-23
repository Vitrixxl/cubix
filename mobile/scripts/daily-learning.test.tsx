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
test("mobile track, case and completion survive remount; other puzzles stay free", async () => {
  const store = await mount();
  await act(() => daily.setMode("F2L"));
  const first = daily.assignment!.caseId;
  expect(first).toBe("F2L 1");
  await act(() => store.set(learnedCaseIdsAtom, [first]));
  expect(daily.assignment?.completedOn).toBe(localDay());
  expect(daily.status).toContain("next tomorrow");
  await act(() => daily.setMode("OLL"));
  expect(daily.assignment?.caseId).toBe("OLL 1");
  await act(() => daily.setMode("F2L"));
  expect(daily.assignment?.caseId).toBe(first);
  await act(() => renderer.unmount()); await mount(store);
  expect(daily.mode).toBe("F2L");
  expect(daily.status).toContain("next tomorrow");
  await act(() => store.set(learnedCaseIdsAtom, []));
  expect(daily.assignment?.completedOn).toBeUndefined();
  await act(() => store.set(puzzleAtom, "222"));
  expect(daily.mode).toBe("practice");
  await act(() => store.set(puzzleAtom, "333"));
  expect(daily.assignment?.caseId).toBe(first);
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
