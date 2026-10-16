/**
 * Smart cubes: one model for every connected cube, whatever its brand and its link (Bluetooth, or the virtual cube of
 * development, see desktop/renderer/dev). A driver connects to a cube and reports its turns; `SmartCube` follows the
 * cube's state from them, for the pages to show and, later, to time and analyse solves.
 *
 * However it is held, a smart cube names its turns after its centres in the WCA scramble orientation, white on top and
 * green in front, as scrambles are written ("canonical" turns, and Kociemba facelets for whole states); one with a
 * gyroscope also reports how it is held (`Quaternion`).
 * Cubix shows a scramble turned over, yellow on top (see `parseScramble`): the state kept here is in that held frame,
 * so it compares with the timer's own scramble preview as it is.
 */
import { applyMove, FACES, faceOfSlot, heldMove, parseMove, slotsFor, solved, type CubeState, type Face, type Move } from "../../shared/cube";
import { cancelled, isCancel } from "./bluetooth/link";

/**
 * How a cube with a gyroscope is held: the rotation from its reference pose (yellow on top, green facing the player)
 * to where it is, in the player's axes (x to the right, y up, z toward the player), as a unit quaternion [w, x, y, z].
 */
export type Quaternion = readonly [number, number, number, number];

/** What a driver reports. `at` is when it happened, in milliseconds of `Date.now()`. */
export type SmartCubeEvent =
  | { type: "move"; move: string; at: number }
  | { type: "orientation"; quaternion: Quaternion }
  /** The whole state, on connection or when the cube resynchronises: 54 facelets, Kociemba order (URFDLB). */
  | { type: "facelets"; facelets: string }
  | { type: "battery"; level: number }
  /** Out of reach: the driver calls it again, then says whether it came back. */
  | { type: "reconnecting" }
  | { type: "reconnected" }
  | { type: "disconnected"; reason?: string };

export interface SmartCubeConnection {
  name: string;
  disconnect(): void;
}

export interface SmartCubeDriver {
  label: string;
  /** Resolves once a cube answers; `listen` hears every event until the connection ends. */
  connect(listen: (event: SmartCubeEvent) => void, signal: AbortSignal): Promise<SmartCubeConnection>;
}

/** A turn of a cube's outer face, as a driver may report it. */
const TURN = /^[UDFBRL](2|'|2')?$/;
/** Kociemba's face order, against Cubix's U, D, F, B, R, L (both read each face row by row, as seen from outside). */
const KOCIEMBA: readonly Face[] = ["U", "R", "F", "D", "L", "B"];
/** Held on its head (z2), the cube's faces trade places: white goes under, red to the left. */
const TURNED: Record<Face, Face> = { U: "D", D: "U", R: "L", L: "R", F: "F", B: "B" };

/** Where each slot of the canonical cube lies once the cube is turned over: z2 sends (x, y, z) to (-x, -y, z). */
const turnedSlot = (() => {
  const slots = slotsFor(3),
    key = (p: readonly number[], n: readonly number[]) => `${p.join(",")}|${n.join(",")}`,
    index = new Map(slots.map((slot, i) => [key(slot.p, slot.n), i]));
  return slots.map(({ p, n }) => index.get(key([-p[0], -p[1], p[2]], [-n[0], -n[1], n[2]]))!);
})();

/** A turn as the cube reported it (white on top), as it turns the held cube (yellow on top). */
export const heldTurn = (move: string): Move => {
  const parsed = TURN.test(move) ? parseMove(move) : null;
  if (!parsed) throw new Error(`Not a smart cube turn: "${move}"`);
  return heldMove(parsed);
};

/** The same face turn, named as the cube would report it: a key pressed on the held cube turns the face it sees. */
export const canonicalTurn = (move: string): string => {
  if (!TURN.test(move)) throw new Error(`Not a face turn: "${move}"`);
  return TURNED[move[0] as Face] + move.slice(1);
};

/**
 * A held state with the colours of these facelets. Facelets carry colours only, not which piece is which: stickers
 * of one colour are numbered in turn, which draws and turns the same.
 */
