// Runs inside the hidden WebView (and as a worker on the web). Bundled by scripts/build-scrambler.ts.
import { wasmScrambleEngine } from "../../src/client/lib/wasmScrambleEngine";
import { crossSolutions } from "../../src/shared/crossTraining";
import { startMetronome } from "../../src/client/lib/metronome";

/** The scrambler's WebAssembly module (scrambler/), inlined in base64: the page has no origin to load it from. */
declare const CUBIX_SCRAMBLER_WASM: string;
declare global {
  interface Window { ReactNativeWebView?: { postMessage(message: string): void } }
}

const engine = wasmScrambleEngine(async () => Uint8Array.from(atob(CUBIX_SCRAMBLER_WASM), c => c.charCodeAt(0)));
const post = (message: unknown) => window.ReactNativeWebView?.postMessage(JSON.stringify(message));

const handlers: Record<string, (payload: any) => Promise<string>> = {
  event: ({ event }) => engine.randomScrambleForEvent(event),
  orbit: ({ orbit }) => engine.orbitScramble(orbit),
  pattern: ({ pattern }) => engine.patternScramble(pattern),
  // Optimal cross, XCross or XXCross solutions: a depth-first search too slow for the app's JS thread.
  crossSolutions: async ({ scramble, target }) => JSON.stringify(crossSolutions(scramble, target)),
  // The timer's metronome (src/client/lib/metronome): Hermes has no Web Audio, this page has. 0 stops it.
  metronome: async ({ bpm }) => {
    stopMetronome();
    stopMetronome = startMetronome(bpm);
    return "";
  },
};
let stopMetronome = () => {};
window.addEventListener("message", event => void handle(event.data));
document.addEventListener("message", event => void handle((event as MessageEvent).data));
async function handle(raw: unknown) {
  let request: { id: number; kind: string; payload: unknown };
  try { request = typeof raw === "string" ? JSON.parse(raw) : raw as typeof request; } catch { return; }
  if (!request || typeof request.id !== "number") return;
  try {
    const value = await handlers[request.kind](request.payload);
    post({ id: request.id, value });
  } catch (error) {
    post({ id: request.id, error: (error as Error).message ?? String(error) });
  }
}
// The tables are built while the app starts, before the first scramble is asked for.
void engine.warm().finally(() => post({ ready: true }));
