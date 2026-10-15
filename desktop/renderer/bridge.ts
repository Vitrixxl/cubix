import { toast } from "sonner";
import { tr } from "../../src/client/i18n";
import type { LiveLink } from "../../src/client/live";

declare global {
  interface Window {
    /** The engine, reachable from the console and from integration tests. */
    cubix: { call: typeof call };
  }
}
/** The engine worker's bundle, named after its content (desktop/web.ts). */
declare const CUBIX_WORKER: string;
const listeners = new Set<(event: any) => void>();
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let sequence = 0;
let failure: Error | undefined;
/** Whether the engine's socket is signed in (see `socket`). */
let online = false;

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
  stop(new Error("Qbix is open in another tab."));
  toast(tr("Qbix is open in another tab"), { id: "other-tab", duration: Infinity, action: { label: tr("Use here"), onClick: () => location.reload() } });
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
  stop(new Error("Qbix was updated. Reloading…"));
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
  const { promise: started, resolve, reject } = Promise.withResolvers<Port>();
  let port: Port, ready = false;
  const receive = ({ data }: MessageEvent) => {
    if ("id" in data) {
      const request = pending.get(data.id);
      if (!request) return;
      pending.delete(data.id);
      if (data.error) request.reject(new Error(data.error));
      else request.resolve(data.value);
    } else if (data.event === "started") {
      ready = true;
      online = data.value.online;
      if (data.value.displaced) void stale();
      resolve(port);
    } else if (data.event === "failed") reject(new Error(data.value));
    else if (data.event === "replaced") replaced(ready);
    else if (data.event === "socket" && data.value.channel === "live") {
      online = data.value.type === "ready";
      for (const listener of listeners) listener(data);
    }
    else for (const listener of listeners) listener(data);
  };
  const stopped = (event: Event) => {
    stop(new Error("The data engine stopped. Reload Qbix."));
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
  port.postMessage({ type: "start" });
  void navigator.storage?.persist?.().catch(() => false);
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
/** The app's one socket, held by the engine for every tab (src/client/live.ts): the tab's features send on it and hear
 * their channels. */
export const socket: LiveLink = {
  send(message) {
    if (!online || failure) return false;
    void worker.then((port) => port.postMessage({ socket: message }));
    return true;
  },
  on(channel, listener) {
    return onEvent((event) => {
      if (event.event === "socket" && (channel === "*" || event.value.channel === channel)) listener(event.value);
    });
  },
  connected: () => online,
};
/** Engine events (`changed`, `sync`, `live`, `error`). */
export function onEvent(callback: (event: any) => void) {
  listeners.add(callback);
  return () => { listeners.delete(callback); };
}
export function openExternal(url: string) {
  window.open(url, "_blank", "noopener");
}
