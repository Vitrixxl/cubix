import type { PhaseId } from "../../src/client/lib/solveAnalysis";

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
