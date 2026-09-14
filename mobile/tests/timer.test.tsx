import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

let appStateListener: ((state: string) => void) | undefined;
mock.module("react-native", () => ({ AppState: { addEventListener: (_event: string, listener: (state: string) => void) => {
  appStateListener = listener; return { remove() { appStateListener = undefined; } };
} } }));
const { useTimer, HOLD_DELAY_MS } = await import("../src/hooks/useTimer");
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer;
let timer: ReturnType<typeof useTimer>;
let clock = 0;
let clockSpy: ReturnType<typeof spyOn>;
beforeEach(() => { clock = 0; clockSpy = spyOn(performance, "now").mockImplementation(() => clock); });
afterEach(async () => { if (renderer) await act(() => renderer.unmount()); clockSpy.mockRestore(); });
async function mount(onStop: (ms: number) => void | Promise<void>, canStart = true) {
  function Harness() { timer = useTimer({ onStop, canStart }); return null; }
  await act(() => { renderer = create(<Harness />); });
}
async function start() {
  await act(() => timer.press());
  await act(async () => { await Bun.sleep(HOLD_DELAY_MS + 30); });
  expect(timer.phase).toBe("ready");
  clock = 1000;
  await act(() => timer.release());
  expect(timer.phase).toBe("running");
}

test("early release cancels; a full hold starts; the first tap saves once with the elapsed duration", async () => {
  const saved = mock();
  await mount(saved);
  await act(() => timer.press());
  expect(timer.phase).toBe("holding");
  await act(() => timer.release());
  expect(timer.phase).toBe("idle");
  expect(saved).not.toHaveBeenCalled();
  await start();
  clock = 2234;
  await act(() => { timer.press(); timer.press(); });
  expect(timer.phase).toBe("stopped");
  expect(timer.elapsed).toBe(1234);
  expect(saved).toHaveBeenCalledTimes(1);
  expect(saved).toHaveBeenCalledWith(1234);
});

test("backgrounding cancels an armed timer, while a running solve keeps its monotonic start", async () => {
  await mount(mock());
  await act(() => timer.press());
  await act(() => appStateListener?.("background"));
  await act(async () => { await Bun.sleep(HOLD_DELAY_MS + 20); });
  expect(timer.phase).toBe("idle");
  await act(() => timer.release());
  expect(timer.phase).toBe("idle");
  await start();
  await act(() => appStateListener?.("background"));
  expect(timer.phase).toBe("running");
  expect(timer.startedAt).toBe(1000);
});

test("a failed save blocks a new attempt and concurrent retries cannot duplicate the solve", async () => {
  let finish: (() => void) | undefined;
  const saved = mock((): Promise<void> => saved.mock.calls.length === 1
    ? Promise.reject(new Error("Disk full")) : new Promise(resolve => { finish = resolve; }));
  await mount(saved);
  await start();
  clock = 3200;
  await act(() => timer.press());
  expect(timer.saveError).toBe("Disk full");
  await act(() => timer.press());
  expect(timer.phase).toBe("stopped");
  await act(() => { timer.retrySave(); timer.retrySave(); });
  expect(saved).toHaveBeenCalledTimes(2);
  await act(() => finish?.());
  expect(timer.saveError).toBe("");
  await act(() => timer.press());
  expect(timer.phase).toBe("holding");
});

test("scramble loading or an empty selection prevents arming", async () => {
  await mount(mock(), false);
  await act(() => { timer.press(); timer.release(); });
  expect(timer.phase).toBe("idle");
});
