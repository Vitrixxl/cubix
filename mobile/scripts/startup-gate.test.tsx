import { expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { atom, getDefaultStore } from "jotai";
let finishCheck!: (value: unknown) => void, finishDownload!: (value: unknown) => void;
let checks = 0, reloads = 0, mounts = 0, splashHidden = 0;
let launcher: { message: string; finish: boolean; onHidden: () => void } | undefined;
let release: () => Promise<unknown> = async () => null;
const toastAtom = atom<{ title: string } | null>(null);
// A device that launched the app before: no first-launch screen.
const stored = new Map<string, string>([["cubix.launched", "1"]]);
mock.module("react-native", () => ({ View: "View", Text: "Text", Platform: { OS: "android" } }));
// The scrambler's page, started once the app is mounted: the first launch waits for it.
let finishWarm!: (value: string) => void;
mock.module("../src/scrambler", () => ({ nativeEngine: { randomScrambleForEvent: () => new Promise<string>(resolve => { finishWarm = resolve; }) } }));
mock.module("../src/theme", () => ({ useTheme: () => ({ text: "white", text2: "gray", accent: "blue" }) }));
mock.module("../src/platform/storage", () => ({ storage: {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => stored.set(key, value),
  removeItem: (key: string) => stored.delete(key),
} }));
mock.module("../src/release", () => ({ fetchRelease: () => release() }));
mock.module("../src/components/Toast", () => ({ toastAtom, Toast: () => null }));
mock.module("expo-splash-screen", () => ({ preventAutoHideAsync: async () => {}, hideAsync: async () => { splashHidden++; } }));
// The screen itself is drawn with react-native-svg; here it only records what the gate asks of it.
mock.module("../src/components/Launcher", () => ({ Launcher: (props: typeof launcher & object) => { launcher = props; return createElement("Launcher", { finish: props!.finish }, props!.message); } }));
mock.module("expo-updates", () => ({
  isEnabled: true, updateId: "old", isEmbeddedLaunch: false,
  useUpdates: () => ({ downloadProgress: 0.5 }),
  checkForUpdateAsync: () => { checks++; return new Promise(resolve => { finishCheck = resolve; }); },
  fetchUpdateAsync: () => new Promise(resolve => { finishDownload = resolve; }),
  reloadAsync: async () => { reloads++; },
}));
const { StartupGate } = await import("../src/components/StartupGate");
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
test("the cube screen only appears for a download and holds practice through the reload, including remount", async () => {
  function Practice() { mounts++; return null; }
  let renderer!: ReactTestRenderer;
  const mount = () => { renderer = create(<StartupGate fontsReady><Practice /></StartupGate>); };
  await act(mount);
  await act(async () => { await Bun.sleep(1); }); // the connectivity probe answers
  // While checking, nothing is drawn: the native splash stays up.
  expect(renderer.toJSON()).toBeNull();
  expect(launcher).toBeUndefined();
  expect(splashHidden).toBe(0);
  expect(mounts).toBe(0);
  await act(() => finishCheck({ isAvailable: true, manifest: { id: "new" } }));
  expect(JSON.stringify(renderer.toJSON())).toContain("50%");
  expect(launcher!.finish).toBe(false);
  expect(splashHidden).toBe(1);
  await act(() => renderer.unmount());
  await act(mount);
  expect(checks).toBe(1);
  expect(mounts).toBe(0);
  await act(() => finishDownload({ isNew: true, manifest: { id: "new" } }));
  expect(reloads).toBe(1);
  expect(stored.get("cubix.startup-update.attempt")).toBe("new");
  expect(JSON.stringify(renderer.toJSON())).toContain("Opening the new version");
  // The cube keeps cycling until the new bundle takes over; practice never mounts under it.
  expect(launcher!.finish).toBe(false);
  expect(mounts).toBe(0);
  await act(() => renderer.unmount());
});
test("on the device's first launch the cube screen covers the app until its scrambler has started, once", async () => {
  const kept = new Map<string, string>();
  mock.module("../src/platform/storage", () => ({ storage: {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => kept.set(key, value),
    removeItem: (key: string) => kept.delete(key),
  } }));
  release = async () => null;
  launcher = undefined;
  mounts = 0;
  const { StartupGate: Gate } = await import(`../src/components/StartupGate?first=${Date.now()}`);
  function Practice() { mounts++; return null; }
  let renderer!: ReactTestRenderer;
  await act(() => { renderer = create(<Gate fontsReady><Practice /></Gate>); });
  expect(launcher!.message).toBe("Getting Qbix ready for its first launch…");
  expect(launcher!.finish).toBe(false);
  // No update: the app mounts under the screen, which stays until the scrambler answers.
  await act(() => finishCheck({ isAvailable: false }));
  await act(async () => { await Bun.sleep(1); });
  expect(mounts).toBeGreaterThan(0);
  expect(launcher!.finish).toBe(false);
  await act(() => finishWarm("R U"));
  await act(async () => { await Bun.sleep(1); });
  expect(launcher!.finish).toBe(true);
  await act(() => launcher!.onHidden());
  expect(kept.get("cubix.launched")).toBe("1");
  expect(JSON.stringify(renderer.toJSON())).not.toContain("Launcher");
  await act(() => renderer.unmount());
});
test("without an update the app opens directly; offline, it announces offline mode at once", async () => {
  // A fresh module instance: the startup promise is remembered per JavaScript session.
  mock.module("../src/platform/storage", () => ({ storage: { getItem: () => "new", setItem: () => {}, removeItem: () => {} } }));
  release = () => Promise.reject(Error("Network request failed"));
  launcher = undefined;
  const { StartupGate: Gate } = await import(`../src/components/StartupGate?offline=${Date.now()}`);
  function Practice() { mounts++; return null; }
  let renderer!: ReactTestRenderer;
  await act(() => { renderer = create(<Gate fontsReady><Practice /></Gate>); });
  // The remembered attempt "new" means the update on offer was already tried: the installed version opens.
  await act(() => finishCheck({ isAvailable: true, manifest: { id: "new" } }));
  await act(async () => { await Bun.sleep(5); });
  expect(launcher).toBeUndefined();
  expect(mounts).toBeGreaterThan(0);
  expect(splashHidden).toBeGreaterThan(1);
  expect(getDefaultStore().get(toastAtom)?.title).toBe("Offline");
  await act(() => renderer.unmount());
});
