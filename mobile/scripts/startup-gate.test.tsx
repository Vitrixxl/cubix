import { expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { atom, getDefaultStore } from "jotai";
let finishCheck!: (value: unknown) => void, finishDownload!: (value: unknown) => void;
let checks = 0, reloads = 0, mounts = 0, splashHidden = 0;
let launcher: { message: string; finish: boolean; onHidden: () => void } | undefined;
let release: () => Promise<unknown> = async () => null;
const toastAtom = atom<{ title: string } | null>(null);
const stored = new Map<string, string>();
mock.module("react-native", () => ({ View: "View", Text: "Text" }));
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
  expect(JSON.stringify(renderer.toJSON())).toContain("50 %");
  expect(launcher!.finish).toBe(false);
  expect(splashHidden).toBe(1);
  await act(() => renderer.unmount());
  await act(mount);
  expect(checks).toBe(1);
  expect(mounts).toBe(0);
  await act(() => finishDownload({ isNew: true, manifest: { id: "new" } }));
  expect(reloads).toBe(1);
  expect(stored.get("cubix.startup-update.attempt")).toBe("new");
  expect(JSON.stringify(renderer.toJSON())).toContain("Ouverture de la nouvelle version");
  // The cube keeps cycling until the new bundle takes over; practice never mounts under it.
  expect(launcher!.finish).toBe(false);
  expect(mounts).toBe(0);
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
  expect(getDefaultStore().get(toastAtom)?.title).toBe("Mode hors ligne");
  await act(() => renderer.unmount());
});
