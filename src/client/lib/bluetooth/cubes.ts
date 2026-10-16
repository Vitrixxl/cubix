/**
 * Bluetooth smart cubes: GAN (Gen2, Gen3 and Gen4 protocols, and the MoYu AI 2023 that speaks Gen2), MoYu WeiLong AI
 * (MoYu32: WCU_MY32, WCU_MY33), QiYi (QY-QYSC, XMD Tornado V4 i), Giiker and Xiaomi, GoCube and Rubik's Connected.
 * Each protocol turns the cube's notifications into `SmartCubeEvent`s: whole states (Kociemba facelets, as the
 * cube is held white on top and green in front), turns, battery, and how a GAN cube with a gyroscope is held.
 *
 * Written from the protocols as their open implementations document them, no code copied:
 * - gan-web-bluetooth by Andy Fedotov (MIT): GAN Gen2/3/4 messages, keys, MAC salting, move history;
 * - smartcube-web-bluetooth by Pau Oliva (MIT): MoYu32, QiYi, Giiker and GoCube, and the captures of real cubes the
 *   tests replay (tests/fixtures/smartcubes.json);
 * - Flying-Toast's QiYi protocol notes (MIT): framing, CRC, acknowledgements;
 * - csTimer's hardware drivers (GPL-3.0, read for protocol facts only): UUIDs, keys, MAC from the device name.
 */
import { aes128 } from "./aes";
import { cancelled, macOf, parseMac, uuid, UNSUPPORTED_DEVICE, type BleAdapter, type BleLink } from "./link";
import type { Quaternion, SmartCubeDriver, SmartCubeEvent } from "../smartCube";

const SOLVED = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";

/** `length` bits from bit `start`, the first bit the highest. */
export const bits = (b: Uint8Array, start: number, length: number) => {
  let v = 0;
  for (let i = start; i < start + length; i++) v = v * 2 + ((b[i >> 3]! >> (7 - (i & 7))) & 1);
  return v;
};
/** The little-endian number of `n` bytes from byte `at`. */
const le = (b: Uint8Array, at: number, n: number) => {
  let v = 0;
  for (let i = n - 1; i >= 0; i--) v = v * 256 + b[at + i]!;
  return v;
};
const be32 = (b: Uint8Array, at: number) => ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;
const message = (length: number, head: readonly number[]) => {
  const m = new Uint8Array(length);
  m.set(head);
  return m;
};

// Kociemba's facelets of each corner (URF UFL ULB UBR DFR DLF DBL DRB) and edge (UR UF UL UB DR DF DL DB FR FL BL BR).
const CORNERS = [[8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11], [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51]];
const EDGES = [[5, 10], [7, 19], [3, 37], [1, 46], [32, 16], [28, 25], [30, 43], [34, 52], [23, 12], [21, 41], [50, 39], [48, 14]];

/**
 * The facelets of a cube given by its pieces: corner and edge permutations and orientations (the last of each worked
 * out from the others when `complete`). Null when they are not a cube: what a wrong key decrypts.
 */
export function piecesToFacelets(cp: number[], co: number[], ep: number[], eo: number[], complete = true, corners = CORNERS, edges = EDGES): string | null {
  if (complete) {
    cp.push(28 - cp.reduce((a, b) => a + b, 0));
    co.push((3 - (co.reduce((a, b) => a + b, 0) % 3)) % 3);
    ep.push(66 - ep.reduce((a, b) => a + b, 0));
    eo.push((2 - (eo.reduce((a, b) => a + b, 0) % 2)) % 2);
  }
  const perm = (p: number[], n: number) => p.length === n && new Set(p).size === n && p.every((v) => v >= 0 && v < n);
  if (!perm(cp, 8) || !perm(ep, 12) || co.some((v) => v > 2) || eo.some((v) => v > 1)) return null;
  const f = Array.from(SOLVED);
  for (let i = 0; i < 8; i++) for (let k = 0; k < 3; k++) f[corners[i]![(k + co[i]!) % 3]!] = SOLVED[corners[cp[i]!]![k]!]!;
  for (let i = 0; i < 12; i++) for (let k = 0; k < 2; k++) f[edges[i]![(k + eo[i]!) % 2]!] = SOLVED[edges[ep[i]!]![k]!]!;
  return f.join("");
}

/**
 * The cipher of GAN Gen2 to Gen4 and MoYu32 cubes: AES-128 with the cube's MAC address added to the first six bytes
 * of the key and of the IV (mod 255); a message's first 16 bytes are one CBC block, its last 16 another.
 */
