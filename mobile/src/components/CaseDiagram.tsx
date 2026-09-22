import { memo } from "react";
import { Image, View } from "react-native";
import type { CaseDto } from "../../../src/shared/types";
import { StaticCubeSvg } from "./StaticCubeSvg";
import { caseState, maskForStage } from "../lib/caseState";
import { diagramPaths, viewForStage } from "../../../src/shared/cubeDiagram";
import { CASE_DIAGRAMS } from "./caseDiagrams";

/**
 * Every catalogue surface uses the same puzzle-specific case diagram: a bundled bitmap for the
 * non-cube puzzles (one native image node), the shared cube geometry drawn with a few SVG paths otherwise.
 */
export const CaseDiagram = memo(function CaseDiagram({ c, size = 102, grey }: { c: CaseDto; size?: number; grey?: boolean }) {
  if (c.diagram) {
    const source = CASE_DIAGRAMS[c.diagram];
    return <View style={{ width: size, height: size, opacity: grey ? 0.5 : 1 }}>
      {source && <Image source={source} resizeMode="contain" style={{ width: size, height: size }} accessibilityIgnoresInvertColors />}
    </View>;
  }
  return <StaticCubeSvg state={caseState(c)} size={size} mask={maskForStage(c.stage)} view={viewForStage(c.stage)} />;
});

const PREFETCH_SLICE = 24;
/**
 * Compute the cube state and path geometry of these cases ahead of their first appearance, a slice
 * per macrotask so the JavaScript thread stays responsive. Both are memoised, so a list scrolling
 * onto the cases later only renders. Returns a function that stops the remaining work.
 */
export function prefetchCaseDiagrams(cases: CaseDto[]): () => void {
  const pending = cases.filter(c => !c.diagram);
  let index = 0, timer: ReturnType<typeof setTimeout> | undefined;
  const step = () => {
    for (const end = Math.min(pending.length, index + PREFETCH_SLICE); index < end; index++) {
      const c = pending[index];
      diagramPaths(caseState(c), maskForStage(c.stage), viewForStage(c.stage));
    }
    if (index < pending.length) timer = setTimeout(step, 0);
  };
  timer = setTimeout(step, 0);
  return () => clearTimeout(timer);
}
