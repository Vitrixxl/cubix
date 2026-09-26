import type { PracticeContext } from "../../src/shared/puzzles";
import { loadVendor } from "./cubing";
import { generatePracticeScramble as generate, type ScrambleEngine } from "../../src/client/lib/practiceScrambleCore";
import { cubingScrambleEngine } from "../../src/client/lib/cubingScrambleEngine";

/** The Bun engine runs cubing.js from the packaged module tree in Bun workers. */
export const desktopEngine: ScrambleEngine = cubingScrambleEngine(loadVendor);
export const generatePracticeScramble = (context: PracticeContext, engine: ScrambleEngine = desktopEngine) => generate(context, engine);
