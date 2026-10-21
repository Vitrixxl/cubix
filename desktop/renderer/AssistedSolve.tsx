/**
 * The assisted solve of a 3×3 course: the player's own cube, from the connected cube or read face by face
 * (CubeScan), solved by the player with the course's steps, one step at a time: what the step is for, its tips, the
 * cube it leaves and its algorithms, never the turns themselves. methodSolver.ts says which step the cube stands at.
 * A connected cube says itself when a step is done; for a cube that was read, the player says it, or reads it again.
 *
 * It takes the page's place under the app's header (the whole screen on phones): its own header names the three
 * moments of it (the cube, its colours, the solve), then each screen fits the window.
 */
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Boxes, Camera, Check, ChevronLeft, ChevronRight, Hand, RefreshCw, RotateCcw, ScanLine, Timer, TriangleAlert, Unplug, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { applyAlg, solved, type CubeState } from "../../src/shared/cube";
import { viewForMask } from "../../src/shared/cubeDiagram";
import type { MethodStep, SolvingMethod } from "../../src/shared/methods";
import { assistedCourse, solveMethod } from "../../src/client/lib/methodSolver";
import { stepPicture } from "../../src/client/lib/course";
import { scannedState } from "../../src/client/lib/cubeScan";
import { clock } from "../../src/client/lib/duel";
import { colours, type CatalogCase } from "../../src/client/lib/solveAnalysis";
import { SmartCube, smartCube, stateToFacelets } from "../../src/client/lib/smartCube";
import { StaticCubeSvg } from "../../src/client/diagrams/StaticCubeSvg";
import { CubeScan, HoldNote, Notice, useSquare } from "./CubeScan";
import { LiveCube } from "./LiveCube";
import { ViewButtons } from "./AlgPlayer";
import { CubeView } from "../../src/client/lib/cubeView";
import { call } from "./bridge";
import { store as s } from "./store";
import { ActionCard, Alg, Button, Diagram, FOCUS, StateMark, TILE, usePhone } from "./ui";
import { tr } from "../../src/client/i18n";
import { said } from "./base";

/** The course solved with, and the steps it plays. */
const Course = createContext(assistedCourse("beginner"));
/** The small uppercase caption over a block, as the course's pages write it. */
const SAY = "text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase";

/** The assisted solve, over the course of `method`, while it is open. */
export function AssistedSolve({ method }: { method: string }) {
  const phone = usePhone(),
    course = useMemo(() => assistedCourse(method), [method]),
    [host, setHost] = useState<Element | null>(null);
  useLayoutEffect(() => setHost(document.querySelector('[data-slot="app-main"]')), []);
  useEffect(() => {
    if (!s.assisted) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("[role=dialog], [role=menu], [role=listbox]")) return;
      e.stopPropagation();
      void s.action("assisted:off");
    };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  });
  if (!s.assisted) return null;
  return createPortal(
    <section
      data-assisted=""
      aria-label={tr("Assisted solve")}
      className={cn(
        "flex min-h-0 flex-col bg-background motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200",
        phone || !host ? "fixed inset-0 z-50 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]" : "absolute inset-0 z-30",
      )}
    >
      <Course.Provider value={course}>
        <Assist />
      </Course.Provider>
    </section>,
    phone || !host ? document.body : host,
  );
}

const PHASES = ["Your cube", "Read your cube", "Solve it"];

/**
 * The page: its header (the way back, the title, the three moments of the assisted solve, Close) above the screen.
 * `phase`: 0 to 2, 3 once solved; `skipped`, the reading of a connected cube, which needs none.
 */
