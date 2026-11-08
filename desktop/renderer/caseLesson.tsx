/**
 * A case's lesson, in its dialog: seen first, then done on the player's cube with its algorithm in view, its gestures
 * hidden one by one, and from memory. A connected cube judges each attempt; otherwise the player says how it went.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Bluetooth, Check, Eye, RotateCcw, X } from "lucide-react";
import { Button as UiButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { advanceLesson, algTurns, caseWatcher, chunkAlg, lessonStage, MASTERY_LABELS, MASTERY_TOP, startLesson, type Mastery, type Outcome } from "../../src/client/lib/mastery";
import { casePlayItem, displayAlg } from "../../src/client/lib/caseState";
import { smartCube } from "../../src/client/lib/smartCube";
import { tr } from "../../src/client/i18n";
import { PlayerCube, PlayerControls, useAlgPlayer } from "./AlgPlayer";
import { store as s } from "./store";
import { Alg, Diagram, NUMERIC } from "./ui";
import { said } from "./base";

/** Where a case stands on the ladder: its five rungs, then the rung's name. */
export function MasteryMeter({ level, className }: { level: Mastery; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)} role="img" aria-label={tr("Level: {0}", { 0: said(MASTERY_LABELS[level]) })}>
      <span className="flex gap-0.5" aria-hidden="true">
        {Array.from({ length: MASTERY_TOP }, (_, i) => (
          <i key={i} className={cn("h-1.5 w-4 rounded-full", i < level ? (level >= 3 ? "bg-success" : "bg-primary") : "bg-muted")} />
        ))}
      </span>
      <span className={cn(NUMERIC, "text-xs font-bold", level >= 3 ? "text-success" : level ? "text-primary" : "text-muted-foreground")}>{said(MASTERY_LABELS[level])}</span>
    </span>
  );
}

const PHASES = [
  ["understand", "Watch"],
  ["guided", "Guided"],
  ["fading", "Hidden"],
  ["recall", "Memory"],
] as const;
const COPY = {
  understand: ["Watch it", "Find what makes this case, then follow the algorithm gesture by gesture."],
  guided: ["Your turn", "Put the case on your cube, then do the algorithm with it in view."],
  fading: ["Fewer clues", "Some gestures are hidden: do them from memory."],
  recall: ["From memory", "Only the case now. No algorithm."],
  done: ["By heart", "It joins your reviews: Qbix brings it back just before you forget it."],
} as const;

