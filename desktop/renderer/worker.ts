/// <reference lib="webworker" />
/** The data engine of the web app, off the main thread so the timer never waits for statistics. Started as a shared
 * worker, one engine serves every tab of the app, which see each other's changes; browsers without shared workers
 * run it as a dedicated worker of a single tab. */
import { createEngine, type EngineMessage, type EngineRequest } from "../engine/core";
import { cubingScrambleEngine } from "../../src/client/lib/cubingScrambleEngine";
import type { ScrambleEngine } from "../../src/client/lib/practiceScrambleCore";
import { openStorage } from "./idbStorage";

type Port = { postMessage(message: unknown): void; onmessage: ((event: MessageEvent) => void) | null };
type Start = { type: "start"; legacy: Record<string, string> | null };
declare const CUBIX_VENDOR: string;
const scope = self as unknown as WorkerGlobalScope & typeof globalThis;
const shared = "onconnect" in scope;
/** Requests that change data: the other tabs refresh once they are done. */
const MUTATIONS = new Set(["addSolve", "deleteSolve", "setPenalty", "setComment", "setLearned", "setLearningGroupOrder", "createSession", "duelRecord", "login", "register", "logout"]);
const ports = new Set<Port>();
/** Requests in flight: the engine numbers them itself, each tab gets its answer under its own number. */
const owners = new Map<number, { port: Port; id: number; method: string }>();
let sequence = 0;
let engine: ReturnType<typeof createEngine> | undefined;
let starting: Promise<{ imported: boolean }> | undefined;

/** The tab that asked last: it draws the scrambles the engine needs. */
let active: Port | undefined;
const drawing = new Map<number, { port: Port; resolve: (value: string) => void; reject: (error: Error) => void }>();
let drawn = 0;
function draw(method: keyof ScrambleEngine, args: unknown[]) {
  return new Promise<string>((resolve, reject) => {
    const port = active ?? [...ports].at(-1);
    if (!port) return reject(new Error("No open tab can draw scrambles."));
    const id = ++drawn;
    drawing.set(id, { port, resolve, reject });
    port.postMessage({ scramble: id, method, args });
    setTimeout(() => { if (drawing.delete(id)) reject(new Error("The scramble took too long. Try again.")); }, 60000);
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
/** One engine per origin. A tab of an older version keeps its own until it closes: wait for it, saying so. */
async function exclusive() {
  if (!shared || !navigator.locks) return;
  const forever = () => new Promise<never>(() => {});
  const free = await new Promise<boolean>(answer =>
    void navigator.locks.request("cubix-engine", { ifAvailable: true }, lock => { answer(!!lock); return lock ? forever() : undefined; }));
  if (free) return;
  broadcast({ event: "blocked" });
  await new Promise<void>(granted => void navigator.locks.request("cubix-engine", () => { granted(); return forever(); }));
}
function start({ legacy }: Start) {
  return (starting ??= (async () => {
    await exclusive();
    const storage = await openStorage(value => broadcast({ event: "error", value }));
    // The desktop app kept its data in a file before it became this web app: bring it in once.
    const imported = !!legacy && Object.keys(storage.all()).length === 0;
    if (imported) await storage.importAll(legacy!);
    engine = createEngine({ origin: scope.location.origin, storage, scrambles, emit: route });
    return { imported };
  })());
}
function connect(port: Port) {
  ports.add(port);
  port.onmessage = async ({ data }: MessageEvent<Start | EngineRequest | { type: "close" } | { scrambled: number; value?: string; error?: string }>) => {
    if ("scrambled" in data) {
      const call = drawing.get(data.scrambled);
      drawing.delete(data.scrambled);
      if (data.error !== undefined) call?.reject(new Error(data.error));
      else call?.resolve(data.value!);
    } else if ("id" in data) {
      active = port;
      const id = ++sequence;
      owners.set(id, { port, id: data.id, method: data.method });
      engine?.request({ ...data, id });
    } else if (data.type === "close") {
      ports.delete(port);
      if (active === port) active = undefined;
      for (const [id, call] of drawing) if (call.port === port) { drawing.delete(id); call.reject(new Error("The tab drawing the scramble closed.")); }
    }
    else if (data.type === "start") {
      try {
        port.postMessage({ event: "started", value: await start(data) });
      } catch (error) {
        starting = undefined;
        port.postMessage({ event: "failed", value: (error as Error)?.message ?? String(error) });
      }
    }
  };
}
if (shared) (scope as unknown as SharedWorkerGlobalScope).onconnect = ({ ports: [port] }) => connect(port!);
else connect(scope as unknown as Port);
