/**
 * The cube read face by face for the assisted solve, as ~/dev/lab/rubik does: each face asked for by its centre's colour
 * and held any way round, found wherever it stands in the picture, and read on a key press, then every colour checked on the cube's net, where a sticker read
 * wrong is painted over. Without a camera, the net is painted by hand.
 *
 * The camera's picture is shown mirrored like a selfie when it faces the player, but read as it comes (the face as
 * seen from outside).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Camera, CameraOff, Check, Paintbrush, RefreshCw, Sun, SwitchCamera, TriangleAlert, Undo2, type LucideIcon } from "lucide-react";
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
import { ActionCard, FOCUS, IconTile, said, Tip } from "./base";

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
function HoldCube({ index, animated, stickers, size = 112 }: { index: number; animated: boolean; stickers: (Face | null)[]; size?: number }) {
  const key = stickers.join();
  const scene = useMemo(() => {
    const all = { ...cubeScene(ORDER[index]!.setup, 3, "full", animated, true), colors: heldColors(stickers) };
    return animated ? { ...all, states: all.states.slice(-2), moves: all.moves.slice(-1) } : all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, animated, key]);
  return <Cube scene={scene} size={size} orientation={FACING} />;
}

/** Only the centres: the stickers to paint by hand. */
const CENTRES = Array.from({ length: 54 }, (_, i) => (i % 9 === 4 ? FACES[Math.floor(i / 9)]! : null));

/** How the cube is held from start to end: the cube of its centres, yellow on top and green facing the player, in words beside it. */
export function HoldNote({ size = 58, short = false }: { size?: number; short?: boolean }) {
  const scene = useMemo(() => ({ ...cubeScene("", 3, "full", false, true), colors: heldColors(CENTRES) }), []);
  return (
    <span className="flex items-center gap-3">
      <span aria-hidden="true" className="shrink-0">
        <Cube scene={scene} size={size} animated={false} />
      </span>
      <span className="flex flex-col text-sm leading-snug font-bold">
        <span>{tr("Yellow on top")}</span>
        <span>{tr("Green facing you")}</span>
        {!short && <span className="mt-0.5 text-xs font-normal text-muted-foreground">{tr("From start to end, without turning the cube over.")}</span>}
      </span>
    </span>
  );
}

/**
 * A face flat: its nine colours, or only its centre while it waits; `doubt`, the stickers to check, dashed with a
 * question mark.
 */
export function FlatFace({ face, colours, size, doubt }: { face: Face; colours?: (Face | null)[]; size: number; doubt?: boolean[] }) {
  return (
    <span className="grid shrink-0 grid-cols-3 bg-background" style={{ width: size, height: size, gap: size * 0.05, padding: size * 0.05, borderRadius: size * 0.16 }}>
      {Array.from({ length: 9 }, (_, k) => {
        const colour = colours ? colours[k] : k === 4 ? face : null;
        return (
          <span
            key={k}
            className={cn("flex items-center justify-center font-extrabold text-[#1c1317]", !colour && "bg-muted", doubt?.[k] && "outline-2 -outline-offset-2 outline-foreground outline-dashed")}
            style={{ borderRadius: size * 0.07, fontSize: size * 0.2, ...(colour && { background: hex(colour) }) }}
          >
            {doubt?.[k] && "?"}
          </span>
        );
      })}
    </span>
  );
}

