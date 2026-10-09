/**
 * The assisted solve of the 3×3 beginner course: the player's own cube, from the connected cube or read face by face
 * (CubeScan), solved with the course's steps (beginnerSolver.ts), turn by turn on a 3D model of it. A connected cube
 * follows each turn itself; a cube that was read is followed by hand, a turn at a time. A player who got lost carries on
 * from where the cube stands, or reads it again.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Bluetooth, Camera, Check, ChevronLeft, ChevronRight, LoaderCircle, Paintbrush, Play, RefreshCw, RotateCcw, ScanLine, TriangleAlert, Undo2, X, type LucideIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button as UiButton } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { applyAlg, invertToken, type CubeState, type Face } from "../../src/shared/cube";
import { METHODS } from "../../src/shared/methods";
import { solveBeginner } from "../../src/client/lib/beginnerSolver";
import { scannedState } from "../../src/client/lib/cubeScan";
import { clock } from "../../src/client/lib/duel";
import { colours } from "../../src/client/lib/solveAnalysis";
import { ScrambleTracker, type ScrambleProgress, type TurnProgress } from "../../src/client/lib/scrambleTracker";
import { SmartCube, canonicalTurn, smartCube, stateToFacelets } from "../../src/client/lib/smartCube";
import { CubeScan, hex, useSquare } from "./CubeScan";
import { LiveCube } from "./LiveCube";
import { ViewButtons } from "./AlgPlayer";
import { Swatch } from "./SolveView";
import { CubeView } from "../../src/client/lib/cubeView";
import { store as s } from "./store";
import { Bar, Button, Empty, Figure, IconTile, LABEL, NUMERIC, SectionHead, StatusMark, Strip, TILE, Tip, plural, usePhone } from "./ui";
import { tr } from "../../src/client/i18n";
import { Back, said } from "./base";

const STEPS = METHODS["333"].find((m) => m.id === "beginner")!.steps;

/** The assisted solve, over the course: a workspace of its own, the whole screen on phones, nearly on larger ones. */
export function AssistedSolve() {
  return (
    <Dialog open={s.assisted} onOpenChange={(next) => !next && void s.action("assisted:off")}>
      {s.assisted && <Assist />}
    </Dialog>
  );
}

/** The whole screen on phones; on larger ones nearly for the solve itself, else a window as tall as its content. */
function Workspace({ small, children }: { small: boolean; children: React.ReactNode }) {
  return (
    <DialogContent
      showCloseButton={false}
      className={cn(
        "inset-0 flex w-auto max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none p-0 ring-0 sm:max-w-none max-md:pt-[env(safe-area-inset-top)] max-md:pb-[env(safe-area-inset-bottom)] md:rounded-xl md:ring-1",
        small ? "md:inset-auto md:top-1/2 md:left-1/2 md:max-h-[calc(100svh-2rem)] md:w-full md:max-w-3xl md:-translate-x-1/2 md:-translate-y-1/2" : "md:inset-4",
      )}
    >
      {children}
    </DialogContent>
  );
}

/** The workspace's header: the way back if any, the title and where the player is, its controls, then Close. */
function Frame({ sub, back, actions, large = false, children }: { sub?: React.ReactNode; back?: () => void; actions?: React.ReactNode; large?: boolean; children: React.ReactNode }) {
  return (
    <Workspace small={!large}>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4 md:px-5">
        {back && <Back onClick={back} label="Back" action="assisted:back" />}
        <div className="flex min-w-0 flex-1 flex-col md:flex-row md:items-baseline md:gap-3">
          <DialogTitle className="truncate text-base font-semibold tracking-tight">{tr("Assisted solve")}</DialogTitle>
          {sub && <p className="min-w-0 truncate text-xs text-muted-foreground md:text-sm">{sub}</p>}
        </div>
        {actions}
        <Button action="assisted:off" icon={X} tip={tr("Close")} variant="ghost" />
      </header>
      {children}
    </Workspace>
  );
}