export function macCipher(key: readonly number[], iv: readonly number[], mac: readonly number[]) {
  const k = key.map((v, i) => (i < 6 ? (v + mac[5 - i]!) % 255 : v)),
    v = iv.map((x, i) => (i < 6 ? (x + mac[5 - i]!) % 255 : x)),
    aes = aes128(k);
  const block = (data: Uint8Array, at: number, encrypt: boolean) => {
    if (encrypt) {
      for (let i = 0; i < 16; i++) data[at + i]! ^= v[i]!;
      aes.encrypt(data, at);
    } else {
      aes.decrypt(data, at);
      for (let i = 0; i < 16; i++) data[at + i]! ^= v[i]!;
    }
  };
  return {
    encrypt(input: Uint8Array) {
      const data = input.slice();
      block(data, 0, true);
      if (data.length > 16) block(data, data.length - 16, true);
      return data;
    },
    decrypt(input: Uint8Array) {
      const data = input.slice();
      if (data.length > 16) block(data, data.length - 16, false);
      block(data, 0, false);
      return data;
    },
  };
}
type Cipher = ReturnType<typeof macCipher>;

export const GAN_KEY = [0x01, 0x02, 0x42, 0x28, 0x31, 0x91, 0x16, 0x07, 0x20, 0x05, 0x18, 0x54, 0x42, 0x11, 0x12, 0x53],
  GAN_IV = [0x11, 0x03, 0x32, 0x28, 0x21, 0x01, 0x76, 0x27, 0x20, 0x95, 0x78, 0x14, 0x32, 0x12, 0x02, 0x43],
  /** MoYu AI 2023 ("AiCube…"): the Gen2 protocol with a key of its own. */
  AICUBE_KEY = [0x05, 0x12, 0x02, 0x45, 0x02, 0x01, 0x29, 0x56, 0x12, 0x78, 0x12, 0x76, 0x81, 0x01, 0x08, 0x03],
  AICUBE_IV = [0x01, 0x44, 0x28, 0x06, 0x86, 0x21, 0x22, 0x28, 0x51, 0x05, 0x08, 0x31, 0x82, 0x02, 0x21, 0x06],
  MOYU32_KEY = [21, 119, 58, 92, 103, 14, 45, 31, 23, 103, 42, 19, 155, 103, 82, 87],
  MOYU32_IV = [17, 35, 38, 37, 134, 42, 44, 59, 85, 6, 127, 49, 126, 103, 33, 87],
  QIYI_KEY = [87, 177, 249, 171, 205, 90, 232, 167, 156, 185, 140, 231, 87, 140, 81, 8];

/**
 * The time of a turn on the cube's own clock, set on the device's (`Date.now()`): turns keep the intervals the cube
 * measured, without the radio's delays. Set again when the two drift two seconds apart.
 */
class CubeClock {
  private offset?: number;
  at(cube: number, local: number) {
    let at = cube + (this.offset ??= local - cube);
    if (Math.abs(at - local) > 2000) at = cube + (this.offset = local - cube);
    return Math.min(at, local);
  }
}

/** A protocol's link: the characteristics it hears (and writes, by index). */
interface Channel {
  service: string;
  notify: string;
  write?: string;
}
export interface CubeDecoder {
  /** Messages to send once listening (by channel): what asks the state and the battery. */
  hello(): [number, Uint8Array][];
  /** Asked once a minute: the battery. */
  poll?(): [number, Uint8Array][];
  /** Channels whose value is read once listening (Giiker sends its state that way). */
  reads?: number[];
  receive(channel: number, data: Uint8Array, at: number): SmartCubeEvent[];
}
type Send = (channel: number, data: Uint8Array) => void;
export interface CubeProtocol {
  id: string;
  names: string[];
  channels: Channel[];
  /** The company ids under which it advertises its MAC address, and how to read it there. */
  companies?: number[];
  macFrom?: (data: Map<number, Uint8Array>) => string | undefined;
  /** MAC addresses its name hints at, to try in turn when the browser cannot read it. */
  guesses?: (name: string) => string[];
  /** Whether its messages are encrypted with its MAC address. */
  needsMac: boolean;
  decoder(name: string, mac: number[] | null, send: Send): CubeDecoder;
}

// ——— GAN ———

const GAN_COMPANIES = Array.from({ length: 256 }, (_, i) => (i << 8) | 0x01);
/** GAN: the MAC address ends its manufacturer data's first nine bytes, backwards. */
const ganMac = (data: Map<number, Uint8Array>) => {
  for (const id of GAN_COMPANIES) {
    const d = data.get(id);
    if (d && d.length >= 9) return macOf(Array.from(d.subarray(3, 9)).reverse());
  }
};
/** A move face as GAN numbers it (0 U, 1 R, 2 F, 3 D, 4 L, 5 B) and its direction (0 clockwise). */
const turn = (face: number, prime: number) => "URFDLB"[face]! + (prime ? "'" : "");
/** The pieces' fields of a GAN state message, from bit `at`; Gen3 and Gen4 leave a `gap` of 2 bits before the edges. */
const ganState = (m: Uint8Array, at: number, gap = 0) => {
  const cp: number[] = [], co: number[] = [], ep: number[] = [], eo: number[] = [];
  for (let i = 0; i < 7; i++) cp.push(bits(m, at + i * 3, 3)), co.push(bits(m, at + 21 + i * 2, 2));
  for (let i = 0; i < 11; i++) ep.push(bits(m, at + gap + 35 + i * 4, 4)), eo.push(bits(m, at + gap + 79 + i, 1));
  return piecesToFacelets(cp, co, ep, eo);
};

