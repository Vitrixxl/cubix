/** The training setup screen: what to practise, before the timer. */
import { isLearningTrack, isReviewMode, puzzleStages, reviewCases, trainingModeOptions } from "../../src/client/lib/dailyLearning";
import { puzzleOf } from "../../src/shared/puzzles";
import { CROSS_PLUS_ONE_MOVES } from "../../src/shared/crossPlusOne";
import { Box, Check, ChevronDown, ChevronRight, LayoutGrid, Play, type LucideIcon } from "lucide-react";
import { store as s, catalog, matches } from "./store";
import { Back, Button, Diagram, FOCUS, NUMERIC, PAGE, PageHead, ROW, SearchField, Surface, TILE, type Props, plural, run, usePhone } from "./ui";
import { Picker, PickerCard } from "./picker";
import { CaseTile, FootBar, TILES } from "./algorithms";
import { cn } from "@/lib/utils";
import { tr } from "../../src/client/i18n";
import { said } from "./base";

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
        summary: value === "practice" ? tr("Pick the cases you want and drill them, one scramble after another.") : tr("Every case you marked as learned, drawn at random, so none slips away."),
        detail: value === "practice" ? tr("{0} selected", { 0: plural(s.selected.size, "case") }) : plural(reviewCases(catalog.cases, s.learned, s.puzzle).length, "learned case"),
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
        <PageHead title={tr("Training")} puzzle sub={tr("Pick a way to practise")} />
        <Picker label={tr("Training modes")} tour="training">
          {modes.map((m) => (
            <PickerCard key={m.id} action={"setupMode:" + m.id} icon={<m.icon />} title={said(m.label)} detail={said(m.summary)} meta={said(m.detail)} marked={m.id === last} badge={m.id === last ? tr("Last trained") : undefined} />
          ))}
        </Picker>
      </div>
    );
  const body = chosen.id === "cross1" ? <CrossSetup /> : chosen.id === "practice" ? <CasesSetup /> : <ReviewSetup />;
  return (
    <div className={PAGE}>
      <PageHead lead={<Back action="setupMode:" label="Every way to practise" />} title={said(chosen.label)} sub={said(chosen.detail)} puzzle />
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
    <Button action={action} variant="default" size="lg" icon={Play} disabled={disabled} className="max-md:h-11">
      {children}
    </Button>
  );
}

/** Phones: what the start will train and the start, at the bottom of a long list, under the thumb. */
function SetupFoot({ action, disabled = false, children }: { action: string; disabled?: boolean } & Props) {
  return (
    <FootBar className="justify-between gap-4">
      <span className="min-w-0 truncate px-2 text-sm text-muted-foreground">{children}</span>
      <Start action={action} disabled={disabled}>
        {tr("Start")}</Start>
    </FootBar>
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
    <Centred text={tr("Scrambles whose back block takes exactly the chosen number of moves.")}>
      <div className="flex w-full max-w-md gap-3" role="radiogroup" aria-label={tr("Moves")}>
        {CROSS_PLUS_ONE_MOVES.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={s.crossMoves === n}
            data-action={"crossMoves:" + n}
            onClick={run("crossMoves:" + n)}
            className={cn(TILE, "flex flex-1 flex-col items-center gap-1 px-4 py-5 aria-checked:border-primary/50 aria-checked:bg-primary/10")}
          >
            <span className={cn(NUMERIC, "text-4xl font-medium", s.crossMoves === n && "text-primary")}>{n}</span>
            <span className="text-xs text-muted-foreground">{tr("moves")}</span>
          </button>
        ))}
      </div>
      <Start action="trainingStart:cross1">{tr("Start ·")}{" "}{s.crossMoves} {" "}{tr("moves")}</Start>
    </Centred>
  );
}

/** The stages to review, as cards to pick together; the start shows under them once one holds learned cases. */
function ReviewSetup() {
  const stages = puzzleStages(catalog.cases, s.puzzle).map((stage) => {
    const cases = catalog.cases.filter((c: any) => puzzleOf(c) === s.puzzle && c.stage === stage),
      learned = cases.filter((c: any) => s.learned.has(c.id));
    return { stage, cases, learned, sets: [...new Set(cases.map((c: any) => c.setLabel))] as string[] };
  });
  const pool = stages.filter((st) => s.reviewStages.has(st.stage)).reduce((n, st) => n + st.learned.length, 0);
  return (
    <Picker
      label={tr("Stages to review")}
      foot={
        <div className="flex h-11 shrink-0 items-center justify-center pt-6 md:pt-8 box-content">
          {pool > 0 && (
            <Start action="trainingStart:cases:review">
              {tr("Start ·")}{" "}{plural(pool, "case")}
            </Start>
          )}
        </div>
      }
    >
      {stages.map((st) => (
        <PickerCard
          key={st.stage}
          action={"reviewStage:" + st.stage}
          icon={<Diagram c={st.learned[0] ?? st.cases[0]} size={32} />}
          title={said(st.stage)}
          detail={st.sets.join(", ")}
          meta={tr("{0} / {1} learned", { 0: st.learned.length, 1: st.cases.length })}
          pressed={s.reviewStages.has(st.stage) && st.learned.length > 0}
          disabled={!st.learned.length}
        />
      ))}
    </Picker>
  );
}

/** The cases to drill, set by set; the selection's count, the search and the start above them. */
function CasesSetup() {
  const cases = s.cases(),
    phone = usePhone(),
    summary = s.selected.size ? tr("{0} selected", { 0: plural(s.selected.size, "case") }) : tr("Select the cases to practise");
  const search = (
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
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 pt-4 md:px-1 md:pt-1">
        {!phone && <span className={cn(NUMERIC, "text-sm text-muted-foreground")}>{said(summary)}</span>}
        <div className="flex items-center gap-2 max-md:w-full">
          {search}
          <Button action="clear" disabled={!s.selected.size}>
            {tr("Clear")}</Button>
          {!phone && (
            <Start action="trainingStart:cases:practice" disabled={!s.selected.size}>
              {tr("Start")}</Start>
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
              <div className={cn(ROW, "-mx-2 flex items-center gap-2 pr-1")}>
                <button
                  type="button"
                  data-action={"selectorToggle:" + set.id}
                  onClick={run("selectorToggle:" + set.id)}
                  className={cn("flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 text-left", FOCUS)}
                >
                  {open ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                  <span className="w-10 text-xs font-medium text-muted-foreground">{set.stage}</span>
                  <span className="truncate text-sm font-medium">{set.label}</span>
                  <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>
                    {count} / {chosen.length}
                  </span>
                </button>
                <Button action={"selectSet:" + set.id} size="xs" className="text-muted-foreground">
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
                          {group}
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
      {phone && (
        <SetupFoot action="trainingStart:cases:practice" disabled={!s.selected.size}>
          {said(summary)}
        </SetupFoot>
      )}
    </div>
  );
}
