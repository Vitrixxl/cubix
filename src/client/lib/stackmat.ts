/**
 * Stackmat timers (Gen 3, 4 and 5) plugged into the microphone or line input through their data cable: the timer sends
 * its state as serial data at 1200 baud (one start bit, eight data bits from the lowest, one stop bit), a packet every
 * few milliseconds. Gen 3 packets have 9 bytes, Gen 4 and 5 have 10 (a thousandth digit more):
 *   status, minutes, tens of seconds, seconds, tenths, hundredths, [thousandths,] checksum (64 + sum of the digits), CR/LF
 * Status: "I" reset, "A" ready (both hands down long enough), " " running, "S" stopped, "L"/"R" one hand, "C" both.
 * The level of the signal depends on the cable and the input: both polarities are tried, the first to give a packet kept.
 */
export type StackmatStatus = "I" | "A" | " " | "S" | "L" | "R" | "C";
export interface StackmatPacket { status: StackmatStatus; ms: number }

const BAUD = 1200;

/** The packet these bytes make (status, digits, checksum, line end), or null when they make none. */
export function readPacket(bytes: readonly number[]): StackmatPacket | null {
  if (bytes.length !== 9 && bytes.length !== 10) return null;
  const status = String.fromCharCode(bytes[0]!), digits = bytes.slice(1, bytes.length - 3);
  if (!"IA SLRC".includes(status) || digits.some((b) => b < 48 || b > 57)) return null;
  const d = digits.map((b) => b - 48);
  if (bytes[bytes.length - 3] !== 64 + d.reduce((a, b) => a + b, 0)) return null;
  const tail = String.fromCharCode(bytes[bytes.length - 2]!, bytes[bytes.length - 1]!);
  if (tail !== "\r\n" && tail !== "\n\r") return null;
  return { status: status as StackmatStatus, ms: d[0]! * 60000 + (d[1]! * 10 + d[2]!) * 1000 + (d[3]! * 10 + d[4]!) * 10 + (d[5] ?? 0) };
}

/**
 * A serial line read from audio at one polarity: its level set by each edge of the signal (the rise or fall over a
 * quarter of a bit) and held between them, as an input's coupling lets a held level fade; then bytes, then packets.
 */
class Line {
  private level = 1;
  /** Samples since the start bit of the byte being read; -1 while waiting for one. */
  private position = -1;
  private bits: number[] = [];
  private bytes: number[] = [];
  constructor(private readonly bit: number, private readonly sign: 1 | -1) {}
  push(edge: number, threshold: number, out: StackmatPacket[]) {
    const v = edge * this.sign;
    if (v > threshold) this.level = 1;
    else if (v < -threshold) this.level = 0;
    if (this.position < 0) {
      if (this.level === 0) { this.position = 0; this.bits = []; }
      return;
    }
    this.position++;
    // Each bit is read in its middle: the data bits after the start bit, then the stop bit.
    const index = Math.floor(this.position / this.bit), middle = Math.floor((index + 0.5) * this.bit);
    if (this.position !== middle) return;
    // A start bit gone by its middle was noise.
    if (index === 0) return void (this.level === 1 && (this.position = -1));
    if (index <= 8) return void this.bits.push(this.level);
    this.position = -1;
    if (this.level !== 1) return void (this.bytes = []); // no stop bit: out of step
    this.bytes.push(this.bits.reduce((byte, b, i) => byte | (b << i), 0));
    if (this.bytes.length > 10) this.bytes.shift();
    for (const size of [10, 9]) {
      const packet = this.bytes.length >= size ? readPacket(this.bytes.slice(-size)) : null;
      if (packet) { out.push(packet); this.bytes = []; return; }
    }
  }
}

/** Turns audio samples into Stackmat packets; feed it every block of samples in order. */
export class StackmatDecoder {
  private lines: Line[];
  private peak = 0;
  /** The last quarter of a bit of samples, to measure each edge. */
  private recent: Float32Array;
  private index = 0;
  constructor(sampleRate: number) {
    const bit = sampleRate / BAUD;
    this.lines = [new Line(bit, 1), new Line(bit, -1)];
    this.recent = new Float32Array(Math.max(1, Math.round(bit / 4)));
  }
  push(samples: ArrayLike<number>): StackmatPacket[] {
    const out: StackmatPacket[] = [];
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i]!, edge = sample - this.recent[this.index]!;
      this.recent[this.index] = sample;
      this.index = (this.index + 1) % this.recent.length;
      // Edges are measured against the sharpest recent one (inputs differ in level): a third of it makes an edge.
      this.peak = Math.max(Math.abs(edge), this.peak * 0.9999);
      const threshold = Math.max(0.05, this.peak / 3);
      for (const line of this.lines) {
        const before = out.length;
        line.push(edge, threshold, out);
        // ponytail: polarity kept as soon as one gives a packet; re-detected only by reconnecting.
        if (out.length > before && this.lines.length > 1) this.lines = [line];
      }
    }
    return out;
  }
}

