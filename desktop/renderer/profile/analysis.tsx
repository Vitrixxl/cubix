/**
 * The analysis of the solves turned on a smart cube: for every solve together or one method, how long each step
 * takes and how that time splits (recognition, execution), the board of the cases of a step coloured by what they
 * cost with the chosen case in detail, and the training that would help most, one proposal per tile. Without a
 * smart cube solve, it says how to get one.
 */
import { useState } from "react";
import { Bluetooth, Dumbbell, GraduationCap, History, Timer } from "lucide-react";
import { store as s, catalog } from "../store";
import { fmtTime } from "../../../src/client/lib/format";
import type { CaseStats, CaseStep, MethodStats, SmartAnalysisDto, StepId, StepStats, TrainingSuggestion } from "../../../src/client/lib/smartStats";
import { Alg, Button, Diagram, Empty, FOCUS, LABEL, NUMERIC, PageCard, PageHead, ROW, Segmented, StatCard, Surface, DOT, plural, run } from "../ui";
import { stepColour } from "../stepColour";
import type { PhaseId } from "../../../src/client/lib/solveAnalysis";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button as UiButton } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CARD_TITLE } from "./card";
import { tr } from "../../../src/client/i18n";
import { said } from "../base";

/** Each step in the colour it has under the timer, in the order of a solve; the F2L takes its pairs' middle colour. */
const COLOUR: Record<StepId, PhaseId> = { cross: "cross", eoline: "eoline", fb: "fb", sb: "sb", f2l: "f2l2", cmll: "cmll", oll: "oll", pll: "pll", lse: "lse" };
const seconds = (ms: number) => (ms / 1000).toFixed(2);
/** The latest solves each step's mean is compared with. */
const RECENT = 10;
/** The board's steps, each with the catalogue's cases of it. */
const BOARD: { id: CaseStep; label: string; set: (set: string) => boolean }[] = [
  { id: "f2l", label: "F2L", set: (set) => set === "f2l" },
  { id: "oll", label: "OLL", set: (set) => set === "oll" },
  { id: "pll", label: "PLL", set: (set) => set === "pll" },
  { id: "zbll", label: "ZBLL", set: (set) => set.startsWith("zbll") },
];
const SORTS = [
  { id: "cost", label: "Cost", tip: "What the case costs a solve: its delay on a usual case, as often as it comes" },
  { id: "recognition", label: "Recognition" },
  { id: "count", label: "Frequency" },
];
/** Recognition hatched, execution plain, in a step's colour. */
const hatch = (colour: string) => ({ background: `repeating-linear-gradient(135deg, ${colour} 0 2px, transparent 2px 5px)`, boxShadow: `inset 0 0 0 1px ${colour}` });

type Latest = SmartAnalysisDto["latest"][number] & { displayDate?: string };

/** Only learned cases are trained: the others are learned first. */
const learnedOnly = (ids: string[]) => (s.puzzle === "333" ? ids.filter((id) => s.learned.has(id)) : ids);

export function AnalysisPage({ phone }: { phone: boolean }) {
  const a: (SmartAnalysisDto & { pending: number }) | null = s.smartAnalysis,
    [methodId, setMethod] = useState("all"),
    method = a?.methods.find((m) => m.id === methodId) ?? a?.methods[0];
  const meta = !a?.count ? undefined : plural(a.count, "smart cube solve") + (a.pending ? " · " + tr("analysing {0} more…", { 0: a.pending }) : "");
  return (
    <>
      <PageHead title={tr("Analysis")} sub={meta}>
        {a && !!a.latest.length && <LatestSolves latest={a.latest} />}
        {a && a.methods.length > 1 && (
          <Segmented label="Method" value={method!.id} options={a.methods.map((m) => ({ id: m.id, label: m.id === "all" ? "All" : m.label, count: m.count }))} onChange={setMethod} />
        )}
      </PageHead>
      {!a ? (
        <Skeleton className="min-h-0 flex-1 rounded-xl" />
      ) : !method ? (
        <NoSmartSolves pending={a.pending} />
      ) : !method.count ? (
        <PageCard scroll={false}>
          <Empty icon={Bluetooth} title={tr("No smart cube solve with {0} yet", { 0: said(method.label) })}>
            <p className="max-w-md">{tr("Solve with this method on a connected cube: its steps, cases and times show here as soon as one is analysed.")}</p>
          </Empty>
        </PageCard>
      ) : (
        <Workshop key={method.id} method={method} latest={a.latest} suggestions={a.suggestions} phone={phone} />
      )}
    </>
  );
}

