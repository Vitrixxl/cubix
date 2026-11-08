/**
 * A method's course over the algorithms page, from zero: the cube's basics, the method's ideas, then each of its steps,
 * one lesson at a time and one page at a time, a question answered or the turns made on the player's own cube before
 * going on. Beside each step, its cases open from the page and the player's own cube is one click away (AssistedSolve).
 */
import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Bluetooth, Boxes, Check, ChevronLeft, ChevronRight, Route, X } from "lucide-react";
import { Button as UiButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { applyAlg, solved } from "../../src/shared/cube";
import { viewForMask } from "../../src/shared/cubeDiagram";
import { puzzleInfo, type PuzzleId } from "../../src/shared/puzzles";
import type { LessonPage } from "../../src/shared/lessons";
import { courseChapters, courseEntry, courseLessons, goToLesson, methodOf } from "../../src/client/lib/course";
import { smartCube } from "../../src/client/lib/smartCube";
import { StaticCubeSvg } from "../../src/client/diagrams/StaticCubeSvg";
import { tr } from "../../src/client/i18n";
import { PlayerCube, PlayerControls, useAlgPlayer } from "./AlgPlayer";
import { store as s } from "./store";
import { Alg, FOCUS, NUMERIC, ROW, Surface, usePhone } from "./ui";
import { said } from "./base";

/** The course of the method chosen on the algorithms page, while it is open. */
export function MethodCourse() {
  const [host, setHost] = useState<Element | null>(null),
    phone = usePhone();
  useLayoutEffect(() => setHost(document.querySelector('[data-slot="app-main"]')), []);
  const puzzle = s.puzzle as PuzzleId,
    method = methodOf(puzzle, s.algsMethod);
  if (!s.courseOpen || !method) return null;
  return createPortal(
    <section aria-label={said(method.name)} className={cn("flex min-h-0 flex-col bg-background", phone || !host ? "fixed inset-0 z-50" : "absolute inset-0 z-30")}>
      <Course key={method.id} puzzle={puzzle} methodId={method.id} phone={phone} />
    </section>,
    phone || !host ? document.body : host,
  );
}

function Course({ puzzle, methodId, phone }: { puzzle: PuzzleId; methodId: string; phone: boolean }) {
  const method = methodOf(puzzle, methodId)!,
    chapters = useMemo(() => courseChapters(puzzle, method), [puzzle, method]),
    lessons = useMemo(() => courseLessons(chapters), [chapters]),
    entry = courseEntry(s.course, puzzle, methodId),
    done = entry.done ?? [],
    [at, setAt] = useState(() => Math.min(entry.lesson ?? 0, lessons.length - 1)),
    [page, setPage] = useState(0),
    current = lessons[at]!,
    shown = current.lesson.pages[page]!;
  const go = (index: number, finished?: string) => {
    setAt(index);
    setPage(0);
    s.saveCourse(goToLesson(s.course, puzzle, methodId, index, finished));
  };
  const next = () => {
    if (page + 1 < current.lesson.pages.length) return setPage(page + 1);
    if (at + 1 < lessons.length) go(at + 1, current.key);
    else {
      s.saveCourse(goToLesson(s.course, puzzle, methodId, at, current.key));
      void s.unlockPuzzle(methodId);
      void s.action("course:off");
    }
  };
  const finished = done.length,
    rail = (
      <Surface className="min-h-0 gap-4 overflow-y-auto p-3">
        {chapters.map((chapter) => (
          <section key={chapter.id} className="flex flex-col gap-0.5">
            <h3 className="px-2.5 pb-1 text-[13px] font-bold text-muted-foreground">{said(chapter.title)}</h3>
            {chapter.lessons.map((lesson) => {
              const index = lessons.findIndex((l) => l.lesson === lesson),
                complete = done.includes(lessons[index]!.key);
              return (
                <button key={lesson.id} type="button" aria-current={index === at ? "step" : undefined} data-action={"course:lesson:" + index} onClick={() => go(index)} className={cn(ROW, "flex w-full items-center gap-2.5 px-2.5 py-2")}>
                  <span className={cn(NUMERIC, "flex size-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold", complete ? "bg-success text-background" : index === at ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                    {complete ? <Check className="size-3" strokeWidth={3} /> : index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{said(lesson.title)}</span>
                </button>
              );
            })}
          </section>
        ))}
      </Surface>
    );
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-3 pt-[max(env(safe-area-inset-top),0.5rem)] pb-3 md:gap-4 md:px-6 md:pb-6 lg:px-9">
      <header className="flex shrink-0 items-center gap-3 md:gap-4">
        <h1 className="truncate text-lg font-extrabold tracking-[-0.02em] md:text-xl">{said(method.name)}</h1>
        <span className={cn(NUMERIC, "text-[13px] font-semibold text-muted-foreground")}>{tr("{0} of {1} lessons", { 0: finished, 1: lessons.length })}</span>
        <UiButton variant="outline" size={phone ? "icon" : "default"} className="ml-auto" data-action="course:off" onClick={() => void s.action("course:off")} aria-label={tr("Close")}>
          <X />
          {!phone && tr("Close")}
        </UiButton>
      </header>
      {phone ? (
        <PageView key={at + ":" + page} puzzle={puzzle} page={shown} lessonTitle={said(current.lesson.title)} index={page} count={current.lesson.pages.length} back={page ? () => setPage(page - 1) : at ? () => go(at - 1) : undefined} next={next} phone />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[19rem_minmax(0,1fr)] gap-4 xl:gap-5">
          {rail}
          <PageView key={at + ":" + page} puzzle={puzzle} page={shown} lessonTitle={said(current.lesson.title)} index={page} count={current.lesson.pages.length} back={page ? () => setPage(page - 1) : at ? () => go(at - 1) : undefined} next={next} phone={false} />
        </div>
      )}
    </div>
  );
}

/** The cube of a page: the turns played, else a still picture. */
function Visual({ puzzle, page, size }: { puzzle: PuzzleId; page: LessonPage; size: number }) {
  const cube = puzzleInfo(puzzle).cubeSize,
    alg = page.alg ?? page.task ?? "",
    player = useAlgPlayer(alg, alg ? cube : null, page.mask, page.algSetup ? { setup: page.algSetup } : {});
  if (player)
    return (
      <>
        <PlayerCube key={alg} player={player} size={size} />
        <PlayerControls player={player} inline className="w-full max-w-lg rounded-[16px] bg-card p-1.5" />
      </>
    );
  if (page.picture && cube) {
    const mask = page.picture.mask ?? "full";
    return <StaticCubeSvg state={applyAlg(solved(cube), page.picture.setup ?? "")} size={size} mask={mask} view={viewForMask(mask)} held={page.picture.held} />;
  }
  if (alg) return <Alg text={alg} size={22} className="justify-center text-center font-semibold" />;
  return null;
}

function PageView({ puzzle, page, lessonTitle, index, count, back, next, phone }: { puzzle: PuzzleId; page: LessonPage; lessonTitle: string; index: number; count: number; back?: () => void; next: () => void; phone: boolean }) {
  const [picked, setPicked] = useState<number | null>(null),
    [verified, setVerified] = useState(false),
    link = useSyncExternalStore(smartCube.subscribe, () => smartCube.snapshot.status, () => smartCube.snapshot.status),
    quiz = page.quiz,
    right = quiz && picked === quiz.answer,
    blocked = !!quiz && !right;
  // A connected cube says when the turns were made: the cube as it was then, those turns applied to it.
  useEffect(() => {
    if (!page.task || link !== "on") return;
    let target: string;
    try {
      target = applyAlg(smartCube.snapshot.state, page.task).join();
    } catch {
      return;
    }
    return smartCube.subscribe(() => smartCube.snapshot.state.join() === target && setVerified(true));
  }, [page.task, link]);
  const body = (
    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-bold text-primary">{lessonTitle}</span>
        <h2 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-balance">{said(page.title)}</h2>
      </div>
      {page.text && <p className="text-[15px] leading-relaxed text-muted-foreground">{said(page.text)}</p>}
      {!!page.points?.length && (
        <ul className="flex flex-col gap-2">
          {page.points.map((point) => (
            <li key={point} className="flex gap-2.5 text-sm leading-relaxed">
              <Check className="mt-1 size-3.5 shrink-0 text-primary" strokeWidth={3} aria-hidden="true" />
              {said(point)}
            </li>
          ))}
        </ul>
      )}
      {page.task && (
        <div className="flex flex-col gap-2 rounded-[18px] bg-muted px-4 py-3">
          <Alg text={page.task} size={18} className="font-semibold" />
          {link === "on" && (
            <p role="status" className={cn("flex items-center gap-2 text-[13px] font-semibold", verified ? "text-success" : "text-muted-foreground")}>
              <Bluetooth className="size-3.5" />
              {verified ? tr("Your cube confirms it") : tr("Your cube is following")}
            </p>
          )}
        </div>
      )}
      {!!page.sets?.length && (
        <UiButton variant="secondary" className="self-start" data-action="course:sets" onClick={() => { void s.action("course:off"); void s.action("set:" + page.sets![0]); }}>
          <Boxes />
          {tr("See the cases")}
        </UiButton>
      )}
      {page.ownCube && (
        <UiButton variant="secondary" className="self-start" data-action="assisted" onClick={() => void s.action("assisted")}>
          <Route />
          {tr("My cube")}
        </UiButton>
      )}
      {quiz && (
        <fieldset className="flex flex-col gap-2">
          <legend className="pb-2 text-sm font-bold">{said(quiz.question)}</legend>
          {quiz.options.map((option, i) => (
            <button
              key={option}
              type="button"
              aria-pressed={picked === i}
              onClick={() => setPicked(i)}
              className={cn(
                "rounded-[14px] bg-muted px-4 py-2.5 text-left text-sm font-semibold transition-colors hover:bg-accent",
                FOCUS,
                picked === i && (i === quiz.answer ? "bg-success/15 text-success hover:bg-success/15" : "bg-destructive/12 text-destructive hover:bg-destructive/12"),
              )}
            >
              {said(option)}
            </button>
          ))}
          {picked !== null && <p role="status" className={cn("pt-1 text-sm", right ? "text-success" : "text-muted-foreground")}>{right ? said(quiz.explain) : tr("Not quite: look again.")}</p>}
        </fieldset>
      )}
    </div>
  );
  const foot = (
    <div className="mt-auto flex items-center gap-2 pt-1">
      <UiButton variant="secondary" size="icon" disabled={!back} data-action="course:back" onClick={back} aria-label={tr("Back")}>
        <ChevronLeft />
      </UiButton>
      <span className={cn(NUMERIC, "text-[13px] font-semibold text-muted-foreground")}>
        {index + 1} / {count}
      </span>
      <UiButton className="ml-auto" disabled={blocked} data-action="course:next" onClick={next}>
        {page.task && !verified ? tr("It's done") : tr("Next")}
        <ChevronRight />
      </UiButton>
    </div>
  );
  const visual = page.alg || page.task || page.picture;
  return phone ? (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {visual && <div className="flex shrink-0 flex-col items-center gap-3 rounded-[22px] bg-card p-3"><Visual puzzle={puzzle} page={page} size={190} /></div>}
      {body}
      {foot}
    </div>
  ) : (
    <div className={cn("grid min-h-0 flex-1 gap-4 xl:gap-5", visual ? "grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]" : "grid-cols-1")}>
      {visual && (
        <Surface className="min-h-0 items-center justify-center gap-5 p-5">
          <Visual puzzle={puzzle} page={page} size={340} />
        </Surface>
      )}
      <Surface className="min-h-0 gap-4 p-6">
        {body}
        {foot}
      </Surface>
    </div>
  );
}
