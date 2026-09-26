import { toast } from "sonner";

/** What the Electron shell adds to the web app (desktop/electron/preload.ts). */
export interface DesktopBridge {
  /** The storage.json of the former desktop engine, until its content has been imported. */
  legacyStorage: () => Promise<string | null>;
  legacyImported: () => Promise<void>;
  open: (url: string) => Promise<void>;
  onEvent: (callback: (event: any) => void) => () => void;
}
declare global {
  interface Window {
    cubixDesktop?: DesktopBridge;
    /** The engine, reachable from the console and from integration tests. */
    cubix: { call: typeof call };
  }
}
/** The engine worker's bundle, named after its content (desktop/web.ts). */
declare const CUBIX_WORKER: string;
const desktop = window.cubixDesktop;
const listeners = new Set<(event: any) => void>();
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let sequence = 0;
let failure: Error | undefined;

/** The engine keeps the whole workspace in memory: one tab at a time owns it, the others wait. */
async function exclusive() {
  if (!navigator.locks) return;
  const forever = () => new Promise<never>(() => {});
  const free = await new Promise<boolean>(answer =>
    void navigator.locks.request("cubix-engine", { ifAvailable: true }, lock => { answer(!!lock); return lock ? forever() : undefined; }));
  if (free) return;
  // After the first render: the toaster is not mounted yet while this module loads.
  const notice = setTimeout(() => toast("Cubix est déjà ouvert", { id: "other-tab", duration: Infinity, description: "Ferme l’autre onglet pour continuer ici." }), 500);
  await new Promise<void>(granted => void navigator.locks.request("cubix-engine", () => { granted(); return forever(); }));
  clearTimeout(notice);
  toast.dismiss("other-tab");
}
const worker = (async () => {
  await exclusive();
  const legacy = desktop ? await desktop.legacyStorage().catch(() => null) : null;
  const engine = new Worker(CUBIX_WORKER, { type: "module" });
  const { promise: started, resolve, reject } = Promise.withResolvers<Worker>();
  engine.onmessage = ({ data }) => {
    if ("id" in data) {
      const request = pending.get(data.id);
      if (!request) return;
      pending.delete(data.id);
      if (data.error) request.reject(new Error(data.error));
      else request.resolve(data.value);
    } else if (data.event === "started") {
      if (data.value.imported) void desktop?.legacyImported();
      resolve(engine);
    } else if (data.event === "failed") reject(new Error(data.value));
    else for (const listener of listeners) listener(data);
  };
  engine.onerror = (event) => {
    failure = new Error("The data engine stopped. Reload Cubix.");
    reject(failure);
    for (const request of pending.values()) request.reject(failure);
    pending.clear();
    for (const listener of listeners) listener({ event: "error", value: failure.message });
    event.preventDefault();
  };
  engine.postMessage({ type: "start", legacy: legacy ? JSON.parse(legacy) : null });
  void navigator.storage?.persist?.().catch(() => false);
  if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => {});
  return started;
})();

export const call = async (method: string, ...args: any[]): Promise<any> => {
  const engine = await worker;
  if (failure) throw failure;
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    engine.postMessage({ id, method, args });
  });
};
window.cubix = { call };
/** Engine events (`changed`, `sync`, `live`, `error`), plus the desktop's mouse back/forward buttons. */
export function onEvent(callback: (event: any) => void) {
  listeners.add(callback);
  const unsubscribe = desktop?.onEvent(callback);
  return () => { listeners.delete(callback); unsubscribe?.(); };
}
export function openExternal(url: string) {
  if (desktop) return desktop.open(url);
  window.open(url, "_blank", "noopener");
}