/** Where the cube comes from: the connected cube (only where one can be), the camera, or the colours entered by hand. */
function Assist() {
  const link = useSyncExternalStore(smartCube.subscribe, () => smartCube.snapshot.status, () => smartCube.snapshot.status),
    connectable = (typeof CUBIX_DEV !== "undefined" && CUBIX_DEV) || link !== "off",
    [source, setSource] = useState<"cube" | "scan" | "hand" | null>(null),
    // The cube read, turned by hand as the player turns theirs.
    model = useMemo(() => new SmartCube(), []),
    [reading, setReading] = useState(true),
    [round, setRound] = useState(0),
    replan = () => setRound((r) => r + 1);
  if (!source)
    return (
      <Frame sub={tr("Your cube")}>
        <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto p-4 md:p-8">
          <div className="flex w-full max-w-2xl flex-col gap-6">
            <div className="flex flex-col gap-1.5 md:text-center">
              <h2 className="text-xl font-semibold tracking-tight">{tr("Start from your own cube")}</h2>
              <p className="text-sm text-balance text-muted-foreground">{tr("Qbix plans a beginner solve for it, then takes you through it turn by turn.")}</p>
            </div>
            <div className={cn("grid gap-3", connectable ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
              {connectable && (
                <SourceTile
                  icon={Bluetooth}
                  title={tr("Connected cube")}
                  text={tr("Each of your turns is followed on screen.")}
                  action={link === "on" ? "assisted:cube" : "smartCube"}
                  disabled={link === "connecting"}
                  onClick={() => (link === "on" ? setSource("cube") : void s.action("smartCube"))}
                  status={
                    link === "on" ? (
                      <Badge variant="success">
                        <span className="size-1.5 rounded-full bg-success" />
                        {tr("Connected · {0}", { 0: smartCube.snapshot.name })}
                      </Badge>
                    ) : link === "connecting" ? (
                      <Badge variant="secondary">
                        <LoaderCircle data-icon="inline-start" className="motion-safe:animate-spin" />
                        {tr("Connecting…")}
                      </Badge>
                    ) : (
                      <Badge variant="outline">{tr("Not connected")}</Badge>
                    )
                  }
                  go={link === "off" ? tr("Connect") : undefined}
                />
              )}
              <SourceTile
                icon={Camera}
                title={tr("Show the faces")}
                text={tr("Hold each face up to the camera: its colours are read for you.")}
                action="assisted:scan"
                onClick={() => setSource("scan")}
                status={<span className={LABEL}>{tr("Six faces, one at a time")}</span>}
              />
              <SourceTile
                icon={Paintbrush}
                title={tr("By hand")}
                text={tr("Paint the colours of each face on a flat cube.")}
                action="assisted:hand"
                onClick={() => setSource("hand")}
                status={<span className={LABEL}>{tr("No camera needed")}</span>}
              />
            </div>
          </div>
        </div>
      </Frame>
    );
  if (source === "cube") return <Solve key={round} cube={smartCube} replan={replan} />;
  if (reading)
    return (
      <Frame sub={tr("Read your cube")} back={round ? () => setReading(false) : () => setSource(null)}>
        <div className="flex min-h-0 flex-1 flex-col p-4 md:p-6">
          <CubeScan
            hand={source === "hand"}
            initial={round ? colours(model.snapshot.state) : undefined}
            onDone={(read) => {
              model.receive({ type: "facelets", facelets: stateToFacelets(scannedState(read)) });
              setReading(false);
              replan();
            }}
          />
        </div>
      </Frame>
    );
  return <Solve key={round} cube={model} replan={replan} rescan={() => setReading(true)} />;
}

/** A way to give the cube: its icon, what it does, where it stands (`status`), and what a click does when not "go on". */
function SourceTile({ icon, title, text, status, go, action, disabled = false, onClick }: { icon: LucideIcon; title: string; text: string; status: React.ReactNode; go?: string; action: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" data-action={action} disabled={disabled} onClick={onClick} className={cn(TILE, "group flex min-h-48 flex-col items-start gap-4 p-5")}>
      <IconTile icon={icon} className="bg-primary/10 text-primary" />
      <span className="flex flex-col gap-1">
        <span className="text-base font-medium">{title}</span>
        <span className="text-sm text-muted-foreground">{text}</span>
      </span>
      <span className="mt-auto flex w-full items-center justify-between gap-2">
        {status}
        <span className="flex items-center gap-1 text-sm font-medium text-primary">
          {go}
          <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </span>
      </span>
    </button>
  );
}

/** The parts of the solve and the state each starts from; null when the cube cannot be solved. */
function planFrom(state: CubeState) {
  const parts = solveBeginner(state);
  if (!parts) return null;
  const starts = [state];
  for (const part of parts) starts.push(applyAlg(starts.at(-1)!, part.alg));
  return { parts, starts };
}
type Plan = NonNullable<ReturnType<typeof planFrom>>;
const NO_PLAN: Plan = { parts: [], starts: [] };

/** Where the cube stands in a part, turn by turn (`lost` when it is off it entirely); `done` once the part is done. */
function usePartProgress(cube: SmartCube, plan: Plan, at: number, done: () => void) {
  const [progress, setProgress] = useState<{ at: number; progress: ScrambleProgress } | null>(null);
  useEffect(() => {
    const part = plan.parts[at];
    if (!part) return;
    // The tracker names turns as the cube reports them, white on top.
    const tracker = new ScrambleTracker(part.alg.split(" ").map(canonicalTurn).join(" "), cube.snapshot.state, plan.starts[at]);
    let count = cube.snapshot.count;
    const show = () => {
      const now = tracker.progress;
      if (now.scrambled) done();
      else setProgress({ at, progress: now });
    };
    show();
    return cube.subscribe(() => {
      const { turn, state, count: now } = cube.snapshot;
      if (now === count) return;
      count = now;
      const reported = cube.moves.at(-1);
      if (turn && reported) tracker.turn(reported.move, state);
      else tracker.sync(state);
      show();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cube, plan, at]);
  return progress?.at === at ? progress.progress : null;
}

/** A piece's colours as small squares. */
const Piece = ({ faces }: { faces: Face[] }) => (
  <span className="inline-flex gap-0.5" aria-hidden="true">
    {faces.map((face) => <span key={face} className="size-3.5 rounded-sm ring-1 ring-foreground/20" style={{ background: hex(face) }} />)}
  </span>
);

const turnsOf = (alg: string) => alg.split(" ");

/** The course's steps as a segmented bar: done in green, the current one filling as its parts are done. */
function Steps({ plan, at }: { plan: Plan; at: number }) {
  const step = plan.parts[at]?.step ?? STEPS.length;
  return (
    <ol className="grid shrink-0 grid-cols-6 gap-2 border-b px-4 py-3 md:px-5" aria-label={tr("Steps")}>
      {STEPS.map((st, i) => {
        const parts = plan.parts.flatMap((p, k) => (p.step === i ? [k] : [])),
          ratio = i < step ? 1 : i > step ? 0 : parts.filter((k) => k < at).length / parts.length;
        return (
          <li key={st.title} aria-current={i === step ? "step" : undefined} className="flex min-w-0 flex-col gap-2">
            <Bar ratio={ratio} fill={i < step ? "bg-success" : undefined} label={said(st.title)} className="h-1.5 min-w-0" />
            <span className={cn("truncate text-xs max-md:hidden", i === step ? "font-medium text-foreground" : "text-muted-foreground")}>{said(st.title)}</span>
          </li>
        );
      })}
    </ol>
  );
}

const TURN: Record<TurnProgress, string> = {
  done: "text-muted-foreground/50",
  partial: "bg-warning/15 text-warning ring-1 ring-warning/40",
  next: "bg-primary/15 text-primary ring-1 ring-primary/40",
  todo: "",
};

/** The turns of a part, large: those done faded, the next one lit, a half turn halfway in amber. */
function Turns({ alg, progress }: { alg: string; progress: ScrambleProgress | null }) {
  return (
    <ol className="alg flex flex-wrap gap-1.5 font-sans text-2xl font-medium tracking-tight md:text-3xl" aria-label={tr("Turns")}>
      {turnsOf(alg).map((turn, i) => {
        const at = progress && !progress.lost ? (progress.turns[i] ?? "todo") : "todo";
        return (
          <li key={i} aria-current={at === "next" ? "step" : undefined} className={cn("min-w-11 rounded-lg px-2 py-0.5 text-center transition-colors duration-200 motion-reduce:transition-none", TURN[at])}>
            {said(turn)}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The solve: the cube in 3D, the course's steps across the top, the turns of the current part beside the cube (under it
 * on phones). `rescan` (a cube that was read): the player says when each turn is done (Next turn, the right arrow or
 * the space bar), the model turns with it, and the cube can be read again.
 */
function Solve({ cube, replan, rescan }: { cube: SmartCube; replan: () => void; rescan?: () => void }) {
  const manual = !!rescan,
    phone = usePhone(),
    [plan] = useState(() => planFrom(cube.snapshot.state)),
    [at, setAt] = useState(0),
    [box, setBox] = useState<HTMLDivElement | null>(null),
    side = useSquare(box),
    [start] = useState(Date.now),
    [view] = useState(() => new CubeView()),
    [end, setEnd] = useState<number | null>(null);
  const progress = usePartProgress(cube, plan ?? NO_PLAN, at, () => setAt(at + 1));
  const part = plan?.parts[at],
    turns = part ? turnsOf(part.alg) : [],
    next = progress && !progress.lost ? progress.turns.indexOf("next") : -1,
    finished = !!plan?.parts.length && at >= plan.parts.length;
  useEffect(() => {
    if (finished && end == null) setEnd(Date.now());
  }, [finished, end]);
  const send = (turn: string) => cube.receive({ type: "move", move: canonicalTurn(turn), at: Date.now() });
  const forward = () => next >= 0 && send(turns[next]!);
  const back = () => {
    const made = progress?.turns.filter((t) => t === "done").length ?? 0;
    if (made) return send(invertToken(turns[made - 1]!));
    const previous = plan?.parts[at - 1];
    if (!previous) return;
    send(invertToken(turnsOf(previous.alg).at(-1)!));
    setAt(at - 1);
  };
  useEffect(() => {
    if (!manual || !part) return;
    const key = (e: KeyboardEvent) => {
      // A focused button takes the space bar itself.
      const target = e.target as HTMLElement;
      if (target.closest?.("input, textarea") || (e.key === " " && target.closest?.("button"))) return;
      if (e.key === "ArrowRight" || e.key === " ") forward();
      else if (e.key === "ArrowLeft") back();
      else return;
      // Before the course's own arrows, which step through its steps.
      e.preventDefault();
      e.stopPropagation();
    };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  });

  const again = manual ? { icon: ScanLine, label: tr("Read the cube again"), run: rescan } : { icon: RefreshCw, label: tr("Plan again from here"), run: replan };
  if (!plan || !plan.parts.length)
    return (
      <Frame>
        {plan ? (
          <Empty icon={Check} title={tr("Your cube is already solved")}>
            <p>{manual ? tr("Scramble it, then read it again.") : tr("Scramble it, then start.")}</p>
            <UiButton size="lg" onClick={manual ? rescan : replan}>
              {manual ? <ScanLine /> : <Play />}
              {manual ? tr("Read the cube again") : tr("Start")}
            </UiButton>
          </Empty>
        ) : (
          <Empty icon={TriangleAlert} title={tr("This cube cannot be solved")}>
            <p className="max-w-sm">{tr("A piece is twisted or two pieces are swapped. Check the colours.")}</p>
            <UiButton size="lg" onClick={again.run}>
              <again.icon />
              {manual ? again.label : tr("Try again")}
            </UiButton>
          </Empty>
        )}
      </Frame>
    );

  const step = part?.step ?? STEPS.length,
    inStep = part ? plan.parts.filter((p) => p.step === step) : [],
    total = plan.parts.reduce((sum, p) => sum + turnsOf(p.alg).length, 0);
  const lost = !!progress?.lost;
  return (
    <Frame
      large
      sub={finished ? tr("Solved") : tr("Step {0} of {1}", { 0: step + 1, 1: STEPS.length })}
      actions={
        !finished &&
        (phone ? (
          <Tip content={again.label}>
            <UiButton variant="ghost" size="icon" aria-label={again.label} onClick={again.run}>
              <again.icon />
            </UiButton>
          </Tip>
        ) : (
          <UiButton variant="outline" onClick={again.run}>
            <again.icon />
            {again.label}
          </UiButton>
        ))
      }
    >
      <Steps plan={plan} at={at} />
      <div className="flex min-h-0 flex-1 max-md:flex-col">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center gap-3 p-4 md:p-6">
          <div ref={setBox} className="relative flex min-h-0 w-full flex-1 items-center justify-center">
            {side > 0 && <LiveCube cube={cube} size={side} turnMs={manual ? 320 : undefined} view={view} />}
            <ViewButtons player={view} className="absolute bottom-0 left-1/2 -translate-x-1/2" />
          </div>
          {next >= 0 && (
            <div className="flex items-baseline gap-3 max-md:hidden" aria-hidden="true">
              <span className={LABEL}>{tr("Next turn")}</span>
              <span className="alg font-sans text-4xl font-semibold tracking-tight text-primary">{said(turns[next]!)}</span>
            </div>
          )}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Swatch colour="yellow" /> {tr("on top")} · <Swatch colour="green" /> {tr("in front")}
          </p>
        </div>
        <aside className="flex min-h-0 shrink-0 flex-col gap-5 overflow-y-auto border-t p-4 md:w-96 md:border-t-0 md:border-l md:p-5">
          {finished ? (
            <div className="flex flex-col gap-5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300">
              <IconTile icon={Check} className="size-12 rounded-full bg-success/15 text-success [&_svg]:size-6" />
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-semibold tracking-tight">{tr("Solved!")}</h2>
                <p className="text-sm text-muted-foreground">{tr("Every step of the beginner method, on your own cube.")}</p>
              </div>
              <Strip className="grid-cols-2">
                <Figure label="Time" value={clock((end ?? Date.now()) - start)} />
                <Figure label="Turns" value={total} />
              </Strip>
              <div className="flex flex-col gap-2">
                <UiButton size="lg" className="max-md:h-11" onClick={again.run}>
                  <RotateCcw />
                  {tr("Solve again")}
                </UiButton>
                <Button action="assisted:off" variant="outline" size="lg" className="max-md:h-11">
                  {tr("Back to the course")}
                </Button>
              </div>
            </div>
          ) : (
            part && (
              <>
                <section className="flex flex-col gap-4" aria-label={tr("Current turns")}>
                  <div className="flex flex-col gap-1">
                    <h2 className="text-xl font-semibold tracking-tight">{said(STEPS[step]!.title)}</h2>
                    {(part.label !== STEPS[step]!.title || part.piece || inStep.length > 1) && (
                      <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        {part.label !== STEPS[step]!.title && said(part.label)}
                        {part.piece && <Piece faces={part.piece} />}
                        {inStep.length > 1 && <span className={NUMERIC}>{tr("{0} of {1}", { 0: inStep.indexOf(part) + 1, 1: inStep.length })}</span>}
                      </p>
                    )}
                  </div>
                  {lost ? (
                    <>
                      <Alert variant="warning">
                        <TriangleAlert />
                        <AlertTitle>{tr("Your cube left the plan")}</AlertTitle>
                        <AlertDescription>{tr("Turn it back, or carry on from where it stands.")}</AlertDescription>
                      </Alert>
                      <div className="flex flex-col gap-2">
                        <UiButton size="lg" className="max-md:h-11" onClick={replan}>
                          <RefreshCw />
                          {tr("Continue from here")}
                        </UiButton>
                        {manual && (
                          <UiButton variant="outline" size="lg" className="max-md:h-11" onClick={rescan}>
                            <ScanLine />
                            {tr("Read the cube again")}
                          </UiButton>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <Turns alg={part.alg} progress={progress} />
                      {!!progress?.undo.length && (
                        <Badge variant="destructive" className="self-start">
                          <Undo2 data-icon="inline-start" />
                          {tr("Undo")} {progress.undo.map(canonicalTurn).join(" ")}
                        </Badge>
                      )}
                      {manual ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-2">
                            <Tip content={tr("Previous turn")}>
                              <UiButton variant="outline" size="icon-lg" className="max-md:size-11" aria-label={tr("Previous turn")} onClick={back} disabled={!at && !progress?.turns.includes("done")}>
                                <ChevronLeft />
                              </UiButton>
                            </Tip>
                            <UiButton size="lg" className="flex-1 max-md:h-11" onClick={forward} disabled={next < 0}>
                              {tr("Next turn")}
                              <ChevronRight />
                            </UiButton>
                          </div>
                          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground max-md:hidden">
                            <span className="flex items-center gap-1.5">
                              <KbdGroup>
                                <Kbd>{tr("Space")}</Kbd>
                                <Kbd>→</Kbd>
                              </KbdGroup>
                              {tr("Next turn")}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <Kbd>←</Kbd>
                              {tr("Previous turn")}
                            </span>
                          </p>
                        </div>
                      ) : (
                        <Badge variant="success" className="self-start">
                          <span className="size-1.5 rounded-full bg-success" />
                          {tr("Following your cube")}
                        </Badge>
                      )}
                    </>
                  )}
                </section>
                {inStep.length > 1 && (
                  <section className="flex flex-col gap-1 max-md:hidden">
                    <SectionHead title={tr("In this step")} meta={`${inStep.indexOf(part) + 1} / ${inStep.length}`} as="h3" />
                    <ol className="flex flex-col gap-0.5">
                      {inStep.map((p) => {
                        const k = plan.parts.indexOf(p),
                          state = k < at ? "done" : k === at ? "current" : "todo";
                        return (
                          <li key={k} aria-current={k === at ? "step" : undefined} className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm", k === at ? "bg-muted text-foreground" : "text-muted-foreground")}>
                            <span className={cn("flex size-4 items-center justify-center", state === "done" ? "text-success" : state === "current" ? "text-primary" : "text-muted-foreground/60")}>
                              <StatusMark state={state} />
                            </span>
                            <span className="min-w-0 flex-1 truncate">{said(p.label)}</span>
                            {p.piece && <Piece faces={p.piece} />}
                            <span className={cn(NUMERIC, "text-xs")}>{plural(turnsOf(p.alg).length, "turn")}</span>
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                )}
              </>
            )
          )}
        </aside>
      </div>
    </Frame>
  );
}
