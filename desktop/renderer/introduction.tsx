/**
 * The onboarding page (a short step flow saved as the journey profile), the goal editor and the app tour. The tour
 * dims the app and cuts out the tab and a part of its page, measured once the page transition has settled.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Ban, CalendarDays, Check, ChevronLeft, ChevronRight, CornerDownLeft, Gauge, GraduationCap, Plus, Shapes, Target, Timer, X } from "lucide-react";
import { store as s, catalog } from "./store";
import { Icon, Logo, Wordmark, usePhone } from "./ui";
import { PhoneSheet } from "./phone";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Kbd } from "@/components/ui/kbd";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PUZZLES, EVENTS, puzzleInfo, puzzleOf, type PuzzleId, type SolveMode } from "../../src/shared/puzzles";
import { LEVELS, PROFILE_KEY, TOUR_STEPS, goalKey, goalTitle, journeyProfile, learningPlan, parseGoalTarget, validDueDate, type Experience, type Journey, type PersonalGoal } from "../../src/client/lib/journey";
import type { SetDto } from "../../src/shared/types";
import { METHODS } from "../../src/shared/methods";
import { go, goPage, pageUrl } from "./navigation";

const close = () => s.closeOverlay();

/* ------------------------------------------------------------------ Onboarding */

const STEPS = [
  { label: "Welcome", title: "Welcome to Cubix", sub: "A minute to set the app up for you" },
  { label: "Level", title: "Your level", sub: "Pick the one closest to you" },
  { label: "Puzzles", title: "Puzzles you can solve", sub: "Then tick the methods you use" },
  { label: "Learning", title: "What do you want to learn?", sub: "Your first pick comes first" },
  { label: "Goals", title: "Your goals", sub: "Optional, tracked on your profile" },
  { label: "Ready", title: "All set", sub: "Check your choices, then take the tour" },
] as const;
const LAST = STEPS.length - 1;

const LEVEL_TEXT: Record<Experience, string> = {
  new: "I can't solve a cube yet",
  beginner: "I solve the 3×3 with a beginner method",
  intermediate: "I use a speed method like CFOP",
  advanced: "I'm fast and learn full algorithm sets",
};

/** A selectable card: one border, the primary tint once chosen, nothing else. */
const CARD =
  "relative flex cursor-pointer rounded-xl border bg-card text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 aria-checked:border-primary aria-checked:bg-primary/10 aria-pressed:border-primary aria-pressed:bg-primary/10";
const SECTION_LABEL = "text-xs font-medium text-muted-foreground";

/** The level as signal bars: none lit when starting out, three when advanced. */
function Bars({ n }: { n: number }) {
  return (
    <span className="flex h-4 items-end gap-[3px]" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span key={i} className={cn("w-1 rounded-[1px]", i < n ? "bg-primary" : "bg-muted-foreground/25")} style={{ height: 6 + i * 4 }} />
      ))}
    </span>
  );
}

/** The check of a chosen card, top right. */
function Mark({ on, className }: { on: boolean; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors", on && "border-primary bg-primary text-primary-foreground", className)}>
      {on && <Check className="size-3.5" strokeWidth={3} />}
    </span>
  );
}

