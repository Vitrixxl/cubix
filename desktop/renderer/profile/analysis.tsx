/**
 * The analysis of the solves turned on a smart cube: for every solve together or one method, how long each step
 * takes and how that time splits (recognition, execution), how long each case takes, and the training that would
 * help most. Without a smart cube solve, it says how to get one.
 */
import { useState } from "react";
import { Bluetooth, Dumbbell, Rotate3d, Timer } from "lucide-react";
import { store as s } from "../store";
import { fmtTime } from "../../../src/client/lib/format";
import type { CaseStats, MethodStats, SmartAnalysisDto, StepId, StepStats, TrainingSuggestion } from "../../../src/client/lib/smartStats";
import { Button, Diagram, Empty, FOCUS, Figure, NUMERIC, PageCard, PageHead, ROW, Segmented, Stats, Strip, Tip, plural, run } from "../ui";
import { stepColour } from "../stepColour";
import type { PhaseId } from "../../../src/client/lib/solveAnalysis";
import { CaseDialog } from "../learn";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CARD_TITLE, Section } from "./card";
import { tr } from "../../../src/client/i18n";
import { said } from "../base";

/** Each step in the colour it has under the timer, in the order of a solve; the F2L takes its pairs' middle colour. */
const COLOUR: Record<StepId, PhaseId> = { cross: "cross", eoline: "eoline", fb: "fb", sb: "sb", f2l: "f2l2", cmll: "cmll", oll: "oll", pll: "pll", lse: "lse" };
const seconds = (ms: number) => (ms / 1000).toFixed(2);
const CASE_STEPS = [
  { id: "all", label: "All" },
  { id: "f2l", label: "F2L" },
  { id: "oll", label: "OLL" },
  { id: "pll", label: "PLL" },
  { id: "zbll", label: "ZBLL" },
];

