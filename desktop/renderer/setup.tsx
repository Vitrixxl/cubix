/**
 * The training's page, before the timer: the learned cases recommended first (the slowest against the player's usual,
 * each with why), then whole sets (their learned cases), cases picked by hand and the cross. A bar under the
 * recommendations sums up what will be drilled and starts it. Only learned cases are trained: learning new ones is
 * the courses' work, and a set with none learned leads to its course.
 */
import { useMemo, useState } from "react";
import type { PuzzleId } from "../../src/shared/puzzles";
import { METHODS } from "../../src/shared/methods";
import { CROSS_MOVES, CROSS_TARGET_LABELS, CROSS_TARGETS } from "../../src/shared/crossTraining";
import { recommendedWhy, type Recommendation } from "../../src/client/lib/trainingPicks";
import { ChevronDown, ChevronRight, GraduationCap, Play, Rotate3d, Shuffle, Timer } from "lucide-react";
import { store as s, matches } from "./store";
import { ActionToggle, Button, Diagram, Empty, FOCUS, MenuAction, Modal, NUMERIC, PAGE, PageHead, ProgressRing, ROW, SearchField, SectionHead, Segmented, Surface, plural, run, usePhone } from "./ui";
import { CaseTile, FootBar, TILES } from "./algorithms";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { tr } from "../../src/client/i18n";
import { said } from "./base";

/** A case's time in seconds, to the hundredth. */
const sec = (ms: number) => (ms / 1000).toFixed(2);
/** Each stage's colour, as the catalogue draws it. */
const STAGE_FILL: Record<string, string> = { F2L: "bg-success", OLL: "bg-primary", PLL: "bg-lilac", ZBLL: "bg-warning" };
/** The course that teaches a set, if one does. */
function courseAction(setId: string) {
  const method = METHODS[s.puzzle as PuzzleId]?.find((m) => m.steps.some((step) => step.sets?.includes(setId)));
  return method ? `learnFrom:${s.puzzle}:${method.id}` : "nav:learn";
}

/** The sets of the puzzle with their cases and how many are learned: those with learned cases first. */
function useSets() {
  const cases = s.cases();
  return useMemo(() => {
    const bySet = new Map<string, any[]>();
    for (const c of cases) bySet.set(c.set, [...(bySet.get(c.set) ?? []), c]);
    const sets: { set: any; all: any[]; learned: number }[] = s.allSets().flatMap((set: any) => {
      const all = bySet.get(set.id) ?? [];
      return all.length ? [{ set, all, learned: all.filter((c: any) => s.learned.has(c.id)).length }] : [];
    });
    return [...sets.filter((x) => x.learned), ...sets.filter((x) => !x.learned)];
  }, [cases, s.learned, s.learned.size]);
}

export function TrainingSetup() {
  const phone = usePhone(),
    sets = useSets(),
    pool = s.practiceSelected,
    learned = sets.reduce((n, x) => n + x.learned, 0),
    cross = s.puzzle === "333",
    parts = s.trainingParts();
  const start = (
    <Button action="trainingStart:cases:practice" variant="default" icon={Play} disabled={!pool.size}>
      {tr("Train")}
    </Button>
  );
  const side = (
    <>
      <SetsCard sets={sets} phone={phone} />
      <HandCard learned={learned} />
      {cross && <CrossCard />}
    </>
  );
  return (
    <div className={PAGE} data-tour="training">
      {phone && <PageHead title={tr("Training")} puzzle more={<MenuAction action="auf" icon={Shuffle}>{tr("Random AUF")}{" "}{s.randomAuf ? tr("· on") : tr("· off")}</MenuAction>} />}
      {phone ? (
        <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1 pb-2 *:shrink-0">
          <Recommended learned={learned} phone />
          {side}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] gap-x-5 gap-y-4">
          <Recommended learned={learned} />
          <div className="row-span-2 flex min-h-0 flex-col gap-4">{side}</div>
          <Surface className="flex-row items-center gap-3.5 rounded-[22px] bg-muted py-3 pr-3.5 pl-6">
            <strong className={cn(NUMERIC, "text-3xl font-extrabold tracking-[-0.04em]")}>{pool.size}</strong>
            <span className="text-sm font-semibold text-faint">{tr(pool.size === 1 ? "case" : "cases")}</span>
            <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              {parts.map((part) => (
                <span key={part} className="rounded-lg bg-card px-2.5 py-1 text-[13px] font-semibold text-muted-foreground">{part}</span>
              ))}
            </span>
            <ActionToggle action="auf" pressed={s.randomAuf} icon={Shuffle} tip={tr("Random AUF · Alt+A")}>
              {tr("Random AUF")}
            </ActionToggle>
            {start}
          </Surface>
        </div>
      )}
      {phone && (
        <FootBar className="justify-between gap-4">
          <span className="min-w-0 truncate px-2 text-sm text-muted-foreground">
            <strong className={cn(NUMERIC, "mr-1.5 text-lg text-foreground")}>{pool.size}</strong>
            {said(parts.join(" · ") || tr("No case picked"))}
          </span>
          {start}
        </FootBar>
      )}
      <Modal id="pickCases" title={tr("Pick cases")} description={tr("Among the cases you learned")} tall className="flex h-[min(86vh,760px)] flex-col sm:max-w-4xl">
        <CasesPicker />
      </Modal>
    </div>
  );
}

