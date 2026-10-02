import { useAtomValue, useSetAtom } from "jotai";
import type { ReactNode } from "react";
import { View } from "react-native";
import { isLockedPage, puzzleLockedAtom, skipLearningAtom } from "../journey";
import { replaceRouteAtom } from "../state";
import { PageHead, Segmented } from "./layout";
import { SessionButton } from "./PuzzlePicker";

/**
 * The head of the Learn tab's two parts: its title and the puzzle, then the switch between the courses (a method step
 * by step) and the algorithm library. The library waits for the puzzle's course like the timer: greyed, a tap offers
 * to skip it.
 */
export function LearnHeader({ part, children }: { part: "learn" | "algorithms"; children?: ReactNode }) {
  const replace = useSetAtom(replaceRouteAtom), skip = useSetAtom(skipLearningAtom);
  const locked = isLockedPage(useAtomValue(puzzleLockedAtom), "algorithms");
  return <View className="gap-3">
    <PageHead title="Learn">{children}<SessionButton /></PageHead>
    <Segmented label="Learn" value={part} onChange={next => next === "algorithms" && locked ? skip("algorithms") : replace({ page: next })}
      options={[{ id: "learn", label: "Courses" }, { id: "algorithms", label: "Algorithms", locked }]} />
  </View>;
}
