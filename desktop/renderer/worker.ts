/// <reference lib="webworker" />
/** The data engine of the web app, off the main thread so the timer never waits for statistics. Started as a shared
 * worker, one engine serves every tab of the app, which see each other's changes; browsers without shared workers
 * run it as a dedicated worker of a single tab. */
import { createEngine, type EngineMessage, type EngineRequest } from "../engine/core";
import { cubingScrambleEngine } from "../../src/client/lib/cubingScrambleEngine";
import type { ScrambleEngine } from "../../src/client/lib/practiceScrambleCore";
import { openStorage } from "./idbStorage";
import type { LiveMessage } from "../../src/client/live";

type Port = { postMessage(message: unknown): void; onmessage: ((event: MessageEvent) => void) | null };
type Start = { type: "start"; legacy: Record<string, string> | null };
declare const CUBIX_VENDOR: string;
const scope = self as unknown as WorkerGlobalScope & typeof globalThis;
const shared = "onconnect" in scope;
/** Requests that change data: the other tabs refresh once they are done. */
const MUTATIONS = new Set(["deleteAccount", "addSolve", "importSolves", "deleteSolve", "setPenalty", "setComment", "setSolution", "setLearned", "setLearningGroupOrder", "createSession", "renameSession", "duelRecord", "login", "register", "logout"]);
const ports = new Set<Port>();
/** Requests in flight: the engine numbers them itself, each tab gets its answer under its own number. */
const owners = new Map<number, { port: Port; id: number; method: string }>();
let sequence = 0;
let engine: ReturnType<typeof createEngine> | undefined;
let starting: Promise<{ imported: boolean; displaced: boolean }> | undefined;

/** The tab that asked last: it draws the scrambles the engine needs. */
let active: Port | undefined;
const drawing = new Map<number, { port: Port; resolve: (value: string) => void; reject: (error: Error) => void }>();
let drawn = 0;
function draw(method: keyof ScrambleEngine, args: unknown[], tried = new Set<Port>()): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const port = [active, ...[...ports].reverse()].find((p): p is Port => !!p && ports.has(p) && !tried.has(p));
    if (!port) return reject(new Error("No open tab can draw scrambles."));
    const id = ++drawn;
    drawing.set(id, { port, resolve, reject });
    port.postMessage({ scramble: id, method, args });
    // A tab that crashed never answers: another one draws it.
    setTimeout(() => {
      if (!drawing.delete(id)) return;
      tried.add(port);
      draw(method, args, tried).then(resolve, reject);
    }, 20000);
  });
}
/** cubing.js is served as separate modules: its scramblers start their own workers from them. A shared worker
 * cannot start workers, so there the tabs draw the scrambles. */
const scrambles: ScrambleEngine = shared
  ? {
      randomScrambleForEvent: (event) => draw("randomScrambleForEvent", [event]),
      orbitScramble: (orbit) => draw("orbitScramble", [orbit]),
      patternScramble: (pattern) => draw("patternScramble", [pattern]),
    }
  : cubingScrambleEngine(name => import(new URL(`${CUBIX_VENDOR}/${name}/index.js`, scope.location.origin).href));
const broadcast = (message: unknown) => { for (const port of ports) port.postMessage(message); };
function route(message: EngineMessage) {
  if (!("id" in message)) return broadcast(message);
  const owner = owners.get(message.id);
  if (!owner) return;
  owners.delete(message.id);
  owner.port.postMessage({ ...message, id: owner.id });
  if (!message.error && MUTATIONS.has(owner.method)) for (const port of ports) if (port !== owner.port) port.postMessage({ event: "changed" });
}
/**
 * One engine writes the data at a time, and a new one never waits: it takes the lock from an engine of another version
 * (left running by a tab opened before a deployment). That engine stops at once and its tabs reload onto this version;
 * tabs of versions that predate this hand-over are reloaded by the service worker (`stale` in bridge.ts and sw.ts).
 * Returns whether another engine was running.
 */
async function exclusive() {
  if (!shared || !navigator.locks) return false;
  const forever = () => new Promise<never>(() => {});
  const held = ((await navigator.locks.query()).held ?? []).some((lock) => lock.name === "cubix-engine");
  await new Promise<void>((granted) =>
    void navigator.locks.request("cubix-engine", { steal: true }, () => { granted(); return forever(); }).catch(retire));
  return held;
}
/** Replaced by a newer engine: write nothing more, answer nothing more, and send the tabs to the new version. */
let retired = false;
function retire() {
  if (retired) return;
  retired = true;
  engine?.stop();
  engine = undefined;
  frozen?.();
  broadcast({ event: "replaced" });
}
let frozen: (() => void) | undefined;
function start({ legacy }: Start) {
  return (starting ??= (async () => {
    const displaced = await exclusive();
    const storage = await openStorage(value => broadcast({ event: "error", value }));
    frozen = storage.freeze;
    if (retired) storage.freeze();
    // The desktop app kept its data in a file before it became this web app: bring it in once.
    const imported = !!legacy && Object.keys(storage.all()).length === 0;
    if (imported) await storage.importAll(legacy!);
    if (!retired) engine = createEngine({ origin: scope.location.origin, storage, scrambles, emit: route });
    return { imported, displaced };
  })());
}
function connect(port: Port) {
  ports.add(port);
  port.onmessage = async ({ data }: MessageEvent<Start | EngineRequest | { type: "close" } | { scrambled: number; value?: string; error?: string } | { socket: LiveMessage }>) => {
    if ("socket" in data) engine?.send(data.socket);
    else if ("scrambled" in data) {
      const call = drawing.get(data.scrambled);
      drawing.delete(data.scrambled);
      if (data.error !== undefined) call?.reject(new Error(data.error));
      else call?.resolve(data.value!);
    } else if ("id" in data) {
      active = port;
      const id = ++sequence;
      if (retired) return port.postMessage({ id: data.id, error: "Cubix was updated. Reloading…" });
      owners.set(id, { port, id: data.id, method: data.method });
      engine?.request({ ...data, id });
    } else if (data.type === "close") {
      ports.delete(port);
      if (active === port) active = undefined;
      for (const [id, call] of drawing) if (call.port === port) { drawing.delete(id); call.reject(new Error("The tab drawing the scramble closed.")); }
    }
    else if (data.type === "start") {
      try {
        const value = await start(data);
        port.postMessage(retired ? { event: "replaced" } : { event: "started", value: { ...value, online: engine?.online() ?? false } });
      } catch (error) {
        starting = undefined;
        port.postMessage({ event: "failed", value: (error as Error)?.message ?? String(error) });
      }
    }
  };
}
if (shared) (scope as unknown as SharedWorkerGlobalScope).onconnect = ({ ports: [port] }) => connect(port!);
else connect(scope as unknown as Port);