function Page({ phase, skipped = false, back, children }: { phase: number; skipped?: boolean; back: () => void; children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-3 pt-2 pb-3 md:gap-4 md:px-6 md:pb-6 lg:px-9">
      <header className="flex shrink-0 items-center gap-2 md:gap-4">
        <button type="button" data-action="assisted:back" onClick={back} aria-label={tr("Back")} className={cn("flex min-w-0 items-center gap-1.5 rounded-xl py-1 pr-2 pl-1 hover:bg-muted", FOCUS)}>
          <ChevronLeft className="size-5 shrink-0" />
          <h1 className="truncate text-lg leading-tight font-extrabold tracking-[-0.02em] md:text-xl">{tr("With my cube")}</h1>
        </button>
        <ol className="mx-auto flex items-center gap-1.5" aria-label={tr("Steps")}>
          {PHASES.map((name, k) => {
            const done = k < phase || (skipped && k === 1),
              current = k === phase;
            return (
              <li key={name} aria-current={current ? "step" : undefined} className="flex items-center gap-1.5">
                {k > 0 && <span aria-hidden="true" className="h-0.5 w-3 rounded-full bg-muted md:w-5" />}
                <span className={cn("flex items-center gap-2 rounded-xl py-1.5 pr-1.5 pl-1.5 text-sm font-bold md:pr-3.5", current ? "bg-card text-foreground" : "text-muted-foreground")}>
                  <span className={cn("flex size-[22px] items-center justify-center rounded-md text-xs", done ? "bg-success text-background" : current ? "bg-primary text-primary-foreground" : "bg-muted")}>
                    {done ? <Check className="size-3.5" strokeWidth={3} aria-label={tr("Done")} /> : k + 1}
                  </span>
                  <span className={cn(!current && "max-lg:hidden", "max-md:hidden")}>{tr(name)}</span>
                </span>
              </li>
            );
          })}
        </ol>
        <span className="md:hidden">
          <Button action="assisted:off" icon={X} tip={tr("Close")} variant="ghost" />
        </span>
        <span className="max-md:hidden">
          <Button action="assisted:off" icon={X} variant="outline">
            {tr("Close")}
          </Button>
        </span>
      </header>
      {children}
    </div>
  );
}

/** Where the cube comes from: the connected cube (only where one can be), the camera, or the colours entered by hand. */
function Assist() {
  const link = useSyncExternalStore(smartCube.subscribe, () => smartCube.snapshot.status, () => smartCube.snapshot.status),
    [source, setSource] = useState<"cube" | "scan" | "hand" | null>(null),
    // The cube read, turned by hand as the player turns theirs.
    model = useMemo(() => new SmartCube(), []),
    [reading, setReading] = useState<false | "camera" | "check">("camera"),
    [round, setRound] = useState(0),
    replan = () => setRound((r) => r + 1);
  // The connected cube gone, the player chooses again.
  useEffect(() => {
    if (source === "cube" && link === "off") setSource(null);
  }, [source, link]);
  if (!source) return <Choose onChoose={(way) => (setSource(way), setReading(way === "hand" ? "check" : "camera"))} />;
  if (source === "cube") return <Solve key={round} cube={smartCube} replan={replan} back={() => setSource(null)} />;
  if (reading)
    return (
      <CubeScan
        key={reading + round}
        hand={reading === "check"}
        initial={round ? colours(model.snapshot.state) : undefined}
        frame={(children, back) => (
          <Page phase={1} back={back ?? (round ? () => setReading(false) : () => setSource(null))}>
            {children}
          </Page>
        )}
        onDone={(read) => {
          model.receive({ type: "facelets", facelets: stateToFacelets(scannedState(read)) });
          setReading(false);
          replan();
        }}
      />
    );
  return <Solve key={round} cube={model} replan={replan} rescan={(how = "camera") => setReading(how)} back={() => setReading("check")} />;
}

/** A cube a little scrambled, for the picture of the connected cube. */
const SCRAMBLED = applyAlg(solved(3), "R U F' L2 D B' R2 U' F");

