/** The training setup screen: what to practise, before the timer. */
import { isLearningTrack, isReviewMode, reviewCases, trainingModeOptions } from "../../src/client/lib/dailyLearning";
import { CROSS_PLUS_ONE_MOVES } from "../../src/shared/crossPlusOne";
import { shortId } from "../../src/client/lib/caseState";
import { Box, Check, ChevronDown, ChevronLeft, ChevronRight, LayoutGrid, Play, Search, type LucideIcon } from "lucide-react";
import { store as s, catalog, matches } from "./store";
import { Button, Diagram, Figure, NUMERIC, PAGE, PageHead, Surface, type Props, plural, run, usePhone } from "./ui";
import { Picker, PickerCard } from "./picker";
import { cn } from "@/lib/utils";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";

type SetupMode = { id: string; label: string; summary: string; detail: string; icon: LucideIcon };

/** The ways to practise; learning a set case by case belongs to Learn, not here. */
function setupModes(): SetupMode[] {
  return [
    ...(s.puzzle === "333" ? [{ id: "cross1", label: "Cross + 1", summary: "Scrambles whose first block takes an exact number of moves, to plan it in inspection.", detail: `${s.crossMoves}-move first block`, icon: Box }] : []),
    ...trainingModeOptions(s.puzzle)
      .filter(({ value }) => !isLearningTrack(value))
      .map(({ value, label }) => ({
        id: value as string,
        label,
        icon: value === "practice" ? LayoutGrid : Check,
        summary: value === "practice" ? "Pick the cases you want and drill them, one scramble after another." : "Every case you marked as learned, drawn at random, so none slips away.",
        detail: value === "practice" ? plural(s.selected.size, "case") + " selected" : plural(reviewCases(catalog.cases, s.learned, s.puzzle).length, "learned case"),
      })),
  ];
}

/** The mode trained last, marked on the choice. */
function lastSetupMode() {
  if (s.trainingKind === "cross1" && s.puzzle === "333") return "cross1";
  return isReviewMode(s.learningMode) ? "review" : "practice";
}

/** Training starts here: the ways to practise as large cards in the middle; the chosen one on its own page, its Start beside what it needs. */
export function TrainingSetup() {
  const modes = setupModes(),
    chosen = modes.find((m) => m.id === s.setupMode),
    last = lastSetupMode(),
    phone = usePhone();
  if (!chosen)
    return (
      <div className={PAGE}>
        <PageHead title="Training" puzzle sub="Pick a way to practise" />
        <Picker label="Training modes" tour="training">
          {modes.map((m) => (
            <PickerCard key={m.id} action={"setupMode:" + m.id} icon={<m.icon />} title={m.label} detail={m.summary} meta={m.detail} marked={m.id === last} badge={m.id === last ? "Last trained" : undefined} />
          ))}
        </Picker>
      </div>
    );
  const body = chosen.id === "cross1" ? <CrossSetup /> : chosen.id === "practice" ? <CasesSetup /> : <ReviewSetup />;
  return (
    <div className={PAGE}>
      <PageHead lead={<Button action="setupMode:" icon={ChevronLeft} tip="Every way to practise" className="size-8 max-md:size-10" />} title={chosen.label} sub={chosen.detail} puzzle />
      {phone && chosen.id === "practice" ? (
        <Surface className="flex-1" key={chosen.id}>
          {body}
        </Surface>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col" key={chosen.id}>
          {body}
        </div>
      )}
    </div>
  );
}

/** The start of a mode, large. */
function Start({ action, disabled = false, children }: { action: string; disabled?: boolean } & Props) {
  return (
    <Button action={action} variant="default" size="lg" icon={Play} disabled={disabled} className="h-11 px-6">
      {children}
    </Button>
  );
}

/** Phones: what the start will train and the start, at the bottom of a long list, under the thumb. */
function SetupFoot({ action, disabled = false, children }: { action: string; disabled?: boolean } & Props) {
  return (
    <footer className="flex shrink-0 items-center justify-between gap-4 border-t bg-muted/30 px-4 py-3">
      <span className="min-w-0 truncate text-sm text-muted-foreground">{children}</span>
      <Start action={action} disabled={disabled}>
        Start
      </Start>
    </footer>
  );
}

/** A mode whose whole choice fits: its line, what it needs, then its start, together in the middle of the page. */
function Centred({ text, children }: { text: string } & Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 overflow-y-auto px-4 py-6 text-center">
      <p className="max-w-md text-sm text-muted-foreground">{text}</p>
      {children}
    </div>
  );
}

function CrossSetup() {
  return (
    <Centred text="Scrambles whose back block takes exactly the chosen number of moves.">
      <div className="flex w-full max-w-md gap-3" role="radiogroup" aria-label="Moves">
        {CROSS_PLUS_ONE_MOVES.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={s.crossMoves === n}
            data-action={"crossMoves:" + n}
            onClick={run("crossMoves:" + n)}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 rounded-xl border bg-card px-4 py-5 outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring/50",
              s.crossMoves === n && "border-primary/50 bg-primary/10 hover:border-primary/50",
            )}
          >
            <span className={cn(NUMERIC, "text-4xl font-medium", s.crossMoves === n && "text-primary")}>{n}</span>
            <span className="text-xs text-muted-foreground">moves</span>
          </button>
        ))}
      </div>
      <Start action="trainingStart:cross1">Start · {s.crossMoves} moves</Start>
    </Centred>
  );
}

function ReviewSetup() {
  const pool = reviewCases(catalog.cases, s.learned, s.puzzle);
  return (
    <Centred text="Every case you marked as learned, drawn at random.">
      <Figure label="Learned cases" value={pool.length} size="2xl" />
      <Start action={"trainingStart:cases:review"} disabled={!pool.length}>
        Start
      </Start>
    </Centred>
  );
}

/** The cases to drill, set by set; the selection's count, the search and the start above them. */
function CasesSetup() {
  const cases = s.cases(),
    phone = usePhone(),
    summary = s.selected.size ? plural(s.selected.size, "case") + " selected" : "Select the cases to practise";
  const search = (
    <InputGroup className="w-56 max-md:w-full">
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
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 pt-4 md:px-1 md:pt-1">
        {!phone && <span className={cn(NUMERIC, "text-sm text-muted-foreground")}>{summary}</span>}
        <div className="flex items-center gap-2 max-md:w-full">
          {search}
          <Button action="clear" disabled={!s.selected.size}>
            Clear
          </Button>
          {!phone && (
            <Start action="trainingStart:cases:practice" disabled={!s.selected.size}>
              Start
            </Start>
          )}
        </div>
      </header>
      {/* The set and group rows reach 8px past their text (-mx-2): the list's padding holds them, so nothing scrolls sideways. */}
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto border-t px-2 pt-2">
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
                  onClick={run("selectorToggle:" + set.id)}
                  className="flex h-10 min-w-0 flex-1 items-center gap-2.5 px-2 text-left outline-none"
                >
                  {open ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                  <span className="w-10 text-xs font-medium text-muted-foreground">{set.stage}</span>
                  <span className="truncate text-sm font-medium">{set.label}</span>
                  <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>
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
                          onClick={run("selectGroup:" + set.id + ":" + group)}
                          className="flex w-fit items-center gap-2 rounded-md px-1 py-0.5 text-xs font-medium text-muted-foreground outline-none hover:text-foreground"
                        >
                          {group}
                          <span className={NUMERIC}>
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
                              onClick={run("select:" + c.id)}
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
      {phone && (
        <SetupFoot action="trainingStart:cases:practice" disabled={!s.selected.size}>
          {summary}
        </SetupFoot>
      )}
    </div>
  );
}
