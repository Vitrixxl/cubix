/**
 * The cube's world, an easter egg the store opens when R R L L U U D D is turned on a smart cube (store.ts): the whole
 * window becomes a world where the cube falls, bounces and rolls, turned as the player turns theirs and kicked by each of
 * its turns, a tap making it jump. The world is Rust (cubeworld/, WebAssembly): its physics and its picture, which
 * this page puts on a canvas. A burst says it was found first.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Box } from "lucide-react";
import { smartCube, type SmartCubeSnapshot } from "../../src/client/lib/smartCube";
import { faceOfSlot, SLOTS } from "../../src/shared/cube";
import { FACE_COLORS, FACE_HEX } from "../../src/shared/cubeAppearance";
import { tr } from "../../src/client/i18n";
import { Back } from "./ui";
import { store } from "./store";

declare const CUBIX_CUBEWORLD: string;

interface Exports {
  memory: WebAssembly.Memory;
  resize(width: number, height: number): number;
  stickers(): number;
  turn(axis: number, layer: number, angle: number): void;
  hold(w: number, x: number, y: number, z: number): void;
  poke(): void;
  frame(dt: number): void;
}

/** The picture's pixels at most: the world is drawn without the graphics card. */
const PIXELS = 1_600_000;
const INTRO_MS = 2600;

/** Writes the cube's stickers where the world reads them: each one's cubie, normal and colour. */
function writeStickers(world: Exports, state: SmartCubeSnapshot["state"]) {
  const out = new Float32Array(world.memory.buffer, world.stickers(), 54 * 7);
  SLOTS.forEach(({ p, n }, i) => out.set([...p, ...n, FACE_HEX[faceOfSlot(state[i]!)]], i * 7));
}

export function CubeWorld() {
  const canvas = useRef<HTMLCanvasElement>(null),
    world = useRef<Exports>(undefined),
    [intro, setIntro] = useState(true),
    reduced = useReducedMotion();

  useEffect(() => {
    const id = setTimeout(() => setIntro(false), reduced ? 600 : INTRO_MS);
    const key = (event: KeyboardEvent) => event.key === "Escape" && void store.action("menu:world");
    addEventListener("keydown", key);
    return () => (clearTimeout(id), removeEventListener("keydown", key));
  }, [reduced]);

  // The world moves once the burst is gone: the cube falls into it.
  useEffect(() => {
    if (intro) return;
    let frame = 0, stopped = false, last = performance.now();
    void fetch(CUBIX_CUBEWORLD)
      .then((response) => response.arrayBuffer())
      .then((bytes) => WebAssembly.instantiate(bytes, {}))
      .then(({ instance }) => {
        if (stopped) return;
        const w = (world.current = instance.exports as unknown as Exports),
          ctx = canvas.current!.getContext("2d")!;
        let size = "", pixels = 0, count = -1, orientation: SmartCubeSnapshot["orientation"];
        const draw = (now: number) => {
          frame = requestAnimationFrame(draw);
          const el = canvas.current!, { clientWidth: cw, clientHeight: ch } = el,
            scale = Math.min(devicePixelRatio, Math.sqrt(PIXELS / (cw * ch))),
            [width, height] = [Math.round(cw * scale), Math.round(ch * scale)];
          if (`${width}x${height}` !== size) {
            size = `${width}x${height}`;
            [el.width, el.height] = [width, height];
            pixels = w.resize(width, height);
          }
          const snap = smartCube.snapshot;
          if (snap.count !== count) {
            writeStickers(w, snap.state);
            const move = snap.turn?.move;
            if (count >= 0 && move?.layers.length === 1) w.turn(move.axis, move.layers[0]!, (move.q === 3 ? -1 : move.q) * (Math.PI / 2));
            count = snap.count;
          }
          if (snap.orientation && snap.orientation !== orientation) w.hold(...(orientation = snap.orientation));
          w.frame((now - last) / 1000);
          last = now;
          ctx.putImageData(new ImageData(new Uint8ClampedArray(w.memory.buffer, pixels, width * height * 4), width, height), 0, 0);
        };
        frame = requestAnimationFrame(draw);
      });
    return () => (stopped = true, cancelAnimationFrame(frame));
  }, [intro]);

  return (
    <div data-slot="cube-world" className="fixed inset-0 z-50 overflow-hidden bg-[#221e54]">
      <canvas ref={canvas} className="absolute inset-0 size-full touch-none" onPointerDown={() => world.current?.poke()} />
      <div className="absolute top-4 left-4">
        <Back action="menu:world" />
      </div>
      <AnimatePresence>{intro && <Burst reduced={!!reduced} onSkip={() => setIntro(false)} />}</AnimatePresence>
    </div>
  );
}

