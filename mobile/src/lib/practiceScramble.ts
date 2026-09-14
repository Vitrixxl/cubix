import type { PracticeContext } from "../../../src/shared/puzzles";
import { generatePracticeScramble as generate } from "../../../src/client/lib/practiceScrambleCore";
import { nativeEngine } from "../scrambler";

export const generatePracticeScramble = (context: PracticeContext) => generate(context, nativeEngine);