/** A face held up to the camera, the grid found drawn on it, each sticker marked with the colour read: the camera's way, drawn. */
export function CameraPicture() {
  const face: Face[] = ["R", "U", "D", "F", "U", "L", "B", "U", "F"];
  return (
    <span aria-hidden="true" className="flex size-[190px] items-center justify-center rounded-[22px] bg-[radial-gradient(circle_at_50%_40%,#4a3a38,#241a1c_70%)]">
      <span className="grid size-[110px] -rotate-9 -skew-x-4 grid-cols-3 gap-[3px] rounded-[10px] bg-[#151012] p-1">
        {face.map((c, k) => (
          <span key={k} className="flex items-center justify-center rounded-[5px] ring-[1.5px] ring-[#f8ebe4]/90" style={{ background: hex(c) }}>
            <span className="size-2 rounded-full border-[1.5px] border-[#1c1317]" />
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * A moment that stops the way (a cube that cannot be solved, a cube off the plan, already solved): its picture, a
 * title and a sentence, then what can be done, each in a case of its own.
 */
export function Notice({ cube, icon, title, text, children }: { cube?: React.ReactNode; icon?: LucideIcon; title: React.ReactNode; text: React.ReactNode; children: React.ReactNode }) {
  return (
    <section data-slot="notice" className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-hidden rounded-[26px] bg-card p-5 text-center md:gap-5 md:p-8">
      {cube ?? (icon && <IconTile icon={icon} className="size-16 rounded-[20px] [&_svg]:size-7" />)}
      <h2 className="text-[26px] leading-tight font-extrabold tracking-[-0.04em] text-balance md:text-4xl">{title}</h2>
      <p className="max-w-xl text-sm leading-relaxed text-balance text-muted-foreground md:text-base">{text}</p>
      <div className="grid w-full gap-2 md:flex md:justify-center md:gap-3 [&>button]:md:w-[250px] [&>button]:md:flex-col [&>button]:md:items-start [&>button]:md:p-4">{children}</div>
    </section>
  );
}

/**
 * The camera's picture with the face found drawn on it, each cell marked with the colour read there (nothing while no
 * face is found, and nothing to read), and beside it the face asked for, the faces read so far and what can be done.
 * Space (or its case) reads the face asked for, Backspace reads the last one again. As in the lab, the face asked
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

  // The face asked for's centre is its colour while it is held.
  const seen = live && current >= 0 ? live.map((c) => scanColour(c, { ...refs, [step.face]: live[4]! })) : null,
    dark = !!live && live.reduce((s, [r, g, b]) => s + 0.3 * r + 0.59 * g + 0.11 * b, 0) / 9 < 45,
    done = faces.filter(Boolean).length,
    shapes = face && latticeShapes(face.centre, face.u, face.v),
    chip = "flex items-center gap-2 rounded-xl bg-background/85 px-3 py-2 text-sm font-bold backdrop-blur";
  return (
    <div className="grid min-h-0 flex-1 gap-3 max-md:grid-rows-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_minmax(0,380px)] md:gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div ref={setBox} className="relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-[26px] bg-card">
        {state === "none" ? (
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <IconTile icon={CameraOff} />
            <p className="text-base font-bold">{tr("No camera")}</p>
            <p className="max-w-sm text-sm text-balance text-muted-foreground">{tr("Allow the camera to read your cube, or enter its colours by hand.")}</p>
            <Button variant="outline" data-action="scan:retry" onClick={() => setAttempt((a) => a + 1)}>
              <RefreshCw />
              {tr("Try again")}
            </Button>
          </div>
        ) : (
          <div className={cn("relative shrink-0 overflow-hidden rounded-[18px] transition-shadow duration-300 motion-reduce:transition-none", flash && "ring-4 ring-success")} style={{ width: side, height: side }}>
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
            {state === "starting" && <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">{tr("Starting your camera…")}</div>}
          </div>
        )}
        {current >= 0 && <span className={cn(chip, "absolute top-3 left-3 md:top-4 md:left-4")}>{tr("Face {0} of {1}", { 0: current + 1, 1: ORDER.length })}</span>}
        {state === "live" && (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-2 md:inset-x-4 md:bottom-4" aria-live="polite">
            <span className={cn(chip, "before:size-2 before:rounded-full", face ? "before:bg-success" : "before:bg-muted-foreground")}>{face ? tr("Face found: read it.") : tr("Show the whole face to the camera.")}</span>
            {dark && (
              <span className={chip}>
                <Sun className="size-4 text-warning" />
                {tr("More light would help: face a lamp or a window.")}
              </span>
            )}
          </div>
        )}
        {devices.length > 1 && (
          <Tip content={tr("Switch camera")}>
            <Button
              variant="secondary"
              size="icon"
              data-action="scan:camera"
              aria-label={tr("Switch camera")}
              className="absolute top-3 right-3 bg-background/85 backdrop-blur md:top-auto md:right-4 md:bottom-4"
              onClick={() => setDevice(devices[(devices.indexOf(device ?? track.current?.getSettings().deviceId ?? "") + 1) % devices.length]!)}
            >
              <SwitchCamera />
            </Button>
          </Tip>
        )}
      </div>
      <div className="flex min-h-0 flex-col gap-2.5 md:gap-3">
        <section className="flex flex-col gap-3 rounded-[24px] bg-card p-3.5 md:p-5" aria-live="polite">
          <span className="text-[13px] font-bold text-primary max-md:hidden">{tr("Show the face")}</span>
          <div className="flex items-center gap-3 md:flex-col md:items-start md:gap-4">
            <h2 className="text-xl leading-tight font-extrabold tracking-[-0.03em] text-balance max-md:order-2 md:text-[28px]">{said(step.title)}</h2>
            <div className="flex items-center gap-4 max-md:order-1">
              <span className="md:hidden">
                <HoldCube index={current < 0 ? 0 : current} animated={!!step.turn && redo === null} stickers={scanStickers(faces, refs)} size={56} />
              </span>
              <span className="max-md:hidden">
                <HoldCube index={current < 0 ? 0 : current} animated={!!step.turn && redo === null} stickers={scanStickers(faces, refs)} size={110} />
              </span>
              <p className="text-[15px] leading-snug text-muted-foreground max-md:hidden">{tr("Turn the cube as shown. Which way round the face is does not matter.")}</p>
            </div>
          </div>
        </section>
        <section className="flex flex-col gap-2.5 rounded-[24px] bg-card px-3.5 py-3 md:px-[18px] md:py-4" aria-label={tr("Faces read")}>
          <span className="text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
            {tr("Faces read")} · {done} / {ORDER.length}
          </span>
          <div className="flex justify-between gap-1.5">
            {ORDER.map((o, i) => {
              const read = faces[i]?.map((c) => scanColour(c, refs)),
                tile = (
                  <button
                    type="button"
                    data-action="scan:face"
                    disabled={!read}
                    onClick={() => setRedo(i)}
                    aria-current={i === current ? "step" : undefined}
                    aria-label={said(o.title)}
                    className={cn("flex flex-col items-center gap-1 rounded-xl p-0.5 text-[11px] font-bold text-muted-foreground first-letter:uppercase enabled:hover:text-foreground", FOCUS)}
                  >
                    <span className={cn("rounded-[9px]", i === current && "outline-2 outline-offset-2 outline-primary")}>
                      <span className="md:hidden">
                        <FlatFace face={o.face} colours={read} size={40} />
                      </span>
                      <span className="max-md:hidden">
                        <FlatFace face={o.face} colours={read} size={54} />
                      </span>
                    </span>
                    <span className="first-letter:uppercase max-md:hidden">{i === current ? tr("Now") : said(COLOUR_NAMES[o.face])}</span>
                  </button>
                );
              return read ? (
                <Tip key={o.face} content={tr("Read this face again")}>
                  {tile}
                </Tip>
              ) : (
                <span key={o.face}>{tile}</span>
              );
            })}
          </div>
          <span className="text-xs text-muted-foreground max-md:hidden">{tr("Click a face read to read it again.")}</span>
        </section>
        <div className="mt-auto grid grid-cols-2 gap-2 md:grid-cols-1">
          <ActionCard primary icon={Camera} title={tr("Read this face")} kbd={tr("Space")} onClick={readNow} disabled={state !== "live" || !live} action="scan:read" className="max-md:col-span-2" />
          <ActionCard icon={Undo2} title={tr("Read the last face again")} text={last >= 0 ? <span className="first-letter:uppercase max-md:hidden">{said(COLOUR_NAMES[ORDER[last]!.face])}</span> : undefined} kbd="⌫" onClick={undo} disabled={last < 0} action="scan:undo" />
          <ActionCard icon={Paintbrush} title={tr("Enter the colours by hand")} text={<span className="max-md:hidden">{tr("If the camera reads badly")}</span>} onClick={onHand} action="scan:hand" />
        </div>
      </div>
    </div>
  );
}

const PLACE: Record<Face, string> = { U: "col-start-2 row-start-1", L: "col-start-1 row-start-2", F: "col-start-2 row-start-2", R: "col-start-3 row-start-2", B: "col-start-4 row-start-2", D: "col-start-2 row-start-3" };

/** The colour each sticker of a face is painted, the centre fixed: the net of the cube, U above F, D below. */
function Net({ colours, doubt, brush, onPaint }: { colours: (Face | null)[]; doubt: boolean[]; brush: Face; onPaint: (slot: number) => void }) {
  return (
    <div className="grid grid-cols-4 gap-1.5 md:gap-2" role="group" aria-label={tr("Cube net")}>
      {FACES.map((face, f) => (
        <div key={face} className={cn("grid grid-cols-3 gap-1", PLACE[face])}>
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
                  "flex size-[calc((100vw_-_5rem)/13)] items-center justify-center rounded-[6px] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)] text-xs font-extrabold text-[#1c1317] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 enabled:cursor-pointer enabled:hover:opacity-80 md:size-[clamp(1rem,min(5.4svh,calc((100vw_-_34rem)/14)),2.75rem)]",
                  !colour && "bg-[repeating-linear-gradient(45deg,var(--muted),var(--muted)_3px,transparent_3px,transparent_6px)] ring-1 ring-foreground/15",
                  colour === brush && i !== 4 && "ring-1 ring-foreground/30",
                  unsure && "outline-2 -outline-offset-2 outline-foreground outline-dashed",
                )}
                style={colour ? { background: hex(colour) } : undefined}
              >
                {unsure && "?"}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * The colours read, to check and correct on the net, the doubtful ones marked, with the count of each colour; the
 * solve starts once they make a cube, or says it cannot be solved.
 */
function Review({ initial, doubt: unsure, onDone, onCamera, frame }: { initial: (Face | null)[]; doubt?: boolean[]; onDone: (colours: Face[]) => void; onCamera?: () => void; frame: Frame }) {
  const [colours, setColours] = useState(initial),
    [doubt, setDoubt] = useState(unsure ?? initial.map(() => false)),
    [brush, setBrush] = useState<Face>("U"),
    [impossible, setImpossible] = useState(false),
    counts = FACES.map((face) => colours.filter((c) => c === face).length),
    // Every sticker painted, nine of each colour: then only the solver can tell.
    complete = colours.every(Boolean) && counts.every((n) => n === 9),
    problem = scanProblem(colours),
    // Nothing painted yet (manual entry): no problem to show before the first sticker.
    blank = colours.every((c, i) => i % 9 === 4 || !c),
    checks = doubt.filter(Boolean).length;
  if (impossible)
    return frame(
      <Notice icon={TriangleAlert} title={tr("This cube cannot be solved")} text={problem ? said(problem) : tr("A piece is twisted or two pieces are swapped. Check the colours.")}>
        <ActionCard primary icon={Paintbrush} title={tr("Check the colours")} text={tr("The net, sticker by sticker")} onClick={() => setImpossible(false)} action="scan:check" />
        {onCamera && <ActionCard icon={Camera} title={tr("Read everything again")} text={tr("The six faces again")} onClick={onCamera} action="scan:again" />}
      </Notice>,
      () => setImpossible(false),
    );
  return frame(
    <div className="grid min-h-0 flex-1 gap-3 max-md:grid-rows-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_minmax(0,380px)] md:gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="relative flex min-h-0 min-w-0 items-center justify-center rounded-[26px] bg-card p-3 md:pb-16">
        <Net
          colours={colours}
          doubt={doubt}
          brush={brush}
          onPaint={(slot) => {
            setColours((c) => c.map((v, i) => (i === slot ? brush : v)));
            setDoubt((d) => d.map((v, i) => v && i !== slot));
          }}
        />
        <div className="absolute bottom-4 left-5 flex items-center gap-6 text-[13px] text-muted-foreground max-md:hidden">
          {checks > 0 && (
            <span className="flex items-center gap-2">
              <span className="flex size-5 items-center justify-center rounded-[5px] bg-muted-foreground text-xs font-extrabold text-background outline-2 -outline-offset-2 outline-foreground outline-dashed">?</span>
              {tr("Qbix is not sure of this sticker")}
            </span>
          )}
          <HoldNote size={40} short />
        </div>
      </div>
      <div className="flex min-h-0 flex-col gap-2.5 md:gap-3">
        <section className="flex flex-col gap-2.5 rounded-[24px] bg-card px-4 py-3.5 md:px-5 md:py-[18px]">
          <h2 className="text-lg font-extrabold max-md:hidden">{tr("Compare with your cube")}</h2>
          <p className="text-sm leading-snug text-muted-foreground max-md:hidden">{tr("Each colour must show on nine stickers.")}</p>
          <ul className="grid grid-cols-6 gap-1" aria-label={tr("Colour")}>
            {FACES.map((face, k) => (
              <li key={face} className="flex items-center justify-center gap-1 rounded-lg bg-muted px-1 py-1 text-[13px]" aria-label={`${said(COLOUR_NAMES[face])}: ${counts[k]} / 9`}>
                <span className="size-3.5 shrink-0 rounded-[4px] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)]" style={{ background: hex(face) }} />
                <b className={cn("font-sans tabular-nums", counts[k] !== 9 && !blank && "text-destructive")}>{counts[k]}</b>
                <span className="text-[11px] font-bold text-muted-foreground">/9</span>
              </li>
            ))}
          </ul>
          {problem && !blank && !complete && <p className="text-[13px] text-destructive">{said(problem)}</p>}
        </section>
        <section className="flex flex-col gap-2.5 rounded-[24px] bg-card px-4 py-3.5 md:px-5 md:py-[18px]">
          <h2 className="text-lg font-extrabold max-md:hidden">{checks === 1 ? tr("1 sticker to check") : checks ? tr("{0} stickers to check", { 0: checks }) : tr("Correct a sticker")}</h2>
          <p className="text-sm leading-snug text-muted-foreground max-md:hidden">{tr("Pick a colour, then click the stickers that do not match.")}</p>
          <ToggleGroup aria-label={tr("Colour")} spacing={2} value={[brush]} onValueChange={(next: string[]) => next[0] && setBrush(next[0] as Face)} className="justify-between">
            {FACES.map((face) => (
              <ToggleGroupItem
                key={face}
                value={face}
                data-action={"scan:brush:" + face}
                aria-label={said(COLOUR_NAMES[face])}
                className="size-11 p-0 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)] text-[#1c1317] hover:opacity-90 aria-pressed:ring-2 aria-pressed:ring-foreground aria-pressed:ring-offset-2 aria-pressed:ring-offset-card md:size-[46px]"
                style={{ background: hex(face) }}
              >
                {brush === face && <Check className="size-5" strokeWidth={3} />}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </section>
        <div className="mt-auto grid grid-cols-2 gap-2 md:grid-cols-1">
          <ActionCard primary icon={Check} title={tr("The colours are right")} text={tr("Qbix plans the solve")} disabled={!complete} onClick={() => (problem ? setImpossible(true) : onDone(colours as Face[]))} action="scan:done" className={cn(!onCamera && "col-span-2")} />
          {onCamera && <ActionCard icon={Camera} title={tr("Read again with the camera")} text={<span className="max-md:hidden">{tr("The six faces again")}</span>} onClick={onCamera} action="scan:again" />}
        </div>
      </div>
    </div>,
  );
}

/** The page around a screen of the reading, with its way back when it has its own. */
type Frame = (children: React.ReactNode, back?: () => void) => React.ReactNode;

/**
 * Reads a cube: by the camera, then on the net; `hand` opens on the net, to paint by hand. `initial`, the colours the
 * cube should have, starts the net when it is painted by hand. `frame` sets each screen in the page.
 */
export function CubeScan({ initial, hand = false, onDone, frame }: { initial?: Face[]; hand?: boolean; onDone: (colours: Face[]) => void; frame: Frame }) {
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
        frame={(children, back) => frame(children, back ?? (read.camera || !hand ? () => setRead(null) : undefined))}
        onCamera={read.camera || !hand ? () => setRead(null) : undefined}
      />
    );
  return frame(
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
    />,
  );
}