/** A card of the page: its head, then its body. */
function Card({ title, meta, head, className, children }: { title: React.ReactNode; meta?: React.ReactNode; head?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <Surface className={cn("gap-3.5 px-5 py-4 md:px-6 md:py-5", className)}>
      <SectionHead title={title} meta={meta}>{head}</SectionHead>
      {children}
    </Surface>
  );
}

/** The learned cases slower than usual, each picked or not, with why; from training, from the solves or both. */
function Recommended({ learned, phone = false }: { learned: number; phone?: boolean }) {
  const all = s.recommended(),
    [source, setSource] = useState<"all" | Recommendation["source"]>("all"),
    both = all.some((r) => r.source === "solves") && all.some((r) => r.source === "training"),
    shown = both && source !== "all" ? all.filter((r) => r.source === source) : all,
    scale = Math.max(1, ...shown.map((r) => Math.max(r.time, r.usual) * 1.12)),
    picks = new Set(s.trainPicks);
  return (
    <Card
      title={<span className="text-xl font-extrabold tracking-[-0.03em] md:text-2xl">{tr("Recommended")}</span>}
      meta={tr("your slowest learned cases")}
      className={cn(!phone && "min-h-0")}
      head={
        both && (
          <Segmented
            label={tr("Where they are slow")}
            value={source}
            onChange={(id) => setSource(id as typeof source)}
            options={[
              { id: "all", label: tr("All") },
              { id: "training", label: tr("In training") },
              { id: "solves", label: tr("In your solves") },
            ]}
          />
        )
      }
    >
      {!learned ? (
        <Empty icon={GraduationCap} title={tr("Nothing learned yet")} className="my-auto py-8">
          <p>{tr("The training drills the cases you learned. Learn them in the courses first.")}</p>
          <Button action="nav:learn" variant="default">{tr("Open the courses")}</Button>
        </Empty>
      ) : !shown.length ? (
        <Empty icon={Timer} title={tr("No recommendation yet")} className="my-auto py-8">
          <p>{tr("Train your learned cases a few times each: the slowest show up here.")}</p>
        </Empty>
      ) : (
        <ul className={cn("flex flex-col gap-2", !phone && "min-h-0 overflow-y-auto")}>
          {shown.map((r) => (
            <RecommendedRow key={r.id} r={r} scale={scale} picked={picks.has(r.id)} />
          ))}
        </ul>
      )}
    </Card>
  );
}

/** A recommended case, in its own tile: picked or not, its diagram, name and why, then its time against its set's usual. */
function RecommendedRow({ r, scale, picked }: { r: Recommendation; scale: number; picked: boolean }) {
  const c = s.find(r.id);
  if (!c) return null;
  const Source = r.source === "solves" ? Rotate3d : Timer,
    why = recommendedWhy(r);
  return (
    <li>
      <label className="grid cursor-pointer grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 rounded-2xl bg-muted px-3.5 py-2.5 transition-colors hover:bg-accent md:grid-cols-[auto_auto_minmax(0,1fr)_12.5rem]">
        <Checkbox checked={picked} onCheckedChange={() => void s.action("trainPick:" + r.id)} data-action={"trainPick:" + r.id} />
        <Diagram c={c} size={52} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 items-baseline gap-2">
            <b className="truncate text-base font-extrabold">{tr(c.name)}</b>
            <span className="truncate text-[13px] font-semibold text-faint">{tr(c.setLabel)} · {tr(c.group)}</span>
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 text-[13px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 font-semibold text-faint">
              <Source className="size-3.5" aria-hidden="true" />
              {r.source === "solves" ? tr("seen in {0} of your solves", { 0: r.count }) : tr("{0} in training", { 0: plural(r.count, "attempt") })}
            </span>
            {why}
          </span>
        </span>
        <span className="col-start-3 flex flex-col gap-1.5 md:col-start-4">
          <span className="relative h-2 rounded-full bg-card" aria-hidden="true">
            <span className="absolute inset-y-0 left-0 rounded-full bg-destructive" style={{ width: (r.time / scale) * 100 + "%" }} />
            <span className="absolute -inset-y-1 w-0.5 rounded-full bg-foreground" style={{ left: (r.usual / scale) * 100 + "%" }} />
          </span>
          <span className="flex items-baseline justify-between text-xs font-semibold text-faint">
            <span>{tr("usual {0} {1}", { 0: tr(c.setLabel), 1: sec(r.usual) })}</span>
            <strong className={cn(NUMERIC, "text-sm text-destructive")}>{tr("{0} s", { 0: sec(r.time) })}</strong>
          </span>
        </span>
      </label>
    </li>
  );
}

/** A set's learned share as dashes, up to forty of them. */
function Pips({ learned, total, fill }: { learned: number; total: number; fill: string }) {
  const n = Math.min(total, 40),
    lit = Math.round((learned / total) * n);
  return (
    <span className="col-span-2 flex h-1.5 gap-0.5" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <i key={i} className={cn("flex-1 rounded-[2px]", i < lit ? fill : "bg-accent")} />
      ))}
    </span>
  );
}