export function faceletsToState(facelets: string): CubeState {
  if (!/^[URFDLB]{54}$/.test(facelets)) throw new Error("Facelets must be 54 letters of URFDLB");
  const counts = Object.fromEntries(FACES.map((face) => [face, 0])) as Record<Face, number>,
    state = new Uint16Array(54);
  KOCIEMBA.forEach((face, k) => {
    for (let i = 0; i < 9; i++) {
      const colour = TURNED[facelets[k * 9 + i] as Face],
        n = counts[colour]++;
      if (n >= 9) throw new Error(`More than nine ${facelets[k * 9 + i]} facelets`);
      state[turnedSlot[FACES.indexOf(face) * 9 + i]!] = FACES.indexOf(colour) * 9 + n;
    }
  });
  return state;
}

/** The Kociemba facelets of a held state, as the cube itself would report them. */
export function stateToFacelets(state: CubeState): string {
  return KOCIEMBA.flatMap((face) =>
    Array.from({ length: 9 }, (_, i) => TURNED[faceOfSlot(state[turnedSlot[FACES.indexOf(face) * 9 + i]!]!)]),
  ).join("");
}

/** The rotation of `angle` radians about the unit `axis`. */
export const rotation = (axis: readonly number[], angle: number): Quaternion => {
  const s = Math.sin(angle / 2);
  return [Math.cos(angle / 2), axis[0]! * s, axis[1]! * s, axis[2]! * s];
};
/** `a` after `b`. */
export const compose = ([aw, ax, ay, az]: Quaternion, [bw, bx, by, bz]: Quaternion): Quaternion => {
  const q = [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
  const n = Math.hypot(...q);
  return q.map((v) => v / n) as unknown as Quaternion;
};
/** The rotation `t` of the way from `a` to `b` (0 to 1), the short way round. */
export const slerp = (a: Quaternion, b: Quaternion, t: number): Quaternion => {
  let dot = a.reduce((sum, v, i) => sum + v * b[i]!, 0);
  const sign = dot < 0 ? -1 : 1;
  dot *= sign;
  const theta = Math.acos(Math.min(1, dot)),
    sin = Math.sin(theta),
    [wa, wb] = sin < 1e-6 ? [1 - t, t] : [Math.sin((1 - t) * theta) / sin, Math.sin(t * theta) / sin];
  const q = a.map((v, i) => v * wa + sign * b[i]! * wb),
    n = Math.hypot(...q);
  return q.map((v) => v / n) as unknown as Quaternion;
};
/** `v` rotated by `q`. */
export const rotate = ([w, x, y, z]: Quaternion, v: readonly number[]): number[] => {
  const [vx, vy, vz] = v as [number, number, number],
    // t = 2 (q.xyz × v); v + w t + q.xyz × t
    tx = 2 * (y * vz - z * vy),
    ty = 2 * (z * vx - x * vz),
    tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
};

/** Whether every face shows a single colour. */
export const isSolved = (state: CubeState) =>
  FACES.every((_, f) => Array.from({ length: 9 }, (_, i) => faceOfSlot(state[f * 9 + i]!)).every((face, _, all) => face === all[0]));

/**
 * The penalty of a solve stopped on this state (WCA 10e): none when solved, +2 when one face turn away from solved,
 * DNF otherwise.
 */
export function stopPenalty(state: CubeState): "none" | "+2" | "dnf" {
  if (isSolved(state)) return "none";
  const oneTurn = FACES.some((face) => ["", "2", "'"].some((suffix) => isSolved(applyMove(state, parseMove(face + suffix)!))));
  return oneTurn ? "+2" : "dnf";
}

export type SmartCubeStatus = "off" | "connecting" | "on";
export interface SmartCubeSnapshot {
  status: SmartCubeStatus;
  name: string;
  battery?: number;
  /** The cube as it stands, held yellow on top. */
  state: CubeState;
  /** The last turn and the state it started from, for drawing it; `count` numbers it. */
  turn?: { move: Move; before: CubeState; at: number };
  /** How the cube is held, when it has a gyroscope. */
  orientation?: Quaternion;
  count: number;
  error?: string;
  /** A Bluetooth cube whose MAC address the browser cannot read waits for the player to type it (`answerMac`). */
  macRequest?: { name: string; guess?: string; wrong: boolean };
}

const MACS = "cubix.cubeMacs";
const storedMacs = (): Record<string, string> => {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(MACS) ?? "{}") ?? {};
  } catch {
    return {};
  }
};