/** Nothing to analyse yet: the analysis needs solves turned on a connected cube. */
function NoSmartSolves({ pending }: { pending: number }) {
  return (
    <Empty icon={Bluetooth} title={pending ? tr("Analysing your smart cube solves…") : tr("Only available for solves done on a connected cube")}>
      {!pending && (
        <>
          <p className="max-w-md">{tr("Connect a smart cube on the 3×3 timer and solve: each solve is split into its steps and its cases, and gathered here.")}</p>
          <Button action="nav:playground" icon={Timer} variant="outline">
            {tr("Open the timer")}
          </Button>
        </>
      )}
    </Empty>
  );
}

/** The steps on top, the board of the cases under them with the chosen case beside, the training plan below. */
function Workshop({ method, latest, suggestions, phone }: { method: MethodStats; latest: Latest[]; suggestions: TrainingSuggestion[]; phone: boolean }) {
  const steps = BOARD.filter((b) => method.steps.some((step) => step.id === b.id) || method.cases.some((c) => c.step === b.id)).filter((b) => b.id !== "zbll" || method.cases.some((c) => c.step === "zbll")),
    [step, setStep] = useState<CaseStep>(() => steps.find((b) => method.cases.some((c) => c.step === b.id))?.id ?? steps[0]?.id ?? "pll"),
    [sort, setSort] = useState("cost"),
    board = boardOf(method, BOARD.find((b) => b.id === step) ?? BOARD[2]!, sort),
    [picked, setPicked] = useState(""),
    chosen = board.tiles.find((t) => t.id === picked) ?? board.tiles[0],
    // The board's slowest learned cases, as it is sorted.
    slowest = learnedOnly(board.tiles.filter((t) => t.stats).map((t) => t.id)).slice(0, 5);
  return (
    <div className={cn("min-h-0 flex-1 gap-4", phone ? "flex flex-col overflow-y-auto [&>*]:shrink-0" : "grid grid-cols-[minmax(0,1fr)_22rem] grid-rows-[auto_minmax(0,1fr)_auto] xl:grid-cols-[minmax(0,1fr)_26rem]")}>
      <Steps method={method} latest={latest} className={phone ? undefined : "col-start-1"} />
      <Surface aria-label={tr("Cases")} className={cn("flex flex-col", phone ? "min-h-[28rem]" : "col-start-1 row-start-2")}>
        <div className="flex shrink-0 flex-wrap items-center gap-2 px-5 pt-4 pb-3">
          {steps.length > 0 && (
            <Segmented
              label="Step"
              value={step}
              options={steps.map((b) => ({
                id: b.id,
                label: (
                  <>
                    {b.label}
                    <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>
                      {method.cases.filter((c) => c.step === b.id).length}/{catalog.cases.filter((c: any) => b.set(c.set)).length}
                    </span>
                  </>
                ),
              }))}
              onChange={(id) => setStep(id as CaseStep)}
            />
          )}
          <Segmented label="Sort" value={sort} options={SORTS} onChange={setSort} />
          <span className="ml-auto flex items-center gap-2 text-xs font-semibold text-muted-foreground max-2xl:hidden" aria-hidden>
            {tr("usual")}
            <span className="h-2 w-20 rounded-full" style={{ background: `linear-gradient(90deg, var(--muted), color-mix(in oklch, var(--destructive) 35%, var(--muted)))` }} />
            {tr("slow")}
          </span>
          {slowest.length > 1 && (
            <Button action={"smartTrain:trainCases:" + slowest.join(",")} icon={Dumbbell} variant="secondary" className="ml-auto 2xl:ml-0" tip={`${tr("Train the")} ${slowest.length} ${tr("slowest")}`}>
              <span className="max-2xl:sr-only">
                {tr("Train the")} {slowest.length} {tr("slowest")}
              </span>
            </Button>
          )}
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] content-start gap-2 overflow-y-auto px-5 pb-5">
          {board.tiles.map((t) => (
            <CaseTile key={t.id} tile={t} on={!phone && t.id === chosen?.id} onPick={() => (phone ? void s.action("caseDialog:" + t.id) : setPicked(t.id))} />
          ))}
          {!board.tiles.length && <Empty className="col-span-full">{tr("No case of the catalogue recognised yet.")}</Empty>}
        </div>
      </Surface>
      {!phone && <CaseSheet tile={chosen} usual={board.usual} step={step} className="col-start-2 row-span-2 row-start-1" />}
      <Plan suggestions={suggestions} className={phone ? undefined : "col-span-2"} />
    </div>
  );
}

