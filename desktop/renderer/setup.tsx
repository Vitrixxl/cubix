/** The training setup screen: what to practise, before the timer. */
import { isLearningTrack, isReviewMode, learningCases, learningTrackOf, reviewCases, trainingModeOptions } from "../../src/client/lib/dailyLearning";
import { CROSS_PLUS_ONE_MOVES } from "../../src/shared/crossPlusOne";
import { shortId } from "../../src/client/lib/caseState";
import { BookOpen, Box, Check, ChevronDown, ChevronRight, LayoutGrid, Play, Search, type LucideIcon } from "lucide-react";
import { store as s, catalog, matches } from "./store";
import { Button, Diagram, Figure, LABEL, MONO, PAGE, PageHead, type Props, plural } from "./ui";
import { cn } from "@/lib/utils";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";

type SetupMode = { id: string; label: string; detail: string; icon: LucideIcon };

function setupModes(): SetupMode[] {
  const learned = (cases: any[]) => cases.filter((c) => s.learned.has(c.id)).length;
  return [
    ...(s.puzzle === "333" ? [{ id: "cross1", label: "Cross + 1", detail: `${s.crossMoves}-move first block`, icon: Box }] : []),
    ...trainingModeOptions(s.puzzle).map(({ value, label }) => {
      const pool = isLearningTrack(value) ? learningCases(catalog.cases, value) : [];
      return {
        id: value as string,
        label,
        icon: value === "practice" ? LayoutGrid : value === "review" ? Check : BookOpen,
        detail:
          value === "practice"
            ? plural(s.selected.size, "case") + " selected"
            : value === "review"
              ? plural(reviewCases(catalog.cases, s.learned, s.puzzle).length, "learned case")
              : `${learned(pool)} / ${pool.length} learned`,
      };
    }),
  ];
}

/** The mode the setup screen opens on: the one trained last. */
function defaultSetupMode() {
  if (s.trainingKind === "cross1" && s.puzzle === "333") return "cross1";
  const mode = s.learningMode;
  return isReviewMode(mode) ? "review" : learningTrackOf(mode) ?? "practice";
}

/** Training starts here: the modes listed on the left, the chosen one on the right with what it needs and its start. */
export function TrainingSetup() {
  const modes = setupModes(),
    current = modes.find((m) => m.id === (s.setupMode || defaultSetupMode())) ?? modes[0]!;
  return (
    <div className={PAGE}>
      <PageHead title="Training" puzzle sub="Pick a way to practise, then start" />
      <div className="flex min-h-0 flex-1 gap-12 max-md:flex-col max-md:gap-4">
        <nav aria-label="Training modes" className="-mx-2 flex shrink-0 flex-col gap-0.5 md:w-60 max-md:flex-row max-md:overflow-x-auto">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              data-action={"setupMode:" + m.id}
              aria-current={m === current ? "true" : undefined}
              onClick={(e) => {
                e.currentTarget.blur();
                void s.action("setupMode:" + m.id);
              }}
              className={cn(
                "flex shrink-0 items-center gap-3 rounded-lg px-2.5 py-2 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50",
                m === current && "bg-muted hover:bg-muted",
              )}
            >
              <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground", m === current && "bg-primary/15 text-primary")}>
                <m.icon className="size-4" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{m.label}</span>
                <span className="truncate text-xs text-muted-foreground">{m.detail}</span>
              </span>
            </button>
          ))}
        </nav>
        <section className="flex min-h-0 min-w-0 flex-1 flex-col" key={current.id}>
          {current.id === "cross1" ? <CrossSetup /> : current.id === "practice" ? <CasesSetup /> : <LearningSetup mode={current.id} />}
        </section>
      </div>
    </div>
  );
}

function SetupStart({ action, disabled = false, children }: { action: string; disabled?: boolean } & Props) {
  return (
    <Button action={action} variant="default" size="lg" icon={Play} disabled={disabled} className="px-4">
      {children ?? "Start"}
    </Button>
  );
}

/** The chosen mode's title and description. */
function SetupTitle({ kicker, title, children }: { kicker: string; title: string } & Props) {
  return (
    <header className="flex max-w-xl flex-col gap-1.5">
      <span className={LABEL}>{kicker}</span>
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      {children && <p className="text-sm text-muted-foreground">{children}</p>}
    </header>
  );
}

function CrossSetup() {
  return (
    <div className="flex flex-col gap-8">
      <SetupTitle kicker="First block" title="Cross + 1">
        Scrambles whose back block takes exactly the chosen number of moves.
      </SetupTitle>
      <div className="flex gap-2" role="radiogroup" aria-label="Moves">
        {CROSS_PLUS_ONE_MOVES.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={s.crossMoves === n}
            data-action={"crossMoves:" + n}
            onClick={(e) => {
              e.currentTarget.blur();
              void s.action("crossMoves:" + n);
            }}
            className={cn(
              "flex w-24 flex-col items-start gap-1 rounded-lg px-4 py-3 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50",
              s.crossMoves === n && "bg-muted hover:bg-muted",
            )}
          >
            <span className={cn(MONO, "text-3xl font-medium", s.crossMoves === n && "text-primary")}>{n}</span>
            <span className="text-xs text-muted-foreground">moves</span>
          </button>
        ))}
      </div>
      <div>
        <SetupStart action="trainingStart:cross1" />
      </div>
    </div>
  );
}

