import { toast } from "sonner";
import { cubingScrambleEngine } from "../../src/client/lib/cubingScrambleEngine";

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
/** Where cubing.js is served, for the scrambles a shared engine asks this tab to draw. */
declare const CUBIX_VENDOR: string;
let scrambler: ReturnType<typeof cubingScrambleEngine> | undefined;
const desktop = window.cubixDesktop;
const listeners = new Set<(event: any) => void>();
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let sequence = 0;
let failure: Error | undefined;

/** Without shared workers each tab runs its own engine, which keeps the whole workspace in memory: one tab at a time
 * owns it, the others wait. */
async function exclusive() {
  if (!navigator.locks) return;
  const forever = () => new Promise<never>(() => {});
  const free = await new Promise<boolean>(answer =>
    void navigator.locks.request("cubix-engine", { ifAvailable: true }, lock => { answer(!!lock); return lock ? forever() : undefined; }));
  if (free) return;
  const notice = setTimeout(blocked, 500);
  await new Promise<void>(granted => void navigator.locks.request("cubix-engine", () => { granted(); return forever(); }));
  clearTimeout(notice);
  toast.dismiss("other-tab");
}
// After the first render: the toaster is not mounted yet while this module loads.
const blocked = () => toast("Cubix est déjà ouvert", { id: "other-tab", duration: Infinity, description: "Ferme l’autre onglet pour continuer ici." });
type Port = { postMessage(message: unknown): void };
/** Every tab shares one engine in a shared worker where the browser has them. */
const shared = typeof SharedWorker !== "undefined";
const worker = (async () => {
  if (!shared) await exclusive();
  const legacy = desktop ? await desktop.legacyStorage().catch(() => null) : null;
  const { promise: started, resolve, reject } = Promise.withResolvers<Port>();
  let port: Port, notice: ReturnType<typeof setTimeout> | undefined;
  const receive = ({ data }: MessageEvent) => {
    if ("scramble" in data) {
      scrambler ??= cubingScrambleEngine(name => import(new URL(`${CUBIX_VENDOR}/${name}/index.js`, location.origin).href));
      void (scrambler as any)[data.method](...data.args).then(
        (value: string) => port.postMessage({ scrambled: data.scramble, value }),
        (error: Error) => port.postMessage({ scrambled: data.scramble, error: error?.message ?? String(error) }),
      );
    } else if ("id" in data) {
      const request = pending.get(data.id);
      if (!request) return;
      pending.delete(data.id);
      if (data.error) request.reject(new Error(data.error));
      else request.resolve(data.value);
    } else if (data.event === "started") {
      clearTimeout(notice);
      toast.dismiss("other-tab");
      if (data.value.imported) void desktop?.legacyImported();
      resolve(port);
    } else if (data.event === "failed") reject(new Error(data.value));
    // A tab of an older version still holds the data.
    else if (data.event === "blocked") notice = setTimeout(blocked, 500);
    else for (const listener of listeners) listener(data);
  };
  const stopped = (event: Event) => {
    failure = new Error("The data engine stopped. Reload Cubix.");
    reject(failure);
    for (const request of pending.values()) request.reject(failure);
    pending.clear();
    for (const listener of listeners) listener({ event: "error", value: failure.message });
    event.preventDefault();
  };
  if (shared) {
    const engine = new SharedWorker(CUBIX_WORKER, { type: "module", name: "cubix-engine" });
    engine.onerror = stopped;
    engine.port.onmessage = receive;
    addEventListener("pagehide", (e: PageTransitionEvent) => { if (!e.persisted) engine.port.postMessage({ type: "close" }); });
    port = engine.port;
  } else {
    const engine = new Worker(CUBIX_WORKER, { type: "module" });
    engine.onmessage = receive;
    engine.onerror = stopped;
    port = engine;
  }
  port.postMessage({ type: "start", legacy: legacy ? JSON.parse(legacy) : null });
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
