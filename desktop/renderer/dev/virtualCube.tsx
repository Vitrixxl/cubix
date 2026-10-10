/**
 * The virtual smart cube (/dev/cube, development only): a cube turned with the keyboard or the buttons, which reports
 * its turns to the app's tabs over the development server's relay, as a Bluetooth cube would (see protocol.ts).
 * It keeps its state across reloads, like a real cube between two sessions.
 */
import "../globals.css";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { expandAlg, FACES as HELD_FACES, invertToken, slotsFor, type Face } from "../../../src/shared/cube";
import { canonicalTurn, compose, isSolved, rotate, rotation, slerp, SmartCube, stateToFacelets, type Quaternion } from "../../../src/client/lib/smartCube";
import { Button } from "@/components/ui/button";
import { LiveCube } from "../LiveCube";
import { solveCfop } from "../../../src/client/lib/cfopSolver";
import type { CatalogCase } from "../../../src/client/lib/solveAnalysis";
import catalog from "../../assets/catalog.json";
import { CUBE_YAW } from "../../../src/shared/cubeScene";
import { socketUrl, VIRTUAL_CUBE_NAME, type AppMessage, type CubeMessage, type RelayMessage } from "./protocol";

const STORAGE = "cubix.dev.virtualCube";
const ORIENTATION = "cubix.dev.virtualCube.grip";
const SOLVED = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
const FACES = ["U", "D", "R", "L", "F", "B"] as const;
/**
 * Keys by position, as csTimer's virtual cube (Heise): the right hand turns R, U and F, the left hand L, D and B; the
 * outer keys turn the whole cube.
 */
const KEYS: Record<string, string> = {
  KeyI: "R", KeyK: "R'", KeyJ: "U", KeyF: "U'", KeyH: "F", KeyG: "F'",
  KeyD: "L", KeyE: "L'", KeyS: "D", KeyL: "D'", KeyW: "B", KeyO: "B'",
  KeyT: "x", KeyB: "x'", Semicolon: "y", KeyA: "y'", KeyP: "z", KeyQ: "z'",
};
const TURN = /^[UDFBRL](2|'|2')?$/;
const ROTATION = /^[xyz](2|'|2')?$/;

/** Held square in front of the player, yellow on top and green facing them, as a gyroscope's reference. */
const HOME: Quaternion = [1, 0, 0, 0];
/** The player's right, top and front: R turns the face nearest the right. */
const GRIP: Record<Face, number[]> = { R: [1, 0, 0], L: [-1, 0, 0], U: [0, 1, 0], D: [0, -1, 0], F: [0, 0, 1], B: [0, 0, -1] };
/** The screen's horizontal axis in the player's axes: the cube is drawn an eighth to the side (see LiveCube). */
const ACROSS = rotate(rotation([0, 1, 0], CUBE_YAW), [1, 0, 0]);
const NORMALS = HELD_FACES.map((face, i) => [face, slotsFor(3)[i * 9]!.n] as const);

const cube = new SmartCube();
cube.receive({ type: "facelets", facelets: localStorage.getItem(STORAGE) ?? SOLVED });
let orientation: Quaternion = JSON.parse(localStorage.getItem(ORIENTATION) ?? "null") ?? HOME;
cube.receive({ type: "orientation", quaternion: orientation });
let socket: WebSocket | undefined;
const send = (message: CubeMessage) => {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
};
const sendState = () => {
  send({ type: "facelets", facelets: stateToFacelets(cube.snapshot.state), name: VIRTUAL_CUBE_NAME, battery: 100 });
  send({ type: "orientation", quaternion: orientation });
};
/** Where the cube is held, or is being turned to: turns are named from it while a rotation is under way. */
let grip = orientation,
  spinning = 0;
/** How long a rotation of the whole cube (x, y, z) takes in hand. */
const ROTATION_MS = 160;
/** The cube held as `next` at once, as when dragged. */
function hold(next: Quaternion) {
  cancelAnimationFrame(spinning);
  grip = next;
  report(next);
}
/** The cube turned to `next` in hand: its gyroscope reports every step of the way. */
function rotateTo(next: Quaternion) {
  cancelAnimationFrame(spinning);
  const from = orientation,
    start = performance.now();
  grip = next;
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ROTATION_MS);
    report(slerp(from, next, t * t * (3 - 2 * t)));
    if (t < 1) spinning = requestAnimationFrame(step);
  };
  spinning = requestAnimationFrame(step);
}
/** How the cube is held, as its gyroscope would report it. */
function report(next: Quaternion) {
  orientation = next;
  localStorage.setItem(ORIENTATION, JSON.stringify(next));
  cube.receive({ type: "orientation", quaternion: next });
  send({ type: "orientation", quaternion: next });
}
cube.subscribe(() => localStorage.setItem(STORAGE, stateToFacelets(cube.snapshot.state)));

