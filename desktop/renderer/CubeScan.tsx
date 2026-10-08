/**
 * The cube read face by face for the assisted solve: each face shown to the camera in turn, as the instruction says,
 * read on its own once held still, then every colour checked on the cube's net, the doubtful ones marked, where a
 * sticker read wrong is painted over. Without a camera, the net is painted by hand.
 *
 * The camera's picture is shown mirrored like a selfie when it faces the player, but read as it comes (the face as
 * seen from outside). The face found is drawn where it stands, each sticker filled with the colour read there.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Camera, CameraOff, Check, Paintbrush, RefreshCw, SwitchCamera, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { FACES, type Face } from "../../src/shared/cube";
import { cubeOrientation, cubeScene } from "../../src/shared/cubeScene";
import { HELD_HEX } from "../../src/shared/cubeAppearance";
import { msg } from "../../src/client/i18n/msg";
import { difference, liveColours, readCube, scanProblem, type Rgb } from "../../src/client/lib/cubeScan";
import { CELL, CORNER, CORNER_AT, FaceReader, findFace, readFace, type FoundFace } from "../../src/client/lib/faceFinder";
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
 * The faces in the order they are shown, each with how to hold the cube for it (`top` on top, the face's top row up),
 * and whether it comes from the last one by a quarter turn of the whole cube to the left.
 */
// `setup` turns the held cube (see `parseScramble`: y' is a turn to the left) from green in front, yellow on top.
const ORDER: { face: Face; setup: string; title: string; held: string; left?: boolean }[] = [
  { face: "F", setup: "", title: "Green face to the camera", held: msg("Yellow on top") },
  { face: "R", setup: "y'", title: "Orange face to the camera", held: msg("Yellow on top"), left: true },
  { face: "B", setup: "y' y'", title: "Blue face to the camera", held: msg("Yellow on top"), left: true },
  { face: "L", setup: "y' y' y'", title: "Red face to the camera", held: msg("Yellow on top"), left: true },
  { face: "U", setup: "x", title: "Yellow face to the camera", held: msg("Blue on top") },
  { face: "D", setup: "x'", title: "White face to the camera", held: msg("Green on top") },
];
/** The square read from the camera, in pixels; the guide's share of it, read where no face is found. */
const READ = 160,
  GUIDE = 0.62;
/** Below this, a sticker read is marked to check. */
const DOUBT = 0.8;