/** How Qbix sees the cube: three ways side by side, then how to hold it and a scramble for a cube already solved. */
function Choose({ onChoose }: { onChoose: (way: "cube" | "scan" | "hand") => void }) {
  const link = useSyncExternalStore(smartCube.subscribe, () => smartCube.snapshot, () => smartCube.snapshot),
    connectable = (typeof CUBIX_DEV !== "undefined" && CUBIX_DEV) || link.status !== "off",
    [scramble, setScramble] = useState("");
  useEffect(() => {
    call("scramble", { puzzle: "333", solveMode: "standard", scrambleType: "normal" })
      .then((value: string) => setScramble(value))
      .catch(() => {});
  }, []);
  const ways = [
    connectable && {
      id: "cube" as const,
      action: link.status === "on" ? "assisted:cube" : "smartCube",
      onClick: () => (link.status === "on" ? onChoose("cube") : void s.action("smartCube")),
      disabled: link.status === "connecting",
      title: tr("Connected cube"),
      meta: link.status === "on" && link.battery != null ? tr("Battery {0} %", { 0: link.battery }) : link.status === "on" ? link.name : "",
      go: link.status === "on" ? tr("Start") : link.status === "connecting" ? tr("Connecting…") : tr("Connect"),
      picture: (
        <>
          <StateMark tone={link.status === "on" ? "good" : "off"} className="absolute top-3 left-3">
            {link.status === "on" ? tr("Connected · {0}", { 0: link.name }) : link.status === "connecting" ? tr("Connecting…") : tr("Not connected")}
          </StateMark>
          {link.status === "on" ? <LiveCube cube={smartCube} size={150} /> : <StaticCubeSvg state={SCRAMBLED} size={130} />}
        </>
      ),
    },
    {
      id: "scan" as const,
      action: "assisted:scan",
      onClick: () => onChoose("scan"),
      title: tr("Show the faces"),
      meta: tr("Six faces, one at a time"),
      go: tr("Start"),
      picture: <Camera aria-hidden="true" className="size-24 text-muted-foreground" strokeWidth={1.25} />,
    },
    {
      id: "hand" as const,
      action: "assisted:hand",
      onClick: () => onChoose("hand"),
      title: tr("By hand"),
      meta: tr("No camera needed"),
      go: tr("Start"),
      picture: <Hand aria-hidden="true" className="size-24 text-muted-foreground" strokeWidth={1.25} />,
    },
  ].filter((way) => !!way);
  return (
    <Page phase={0} back={() => void s.action("assisted:off")}>
      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] gap-3 md:gap-5">
        <h2 className="text-center text-2xl font-extrabold tracking-[-0.04em] text-balance md:text-[40px] md:leading-tight">{tr("How does Qbix see your cube?")}</h2>
        <div className={cn("grid min-h-0 gap-2.5 max-md:auto-rows-min md:w-full md:content-center md:justify-self-center md:gap-4", ways.length === 3 ? "md:max-w-5xl md:grid-cols-3" : "md:max-w-3xl md:grid-cols-2")}>
          {ways.map((way) => (
            <button key={way.id} type="button" data-action={way.action} disabled={"disabled" in way && way.disabled} onClick={way.onClick} className={cn(TILE, "group flex min-h-0 flex-col gap-3 p-3.5 md:gap-4 md:rounded-[26px] md:p-4")}>
              <span className="relative flex h-52 shrink-0 items-center justify-center rounded-[18px] bg-background transition-colors group-hover:bg-card max-md:hidden">{way.picture}</span>
              <span className="px-1 text-lg font-extrabold tracking-[-0.03em] md:text-[22px]">{way.title}</span>
              <span className="flex items-center justify-between gap-2 px-1 text-[13px] font-bold">
                <span className="truncate text-muted-foreground">{way.meta}</span>
                <span className="flex shrink-0 items-center gap-1 text-primary">
                  {way.go}
                  <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="grid gap-2.5 md:grid-cols-2 md:gap-4">
          <div className="flex items-center gap-4 rounded-[20px] bg-card px-4 py-3 max-md:hidden">
            <HoldNote size={58} />
          </div>
          <div className="flex items-center gap-4 rounded-[20px] bg-card px-4 py-3">
            <StaticCubeSvg state={solved(3)} size={50} className="shrink-0 max-md:hidden" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className={SAY}>{tr("Your cube is already solved?")}</span>
              {scramble && <Alg text={scramble} size={16} className="font-bold text-foreground" />}
            </span>
          </div>
        </div>
      </div>
    </Page>
  );
}

/** The step the cube stands at: the first one its plan still has parts in, the course's length once solved; null when
 * it cannot be solved. */
function stepOf(methodId: string, state: CubeState, steps: number) {
  const parts = solveMethod(methodId, state, s.cases("333") as CatalogCase[]);
  return parts && (parts[0]?.step ?? steps);
}

/** A step of the course as a small cube: what it solves, in its colours. */
function StepCube({ step, size }: { step: number; size: number }) {
  return <StaticCubeSvg state={solved(3)} size={size} mask={stepPicture(useContext(Course).method, step).mask} view="iso" className="shrink-0" />;
}

/** The cube as a step leaves it: what the player aims for. `cube`: the puzzle's size. */
export function StepGoal({ method, index, size, cube = 3 }: { method: SolvingMethod; index: number; size: number; cube?: number }) {
  const picture = stepPicture(method, index);
  return <StaticCubeSvg state={applyAlg(solved(cube), picture.after)} size={size} mask={picture.mask} view={viewForMask(picture.mask)} held={picture.held} />;
}

/** A step's own algorithms and useful moves: each its name, its turns and its note. */
export function StepAlgs({ step }: { step: MethodStep }) {
  const algs = [...(step.algs ?? []), ...(step.help ?? [])];
  if (!algs.length) return null;
  return (
    <ul className="flex flex-col gap-2">
      {algs.map((a) => (
        <li key={a.name + a.alg} className="flex flex-col gap-0.5 rounded-xl bg-muted px-3 py-2">
          <span className="text-[13px] font-semibold">
            {said(a.name)}
            {a.detail && <span className="font-normal text-muted-foreground"> · {said(a.detail)}</span>}
          </span>
          <Alg text={a.alg} size={15} />
          {a.note && <span className="text-[13px] text-muted-foreground">{said(a.note)}</span>}
        </li>
      ))}
    </ul>
  );
}

/** The course's steps across the top: each its cube and its name, done in green, the current one in the accent. */
function Route({ at }: { at: number }) {
  const { steps } = useContext(Course);
  return (
    <ol className="grid shrink-0 gap-1.5 md:gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label={tr("Steps")}>
      {steps.map((st, i) => (
        <li key={st.title} aria-current={i === at ? "step" : undefined} title={said(st.title)} className={cn("flex min-w-0 items-center gap-2.5 rounded-xl px-1.5 py-1.5 md:px-2.5 md:py-2", i === at ? "bg-muted" : "bg-card")}>
          <span className="max-lg:hidden">
            <StepCube step={i} size={34} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className={cn("truncate text-[13px] font-bold max-md:hidden", i > at && "text-muted-foreground")}>{said(st.title)}</span>
            <span className={cn("h-[5px] rounded-full", i < at ? "bg-success" : i === at ? "bg-primary" : "bg-muted-foreground/25")} />
          </span>
        </li>
      ))}
    </ol>
  );
}

/** The algorithms of a step beside the cube: its own, then the cases of the catalogue's set that teaches it. */
function StepAlgorithms({ step }: { step: MethodStep }) {
  const set = step.sets?.[0],
    cases = set ? (s.cases("333") as CatalogCase[]).filter((c) => c.set === set) : [];
  return (
    <section className="flex min-h-0 flex-col gap-3 rounded-[24px] bg-card p-5 max-lg:hidden" aria-label={tr("Algorithms")}>
      <h3 className={SAY}>{tr("Algorithms")}</h3>
      <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1">
        <StepAlgs step={step} />
        {cases.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-xl bg-muted px-2 py-1.5">
            <Diagram c={c} size={44} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13px] font-semibold">{said(c.name)}</span>
              {c.algorithms[0] && <Alg text={c.algorithms[0].alg} size={14} />}
            </span>
          </div>
        ))}
        {!step.algs?.length && !step.help?.length && !cases.length && <p className="text-sm text-muted-foreground">{tr("No algorithm here: this step is solved by thinking it through.")}</p>}
      </div>
    </section>
  );
}

