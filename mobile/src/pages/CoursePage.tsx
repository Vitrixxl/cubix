import { useAtom, useSetAtom } from "jotai";
import { Bluetooth, Boxes, Check, ChevronLeft, ChevronRight, Menu, Route as RouteIcon } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { courseChapters, courseEntry, courseLessons, goToLesson } from "../../../src/client/lib/course";
import { smartCube } from "../../../src/client/lib/smartCube";
import { applyAlg, solved } from "../../../src/shared/cube";
import { viewForMask } from "../../../src/shared/cubeDiagram";
import type { LessonPage } from "../../../src/shared/lessons";
import type { SolvingMethod } from "../../../src/shared/methods";
import { puzzleInfo, type PuzzleId } from "../../../src/shared/puzzles";
import { said, tr } from "../../../src/client/i18n";
import { PushedBar } from "../components/AppBar";
import { PlayerControls, PlayerCube, useAlgPlayer } from "../components/AlgPlayer";
import { Alg, Numeric } from "../components/layout";
import { Sheet } from "../components/Sheet";
import { StaticCubeSvg } from "../components/StaticCubeSvg";
import { useSmartCubeOn } from "../hooks/useSmartCube";
import { unlockPuzzleAtom } from "../journey";
import { courseProgressAtom, goBackAtom, routeAtom } from "../state";

/** A method's course from zero, one page at a time: as the web's (desktop/renderer/MethodCourse.tsx), under Algorithms. */
export function CoursePage({ puzzle, method }: { puzzle: PuzzleId; method: SolvingMethod }) {
  const [progress, setProgress] = useAtom(courseProgressAtom),
    chapters = useMemo(() => courseChapters(puzzle, method), [puzzle, method]),
    lessons = useMemo(() => courseLessons(chapters), [chapters]),
    entry = courseEntry(progress, puzzle, method.id),
    done = entry.done ?? [],
    [at, setAt] = useState(() => Math.min(entry.lesson ?? 0, lessons.length - 1)),
    [page, setPage] = useState(0),
    [list, setList] = useState(false),
    current = lessons[at]!,
    shown = current.lesson.pages[page]!,
    setRoute = useSetAtom(routeAtom),
    unlock = useSetAtom(unlockPuzzleAtom),
    goBack = useSetAtom(goBackAtom);
  const go = (index: number, finished?: string) => {
    setAt(index);
    setPage(0);
    setList(false);
    setProgress(goToLesson(progress, puzzle, method.id, index, finished));
  };
  const next = () => {
    if (page + 1 < current.lesson.pages.length) return setPage(page + 1);
    if (at + 1 < lessons.length) go(at + 1, current.key);
    else {
      setProgress(goToLesson(progress, puzzle, method.id, at, current.key));
      void unlock(method.id);
      goBack();
    }
  };
  const back = page ? () => setPage(page - 1) : at ? () => go(at - 1) : undefined;
  return <View className="flex-1">
    <PushedBar title={said(method.name)} sub={tr("{0} of {1} lessons", { 0: done.length, 1: lessons.length })}>
      <Pressable onPress={() => setList(true)} accessibilityRole="button" accessibilityLabel={tr("Lessons")} className="size-11 items-center justify-center rounded-full active:bg-muted"><Icon as={Menu} size={21} /></Pressable>
    </PushedBar>
    <PageView key={`${at}:${page}`} puzzle={puzzle} page={shown} lesson={said(current.lesson.title)} index={page} count={current.lesson.pages.length} back={back} next={next}
      onSets={set => setRoute({ page: "algorithms", set })} onOwnCube={() => setRoute({ page: "assisted", method: method.id })} />
    <Sheet open={list} onClose={() => setList(false)} title={tr("Lessons")} scroll contentClassName="gap-4 px-3">
      {chapters.map(chapter => <View key={chapter.id} className="gap-0.5">
        <Text className="px-2 pb-1 text-[13px] font-bold text-muted-foreground">{said(chapter.title)}</Text>
        {chapter.lessons.map(lesson => {
          const index = lessons.findIndex(l => l.lesson === lesson), complete = done.includes(lessons[index]!.key);
          return <Pressable key={lesson.id} onPress={() => go(index)} accessibilityRole="button" accessibilityState={{ selected: index === at }} className={cn("min-h-12 flex-row items-center gap-3 rounded-xl px-2", index === at ? "bg-accent" : "active:bg-muted/60")}>
            <View className={cn("size-6 items-center justify-center rounded-md", complete ? "bg-success" : index === at ? "bg-primary" : "bg-muted")}>
              {complete ? <Icon as={Check} size={14} strokeWidth={3} className="text-background" /> : <Numeric className={cn("text-xs font-bold", index === at ? "text-primary-foreground" : "text-muted-foreground")}>{index + 1}</Numeric>}
            </View>
            <Text numberOfLines={1} className="min-w-0 flex-1 text-[15px] font-semibold">{said(lesson.title)}</Text>
          </Pressable>;
        })}
      </View>)}
    </Sheet>
  </View>;
}