export function CaseLessonFlow({ c, alg, onClose, phone }: { c: any; alg: { alg: string; pre_auf?: string }; onClose: () => void; phone: boolean }) {
  const text = displayAlg(alg),
    chunks = useMemo(() => chunkAlg(text), [text]),
    [lesson, setLesson] = useState(() => startLesson(s.level(c.id))),
    // Each attempt watched afresh, even when it changes nothing.
    [round, setRound] = useState(0),
    [shown, setShown] = useState<number[]>([]),
    [armed, setArmed] = useState(false),
    link = useSyncExternalStore(smartCube.subscribe, () => smartCube.snapshot.status, () => smartCube.snapshot.status),
    item = casePlayItem(c),
    playing = lesson.phase === "understand" || lesson.phase === "guided",
    player = useAlgPlayer(playing ? text : "", playing ? item?.size : null, item?.mask, { puzzle: item?.puzzle, hints: item?.hints });
  const answer = (outcome: Outcome) => {
    const next = advanceLesson(lesson, outcome, chunks.length);
    setLesson(next);
    setRound((n) => n + 1);
    setShown([]);
    void s.lessonReached(c.id, lessonStage(next), alg.alg);
  };
  // A connected cube watches each attempt.
  useEffect(() => {
    setArmed(false);
    if (link !== "on" || lesson.phase === "understand" || lesson.phase === "done") return;
    const watcher = caseWatcher(c, algTurns(text).length);
    if (!watcher) return;
    return smartCube.subscribe(() => {
      const outcome = watcher.see(smartCube.snapshot.state, smartCube.snapshot.count);
      setArmed(watcher.armed);
      if (outcome) answer(outcome);
    });
  }, [link, round, lesson.phase]);
  const hides = (i: number) => !shown.includes(i) && (lesson.phase === "recall" || (lesson.phase === "fading" && i >= chunks.length - lesson.hidden)),
    [title, line] = COPY[lesson.phase],
    at = PHASES.findIndex(([id]) => id === lesson.phase),
    done = lesson.phase === "done",
    watched = link === "on" && !done && lesson.phase !== "understand";
  const steps = (
    <ol className="flex items-center gap-1.5" aria-label={tr("Steps")}>
      {PHASES.map(([id, name], i) => (
        <li key={id} aria-current={id === lesson.phase ? "step" : undefined} className={cn("flex items-center gap-1.5 rounded-xl py-1 pr-2.5 pl-1 text-[13px] font-bold", id === lesson.phase ? "bg-accent text-foreground" : "text-muted-foreground")}>
          <span className={cn(NUMERIC, "flex size-5 items-center justify-center rounded-md text-[11px]", done || i < at ? "bg-success text-background" : id === lesson.phase ? "bg-primary text-primary-foreground" : "bg-muted")}>
            {done || i < at ? <Check className="size-3" strokeWidth={3} /> : i + 1}
          </span>
          <span className={cn(phone && id !== lesson.phase && "hidden")}>{tr(name)}</span>
        </li>
      ))}
    </ol>
  );
  const gestures = !done && (
    <ul className="flex flex-wrap gap-2" aria-label={tr("Algorithm")}>
      {chunks.map((chunk, i) => (
        <li key={i} className="flex flex-col gap-1">
          {hides(i) ? (
            <button type="button" onClick={() => setShown([...shown, i])} aria-label={tr("Show this gesture")} className="flex h-11 min-w-16 items-center justify-center gap-1.5 rounded-xl bg-muted px-3 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground">
              <Eye className="size-4" />
            </button>
          ) : (
            <span className="flex h-11 items-center rounded-xl bg-muted px-3"><Alg text={chunk.turns.join(" ")} size={18} className="font-semibold" /></span>
          )}
          {chunk.name && !hides(i) && <span className="px-1 text-[11px] font-bold text-muted-foreground">{said(chunk.name)}</span>}
        </li>
      ))}
    </ul>
  );
  const side = (
    <div className="flex min-h-0 flex-col gap-4">
      {steps}
      <div className="flex flex-col gap-1.5">
        <h3 className="text-2xl font-extrabold tracking-[-0.03em]">{tr(title)}</h3>
        <p className="text-sm text-muted-foreground">{tr(line)}</p>
      </div>
      {gestures}
      {!done && lesson.phase !== "understand" && (
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-muted-foreground">
          {tr("Setup")} <Alg text={c.setup} size={14} className="text-foreground/80" />
        </p>
      )}
      {watched && item && (
        <p role="status" className={cn("flex items-center gap-2 text-sm font-semibold", armed ? "text-success" : "text-muted-foreground")}>
          <Bluetooth className="size-4" />
          {armed ? tr("Case found: go") : tr("Set up the case on your cube")}
        </p>
      )}
      <div className="mt-auto flex flex-wrap gap-2 pt-2">
        {done ? (
          <UiButton data-action="caseLesson:close" onClick={onClose}>
            <Check />
            {tr("Finish")}
          </UiButton>
        ) : lesson.phase === "understand" ? (
          <UiButton data-action="caseLesson:good" onClick={() => answer("good")}>
            <Check />
            {tr("Understood")}
          </UiButton>
        ) : (
          <>
            <UiButton data-action="caseLesson:good" onClick={() => answer("good")}>
              <Check />
              {tr("Done it")}
            </UiButton>
            <UiButton variant="secondary" data-action="caseLesson:hesitant" onClick={() => answer("hesitant")}>
              <RotateCcw />
              {tr("Hesitated")}
            </UiButton>
            <UiButton variant="ghost" data-action="caseLesson:miss" onClick={() => answer("miss")}>
              <X />
              {tr("Missed")}
            </UiButton>
          </>
        )}
      </div>
    </div>
  );
  const stage = (
    <section className={cn("relative flex min-h-0 flex-col items-center justify-center gap-4 rounded-[22px] bg-background p-4 inset-ring-1 inset-ring-border", phone && "shrink-0")}>
      {playing && player ? (
        <>
          <PlayerCube key={text} player={player} size={phone ? 200 : 300} />
          <PlayerControls player={player} touch={phone} inline={!phone} className="w-full max-w-lg rounded-[16px] bg-card p-1.5" />
        </>
      ) : (
        <Diagram c={c} size={phone ? 180 : 260} />
      )}
    </section>
  );
  return phone ? (
    <div className="flex flex-col gap-4">
      {stage}
      {side}
    </div>
  ) : (
    <div className="grid min-h-0 flex-1 grid-cols-[27rem_minmax(0,1fr)] gap-4 px-5 pb-5">
      <div className="min-h-0 overflow-y-auto p-1 pr-2">{side}</div>
      {stage}
    </div>
  );
}
