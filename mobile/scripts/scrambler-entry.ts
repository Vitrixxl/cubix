// Runs inside the hidden WebView. Bundled by scripts/build-scrambler.ts.
// @ts-ignore: bundled JavaScript without type declarations
import { setIsInsideWorker } from "../../node_modules/cubing/dist/lib/cubing/chunks/chunk-XVZLWT3A.js";
// @ts-ignore: bundled JavaScript without type declarations
import "../../node_modules/cubing/dist/lib/cubing/chunks/inside-VUJSPBRA.js";
// @ts-ignore: bundled JavaScript without type declarations
import { KPattern } from "../../node_modules/cubing/dist/lib/cubing/kpuzzle/index.js";
// @ts-ignore: bundled JavaScript without type declarations
import { puzzles } from "../../node_modules/cubing/dist/lib/cubing/puzzles/index.js";

declare global {
  // eslint-disable-next-line no-var
  var __cubixInside: {
    randomScrambleStringForEvent(event: string): Promise<string>;
    random333Pattern?(): Promise<unknown>;
    solve333ToString(patternData: unknown): Promise<string>;
    setScramblePrefetchLevel(level: string): Promise<void>;
  };
  interface Window { ReactNativeWebView?: { postMessage(message: string): void } }
}

setIsInsideWorker(true);
const inside = globalThis.__cubixInside;
void inside.setScramblePrefetchLevel("auto");
const post = (message: unknown) => window.ReactNativeWebView?.postMessage(JSON.stringify(message));

function evenPermutation(pieces: number[]) {
  let inversions = 0;
  pieces.forEach((a, i) => pieces.slice(i + 1).forEach(b => { if (a > b) inversions++; }));
  if (inversions % 2) [pieces[0], pieces[1]] = [pieces[1], pieces[0]];
}
function invert(alg: string): string {
  return alg.trim().split(/\s+/).filter(Boolean).reverse().map(token => token.endsWith("2") ? token : token.endsWith("'") ? token.slice(0, -1) : token + "'").join(" ");
}
async function orbitScramble(orbit: "EDGES" | "CORNERS"): Promise<string> {
  const kpuzzle = await puzzles["3x3x3"].kpuzzle();
  const solvedData = kpuzzle.defaultPattern().patternData;
  // A random scramble of the whole cube, then reset the other orbit and the centres.
  const scramble = await inside.randomScrambleStringForEvent("333");
  const data = structuredClone(kpuzzle.defaultPattern().applyAlg(scramble).patternData);
  const other = orbit === "EDGES" ? "CORNERS" : "EDGES";
  data[other] = structuredClone(solvedData[other]);
  data.CENTERS = structuredClone(solvedData.CENTERS);
  evenPermutation(data[orbit].pieces);
  const solution = await inside.solve333ToString(new KPattern(kpuzzle, data).patternData);
  return invert(solution);
}

const handlers: Record<string, (payload: any) => Promise<string>> = {
  event: ({ event }) => inside.randomScrambleStringForEvent(event),
  orbit: ({ orbit }) => orbitScramble(orbit),
};
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
post({ ready: true });
