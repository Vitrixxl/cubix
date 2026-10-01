import { expect, test } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createStore, Provider } from "jotai";
import { measureTourTarget, tourTargetsVersionAtom, useTourTarget } from "../src/tour";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function Tagged({ name }: { name: string }) {
  const tour = useTourTarget(name);
  return <view {...(tour as any)} />;
}

test("a tagged view is measured in the window while it is mounted, and forgotten once it goes", async () => {
  const store = createStore();
  let renderer!: ReactTestRenderer;
  const measureInWindow = (callback: (x: number, y: number, w: number, h: number) => void) => callback(16, 120, 328, 200);
  await act(() => { renderer = create(<Provider store={store}><Tagged name="scramble" /></Provider>, { createNodeMock: () => ({ measureInWindow }) }); });
  expect(store.get(tourTargetsVersionAtom)).toBe(1);
  expect(await measureTourTarget("scramble")).toEqual({ x: 16, y: 120, width: 328, height: 200 });
  expect(await measureTourTarget("timer")).toBeNull();
  await act(() => renderer.unmount());
  expect(store.get(tourTargetsVersionAtom)).toBe(2);
  expect(await measureTourTarget("scramble")).toBeNull();
});

test("a view without a size does not count", async () => {
  let renderer!: ReactTestRenderer;
  await act(() => { renderer = create(<Tagged name="duel" />, { createNodeMock: () => ({ measureInWindow: (callback: (...n: number[]) => void) => callback(0, 0, 0, 0) }) }); });
  expect(await measureTourTarget("duel")).toBeNull();
  await act(() => renderer.unmount());
});