/** Turns the cube: `move` as the cube names it, white on top. */
const history: string[] = [];
function turn(move: string) {
  const at = Date.now();
  history.push(move);
  cube.receive({ type: "move", move, at });
  send({ type: "move", move, at });
}
/** The cube's face (held frame) nearest the player's `side`, however the cube is held. */
const faceAt = (side: Face) => {
  const dot = (n: readonly number[]) => rotate(grip, n).reduce((sum, v, i) => sum + v * GRIP[side][i]!, 0);
  return NORMALS.reduce((best, entry) => (dot(entry[1]) > dot(best[1]) ? entry : best))[0];
};
/** A turn as the player sees the cube: R turns the face on the right; x, y and z turn the whole cube. */
function turnSeen(move: string) {
  const letter = move[0]!;
  if ("xyz".includes(letter)) {
    const side: Face = letter === "x" ? "R" : letter === "y" ? "U" : "F",
      quarters = move.endsWith("2") ? 2 : move.endsWith("'") ? -1 : 1;
    return rotateTo(compose(rotation(GRIP[side], (-quarters * Math.PI) / 2), grip));
  }
  turn(canonicalTurn(faceAt(letter as Face) + move.slice(1)));
}

let playing = 0;
/**
 * Plays a sequence, `seen` (yellow on top) or as a scramble is written (white on top), at `tps` turns a second;
 * false when something else stopped it.
 */
async function play(text: string, seen: boolean, tps: number) {
  const moves = expandAlg(text).split(/\s+/).filter(Boolean);
  const wrong = moves.find((move) => !TURN.test(move) && !(seen && ROTATION.test(move)));
  if (wrong) throw new Error(`"${wrong}" is not supported: face turns (U, D, R, L, F, B)${seen ? " and rotations (x, y, z)" : ""} only.`);
  const run = ++playing;
  for (const move of moves) {
    if (run !== playing) return false;
    seen ? turnSeen(move) : turn(move);
    await new Promise((resolve) => setTimeout(resolve, 1000 / tps));
  }
  return run === playing;
}

/**
 * Solves the cube as a CFOP solver would (see cfopSolver.ts), from where it stands: picked up yellow on top, green
 * in front, each step after a pause to recognise it.
 */
async function solveWithCfop(tps: number, twoLook: boolean) {
  rotateTo(HOME);
  const steps = solveCfop(cube.snapshot.state, catalog.cases as CatalogCase[], { twoLook });
  if (!steps) throw new Error("No CFOP solution found from this state.");
  for (const step of steps) {
    const run = ++playing;
    await new Promise((resolve) => setTimeout(resolve, 350 + Math.random() * 600));
    if (run !== playing || !(await play(step.alg, true, tps))) return;
  }
}

