import type { PhaseId } from "../../src/client/lib/solveAnalysis";

/**
 * The steps' colours: from the theme's neutral grey for the cross toward its primary colour, whole for the PLL, so the
 * bar fills toward the solved cube in the accent the player chose, in the light theme as in the dark one.
 */
export const STEPS: PhaseId[] = ["cross", "f2l1", "f2l2", "f2l3", "f2l4", "oll", "pll"];
const RAMP = [12, 28, 42, 56, 70, 85, 100];
export const stepColour = (id: PhaseId) => `color-mix(in oklch, var(--primary) ${RAMP[STEPS.indexOf(id)]}%, var(--muted-foreground))`;