type Tile = { id: string; name: string; known: any; stats?: CaseStats; heat: number };

/** The catalogue's cases of a step, with the ones of it met elsewhere (two-look), sorted; never met ones last. */
function boardOf(method: MethodStats, step: (typeof BOARD)[number], sort: string) {
  const seen = method.cases.filter((c) => c.step === step.id),
    usual = seen.length ? seen.reduce((t, c) => t + c.duration, 0) / seen.length : 0,
    byId = new Map(seen.map((c) => [c.id, c])),
    ids = [...catalog.cases.filter((c: any) => step.set(c.set)).map((c: any) => c.id as string), ...seen.map((c) => c.id)].filter((id, i, all) => all.indexOf(id) === i),
    key = (c: CaseStats) => (sort === "recognition" ? c.recognition : sort === "count" ? c.count : (c.duration - usual) * c.count);
  const tiles: Tile[] = ids.map((id) => {
    const stats = byId.get(id),
      known = s.find(id);
    // A case 1.2 s slower than a usual one of its step takes the full red.
    return { id, name: stats?.name ?? known?.name ?? id, known, stats, heat: stats ? Math.max(0, Math.min(1, (stats.duration - usual) / 1200)) : 0 };
  });
  tiles.sort((a, b) => (a.stats && b.stats ? key(b.stats) - key(a.stats) : a.stats ? -1 : b.stats ? 1 : 0));
  return { tiles, usual };
}

function CaseTile({ tile, on, onPick }: { tile: Tile; on: boolean; onPick: () => void }) {
  const c = tile.stats;
  return (
    <button
      type="button"
      aria-pressed={on}
      data-case={tile.id}
      onClick={onPick}
      className={cn(
        "relative flex flex-col items-center gap-1 rounded-2xl px-1.5 pt-2.5 pb-2 transition-colors hover:bg-muted aria-pressed:bg-accent",
        FOCUS,
        !c && "ring-1 ring-muted ring-inset",
      )}
      style={c ? { background: `color-mix(in oklch, var(--destructive) ${Math.round(tile.heat * 35)}%, var(--muted))` } : undefined}
    >
      {c && <span className={cn(NUMERIC, "absolute top-1.5 right-2 text-[11px] font-bold text-muted-foreground")}>×{c.count}</span>}
      <span className={cn(!c && "opacity-35")}>{tile.known ? <Diagram c={tile.known} size={44} /> : <span className="block size-11" />}</span>
      <b className="max-w-full truncate text-sm">{said(tile.name)}</b>
      <span className={cn(NUMERIC, "text-[13px] font-bold", c ? "text-foreground/80" : "font-semibold text-muted-foreground")}>{c ? `${seconds(c.duration)} s` : tr("never seen")}</span>
    </button>
  );
}