function CasesSetup() {
  const cases = s.cases();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SetupTitle kicker="Free practice" title={plural(s.selected.size, "case") + " selected"} />
        <div className="flex items-center gap-2">
          <InputGroup className="w-56">
            <InputGroupInput
              placeholder="Search cases…"
              aria-label="Search cases"
              value={s.query}
              onChange={(e) => {
                s.query = e.target.value;
                s.emit();
              }}
            />
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
          </InputGroup>
          <Button action="clear" disabled={!s.selected.size}>
            Clear
          </Button>
          <SetupStart action="trainingStart:cases:practice" disabled={!s.selected.size} />
        </div>
      </div>
      <div className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2">
        {s.allSets().map((set: any) => {
          const chosen = cases.filter((c: any) => c.set === set.id && matches(c, s.query)),
            count = chosen.filter((c: any) => s.selected.has(c.id)).length,
            open = s.selectorOpen[set.id] ?? (count > 0 || !!s.query);
          if (!chosen.length) return null;
          const groups = [...new Set(chosen.map((c: any) => c.group))] as string[];
          return (
            <section key={set.id} className="flex flex-col pb-2">
              <div className="-mx-2 flex items-center gap-2 rounded-lg pr-1 hover:bg-muted/40">
                <button
                  type="button"
                  data-action={"selectorToggle:" + set.id}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    void s.action("selectorToggle:" + set.id);
                  }}
                  className="flex h-10 min-w-0 flex-1 items-center gap-2.5 px-2 text-left outline-none"
                >
                  {open ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                  <span className="w-10 text-xs font-medium text-muted-foreground">{set.stage}</span>
                  <span className="truncate text-sm font-medium">{set.label}</span>
                  <span className={cn(MONO, "text-xs text-muted-foreground")}>
                    {count} / {chosen.length}
                  </span>
                </button>
                <Button action={"selectSet:" + set.id} size="xs" className="text-muted-foreground">
                  {count === chosen.length ? "Unselect all" : "Select all"}
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
                          onClick={(e) => {
                            e.currentTarget.blur();
                            void s.action("selectGroup:" + set.id + ":" + group);
                          }}
                          className="flex w-fit items-center gap-2 rounded-md px-1 py-0.5 text-xs font-medium text-muted-foreground outline-none hover:text-foreground"
                        >
                          {group}
                          <span className={MONO}>
                            {members.filter((c: any) => s.selected.has(c.id)).length} / {members.length}
                          </span>
                        </button>
                      )}
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(5.25rem,1fr))] gap-1">
                        {members.map((c: any) => {
                          const on = s.selected.has(c.id);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              data-action={"select:" + c.id}
                              aria-pressed={on}
                              title={c.name}
                              onClick={(e) => {
                                e.currentTarget.blur();
                                void s.action("select:" + c.id);
                              }}
                              className={cn(
                                "relative flex flex-col items-center gap-1.5 rounded-lg px-1 pt-2.5 pb-2 text-xs text-muted-foreground outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50",
                                on && "bg-primary/10 text-foreground hover:bg-primary/15",
                              )}
                            >
                              <Diagram c={c} size={56} />
                              <span className="max-w-full truncate">{shortId(c)}</span>
                              {on && (
                                <span className="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                  <Check className="size-3" />
                                </span>
                              )}
                            </button>
                          );
                        })}
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

function LearningSetup({ mode }: { mode: string }) {
  const review = mode === "review",
    track = isLearningTrack(mode) ? mode : undefined,
    pool = track ? learningCases(catalog.cases, track) : reviewCases(catalog.cases, s.learned, s.puzzle),
    learned = pool.filter((c) => s.learned.has(c.id)).length;
  const figures: [string, number][] = review
    ? [["Learned cases", pool.length]]
    : [["Cases", pool.length], ["Learned", learned], ["Left", pool.length - learned]];
  return (
    <div className="flex flex-col gap-8">
      <SetupTitle kicker={review ? "Review" : "Daily learning"} title={review ? "Review learned" : `Learn ${track}`}>
        {review ? "Every case you marked as learned, drawn at random." : `One new ${track} case a day, group by group, until the set is learned.`}
      </SetupTitle>
      <div className="flex gap-12">
        {figures.map(([label, value]) => (
          <Figure key={label} label={label} value={value} size="lg" />
        ))}
      </div>
      <div>
        <SetupStart action={"trainingStart:cases:" + mode} disabled={review && !pool.length} />
      </div>
    </div>
  );
}