/** Seen nearly face on: the face to the camera stands out from the one on its right. */
const FACING = cubeOrientation(0.4, 0.5);
/** The cube as it should be held for a step, as the app draws it; turned to the left before the eyes when it is. */
function HoldCube({ index, animated }: { index: number; animated: boolean }) {
  const scene = useMemo(() => {
    const all = cubeScene(ORDER[index]!.setup, 3, "full", animated, true);
    return animated ? { ...all, states: all.states.slice(-2), moves: all.moves.slice(-1) } : all;
  }, [index, animated]);
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

type Live = { face: FoundFace | null; progress: number; hint: string | null };

// The eight stickers around the centre, going round, as `readFace` orders the nine.
const RING = [0, 1, 2, 5, 8, 7, 6, 3];
/** The same face read twice, however turned: its centre, or most of the stickers around it, alike (a logo may change
 * how the centre reads from one look to the next). */
const sameFace = (a: readonly Rgb[], b: readonly Rgb[]) =>
  difference(a[4]!, b[4]!) < 12 ||
  [0, 2, 4, 6].some((turn) => RING.filter((k, n) => difference(a[k]!, b[RING[(n + turn) % 8]!]!) < 12).length >= 6);

/**
 * The camera's picture and the faces read so far. A face found in it is drawn with the colours read, and read on its
 * own once it stays still, provided its centre is one not read yet; the button (or Space) reads it at once, from the
 * guide in the middle when no face is found.
 */
function CameraScan({ onRead, onHand }: { onRead: (samples: Rgb[]) => void; onHand: () => void }) {
  const video = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    reader = useRef(new FaceReader()),
    frame = useRef<Uint8ClampedArray | null>(null),
    [state, setState] = useState<"starting" | "live" | "none">("starting"),
    [devices, setDevices] = useState<string[]>([]),
    [device, setDevice] = useState<string | null>(null),
    [attempt, setAttempt] = useState(0),
    [mirrored, setMirrored] = useState(true),
    [live, setLive] = useState<Live>({ face: null, progress: 0, hint: null }),
    [faces, setFaces] = useState<(Rgb[] | null)[]>(ORDER.map(() => null)),
    [redo, setRedo] = useState<number | null>(null),
    [flash, setFlash] = useState(false),
    track = useRef<MediaStreamTrack | null>(null),
    [box, setBox] = useState<HTMLDivElement | null>(null),
    side = useSquare(box);
  const current = redo ?? faces.findIndex((f) => !f),
    step = ORDER[current] ?? ORDER[0]!,
    // Kept current for the camera's loop.
    latest = useRef({ faces, current });
  latest.current = { faces, current };

  const capture = (colours: Rgb[]) => {
    const { faces, current } = latest.current;
    if (current < 0) return;
    const next = faces.map((f, i) => (i === current ? colours : f));
    setFaces(next);
    setRedo(null);
    reader.current.reset();
    setFlash(true);
    setTimeout(() => setFlash(false), 450);
    // The first face read, the camera keeps its exposure and white balance where it can: the faces then differ only
    // by their light.
    const camera = track.current,
      can = camera?.getCapabilities?.() as { exposureMode?: string[]; whiteBalanceMode?: string[] } | undefined,
      hold = { ...(can?.exposureMode?.includes("manual") && { exposureMode: "manual" }), ...(can?.whiteBalanceMode?.includes("manual") && { whiteBalanceMode: "manual" }) };
    if (camera && Object.keys(hold).length) camera.applyConstraints({ advanced: [hold as MediaTrackConstraintSet] }).catch(() => {});
    // Cubix's sticker order: U, D, F, B, R, L.
    if (next.every(Boolean)) onRead(FACES.flatMap((face) => next[ORDER.findIndex((o) => o.face === face)]!));
  };
  /** Reads the face now: the one found, else the guide. */
  const readNow = () => {
    const data = frame.current;
    if (!data) return;
    const cell = (READ * GUIDE) / 3;
    capture(live.face?.colours ?? readFace(data, READ, READ, [READ / 2, READ / 2], [cell, 0], [0, cell]));
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
    const tick = () => {
      loop = requestAnimationFrame(tick);
      const v = video.current,
        c = canvas.current;
      if (!v || !c || !v.videoWidth) return;
      const crop = Math.min(v.videoWidth, v.videoHeight),
        ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(v, (v.videoWidth - crop) / 2, (v.videoHeight - crop) / 2, crop, crop, 0, 0, READ, READ);
      const { data } = ctx.getImageData(0, 0, READ, READ);
      frame.current = data;
      const face = findFace(data, READ, READ),
        { faces, current } = latest.current,
        // A face read already shows again: it waits for the next one.
        again = !!face && faces.some((f, i) => f && i !== current && sameFace(f, face.colours));
      const read = again ? null : reader.current.push(face);
      let light = 0;
      for (let i = 0; i < data.length; i += 4 * 37) light += 0.3 * data[i]! + 0.59 * data[i + 1]! + 0.11 * data[i + 2]!;
      light /= data.length / (4 * 37);
      const width = face ? (3 * Math.hypot(...face.u)) / READ : 0;
      setLive({
        face,
        progress: again ? 0 : reader.current.progress,
        hint: light < 45
          ? tr("More light would help: face a lamp or a window.")
          : again
            ? tr("This face is read already: turn the cube as shown.")
            : !face
              ? tr("Show the whole face inside the square.")
              : width < 0.34
                ? tr("Bring the cube closer.")
                : width > 0.9
                  ? tr("Move the cube back a little.")
                  : null,
      });
      if (read) capture(read);
    };
    loop = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(loop);
      stream?.getTracks().forEach((t) => t.stop());
      track.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device, attempt]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== " " || (e.target as HTMLElement).closest?.("button, input")) return;
      e.preventDefault();
      e.stopPropagation();
      readNow();
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

  const face = live.face,
    // The face asked for's centre is its colour: the look of that colour on this face.
    seen: Partial<Record<Face, Rgb>> = face && live.progress > 0 ? { [step.face]: face.colours[4]! } : {},
    cell = (READ * GUIDE) / 3,
    // Where the nine stickers are drawn: on the face found, else on the guide.
    [c, u, v] = face ? [face.centre, face.u, face.v] : [[READ / 2, READ / 2], [cell, 0], [0, cell]],
    at = (i: number, j: number) => `${c[0]! + i * u[0]! + j * v[0]!},${c[1]! + i * u[1]! + j * v[1]!}`,
    holding = !!face && live.progress > 0,
    done = faces.filter(Boolean).length,
    ring = 2 * Math.PI * 7;
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
            <svg viewBox={`0 0 ${READ} ${READ}`} className="absolute inset-0 size-full" aria-hidden="true">
              {face ? (
                <>
                  <polygon
                    points={[at(-1.5, -1.5), at(1.5, -1.5), at(1.5, 1.5), at(-1.5, 1.5)].join(" ")}
                    fill="none"
                    stroke={holding ? "var(--primary)" : "white"}
                    strokeOpacity={holding ? 1 : 0.8}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                  />
                  {liveColours(face.colours, seen).flatMap((colour, k) => {
                    const [i, j] = [(k % 3) - 1, Math.floor(k / 3) - 1],
                      // Where the colour is read: the middle of the sticker, or the centre's four corners (a logo).
                      squares = k === 4 ? [-1, 1].flatMap((x) => [-1, 1].map((y) => [i + x * CORNER_AT, j + y * CORNER_AT, CORNER / 2])) : [[i, j, CELL / 2]];
                    return squares.map(([x, y, e], n) => (
                      <polygon
                        key={`${k}-${n}`}
                        points={[at(x! - e!, y! - e!), at(x! + e!, y! - e!), at(x! + e!, y! + e!), at(x! - e!, y! + e!)].join(" ")}
                        fill={hex(colour)}
                        stroke="white"
                        strokeWidth={k === 4 ? 0.5 : 0.8}
                        strokeLinejoin="round"
                      />
                    ));
                  })}
                </>
              ) : (
                <polygon
                  points={[at(-1.5, -1.5), at(1.5, -1.5), at(1.5, 1.5), at(-1.5, 1.5)].join(" ")}
                  fill="none"
                  stroke="white"
                  strokeOpacity={0.7}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  strokeLinejoin="round"
                />
              )}
            </svg>
          </div>
          {state === "starting" && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">{tr("Starting your camera…")}</div>
          )}
          {state === "live" && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3" aria-live="polite">
              <Badge variant="secondary" className="h-7 gap-1.5 bg-background/85 px-2.5 text-foreground backdrop-blur">
                {holding ? (
                  <svg viewBox="0 0 18 18" className="size-4 -rotate-90" aria-hidden="true">
                    <circle cx={9} cy={9} r={7} fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth={2.5} />
                    <circle cx={9} cy={9} r={7} fill="none" stroke="var(--primary)" strokeWidth={2.5} strokeLinecap="round" strokeDasharray={`${ring * live.progress} ${ring}`} />
                  </svg>
                ) : live.hint ? (
                  <TriangleAlert className="text-warning" />
                ) : null}
                {holding ? tr("Hold still…") : (live.hint ?? tr("Hold still…"))}
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
          <canvas ref={canvas} width={READ} height={READ} hidden />
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-4 md:w-64">
        <div className="flex items-center gap-4 md:flex-col md:items-start" aria-live="polite">
          <HoldCube index={current < 0 ? 0 : current} animated={!!step.left && redo === null} />
          <div className="flex min-w-0 flex-col gap-1">
            <span className={LABEL}>{tr("Face {0} of {1}", { 0: current + 1, 1: ORDER.length })}</span>
            <p className="text-lg font-semibold tracking-tight text-balance">{said(step.title)}</p>
            <p className="text-sm text-balance text-muted-foreground">
              {step.left && redo === null ? tr("Turn the whole cube a quarter to the left, yellow still on top") : said(step.held)}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <SectionHead title={tr("Faces read")} meta={`${done}/${ORDER.length}`} />
          <div className="flex gap-1.5">
            {ORDER.map((o, i) => (
              <MiniFace key={o.face} step={o} colours={faces[i] ? liveColours(faces[i]!, { [o.face]: faces[i]![4]! }) : undefined} current={i === current} onClick={faces[i] ? () => setRedo(i) : undefined} />
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 md:flex-col md:items-stretch">
          <Tip content={tr("Or press Space")}>
            <Button variant="outline" data-action="scan:read" onClick={readNow} disabled={state !== "live"} className="max-md:h-11 max-md:flex-1">
              <Camera />
              {tr("Read this face")}
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
        const cube = readCube(samples);
        setRead({ colours: cube.colours, doubt: cube.confidence.map((c) => c < DOUBT), camera: true });
      }}
      onHand={() => setRead({ colours: initial ?? CENTRES, camera: false })}
    />
  );
}