/** The time since the solve started, every second. */
function useClock(start: number, end: number | null) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (end != null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [end]);
  return clock(Math.max(0, (end ?? now) - start));
}

/**
 * The solve: the course's steps across the top, then the step to do now (what it is for, its tips and the cube it
 * leaves), the player's cube and the step's algorithms beside it. Qbix never says the turns: the player solves the step
 * themselves. A connected cube says itself when a step is done; a cube that was read is followed by the player, who
 * says when a step is done and can have it read again.
 */
function Solve({ cube, replan, rescan, back: leave }: { cube: SmartCube; replan: () => void; rescan?: (how?: "camera" | "check") => void; back: () => void }) {
  const manual = !!rescan,
    phone = usePhone(),
    { method, steps } = useContext(Course),
    link = useSyncExternalStore(cube.subscribe, () => cube.snapshot, () => cube.snapshot),
    [first] = useState(() => stepOf(method.id, cube.snapshot.state, steps.length)),
    [at, setAt] = useState(first ?? 0),
    [box, setBox] = useState<HTMLDivElement | null>(null),
    side = useSquare(box),
    [start] = useState(Date.now),
    [view] = useState(() => new CubeView()),
    [end, setEnd] = useState<number | null>(null),
    finished = at >= steps.length,
    time = useClock(start, end);
  useEffect(() => {
    if (finished && end == null) setEnd(Date.now());
  }, [finished, end]);
  // A connected cube is looked at once it has been still a moment: halfway through an algorithm, a step done looks undone.
  useEffect(() => {
    if (manual || first == null || first >= steps.length) return;
    let count = cube.snapshot.count,
      wait = 0;
    const off = cube.subscribe(() => {
      if (cube.snapshot.count === count) return;
      count = cube.snapshot.count;
      clearTimeout(wait);
      wait = window.setTimeout(() => {
        const now = stepOf(method.id, cube.snapshot.state, steps.length);
        if (now != null) setAt(now);
      }, 700);
    });
    return () => (clearTimeout(wait), off());
  }, [cube, manual, first, method, steps]);

  if (first == null || first >= steps.length)
    return (
      <Page phase={2} skipped={!manual} back={leave}>
        {first != null ? (
          <Notice cube={<StaticCubeSvg state={solved(3)} size={phone ? 110 : 150} />} title={tr("Your cube is already solved")} text={manual ? tr("Scramble it, then read it again.") : tr("Scramble it, then start.")}>
            <ActionCard primary icon={manual ? ScanLine : RefreshCw} title={manual ? tr("Read again") : tr("Start")} onClick={manual ? () => rescan() : replan} action="assisted:again" />
          </Notice>
        ) : (
          <Notice icon={TriangleAlert} title={tr("This cube cannot be solved")} text={tr("A piece is twisted or two pieces are swapped. Check the colours.")}>
            {manual && <ActionCard primary icon={Check} title={tr("Check")} onClick={() => rescan("check")} action="assisted:check" />}
            <ActionCard primary={!manual} icon={manual ? ScanLine : RefreshCw} title={manual ? tr("Read again") : tr("Try again")} onClick={manual ? () => rescan() : replan} action="assisted:again" />
          </Notice>
        )}
      </Page>
    );

  if (finished)
    return (
      <Page phase={3} skipped={!manual} back={leave}>
        <Route at={at} />
        <Notice cube={<StaticCubeSvg state={solved(3)} size={phone ? 110 : 170} />} title={tr("Solved!")} text={`${tr("Time")} · ${time}`}>
          <ActionCard primary icon={RotateCcw} title={tr("Again")} onClick={manual ? () => rescan() : replan} action="assisted:again" />
          <ActionCard icon={Timer} title={tr("Timer")} onClick={() => void s.action("nav:playground")} action="nav:playground" />
          <ActionCard icon={Boxes} title={tr("Algorithms")} onClick={() => void s.action("assisted:off")} action="assisted:off" />
        </Notice>
      </Page>
    );

  const step = steps[at]!,
    eyebrow = <span className="truncate text-[13px] font-bold text-primary">{tr("Step {0}", { 0: at + 1 })}</span>;
  return (
    <Page phase={2} skipped={!manual} back={leave}>
      <Route at={at} />
      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[300px_minmax(0,1fr)] md:gap-4 lg:grid-cols-[330px_minmax(0,1fr)_300px]">
        <section className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-[24px] bg-card p-5 max-md:hidden" aria-label={tr("Current step")}>
          {eyebrow}
          <h2 className="text-2xl leading-tight font-extrabold tracking-[-0.03em]">{tr("Now: {0}", { 0: said(step.title) })}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{said(step.text)}</p>
          {!!step.tips?.length && (
            <ol className="flex flex-col gap-2" aria-label={tr("Tips")}>
              {step.tips.map((tip, k) => (
                <li key={tip} className="flex gap-3 text-[13px] leading-relaxed text-muted-foreground">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-muted font-sans text-xs font-bold text-warning tabular-nums">{k + 1}</span>
                  {said(tip)}
                </li>
              ))}
            </ol>
          )}
          {!manual && (
            <figure className="mt-auto flex flex-col items-center gap-1 rounded-[18px] bg-background px-3 py-3">
              <StepGoal method={method} index={at} size={90} />
              <figcaption className="text-xs font-bold text-muted-foreground">{tr("Desired state")}</figcaption>
            </figure>
          )}
        </section>
        <section className="relative flex min-h-0 flex-col items-center justify-center rounded-[26px] bg-card p-3 md:px-8 md:py-4" aria-live="polite">
          <span className="absolute top-3 left-4 md:hidden">{eyebrow}</span>
          {manual && <span className={cn(SAY, "pt-6 md:pt-2")}>{tr("Desired state")}</span>}
          <div ref={setBox} className="flex min-h-0 w-full flex-1 items-center justify-center max-md:pt-6 md:py-10">
            {side > 0 && (manual ? <StepGoal method={method} index={at} size={Math.min(side, 320)} /> : <LiveCube cube={cube} size={side} view={view} />)}
          </div>
          {!manual && (
            <div className="absolute top-3 right-3 flex items-center gap-2 md:top-4 md:right-4">
              <StateMark tone="good" className="rounded-xl bg-muted px-3 py-2 max-md:hidden">
                {tr("Following your {0} live", { 0: link.name })}
              </StateMark>
              <ViewButtons player={view} className="max-md:hidden" />
            </div>
          )}
          <span className="absolute bottom-4 left-6 max-lg:hidden">
            <HoldNote size={46} />
          </span>
        </section>
        <StepAlgorithms step={step} />
      </div>
      <div className={cn("grid shrink-0 gap-2 md:gap-2.5", manual ? "grid-cols-2 md:grid-cols-[300px_200px_minmax(0,1fr)_200px] lg:grid-cols-[330px_230px_minmax(0,1fr)_230px]" : "md:grid-cols-[300px_minmax(0,1fr)_200px] lg:grid-cols-[330px_minmax(0,1fr)_230px]")}>
        <div className="flex justify-between gap-2 rounded-xl bg-card px-4 py-3 text-[13px] font-bold text-muted-foreground max-md:hidden">
          <span>{tr("Time")}</span>
          <span className="font-sans text-foreground tabular-nums">{time}</span>
        </div>
        {manual ? (
          <>
            <ActionCard icon={ChevronLeft} title={tr("Previous step")} onClick={() => setAt(at - 1)} disabled={at <= (first ?? 0)} action="assisted:previous" />
            <ActionCard primary icon={Check} title={<span className="text-lg md:text-xl md:font-extrabold">{tr("Step done")}</span>} onClick={() => setAt(at + 1)} action="assisted:next" className="max-md:order-first max-md:col-span-2" />
            <ActionCard icon={ScanLine} title={tr("Read again")} onClick={() => rescan()} action="assisted:rescan" />
          </>
        ) : (
          <>
            <div className="flex min-w-0 items-center gap-3 rounded-xl bg-card px-4 py-3" role="status">
              <StateMark tone="good">{tr("Qbix sees when the step is done")}</StateMark>
            </div>
            <ActionCard
              icon={Unplug}
              title={link.name}
              text={[link.battery != null && tr("Battery {0} %", { 0: link.battery }), tr("Disconnect")].filter(Boolean).join(" · ")}
              onClick={() => void s.action("smartCube")}
              action="smartCube"
            />
          </>
        )}
      </div>
    </Page>
  );
}
