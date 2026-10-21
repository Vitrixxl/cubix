/**
 * The cube's world, an easter egg the store opens when R R L L U U D D is turned on a smart cube (store.ts): the whole
 * window becomes a world where the cube falls, bounces and rolls, turned as the player turns theirs and kicked by each of
 * its turns, among the trees of an open meadow; the mouse only turns the camera around it. The world is Rust (cubeworld/, WebAssembly): its physics and
 * its drawing, whose WebGL calls this page passes on to the canvas (`shim`). A burst says it was found first.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Box } from "lucide-react";
import { smartCube, type SmartCubeSnapshot } from "../../src/client/lib/smartCube";
import { faceOfSlot, SLOTS } from "../../src/shared/cube";
import { FACE_COLORS, HELD_HEX } from "../../src/shared/cubeAppearance";
import { tr } from "../../src/client/i18n";
import { Back } from "./ui";

declare const CUBIX_CUBEWORLD: string;

interface Exports {
  memory: WebAssembly.Memory;
  resize(width: number, height: number): void;
  stickers(): number;
  turn(axis: number, layer: number, angle: number): void;
  hold(w: number, x: number, y: number, z: number): void;
  orbit(yaw: number, pitch: number): void;
  frame(dt: number): void;
}

const INTRO_MS = 2600;
/** Radians the camera turns per pixel dragged. */
const DRAG = 0.006;

/**
 * The WebGL 2 calls the world makes (cubeworld/src/lib.rs, `mod gl`), passed on to the context: its shaders, programs
 * and buffers are numbered, its strings and arrays read from its memory.
 */
function shim(gl: WebGL2RenderingContext, memory: () => WebAssembly.Memory) {
  const objects: unknown[] = [null], uniforms = new Map<string, WebGLUniformLocation | null>();
  const add = (object: unknown) => objects.push(object) - 1;
  const text = (ptr: number, len: number) => new TextDecoder().decode(new Uint8Array(memory().buffer, ptr, len));
  const uniform = (program: number, ptr: number, len: number) => {
    const key = `${program} ${text(ptr, len)}`;
    if (!uniforms.has(key)) uniforms.set(key, gl.getUniformLocation(objects[program] as WebGLProgram, text(ptr, len)));
    gl.useProgram(objects[program] as WebGLProgram);
    return uniforms.get(key)!;
  };
  return {
    gl_shader(fragment: number, ptr: number, len: number) {
      const shader = gl.createShader(fragment ? gl.FRAGMENT_SHADER : gl.VERTEX_SHADER)!;
      gl.shaderSource(shader, text(ptr, len));
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(shader));
      return add(shader);
    },
    gl_program(vertex: number, fragment: number) {
      const program = gl.createProgram();
      gl.attachShader(program, objects[vertex] as WebGLShader);
      gl.attachShader(program, objects[fragment] as WebGLShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(program));
      return add(program);
    },
    gl_buffer: () => add(gl.createBuffer()),
    gl_frame(width: number, height: number) {
      gl.viewport(0, 0, width, height);
      gl.enable(gl.DEPTH_TEST);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    },
    gl_uniform: (program: number, ptr: number, len: number, x: number, y: number, z: number, w: number) => gl.uniform4f(uniform(program, ptr, len), x, y, z, w),
    gl_matrix: (program: number, ptr: number, len: number, m: number) => gl.uniformMatrix4fv(uniform(program, ptr, len), false, new Float32Array(memory().buffer, m, 16)),
    gl_upload(buffer: number, ptr: number, floats: number) {
      gl.bindBuffer(gl.ARRAY_BUFFER, objects[buffer] as WebGLBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(memory().buffer, ptr, floats), gl.DYNAMIC_DRAW);
    },
    gl_draw(program: number, buffer: number, floats: number) {
      gl.useProgram(objects[program] as WebGLProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, objects[buffer] as WebGLBuffer);
      // Position, normal, colour, place on the face and kind: three numbers each.
      for (let i = 0; i < 4; i++) {
        gl.enableVertexAttribArray(i);
        gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 48, i * 12);
      }
      gl.drawArrays(gl.TRIANGLES, 0, floats / 12);
    },
  };
}