/**
 * How a GAN cube with a gyroscope is held. GAN gives the rotation of its own axes (+X red, +Y blue, +Z white) in
 * its sensor's frame; the cube is taken as held in the app's reference pose when the first one comes (yellow on
 * top, green facing the player), and later ones are told from it, in the player's axes (x right, y up, z toward
 * the player).
 */
export class GanGyro {
  private basis?: Quaternion;
  orientation(x: number, y: number, z: number, w: number): Quaternion {
    // GAN's axes as the app's white on top, green in front (red +x, white +y, green +z), then turned over (z2).
    const q: Quaternion = [w, x, z, -y];
    const inverse = (p: Quaternion): Quaternion => [p[0], -p[1], -p[2], -p[3]];
    const mul = ([aw, ax, ay, az]: Quaternion, [bw, bx, by, bz]: Quaternion): Quaternion => [
      aw * bw - ax * bx - ay * by - az * bz,
      aw * bx + ax * bw + ay * bz - az * by,
      aw * by - ax * bz + ay * bw + az * bx,
      aw * bz + ax * by - ay * bx + az * bw,
    ];
    this.basis ??= inverse(q);
    const z2: Quaternion = [0, 0, 0, 1],
      r = mul(mul(z2, mul(this.basis, q)), inverse(z2)),
      n = Math.hypot(...r) || 1;
    return r.map((v) => v / n) as unknown as Quaternion;
  }
}
const signed15 = (v: number) => ((1 - (v >> 15) * 2) * (v & 0x7fff)) / 0x7fff;

/** GAN Gen2 (GAN 356 i Carry, i3, 12 ui, Mini ui, Monster Go AI; MoYu AI 2023). */
export function ganGen2(cipher: Cipher): CubeDecoder {
  let serial = -1,
    cube = 0,
    lastAt = 0;
  const clock = new CubeClock(),
    gyro = new GanGyro(),
    command = (head: number[]): [number, Uint8Array][] => [[0, cipher.encrypt(message(20, head))]];
  return {
    hello: () => [...command([0x05]), ...command([0x04]), ...command([0x09])],
    poll: () => command([0x09]),
    receive(_, data, at) {
      if (data.length < 16) return [];
      const m = cipher.decrypt(data),
        type = bits(m, 0, 4);
      if (type === 0x01) return [{ type: "orientation", quaternion: gyro.orientation(signed15(bits(m, 20, 16)), signed15(bits(m, 36, 16)), signed15(bits(m, 52, 16)), signed15(bits(m, 4, 16))) }];
      if (type === 0x02 && serial >= 0) {
        // The last seven turns, newest first, each with the milliseconds since the one before it.
        const now = bits(m, 4, 8),
          n = Math.min((now - serial) & 0xff, 7),
          events: SmartCubeEvent[] = [];
        serial = now;
        for (let i = n - 1; i >= 0; i--) {
          cube += bits(m, 47 + 16 * i, 16) || at - lastAt;
          events.push({ type: "move", move: turn(bits(m, 12 + 5 * i, 4), bits(m, 16 + 5 * i, 1)), at: clock.at(cube, at) });
        }
        if (n) lastAt = at;
        return events;
      }
      if (type === 0x04) {
        if (serial < 0) serial = bits(m, 4, 8);
        const facelets = ganState(m, 12);
        return facelets ? [{ type: "facelets", facelets }] : [];
      }
      if (type === 0x09) return [{ type: "battery", level: Math.min(bits(m, 8, 8), 100) }];
      return [];
    },
  };
}

/**
 * GAN Gen3 and Gen4: one turn a message, numbered; a turn missed by the radio is asked again from the cube's history
 * before the turns after it are told. `gen` 3: GAN 356 i Carry 2; 4: GAN 12 ui Maglev, 14 Maglev ui, i4.
 */
