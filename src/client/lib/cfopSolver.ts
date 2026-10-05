/**
 * A CFOP solution as a solver would turn it, for the virtual cube of development to play realistic solves: the
 * optimal cross on the bottom, each F2L pair with the catalogue's algorithm for its case (a pair stuck in another slot
 * is taken out first), then the catalogue's OLL and PLL. The cube is held yellow on top, green in front; the
 * solution turns faces and the whole cube, nothing else, as a smart cube reports a solve (see `playable`).
 */
import { applyAlg, compensateAuf, type CubeState } from "../../shared/cube";
import { allDone, AUF, casesOf, colours, cornersPermuted, cpKey, crossDone, edgesOriented, eoKey, f2lDone, ollKey, optimalCross, pairKey, pairsDone, playable, pllKey, topDone, turnWhole, type CatalogCase, type Known } from "./solveAnalysis";

export interface SolveStep {
  label: string;
  alg: string;
}

const length = (alg: string) => alg.split(/\s+/).filter((t) => t && !/^[xyz]/.test(t)).length;
/** Where a slot is, seen after each y rotation: the rotation that brings it to the front right. */
const TO_FRONT_RIGHT: Record<string, string> = { FR: "", FL: "y'", BL: "y2", BR: "y" };
/** Takes a pair out of the front-right slot. */
const TAKE_OUT = "R U R'";

/** The shortest of the case's playable algorithms that does `done`, from `state`, after `prefix`. */
function bestFor(state: CubeState, match: Known | undefined, prefix: string, done: (state: CubeState) => boolean, ending = false) {
  let best: string | null = null;
  for (const { alg } of match?.case.algorithms ?? []) {
    const ok = playable(alg);
    if (!ok) continue;
    let full = [prefix, compensateAuf(ok, AUF[match!.auf]!)].filter(Boolean).join(" ");
    if (ending) {
      const auf = AUF.find((u) => allDone(colours(applyAlg(state, [full, u].filter(Boolean).join(" ")))));
      if (auf === undefined) continue;
      full = [full, auf].filter(Boolean).join(" ");
    }
    if (done(applyAlg(state, full)) && (!best || length(full) < length(best))) best = full;
  }
  return best;
}

/** `twoLook`: the last layer as a beginner does it, OLL edges then corners, PLL corners then edges. */
export function solveCfop(start: CubeState, cases: CatalogCase[], { twoLook = false } = {}): SolveStep[] | null {
  const known = casesOf(cases),
    steps: SolveStep[] = [];
  let state = start;
  const turn = (label: string, alg: string) => {
    if (!alg) return;
    state = applyAlg(state, alg);
    steps.push({ label, alg });
  };
  turn("Cross", optimalCross(colours(state)).join(" "));
  for (let pair = 1, guard = 0; pair <= 4 && guard < 12; guard++) {
    const before = pairsDone(colours(state)).length;
    if (before >= pair) {
      pair = before + 1;
      continue;
    }
    // Every unsolved slot brought to the front right: the shortest insertion the catalogue knows.
    let best: string | null = null;
    for (const [slot, y] of Object.entries(TO_FRONT_RIGHT)) {
      if (pairsDone(colours(state)).includes(slot)) continue;
      const turned = turnWhole(state, y ? [y] : []);
      const alg = bestFor(state, known.f2l.get(pairKey(colours(turned))), y, (after) => {
        const c = colours(after);
        return crossDone(c) && pairsDone(c).length > before;
      });
      if (alg && (!best || length(alg) < length(best))) best = alg;
    }
    if (best) {
      turn(`F2L ${pair}`, best);
      continue;
    }
    // No unsolved pair is in reach: empty an unsolved slot (another one each time) to free the pieces stuck in it.
    const open = Object.keys(TO_FRONT_RIGHT).filter((slot) => !pairsDone(colours(state)).includes(slot)),
      stuck = open[guard % open.length];
    if (!stuck) break;
    const y = TO_FRONT_RIGHT[stuck]!;
    state = applyAlg(state, [y, TAKE_OUT].filter(Boolean).join(" "));
    steps.push({ label: `F2L ${pair}`, alg: [y, TAKE_OUT].filter(Boolean).join(" ") });
  }
  if (!f2lDone(colours(state))) return null;
  const ollDone = (after: CubeState) => f2lDone(colours(after)) && topDone(colours(after));
  if (twoLook && !edgesOriented(colours(state))) {
    const alg = bestFor(state, known.eo.get(eoKey(colours(state))), "", (after) => f2lDone(colours(after)) && edgesOriented(colours(after)));
    if (!alg) return null;
    turn("OLL edges", alg);
  }
  if (twoLook && !topDone(colours(state))) {
    const alg = bestFor(state, known.co.get(ollKey(colours(state))), "", ollDone);
    if (!alg) return null;
    turn("OLL corners", alg);
  }
  if (twoLook && !cornersPermuted(colours(state))) {
    const alg = bestFor(state, known.cp.get(cpKey(colours(state))), "", (after) => ollDone(after) && cornersPermuted(colours(after)));
    if (!alg) return null;
    turn("PLL corners", alg);
  }
  if (!topDone(colours(state))) {
    const alg = bestFor(state, known.oll.get(ollKey(colours(state))), "", ollDone);
    if (!alg) return null;
    turn("OLL", alg);
  }
  if (!allDone(colours(state))) {
    const alg =
      bestFor(state, known.pll.get(pllKey(colours(state))), "", (after) => allDone(colours(after)), true) ??
      AUF.find((u) => u && allDone(colours(applyAlg(state, u))));
    if (!alg) return null;
    turn("PLL", alg);
  }
  return allDone(colours(state)) ? steps : null;
}
