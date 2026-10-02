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
 * owns it. The tab opened last always takes it; the one it was taken from stops its engine and offers to take it back. */
async function exclusive() {
  if (!navigator.locks) return;
  const forever = () => new Promise<never>(() => {});
  await new Promise<void>(granted =>
    void navigator.locks.request("cubix-engine", { steal: true }, () => { granted(); return forever(); }).catch(() => elsewhere()));
}
let terminate: (() => void) | undefined;
function elsewhere() {
  terminate?.();
  stop(new Error("Cubix is open in another tab."));
  toast("Cubix is open in another tab", { id: "other-tab", duration: Infinity, action: { label: "Use here", onClick: () => location.reload() } });
}
/** The engine is gone (replaced, taken by another tab, crashed): every request in flight fails with `error`. */
function stop(error: Error) {
  failure = error;
  for (const request of pending.values()) request.reject(error);
  pending.clear();
}
/**
 * A newer version of the engine took over: this tab reloads onto it, once no solve is running (the page decides,
 * see `replaced` in app.tsx). Before the page has drawn anything there is nothing to keep: reload at once.
 */
function replaced(started: boolean) {
  stop(new Error("Cubix was updated. Reloading…"));
  if (!started) return location.reload();
  for (const listener of listeners) listener({ event: "replaced" });
}
/**
 * This tab's engine took over from one of another version: every tab still on an older version reloads. Versions that
 * predate the hand-over never hear about it, so the service worker reloads every tab that does not answer with this
 * engine (sw.ts). The active service worker may still be the previous one for a moment: ask until one answers.
 */
async function stale() {
  const registration = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  if (!registration) return;
  for (let attempt = 0; attempt < 20; attempt++) {
    const worker = registration.active;
    if (worker) {
      const channel = new MessageChannel();
      const answered = new Promise<boolean>(answer => {
        channel.port1.onmessage = () => answer(true);
        setTimeout(() => answer(false), 1500);
      });
      worker.postMessage({ type: "stale", engine: CUBIX_WORKER }, [channel.port2]);
      if (await answered) return;
    }
    await registration.update().catch(() => {});
  }
}
// The service worker asks which engine each tab runs (see `stale`).
navigator.serviceWorker?.addEventListener("message", ({ data, ports }) => {
  if (data?.type === "engine?") ports[0]?.postMessage({ engine: CUBIX_WORKER });
});
type Port = { postMessage(message: unknown): void };
/** Every tab shares one engine in a shared worker where the browser has them. */
const shared = typeof SharedWorker !== "undefined";
const worker = (async () => {
  if (!shared) await exclusive();
  const legacy = desktop ? await desktop.legacyStorage().catch(() => null) : null;
  const { promise: started, resolve, reject } = Promise.withResolvers<Port>();
  let port: Port, ready = false;
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
      ready = true;
      if (data.value.imported) void desktop?.legacyImported();
      if (data.value.displaced) void stale();
      resolve(port);
    } else if (data.event === "failed") reject(new Error(data.value));
    else if (data.event === "replaced") replaced(ready);
    else for (const listener of listeners) listener(data);
  };
  const stopped = (event: Event) => {
    stop(new Error("The data engine stopped. Reload Cubix."));
    reject(failure);
    for (const listener of listeners) listener({ event: "error", value: failure!.message });
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
    terminate = () => engine.terminate();
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