/** The connected cube: its status and its state, followed turn by turn. */
export class SmartCube {
  snapshot: SmartCubeSnapshot = { status: "off", name: "", state: solved(3), count: 0 };
  /** Every turn since the cube connected or was last resynchronised, as reported. */
  moves: { move: string; at: number }[] = [];
  private listeners = new Set<() => void>();
  private connection?: SmartCubeConnection;
  private abort?: AbortController;
  private macAnswer?: (mac: string | null) => void;
  /** The MAC address the player typed, kept once the cube answers to it. */
  private typedMac?: Record<string, string>;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  private set(patch: Partial<SmartCubeSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  async connect(driver: SmartCubeDriver) {
    this.disconnect();
    const abort = (this.abort = new AbortController());
    this.set({ status: "connecting", name: driver.label, error: undefined, battery: undefined, orientation: undefined });
    try {
      const connection = await driver.connect((event) => {
        if (this.abort === abort) this.receive(event);
      }, abort.signal);
      if (this.abort !== abort) return connection.disconnect();
      this.connection = connection;
      if (this.typedMac)
        try {
          globalThis.localStorage?.setItem(MACS, JSON.stringify({ ...storedMacs(), ...this.typedMac }));
        } catch {
          // Not kept: asked again next time.
        }
      this.set({ status: "on", name: connection.name });
    } catch (error) {
      if (this.abort !== abort) return;
      this.abort = undefined;
      // A chooser closed or a question left unanswered is no error.
      this.set({ status: "off", macRequest: undefined, error: isCancel(error) ? undefined : ((error as Error)?.message ?? String(error)) });
    }
  }

  /**
   * A cube's MAC address, for the drivers (bluetooth/cubes.ts): the one that worked last time on this device unless
   * it was `wrong`, else the player's answer (the dialog of devices shows the question). Rejects when the player
   * gives up.
   */
  askMac = (name: string, guess: string | undefined, wrong: boolean): Promise<string> => {
    const known = storedMacs()[name];
    if (known && !wrong) return Promise.resolve(known);
    this.macAnswer?.(null);
    return new Promise((resolve, reject) => {
      this.macAnswer = (mac) => {
        this.macAnswer = undefined;
        this.set({ macRequest: undefined });
        if (mac === null) return reject(cancelled());
        this.typedMac = { [name]: mac };
        resolve(mac);
      };
      // After a wrong one, the address typed stays in the field, to be corrected.
      this.set({ macRequest: { name, guess: this.typedMac?.[name] ?? known ?? guess, wrong } });
    });
  };
  /** The player's answer to `macRequest`; null gives up. */
  answerMac = (mac: string | null) => this.macAnswer?.(mac);

  disconnect() {
    this.macAnswer?.(null);
    this.typedMac = undefined;
    this.abort?.abort();
    this.abort = undefined;
    this.connection?.disconnect();
    this.connection = undefined;
    if (this.snapshot.status !== "off") this.set({ status: "off" });
  }

  /** Applies what a driver reports; exposed for drivers' tests. */
  receive(event: SmartCubeEvent) {
    switch (event.type) {
      case "move": {
        const move = heldTurn(event.move),
          before = this.snapshot.state;
        this.moves.push({ move: event.move, at: event.at });
        this.set({ state: applyMove(before, move), turn: { move, before, at: event.at }, count: this.snapshot.count + 1 });
        break;
      }
      case "facelets":
        // The state the cube already shows, sent again to check: nothing changes.
        if (event.facelets === stateToFacelets(this.snapshot.state)) break;
        this.moves = [];
        this.set({ state: faceletsToState(event.facelets), turn: undefined, count: this.snapshot.count + 1 });
        break;
      case "orientation":
        this.set({ orientation: event.quaternion });
        break;
      case "battery":
        this.set({ battery: event.level });
        break;
      case "reconnecting":
        this.set({ status: "connecting" });
        break;
      case "reconnected":
        this.set({ status: "on", error: undefined });
        break;
      case "disconnected":
        this.abort = undefined;
        this.connection = undefined;
        this.set({ status: "off", error: event.reason });
        break;
    }
  }
}

/** The app's one connected cube. */
export const smartCube = new SmartCube();
