/**
 * Bluetooth smart timers: the GAN Smart Timer and GAN Halo timers. Their state drives the app's timer as a Stackmat's
 * does (`followTimerDevice`, practiceTimer.ts): each state is told as the Stackmat status it matches, and a stopped
 * timer gives its own time.
 *
 * The protocol as gan-web-bluetooth by Andy Fedotov (MIT) documents it, no code copied: service FFF0, state
 * notifications on FFF5, each 0xFE, its length, a state byte, for a stop the time (minutes, seconds, little-endian
 * milliseconds), and a CRC-16/CCITT-FALSE of all but the first two bytes, little-endian, last.
 *
 * ponytail: the QiYi Smart Timer is left out: its protocol is known from csTimer alone (GPL, no captures to check
 * against). Add it when an open reference with real packets exists.
 */
import { BLUETOOTH_OFF, UNSUPPORTED_DEVICE, type BleAdapter, type BleLink } from "./link";
import type { StackmatPacket, StackmatStatus } from "../stackmat";

const SERVICE = "0000fff0-0000-1000-8000-00805f9b34fb",
  STATE = "0000fff5-0000-1000-8000-00805f9b34fb";

/** CRC-16/CCITT-FALSE: polynomial 0x1021 from 0xFFFF. */
export function crc16ccitt(data: ArrayLike<number>) {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]! << 8;
    for (let j = 0; j < 8; j++) crc = (crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
  }
  return crc;
}

/**
 * GAN timer states, as the Stackmat status they match: 1 get set (ready), 2 hands lifted too soon, 3 running,
 * 4 stopped (with the time), 5 reset, 6 hands on; 7 (finished, right after a stop) and 0 (disconnected) tell nothing.
 */
const STATUS: Record<number, StackmatStatus> = { 1: "A", 2: "L", 3: " ", 4: "S", 5: "I", 6: "C" };

/** A GAN timer message as a Stackmat packet; null for one that is not valid or tells nothing new. */
export function ganTimerPacket(data: Uint8Array): StackmatPacket | null {
  if (data.length < 6 || data[0] !== 0xfe) return null;
  if (crc16ccitt(data.subarray(2, data.length - 2)) !== data[data.length - 2]! + (data[data.length - 1]! << 8)) return null;
  const status = STATUS[data[3]!];
  if (!status) return null;
  const ms = status === "S" && data.length >= 10 ? data[4]! * 60_000 + data[5]! * 1000 + data[6]! + (data[7]! << 8) : 0;
  return { status, ms };
}

export type SmartTimerLink = "off" | "connecting" | "on";
export interface SmartTimerSnapshot {
  link: SmartTimerLink;
  name: string;
  /** Its last state, as a Stackmat's. */
  packet?: StackmatPacket;
  error?: string;
}

/** The connected smart timer: its link and its last state, as it changes. */
export class SmartTimer {
  snapshot: SmartTimerSnapshot = { link: "off", name: "" };
  private listeners = new Set<() => void>();
  private link?: BleLink;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  private set(patch: Partial<SmartTimerSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
  /** Each message heard; exposed for tests. */
  receive = (data: Uint8Array) => {
    const packet = ganTimerPacket(data);
    if (packet) this.set({ packet });
  };
  private async listen(link: BleLink) {
    await link.subscribe(SERVICE, STATE, this.receive);
  }
  async connect(adapter: BleAdapter) {
    this.disconnect();
    this.set({ link: "connecting", name: "", error: undefined, packet: undefined });
    let link: BleLink | undefined;
    try {
      link = await adapter({ names: ["GAN", "gan", "Gan"], services: [SERVICE], companies: [] });
      if (this.snapshot.link !== "connecting") return link.close();
      this.link = link;
      // A GAN cube also answers to "GAN" (Android takes the first device found).
      if (!(await link.services()).includes(SERVICE)) throw new Error(UNSUPPORTED_DEVICE);
      await this.listen(link);
      const current = link;
      link.onDrop(async () => {
        if (this.link !== current) return;
        this.set({ link: "connecting" });
        for (let attempt = 0; attempt < 3 && this.link === current; attempt++) {
          await new Promise((r) => setTimeout(r, 1000 + attempt * 2000));
          try {
            await current.reconnect();
            await this.listen(current);
            if (this.link === current) return this.set({ link: "on" });
          } catch {
            // Not back yet.
          }
        }
        if (this.link === current) {
          this.link = undefined;
          current.close();
          this.set({ link: "off", packet: undefined });
        }
      });
      this.set({ link: "on", name: link.name });
    } catch (error) {
      link?.close();
      if (this.link === link) this.link = undefined;
      const cancel = (error as Error)?.name === "AbortError";
      this.set({ link: "off", error: cancel ? undefined : ((error as Error)?.message ?? BLUETOOTH_OFF) });
    }
  }
  disconnect() {
    const link = this.link;
    this.link = undefined;
    link?.close();
    if (this.snapshot.link !== "off") this.set({ link: "off", packet: undefined });
  }
}

/** The app's one smart timer. */
export const smartTimer = new SmartTimer();