export function AnalysisPage({ phone }: { phone: boolean }) {
  const a: (SmartAnalysisDto & { pending: number }) | null = s.smartAnalysis,
    [methodId, setMethod] = useState("all"),
    method = a?.methods.find((m) => m.id === methodId) ?? a?.methods[0];
  const meta = !a?.count ? undefined : plural(a.count, "smart cube solve") + (a.pending ? " · " + tr("analysing {0} more…", { 0: a.pending }) : "");
  return (
    <>
      <PageHead title={tr("Analysis")} sub={meta}>
        {a && a.methods.length > 1 && (
          <Segmented label="Method" value={method!.id} options={a.methods.map((m) => ({ id: m.id, label: m.id === "all" ? "All" : m.label, count: m.count }))} onChange={setMethod} />
        )}
      </PageHead>
      {!a ? (
        <Skeleton className="min-h-0 flex-1 rounded-xl" />
      ) : !method ? (
        <NoSmartSolves pending={a.pending} />
      ) : (
        <div className={cn("grid min-h-0 flex-1 gap-4", phone ? "grid-cols-1 overflow-y-auto" : "grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem]")}>
          <div className="flex min-h-0 min-w-0 flex-col gap-4">
            {method.count ? (
              <>
                <Summary method={method} />
                <Steps steps={method.steps} />
                <Cases cases={method.cases} phone={phone} />
              </>
            ) : (
              <PageCard scroll={false}>
                <Empty icon={Bluetooth} title={tr("No smart cube solve with {0} yet", { 0: said(method.label) })}>
                  <p className="max-w-md">{tr("Solve with this method on a connected cube: its steps, cases and times show here as soon as one is analysed.")}</p>
                </Empty>
              </PageCard>
            )}
          </div>
          <div className="flex min-h-0 min-w-0 flex-col gap-4">
            <Suggestions suggestions={a.suggestions} />
            <Latest latest={a.latest} />
          </div>
        </div>
      )}
      <CaseDialog />
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

/** The method's figures, then where the time of a solve goes, step by step. */
function Summary({ method }: { method: MethodStats }) {
  const figures: [string, string][] = [
    ["Solves", String(method.count)],
    ["Mean", fmtTime(method.mean)],
    ["Best", fmtTime(method.best)],
    ["Turns", method.turns.toFixed(1)],
    ["TPS", method.tps.toFixed(2)],
    // ZZ and Roux make no cross.
    ...(method.steps.some((step) => step.id === "cross") ? [["XCross", method.count ? `${method.xcross} · ${Math.round((method.xcross / method.count) * 100)}%` : "–"] as [string, string]] : []),
  ];
  return (
    <Strip label="Summary" className="gap-y-4">
      <Stats columns={figures.length}>
        {figures.map(([label, value]) => (
          <Figure key={label} label={said(label)} value={value} caption="plain" size="xl" />
        ))}
      </Stats>
      <ShareBar steps={method.steps} />
    </Strip>
  );
}

/** One bar, each step as wide as its part of the solve, its name and share under it. */
function ShareBar({ steps }: { steps: StepStats[] }) {
  const shown = steps.filter((step) => step.share > 0);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-3 w-full gap-0.5" role="img" aria-label={tr("Time per step: {0}", { 0: shown.map((step) => `${step.label} ${Math.round(step.share * 100)}%`).join(", ") })}>
        {shown.map((step) => (
          <Tip key={step.id} content={tr("{0} · {1} s · {2}% of the solve", { 0: said(step.label), 1: seconds(step.duration), 2: Math.round(step.share * 100) })}>
            <span className="h-full min-w-1 rounded-sm first:rounded-l-full last:rounded-r-full" style={{ flexGrow: step.share, flexBasis: 0, background: stepColour(COLOUR[step.id]) }} />
          </Tip>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        {shown.map((step) => (
          <span key={step.id} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: stepColour(COLOUR[step.id]) }} />
            {said(step.label)}
            <span className={cn(NUMERIC, "text-foreground")}>{Math.round(step.share * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Each step's mean time, how it splits, its turns and pace, and how often it was skipped. */
function Steps({ steps }: { steps: StepStats[] }) {
  return (
    <Section label="Steps" title={tr("Steps")} className="shrink-0" body="pt-0 pb-3">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{tr("Step")}</TableHead>
            <TableHead className="text-right">{tr("Time")}</TableHead>
            <TableHead className="text-right">{tr("Recognition")}</TableHead>
            <TableHead className="text-right">{tr("Execution")}</TableHead>
            <TableHead className="text-right">{tr("Turns")}</TableHead>
            <TableHead className="text-right">{tr("TPS")}</TableHead>
            <TableHead className="text-right">{tr("Skips")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {steps.map((step) => (
            <TableRow key={step.id}>
              <TableCell className="font-medium">
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full" style={{ background: stepColour(COLOUR[step.id]) }} />
                  {said(step.label)}
                </span>
              </TableCell>
              <TableCell className={cn(NUMERIC, "text-right font-medium")}>{step.count ? seconds(step.duration) : "–"}</TableCell>
              <TableCell className={cn(NUMERIC, "text-right text-muted-foreground")}>{step.count && step.id !== "cross" ? seconds(step.recognition) : "–"}</TableCell>
              <TableCell className={cn(NUMERIC, "text-right text-muted-foreground")}>{step.count ? seconds(step.execution) : "–"}</TableCell>
              <TableCell className={cn(NUMERIC, "text-right text-muted-foreground")}>{step.count ? step.turns.toFixed(1) : "–"}</TableCell>
              <TableCell className={cn(NUMERIC, "text-right text-muted-foreground")}>{step.count ? step.tps.toFixed(1) : "–"}</TableCell>
              <TableCell className={cn(NUMERIC, "text-right text-muted-foreground")}>{step.skips || "–"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Section>
  );
}

/** Every case met in the solves, the slowest first: how long it takes, how it splits, and a way to train it. */
function Cases({ cases, phone }: { cases: CaseStats[]; phone: boolean }) {
  const [step, setStep] = useState("all"),
    shown = cases.filter((c) => step === "all" || c.step === step),
    steps = CASE_STEPS.filter((o) => o.id === "all" || cases.some((c) => c.step === o.id));
  return (
    <PageCard
      className={phone ? "min-h-96" : undefined}
      toolbar={
        <>
          <h2 className={CARD_TITLE}>{tr("Cases")}</h2>
          <Segmented label="Step" value={step} options={steps} onChange={setStep} />
          {shown.length > 1 && (
            <Button
              action={
                "trainCases:" +
                shown
                  .slice(0, 5)
                  .map((c) => c.id)
                  .join(",")
              }
              icon={Dumbbell}
              size="sm"
              className="ml-auto text-muted-foreground"
            >
              {tr("Train the")} {Math.min(5, shown.length)} {tr("slowest")}
            </Button>
          )}
        </>
      }
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{tr("Case")}</TableHead>
            <TableHead className="text-right">{tr("Seen")}</TableHead>
            <TableHead className="text-right">{tr("Mean")}</TableHead>
            <TableHead className="text-right">{tr("Best")}</TableHead>
            {!phone && <TableHead className="text-right">{tr("Recognition")}</TableHead>}
            {!phone && <TableHead className="text-right">{tr("Execution")}</TableHead>}
            {!phone && <TableHead className="text-right">{tr("Turns")}</TableHead>}
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((c) => {
            const known = s.find(c.id);
            return (
              <TableRow key={c.id} className="group/row">
                <TableCell>
                  <button
                    type="button"
                    data-action={"caseDialog:" + c.id}
                    onClick={run("caseDialog:" + c.id)}
                    className={cn("flex items-center gap-3 rounded-md text-left font-medium transition-colors hover:text-primary", FOCUS)}
                  >
                    {known && <Diagram c={known} size={32} />}
                    {said(c.name)}
                  </button>
                </TableCell>
                <TableCell className={cn(NUMERIC, "text-right text-muted-foreground")}>{c.count}</TableCell>
                <TableCell className={cn(NUMERIC, "text-right font-medium")}>{seconds(c.duration)}</TableCell>
                <TableCell className={cn(NUMERIC, "text-right text-muted-foreground")}>{seconds(c.best)}</TableCell>
                {!phone && <TableCell className={cn(NUMERIC, "text-right text-muted-foreground")}>{seconds(c.recognition)}</TableCell>}
                {!phone && <TableCell className={cn(NUMERIC, "text-right text-muted-foreground")}>{seconds(c.execution)}</TableCell>}
                {!phone && <TableCell className={cn(NUMERIC, "text-right text-muted-foreground")}>{c.turns.toFixed(1)}</TableCell>}
                <TableCell className="text-right">
                  <Button
                    action={"trainCases:" + c.id}
                    icon={Dumbbell}
                    size="icon-xs"
                    tip={tr("Train this case")}
                    className="text-muted-foreground opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {!shown.length && <Empty>{tr("No case of the catalogue recognised yet.")}</Empty>}
    </PageCard>
  );
}

/** The training that would help most, each a click away. */
function Suggestions({ suggestions }: { suggestions: TrainingSuggestion[] }) {
  return (
    <Section label="Suggested training" title={tr("Suggested training")} className="max-h-[55%] shrink-0" body="gap-1 overflow-y-auto px-3 pt-0 pb-3">
      {!suggestions.length && <Empty className="p-2">{tr("Nothing stands out yet: keep solving on the cube.")}</Empty>}
      {suggestions.map((t) => (
        <div key={t.id} className="flex items-start gap-3 px-2 py-2.5">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-sm font-medium">{said(t.title)}</span>
            <span className="text-xs text-muted-foreground">{said(t.detail)}</span>
          </div>
          <Button action={"smartTrain:" + t.action} icon={Dumbbell} size="sm" variant="outline" className="shrink-0">
            {tr("Train")}
          </Button>
        </div>
      ))}
    </Section>
  );
}

/** The latest analysed solves, each with its steps as one bar; a click opens the solve and its analysis. */
function Latest({ latest }: { latest: (SmartAnalysisDto["latest"][number] & { displayDate?: string })[] }) {
  return (
    <Section
      label="Latest smart cube solves"
      title={
        <span className="flex items-center gap-2">
          {tr("Latest solves")}
          <Rotate3d className="size-3.5 text-muted-foreground" />
        </span>
      }
      className="min-h-0 flex-1"
      body="flex-1 gap-0 overflow-y-auto px-3 pt-0 pb-3"
    >
      {latest.map((solve) => (
        <button key={solve.id} type="button" data-action={"solve:" + solve.id} onClick={run("solve:" + solve.id)} className={cn(ROW, "flex shrink-0 flex-col gap-1.5 px-2 py-2")}>
          <span className="flex items-baseline gap-3">
            <span className={cn(NUMERIC, "text-sm font-medium", solve.time === null && "text-destructive")}>{fmtTime(solve.time, { blank: "DNF" })}</span>
            <span className={cn(NUMERIC, "text-xs text-muted-foreground")}>
              {solve.turns} {tr("turns")}
            </span>
            <span className="ml-auto truncate text-xs text-muted-foreground">{solve.displayDate}</span>
          </span>
          <span className="flex h-1.5 w-full gap-0.5" aria-hidden>
            {(Object.keys(COLOUR) as StepId[])
              .filter((id) => (solve.steps[id] ?? 0) > 0)
              .map((id) => (
                <span key={id} className="h-full min-w-0.5 rounded-full" style={{ flexGrow: solve.steps[id]!, flexBasis: 0, background: stepColour(COLOUR[id]) }} />
              ))}
          </span>
        </button>
      ))}
    </Section>
  );
}