export function ganGen34(gen: 3 | 4, cipher: Cipher, send: (data: Uint8Array) => void): CubeDecoder {
  // Where each field lies: Gen3 messages start with 0x55 and their type, Gen4 with their type.
  const o = gen === 3 ? 8 : 0,
    size = gen === 3 ? 16 : 20;
  const command = (head: number[]) => cipher.encrypt(message(size, head)),
    FACELETS = gen === 3 ? [0x68, 0x01] : [0xdd, 0x04, 0x00, 0xed, 0x00, 0x00],
    BATTERY = gen === 3 ? [0x68, 0x07] : [0xdd, 0x04, 0x00, 0xef, 0x00, 0x00],
    HARDWARE = gen === 3 ? [0x68, 0x04] : [0xdf, 0x03, 0x00, 0x00, 0x00];
  const clock = new CubeClock(),
    gyro = new GanGyro();
  let last = -1,
    lastMoveAt = 0;
  /** Turns heard ahead of a missing one, by number. */
  const waiting = new Map<number, { move: string; at: number }>();
  const history = (serial: number, count: number) => {
    // The cube answers with an even count of turns from an odd number, never across 255 → 0.
    if (serial % 2 === 0) serial = (serial - 1) & 0xff;
    if (count % 2) count++;
    send(command([gen === 3 ? 0x68 : 0xd1, gen === 3 ? 0x03 : 0x04, serial, 0, Math.min(count, serial + 1), 0]));
  };
  const flush = (): SmartCubeEvent[] => {
    const out: SmartCubeEvent[] = [];
    for (let next = (last + 1) & 0xff; waiting.has(next); next = (last + 1) & 0xff) {
      out.push({ type: "move", ...waiting.get(next)! });
      waiting.delete(next);
      last = next;
    }
    if (waiting.size > 16) {
      // Lost for good: start again from the cube's state.
      waiting.clear();
      last = -1;
      send(command(FACELETS));
    } else if (waiting.size) {
      const head = Math.min(...[...waiting.keys()].map((s) => (s - last) & 0xff));
      history((last + head) & 0xff, head);
    }
    return out;
  };
  return {
    hello: () => [[0, command(HARDWARE)], [0, command(FACELETS)], [0, command(BATTERY)]],
    poll: () => [[0, command(BATTERY)]],
    receive(_, data, at) {
      if (data.length < 16) return [];
      const m = cipher.decrypt(data);
      if (gen === 3 && m[0] !== 0x55) return [];
      const type = m[o / 8]!,
        length = m[o / 8 + 1]!;
      if (type === 0x01 && last >= 0) {
        const serial = le(m, o / 8 + 6, 2) & 0xff,
          face = [2, 32, 8, 1, 16, 4].indexOf(bits(m, o + 66, 6)),
          prime = bits(m, o + 64, 2),
          ahead = (serial - last) & 0xff;
        lastMoveAt = at;
        if (face < 0 || ahead === 0 || ahead > 128) return [];
        waiting.set(serial, { move: turn(face, prime), at: clock.at(le(m, o / 8 + 2, 4), at) });
        return flush();
      }
      if (type === (gen === 3 ? 0x06 : 0xd1) && last >= 0) {
        // History: two turns a byte, newest first, from `start` down.
        const start = m[o / 8 + 2]!;
        for (let i = 0; i < (length - 1) * 2; i++) {
          const serial = (start - i) & 0xff,
            face = [1, 5, 3, 0, 4, 2].indexOf(bits(m, o + 24 + 4 * i, 3));
          if (face >= 0 && !waiting.has(serial) && ((serial - last) & 0xff) > 0 && ((serial - last) & 0xff) < 128)
            waiting.set(serial, { move: turn(face, bits(m, o + 27 + 4 * i, 1)), at });
        }
        return flush();
      }
      if (type === (gen === 3 ? 0x02 : 0xed)) {
        const serial = le(m, o / 8 + 2, 2) & 0xff;
        if (last < 0) last = serial;
        else if (serial !== last) {
          // The cube has turns we never heard: ask for them once it rests.
          if (at - lastMoveAt > 500 && serial !== 0) history(serial, (serial - last) & 0xff);
          return [];
        }
        const facelets = ganState(m, o + 32, 2);
        return facelets ? [{ type: "facelets", facelets }] : [];
      }
      if (gen === 3 && type === 0x10) return [{ type: "battery", level: Math.min(m[3]!, 100) }];
      if (gen === 4 && type === 0xef) return [{ type: "battery", level: Math.min(m[1 + length]!, 100) }];
      if (gen === 4 && type === 0xec)
        return [{ type: "orientation", quaternion: gyro.orientation(signed15(bits(m, 32, 16)), signed15(bits(m, 48, 16)), signed15(bits(m, 64, 16)), signed15(bits(m, 16, 16))) }];
      return [];
    },
  };
}

// ——— MoYu32 ———

/** MoYu WeiLong AI and others of the WCU app (WCU_MY32_…, WCU_MY33_…). */
export function moyu32(cipher: Cipher): CubeDecoder {
  let count = -1;
  let cube = 0;
  const clock = new CubeClock(),
    command = (op: number): [number, Uint8Array] => [0, cipher.encrypt(message(20, [op]))];
  return {
    hello: () => [command(161), command(163), command(164)],
    poll: () => [command(164)],
    receive(_, data, at) {
      if (data.length < 16) return [];
      const m = cipher.decrypt(data);
      if (m[0] === 163) {
        // Each face's eight facelets, 3 bits each, in the order F B U D L R.
        const order = [2, 5, 0, 3, 4, 1];
        let facelets = "";
        for (const face of order)
          for (let j = 0; j < 8; j++) {
            facelets += "FBUDLR"[bits(m, 8 + face * 24 + j * 3, 3)] ?? "?";
            if (j === 3) facelets += "FBUDLR"[face];
          }
        count = m[19]!;
        return [{ type: "facelets", facelets }];
      }
      if (m[0] === 164) return [{ type: "battery", level: Math.min(m[1]!, 100) }];
      if (m[0] === 165 && count >= 0) {
        // The last five turns, newest first, each with the milliseconds since the one before it.
        const now = m[11]!,
          n = Math.min((now - count) & 0xff, 5),
          events: SmartCubeEvent[] = [];
        count = now;
        for (let i = n - 1; i >= 0; i--) {
          const code = bits(m, 96 + i * 5, 5);
          if (code >= 12) return [];
          cube += bits(m, 8 + i * 16, 16);
          events.push({ type: "move", move: "FBUDLR"[code >> 1]! + (code & 1 ? "'" : ""), at: clock.at(cube, at) });
        }
        return events;
      }
      return [];
    },
  };
}