/** Whole sets, their learned cases only; a set with none learned leads to its course. */
function SetsCard({ sets, phone }: { sets: ReturnType<typeof useSets>; phone: boolean }) {
  return (
    <Card title={tr("Whole sets")} meta={tr("learned cases only")} className={cn(!phone && "min-h-0 shrink")}>
      <div className={cn("-mx-1 flex flex-col gap-1.5 px-1", !phone && "min-h-0 overflow-y-auto")}>
        {sets.map(({ set, all, learned }) => {
          const on = !!learned && s.trainSets.includes(set.id);
          return learned ? (
            <button
              key={set.id}
              type="button"
              aria-pressed={on}
              data-action={"trainSet:" + set.id}
              onClick={run("trainSet:" + set.id)}
              className={cn("grid shrink-0 grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 rounded-2xl bg-muted px-3.5 py-2.5 text-left transition-colors hover:bg-accent aria-pressed:bg-accent", FOCUS)}
            >
              <b className="text-[15px] font-bold">{tr(set.label)}</b>
              <span className={cn(NUMERIC, "text-[13px] font-semibold text-faint")}>{tr("{0} learned of {1}", { 0: learned, 1: all.length })}</span>
              <Pips learned={learned} total={all.length} fill={STAGE_FILL[set.stage] ?? "bg-primary"} />
            </button>
          ) : (
            <button
              key={set.id}
              type="button"
              data-action={courseAction(set.id)}
              onClick={run(courseAction(set.id))}
              className={cn("flex shrink-0 items-center justify-between gap-3 rounded-2xl px-3.5 py-2 text-left text-faint transition-colors hover:bg-muted hover:text-muted-foreground", FOCUS)}
            >
              <b className="text-sm font-bold">{tr(set.label)}</b>
              <span className="flex items-center gap-1 text-[13px] font-semibold">
                {tr("none learned · see Courses")}
                <ChevronRight className="size-3.5" aria-hidden="true" />
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

/** The cases picked by hand, a few of them shown, and the way to pick them. */
function HandCard({ learned }: { learned: number }) {
  const picked = s.cases().filter((c: any) => s.selected.has(c.id) && s.learned.has(c.id)),
    shown = picked.slice(0, 7);
  return (
    <Card title={tr("Case by case")} meta={tr("among your {0} learned", { 0: learned })} className="shrink-0">
      {!!picked.length && (
        <div className="flex flex-wrap items-center gap-1.5">
          {shown.map((c: any) => (
            <Diagram key={c.id} c={c} size={40} />
          ))}
          {picked.length > shown.length && <span className={cn(NUMERIC, "px-1 text-sm font-semibold text-faint")}>+{picked.length - shown.length}</span>}
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="flex-1 text-sm text-muted-foreground">{picked.length ? tr("{0} picked by hand", { 0: plural(picked.length, "case") }) : tr("None picked by hand")}</span>
        <Button action="menu:pickCases" variant="outline" disabled={!learned}>{tr("Pick…")}</Button>
      </div>
    </Card>
  );
}

/** The cross: what to build by its number of moves, picked in one grid, and its start. */
function CrossCard() {
  const moves = [...new Set(CROSS_TARGETS.flatMap((t) => CROSS_MOVES[t]))].sort();
  return (
    <Card title={tr("Cross")} meta={tr("goal × exact moves")} className="shrink-0">
      <div className="grid grid-cols-[4.5rem_repeat(var(--n),minmax(0,1fr))] items-center gap-1" style={{ "--n": moves.length } as React.CSSProperties} role="radiogroup" aria-label={tr("Cross")}>
        <span />
        {moves.map((n) => (
          <span key={n} className={cn(NUMERIC, "text-center text-xs font-bold text-faint")}>{n}</span>
        ))}
        {CROSS_TARGETS.map((t) => [
          <span key={t} className="text-xs font-bold text-faint">{tr(CROSS_TARGET_LABELS[t])}</span>,
          ...moves.map((n) =>
            CROSS_MOVES[t].includes(n) ? (
              <button
                key={t + n}
                type="button"
                role="radio"
                aria-checked={s.crossTarget === t && s.crossMoves === n}
                aria-label={tr("{0} in {1} moves", { 0: tr(CROSS_TARGET_LABELS[t]), 1: n })}
                data-action={"crossTarget:" + t}
                onClick={run("crossTarget:" + t, "crossMoves:" + n)}
                className={cn("h-6 rounded-lg bg-muted transition-colors hover:bg-accent aria-checked:bg-primary", FOCUS)}
              />
            ) : (
              <span key={t + n} />
            ),
          ),
        ])}
      </div>
      <div className="flex items-center gap-2">
        <span className="flex-1 text-sm text-muted-foreground">{tr("{0} in {1} moves", { 0: tr(CROSS_TARGET_LABELS[s.crossTarget]), 1: s.crossMoves })}</span>
        <Button action="trainingStart:cross" variant="outline">{tr("Start the cross")}</Button>
      </div>
    </Card>
  );
}

/** The learned cases to pick by hand, set by set; the count picked, the search and Clear above them. */
function CasesPicker() {
  const cases = s.cases().filter((c: any) => s.learned.has(c.id)),
    phone = usePhone();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <span className="flex items-baseline gap-2">
          <span className={cn(NUMERIC, "text-[28px] leading-none font-extrabold tracking-[-0.03em]")}>{cases.filter((c: any) => s.selected.has(c.id)).length}</span>
          <span className="text-sm text-muted-foreground">{tr("picked")}</span>
        </span>
        <div className="flex items-center gap-2 max-md:w-full">
          <SearchField
            value={s.query}
            onChange={(query) => {
              s.query = query;
              s.emit();
            }}
            placeholder="Search cases…"
            label="Search cases"
            className="w-56 max-md:w-full"
          />
          <Button action="clear" disabled={!s.selected.size}>{tr("Clear")}</Button>
        </div>
      </header>
      {/* The set and group rows reach 8px past their text (-mx-2): the list's padding holds them, so nothing scrolls sideways. */}
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-2">
        {s.allSets().map((set: any) => {
          const all = cases.filter((c: any) => c.set === set.id),
            chosen = all.filter((c: any) => matches(c, s.query)),
            count = chosen.filter((c: any) => s.selected.has(c.id)).length,
            open = s.selectorOpen[set.id] ?? (count > 0 || !!s.query);
          if (!chosen.length) return null;
          const groups = [...new Set(chosen.map((c: any) => c.group))] as string[];
          return (
            <section key={set.id} className="flex flex-col pb-2">
              <div className={cn(ROW, "-mx-2 flex items-center gap-2 pr-1")}>
                <button
                  type="button"
                  data-action={"selectorToggle:" + set.id}
                  onClick={run("selectorToggle:" + set.id)}
                  className={cn("flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 text-left", FOCUS)}
                >
                  {open ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                  <ProgressRing done={count === chosen.length} share={count / chosen.length} />
                  <span className="truncate text-[15px] font-bold">{tr(set.label)}</span>
                  <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>
                    {count} / {chosen.length}
                  </span>
                </button>
                <Button action={"selectSet:" + set.id} className="text-muted-foreground">
                  {count === chosen.length ? tr("Unselect all") : tr("Select all")}
                </Button>
              </div>
              {open &&
                groups.map((group) => {
                  const members = chosen.filter((c: any) => c.group === group);
                  return (
                    <div key={group} className="flex flex-col gap-1 pt-2 pb-3">
                      {groups.length > 1 && (
                        <button
                          type="button"
                          data-action={"selectGroup:" + set.id + ":" + group}
                          onClick={run("selectGroup:" + set.id + ":" + group)}
                          className={cn("flex w-fit items-center gap-2 rounded-md px-1 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground", FOCUS)}
                        >
                          {tr(group)}
                          <span className={NUMERIC}>
                            {members.filter((c: any) => s.selected.has(c.id)).length} / {members.length}
                          </span>
                        </button>
                      )}
                      <div className={TILES}>
                        {members.map((c: any) => (
                          <CaseTile key={c.id} c={c} touch={phone} action={"select:" + c.id} pressed={s.selected.has(c.id)} />
                        ))}
                      </div>
                    </div>
                  );
                })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