function useRelay() {
  const [relay, setRelay] = useState<{ online: boolean; apps: number }>({ online: false, apps: 0 });
  useEffect(() => {
    let closed = false, retry = 0;
    const open = () => {
      const ws = (socket = new WebSocket(socketUrl("cube")));
      ws.onopen = () => {
        setRelay({ online: true, apps: 0 });
        sendState();
      };
      ws.onmessage = ({ data }) => {
        const message = JSON.parse(String(data)) as AppMessage | RelayMessage;
        if (message.type === "hello") sendState();
        else if (message.type === "apps") setRelay({ online: true, apps: message.count });
      };
      // The development server restarts: try again until it is back.
      ws.onclose = () => {
        setRelay({ online: false, apps: 0 });
        if (!closed) retry = window.setTimeout(open, 1000);
      };
    };
    open();
    return () => {
      closed = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, []);
  return relay;
}

/** The key labels of the user's layout (AZERTY and others), where the browser tells them. */
function useKeyLabels() {
  const [labels, setLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    (navigator as any).keyboard?.getLayoutMap?.().then((map: Map<string, string>) =>
      setLabels(Object.fromEntries(Object.keys(KEYS).flatMap((code) => (map.get(code) ? [[code, map.get(code)!.toUpperCase()]] : [])))),
    ).catch(() => {});
  }, []);
  return (code: string) => labels[code] ?? (code === "Semicolon" ? ";" : code.slice(3));
}

function App() {
  const relay = useRelay(),
    label = useKeyLabels(),
    snapshot = useSyncExternalStore(cube.subscribe, () => cube.snapshot),
    [text, setText] = useState(""),
    [tps, setTps] = useState(6),
    [twoLook, setTwoLook] = useState(false),
    [error, setError] = useState(""),
    [size, setSize] = useState(() => Math.min(innerHeight * 0.62, innerWidth * 0.45, 460)),
    input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const resize = () => setSize(Math.min(innerHeight * 0.62, innerWidth * 0.45, 460));
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("textarea, input") || e.altKey || e.metaKey) return;
      if (e.ctrlKey && e.code === "KeyZ") {
        e.preventDefault();
        undo();
      } else if (!e.ctrlKey && KEYS[e.code]) {
        e.preventDefault();
        turnSeen(KEYS[e.code]!);
      }
    };
    addEventListener("resize", resize);
    addEventListener("keydown", key);
    return () => {
      removeEventListener("resize", resize);
      removeEventListener("keydown", key);
    };
  }, []);
  const undo = () => {
    const last = history.pop();
    if (last) {
      turn(invertToken(last));
      history.pop();
    }
  };
  const reset = () => {
    playing++;
    history.length = 0;
    cube.receive({ type: "facelets", facelets: SOLVED });
    sendState();
  };
  const start = (seen: boolean) => {
    setError("");
    play(text, seen, seen ? tps : 20).catch((e: Error) => setError(e.message));
  };
  const solve = () => {
    setError("");
    solveWithCfop(tps, twoLook).catch((e: Error) => setError(e.message));
  };
  const recent = cube.moves.slice(-24);
  return (
    <main className="flex h-dvh flex-col gap-6 overflow-hidden bg-background p-6 text-foreground">
      <header className="flex items-center gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Virtual smart cube</h1>
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">dev</span>
        <span className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <span className={`size-2 rounded-full ${relay.online ? (relay.apps ? "bg-emerald-500" : "bg-amber-500") : "bg-red-500"}`} />
          {!relay.online ? "Development server unreachable, retrying…" : relay.apps ? `${relay.apps} app tab${relay.apps > 1 ? "s" : ""} listening` : "No app tab listening"}
        </span>
      </header>
      <div className="flex min-h-0 flex-1 gap-10">
        <section className="flex min-w-0 flex-1 flex-col items-center justify-center gap-4">
          <LiveCube cube={cube} size={size} onDrag={(across, down) => hold(compose(rotation(ACROSS, down), compose(rotation([0, 1, 0], across), grip)))} />
          <span className={`text-sm ${isSolved(snapshot.state) ? "text-emerald-500" : "text-muted-foreground"}`}>
            {isSolved(snapshot.state) ? "Solved" : `${cube.moves.length} turns since the last reset`}
          </span>
        </section>
        <aside className="flex w-[380px] shrink-0 flex-col gap-5 overflow-hidden">
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Turns <span className="font-normal text-muted-foreground">· as you hold it: drag the cube to turn it in your hands</span></h2>
            <div className="grid grid-cols-9 gap-1">
              {[...FACES, "x", "y", "z"].map((face) =>
                ["", "'", "2"].map((suffix) => (
                  <Button key={face + suffix} variant="outline" size="sm" className="font-mono" onClick={() => turnSeen(face + suffix)}>
                    {face + suffix}
                  </Button>
                )),
              )}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Keyboard:{" "}
              {Object.entries(KEYS).map(([code, move]) => (
                <span key={code} className="mr-2 inline-block font-mono">
                  <kbd className="rounded border px-1">{label(code)}</kbd> {move}
                </span>
              ))}
              <span className="inline-block font-mono"><kbd className="rounded border px-1">Ctrl+Z</kbd> undo</span>
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Sequence</h2>
            <textarea
              ref={input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              spellCheck={false}
              placeholder="Paste the app's scramble, or an algorithm"
              className="resize-none rounded-md border bg-transparent p-2 font-mono text-sm outline-none focus:border-ring"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => start(false)} disabled={!text.trim()}>Scramble</Button>
              <Button size="sm" variant="secondary" onClick={() => start(true)} disabled={!text.trim()}>Play as seen</Button>
              <Button size="sm" variant="secondary" onClick={solve} disabled={isSolved(snapshot.state)}>Solve with CFOP</Button>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={twoLook} onChange={(e) => setTwoLook(e.target.checked)} />
                2-look
              </label>
              <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                <input type="range" min={1} max={15} value={tps} onChange={(e) => setTps(Number(e.target.value))} />
                {tps} TPS
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Scramble applies it as written in the app (white on top, green in front, whatever the cube's orientation); Play as seen turns the faces you see.
            </p>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={undo} disabled={!history.length}>Undo</Button>
            <Button size="sm" variant="outline" onClick={reset}>Reset to solved</Button>
            <Button size="sm" variant="outline" onClick={() => rotateTo(HOME)}>Reset orientation</Button>
          </div>
          <div className="flex min-h-0 flex-col gap-2">
            <h2 className="text-sm font-medium">Reported to the app <span className="font-normal text-muted-foreground">· white on top</span></h2>
            <p className="font-mono text-sm leading-relaxed break-words text-muted-foreground">
              {recent.length ? recent.map((m) => m.move).join(" ") : "Nothing yet"}
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