/** Builds the audio of packets, as a Stackmat sends them: for tests and the development tools. */
export function stackmatSignal(packets: readonly StackmatPacket[], sampleRate: number, { gen = 4, invert = false, amplitude = 0.5, gap = 30 } = {}): Float32Array {
  const bit = sampleRate / BAUD, bits: number[] = [];
  const idle = (n: number) => { for (let i = 0; i < n; i++) bits.push(1); };
  idle(gap);
  for (const { status, ms } of packets) {
    const minutes = Math.floor(ms / 60000), seconds = Math.floor(ms / 1000) % 60, rest = ms % 1000;
    const digits = [minutes % 10, Math.floor(seconds / 10), seconds % 10, Math.floor(rest / 100), Math.floor(rest / 10) % 10, ...(gen === 3 ? [] : [rest % 10])];
    const bytes = [status.charCodeAt(0), ...digits.map((d) => 48 + d), 64 + digits.reduce((a, b) => a + b, 0), ...(gen === 3 ? [13, 10] : [10, 13])];
    for (const byte of bytes) {
      bits.push(0);
      for (let i = 0; i < 8; i++) bits.push((byte >> i) & 1);
      bits.push(1);
    }
    idle(gap);
  }
  const samples = new Float32Array(Math.ceil(bits.length * bit));
  for (let i = 0; i < samples.length; i++) samples[i] = (bits[Math.min(bits.length - 1, Math.floor(i / bit))] ? 1 : -1) * amplitude * (invert ? -1 : 1);
  return samples;
}

export type StackmatLink = "off" | "connecting" | "on";
export interface StackmatSnapshot { link: StackmatLink; packet?: StackmatPacket; error?: string }

/** How long without a packet before the timer counts as unplugged (or switched off). */
const SILENCE_MS = 1000;

/** The Stackmat on the audio input: its link and its last packet, as it changes. */
export class Stackmat {
  snapshot: StackmatSnapshot = { link: "off" };
  private listeners = new Set<() => void>();
  private stopAudio?: () => void;
  private silence?: ReturnType<typeof setTimeout>;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  private set(patch: Partial<StackmatSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
  /** Each packet received; the snapshot changes only when the status or the time shown does. */
  receive(packet: StackmatPacket) {
    clearTimeout(this.silence);
    this.silence = setTimeout(() => this.set({ link: "connecting", packet: undefined }), SILENCE_MS);
    const last = this.snapshot.packet;
    if (this.snapshot.link !== "on" || last?.status !== packet.status || last.ms !== packet.ms) this.set({ link: "on", packet });
  }
  /** Listens to the audio input (the browser asks for the microphone), until `disconnect`. */
  async connect() {
    this.disconnect();
    this.set({ link: "connecting", error: undefined, packet: undefined });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      if (this.snapshot.link === "off") return stream.getTracks().forEach((t) => t.stop());
      const context = new AudioContext(),
        source = context.createMediaStreamSource(stream),
        // ponytail: ScriptProcessorNode is deprecated but runs everywhere without a worklet module; move to an
        // AudioWorklet if browsers drop it.
        processor = context.createScriptProcessor(4096, 1, 1),
        decoder = new StackmatDecoder(context.sampleRate);
      processor.onaudioprocess = (e) => { for (const packet of decoder.push(e.inputBuffer.getChannelData(0))) this.receive(packet); };
      source.connect(processor);
      processor.connect(context.destination);
      this.stopAudio = () => {
        processor.disconnect();
        source.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        void context.close();
      };
    } catch (e) {
      this.set({ link: "off", error: (e as Error).message || String(e) });
    }
  }
  disconnect() {
    clearTimeout(this.silence);
    this.stopAudio?.();
    this.stopAudio = undefined;
    if (this.snapshot.link !== "off") this.set({ link: "off", packet: undefined });
  }
}

/** The app's one Stackmat. */
export const stackmat = new Stackmat();
