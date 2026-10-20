import type { ScrambleEngine } from "../../../src/client/lib/practiceScrambleCore";
import { msg } from "../../../src/client/i18n/msg";
import type { CrossTarget } from "../../../src/shared/crossTraining";

/**
 * The browser's scrambler: the page the phone runs in a hidden WebView (index.tsx), run as a worker instead
 * (public/scrambler.js, written by scripts/build-scrambler.ts), off the page's thread. A worker that fails is
 * started again at the next request.
 */
type Pending = { resolve: (value: string) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
const pending = new Map<number, Pending>();
let nextId = 1;
let worker: Worker | null = null;

function fail(error: Error) {
  worker?.terminate();
  worker = null;
  for (const [id, entry] of pending) { clearTimeout(entry.timer); pending.delete(id); entry.reject(error); }
}
function start() {
  const started = new Worker(`${process.env.EXPO_BASE_URL ?? ""}/scrambler.js`);
  started.onmessage = ({ data }: MessageEvent<string>) => {
    let message: { id?: number; value?: string; error?: string };
    try { message = JSON.parse(data); } catch { return; }
    const entry = typeof message.id === "number" ? pending.get(message.id) : undefined;
    if (!entry) return;
    pending.delete(message.id!); clearTimeout(entry.timer);
    if (typeof message.value === "string") entry.resolve(message.value); else entry.reject(new Error(message.error || msg("The scramble generator failed.")));
  };
  started.onerror = () => fail(new Error(msg("The scramble generator restarted. Please try again.")));
  return started;
}
function send(kind: string, payload: unknown, timeoutMs = 30000): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(msg("The scramble generator did not respond. Please try again."))); }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    (worker ??= start()).postMessage(JSON.stringify({ id, kind, payload }));
  });
}
export const nativeEngine: ScrambleEngine = {
  randomScrambleForEvent: event => send("event", { event }),
  orbitScramble: orbit => send("orbit", { orbit }),
  patternScramble: pattern => send("pattern", { pattern }),
  seededScramble: (event, seed) => send("seeded", { event, seed }),
};
/** The timer's metronome: the page's own Web Audio (a worker has none). */
export { startMetronome as metronome } from "../../../src/client/lib/metronome";
export type CrossSolution = { moves: string; slot: string };
export async function crossSolutions(scramble: string, target: CrossTarget): Promise<CrossSolution[]> {
  return JSON.parse(await send("crossSolutions", { scramble, target }, 60000)) as CrossSolution[];
}
/** Nothing to mount in the browser: the worker starts with the first request. */
export const ScramblerHost = () => null;