/** Writes the cube's stickers where the world reads them: each one's cubie, normal and colour. */
function writeStickers(world: Exports, state: SmartCubeSnapshot["state"]) {
  const out = new Float32Array(world.memory.buffer, world.stickers(), 54 * 7);
  SLOTS.forEach(({ p, n }, i) => out.set([...p, ...n, HELD_HEX[faceOfSlot(state[i]!)]], i * 7));
}

export function CubeWorld() {
  const canvas = useRef<HTMLCanvasElement>(null),
    world = useRef<Exports>(undefined),
    [intro, setIntro] = useState(true),
    reduced = useReducedMotion(),
    moving = useRef(false);
  moving.current = !intro;

  useEffect(() => {
    const id = setTimeout(() => setIntro(false), reduced ? 600 : INTRO_MS);
    return () => clearTimeout(id);
  }, [reduced]);

  // Made and drawn under the burst, the world moves once it is gone: the cube falls into it.
  useEffect(() => {
    let frame = 0, stopped = false, last = performance.now(), w: Exports;
    const gl = canvas.current!.getContext("webgl2", { antialias: true, powerPreference: "high-performance" })!;
    void fetch(CUBIX_CUBEWORLD)
      .then((response) => response.arrayBuffer())
      .then((bytes) => WebAssembly.instantiate(bytes, { gl: shim(gl, () => w.memory) }))
      .then(({ instance }) => {
        if (stopped) return;
        w = world.current = instance.exports as unknown as Exports;
        let size = "", count = -1, orientation: SmartCubeSnapshot["orientation"];
        const draw = (now: number) => {
          frame = requestAnimationFrame(draw);
          const el = canvas.current!, scale = Math.min(devicePixelRatio, 2),
            [width, height] = [Math.round(el.clientWidth * scale), Math.round(el.clientHeight * scale)];
          if (`${width}x${height}` !== size) {
            size = `${width}x${height}`;
            [el.width, el.height] = [width, height];
            w.resize(width, height);
          }
          const snap = smartCube.snapshot;
          if (snap.count !== count) {
            writeStickers(w, snap.state);
            const move = snap.turn?.move;
            if (count >= 0 && move?.layers.length === 1) w.turn(move.axis, move.layers[0]!, (move.q === 3 ? -1 : move.q) * (Math.PI / 2));
            count = snap.count;
          }
          if (snap.orientation && snap.orientation !== orientation) w.hold(...(orientation = snap.orientation));
          w.frame(moving.current ? (now - last) / 1000 : 0);
          last = now;
        };
        frame = requestAnimationFrame(draw);
      });
    return () => (stopped = true, cancelAnimationFrame(frame));
  }, []);

  return (
    <div data-slot="cube-world" className="fixed inset-0 z-50 overflow-hidden bg-[#221e54]">
      <canvas
        ref={canvas}
        className="absolute inset-0 size-full cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
        onPointerMove={(event) => event.buttons && world.current?.orbit(event.movementX * DRAG, event.movementY * DRAG)}
      />
      <div className="absolute top-4 left-4">
        <Back action="menu:world" />
      </div>
      <AnimatePresence>{intro && <Burst reduced={!!reduced} />}</AnimatePresence>
    </div>
  );
}

/** The cube's colours flying out of the middle. */
const CONFETTI = Array.from({ length: 36 }, (_, i) => {
  const angle = (i / 36) * Math.PI * 2 + Math.sin(i * 7.3) * 0.3, reach = 38 + ((i * 37) % 25);
  return { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach, colour: Object.values(FACE_COLORS)[i % 6]!, turn: ((i * 97) % 720) - 360, delay: 0.35 + (i % 6) * 0.03 };
});

/** The burst: the accent fills the window from its middle, the cube bounces in, the words pop up letter by letter,
 * then it closes like an iris onto the world. */
function Burst({ reduced }: { reduced: boolean }) {
  const title = tr("Secret unlocked!");
  return (
    <motion.div
      className="absolute inset-0 grid place-items-center overflow-hidden"
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