/** One line: the title, then its muted subtitle on the same baseline. */
function StepHead({ title, sub }: { title: string; sub: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  return (
    <header className="flex min-w-0 shrink-0 items-baseline gap-3">
      <h1 ref={ref} tabIndex={-1} id="journey-title" className="shrink-0 truncate text-xl font-semibold tracking-tight outline-none md:text-2xl">
        {title}
      </h1>
      <p className="min-w-0 truncate text-sm text-muted-foreground max-sm:hidden">{sub}</p>
    </header>
  );
}

function Welcome() {
  const rows = [
    { icon: Gauge, title: "Your level", text: "So suggestions fit you" },
    { icon: Shapes, title: "Your puzzles and methods", text: "What you solve today" },
    { icon: GraduationCap, title: "What to learn", text: "Cubix opens on it" },
    { icon: Target, title: "Goals", text: "Tracked on your profile" },
  ];
  return (
    <ol className="grid gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
      {rows.map((r, i) => (
        <li key={r.title} className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 lg:flex-col lg:items-start lg:gap-4 lg:p-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <r.icon className="size-[18px]" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">
              <span className="mr-1.5 text-muted-foreground tabular-nums">{i + 1}</span>
              {r.title}
            </span>
            <span className="truncate text-xs text-muted-foreground">{r.text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function LevelStep({ level, onChange }: { level: Experience; onChange: (level: Experience) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (event: React.KeyboardEvent) => {
    const delta = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const index = (LEVELS.findIndex((l) => l.id === level) + delta + LEVELS.length) % LEVELS.length;
    onChange(LEVELS[index]!.id);
    ref.current?.querySelectorAll<HTMLElement>("[role=radio]")[index]?.focus();
  };
  return (
    <div ref={ref} role="radiogroup" aria-label="Level" onKeyDown={move} className="grid gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
      {LEVELS.map((l, i) => (
        <button
          key={l.id}
          type="button"
          role="radio"
          aria-checked={level === l.id}
          tabIndex={level === l.id ? 0 : -1}
          onClick={() => onChange(l.id)}
          className={cn(CARD, "items-center gap-4 px-4 py-3.5 sm:min-h-24 sm:items-start sm:px-5 sm:py-4 lg:min-h-36")}
        >
          <span className="flex min-w-0 flex-1 flex-col gap-1 lg:h-full lg:gap-2">
            <span className="flex items-center gap-2.5 font-medium sm:text-base lg:flex-col lg:items-start lg:gap-4">
              <Bars n={i} />
              {l.label}
            </span>
            <span className="text-sm text-muted-foreground">{LEVEL_TEXT[l.id]}</span>
          </span>
          <Mark on={level === l.id} />
        </button>
      ))}
    </div>
  );
}

/** A puzzle tile: its WCA glyph and name, ticked when chosen. */
function Tile({ label, checked, glyph, onClick }: { label: string; checked: boolean; glyph: ReactNode; onClick: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={onClick} className={cn(CARD, "min-w-0 flex-col items-center justify-center gap-1.5 px-1 py-2.5 sm:gap-2 sm:py-4")}>
      <span className={cn("text-muted-foreground transition-colors", checked && "text-primary")}>{glyph}</span>
      <span className="max-w-full truncate text-[11px] font-medium tracking-tight sm:text-sm sm:tracking-normal">{label}</span>
      {checked && <Check className="absolute top-1.5 right-1.5 size-3.5 text-primary" strokeWidth={3} aria-hidden="true" />}
    </button>
  );
}

type MethodMap = Partial<Record<PuzzleId, string[]>>;

/** Puzzles as tiles, then the methods of each chosen one inline, in the order they were picked. */
function PuzzleStep({ learning, value, methods, onToggle, onNone, onMethod }: {
  learning: boolean;
  value: PuzzleId[];
  methods: MethodMap;
  onToggle: (puzzle: PuzzleId) => void;
  onNone?: () => void;
  onMethod: (puzzle: PuzzleId, method: string) => void;
}) {
  const phone = usePhone();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 md:gap-6">
      <div role="group" aria-label={learning ? "Puzzles to learn" : "Puzzles you can solve"} className="grid shrink-0 grid-cols-4 gap-1.5 sm:grid-cols-6 sm:gap-2.5">
        {onNone && <Tile label="None yet" checked={!value.length} onClick={onNone} glyph={<Ban className="size-6 sm:size-[30px]" strokeWidth={1.5} />} />}
        {PUZZLES.map((p) => (
          <Tile key={p.id} label={p.label} checked={value.includes(p.id)} onClick={() => onToggle(p.id)} glyph={<Icon name={"Puzzle" + p.id} size={phone ? 24 : 30} />} />
        ))}
      </div>
      <section aria-label="Methods" className="flex min-h-0 flex-1 flex-col gap-1">
        <h2 className={SECTION_LABEL}>{learning ? "Methods to learn" : "Methods you know"}</h2>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {value.length ? (
            value.map((id, i) => {
              const p = puzzleInfo(id);
              return (
                <div key={id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b py-2.5 last:border-b-0">
                  <span className="flex w-36 shrink-0 items-center gap-2 text-sm font-medium">
                    <Icon name={"Puzzle" + id} size={18} className="text-muted-foreground" />
                    {p.label}
                    {learning && i === 0 && value.length > 1 && <Badge variant="secondary">First</Badge>}
                  </span>
                  <div role="group" aria-label={`${p.label} methods`} className="flex flex-wrap gap-1.5">
                    {METHODS[id].map((m) => {
                      const on = methods[id]?.includes(m.id) ?? false;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          aria-label={`${p.label} ${m.name}`}
                          title={m.summary}
                          onClick={() => onMethod(id, m.id)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-checked:border-primary aria-checked:bg-primary/10 aria-checked:text-foreground"
                        >
                          {on ? <Check className="size-3.5 text-primary" strokeWidth={3} /> : <Plus className="size-3.5" />}
                          {m.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="py-2.5 text-sm text-muted-foreground">{learning ? "Pick a puzzle to choose its methods, or continue to skip." : "Pick a puzzle to choose its methods."}</p>
          )}
        </div>
      </section>
    </div>
  );
}

/** A typical average of 5 for a beginner on each puzzle, in seconds; the level scales it. */
const BEGINNER_AO5: Record<PuzzleId, number> = { "222": 15, "333": 60, "444": 150, "555": 270, "666": 480, "777": 720, sq1: 90, pyram: 15, skewb: 15, minx: 300, clock: 30 };
const LEVEL_SCALE: Record<Experience, number> = { new: 1.5, beginner: 1, intermediate: 0.4, advanced: 0.2 };
const roundTarget = (seconds: number) => (seconds < 20 ? Math.max(2, Math.round(seconds)) : seconds < 60 ? Math.round(seconds / 5) * 5 : seconds < 300 ? Math.round(seconds / 10) * 10 : Math.round(seconds / 30) * 30);

/** One-click goals from the answers: learn the first puzzle or set, beat a time on the puzzles already solved. */
function suggestedGoals(level: Experience, known: PuzzleId[], learning: PuzzleId[], learningMethods: MethodMap): PersonalGoal[] {
  const createdAt = new Date().toISOString(), out: PersonalGoal[] = [];
  const sets = catalog.sets as SetDto[];
  for (const puzzle of learning.slice(0, 2)) {
    if (!known.includes(puzzle)) { out.push({ kind: "learning", puzzle, setId: null, createdAt }); continue; }
    const method = METHODS[puzzle].find((m) => learningMethods[puzzle]?.includes(m.id));
    const setId = method?.steps.flatMap((step) => step.sets ?? []).find((id) => sets.some((set) => set.id === id && puzzleOf(set) === puzzle));
    if (setId) out.push({ kind: "learning", puzzle, setId, createdAt });
  }
  const timed = [...learning.filter((p) => known.includes(p)), ...known.filter((p) => !learning.includes(p))];
  for (const puzzle of timed.slice(0, 2)) out.push({ kind: "time", puzzle, metric: "ao5", solveMode: "standard", targetMs: roundTarget(BEGINNER_AO5[puzzle] * LEVEL_SCALE[level]) * 1000, createdAt });
  if (!out.length) out.push({ kind: "learning", puzzle: "333", setId: null, createdAt });
  return out.slice(0, 4);
}

const titleOf = (goal: PersonalGoal) => goalTitle(goal, catalog.sets);
const GoalIcon = ({ goal }: { goal: PersonalGoal }) => (goal.kind === "time" ? <Timer className="size-4" /> : <GraduationCap className="size-4" />);

function GoalsStep({ goals, setGoals, suggestions, puzzle }: { goals: Journey; setGoals: (update: (goals: Journey) => Journey) => void; suggestions: PersonalGoal[]; puzzle: PuzzleId }) {
  const drafts = Object.entries(goals).filter((entry): entry is [string, PersonalGoal] => !!entry[1] && entry[1].kind !== "profile");
  const [custom, setCustom] = useState(false);
  const toggle = (goal: PersonalGoal) => {
    const key = drafts.find(([, d]) => titleOf(d) === titleOf(goal))?.[0];
    setGoals((g) => (key ? Object.fromEntries(Object.entries(g).filter(([id]) => id !== key)) : { ...g, [goalKey()]: goal }));
  };
  return (
    <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto overscroll-contain md:grid-cols-2 md:content-stretch md:gap-8 md:overflow-hidden">
      <div className="flex flex-col gap-4 md:min-h-0 md:overflow-y-auto md:overscroll-contain md:pr-1">
        <section aria-label="Suggested goals" className="flex flex-col gap-1.5">
          <h2 className={SECTION_LABEL}>Suggested for you</h2>
          {suggestions.map((goal) => {
            const added = drafts.some(([, d]) => titleOf(d) === titleOf(goal));
            return (
              <button key={titleOf(goal)} type="button" aria-pressed={added} onClick={() => toggle(goal)} className={cn(CARD, "items-center gap-3 px-3 py-2.5")}>
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground", added && "bg-primary/15 text-primary")}>
                  <GoalIcon goal={goal} />
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium">{titleOf(goal)}</span>
                {added ? <Check className="size-4 text-primary" strokeWidth={3} aria-hidden="true" /> : <Plus className="size-4 text-muted-foreground" aria-hidden="true" />}
              </button>
            );
          })}
        </section>
        <section aria-label="Custom goal" className="flex flex-col gap-2">
          {custom ? (
            <>
              <h2 className={SECTION_LABEL}>Custom goal</h2>
              <div className="rounded-xl border p-4">
                <GoalForm puzzle={puzzle} onCancel={() => setCustom(false)} onSave={(goal) => setGoals((g) => ({ ...g, [goalKey()]: goal }))} />
              </div>
            </>
          ) : (
            <Button variant="outline" className="self-start" onClick={() => setCustom(true)}>
              <Plus />
              Custom goal
            </Button>
          )}
        </section>
      </div>
      <section aria-label="Added goals" className="flex flex-col gap-1.5 md:min-h-0">
        <h2 className={SECTION_LABEL}>
          Added <span className="tabular-nums">{drafts.length || ""}</span>
        </h2>
        {drafts.length ? (
          <ul className="flex flex-col overscroll-contain rounded-xl border md:min-h-0 md:overflow-y-auto">
            {drafts.map(([key, goal]) => (
              <li key={key} className="flex items-center gap-3 border-b py-2 pr-2 pl-3 last:border-b-0">
                <span className="text-muted-foreground">
                  <GoalIcon goal={goal} />
                </span>
                <span className="min-w-0 flex-1 text-sm">{titleOf(goal)}</span>
                <Button size="icon-sm" variant="ghost" aria-label={`Remove ${titleOf(goal)}`} onClick={() => setGoals((g) => Object.fromEntries(Object.entries(g).filter(([id]) => id !== key)))}>
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed px-3 py-4 text-sm text-muted-foreground">No goal yet. Add one here or later on your profile.</p>
        )}
      </section>
    </div>
  );
}

function PuzzleList({ puzzles, methods, first = false }: { puzzles: PuzzleId[]; methods: MethodMap; first?: boolean }) {
  if (!puzzles.length) return <span className="text-sm text-muted-foreground">None</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {puzzles.map((id, i) => {
        const names = METHODS[id].filter((m) => methods[id]?.includes(m.id)).map((m) => m.name);
        return (
          <Badge key={id} variant="outline" className="h-7 gap-1.5 px-2 text-sm font-normal">
            <Icon name={"Puzzle" + id} size={14} className="text-muted-foreground" />
            {puzzleInfo(id).label}
            {!!names.length && <span className="text-muted-foreground">· {names.join(", ")}</span>}
            {first && i === 0 && puzzles.length > 1 && <span className="text-xs text-primary">first</span>}
          </Badge>
        );
      })}
    </span>
  );
}

function Summary({ rows }: { rows: { label: string; step: number; value: ReactNode }[] }) {
  return (
    <dl className="flex min-h-0 max-w-3xl flex-col overflow-y-auto overscroll-contain rounded-xl border">
      {rows.map((r) => (
        <div key={r.label} className="flex items-start gap-3 border-b px-4 py-3 last:border-b-0 max-sm:flex-wrap sm:items-center sm:gap-6">
          <dt className="w-28 shrink-0 text-sm text-muted-foreground max-sm:flex-1">{r.label}</dt>
          <dd className="min-w-0 flex-1 max-sm:order-last max-sm:basis-full">{r.value}</dd>
          <Button variant="ghost" size="xs" className="text-muted-foreground" aria-label={`Edit ${r.label.toLowerCase()}`} data-step={r.step}>
            Edit
          </Button>
        </div>
      ))}
    </dl>
  );
}

export function Onboarding() {
  const existing = journeyProfile(s.journey);
  const [[step, dir], setStepDir] = useState<[number, number]>([existing ? 1 : 0, 1]);
  const [reached, setReached] = useState(existing ? LAST : 0);
  const [level, setLevel] = useState<Experience>(existing?.level ?? "new");
  const [known, setKnown] = useState<PuzzleId[]>(existing?.knownPuzzles ?? []), [knownMethods, setKnownMethods] = useState<MethodMap>(existing?.knownMethods ?? {});
  const plan = learningPlan(existing);
  const [learningPuzzles, setLearningPuzzles] = useState<PuzzleId[]>(plan.puzzles), [learningMethods, setLearningMethods] = useState<MethodMap>(plan.methods);
  const priority = learningPuzzles[0] ?? null, priorityMethod = priority ? learningMethods[priority]?.[0] : undefined;
  const [goals, setGoals] = useState<Journey>({}), [saving, setSaving] = useState(false), [error, setError] = useState("");
  const owner = s.user.id;
  const reduced = useReducedMotion();
  const goTo = (next: number) => {
    if (next < 0 || next > LAST || next === step) return;
    setStepDir([next, next > step ? 1 : -1]);
    setReached((r) => Math.max(r, next));
  };
  const finish = async (tour: boolean) => {
    if (saving) return;
    setSaving(true); setError("");
    try {
      await s.updateJourney({ [PROFILE_KEY]: { kind: "profile", level, knownPuzzles: known, knownMethods, priority, learningPuzzles, learningMethods, ...(priorityMethod ? { priorityMethod } : {}), completedAt: existing?.completedAt ?? new Date().toISOString() }, ...goals });
      if (s.user.id !== owner) return;
      s.overlay = "";
      if (priority) { s.pref("cubix.puzzle", priority); s.puzzle = priority; s.loadContext(); }
      goPage(priority && (level === "new" || !known.includes(priority)) ? "learn" : "playground", { puzzle: priority ?? s.puzzle as PuzzleId, learnMethod: priorityMethod }, true);
      s.overlay = tour ? "tour" : ""; s.emit();
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  };
  const advance = () => (step < LAST ? goTo(step + 1) : void finish(true));
  // Enter continues, as in a form: from the page, a heading, a choice card or a tile, never from a button or field.
  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (event.key !== "Enter" || event.defaultPrevented || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey || saving) return;
    if (!event.currentTarget.contains(target) || target.closest("form, input, textarea, select, [role=combobox], [role=listbox]")) return;
    if (target.closest("button, a") && !target.matches("[role=radio], [role=checkbox]")) return;
    event.preventDefault();
    advance();
  };
  const toggle = (set: (fn: (v: PuzzleId[]) => PuzzleId[]) => void, setMethods: (fn: (v: MethodMap) => MethodMap) => void) => (p: PuzzleId) => {
    set((v) => (v.includes(p) ? v.filter((id) => id !== p) : [...v, p]));
    setMethods((v) => Object.fromEntries(Object.entries(v).filter(([id]) => id !== p)));
  };
  const method = (setMethods: (fn: (v: MethodMap) => MethodMap) => void) => (p: PuzzleId, m: string) =>
    setMethods((v) => ({ ...v, [p]: v[p]?.includes(m) ? v[p]!.filter((id) => id !== m) : [...(v[p] ?? []), m] }));
  const drafts = Object.values(goals).filter((g): g is PersonalGoal => !!g && g.kind !== "profile");
  const content = [
    <Welcome />,
    <LevelStep level={level} onChange={setLevel} />,
    <PuzzleStep learning={false} value={known} methods={knownMethods} onToggle={toggle(setKnown, setKnownMethods)} onNone={() => { setKnown([]); setKnownMethods({}); }} onMethod={method(setKnownMethods)} />,
    <PuzzleStep learning value={learningPuzzles} methods={learningMethods} onToggle={toggle(setLearningPuzzles, setLearningMethods)} onMethod={method(setLearningMethods)} />,
    <GoalsStep goals={goals} setGoals={setGoals} suggestions={suggestedGoals(level, known, learningPuzzles, learningMethods)} puzzle={priority ?? known[0] ?? (s.puzzle as PuzzleId)} />,
    <Summary
      rows={[
        { label: "Level", step: 1, value: <span className="flex items-center gap-2.5 text-sm font-medium"><Bars n={LEVELS.findIndex((l) => l.id === level)} />{LEVELS.find((l) => l.id === level)!.label}</span> },
        { label: "Can solve", step: 2, value: <PuzzleList puzzles={known} methods={knownMethods} /> },
        { label: "Learning", step: 3, value: <PuzzleList puzzles={learningPuzzles} methods={learningMethods} first /> },
        { label: "Goals", step: 4, value: drafts.length ? <ul className="flex flex-col gap-1 text-sm">{drafts.map((g) => <li key={titleOf(g)} className="flex items-center gap-2"><span className="text-muted-foreground"><GoalIcon goal={g} /></span>{titleOf(g)}</li>)}</ul> : <span className="text-sm text-muted-foreground">None</span> },
      ]}
    />,
  ][step];
  const slide = reduced ? 0 : 56;
  return (
    <MotionConfig reducedMotion="user">
      <main
        className="journey-setup flex h-svh flex-col overflow-hidden bg-background text-foreground"
        aria-labelledby="journey-title"
        onKeyDown={onKeyDown}
        onClick={(e) => {
          // The summary's Edit buttons jump back to their step.
          const edit = (e.target as HTMLElement).closest<HTMLElement>("[data-step]");
          if (edit) goTo(Number(edit.dataset.step));
        }}
      >
        <header className="flex h-14 shrink-0 items-center gap-4 px-4 md:h-16 md:px-8">
          <span className="flex items-center gap-2.5">
            <Logo size={20} />
            <Wordmark className="text-lg max-sm:hidden" />
          </span>
          <nav aria-label="Setup progress" className="mx-auto flex items-center gap-3">
            <ol className="flex items-center">
              {STEPS.slice(1).map((st, i) => {
                const n = i + 1;
                return (
                  <li key={st.label}>
                    <button
                      type="button"
                      aria-label={st.label}
                      aria-current={n === step ? "step" : undefined}
                      disabled={n > reached || saving}
                      onClick={() => goTo(n)}
                      className="group/dot flex h-6 items-center px-0.5 outline-none disabled:cursor-default"
                    >
                      <span className={cn("h-1.5 w-7 rounded-[2px] transition-colors group-focus-visible/dot:ring-3 group-focus-visible/dot:ring-ring/50 md:w-10", n <= step ? "bg-primary" : n <= reached ? "bg-primary/35" : "bg-muted")} />
                    </button>
                  </li>
                );
              })}
            </ol>
            <span className="w-24 text-xs text-muted-foreground tabular-nums max-sm:w-auto" aria-live="polite">
              {step ? <>{step} / {LAST}<span className="max-sm:hidden"> · {STEPS[step].label}</span></> : "Introduction"}
            </span>
          </nav>
          {existing ? (
            <Button variant="ghost" size="sm" disabled={saving} onClick={() => (history.length > 1 ? go(-1) : goPage("playground"))}>
              Cancel
            </Button>
          ) : (
            <span className="w-[54px] max-sm:hidden" aria-hidden="true" />
          )}
        </header>
        <div className="relative mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-hidden px-4 md:px-8" inert={saving}>
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.section
              key={step}
              custom={dir}
              variants={{ enter: (d: number) => ({ x: d * slide, opacity: 0 }), center: { x: 0, opacity: 1 }, exit: (d: number) => ({ x: -d * slide, opacity: 0 }) }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ x: { type: "spring", stiffness: 520, damping: 42 }, opacity: { duration: 0.14 } }}
              className={cn("flex min-h-0 flex-1 flex-col gap-4 pt-2 pb-4 md:gap-6 md:pt-6 md:pb-6", step === 0 && "justify-center pb-[8vh]")}
            >
              <StepHead title={STEPS[step].title} sub={STEPS[step].sub} />
              {content}
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            </motion.section>
          </AnimatePresence>
        </div>
        <footer className="journey-footer shrink-0 border-t">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2 px-4 py-3 md:px-8">
            <Button variant="ghost" disabled={saving || step === 0} onClick={() => goTo(step - 1)} className={cn(step === 0 && "invisible")}>
              <ArrowLeft />
              Back
            </Button>
            <div className="flex items-center gap-2">
              {step === LAST && (
                <Button variant="outline" disabled={saving} onClick={() => void finish(false)}>
                  {existing ? "Save" : "Skip"}
                </Button>
              )}
              <Button disabled={saving} onClick={advance}>
                {saving ? "Saving…" : step === 0 ? "Get started" : step === LAST ? (existing ? "Save & take the tour" : "Start the tour") : "Continue"}
                {!saving && <ArrowRight />}
                {!saving && (
                  <Kbd aria-hidden="true" className="ml-1 bg-primary-foreground/15 text-primary-foreground max-md:hidden">
                    <CornerDownLeft />
                  </Kbd>
                )}
              </Button>
            </div>
          </div>
        </footer>
      </main>
    </MotionConfig>
  );
}

/* ------------------------------------------------------------------ Goals */

/** A label over its control, both compact. `children` receives the id the label points at. */
function Field({ label, children, className }: { label: string; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">{label}</Label>
      {children(id)}
    </div>
  );
}

/** A select of `options`, named `label` for assistive technology. */
function Pick<T extends string>({ id, label, value, options, onChange }: { id: string; label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <Select items={options} value={value} onValueChange={(next) => next !== null && onChange(next as T)}>
      <SelectTrigger id={id} aria-label={label} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-popover before:hidden">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const DAY = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const dayLabel = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** A deadline: a button showing the date, a month grid in a popover, and a clear button. Dates are UTC days. */
function DatePicker({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  const today = isoDay(new Date());
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => (value || today).slice(0, 7));
  const first = new Date(month + "-01T00:00:00Z"), offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const shift = (by: number) => setMonth(isoDay(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + by, 1))).slice(0, 7));
  return (
    <div className="flex min-w-0 gap-1">
      <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) setMonth((value || today).slice(0, 7)); }}>
        <PopoverTrigger
          render={
            <Button id={id} variant="outline" aria-label={label} className={cn("min-w-0 flex-1 justify-start font-normal", !value && "text-muted-foreground")}>
              <CalendarDays className="text-muted-foreground" />
              <span className="truncate">{value ? dayLabel(value) : "No deadline"}</span>
            </Button>
          }
        />
        <PopoverContent align="start" className="w-auto gap-2 bg-popover p-3">
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => shift(-1)}>
              <ChevronLeft />
            </Button>
            <span className="text-sm font-medium">{first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</span>
            <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => shift(1)}>
              <ChevronRight />
            </Button>
          </div>
          <div role="grid" aria-label="Days" className="grid grid-cols-7 gap-0.5 text-center">
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
              <span key={d} className="pb-1 text-xs text-muted-foreground">{d}</span>
            ))}
            {Array.from({ length: offset }, (_, i) => <span key={"pad" + i} />)}
            {Array.from({ length: days }, (_, i) => {
              const day = isoDay(new Date(first.getTime() + i * DAY));
              return (
                <button
                  key={day}
                  type="button"
                  aria-label={dayLabel(day)}
                  aria-pressed={day === value}
                  disabled={day < today}
                  onClick={() => { onChange(day); setOpen(false); }}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-md text-sm tabular-nums outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:text-muted-foreground/40",
                    day === today && "font-semibold text-primary",
                    day === value && "bg-primary text-primary-foreground hover:bg-primary",
                  )}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      {value && (
        <Button variant="ghost" size="icon" aria-label="Clear the deadline" className="text-muted-foreground" onClick={() => onChange("")}>
          <X />
        </Button>
      )}
    </div>
  );
}

export function GoalForm({ puzzle: initialPuzzle, initial, onSave, onCancel, action = "Add goal" }: { puzzle: PuzzleId; initial?: PersonalGoal; onSave: (goal: PersonalGoal) => void; onCancel?: () => void; action?: string }) {
  const [kind, setKind] = useState<PersonalGoal["kind"]>(initial?.kind ?? "time"), [puzzle, setPuzzle] = useState(initial?.puzzle ?? initialPuzzle);
  const [metric, setMetric] = useState<"single" | "ao5">(initial?.kind === "time" ? initial.metric : "single");
  const [mode, setMode] = useState<SolveMode>(initial?.kind === "time" ? initial.solveMode : "standard");
  const [time, setTime] = useState(initial?.kind === "time" ? String(initial.targetMs / 1000) : "20");
  const [setId, setSetId] = useState(initial?.kind === "learning" ? initial.setId ?? "" : "");
  const [due, setDue] = useState(initial?.dueDate ?? ""), [error, setError] = useState("");
  const sets = (catalog.sets as SetDto[]).filter((set) => puzzleOf(set) === puzzle && catalog.cases.some((c: any) => c.set === set.id && puzzleOf(c) === puzzle));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const targetMs = parseGoalTarget(time);
    if (kind === "time" && targetMs === null) { setError("Enter a time greater than zero, in seconds or m:ss."); return; }
    if (due && !validDueDate(due)) { setError("Choose a valid date."); return; }
    setError("");
    const base = { puzzle, createdAt: initial?.createdAt ?? new Date().toISOString(), ...(due ? { dueDate: due } : {}) };
    onSave(kind === "time" ? { ...base, kind, metric, solveMode: mode, targetMs: targetMs! } : { ...base, kind, setId: setId || null });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <ToggleGroup aria-label="Goal type" variant="outline" spacing={0} value={[kind]} onValueChange={(next: string[]) => next[0] && setKind(next[0] as PersonalGoal["kind"])} className="w-full">
        <ToggleGroupItem value="time" className="flex-1 aria-pressed:bg-muted aria-pressed:text-foreground">
          <Timer />
          Time
        </ToggleGroupItem>
        <ToggleGroupItem value="learning" className="flex-1 aria-pressed:bg-muted aria-pressed:text-foreground">
          <GraduationCap />
          Learning
        </ToggleGroupItem>
      </ToggleGroup>
      <div className="grid grid-cols-2 gap-x-3 gap-y-3.5">
        <Field label="Puzzle">
          {(id) => <Pick id={id} label="Puzzle" value={puzzle} options={PUZZLES.map((p) => ({ value: p.id, label: p.label }))} onChange={(p) => { setPuzzle(p); setMode("standard"); setSetId(""); }} />}
        </Field>
        {kind === "time" ? (
          <>
            <Field label="Event">
              {(id) => <Pick id={id} label="Event" value={mode} options={EVENTS.filter((e) => e.puzzle === puzzle).map((e) => ({ value: e.solveMode, label: e.label }))} onChange={setMode} />}
            </Field>
            <Field label="Result">
              {(id) => <Pick id={id} label="Result" value={metric} options={[{ value: "single", label: "Single" }, { value: "ao5", label: "Average of 5" }]} onChange={setMetric} />}
            </Field>
            <Field label="Target">
              {(id) => (
                <InputGroup>
                  <InputGroupInput id={id} aria-label="Target (seconds)" inputMode="decimal" autoComplete="off" value={time} onChange={(e) => { setTime(e.target.value); setError(""); }} required aria-invalid={!!error && kind === "time" && parseGoalTarget(time) === null} className="tabular-nums" />
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>s</InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
              )}
            </Field>
          </>
        ) : (
          <Field label="Learn">
            {(id) => <Pick id={id} label="Learn" value={setId} options={[{ value: "", label: "Solve this puzzle" }, ...sets.map((set) => ({ value: set.id, label: set.label }))]} onChange={setSetId} />}
          </Field>
        )}
        <Field label="Deadline" className="col-span-2">
          {(id) => <DatePicker id={id} label="Deadline (optional)" value={due} onChange={setDue} />}
        </Field>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit">{action}</Button>
      </div>
    </form>
  );
}

function GoalEditor() {
  const key = s.editGoalKey, initial = s.journey[key];
  const owner = s.user.id, phone = usePhone();
  const [error, setError] = useState(""), [saving, setSaving] = useState(false);
  const dismiss = () => { if (!saving && s.overlay === "personalGoal") close(); };
  const title = key ? "Edit goal" : "Add goal";
  const body = (
    <>
      <div className={saving ? "pointer-events-none opacity-60" : ""} inert={saving}>
        <GoalForm
          puzzle={journeyProfile(s.journey)?.priority ?? (s.puzzle as PuzzleId)}
          initial={initial?.kind !== "profile" ? initial ?? undefined : undefined}
          action={saving ? "Saving…" : key ? "Save goal" : "Add goal"}
          onCancel={dismiss}
          onSave={(goal) => {
            if (saving) return;
            setSaving(true); setError("");
            void s.updateJourney({ [key || goalKey()]: goal }).then(() => { if (owner === s.user.id && s.overlay === "personalGoal") close(); }).catch((e) => { setError(e.message); setSaving(false); });
          }}
        />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </>
  );
  if (phone)
    return (
      <PhoneSheet open onOpenChange={(open) => !open && dismiss()} title={title} className="gap-4">
        {body}
      </PhoneSheet>
    );
  return (
    <Dialog open onOpenChange={(open) => !open && dismiss()}>
      <DialogContent className="gap-4 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{key ? "Change the goal, then save it." : "Tracked on your profile until you reach it."}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ Tour */

/** Focus stays in the tour, the app stays inert, and all listeners leave with it. */
function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null), dismiss = useRef(onClose);
  dismiss.current = onClose;
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const shell = document.querySelector<HTMLElement>("[data-app-shell]");
    const inert = shell?.inert ?? false;
    if (shell) shell.inert = true;
    ref.current?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dismiss.current(); }
      if (event.key !== "Tab") return;
      const buttons = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]') ?? [])].filter((e) => e.getClientRects().length);
      const first = buttons[0], last = buttons.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (!ref.current?.contains(document.activeElement) || document.activeElement === ref.current) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      if (shell) shell.inert = inert;
      if (previous?.isConnected && !previous.closest("[inert]")) previous.focus({ preventScroll: true });
    };
  }, []);
  return ref;
}

interface Box { x: number; y: number; width: number; height: number }
interface Spot { step: number; nav: Box | null; inner: Box[]; vw: number; vh: number }

const EDGE = 4, GAP = 16;
const grow = (r: DOMRect, by: number): Box => ({ x: r.x - by, y: r.y - by, width: r.width + 2 * by, height: r.height + 2 * by });
function clip(b: Box, vw: number, vh: number): Box | null {
  const x = Math.max(EDGE, b.x), y = Math.max(EDGE, b.y), right = Math.min(vw - EDGE, b.x + b.width), bottom = Math.min(vh - EDGE, b.y + b.height);
  return right - x > 8 && bottom - y > 8 ? { x, y, width: right - x, height: bottom - y } : null;
}
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
/** Parts of one element (the digits and their hint) close to each other read as one hole. */
function merge(boxes: Box[]): Box[] {
  const out = [...boxes];
  for (let i = 0; i < out.length; i++)
    for (let j = i + 1; j < out.length; j++) {
      const a = out[i]!, b = out[j]!;
      if (overlap({ x: a.x - 12, y: a.y - 12, width: a.width + 24, height: a.height + 24 }, b) > 0) {
        const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
        out[i] = { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
        out.splice(j, 1);
        j = i;
      }
    }
  return out;
}
const shown = (e: Element) => e.getClientRects().length > 0 && !!e.closest("[data-app-shell]") && !e.closest("[data-exiting]");
/** Brings an element hidden in a scrolled pane into view, without scrolling the window itself. */
function reveal(element: HTMLElement) {
  const r = element.getBoundingClientRect();
  if (r.top >= 0 && r.bottom <= innerHeight) return;
  for (let p = element.parentElement; p && p !== document.body; p = p.parentElement) {
    const style = getComputedStyle(p);
    if (!/(auto|scroll)/.test(style.overflowY) || p.scrollHeight <= p.clientHeight) continue;
    const box = p.getBoundingClientRect();
    p.scrollTop += r.top < box.top ? r.top - box.top - 12 : Math.min(r.top - box.top - 12, r.bottom - box.bottom + 12);
    return;
  }
}
function read(step: number): Spot {
  const st = TOUR_STEPS[step]!, vw = innerWidth, vh = innerHeight;
  const nav = [...document.querySelectorAll<HTMLElement>(`[data-action="nav:${st.target}"]`)].find(shown);
  const inner = [...document.querySelectorAll<HTMLElement>(`[data-tour="${st.inner}"]`)].filter(shown);
  if (inner[0]) reveal(inner[0]);
  const navBox = nav ? clip(grow(nav.getBoundingClientRect(), 3), vw, vh) : null;
  const boxes = inner.map((e) => clip(grow(e.getBoundingClientRect(), 6), vw, vh)).filter((b): b is Box => !!b);
  return { step, nav: navBox, inner: merge(boxes), vw, vh };
}
const round = (spot: Spot) => JSON.stringify(spot, (_, v) => (typeof v === "number" ? Math.round(v) : v));

/** Beside the part of the page, never over it or the tab when there is room; docked top or bottom on phones. */
function place(spot: Spot, card: { width: number; height: number }, phone: boolean) {
  const { vw, vh } = spot, M = 12;
  const clamp = (p: { x: number; y: number }) => ({ x: Math.min(Math.max(M, p.x), vw - card.width - M), y: Math.min(Math.max(M, p.y), vh - card.height - M) });
  const avoid = [...spot.inner, ...(spot.nav ? [spot.nav] : [])];
  const cost = (p: { x: number; y: number }, i: number) => avoid.reduce((sum, b) => sum + overlap({ ...p, ...card }, b), 0) + i;
  const best = (list: { x: number; y: number }[]) => list.map(clamp).map((p, i) => [p, cost(p, i)] as const).sort((a, b) => a[1] - b[1])[0]![0];
  if (phone) {
    const bottomNav = spot.nav && spot.nav.y > vh / 2 ? spot.nav.y - GAP / 2 : vh - M;
    return best([{ x: M, y: bottomNav - card.height }, { x: M, y: M }]);
  }
  const a = spot.inner[0] ?? spot.nav;
  if (!a) return clamp({ x: (vw - card.width) / 2, y: (vh - card.height) / 2 });
  const cx = a.x + a.width / 2 - card.width / 2, cy = a.y + a.height / 2 - card.height / 2;
  return best([
    { x: a.x + a.width + GAP, y: a.y }, { x: a.x + a.width + GAP, y: cy },
    { x: a.x - card.width - GAP, y: a.y }, { x: a.x - card.width - GAP, y: cy },
    { x: a.x, y: a.y + a.height + GAP }, { x: cx, y: a.y + a.height + GAP },
    { x: a.x, y: a.y - card.height - GAP }, { x: cx, y: a.y - card.height - GAP },
    { x: vw - card.width - M, y: M }, { x: vw - card.width - M, y: vh - card.height - M }, { x: M, y: vh - card.height - M },
  ]);
}

function Tour() {
  const [step, setStep] = useState(0), [spot, setSpot] = useState<Spot | null>(null);
  const [card, setCard] = useState({ width: 360, height: 220 });
  const end = () => { s.overlay = ""; s.emit(); };
  const ref = useDialog(end), cardRef = useRef<HTMLDivElement>(null);
  const phone = usePhone(), reduced = useReducedMotion(), mask = useId();
  const last = TOUR_STEPS.length - 1;
  const next = () => (step === last ? end() : setStep(step + 1));
  const back = () => (step ? setStep(step - 1) : end());
  const keys = useRef({ next, back });
  keys.current = { next, back };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLButtonElement && (event.key === "Enter" || event.key === " ")) return;
      if (event.key === "ArrowRight") { event.preventDefault(); keys.current.next(); }
      if (event.key === "ArrowLeft") { event.preventDefault(); keys.current.back(); }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);
  // Open the step's page, wait for its transition to settle (no leaving page, rects still for a frame), then measure;
  // any later resize, scroll or change of the page measures again the same way.
  useEffect(() => {
    const st = TOUR_STEPS[step]!;
    if (location.pathname !== pageUrl(st.page)) goPage(st.page, { puzzle: s.puzzle as PuzzleId }, true);
    let frame = 0, previous = "", since = performance.now();
    const tick = () => {
      frame = 0;
      const now = read(step), key = round(now);
      const moving = !!document.querySelector("[data-exiting]") || location.pathname !== pageUrl(st.page) || s.page !== st.page;
      if ((!moving && key === previous) || performance.now() - since > 2500) {
        setSpot((old) => (old && round(old) === key ? old : now));
        document.querySelectorAll(`[data-tour="${st.inner}"]`).forEach((e) => observer.observe(e));
        return;
      }
      previous = key;
      frame = requestAnimationFrame(tick);
    };
    const schedule = () => {
      if (frame) return;
      previous = ""; since = performance.now();
      frame = requestAnimationFrame(tick);
    };
    const observer = new ResizeObserver(schedule), mutations = new MutationObserver(schedule);
    const shell = document.querySelector("[data-app-shell]");
    if (shell) { observer.observe(shell); mutations.observe(shell, { childList: true, subtree: true }); }
    schedule();
    addEventListener("resize", schedule);
    addEventListener("scroll", schedule, true);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); mutations.disconnect();
      removeEventListener("resize", schedule); removeEventListener("scroll", schedule, true);
    };
  }, [step]);
  useLayoutEffect(() => {
    const element = cardRef.current;
    if (!element) return;
    const measure = () => setCard((c) => (c.width === element.offsetWidth && c.height === element.offsetHeight ? c : { width: element.offsetWidth, height: element.offsetHeight }));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const shownStep = spot?.step ?? step, current = TOUR_STEPS[shownStep]!;
  const spring = reduced ? { duration: 0 } : { type: "spring" as const, stiffness: 380, damping: 36 };
  const holes = spot ? [...(spot.nav ? [{ key: "nav", box: spot.nav }] : []), ...spot.inner.map((box, i) => ({ key: "inner-" + i, box }))] : [];
  const at = spot ? place(spot, card, phone) : { x: 12, y: 12 };
  const width = phone ? Math.max(0, (spot?.vw ?? innerWidth) - 24) : 360;
  return createPortal(
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body" className="journey-tour fixed inset-0 z-[120] overscroll-contain outline-none">
      <svg aria-hidden="true" className="absolute inset-0 size-full">
        <defs>
          <mask id={mask}>
            <rect width="100%" height="100%" fill="white" />
            {holes.map((h) => (
              <motion.rect key={h.key} rx={10} fill="black" initial={false} animate={{ x: h.box.x, y: h.box.y, width: h.box.width, height: h.box.height }} transition={spring} />
            ))}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgb(0 0 0 / 0.62)" mask={`url(#${mask})`} />
      </svg>
      {holes.map((h) => (
        <motion.div
          key={h.key}
          data-spotlight={h.key === "nav" ? "nav" : "inner"}
          aria-hidden="true"
          className={cn("pointer-events-none absolute top-0 left-0 rounded-[10px] border", h.key === "nav" ? "border-primary/50" : "border-2 border-primary")}
          initial={{ opacity: 0, x: h.box.x, y: h.box.y, width: h.box.width, height: h.box.height }}
          animate={{ opacity: 1, x: h.box.x, y: h.box.y, width: h.box.width, height: h.box.height }}
          transition={spring}
        />
      ))}
      <motion.div
        ref={cardRef}
        className="journey-tour-card absolute top-0 left-0 flex flex-col gap-4 rounded-xl border bg-popover p-5 text-popover-foreground shadow-lg"
        style={{ width }}
        initial={false}
        animate={{ x: at.x, y: at.y, opacity: spot ? 1 : 0 }}
        transition={{ x: spring, y: spring, opacity: { duration: reduced ? 0 : 0.15 } }}
      >
        <header className="flex items-center gap-3">
          <span className="flex items-center gap-1" aria-hidden="true">
            {TOUR_STEPS.map((_, i) => (
              <span key={i} className={cn("h-1.5 rounded-[2px] transition-all", i === shownStep ? "w-4 bg-primary" : i < shownStep ? "w-1.5 bg-primary/40" : "w-1.5 bg-muted-foreground/25")} />
            ))}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums" aria-label={`Step ${shownStep + 1} of ${TOUR_STEPS.length}`}>
            {shownStep + 1} / {TOUR_STEPS.length}
          </span>
          <Button size="icon-sm" variant="ghost" aria-label="End tour" className="-my-1 -mr-2 ml-auto text-muted-foreground" onClick={end}>
            <X />
          </Button>
        </header>
        <motion.div key={shownStep} className="flex flex-col gap-1.5" initial={reduced ? false : { opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18 }}>
          <h2 id="tour-title" className="text-lg font-semibold tracking-tight">{current.title}</h2>
          <p id="tour-body" className="text-sm leading-relaxed text-muted-foreground">{current.body}</p>
        </motion.div>
        <footer className="flex items-center justify-between gap-3">
          <Button variant="ghost" className="-ml-2.5" onClick={back}>
            {step ? <><ArrowLeft />Back</> : "Skip tour"}
          </Button>
          <Button onClick={next}>
            {step === last ? "Done" : "Next"}
            {step === last ? <Check /> : <ArrowRight />}
          </Button>
        </footer>
      </motion.div>
    </div>,
    document.body,
  );
}

export function Introduction() {
  return s.overlay === "personalGoal" ? <GoalEditor /> : s.overlay === "tour" ? <Tour /> : null;
}
