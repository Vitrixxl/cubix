/**
 * The smart cube protocols (src/client/lib/bluetooth) against captures of real cubes (tests/fixtures/smartcubes.json,
 * from smartcube-web-bluetooth, MIT): the encrypted notifications of each cube are decoded here and must give the
 * turns its own decoder saw, R U R' U' and a T permutation twice, ending solved. A wrong key or a wrong bit would give
 * other turns, or none.
 */
import { describe, expect, test } from "bun:test";
import fixtures from "./fixtures/smartcubes.json";
import { aes128 } from "../src/client/lib/bluetooth/aes";
import {
  CUBE_PROTOCOLS,
  crc16modbus,
  ganGen34,
  bits,
  bluetoothCube,
  GAN_IV,
  GAN_KEY,
  GanGyro,
  giikerDigits,
  macCipher,
  piecesToFacelets,
  qiyiFrame,
  qiyiOpen,
} from "../src/client/lib/bluetooth/cubes";
import { cancelled, macOf, NO_BLUETOOTH, parseMac, UNSUPPORTED_DEVICE, uuid, webBluetooth, type BleAdapter } from "../src/client/lib/bluetooth/link";
import { isSolved, SmartCube, stateToFacelets, type SmartCubeEvent } from "../src/client/lib/smartCube";
import { crc16ccitt, ganTimerPacket, SmartTimer } from "../src/client/lib/bluetooth/timers";
import { followTimerDevice, HOLD_DELAY_MS, PracticeTimer } from "../src/client/lib/practiceTimer";

const SOLVED = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map((h) => parseInt(h, 16)));
const toHex = (b: Uint8Array) => Buffer.from(b).toString("hex").toUpperCase();
type Capture = { protocol: string; mac?: string | null; traffic: [string, string, string][]; moves: string[]; facelets: string[]; battery: number[] };
const cubes = fixtures.cubes as unknown as Record<string, Capture>;

/** Replays a capture's notifications (and reads) through its protocol's decoder. */
function replay(name: string, capture: Capture) {
  const protocol = CUBE_PROTOCOLS.find((p) => p.id === capture.protocol)!;
  const sent: [number, Uint8Array][] = [];
  const decoder = protocol.decoder(name, capture.mac ? parseMac(capture.mac) : null, (c, d) => sent.push([c, d]));
  const channel = (id: string) => protocol.channels.findIndex((c) => uuid(c.notify).slice(4, 8) === id);
  const events: SmartCubeEvent[] = [];
  let at = 1_000_000;
  for (const [op, id, data] of capture.traffic) if (op !== "w" && channel(id) >= 0) events.push(...decoder.receive(channel(id), hex(data), (at += 50)));
  return { protocol, decoder, events, sent };
}

describe("captures of real cubes", () => {
  for (const [name, capture] of Object.entries(cubes))
    test(`${name} (${capture.protocol})`, () => {
      const { events } = replay(name, capture);
      const moves = events.flatMap((e) => (e.type === "move" ? [e.move] : []));
      // The WCU_MY33 capture's decoder started listening a turn late: its first U' it never saw.
      expect(moves.slice(moves.length - capture.moves.length)).toEqual(capture.moves);
      expect(moves.length - capture.moves.length).toBe(name === "WCU_MY33_AF9E" ? 1 : 0);
      // Followed by the app's cube from its first state, the turns end on the cube's last state: solved.
      const cube = new SmartCube(),
        first = events.findIndex((e) => e.type === "facelets");
      expect(first).toBeGreaterThanOrEqual(0);
      for (const event of events.slice(first)) cube.receive(event);
      expect(stateToFacelets(cube.snapshot.state)).toBe(capture.facelets[0]!);
      expect(isSolved(cube.snapshot.state)).toBe(true);
      const levels = events.flatMap((e) => (e.type === "battery" ? [e.level] : []));
      if (capture.battery.length) expect(levels).toContain(capture.battery[0]!);
      // Turns carry times that never go back.
      const times = events.flatMap((e) => (e.type === "move" ? [e.at] : []));
      expect(times).toEqual([...times].sort((a, b) => a - b));
    });

  test("a wrong MAC address decodes no state", () => {
    const capture = cubes["GANi4_A26E"]!;
    const { events } = replay("GANi4_A26E", { ...capture, mac: "0C:3D:5E:BD:A2:6F" });
    expect(events.filter((e) => e.type === "facelets" || e.type === "move")).toEqual([]);
  });

  test("the app's own requests are the captured ones (GAN Gen4, MoYu32, QiYi hello)", () => {
    for (const name of ["GANi4_A26E", "WCU_MY32_A388", "QY-QYSC-S-A0E6"]) {
      const capture = cubes[name]!,
        { decoder } = replay(name, capture),
        written = capture.traffic.filter(([op]) => op === "w").map(([, , d]) => d);
      for (const [, data] of decoder.hello()) expect(written).toContain(toHex(data));
    }
  });
});

