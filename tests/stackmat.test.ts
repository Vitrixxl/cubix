import { expect, test } from "bun:test";
import { readPacket, stackmatSignal, StackmatDecoder, type StackmatPacket } from "../src/client/lib/stackmat";

const packets: StackmatPacket[] = [
  { status: "I", ms: 0 },
  { status: "A", ms: 0 },
  { status: " ", ms: 1230 },
  { status: "S", ms: 72345 },
];

for (const gen of [3, 4]) for (const invert of [false, true]) for (const rate of [44100, 48000])
  test(`decodes a Gen ${gen} signal${invert ? ", inverted," : ""} at ${rate} Hz, fed in blocks`, () => {
    const signal = stackmatSignal(packets, rate, { gen, invert, amplitude: 0.2 }),
      decoder = new StackmatDecoder(rate),
      out: StackmatPacket[] = [];
    for (let i = 0; i < signal.length; i += 4096) out.push(...decoder.push(signal.subarray(i, i + 4096)));
    // Gen 3 counts in hundredths only.
    expect(out).toEqual(gen === 3 ? packets.map((p) => ({ ...p, ms: p.ms - (p.ms % 10) })) : packets);
  });

test("noise and a wrong checksum give no packet", () => {
  const noise = Float32Array.from({ length: 48000 }, () => Math.random() * 0.02 - 0.01);
  expect(new StackmatDecoder(48000).push(noise)).toEqual([]);
  const bytes = [..."S123456"].map((c) => c.charCodeAt(0));
  expect(readPacket([...bytes, 64 + 21, 10, 13])).toEqual({ status: "S", ms: 83456 });
  expect(readPacket([...bytes, 64 + 20, 10, 13])).toBeNull();
});

test("decodes through a microphone input's coupling, which lets a held level fade, with some noise", () => {
  const rate = 44100, raw = stackmatSignal(packets, rate, { invert: true, amplitude: 0.3 }), coupled = new Float32Array(raw.length);
  // A one-pole high-pass filter at about 20 Hz, as a sound card's input capacitor, then the input's own noise.
  const a = 1 / (1 + (2 * Math.PI * 20) / rate);
  for (let i = 1; i < raw.length; i++) coupled[i] = a * (coupled[i - 1]! + raw[i]! - raw[i - 1]!);
  const signal = coupled.map((v) => v + (Math.random() - 0.5) * 0.02);
  expect(new StackmatDecoder(rate).push(signal)).toEqual(packets);
});
