import { expect, mock, test } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
let finishCheck!: (value: unknown) => void, finishDownload!: (value: unknown) => void;
let checks = 0, reloads = 0, mounts = 0;
const stored = new Map<string, string>();
mock.module("react-native", () => ({ View: "View", Text: "Text", ActivityIndicator: "ActivityIndicator" }));
mock.module("../src/theme", () => ({ useTheme: () => ({ text: "white", text2: "gray", accent: "blue" }) }));
mock.module("../src/platform/storage", () => ({ storage: {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => stored.set(key, value),
  removeItem: (key: string) => stored.delete(key),
} }));
mock.module("expo-updates", () => ({
  isEnabled: true, updateId: "old", isEmbeddedLaunch: false,
  useUpdates: () => ({ downloadProgress: 0.5 }),
  checkForUpdateAsync: () => { checks++; return new Promise(resolve => { finishCheck = resolve; }); },
  fetchUpdateAsync: () => new Promise(resolve => { finishDownload = resolve; }),
  reloadAsync: async () => { reloads++; },
}));
const { StartupGate } = await import("../src/components/StartupGate");
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
test("mobile startup holds practice through download and reload, including remount", async () => {
  function Practice() { mounts++; return null; }
  let renderer!: ReactTestRenderer;
  const mount = () => { renderer = create(<StartupGate fontsReady><Practice /></StartupGate>); };
  await act(mount);
  expect(JSON.stringify(renderer.toJSON())).toContain("Recherche de mises à jour");
  expect(mounts).toBe(0);
  await act(() => finishCheck({ isAvailable: true, manifest: { id: "new" } }));
  expect(JSON.stringify(renderer.toJSON())).toContain("50 %");
  await act(() => renderer.unmount());
  await act(mount);
  expect(checks).toBe(1);
  expect(mounts).toBe(0);
  await act(() => finishDownload({ isNew: true, manifest: { id: "new" } }));
  expect(reloads).toBe(1);
  expect(stored.get("cubix.startup-update.attempt")).toBe("new");
  expect(JSON.stringify(renderer.toJSON())).toContain("Ouverture de la nouvelle version");
  expect(mounts).toBe(0);
  await act(() => renderer.unmount());
});