// ——— QiYi ———

/** CRC-16/MODBUS, as QiYi checks its messages: 0 over a message and its checksum. */
export function crc16modbus(data: ArrayLike<number>) {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]!;
    for (let j = 0; j < 8; j++) crc = crc & 1 ? (crc >> 1) ^ 0xa001 : crc >> 1;
  }
  return crc;
}
const qiyiAes = aes128(QIYI_KEY);
/** A QiYi message: 0xFE, its length, its content, its checksum, padded with zeros and encrypted block by block. */
export function qiyiFrame(content: readonly number[]) {
  const body = [0xfe, content.length + 4, ...content],
    crc = crc16modbus(body),
    data = new Uint8Array(Math.ceil((body.length + 2) / 16) * 16);
  data.set([...body, crc & 0xff, crc >> 8]);
  for (let i = 0; i < data.length; i += 16) qiyiAes.encrypt(data, i);
  return data;
}
/** The content of a QiYi message, decrypted and checked; null if it is not one. */
export function qiyiOpen(data: Uint8Array): Uint8Array | null {
  if (data.length % 16) return null;
  const m = data.slice();
  for (let i = 0; i < m.length; i += 16) qiyiAes.decrypt(m, i);
  const message = m.subarray(0, m[1]);
  return m[0] === 0xfe && message.length >= 4 && crc16modbus(message) === 0 ? message : null;
}
/** QiYi colours: 0 orange, 1 red, 2 yellow, 3 white, 4 green, 5 blue; two facelets a byte, the low half first. */
const qiyiFacelets = (m: Uint8Array) => Array.from({ length: 54 }, (_, i) => "LRDUFB"[(m[7 + (i >> 1)]! >> ((i % 2) * 4)) & 0xf] ?? "?").join("");
/** QiYi's turn codes 1–12: L' L R' R D' D U' U F' F B' B. */
const qiyiTurn = (code: number) => "LRDUFB"[(code - 1) >> 1]! + (code & 1 ? "'" : "");

/** QiYi AI cubes (QY-QYSC-S, -A) and XMD Tornado V4 i. */
export function qiyi(mac: number[], send: (data: Uint8Array) => void): CubeDecoder {
  let last = 0;
  const clock = new CubeClock();
  return {
    // The app's hello carries the cube's MAC address backwards: the cube answers nothing before it.
    hello: () => [[0, qiyiFrame([0x00, 0x6b, 0x01, 0x00, 0x00, 0x22, 0x06, 0x00, 0x02, 0x08, 0x00, ...mac.slice().reverse()])]],
    receive(_, data, at) {
      const m = qiyiOpen(data);
      if (!m) return [];
      const op = m[2],
        ts = be32(m, 3);
      const ack = () => send(qiyiFrame(Array.from(m.subarray(2, 7))));
      if (op === 0x02 || op === 0x05) {
        if (op === 0x02) ack();
        last = ts;
        return [{ type: "facelets", facelets: qiyiFacelets(m) }, { type: "battery", level: m[35]! }];
      }
      if (op !== 0x03 || m.length < 92) return [];
      if (m[91]) ack();
      // The turn of this state and the eleven before it (each a timestamp and a code; 0xFF where none), oldest first.
      const turns = new Map<number, number>([[ts, m[34]!]]);
      for (let off = 36; off + 5 <= 91; off += 5)
        if (m.subarray(off, off + 5).some((b) => b !== 0xff)) turns.set(be32(m, off), m[off + 4]!);
      const events: SmartCubeEvent[] = [...turns]
        .filter(([t, code]) => t > last && code >= 1 && code <= 12)
        .sort(([a], [b]) => a - b)
        .map(([t, code]) => ({ type: "move", move: qiyiTurn(code), at: clock.at(t / 1.6, at) }));
      last = Math.max(last, ts);
      // A state to acknowledge is a solved one, even when the cube, turned fast, reports it wrong.
      events.push({ type: "facelets", facelets: m[91] ? SOLVED : qiyiFacelets(m) }, { type: "battery", level: m[35]! });
      return events;
    },
  };
}

// ——— Giiker ———

const GIIKER_KEY = [176, 81, 104, 224, 86, 137, 237, 119, 38, 26, 193, 161, 210, 126, 150, 81, 93, 13, 236, 249, 89, 235, 88, 24, 113, 81, 214, 131, 130, 199, 2, 169, 39, 165, 171, 41];
const GIIKER_CORNERS = [[26, 15, 29], [20, 8, 9], [18, 38, 6], [24, 27, 44], [51, 35, 17], [45, 11, 2], [47, 0, 36], [53, 42, 33]];
const GIIKER_EDGES = [[25, 28], [23, 12], [19, 7], [21, 41], [32, 16], [5, 10], [3, 37], [30, 43], [52, 34], [48, 14], [46, 1], [50, 39]];

