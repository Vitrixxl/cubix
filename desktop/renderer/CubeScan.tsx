/**
 * The cube read face by face for the assisted solve, as ~/dev/lab/rubik does: each face asked for by its centre's colour
 * and held any way round, found wherever it stands in the picture, and read on a key press, then every colour checked on the cube's net, where a sticker read
 * wrong is painted over. Without a camera, the net is painted by hand.
 *
 * The camera's picture is shown mirrored like a selfie when it faces the player, but read as it comes (the face as
 * seen from outside).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Camera, CameraOff, Check, Paintbrush, RefreshCw, SwitchCamera, TriangleAlert, Undo2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { FACES, type Face } from "../../src/shared/cube";
import { cubeOrientation, cubeScene } from "../../src/shared/cubeScene";
import { heldColors, HELD_HEX } from "../../src/shared/cubeAppearance";
import { cubeSamples, readCube, resolve, scanColour, scanProblem, scanRefs, scanStickers, VIEW, type Rgb } from "../../src/client/lib/cubeScan";
import { faceWatcher, latticeShapes } from "../../src/client/lib/faceFinder";
import { COLOUR_NAMES } from "../../src/client/lib/solveAnalysis";
import { tr } from "../../src/client/i18n";
import { Cube } from "./Cube";
import { Empty, FOCUS, LABEL, said, SectionHead, Tip } from "./base";

export const hex = (face: Face) => `#${HELD_HEX[face].toString(16).padStart(6, "0")}`;

/** The side of the largest square that fits in an element. */
export function useSquare(element: HTMLElement | null) {
  const [side, setSide] = useState(0);
  useLayoutEffect(() => {
    if (!element) return;
    const measure = () => setSide(Math.floor(Math.min(element.clientWidth, element.clientHeight)));
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [element]);
  return side;
}

/**
 * The faces in the order they are shown (`SCAN_FACES`, the lab's), each held any way round: `cubeSamples` finds how
 * each one was turned. `setup` turns the cube drawn (see `parseScramble`: y' is a turn to the left) from green in front,
 * yellow on top, to show the face asked for; `turn`, when the last step comes by a quarter turn.
 */
const ORDER: { face: Face; setup: string; title: string; turn?: boolean }[] = [
  { face: "U", setup: "x", title: "Yellow face to the camera" },
  { face: "R", setup: "y'", title: "Orange face to the camera" },
  { face: "L", setup: "y", title: "Red face to the camera" },
  { face: "B", setup: "y y", title: "Blue face to the camera", turn: true },
  { face: "F", setup: "", title: "Green face to the camera" },
  { face: "D", setup: "x'", title: "White face to the camera", turn: true },
];
/** Below this, a sticker read is marked to check. */
const DOUBT = 0.8;

/** Seen nearly face on: the face to the camera stands out from the one on its right. */
const FACING = cubeOrientation(0.4, 0.5);
/**
 * The cube as it should be held for a step, as the app draws it, in the colours read so far (see `scanStickers`);
 * turned before the eyes when it comes by a quarter turn.
 */
function HoldCube({ index, animated, stickers }: { index: number; animated: boolean; stickers: (Face | null)[] }) {
  const key = stickers.join();
  const scene = useMemo(() => {
    const all = { ...cubeScene(ORDER[index]!.setup, 3, "full", animated, true), colors: heldColors(stickers) };
    return animated ? { ...all, states: all.states.slice(-2), moves: all.moves.slice(-1) } : all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, animated, key]);
  return <Cube scene={scene} size={112} orientation={FACING} />;
}

/** A face read so far, small: its nine colours, or its centre's colour while it waits. */
function MiniFace({ step, colours, current, onClick }: { step: (typeof ORDER)[number]; colours?: Face[]; current: boolean; onClick?: () => void }) {
  const tile = (
    <button
      type="button"
      data-action="scan:face"
      disabled={!onClick}
      onClick={onClick}
      aria-current={current ? "step" : undefined}
      aria-label={said(step.title)}
      className={cn(
        FOCUS,
        "grid size-9 shrink-0 grid-cols-3 gap-px overflow-hidden rounded-md p-0.5 ring-1 transition-shadow motion-reduce:transition-none",
        current ? "ring-2 ring-primary" : colours ? "ring-success/60 enabled:hover:ring-foreground/40" : "ring-border",
      )}
    >
      {colours
        ? colours.map((c, k) => <span key={k} className="rounded-[2px] motion-safe:animate-in motion-safe:zoom-in-50" style={{ background: hex(c) }} />)
        : Array.from({ length: 9 }, (_, k) => <span key={k} className={cn("rounded-[2px]", k === 4 ? "" : "bg-muted")} style={k === 4 ? { background: hex(step.face) } : undefined} />)}
    </button>
  );
  return colours && onClick ? <Tip content={tr("Read this face again")}>{tile}</Tip> : tile;
}

/**
 * The camera's picture with the face found drawn on it, each cell marked with the colour read there (nothing while no
 * face is found, and nothing to read), and the faces read so far. Space (or the button) reads the face asked for, Backspace reads the last one again. As in the lab, the face asked
 * for's centre is its colour's look while it is held; once read, it stays that colour's look and the faces read before
 * are sorted again.
 */
function CameraScan({ onRead, onHand }: { onRead: (samples: Rgb[]) => void; onHand: () => void }) {
  const video = useRef<HTMLVideoElement>(null),
    [state, setState] = useState<"starting" | "live" | "none">("starting"),
    [devices, setDevices] = useState<string[]>([]),
    [device, setDevice] = useState<string | null>(null),
    [attempt, setAttempt] = useState(0),
    [mirrored, setMirrored] = useState(true),
    [face, setFace] = useState<ReturnType<ReturnType<typeof faceWatcher>> | null>(null),
    live = face?.colours ?? null,
    [faces, setFaces] = useState<(Rgb[] | null)[]>(ORDER.map(() => null)),
    [redo, setRedo] = useState<number | null>(null),
    [flash, setFlash] = useState(false),
    track = useRef<MediaStreamTrack | null>(null),
    [box, setBox] = useState<HTMLDivElement | null>(null),
    side = useSquare(box);
  const current = redo ?? faces.findIndex((f) => !f),
    step = ORDER[current] ?? ORDER[0]!,
    refs = scanRefs(faces),
    last = faces.findLastIndex(Boolean);

  const readNow = () => {
    if (!live || current < 0) return;
    const next = faces.map((f, i) => (i === current ? live : f));
    setFaces(next);
    setRedo(null);
    setFlash(true);
    setTimeout(() => setFlash(false), 450);
    // The first face read, the camera keeps its exposure and white balance where it can: the faces then differ only
    // by their light.
    const camera = track.current,
      can = camera?.getCapabilities?.() as { exposureMode?: string[]; whiteBalanceMode?: string[] } | undefined,
      hold = { ...(can?.exposureMode?.includes("manual") && { exposureMode: "manual" }), ...(can?.whiteBalanceMode?.includes("manual") && { whiteBalanceMode: "manual" }) };
    if (camera && Object.keys(hold).length) camera.applyConstraints({ advanced: [hold as MediaTrackConstraintSet] }).catch(() => {});
    if (next.every(Boolean)) onRead(cubeSamples(next as Rgb[][]));
  };
  /** The last face read, read again. */
  const undo = () => {
    if (last < 0) return;
    setFaces(faces.map((f, i) => (i === last ? null : f)));
    setRedo(null);
  };

  useEffect(() => {
    let stream: MediaStream | undefined,
      stopped = false,
      loop = 0;
    setState("starting");
    const media = navigator.mediaDevices;
    if (!media?.getUserMedia) {
      setState("none");
      return;
    }
    media
      .getUserMedia({ video: device ? { deviceId: { exact: device } } : { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
      .then(async (s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        track.current = s.getVideoTracks()[0] ?? null;
        setMirrored(track.current?.getSettings().facingMode !== "environment");
        if (video.current) video.current.srcObject = s;
        setState("live");
        const all = (await media.enumerateDevices().catch(() => [])).filter((d) => d.kind === "videoinput" && d.deviceId);
        if (!stopped) setDevices(all.map((d) => d.deviceId));
      })
      .catch(() => !stopped && setState("none"));
    const watch = faceWatcher(),
      tick = () => {
        loop = requestAnimationFrame(tick);
        const v = video.current;
        if (v?.videoWidth) setFace(watch(v));
      };
    loop = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(loop);
      stream?.getTracks().forEach((t) => t.stop());
      track.current = null;
    };
  }, [device, attempt]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      // Even over a focused button (Close keeps the focus after "Read the cube again"): the camera step owns both keys.
      if ((e.key !== " " && e.key !== "Backspace") || (e.target as HTMLElement).closest?.("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === " ") readNow();
      else undo();
    };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  });

  if (state === "none")
    return (
      <Empty icon={CameraOff} title={tr("No camera")}>
        <p className="max-w-sm">{tr("Allow the camera to read your cube, or enter its colours by hand.")}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" data-action="scan:retry" onClick={() => setAttempt((a) => a + 1)}>
            <RefreshCw />
            {tr("Try again")}
          </Button>
          <Button data-action="scan:hand" onClick={onHand}>
            <Paintbrush />
            {tr("Enter the colours by hand")}
          </Button>
        </div>
      </Empty>
    );

  // The face asked for's centre is its colour while it is held.
  const seen = live && current >= 0 ? live.map((c) => scanColour(c, { ...refs, [step.face]: live[4]! })) : null,
    dark = !!live && live.reduce((s, [r, g, b]) => s + 0.3 * r + 0.59 * g + 0.11 * b, 0) / 9 < 45,
    done = faces.filter(Boolean).length,
    shapes = face && latticeShapes(face.centre, face.u, face.v);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row md:items-center md:justify-center md:gap-8">
      <div ref={setBox} className="flex min-h-0 min-w-0 flex-1 items-center justify-center md:size-[min(26rem,60svh)] md:flex-none">
        <div
          className={cn(
            "relative shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10 transition-shadow duration-300 motion-reduce:transition-none",
            flash && "ring-4 ring-success",
          )}
          style={{ width: side, height: side }}
        >
          <div className={cn("absolute inset-0", mirrored && "-scale-x-100")}>
            <video ref={video} autoPlay playsInline muted className="absolute inset-0 size-full object-cover" />
            <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="absolute inset-0 size-full" aria-hidden="true">
              {shapes && (
                <g fill="none" strokeLinejoin="round">
                  {shapes.cells.map((points, k) => (
                    <polygon key={k} points={points} stroke="black" strokeOpacity={0.75} strokeWidth={2} />
                  ))}
                  {/* Where the centre is read, around its logo. */}
                  {shapes.patches.map((points, k) => (
                    <polygon key={k} points={points} stroke="white" strokeOpacity={0.8} strokeWidth={1} />
                  ))}
                  {seen?.map((c, k) => (
                    <circle key={k} cx={shapes.dots[k]![0]} cy={shapes.dots[k]![1]} r={shapes.r} fill={hex(c)} stroke="black" strokeOpacity={0.6} strokeWidth={1.5} />
                  ))}
                </g>
              )}
            </svg>
          </div>
          {state === "starting" && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">{tr("Starting your camera…")}</div>
          )}
          {state === "live" && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3" aria-live="polite">
              <Badge variant="secondary" className="h-7 gap-1.5 bg-background/85 px-2.5 text-foreground backdrop-blur">
                {dark && <TriangleAlert className="text-warning" />}
                {dark ? tr("More light would help: face a lamp or a window.") : face ? tr("Face found: read it.") : tr("Show the whole face to the camera.")}
              </Badge>
            </div>
          )}
          {devices.length > 1 && (
            <Tip content={tr("Switch camera")}>
              <Button
                variant="secondary"
                size="icon"
                data-action="scan:camera"
                aria-label={tr("Switch camera")}
                className="absolute top-3 right-3 bg-background/85 backdrop-blur"
                onClick={() => setDevice(devices[(devices.indexOf(device ?? track.current?.getSettings().deviceId ?? "") + 1) % devices.length]!)}
              >
                <SwitchCamera />
              </Button>
            </Tip>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-4 md:w-64">
        <div className="flex items-center gap-4 md:flex-col md:items-start" aria-live="polite">
          <HoldCube index={current < 0 ? 0 : current} animated={!!step.turn && redo === null} stickers={scanStickers(faces, refs)} />
          <div className="flex min-w-0 flex-col gap-1">
            <span className={LABEL}>{tr("Face {0} of {1}", { 0: current + 1, 1: ORDER.length })}</span>
            <p className="text-lg font-semibold tracking-tight text-balance">{said(step.title)}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <SectionHead title={tr("Faces read")} meta={`${done}/${ORDER.length}`} />
          <div className="flex gap-1.5">
            {ORDER.map((o, i) => (
              <MiniFace key={o.face} step={o} colours={faces[i]?.map((c) => scanColour(c, refs))} current={i === current} onClick={faces[i] ? () => setRedo(i) : undefined} />
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 md:flex-col md:items-stretch">
          <Tip content={tr("Or press Space")}>
            <Button data-action="scan:read" onClick={readNow} disabled={state !== "live" || !live} className="max-md:h-11 max-md:flex-1">
              <Camera />
              {tr("Read this face")}
            </Button>
          </Tip>
          <Tip content={tr("Or press Backspace")}>
            <Button variant="outline" data-action="scan:undo" onClick={undo} disabled={last < 0} className="max-md:h-11 max-md:flex-1">
              <Undo2 />
              {tr("Read the last face again")}
            </Button>
          </Tip>
          <Button variant="ghost" data-action="scan:hand" onClick={onHand} className="text-muted-foreground max-md:h-11 max-md:flex-1">
            <Paintbrush />
            {tr("Enter the colours by hand")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The colour each sticker of a face is painted, the centre fixed: the net of the cube, U above F, D below. */
function Net({ colours, doubt, brush, onPaint }: { colours: (Face | null)[]; doubt: boolean[]; brush: Face; onPaint: (slot: number) => void }) {
  const place: Record<Face, string> = { U: "col-start-2 row-start-1", L: "col-start-1 row-start-2", F: "col-start-2 row-start-2", R: "col-start-3 row-start-2", B: "col-start-4 row-start-2", D: "col-start-2 row-start-3" };
  return (
    <div className="grid grid-cols-4 gap-1.5" role="group" aria-label={tr("Cube net")}>
      {FACES.map((face, f) => (
        <div key={face} className={cn("grid grid-cols-3 gap-0.5", place[face])}>
          {Array.from({ length: 9 }, (_, i) => {
            const slot = f * 9 + i,
              colour = colours[slot],
              unsure = doubt[slot];
            return (
              <button
                key={i}
                type="button"
                data-action="scan:paint"
                disabled={i === 4}
                aria-label={unsure ? tr("Check this sticker") : tr("Paint this sticker")}
                onClick={() => onPaint(slot)}
                className={cn(
                  "relative size-[clamp(1rem,min(4.2svh,calc((100vw_-_5rem)/13)),2.25rem)] rounded-[4px] ring-1 ring-foreground/20 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 enabled:cursor-pointer enabled:hover:opacity-80",
                  !colour && "bg-[repeating-linear-gradient(45deg,var(--muted),var(--muted)_3px,transparent_3px,transparent_6px)]",
                  colour === brush && i !== 4 && "ring-foreground/40",
                  unsure && "ring-2 ring-warning ring-offset-1 ring-offset-background",
                )}
                style={colour ? { background: hex(colour) } : undefined}
              >
                {unsure && <span className="absolute -top-1 -right-1 size-2 rounded-full bg-warning ring-2 ring-background motion-safe:animate-pulse" />}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * The colours read, to check and correct on the net, the doubtful ones marked; the solve starts once they make a cube
 * that can be solved.
 */
function Review({ initial, doubt: unsure, onDone, onCamera }: { initial: (Face | null)[]; doubt?: boolean[]; onDone: (colours: Face[]) => void; onCamera?: () => void }) {
  const [colours, setColours] = useState(initial),
    [doubt, setDoubt] = useState(unsure ?? initial.map(() => false)),
    [brush, setBrush] = useState<Face>("U"),
    problem = scanProblem(colours),
    // Nothing painted yet (manual entry): no problem to show before the first sticker.
    blank = colours.every((c, i) => i % 9 === 4 || !c),
    checks = doubt.filter(Boolean).length;
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
      <div className="flex w-full max-w-xl flex-col items-center gap-1 text-center">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <h3 className="text-base font-semibold tracking-tight">{tr("Check the colours")}</h3>
          {checks > 0 && <Badge variant="warning">{checks === 1 ? tr("1 sticker to check") : tr("{0} stickers to check", { 0: checks })}</Badge>}
        </div>
        <p className="text-sm text-balance text-muted-foreground">
          {tr("Check each face against your cube, yellow on top and green in front. Pick a colour, then click the stickers to correct.")}
        </p>
      </div>
      <ToggleGroup aria-label={tr("Colour")} spacing={1} value={[brush]} onValueChange={(next: string[]) => next[0] && setBrush(next[0] as Face)}>
        {FACES.map((face) => (
          <ToggleGroupItem key={face} value={face} aria-label={said(COLOUR_NAMES[face])} className="size-9 p-1.5 aria-pressed:ring-2 aria-pressed:ring-primary">
            <span className="size-full rounded-sm ring-1 ring-foreground/20" style={{ background: hex(face) }} />
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Net
        colours={colours}
        doubt={doubt}
        brush={brush}
        onPaint={(slot) => {
          setColours((c) => c.map((v, i) => (i === slot ? brush : v)));
          setDoubt((d) => d.map((v, i) => v && i !== slot));
        }}
      />
      <div className="min-h-12 w-full max-w-md">
        {problem && !blank && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription>{said(problem)}</AlertDescription>
          </Alert>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {onCamera && (
          <Button variant="outline" size="lg" data-action="scan:again" onClick={onCamera} className="max-md:h-11">
            <Camera />
            {tr("Read again with the camera")}
          </Button>
        )}
        <Button size="lg" data-action="scan:done" disabled={!!problem} onClick={() => onDone(colours as Face[])} className="max-md:h-11">
          <Check />
          {tr("Looks right")}
        </Button>
      </div>
    </div>
  );
}

/** Only the centres: the stickers to paint by hand. */
const CENTRES = Array.from({ length: 54 }, (_, i) => (i % 9 === 4 ? FACES[Math.floor(i / 9)]! : null));

/**
 * Reads a cube: by the camera, then on the net; `hand` opens on the net, to paint by hand. `initial`, the colours the
 * cube should have, starts the net when it is painted by hand.
 */
export function CubeScan({ initial, hand = false, onDone }: { initial?: Face[]; hand?: boolean; onDone: (colours: Face[]) => void }) {
  const [read, setRead] = useState<{ colours: (Face | null)[]; doubt?: boolean[]; camera: boolean } | null>(
    hand ? { colours: initial ?? CENTRES, camera: false } : null,
  );
  if (read)
    return (
      <Review
        key={read.camera ? "read" : "hand"}
        initial={read.colours}
        doubt={read.doubt}
        onDone={onDone}
        onCamera={read.camera || !hand ? () => setRead(null) : undefined}
      />
    );
  return (
    <CameraScan
      onRead={(samples) => {
        // The colours compared with each other, as the lab does; should they make no real cube, the real cube closest
        // to them, its doubtful stickers marked.
        const colours = resolve(samples);
        if (!scanProblem(colours)) return setRead({ colours, camera: true });
        const cube = readCube(samples);
        setRead({ colours: cube.colours, doubt: cube.confidence.map((c) => c < DOUBT), camera: true });
      }}
      onHand={() => setRead({ colours: initial ?? CENTRES, camera: false })}
    />
  );
}
