/**
 * The assisted solve of the 3×3 beginner course: the player's own cube, from the connected cube or read face by face
 * (CubeScan), solved with the course's steps (beginnerSolver.ts), one turn at a time, drawn on a 3D model of it and
 * said in words. A connected cube follows each turn itself; a cube that was read is followed by hand, a turn at a
 * time. A player who got lost carries on from where the cube stands, or reads it again.
 *
 * It takes the page's place under the app's header (the whole screen on phones): its own header names the three
 * moments of it (the cube, its colours, the solve), then each screen fits the window.
 */
import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight, GraduationCap, Info, RefreshCw, RotateCcw, ScanLine, Timer, TriangleAlert, Undo2, Unplug, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { applyAlg, invertToken, solved, type CubeState, type Face } from "../../src/shared/cube";
import { METHODS } from "../../src/shared/methods";
import type { CubeMask } from "../../src/shared/cubeAppearance";
import { solveBeginner } from "../../src/client/lib/beginnerSolver";
import { scannedState } from "../../src/client/lib/cubeScan";
import { clock } from "../../src/client/lib/duel";
import { colours, COLOUR_NAMES } from "../../src/client/lib/solveAnalysis";
import { ScrambleTracker, type ScrambleProgress } from "../../src/client/lib/scrambleTracker";
import { SmartCube, canonicalTurn, heldTurn, smartCube, stateToFacelets } from "../../src/client/lib/smartCube";
import { StaticCubeSvg } from "../../src/client/diagrams/StaticCubeSvg";
import { CubeScan, CameraPicture, FlatFace, HoldNote, Notice, hex, useSquare } from "./CubeScan";
import { LiveCube } from "./LiveCube";
import { ViewButtons } from "./AlgPlayer";
import { CubeView } from "../../src/client/lib/cubeView";
import { call } from "./bridge";
import { store as s } from "./store";
import { ActionCard, Alg, Button, FOCUS, StateMark, TILE, Tip, plural, usePhone } from "./ui";
import { tr } from "../../src/client/i18n";
import { said } from "./base";

const STEPS = METHODS["333"].find((m) => m.id === "beginner")!.steps;
/** The small uppercase caption over a block, as the course's pages write it. */
const SAY = "text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase";