/** A Giiker state: its 40 hexadecimal digits, decrypted when its 19th byte says so (newer cubes). */
export function giikerDigits(data: Uint8Array) {
  const raw = Array.from(data.subarray(0, 20));
  if (raw[18] === 0xa7) {
    const k1 = raw[19]! >> 4,
      k2 = raw[19]! & 0xf;
    for (let i = 0; i < 18; i++) raw[i] = (raw[i]! + GIIKER_KEY[i + k1]! + GIIKER_KEY[i + k2]!) & 0xff;
    raw.length = 18;
  }
  return raw.flatMap((b) => [b >> 4, b & 0xf]);
}

/** Giiker i3 and Xiaomi Mi Smart: every notification is the whole state and the last turn. */
export function giiker(): CubeDecoder {
  let facelets: string | null = null;
  return {
    hello: () => [[1, Uint8Array.of(0xb5)]],
    poll: () => [[1, Uint8Array.of(0xb5)]],
    reads: [0],
    receive(channel, data) {
      if (channel === 1) return [{ type: "battery", level: data[1]! }];
      if (data.length < 20) return [];
      const h = giikerDigits(data),
        flip = [-1, 1, -1, 1, 1, -1, 1, -1],
        eo = [0, 1, 2].flatMap((i) => [8, 4, 2, 1].map((mask) => (h[i + 28]! & mask ? 1 : 0)));
      const state = piecesToFacelets(
        h.slice(0, 8).map((v) => v - 1),
        h.slice(8, 16).map((v, i) => (3 + v * flip[i]!) % 3),
        h.slice(16, 28).map((v) => v - 1),
        eo,
        false,
        GIIKER_CORNERS,
        GIIKER_EDGES,
      );
      if (!state) return [];
      const events: SmartCubeEvent[] = [];
      const face = "?BDLURF"[h[32]!],
        amount = h[33] === 9 ? 2 : h[33]!;
      if (facelets && state !== facelets && face && face !== "?" && amount >= 1 && amount <= 3)
        events.push({ type: "move", move: face + ["", "", "2", "'"][amount], at: Date.now() });
      facelets = state;
      events.push({ type: "facelets", facelets: state });
      return events;
    },
  };
}

// ——— GoCube ———

/** GoCube and Rubik's Connected: unencrypted frames 0x2A, length, type, content, checksum, CR LF. */
export function goCube(send: (data: Uint8Array) => void): CubeDecoder {
  let turns = 0;
  return {
    hello: () => [[0, Uint8Array.of(0x33)], [0, Uint8Array.of(0x32)]],
    poll: () => [[0, Uint8Array.of(0x32)]],
    receive(_, d, at) {
      const n = d.length;
      if (n < 7 || d[0] !== 0x2a || d[n - 2] !== 0x0d || d[n - 1] !== 0x0a) return [];
      if ((d.subarray(0, n - 3).reduce((a, b) => a + b, 0) & 0xff) !== d[n - 3]) return [];
      const type = d[2];
      if (type === 1) {
        // Turns as codes B B' F F' U U' D D' R R' L L', each followed by a byte of the centres' angle.
        const events: SmartCubeEvent[] = [];
        for (let i = 3; i < n - 4; i += 2) events.push({ type: "move", move: "BFUDRL"[d[i]! >> 1]! + (d[i]! & 1 ? "'" : ""), at });
        // Every twenty turns, the state again, should a turn have been missed.
        if ((turns += events.length) >= 20) {
          turns = 0;
          send(Uint8Array.of(0x33));
        }
        return events;
      }
      if (type === 2 && n >= 3 + 54) {
        // Each face (in the order B F U D R L) as its centre and its eight facelets around, from a corner of its own.
        const f: string[] = [],
          place = [5, 2, 0, 3, 1, 4],
          around = [0, 1, 2, 5, 8, 7, 6, 3],
          start = [0, 0, 6, 2, 0, 0];
        for (let a = 0; a < 6; a++) {
          f[place[a]! * 9 + 4] = "BFUDRL"[d[3 + a * 9]!]!;
          for (let i = 0; i < 8; i++) f[place[a]! * 9 + around[(i + start[a]!) % 8]!] = "BFUDRL"[d[3 + a * 9 + i + 1]!]!;
        }
        return [{ type: "facelets", facelets: f.join("") }];
      }
      if (type === 5) return [{ type: "battery", level: d[3]! }];
      return [];
    },
  };
}

// ——— The protocols ———