/** The chosen case: what it costs, its figures, its algorithm and how to train it. */
function CaseSheet({ tile, usual, step, className }: { tile?: Tile; usual: number; step: CaseStep; className?: string }) {
  if (!tile) return <Surface className={className} />;
  const c = tile.stats,
    learned = s.learned.has(tile.id),
    delta = c ? c.duration - usual : 0,
    alg = s.learnedAlgs[tile.id]?.[0] ?? tile.known?.algorithms?.[0]?.alg,
    stage = BOARD.find((b) => b.id === step)!.label;
  return (
    <Surface aria-label={said(tile.name)} className={cn("flex flex-col gap-4 overflow-y-auto p-5", className)}>
      <div className="flex items-center gap-4">
        {tile.known && <Diagram c={tile.known} size={76} />}
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="truncate text-2xl font-extrabold tracking-[-0.03em]">{said(tile.name)}</h3>
          <span className="text-[13px] font-semibold text-muted-foreground">
            {stage} · {c ? tr("seen {0} times in your solves", { 0: c.count }) : tr("never seen in your solves")}
          </span>
          {c && Math.abs(delta) >= 50 && (
            <span className={cn(NUMERIC, "text-[13px] font-bold", delta > 0 ? "text-destructive" : "text-success")}>
              {tr(delta > 0 ? "{0} s slower than a usual {1}" : "{0} s faster than a usual {1}", { 0: seconds(Math.abs(delta)), 1: stage })}
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {learned ? (
          <Button action={"trainCases:" + tile.id} icon={Dumbbell} variant="default">
            {tr("Train this case")}
          </Button>
        ) : (
          <Button action={"case:" + tile.id} icon={GraduationCap} variant="default" tip={tr("Only learned cases are trained")}>
            {tr("Learn")}
          </Button>
        )}
        <Button action={"caseDialog:" + tile.id} variant="secondary">
          {tr("Open the case")}
        </Button>
      </div>
      {c && (
        <div className="grid grid-cols-2 gap-2">
          <StatCard label={tr("Mean")} value={`${seconds(c.duration)} s`} dot={DOT.accent} size="sm" className="bg-muted" />
          <StatCard label={tr("Best")} value={`${seconds(c.best)} s`} dot={DOT.good} size="sm" className="bg-muted" />
          <StatCard label={tr("Recognition")} value={`${seconds(c.recognition)} s`} dot={DOT.warning} size="sm" className="bg-muted" />
          <StatCard label={`${tr("Execution")} · ${tr("{0} turns", { 0: c.turns.toFixed(1) })}`} value={`${seconds(c.execution)} s`} dot={DOT.lilac} size="sm" className="bg-muted" />
        </div>
      )}
      {alg && (
        <div className="flex flex-col gap-2">
          <span className={LABEL}>{tr("Algorithm")}</span>
          <Alg text={alg} size={16} />
        </div>
      )}
    </Surface>
  );
}

/** Each step as a lying bar, as long as its mean time: its recognition hatched, its execution plain, the figures beside. */
function Steps({ method, latest, className }: { method: MethodStats; latest: Latest[]; className?: string }) {
  const steps = method.steps.filter((step) => step.count),
    longest = Math.max(...steps.map((step) => step.duration), 1),
    recent = latest.filter((l) => method.id === "all" || l.method === method.id).slice(0, RECENT),
    // Too few solves: the latest are the mean itself.
    compare = method.count > RECENT * 2 && recent.length === RECENT,
    head = cn(LABEL, "text-right md:whitespace-nowrap");
  const figures = [
    [tr("Mean"), fmtTime(method.mean)],
    [tr("Best"), fmtTime(method.best)],
    [tr("Turns"), method.turns.toFixed(1)],
    [tr("TPS"), method.tps.toFixed(2)],
    ...(method.steps.some((step) => step.id === "cross") ? [[tr("XCross"), `${Math.round((method.xcross / method.count) * 100)} %`]] : []),
  ];
  return (
    <Surface aria-label={tr("Steps")} className={cn("flex flex-col gap-3 px-5 pt-4 pb-4", className)}>
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <h2 className={CARD_TITLE}>{tr("Steps")}</h2>
        {figures.map(([label, value]) => (
          <span key={label} className="text-[13px] font-semibold text-muted-foreground">
            {label} <b className={cn(NUMERIC, "text-foreground")}>{value}</b>
          </span>
        ))}
        <span className={cn(LABEL, "ml-auto flex items-center gap-x-4")}>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-5 rounded-[3px]" style={hatch("var(--muted-foreground)")} />
            {tr("Recognition")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-5 rounded-[3px] bg-muted-foreground" />
            {tr("Execution")}
          </span>
        </span>
      </div>
      <div className="grid grid-cols-[auto_minmax(3rem,1fr)_auto_auto] items-center gap-x-2.5 gap-y-2 md:grid-cols-[auto_minmax(4rem,1fr)_repeat(3,auto)] md:gap-x-4">
        <span className={LABEL}>{tr("Step")}</span>
        <span />
        <span className={head}>{tr("Time")}</span>
        <span className={head}>{compare ? tr("Last {0} vs mean", { 0: RECENT }) : ""}</span>
        <span className={cn(head, "max-md:hidden")}>
          {tr("Turns")} · {tr("TPS")}
        </span>
        {steps.map((step) => (
          <StepRow key={step.id} step={step} longest={longest} delta={compare ? average(recent.map((l) => l.steps[step.id] ?? 0).filter((t) => t > 0)) - step.duration : null} />
        ))}
      </div>
    </Surface>
  );
}

const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

function StepRow({ step, longest, delta }: { step: StepStats; longest: number; delta: number | null }) {
  const colour = stepColour(COLOUR[step.id]),
    // The cross is planned during the inspection: all of it is turning.
    recognition = step.id === "cross" ? 0 : step.recognition;
  return (
    <>
      <span className="flex items-center gap-2 text-sm font-bold whitespace-nowrap">
        <span className="size-2.5 rounded-full" style={{ background: colour }} />
        {said(step.label)}
        <span className={cn(NUMERIC, "text-xs font-semibold text-muted-foreground")}>{Math.round(step.share * 100)} %</span>
      </span>
      <span
        className="flex h-5 items-stretch gap-0.5"
        style={{ width: `${(step.duration / longest) * 100}%` }}
        role="img"
        aria-label={tr("{0}: recognition {1} s, execution {2} s", { 0: said(step.label), 1: seconds(recognition), 2: seconds(step.duration - recognition) })}
      >
        {recognition > 0 && (
          <span className="flex min-w-0 items-center justify-center overflow-hidden rounded-l-md text-[11px] font-bold" style={{ flex: recognition, ...hatch(colour) }}>
            <span className={cn(NUMERIC, "rounded-sm bg-card px-1 max-md:hidden")}>{seconds(recognition)}</span>
          </span>
        )}
        <span className={cn("flex min-w-0 items-center justify-center overflow-hidden rounded-r-md text-[11px] font-bold text-black/70", !recognition && "rounded-l-md")} style={{ flex: step.duration - recognition, background: colour }}>
          <span className={cn(NUMERIC, "max-md:hidden")}>{seconds(step.duration - recognition)}</span>
        </span>
      </span>
      <span className={cn(NUMERIC, "text-right text-base font-extrabold")}>{seconds(step.duration)} s</span>
      <span className={cn(NUMERIC, "text-right text-sm font-bold", delta == null ? "" : delta <= -50 ? "text-success" : delta >= 50 ? "text-destructive" : "text-muted-foreground")}>
        {delta == null ? "" : `${delta > 0 ? "+" : "−"}${seconds(Math.abs(delta))} s`}
      </span>
      <span className={cn(NUMERIC, "text-right text-sm text-muted-foreground max-md:hidden")}>
        {tr("{0} turns", { 0: step.turns.toFixed(1) })} · {step.tps.toFixed(1)}
        {step.skips > 0 && ` · ${tr("Skips")} ${step.skips}`}
      </span>
    </>
  );
}

/** The training that would help most: one tile per proposal, its reason in figures and its button. */
function Plan({ suggestions, className }: { suggestions: TrainingSuggestion[]; className?: string }) {
  return (
    <section aria-label={tr("Suggested training")} className={cn("flex min-w-0 flex-col gap-2 md:flex-row md:items-stretch", className)}>
      <h2 className={cn(CARD_TITLE, "shrink-0 md:sr-only")}>{tr("To work on")}</h2>
      {!suggestions.length && <p className="self-center text-sm text-muted-foreground">{tr("Nothing stands out yet: keep solving on the cube.")}</p>}
      <div className="grid min-w-0 flex-1 gap-2 md:auto-cols-[minmax(15rem,1fr)] md:grid-flow-col md:overflow-x-auto">
        {suggestions.map((t) => (
          <Proposal key={t.id} suggestion={t} />
        ))}
      </div>
    </section>
  );
}

function Proposal({ suggestion: t }: { suggestion: TrainingSuggestion }) {
  // Cases to train: only the learned ones; none learned, the first is learned first.
  const cases = t.action.startsWith("trainCases:") ? t.action.slice("trainCases:".length).split(",") : null,
    learned = cases && learnedOnly(cases),
    learn = /^(learnFrom|trainingStart:cases):/.test(t.action) || (learned && !learned.length),
    action = learned?.length ? "smartTrain:trainCases:" + learned.join(",") : learn && cases ? "case:" + cases[0] : "smartTrain:" + t.action;
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[20px] bg-card px-4 pt-3 pb-3">
      <div className="flex min-w-0 items-center gap-3">
        <b className="min-w-0 flex-1 truncate text-sm" title={said(t.title)}>
          {said(t.title)}
        </b>
        <Button action={action} icon={learn ? GraduationCap : Dumbbell} variant="secondary" className="shrink-0" tip={learn && cases ? tr("Only learned cases are trained") : undefined}>
          {learn ? tr("Learn") : tr("Train")}
        </Button>
      </div>
      <span className="line-clamp-2 text-xs font-medium text-muted-foreground" title={said(t.detail)}>
        {said(t.detail)}
      </span>
    </div>
  );
}

/** The latest analysed solves in a pop-over, each with its steps as one bar; a click opens the solve and its analysis. */
function LatestSolves({ latest }: { latest: Latest[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<UiButton variant="secondary" data-action="analysis:latest" />}>
        <History />
        {tr("Latest solves")}
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[70svh] w-96 gap-0 overflow-y-auto p-1">
        <span className={cn(LABEL, "px-3 pt-2 pb-2")}>{tr("Latest smart cube solves")}</span>
        {latest.map((solve) => (
          <button key={solve.id} type="button" data-action={"solve:" + solve.id} onClick={(e) => (setOpen(false), run("solve:" + solve.id)(e))} className={cn(ROW, "flex shrink-0 items-center gap-3 rounded-(--radius-inner) px-3 py-2")}>
            <span className={cn(NUMERIC, "w-14 text-sm font-bold", solve.time === null && "text-destructive")}>{fmtTime(solve.time, { blank: "DNF" })}</span>
            <span className="flex h-1.5 flex-1 gap-0.5" aria-hidden>
              {(Object.keys(COLOUR) as StepId[])
                .filter((id) => (solve.steps[id] ?? 0) > 0)
                .map((id) => (
                  <span key={id} className="h-full min-w-0.5 rounded-full" style={{ flexGrow: solve.steps[id]!, flexBasis: 0, background: stepColour(COLOUR[id]) }} />
                ))}
            </span>
            <span className="w-28 truncate text-right text-xs text-muted-foreground">{solve.displayDate}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
