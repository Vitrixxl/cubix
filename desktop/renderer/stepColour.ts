import type { PhaseId } from "../../src/client/lib/solveAnalysis";

/**
 * The steps' colours: from the theme's neutral grey for the first step toward its primary colour, whole for the last,
 * so the bar fills toward the solved cube in the accent the player chose, in the light theme as in the dark one. The
 * steps of CFOP, ZZ and Roux share one ramp, in the order of a solve.
 */
export const STEPS: PhaseId[] = ["cross", "eoline", "fb", "f2l1", "f2l2", "sb", "f2l3", "f2l4", "cmll", "oll", "lse", "pll"];
export const stepColour = (id: PhaseId) => `color-mix(in oklch, var(--primary) ${Math.round(12 + (88 * STEPS.indexOf(id)) / (STEPS.length - 1))}%, var(--muted-foreground))`;