export const CUBE_PROTOCOLS: CubeProtocol[] = [
  {
    id: "gan-gen2",
    names: ["GAN", "MG", "AiCube"],
    channels: [{ service: "6e400001-b5a3-f393-e0a9-e50e24dc4179", notify: "28be4cb6-cd67-11e9-a32f-2a2ae2dbcce4", write: "28be4a4a-cd67-11e9-a32f-2a2ae2dbcce4" }],
    companies: GAN_COMPANIES,
    macFrom: ganMac,
    needsMac: true,
    decoder: (name, mac) => {
      const cipher = name.startsWith("AiCube") ? macCipher(AICUBE_KEY, AICUBE_IV, mac!) : macCipher(GAN_KEY, GAN_IV, mac!);
      return ganGen2(cipher);
    },
  },
  {
    id: "gan-gen3",
    names: ["GAN"],
    channels: [{ service: "8653000a-43e6-47b7-9cb0-5fc21d4ae340", notify: "8653000b-43e6-47b7-9cb0-5fc21d4ae340", write: "8653000c-43e6-47b7-9cb0-5fc21d4ae340" }],
    companies: GAN_COMPANIES,
    macFrom: ganMac,
    needsMac: true,
    decoder: (_, mac, send) => ganGen34(3, macCipher(GAN_KEY, GAN_IV, mac!), (d) => send(0, d)),
  },
  {
    id: "gan-gen4",
    names: ["GAN"],
    channels: [{ service: "00000010-0000-fff7-fff6-fff5fff4fff0", notify: "fff6", write: "fff5" }],
    companies: GAN_COMPANIES,
    macFrom: ganMac,
    needsMac: true,
    decoder: (_, mac, send) => ganGen34(4, macCipher(GAN_KEY, GAN_IV, mac!), (d) => send(0, d)),
  },
  {
    id: "moyu32",
    names: ["WCU_MY3"],
    channels: [{ service: "0783b03e-7735-b5a0-1760-a305d2795cb0", notify: "0783b03e-7735-b5a0-1760-a305d2795cb1", write: "0783b03e-7735-b5a0-1760-a305d2795cb2" }],
    // Bound to an account of the WCU app, the cube advertises under its id; unbound, under 0.
    companies: [0, ...Array.from({ length: 255 }, (_, i) => (i + 1) << 8)],
    macFrom: (data) => {
      for (const d of data.values()) if (d.length >= 6) return macOf(Array.from(d.subarray(d.length - 6)).reverse());
    },
    guesses: (name) => {
      const m = /^WCU_MY3([23])_([0-9A-F]{4})$/i.exec(name);
      if (!m) return [];
      const end = `${m[2]!.slice(0, 2)}:${m[2]!.slice(2)}`.toUpperCase();
      return (m[1] === "3" ? ["02", "01", "00"] : ["00", "01", "02"]).map((mid) => `CF:30:16:${mid}:${end}`);
    },
    needsMac: true,
    decoder: (_, mac) => moyu32(macCipher(MOYU32_KEY, MOYU32_IV, mac!)),
  },
  {
    id: "qiyi",
    names: ["QY-QYSC", "XMD-TornadoV4-i"],
    channels: [{ service: "fff0", notify: "fff6", write: "fff6" }],
    companies: [0x0504],
    macFrom: (data) => {
      const d = data.get(0x0504);
      return d && d.length >= 6 ? macOf(Array.from(d.subarray(0, 6)).reverse()) : undefined;
    },
    guesses: (name) => {
      const end = /-([0-9A-F]{4})$/i.exec(name.trim())?.[1]?.toUpperCase();
      if (!end) return [];
      const tail = `${end.slice(0, 2)}:${end.slice(2)}`;
      if (name.startsWith("XMD-TornadoV4-i")) return [`CC:A6:00:00:${tail}`];
      if (name.startsWith("QY-QYSC-A")) return [`CC:A2:00:00:${tail}`];
      return [`CC:A3:00:00:${tail}`, `CC:A3:00:01:${tail}`];
    },
    needsMac: true,
    decoder: (_, mac, send) => qiyi(mac!, (d) => send(0, d)),
  },
  {
    id: "giiker",
    names: ["Gi", "Mi Smart Magic Cube", "Hi-"],
    channels: [
      { service: "aadb", notify: "aadc" },
      { service: "aaaa", notify: "aaab", write: "aaac" },
    ],
    needsMac: false,
    decoder: () => giiker(),
  },
  {
    id: "gocube",
    names: ["GoCube", "Rubiks"],
    channels: [{ service: "6e400001-b5a3-f393-e0a9-e50e24dcca9e", notify: "6e400003-b5a3-f393-e0a9-e50e24dcca9e", write: "6e400002-b5a3-f393-e0a9-e50e24dcca9e" }],
    needsMac: false,
    decoder: (_, __, send) => goCube((d) => send(0, d)),
  },
];

/** Asks the player for a cube's MAC address (`guess` filled in, `wrong` after one that did not work). */
export type AskMac = (name: string, guess: string | undefined, wrong: boolean) => Promise<string>;

/** Whether 54 facelets are a cube's colours: nine of each, the centres in place. */
const isCube = (facelets: string) =>
  /^[URFDLB]{54}$/.test(facelets) && [..."URFDLB"].every((face, i) => facelets[i * 9 + 4] === face && facelets.split(face).length === 10);

