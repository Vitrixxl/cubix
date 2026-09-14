import { memo } from "react";
import { View } from "react-native";
import type { CaseDto } from "../../../src/shared/types";
import { StaticCubeSvg } from "./StaticCubeSvg";
import { caseState, maskForStage } from "../lib/caseState";
import { CASE_DIAGRAMS } from "./caseDiagrams";

/** Every catalogue surface uses the same puzzle-specific case diagram. */
export const CaseDiagram = memo(function CaseDiagram({ c, size = 102, grey }: { c: CaseDto; size?: number; grey?: boolean }) {
  if (c.diagram) {
    const Diagram = CASE_DIAGRAMS[c.diagram];
    if (Diagram) return <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center", opacity: grey ? 0.5 : 1 }}><Diagram width={size} height={size} /></View>;
    return <View style={{ width: size, height: size }} />;
  }
  return <StaticCubeSvg state={caseState(c)} size={size} mask={maskForStage(c.stage)} />;
});