function Visual({ puzzle, page }: { puzzle: PuzzleId; page: LessonPage }) {
  const cube = puzzleInfo(puzzle).cubeSize, alg = page.alg ?? page.task ?? "",
    player = useAlgPlayer(alg, alg ? cube : null, page.mask, page.algSetup ? { setup: page.algSetup } : {});
  if (player) return <><PlayerCube player={player} size={190} /><PlayerControls player={player} className="w-full" /></>;
  if (page.picture && cube) {
    const mask = page.picture.mask ?? "full";
    return <StaticCubeSvg state={applyAlg(solved(cube), page.picture.setup ?? "")} size={180} mask={mask} view={viewForMask(mask)} held={page.picture.held} />;
  }
  return alg ? <Alg text={alg} size={20} /> : null;
}

function PageView({ puzzle, page, lesson, index, count, back, next, onSets, onOwnCube }: { puzzle: PuzzleId; page: LessonPage; lesson: string; index: number; count: number; back?: () => void; next: () => void; onSets: (set: string) => void; onOwnCube: () => void }) {
  const [picked, setPicked] = useState<number | null>(null),
    [verified, setVerified] = useState(false),
    link = useSmartCubeOn(),
    quiz = page.quiz,
    right = !!quiz && picked === quiz.answer,
    blocked = !!quiz && !right;
  useEffect(() => {
    if (!page.task || !link) return;
    let target: string;
    try { target = applyAlg(smartCube.snapshot.state, page.task).join(); } catch { return; }
    return smartCube.subscribe(() => { if (smartCube.snapshot.state.join() === target) setVerified(true); });
  }, [page.task, link]);
  const visual = page.alg || page.task || page.picture;
  const secondary = (icon: typeof Boxes, label: string, onPress: () => void) => <Pressable onPress={onPress} accessibilityRole="button" className="h-12 flex-row items-center justify-center gap-2 self-start rounded-2xl bg-muted px-4 active:bg-muted/70">
    <Icon as={icon} size={18} className="text-foreground" /><Text className="text-base font-bold">{label}</Text>
  </Pressable>;
  return <View className="min-h-0 flex-1 gap-3 px-4 pb-3">
    <ScrollView className="min-h-0 flex-1" contentContainerClassName="gap-4 pb-2">
      {visual ? <View className="items-center gap-3 rounded-3xl bg-card p-3"><Visual puzzle={puzzle} page={page} /></View> : null}
      <View className="gap-1">
        <Text className="text-[13px] font-bold text-primary">{lesson}</Text>
        <Text accessibilityRole="header" className="text-[26px] font-extrabold tracking-[-0.03em]">{said(page.title)}</Text>
      </View>
      {page.text ? <Text className="text-[15px] leading-relaxed text-muted-foreground">{said(page.text)}</Text> : null}
      {page.points?.map(point => <View key={point} className="flex-row gap-2.5"><Icon as={Check} size={15} strokeWidth={3} className="mt-1 text-primary" /><Text className="min-w-0 flex-1 text-sm leading-relaxed">{said(point)}</Text></View>)}
      {page.task ? <View className="gap-2 rounded-2xl bg-muted px-4 py-3">
        <Alg text={page.task} size={17} />
        {link ? <View accessibilityLiveRegion="polite" className="flex-row items-center gap-2"><Icon as={Bluetooth} size={14} className={verified ? "text-success" : "text-muted-foreground"} /><Text className={cn("text-[13px] font-semibold", verified ? "text-success" : "text-muted-foreground")}>{verified ? tr("Your cube confirms it") : tr("Your cube is following")}</Text></View> : null}
      </View> : null}
      {page.sets?.length ? secondary(Boxes, tr("See the cases"), () => onSets(page.sets![0]!)) : null}
      {page.ownCube ? secondary(RouteIcon, tr("My cube"), onOwnCube) : null}
      {quiz ? <View className="gap-2">
        <Text className="text-sm font-bold">{said(quiz.question)}</Text>
        {quiz.options.map((option, i) => <Pressable key={option} onPress={() => setPicked(i)} accessibilityRole="button" accessibilityState={{ selected: picked === i }} className={cn("min-h-12 justify-center rounded-2xl px-4 py-2.5", picked === i ? (i === quiz.answer ? "bg-success/15" : "bg-destructive/12") : "bg-muted active:bg-muted/70")}>
          <Text className={cn("text-sm font-semibold", picked === i && (i === quiz.answer ? "text-success" : "text-destructive"))}>{said(option)}</Text>
        </Pressable>)}
        {picked !== null ? <Text accessibilityLiveRegion="polite" className={cn("pt-1 text-sm", right ? "text-success" : "text-muted-foreground")}>{right ? said(quiz.explain) : tr("Not quite: look again.")}</Text> : null}
      </View> : null}
    </ScrollView>
    <View className="flex-row items-center gap-2">
      <Pressable onPress={back} disabled={!back} accessibilityRole="button" accessibilityLabel={tr("Back")} className={cn("size-12 items-center justify-center rounded-2xl bg-muted", !back && "opacity-40")}><Icon as={ChevronLeft} size={20} /></Pressable>
      <Numeric className="text-[13px] font-semibold text-muted-foreground">{index + 1} / {count}</Numeric>
      <Pressable onPress={next} disabled={blocked} accessibilityRole="button" className={cn("ml-auto h-12 flex-row items-center gap-2 rounded-2xl bg-primary px-5 active:bg-primary/85", blocked && "opacity-45")}>
        <Text className="text-base font-bold text-primary-foreground">{page.task && !verified ? tr("It's done") : tr("Next")}</Text>
        <Icon as={ChevronRight} size={18} className="text-primary-foreground" />
      </Pressable>
    </View>
  </View>;
}