describe("ciphers", () => {
  test("AES-128 gives FIPS-197's example (appendix C.1)", () => {
    const aes = aes128(hex("000102030405060708090a0b0c0d0e0f")),
      block = hex("00112233445566778899aabbccddeeff");
    aes.encrypt(block);
    expect(toHex(block)).toBe("69C4E0D86A7B0430D8CDB78070B4C55A");
    aes.decrypt(block);
    expect(toHex(block)).toBe("00112233445566778899AABBCCDDEEFF");
  });

  test("a GAN message decrypts and encrypts back, whatever its length", () => {
    const cipher = macCipher(GAN_KEY, GAN_IV, parseMac("AB:12:34:00:DE:EF")!);
    for (const length of [16, 18, 20]) {
      const data = Uint8Array.from({ length }, (_, i) => i * 7);
      expect(cipher.decrypt(cipher.encrypt(data))).toEqual(data);
    }
  });

  test("QiYi frames: the documented checksum, and frames that open again", () => {
    // From Flying-Toast's protocol notes: fe 09 02 00 02 45 2c has the checksum ef 1b.
    expect(crc16modbus(hex("fe090200022c45".replace("2c45", "452c")))).toBe(0x1bef);
    expect(crc16modbus(hex("fe09020002452cef1b"))).toBe(0);
    const frame = qiyiFrame([0x02, 0x00, 0x02, 0x45, 0x2c]);
    expect(frame.length).toBe(16);
    expect(toHex(qiyiOpen(frame)!)).toBe("FE09020002452CEF1B");
    expect(qiyiOpen(frame.map((b, i) => (i === 3 ? b ^ 1 : b)))).toBeNull();
  });

  test("Giiker: a plain state is read as is", () => {
    const plain = hex("12345678333333331234567890ab0000510000000000000000000000".slice(0, 40));
    expect(giikerDigits(plain).slice(0, 8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe("pieces and orientation", () => {
  test("pieces give Kociemba's facelets (gan-web-bluetooth's F R example), and a non-cube none", () => {
    expect(piecesToFacelets([0, 1, 2, 3, 4, 5, 6], [0, 0, 0, 0, 0, 0, 0], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(SOLVED);
    expect(piecesToFacelets([0, 5, 2, 1, 7, 4, 6], [1, 2, 0, 2, 1, 1, 0], [1, 9, 2, 3, 11, 8, 6, 7, 4, 5, 10], [1, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0])).toBe(
      "UUFUUFLLFUUURRRRRRFFRFFDFFDRRBDDBDDBLLDLLDLLDLBBUBBUBB",
    );
    expect(piecesToFacelets([0, 0, 2, 3, 4, 5, 6], [0, 0, 0, 0, 0, 0, 0], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBeNull();
  });

  test("a GAN cube held as it was first is in the reference pose; turned about white, about the player's up", () => {
    const gyro = new GanGyro();
    const first = gyro.orientation(0.1, 0.2, 0.3, Math.sqrt(1 - 0.14));
    expect(first.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([1, 0, 0, 0]);
    // A quarter turn about GAN's +Z (white) from rest: about the app's y axis (up), the other way as yellow is up.
    const g = new GanGyro();
    g.orientation(0, 0, 0, 1);
    const q = g.orientation(0, 0, Math.SQRT1_2, Math.SQRT1_2);
    expect(q.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0.707107, 0, -0.707107, 0]);
  });

  test("MAC addresses", () => {
    expect(parseMac("ab-12-34-00-de-ef")).toEqual([0xab, 0x12, 0x34, 0x00, 0xde, 0xef]);
    expect(parseMac("AB12340")).toBeNull();
    expect(macOf([0xcc, 0xa3, 0, 0, 0xa0, 0xe6])).toBe("CC:A3:00:00:A0:E6");
    const qiyi = CUBE_PROTOCOLS.find((p) => p.id === "qiyi")!,
      moyu = CUBE_PROTOCOLS.find((p) => p.id === "moyu32")!;
    // The captured cubes' addresses are among those their names hint at.
    expect(qiyi.guesses!("QY-QYSC-S-A0E6")).toContain("CC:A3:00:00:A0:E6");
    expect(qiyi.guesses!("XMD-TornadoV4-i-034C")).toContain("CC:A6:00:00:03:4C");
    expect(moyu.guesses!("WCU_MY32_A388")).toContain("CF:30:16:00:A3:88");
    expect(moyu.guesses!("WCU_MY33_AF9E")).toContain("CF:30:16:02:AF:9E");
  });
});

describe("GAN Gen4: a turn the radio missed", () => {
  test("is asked from the cube's history; the turns after it wait for it, then all come in order", () => {
    const capture = cubes["GANi4_A26E"]!,
      cipher = macCipher(GAN_KEY, GAN_IV, parseMac(capture.mac!)!),
      notifies = capture.traffic.filter(([op]) => op === "n").map(([, , d]) => hex(d));
    // The turns by number, as the cube sent them; the eleventh never comes (every copy of its message lost).
    const turns = new Map<number, string>();
    for (const d of notifies) {
      const m = cipher.decrypt(d);
      if (m[0] === 0x01) turns.set(m[6]!, "URFDLB"[[2, 32, 8, 1, 16, 4].indexOf(bits(m, 66, 6))]! + (bits(m, 64, 2) ? "'" : ""));
    }
    const dropped = [...turns.keys()][10]!,
      lost = (d: Uint8Array) => {
        const m = cipher.decrypt(d);
        return m[0] === 0x01 && m[6] === dropped;
      };
    // The cube's history: its turns from `start` down, two a byte (face code, then direction), as GAN numbers them.
    const code = (move: string) => [1, 5, 3, 0, 4, 2]["URFDLB".indexOf(move[0]!)]! * 2 + (move.endsWith("'") ? 1 : 0);
    const history = (start: number, count: number) => {
      const nibbles = Array.from({ length: count }, (_, i) => code(turns.get((start - i) & 0xff) ?? "D"));
      const answer = new Uint8Array(20);
      answer.set([0xd1, count / 2 + 1, start, ...Array.from({ length: count / 2 }, (_, i) => (nibbles[2 * i]! << 4) | nibbles[2 * i + 1]!)]);
      return cipher.encrypt(answer);
    };
    const requests: Uint8Array[] = [],
      decoder = ganGen34(4, cipher, (d) => requests.push(cipher.decrypt(d))),
      moves: string[] = [];
    let at = 0,
      answered = false;
    for (const d of notifies) {
      if (lost(d)) continue;
      for (const e of decoder.receive(0, d, (at += 50))) if (e.type === "move") moves.push(e.move);
      const request = requests.find((m) => m[0] === 0xd1);
      if (request && !answered) {
        // Asked from an odd number, an even count, the missing turn among them; until the answer, nothing after it.
        const [start, count] = [request[2]!, request[4]!];
        expect([start % 2, count % 2]).toEqual([1, 0]);
        expect((start - dropped) & 0xff).toBeLessThan(count);
        expect(moves.length).toBe(10);
        answered = true;
        for (const e of decoder.receive(0, history(start, count), (at += 50))) if (e.type === "move") moves.push(e.move);
      }
    }
    expect(answered).toBe(true);
    expect(moves).toEqual(capture.moves);
  });
});

describe("GAN smart timer", () => {
  /** A timer message as the protocol frames it: FE, length, a byte, the state, its data, the CRC of all but FE and length. */
  const frame = (state: number, data: number[] = []) => {
    const body = [0x01, state, ...data],
      crc = crc16ccitt(body);
    return Uint8Array.from([0xfe, body.length + 4, ...body, crc & 0xff, crc >> 8]);
  };
  test("CRC-16/CCITT-FALSE gives its check value", () => {
    expect(crc16ccitt(Array.from("123456789", (c) => c.charCodeAt(0)))).toBe(0x29b1);
  });
  test("states read as a Stackmat's, the stop with its time", () => {
    expect(ganTimerPacket(frame(6))).toEqual({ status: "C", ms: 0 });
    expect(ganTimerPacket(frame(1))).toEqual({ status: "A", ms: 0 });
    expect(ganTimerPacket(frame(3))).toEqual({ status: " ", ms: 0 });
    // 1:02.345
    expect(ganTimerPacket(frame(4, [1, 2, 0x59, 0x01]))).toEqual({ status: "S", ms: 62_345 });
    expect(ganTimerPacket(frame(7))).toBeNull();
    const broken = frame(3);
    broken[3]! ^= 1;
    expect(ganTimerPacket(broken)).toBeNull();
  });
  test("a smart timer drives the app's timer: hands on, ready, running, stopped with its own time", async () => {
    const device = new SmartTimer(),
      stops: number[] = [];
    let now = 0;
    const timer = new PracticeTimer({ canStart: () => true, onChange: () => {}, onStop: (ms) => void stops.push(ms), now: () => now });
    const stop = followTimerDevice(timer, device, () => true);
    device.receive(frame(6));
    expect(timer.snapshot.phase).toBe("holding");
    await new Promise((r) => setTimeout(r, HOLD_DELAY_MS + 20));
    device.receive(frame(1));
    expect(timer.snapshot.phase).toBe("ready");
    device.receive(frame(3));
    expect(timer.snapshot.phase).toBe("running");
    now = 9000;
    device.receive(frame(4, [0, 8, 0xe7, 0x03]));
    expect(stops).toEqual([8990]);
    // Hands lifted too soon: nothing starts.
    device.receive(frame(5));
    device.receive(frame(6));
    device.receive(frame(2));
    expect(timer.snapshot.phase).toBe("idle");
    // Reset during a solve cancels it.
    device.receive(frame(3));
    expect(timer.snapshot.phase).toBe("running");
    device.receive(frame(5));
    expect(timer.snapshot.phase).toBe("idle");
    expect(stops).toEqual([8990]);
    stop();
  });
});

describe("connecting a Bluetooth cube", () => {
  /** A link that plays a capture back once the app has said hello, as the cube would answer. */
  function replaying(name: string, capture: Capture, services: string[], mac?: string): BleAdapter {
    return async () => {
      const listeners = new Map<string, (data: Uint8Array) => void>();
      let played = false;
      return {
        name,
        mac,
        advertisement: async () => null,
        services: async () => services,
        async subscribe(_, characteristic, listener) {
          listeners.set(uuid(characteristic).slice(4, 8), listener);
          played = false;
        },
        async write() {
          if (played) return;
          played = true;
          for (const [op, id, data] of capture.traffic) if (op === "n") listeners.get(id)?.(hex(data));
        },
        read: async () => new Uint8Array(),
        onDrop() {},
        reconnect: async () => {},
        close() {},
      };
    };
  }

  test("a GAN cube whose MAC address the browser hides: asked, a wrong one asked again, then its turns", async () => {
    const capture = cubes["GANicXXX"]!,
      cube = new SmartCube(),
      questions: NonNullable<typeof cube.snapshot.macRequest>[] = [],
      kept = new Map<string, string>();
    // Only the MAC address the cube answered to is kept for next time.
    Object.assign(globalThis, { localStorage: { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => kept.set(k, v) } });
    cube.subscribe(() => {
      const request = cube.snapshot.macRequest;
      if (!request || questions.includes(request)) return;
      questions.push(request);
      queueMicrotask(() => cube.answerMac(request.wrong ? capture.mac! : "AB:12:34:00:DE:EE"));
    });
    await cube.connect(bluetoothCube(replaying("GANicXXX", capture, ["6e400001-b5a3-f393-e0a9-e50e24dc4179"]), cube.askMac));
    expect(cube.snapshot.status).toBe("on");
    expect(questions.map((q) => q.wrong)).toEqual([false, true]);
    expect(cube.moves.map((m) => m.move)).toEqual(capture.moves);
    expect(isSolved(cube.snapshot.state)).toBe(true);
    expect(JSON.parse(kept.get("cubix.cubeMacs")!)).toEqual({ GANicXXX: capture.mac });
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }, 15_000);

  test("a QiYi cube's MAC address comes from its name; a device of no known protocol is refused", async () => {
    const capture = cubes["QY-QYSC-S-A0E6"]!,
      cube = new SmartCube();
    await cube.connect(bluetoothCube(replaying("QY-QYSC-S-A0E6", capture, [uuid("fff0")]), cube.askMac));
    expect(cube.snapshot.status).toBe("on");
    expect(cube.snapshot.macRequest).toBeUndefined();
    expect(cube.moves.map((m) => m.move)).toEqual(capture.moves);
    await cube.connect(bluetoothCube(replaying("Speaker", capture, [uuid("180f")]), cube.askMac));
    expect(cube.snapshot).toMatchObject({ status: "off", error: UNSUPPORTED_DEVICE });
  });

  test("closing the browser's chooser is no error; a browser without Bluetooth says so", async () => {
    const cube = new SmartCube();
    await cube.connect(bluetoothCube(() => Promise.reject(cancelled()), cube.askMac));
    expect(cube.snapshot).toMatchObject({ status: "off", error: undefined });
    await cube.connect(bluetoothCube(webBluetooth, cube.askMac));
    expect(cube.snapshot).toMatchObject({ status: "off", error: NO_BLUETOOTH });
  });
});