/** The cube's colours flying out of the middle. */
const CONFETTI = Array.from({ length: 36 }, (_, i) => {
  const angle = (i / 36) * Math.PI * 2 + Math.sin(i * 7.3) * 0.3, reach = 38 + ((i * 37) % 25);
  return { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach, colour: Object.values(FACE_COLORS)[i % 6]!, turn: ((i * 97) % 720) - 360, delay: 0.35 + (i % 6) * 0.03 };
});

/** The burst: the accent fills the window from its middle, the cube bounces in, the words pop up letter by letter,
 * then it closes like an iris onto the world. A tap skips it. */
function Burst({ reduced, onSkip }: { reduced: boolean; onSkip: () => void }) {
  const title = tr("Secret unlocked!");
  return (
    <motion.div
      className="absolute inset-0 grid cursor-pointer place-items-center overflow-hidden"
      onPointerDown={onSkip}
      exit={reduced ? { opacity: 0 } : { clipPath: "circle(0% at 50% 50%)" }}
      initial={{ clipPath: "circle(150% at 50% 50%)" }}
      transition={{ duration: 0.6, ease: [0.7, 0, 0.3, 1] }}
    >
      <motion.div
        className="absolute top-1/2 left-1/2 size-[300vmax] -translate-1/2 rounded-full bg-primary"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 120, damping: 18 }}
      />
      {!reduced &&
        CONFETTI.map((c, i) => (
          <motion.span
            key={i}
            className="absolute top-1/2 left-1/2 size-4 rounded-[4px]"
            style={{ background: c.colour }}
            initial={{ x: 0, y: 0, scale: 0, rotate: 0 }}
            animate={{ x: `${c.x}vmin`, y: [`${c.y * 0.6}vmin`, `${c.y + 30}vmin`], scale: [0, 1.3, 1], rotate: c.turn }}
            transition={{ duration: 1.8, delay: c.delay, ease: "easeOut" }}
          />
        ))}
      <div className="relative flex flex-col items-center gap-6 text-primary-foreground">
        <motion.div
          className="grid size-28 place-items-center rounded-[28px] bg-primary-foreground text-primary shadow-[0_10px_0_rgba(0,0,0,0.18)]"
          initial={{ y: "-60vh", rotate: -30, scale: 0.6 }}
          animate={{ y: 0, rotate: [-30, 12, -8, 0], scale: [0.6, 1.25, 0.9, 1] }}
          transition={{ delay: 0.25, duration: 0.9, type: "spring", bounce: 0.55 }}
        >
          <Box className="size-16" strokeWidth={2.5} />
        </motion.div>
        <h1 aria-label={title} className="flex text-5xl font-extrabold tracking-tight max-md:text-3xl">
          {[...title].map((letter, i) => (
            <motion.span
              key={i}
              aria-hidden
              className="inline-block whitespace-pre"
              initial={{ y: 40, opacity: 0, scale: 0.4 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ delay: 0.7 + i * 0.035, type: "spring", stiffness: 500, damping: 14 }}
            >
              {letter}
            </motion.span>
          ))}
        </h1>
        <motion.p
          className="text-xl font-semibold opacity-90"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 0.9, y: 0 }}
          transition={{ delay: 1.3, duration: 0.4 }}
        >
          {tr("Welcome to the cube's world")}
        </motion.p>
      </div>
    </motion.div>
  );
}
