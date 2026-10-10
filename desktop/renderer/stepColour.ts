import type { PhaseId } from "../../src/client/lib/solveAnalysis";

/**
 * The steps' colours, in the order of a solve and told apart at a glance: the first block in lilac, the pairs (or the
 * second block) in mint, each pair a little fuller, the orientation in butter and the last step in the accent, so the
 * bar ends on the solved cube's colour. CFOP, ZZ and Roux share them, in the light theme as in the dark one.
 */
export const STEPS: PhaseId[] = ["cross", "eoline", "fb", "f2l1", "f2l2", "sb", "f2l3", "f2l4", "cmll", "oll", "lse", "pll"];
const COLOUR: Record<PhaseId, string> = {
  cross: "var(--lilac)",
  eoline: "var(--lilac)",
  fb: "var(--lilac)",
  f2l1: "color-mix(in oklch, var(--success) 50%, transparent)",
  f2l2: "color-mix(in oklch, var(--success) 65%, transparent)",
  f2l3: "color-mix(in oklch, var(--success) 82%, transparent)",
  f2l4: "var(--success)",
  sb: "var(--success)",
  cmll: "var(--warning)",
  oll: "var(--warning)",
  lse: "var(--primary)",
  pll: "var(--primary)",
};
export const stepColour = (id: PhaseId) => COLOUR[id];
