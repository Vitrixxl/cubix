import { getDefaultStore } from "jotai";
import type { PracticeContext } from "../../../src/shared/puzzles";
import { generatePracticeScramble as generate } from "../../../src/client/lib/practiceScrambleCore";
import { mbldCubes, numberedScrambles } from "../../../src/client/lib/wca";
import { nativeEngine } from "../scrambler";
import { mbldCubesAtom } from "../state";

/** A scramble of the context; a Multi-Blind attempt's are one for each of its cubes, numbered. */
export const generatePracticeScramble = async (context: PracticeContext) =>
  context.solveMode === "multi-blind"
    ? numberedScrambles(await Promise.all(Array.from({ length: mbldCubes(getDefaultStore().get(mbldCubesAtom)) }, () => generate(context, nativeEngine))))
    : generate(context, nativeEngine);
