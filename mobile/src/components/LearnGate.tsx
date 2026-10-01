/**
 * A puzzle the player cannot solve yet keeps to its course (as on the web): its locked sections send back to Learn,
 * picking it asks whether to learn it, and a greyed tab offers to skip the tutorial.
 */
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { GraduationCap } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { methodOf, openCourse, recommendedMethod } from "../../../src/client/lib/course";
import { puzzleInfo } from "../../../src/shared/puzzles";
import { introductionAtom, isLockedPage, learnPromptAtom, pickEventAtom, puzzleLockedAtom, skipLearningAtom, unlockPuzzleAtom } from "../journey";
import { courseProgressAtom, learnMethodAtom, puzzleAtom, replaceRouteAtom, routeAtom } from "../state";
import { Sheet } from "./Sheet";

export function LearnGate() {
  const locked = useAtomValue(puzzleLockedAtom), route = useAtomValue(routeAtom), introduction = useAtomValue(introductionAtom);
  const replace = useSetAtom(replaceRouteAtom);
  // The tour still shows every section.
  useEffect(() => {
    if (introduction !== "tour" && isLockedPage(locked, route.page)) replace({ page: "learn" });
  }, [locked, route.page, introduction, replace]);
  return <>
    <LearnPrompt />
    <SkipLearning />
  </>;
}

function Actions({ children }: { children: React.ReactNode }) {
  return <View className="gap-2 pt-2">{children}</View>;
}

/** After picking a puzzle that cannot be solved yet: start its course, unlock everything at once, or go back. */
function LearnPrompt() {
  const [from, setFrom] = useAtom(learnPromptAtom);
  const puzzle = useAtomValue(puzzleAtom), label = puzzleInfo(puzzle).label;
  const [progress, setProgress] = useAtom(courseProgressAtom);
  const setRoute = useSetAtom(routeAtom), replace = useSetAtom(replaceRouteAtom), setLearnMethod = useSetAtom(learnMethodAtom);
  const pick = useSetAtom(pickEventAtom), unlock = useSetAtom(unlockPuzzleAtom);
  const [busy, setBusy] = useState(false);
  const close = () => setFrom(null);
  const start = () => {
    close();
    const method = progress.methods[puzzle] ?? recommendedMethod(puzzle);
    if (!method || !methodOf(puzzle, method)) return;
    setProgress(openCourse(progress, puzzle, method));
    setLearnMethod(method);
    setRoute({ page: "learn", method });
  };
  const skip = async () => {
    if (!from) return;
    setBusy(true);
    try { await unlock(); replace({ page: "playground" }); close(); } finally { setBusy(false); }
  };
  const cancel = () => {
    if (!from) return;
    close();
    pick(from.event);
    // Picking the previous puzzle may ask again when it is locked too: that question is not wanted here.
    setFrom(null);
    replace({ page: from.page });
  };
  return <Sheet open={!!from} onClose={close} title={`Learn to solve the ${label}?`} description={`Learn it step by step, and the timer, algorithms, training and duels open on the ${label} once you finish. Already know it? Unlock everything now.`}>
    <Actions>
      <Button className="h-12" disabled={busy} onPress={start}><Icon as={GraduationCap} size={17} className="text-primary-foreground" /><Text>Start learning</Text></Button>
      <Button variant="outline" className="h-12" disabled={busy} onPress={() => void skip()}><Text>Unlock everything</Text></Button>
      <Button variant="ghost" className="h-12" disabled={busy} onPress={cancel}><Text>Not now</Text></Button>
    </Actions>
  </Sheet>;
}

/** A greyed tab while the puzzle's course comes first: keep learning, or skip the tutorial and open everything. */
function SkipLearning() {
  const [page, setPage] = useAtom(skipLearningAtom);
  const label = puzzleInfo(useAtomValue(puzzleAtom)).label;
  const setRoute = useSetAtom(routeAtom), unlock = useSetAtom(unlockPuzzleAtom);
  const [busy, setBusy] = useState(false);
  const skip = async () => {
    if (!page) return;
    setBusy(true);
    try { await unlock(); setRoute({ page } as never); setPage(null); } finally { setBusy(false); }
  };
  return <Sheet open={!!page} onClose={() => setPage(null)} title="Skip the tutorial?" description={`This section opens once you can solve the ${label}. Skip the tutorial if you already know how.`}>
    <Actions>
      <Button className="h-12" disabled={busy} onPress={() => void skip()}><Text>Skip the tutorial</Text></Button>
      <Button variant="ghost" className="h-12" disabled={busy} onPress={() => setPage(null)}><Text>Keep learning</Text></Button>
    </Actions>
  </Sheet>;
}