/** The assisted solve, over the course, while it is open. */
export function AssistedSolve() {
  const phone = usePhone(),
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
      <Assist />
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
          <span className="flex min-w-0 flex-col text-left">
            <h1 className="truncate text-lg leading-tight font-extrabold tracking-[-0.02em] md:text-xl">{tr("With my cube")}</h1>
            <span className="truncate text-xs font-semibold text-muted-foreground max-md:hidden">
              {tr("Beginner")} · {tr("Assisted solve")}
            </span>
          </span>
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
      text: tr("Qbix follows each of your turns itself and tells you when one goes wrong."),
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
      text: tr("Hold each face up to the camera: its colours are read for you."),
      meta: tr("Six faces, one at a time"),
      go: tr("Start"),
      picture: <CameraPicture />,
    },
    {
      id: "hand" as const,
      action: "assisted:hand",
      onClick: () => onChoose("hand"),
      title: tr("By hand"),
      text: tr("Paint the colours of each face on a flat cube."),
      meta: tr("No camera needed"),
      go: tr("Start"),
      picture: <HandPicture />,
    },
  ].filter((way) => !!way);
  return (
    <Page phase={0} back={() => void s.action("assisted:off")}>
      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] gap-3 md:gap-5">
        <div className="flex flex-col gap-1 text-center">
          <h2 className="text-2xl font-extrabold tracking-[-0.04em] text-balance md:text-[40px] md:leading-tight">{tr("How does Qbix see your cube?")}</h2>
          <p className="text-sm text-balance text-muted-foreground md:text-base">{tr("It plans a solve with the six steps of the course, then tells you each turn to make.")}</p>
        </div>
        <div className={cn("grid min-h-0 gap-2.5 max-md:auto-rows-min md:gap-4", ways.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2")}>
          {ways.map((way) => (
            <button key={way.id} type="button" data-action={way.action} disabled={"disabled" in way && way.disabled} onClick={way.onClick} className={cn(TILE, "group flex min-h-0 flex-col gap-3 p-3.5 md:gap-4 md:rounded-[26px] md:p-4")}>
              <span className="relative flex min-h-0 flex-1 items-center justify-center rounded-[18px] bg-background transition-colors group-hover:bg-card max-md:hidden">{way.picture}</span>
              <span className="flex flex-col gap-1 px-1">
                <span className="text-lg font-extrabold tracking-[-0.03em] md:text-[22px]">{way.title}</span>
                <span className="text-sm leading-snug text-muted-foreground">{way.text}</span>
              </span>
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
              <span className="text-sm text-muted-foreground">{tr("Scramble it first with this scramble:")}</span>
              {scramble && <Alg text={scramble} size={16} className="font-bold text-foreground" />}
            </span>
          </div>
        </div>
      </div>
    </Page>
  );
}

/** A cube painted by hand: a flat cube, three faces done, the others waiting with only their centre. */
function HandPicture() {
  const READ: Partial<Record<Face, Face[]>> = {
    U: ["R", "U", "U", "F", "U", "B", "U", "L", "D"],
    L: ["D", "B", "U", "U", "L", "R", "F", "L", "R"],
    F: ["B", "B", "D", "R", "F", "U", "L", "U", "F"],
  };
  const place: Record<Face, string> = { U: "col-start-2 row-start-1", L: "col-start-1 row-start-2", F: "col-start-2 row-start-2", R: "col-start-3 row-start-2", B: "col-start-4 row-start-2", D: "col-start-2 row-start-3" };
  return (
    <span className="grid grid-cols-4 gap-1" aria-hidden="true">
      {(Object.keys(place) as Face[]).map((face) => (
        <span key={face} className={place[face]}>
          <FlatFace face={face} colours={READ[face]} size={36} />
        </span>
      ))}
    </span>
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

const turnsOf = (alg: string) => alg.split(" ");

/** The face a turn moves and the way it goes, held yellow on top and green in front. */
const FACE_NAME: Record<string, string> = { R: "Right face", L: "Left face", U: "Top face", D: "Bottom face", F: "Front face", B: "Back face" };
const WAY: Record<string, [string, string]> = {
  R: ["upwards", "downwards"],
  L: ["downwards", "upwards"],
  U: ["to the left", "to the right"],
  D: ["to the right", "to the left"],
  F: ["clockwise", "anticlockwise"],
  B: ["clockwise, seen from the back", "anticlockwise, seen from the back"],
};
export function turnWords(turn: string) {
  const face = turn[0]!;
  return { face: tr(FACE_NAME[face]!), way: turn.endsWith("2") ? tr("a half turn") : tr(WAY[face]![turn.endsWith("'") ? 1 : 0]!) };
}

/** A step of the course as a small cube: what it solves, in its colours. */
const STEP_MASK: (CubeMask | undefined)[] = ["F1L", "F1L", "F2L", "EO", "OLL", undefined];
const StepCube = ({ step, size }: { step: number; size: number }) => <StaticCubeSvg state={solved(3)} size={size} mask={STEP_MASK[step] ?? "full"} view="iso" className="shrink-0" />;

/** The course's six steps across the top: each its cube, its name and a dash per part, done in green, the current one in the accent. */
function Route({ plan, at, finished }: { plan: Plan; at: number; finished: boolean }) {
  const step = finished ? STEPS.length : (plan.parts[at]?.step ?? STEPS.length);
  return (
    <ol className="grid shrink-0 grid-cols-6 gap-1.5 md:gap-2" aria-label={tr("Steps")}>
      {STEPS.map((st, i) => {
        const parts = plan.parts.flatMap((p, k) => (p.step === i ? [k] : []));
        return (
          <li key={st.title} aria-current={i === step ? "step" : undefined} title={said(st.title)} className={cn("flex min-w-0 items-center gap-2.5 rounded-xl px-1.5 py-1.5 md:px-2.5 md:py-2", i === step ? "bg-muted" : "bg-card")}>
            <span className="max-lg:hidden">
              <StepCube step={i} size={34} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className={cn("truncate text-[13px] font-bold max-md:hidden", i > step && "text-muted-foreground")}>{said(st.title)}</span>
              <span className="flex flex-wrap gap-[3px]" aria-label={tr("{0} of {1}", { 0: parts.filter((k) => k < at || finished).length, 1: parts.length })}>
                {(parts.length ? parts : [-1]).map((k) => (
                  <span key={k} className={cn("h-[5px] w-3.5 rounded-full", k >= 0 && (k < at || finished) ? "bg-success" : k === at ? "bg-primary" : "bg-muted-foreground/25")} />
                ))}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** The turns of a part as keys: done struck out, the next one in the accent, those to come. */
function Tape({ turns, progress }: { turns: string[]; progress: ScrambleProgress | null }) {
  return (
    <ol className="flex flex-wrap gap-1.5" aria-label={tr("Turns")}>
      {turns.map((turn, i) => {
        const at = progress && !progress.lost ? (progress.turns[i] ?? "todo") : "todo";
        return (
          <li
            key={i}
            aria-current={at === "next" ? "step" : undefined}
            className={cn(
              "alg min-w-8 rounded-lg px-1.5 py-1 text-center font-sans text-sm font-bold",
              at === "done" ? "text-muted-foreground line-through decoration-2" : at === "next" ? "bg-primary text-primary-foreground" : at === "partial" ? "bg-muted text-warning" : "bg-muted",
            )}
          >
            {said(turn)}
          </li>
        );
      })}
    </ol>
  );
}

/** A piece's colours as small squares. */
const Piece = ({ faces }: { faces: Face[] }) => (
  <span className="inline-flex shrink-0 gap-0.5" aria-label={faces.map((f) => said(COLOUR_NAMES[f])).join(", ")}>
    {faces.map((face) => <span key={face} className="size-3.5 rounded-sm ring-1 ring-foreground/20" style={{ background: hex(face) }} />)}
  </span>
);

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
 * The solve: the course's steps across the top, the part under way on the left (the piece, the cube before and after
 * it, its turns, the course's algorithm), the turn to make in the middle, drawn and said, and the bar of what to do
 * under them. `rescan` (a cube that was read): the player says when each turn is done (the space bar, the right
 * arrow), the model turns with it, and the cube can be read again; a connected cube follows on its own.
 */
function Solve({ cube, replan, rescan, back: leave }: { cube: SmartCube; replan: () => void; rescan?: (how?: "camera" | "check") => void; back: () => void }) {
  const manual = !!rescan,
    phone = usePhone(),
    link = useSyncExternalStore(cube.subscribe, () => cube.snapshot, () => cube.snapshot),
    [plan] = useState(() => planFrom(cube.snapshot.state)),
    [at, setAt] = useState(0),
    [box, setBox] = useState<HTMLDivElement | null>(null),
    side = useSquare(box),
    [start] = useState(Date.now),
    [view] = useState(() => new CubeView()),
    [end, setEnd] = useState<number | null>(null),
    [gaveUp, setGaveUp] = useState(false);
  const progress = usePartProgress(cube, plan ?? NO_PLAN, at, () => setAt(at + 1));
  const part = plan?.parts[at],
    turns = part ? turnsOf(part.alg) : [],
    next = progress && !progress.lost ? progress.turns.indexOf("next") : -1,
    finished = !!plan?.parts.length && at >= plan.parts.length,
    time = useClock(start, end);
  useEffect(() => {
    if (finished && end == null) setEnd(Date.now());
  }, [finished, end]);
  const send = (turn: string) => cube.receive({ type: "move", move: canonicalTurn(turn), at: Date.now() });
  const forward = () => next >= 0 && send(turns[next]!);
  const made = progress?.turns.filter((t) => t === "done").length ?? 0;
  const previous = () => {
    if (made) return send(invertToken(turns[made - 1]!));
    const before = plan?.parts[at - 1];
    if (!before) return;
    send(invertToken(turnsOf(before.alg).at(-1)!));
    setAt(at - 1);
  };
  /** Back to the start of the part, the turns done undone. */
  const restart = () => {
    for (let i = made - 1; i >= 0; i--) send(invertToken(turns[i]!));
    setGaveUp(false);
  };
  useEffect(() => {
    if (!manual || !part || gaveUp) return;
    const key = (e: KeyboardEvent) => {
      // A focused button takes the space bar itself.
      const target = e.target as HTMLElement;
      if (target.closest?.("input, textarea") || (e.key === " " && target.closest?.("button"))) return;
      if (e.key === "ArrowRight" || e.key === " ") forward();
      else if (e.key === "ArrowLeft") previous();
      else return;
      // Before the course's own arrows, which step through its steps.
      e.preventDefault();
      e.stopPropagation();
    };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  });
  // The turn to make, in the cube's axes, for the arrow drawn on it: the one to undo first if any.
  const undoing = !!progress && !progress.lost && progress.undo.length > 0,
    shown = undoing ? canonicalTurn(progress!.undo[0]!) : next >= 0 ? turns[next]! : null,
    arrow = useMemo(() => (shown ? heldTurn(canonicalTurn(shown)) : null), [shown]);

  if (!plan || !plan.parts.length)
    return (
      <Page phase={2} skipped={!manual} back={leave}>
        {plan ? (
          <Notice cube={<StaticCubeSvg state={solved(3)} size={phone ? 110 : 150} />} title={tr("Your cube is already solved")} text={manual ? tr("Scramble it, then read it again.") : tr("Scramble it, then start.")}>
            <ActionCard primary icon={manual ? ScanLine : RefreshCw} title={manual ? tr("Read the cube again") : tr("Start")} text={tr("The six faces again")} onClick={manual ? () => rescan() : replan} action="assisted:again" />
          </Notice>
        ) : (
          <Notice icon={TriangleAlert} title={tr("This cube cannot be solved")} text={tr("A piece is twisted or two pieces are swapped. Check the colours.")}>
            {manual && <ActionCard primary icon={Check} title={tr("Check the colours")} text={tr("The net, sticker by sticker")} onClick={() => rescan("check")} action="assisted:check" />}
            <ActionCard primary={!manual} icon={manual ? ScanLine : RefreshCw} title={manual ? tr("Read everything again") : tr("Try again")} text={manual ? tr("The six faces again") : undefined} onClick={manual ? () => rescan() : replan} action="assisted:again" />
          </Notice>
        )}
      </Page>
    );

  const step = part?.step ?? STEPS.length,
    inStep = part ? plan.parts.filter((p) => p.step === step) : [],
    total = plan.parts.reduce((sum, p) => sum + turnsOf(p.alg).length, 0),
    before = plan.parts.slice(0, at).reduce((sum, p) => sum + turnsOf(p.alg).length, 0),
    lost = !!progress?.lost || gaveUp;
  const count = (
    <div className="flex min-w-0 flex-col justify-center gap-1.5 rounded-xl bg-card px-4 py-2.5 md:py-3">
      <div className="flex justify-between gap-2 text-[13px] font-bold text-muted-foreground">
        <span>{tr("Turns")}</span>
        <span className="font-sans text-foreground tabular-nums">
          {Math.min(total, before + made)} / {total}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={tr("Turns")} aria-valuemin={0} aria-valuemax={total} aria-valuenow={before + made}>
        <div className="h-full rounded-full bg-success" style={{ width: ((before + made) / total) * 100 + "%" }} />
      </div>
      <div className="flex justify-between gap-2 text-[13px] font-bold text-muted-foreground">
        <span>{tr("Time")}</span>
        <span className="font-sans text-foreground tabular-nums">{time}</span>
      </div>
    </div>
  );

  if (finished) {
    const per = STEPS.map((_, k) => plan.parts.filter((p) => p.step === k).reduce((n, p) => n + turnsOf(p.alg).length, 0)),
      max = Math.max(1, ...per);
    return (
      <Page phase={3} skipped={!manual} back={leave}>
        <Route plan={plan} at={at} finished />
        <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)] md:gap-4">
          <section className="flex min-h-0 flex-col items-center justify-center gap-3 rounded-[26px] bg-card p-4 text-center md:gap-4 md:p-8 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-300">
            <span className="max-md:hidden">
              <StaticCubeSvg state={solved(3)} size={170} />
            </span>
            <h2 className="text-4xl leading-none font-extrabold tracking-[-0.05em] md:text-[56px]">{tr("Solved!")}</h2>
            <p className="text-sm text-muted-foreground md:text-base">{tr("Every step of the beginner method, on your own cube.")}</p>
            <div className="flex gap-8">
              {[
                [time, tr("Time")],
                [String(total), tr("Turns")],
              ].map(([value, label]) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <b className="font-sans text-3xl font-extrabold tracking-[-0.03em] tabular-nums md:text-[34px]">{value}</b>
                  <span className="text-[13px] font-bold text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </section>
          <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-3 md:gap-4">
            <section className="flex min-h-0 flex-col gap-2 rounded-[26px] bg-card px-4 py-4 md:justify-between md:px-6 md:py-5" aria-label={tr("Turns per step")}>
              <h3 className={SAY}>{tr("Turns per step")}</h3>
              {STEPS.map((st, k) => (
                <div key={st.title} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_4.5rem] items-center gap-3 text-sm md:grid-cols-[30px_170px_minmax(0,1fr)_5rem]">
                  <span className="max-md:hidden">
                    <StepCube step={k} size={30} />
                  </span>
                  <span className="truncate">{said(st.title)}</span>
                  <span className="h-3 rounded-[4px] bg-muted">
                    <span className="block h-full rounded-[4px] bg-primary" style={{ width: (per[k]! / max) * 100 + "%" }} />
                  </span>
                  <span className="text-right font-sans font-bold text-muted-foreground tabular-nums">{plural(per[k]!, "turn")}</span>
                </div>
              ))}
            </section>
            <div className="grid gap-2 md:grid-cols-3 md:gap-3">
              <ActionCard primary icon={RotateCcw} title={tr("Solve again")} text={manual ? tr("Scramble your cube, Qbix reads it again") : tr("Scramble your cube, then start")} onClick={manual ? () => rescan() : replan} action="assisted:again" />
              <ActionCard icon={Timer} title={tr("On your own, with the timer")} text={tr("No help, to see")} onClick={() => void s.action("nav:playground")} action="nav:playground" />
              <ActionCard icon={GraduationCap} title={tr("Back to the course")} text={`${tr("Step {0} of {1}", { 0: 1, 1: STEPS.length })} · ${said(STEPS[0]!.title)}`} onClick={() => void s.action("assisted:off")} action="assisted:off" />
            </div>
          </div>
        </div>
      </Page>
    );
  }

  const where = part && (
    <div className="flex items-center justify-center gap-3 rounded-[18px] bg-background px-3 py-2.5 text-muted-foreground">
      {[
        [plan.starts[at]!, tr("Now")],
        [plan.starts[at + 1]!, tr("At the end")],
      ].map(([state, label], k) => (
        <figure key={k} className="contents">
          {k > 0 && <ChevronRight className="size-4" aria-hidden="true" />}
          <span className="flex flex-col items-center gap-1">
            <StaticCubeSvg state={state as CubeState} size={70} mask={step > 0 ? STEP_MASK[step] : undefined} view="iso" />
            <figcaption className="text-xs font-bold">{label as string}</figcaption>
          </span>
        </figure>
      ))}
    </div>
  );
  const eyebrow = part && (
    <span className="truncate text-[13px] font-bold text-primary">
      {tr("Step {0}", { 0: step + 1 })} · {said(STEPS[step]!.title)}
      {inStep.length > 1 && ` · ${tr("{0} of {1}", { 0: inStep.indexOf(part) + 1, 1: inStep.length })}`}
    </span>
  );
  const words = shown ? turnWords(shown) : null;
  const reviewLesson = () => {
    void s.action("assisted:off");
    void s.action("learnStep:" + step);
  };

  return (
    <Page phase={2} skipped={!manual} back={leave}>
      <Route plan={plan} at={at} finished={false} />
      {lost ? (
        <Notice
          cube={<StaticCubeSvg state={cube.snapshot.state} size={phone ? 110 : 150} />}
          title={tr("Your cube left the plan")}
          text={manual ? tr("Read it again, or go back to the start of this part.") : tr("The turns made no longer match the plan. Qbix can start again from where your cube is.")}
        >
          {manual ? (
            <>
              <ActionCard primary icon={ScanLine} title={tr("Read the cube again")} text={tr("The six faces again")} onClick={() => rescan()} action="assisted:rescan" />
              <ActionCard icon={Undo2} title={tr("Back to the start of this part")} text={made ? tr("Undo {0}", { 0: turns.slice(0, made).reverse().map(invertToken).join(" ") }) : said(STEPS[step]!.title)} onClick={restart} action="assisted:restart" />
              <ActionCard icon={Check} title={tr("Check the colours")} text={tr("The net, sticker by sticker")} onClick={() => rescan("check")} action="assisted:check" />
            </>
          ) : (
            <>
              <ActionCard primary icon={RefreshCw} title={tr("Continue from here")} text={tr("A new plan, from your cube as it is")} onClick={replan} action="assisted:replan" />
              <ActionCard icon={GraduationCap} title={tr("Review the lesson")} text={said(STEPS[step]!.title)} onClick={reviewLesson} action={"learnStep:" + step} />
            </>
          )}
        </Notice>
      ) : (
        part && (
          <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[300px_minmax(0,1fr)] md:gap-4 lg:grid-cols-[330px_minmax(0,1fr)]">
            <section className="flex min-h-0 flex-col gap-3 overflow-hidden rounded-[24px] bg-card p-5 max-md:hidden" aria-label={tr("Current part")}>
              {eyebrow}
              <h2 className="flex items-center gap-2.5 text-2xl leading-tight font-extrabold tracking-[-0.03em]">
                {part.piece && <Piece faces={part.piece} />}
                <span className="min-w-0">{said(part.label)}</span>
              </h2>
              <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{said(STEPS[step]!.text)}</p>
              {where}
              <Tape turns={turns} progress={progress} />
              <div className="mt-auto flex flex-col gap-1.5 rounded-2xl bg-background px-3.5 py-3">
                {part.gesture && (
                  <>
                    <span className={SAY}>{tr("The course's algorithm")}</span>
                    <Alg text={part.gesture.alg} size={18} className="font-bold" />
                    {part.gesture.times > 1 && <span className="text-[13px] text-muted-foreground">{tr("Done {0} times in a row here.", { 0: part.gesture.times })}</span>}
                  </>
                )}
                <button type="button" data-action={"learnStep:" + step} onClick={reviewLesson} className={cn("flex items-center gap-1 self-start rounded-md text-[13px] font-bold text-primary hover:text-primary/80", FOCUS)}>
                  {tr("Review the lesson")}
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
            </section>
            <section className="relative grid min-h-0 grid-rows-[minmax(0,1fr)_auto] items-center gap-2 rounded-[26px] bg-card p-3 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:grid-rows-1 md:gap-8 md:px-8 md:py-4" aria-live="polite">
              <span className="absolute top-3 left-4 md:hidden">{eyebrow}</span>
              <div ref={setBox} className="flex h-full min-h-0 min-w-0 items-center justify-center max-md:pt-6 md:py-10">
                {side > 0 && <LiveCube cube={cube} size={side} turnMs={manual ? 320 : undefined} view={view} arrow={arrow} />}
              </div>
              <div className="flex min-w-0 flex-col max-md:flex-row max-md:items-end max-md:gap-4">
                <span className={cn(SAY, "max-md:hidden", undoing && "text-destructive")}>
                  {undoing ? tr("First, undo your mistake") : tr("Turn {0} of {1} in this part", { 0: Math.min(made + 1, turns.length), 1: turns.length })}
                </span>
                <span className="alg font-sans text-[64px] leading-none font-extrabold tracking-[-0.04em] text-primary md:mt-2 md:text-[clamp(72px,15vh,150px)]">{shown ? said(shown) : "·"}</span>
                {words && (
                  <span className="flex min-w-0 flex-col md:mt-3">
                    <span className="text-xl font-extrabold tracking-[-0.03em] md:text-3xl">{words.face}</span>
                    <span className="text-base font-semibold text-muted-foreground md:text-[22px]">{words.way}</span>
                  </span>
                )}
                {next >= 0 && turns.length > next + 1 && (
                  <span className="mt-6 flex flex-wrap items-center gap-2 text-sm font-bold text-muted-foreground max-md:hidden">
                    {tr("Then")}
                    {turns.slice(next + 1, next + 5).map((t, i) => (
                      <span key={i} className="alg rounded-lg bg-muted px-2.5 py-1 font-sans text-foreground">
                        {said(t)}
                      </span>
                    ))}
                  </span>
                )}
              </div>
              <div className="absolute top-3 right-3 flex items-center gap-2 md:top-4 md:right-4">
                {!manual && (
                  <StateMark tone="good" className="rounded-xl bg-muted px-3 py-2 max-md:hidden">
                    {tr("Following your {0} live", { 0: link.name })}
                  </StateMark>
                )}
                <ViewButtons player={view} className="max-md:hidden" />
              </div>
              <span className="absolute bottom-4 left-6 max-lg:hidden">
                <HoldNote size={46} />
              </span>
            </section>
          </div>
        )
      )}
      {!lost && (
        <div
          className={cn(
            "grid shrink-0 gap-2 md:gap-2.5",
            manual ? "grid-cols-[3.25rem_minmax(0,1fr)_minmax(0,1fr)] md:grid-cols-[300px_74px_minmax(0,1fr)_200px_200px] lg:grid-cols-[330px_74px_minmax(0,1fr)_230px_230px]" : "md:grid-cols-[300px_minmax(0,1fr)_200px_200px] lg:grid-cols-[330px_minmax(0,1fr)_230px_230px]",
          )}
        >
          <span className="max-md:hidden">{count}</span>
          {manual ? (
            <>
              <Tip content={tr("Previous turn")}>
                <button
                  type="button"
                  data-action="assisted:previous"
                  aria-label={tr("Previous turn")}
                  onClick={previous}
                  disabled={!at && !made}
                  className={cn("flex items-center justify-center rounded-xl bg-card transition-colors hover:bg-muted disabled:opacity-50", FOCUS)}
                >
                  <ChevronLeft className="size-5" />
                </button>
              </Tip>
              <ActionCard primary title={<span className="text-lg md:text-xl md:font-extrabold">{tr("Done, next turn")}</span>} kbd={tr("Space")} onClick={forward} disabled={next < 0} action="assisted:next" className="min-h-14 max-md:col-span-2 md:px-5" />
              <ActionCard icon={Info} title={tr("I'm lost")} text={<span className="max-md:hidden">{tr("Start again from where the cube is")}</span>} onClick={() => setGaveUp(true)} action="assisted:lost" className="max-md:col-span-2" />
              <ActionCard icon={ScanLine} title={tr("Read the cube again")} text={<span className="max-md:hidden">{tr("The six faces again")}</span>} onClick={() => rescan()} action="assisted:rescan" />
            </>
          ) : (
            <>
              {undoing ? (
                <div className="flex min-w-0 items-center gap-3 rounded-xl bg-card px-4 py-3" role="status">
                  <TriangleAlert className="size-5 shrink-0 text-destructive" />
                  <span className="flex min-w-0 flex-col">
                    <b className="text-[15px]">
                      {tr("You turned {0} instead of {1}", { 0: progress!.undo.slice().reverse().map(invertToken).map(canonicalTurn).join(" "), 1: next >= 0 ? turns[next]! : "" })}
                    </b>
                    <span className="text-xs text-muted-foreground">{tr("No matter: undo it with {0}, Qbix carries on by itself.", { 0: progress!.undo.map(canonicalTurn).join(" ") })}</span>
                  </span>
                </div>
              ) : (
                <div className="flex min-w-0 items-center gap-3 rounded-xl bg-card px-4 py-3" role="status">
                  <StateMark tone="good">{tr("Following your cube")}</StateMark>
                  <span className="truncate text-xs text-muted-foreground">{tr("Make the turn shown: Qbix moves on by itself.")}</span>
                </div>
              )}
              <ActionCard icon={RefreshCw} title={tr("Continue from here")} text={tr("A new plan, from your cube as it is")} onClick={replan} action="assisted:replan" />
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
      )}
    </Page>
  );
}
