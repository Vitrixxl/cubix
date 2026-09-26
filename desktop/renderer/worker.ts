/// <reference lib="webworker" />
/** The data engine of the web app, off the main thread so the timer never waits for statistics. */
import { createEngine, type EngineRequest } from "../engine/core";
import { cubingScrambleEngine } from "../../src/client/lib/cubingScrambleEngine";
import { openStorage } from "./idbStorage";

const scope = self as unknown as DedicatedWorkerGlobalScope;
declare const CUBIX_VENDOR: string;
// cubing.js is served as separate modules: its scramblers start their own workers from them.
const scrambles = cubingScrambleEngine(name => import(new URL(`${CUBIX_VENDOR}/${name}/index.js`, scope.location.origin).href));
let engine: ReturnType<typeof createEngine> | undefined;
scope.onmessage = async ({ data }: MessageEvent<{ type: "start"; legacy: Record<string, string> | null } | EngineRequest>) => {
  if ("id" in data) { engine?.request(data); return; }
  try {
    const storage = await openStorage(value => scope.postMessage({ event: "error", value }));
    // The desktop app kept its data in a file before it became this web app: bring it in once.
    const imported = !!data.legacy && Object.keys(storage.all()).length === 0;
    if (imported) await storage.importAll(data.legacy!);
    engine = createEngine({ origin: scope.location.origin, storage, scrambles, emit: message => scope.postMessage(message) });
    scope.postMessage({ event: "started", value: { imported } });
  } catch (error) {
    scope.postMessage({ event: "failed", value: (error as Error)?.message ?? String(error) });
  }
};