/** Waits for `test` to hold, or `ms` milliseconds. */
const settled = (test: () => boolean, ms: number) =>
  new Promise<boolean>((resolve) => {
    const start = Date.now(),
      tick = setInterval(() => {
        if (test() || Date.now() - start > ms) {
          clearInterval(tick);
          resolve(test());
        }
      }, 50);
  });

/**
 * A session of a protocol on a link: listens, says hello, and waits for the cube's first state. False when none
 * comes (a wrong MAC address).
 */
async function session(protocol: CubeProtocol, link: BleLink, mac: number[] | null, listen: (event: SmartCubeEvent) => void) {
  const write = (channel: number, data: Uint8Array) => {
    const c = protocol.channels[channel]!;
    if (c.write) link.write(c.service, c.write, data).catch(() => {});
  };
  const decoder = protocol.decoder(link.name, mac, write);
  let ready = false;
  const hear = (channel: number) => (data: Uint8Array) => {
    let events: SmartCubeEvent[];
    try {
      events = decoder.receive(channel, data, Date.now());
    } catch {
      return; // A message the decoder could not read: never the app's concern.
    }
    for (const event of events) {
      // A state that is not a cube (a wrong key, a garbled message) is dropped.
      if (event.type === "facelets" && !isCube(event.facelets)) continue;
      if (event.type === "facelets") ready = true;
      if (ready) listen(event);
    }
  };
  for (const [i, c] of protocol.channels.entries()) await link.subscribe(c.service, c.notify, hear(i)).catch((error) => (i ? undefined : Promise.reject(error)));
  for (const i of decoder.reads ?? []) hear(i)(await link.read(protocol.channels[i]!.service, protocol.channels[i]!.notify));
  for (const [c, d] of decoder.hello()) write(c, d);
  if (!(await settled(() => ready, 4000))) return null;
  return decoder;
}

/**
 * The driver of Bluetooth cubes over an adapter (Web Bluetooth, or the Android app's). The protocol is told by the
 * services the cube offers; its MAC address, when its protocol needs one, comes from the platform, from its
 * advertisements, from its name (tried in turn), or from the player (`askMac`). A cube out of reach is called again
 * three times before it is given up.
 */
export function bluetoothCube(adapter: BleAdapter, askMac: AskMac): SmartCubeDriver {
  return {
    label: "Bluetooth",
    async connect(listen, signal) {
      const link = await adapter({
        names: [...new Set(CUBE_PROTOCOLS.flatMap((p) => p.names))],
        services: [...new Set(CUBE_PROTOCOLS.flatMap((p) => p.channels.map((c) => uuid(c.service))))],
        companies: [...new Set(CUBE_PROTOCOLS.flatMap((p) => p.companies ?? []))],
      });
      let timer: ReturnType<typeof setInterval> | undefined;
      const stop = () => {
        clearInterval(timer);
        link.close();
      };
      signal.addEventListener("abort", stop);
      try {
        // Let go while the browser's chooser or Android's scan was open.
        if (signal.aborted) throw cancelled();
        const offered = await link.services(),
          protocol = CUBE_PROTOCOLS.find((p) => offered.includes(uuid(p.channels[0]!.service)) && p.names.some((n) => link.name.startsWith(n)));
        if (!protocol) throw new Error(UNSUPPORTED_DEVICE);
        // Its MAC address: known, or tried from what hints at it, or asked.
        const known = link.mac ?? (protocol.macFrom && (await link.advertisement(protocol.companies ?? []).then((d) => (d ? protocol.macFrom!(d) : undefined)))),
          tries = protocol.needsMac ? (known ? [known] : (protocol.guesses?.(link.name) ?? [])) : [""];
        let mac: number[] | null = null,
          decoder: CubeDecoder | null = null,
          typed = false;
        for (;;) {
          const tried = tries.shift(),
            next = tried ?? (await askMac(link.name, protocol.guesses?.(link.name)[0], typed));
          if (signal.aborted) throw cancelled();
          typed = tried === undefined;
          mac = protocol.needsMac ? parseMac(next) : null;
          if (protocol.needsMac && !mac) continue;
          decoder = await session(protocol, link, mac, listen);
          if (decoder) break;
          if (!protocol.needsMac) throw new Error(UNSUPPORTED_DEVICE);
        }
        const poll = () => {
          for (const [c, d] of decoder?.poll?.() ?? []) {
            const ch = protocol.channels[c]!;
            if (ch.write) link.write(ch.service, ch.write, d).catch(() => {});
          }
        };
        timer = setInterval(poll, 60_000);
        link.onDrop(async () => {
          listen({ type: "reconnecting" });
          for (let attempt = 0; attempt < 3 && !signal.aborted; attempt++) {
            await new Promise((r) => setTimeout(r, 1000 + attempt * 2000));
            try {
              await link.reconnect();
              decoder = await session(protocol, link, mac, listen);
              if (decoder) return listen({ type: "reconnected" });
            } catch {
              // Not back yet.
            }
          }
          stop();
          if (!signal.aborted) listen({ type: "disconnected" });
        });
        return { name: link.name, disconnect: stop };
      } catch (error) {
        stop();
        throw error;
      }
    },
  };
}
