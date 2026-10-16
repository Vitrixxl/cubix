/**
 * The Bluetooth Low Energy link to a smart cube or a smart timer, whatever reaches it: Web Bluetooth in Chromium
 * browsers (the web app, and the phone app on the web), react-native-ble-plx in the Android app
 * (mobile/src/platform/ble.ts). The protocols (cubes.ts, timers.ts) only see this.
 */
import { tr } from "../../i18n";
import { msg } from "../../i18n/msg";

export interface BleLink {
  name: string;
  /** The device's MAC address when the platform tells it (Android); browsers hide it. */
  mac?: string;
  /** The manufacturer data of its advertisements, by company id, when the browser can watch them; null otherwise. */
  advertisement(companies: readonly number[]): Promise<Map<number, Uint8Array> | null>;
  /** Its primary services' UUIDs, in lower case. */
  services(): Promise<string[]>;
  /** Hears a characteristic's notifications; a second call for the same characteristic replaces the listener. */
  subscribe(service: string, characteristic: string, listener: (data: Uint8Array) => void): Promise<void>;
  write(service: string, characteristic: string, data: Uint8Array): Promise<void>;
  read(service: string, characteristic: string): Promise<Uint8Array>;
  /** Heard once each time the connection drops by itself (out of reach, the device asleep). */
  onDrop(listener: () => void): void;
  /** Connects again after a drop: subscriptions are to be made again. */
  reconnect(): Promise<void>;
  close(): void;
}

export interface BleRequest {
  /** Prefixes of the names the devices advertise. */
  names: readonly string[];
  /** Every service the protocols may use. */
  services: readonly string[];
  /** The company ids under which a device may advertise its MAC address. */
  companies: readonly number[];
}
export type BleAdapter = (request: BleRequest) => Promise<BleLink>;

export const NO_BLUETOOTH = msg("This browser has no Bluetooth: use Chrome or Edge"),
  BLUETOOTH_OFF = msg("Bluetooth is off or not allowed"),
  UNSUPPORTED_DEVICE = msg("This device is not supported"),
  WRONG_MAC = msg("Wrong MAC address"),
  NO_DEVICE = msg("No device found: is it on and nearby?");

export interface DeviceNotice {
  title: string;
  description?: string;
  tone: "success" | "info" | "error";
}
/**
 * Tells a device (a smart cube, a smart timer) coming, going out of reach, coming back, gone, or failing to connect:
 * `notify` shows it, as a toast.
 */
export function announceDevice(read: () => { link: string; name: string; error?: string }, subscribe: (listener: () => void) => unknown, notify: (notice: DeviceNotice) => void) {
  let link = read().link,
    wasOn = false;
  subscribe(() => {
    const { link: now, name, error } = read();
    if (now === link) return;
    if (now === "on") notify({ title: tr("{0} connected", { 0: name }), tone: "success" });
    else if (now === "connecting" && wasOn) notify({ title: tr("Reconnecting…"), tone: "info" });
    else if (now === "off" && wasOn) notify({ title: tr("{0} disconnected", { 0: name }), description: error ? tr(error) : undefined, tone: "info" });
    else if (now === "off" && error) notify({ title: tr(error), tone: "error" });
    if (now !== "connecting") wasOn = now === "on";
    link = now;
  });
}

/** The error of a chooser closed without a device: nothing to tell the player. */
export const cancelled = () => Object.assign(new Error("Cancelled"), { name: "AbortError" });
export const isCancel = (error: unknown) => (error as Error)?.name === "AbortError";

/** A 16-bit UUID in full, the others in lower case. */
export const uuid = (id: string) => (/^[0-9a-f]{4}$/i.test(id) ? `0000${id}-0000-1000-8000-00805f9b34fb` : id).toLowerCase();

/** "AA:BB:CC:DD:EE:FF" from six bytes in order; undefined unless six. */
export const macOf = (bytes: ArrayLike<number>) =>
  bytes.length === 6 ? Array.from(bytes, (b) => b.toString(16).padStart(2, "0").toUpperCase()).join(":") : undefined;
/** The six bytes of a MAC address typed in any common way ("aa:bb…", "AA-BB…", "aabbcc…"); null if it is not one. */
export function parseMac(text: string): number[] | null {
  const hex = text.replace(/[\s:-]/g, "");
  return /^[0-9a-f]{12}$/i.test(hex) ? hex.match(/../g)!.map((h) => parseInt(h, 16)) : null;
}

// The few Web Bluetooth types used here (they are not in TypeScript's DOM library).
interface WebCharacteristic extends EventTarget {
  value?: DataView;
  startNotifications(): Promise<unknown>;
  readValue(): Promise<DataView>;
  writeValue(data: BufferSource): Promise<void>;
}
interface WebDevice extends EventTarget {
  name?: string;
  gatt?: {
    connected: boolean;
    connect(): Promise<unknown>;
    disconnect(): void;
    getPrimaryService(id: string): Promise<{ getCharacteristic(id: string): Promise<WebCharacteristic> }>;
    getPrimaryServices(): Promise<{ uuid: string }[]>;
  };
  watchAdvertisements?(options: { signal: AbortSignal }): Promise<void>;
}
type WebBluetooth = {
  getAvailability?(): Promise<boolean>;
  requestDevice(options: object): Promise<WebDevice>;
};

const bytes = (view: DataView) => new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));

/**
 * Web Bluetooth: Chrome, Edge and other Chromium browsers (Android and desktop); Firefox and Safari have none. The
 * browser's own chooser lists the devices; reading the MAC address from advertisements needs
 * chrome://flags/#enable-experimental-web-platform-features, and never works on Linux.
 */
export const webBluetooth: BleAdapter = async ({ names, services, companies }) => {
  const bluetooth = (globalThis.navigator as { bluetooth?: WebBluetooth } | undefined)?.bluetooth;
  if (!bluetooth) throw new Error(NO_BLUETOOTH);
  if ((await bluetooth.getAvailability?.().catch(() => true)) === false) throw new Error(BLUETOOTH_OFF);
  let device: WebDevice;
  try {
    device = await bluetooth.requestDevice({
      filters: names.map((namePrefix) => ({ namePrefix })),
      optionalServices: services,
      optionalManufacturerData: companies,
    });
  } catch (error) {
    const { name, message } = error as Error;
    // Chromium says NotFoundError both for a chooser closed and for a missing adapter.
    if (name === "NotFoundError" && !/adapter|bluetooth/i.test(message)) throw cancelled();
    if (["NotFoundError", "NotAllowedError", "SecurityError", "InvalidStateError"].includes(name)) throw new Error(BLUETOOTH_OFF);
    throw error;
  }
  const gatt = device.gatt!;
  let characteristics = new Map<string, Promise<WebCharacteristic>>();
  const listeners = new Map<string, (data: Uint8Array) => void>(),
    wired = new WeakSet<WebCharacteristic>();
  const characteristic = (service: string, id: string) => {
    const key = uuid(service) + "/" + uuid(id);
    let found = characteristics.get(key);
    if (!found) characteristics.set(key, (found = gatt.getPrimaryService(uuid(service)).then((s) => s.getCharacteristic(uuid(id)))));
    return found;
  };
  let closed = false;
  const drops = new Set<() => void>();
  device.addEventListener("gattserverdisconnected", () => {
    if (!closed) drops.forEach((drop) => drop());
  });
  await gatt.connect().catch(() => {
    throw new Error(NO_DEVICE);
  });
  return {
    name: device.name?.trim() || "Bluetooth",
    async advertisement(ids) {
      // Chromium on Linux and ChromeOS has watchAdvertisements but never calls back.
      const platform = (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform;
      if (!device.watchAdvertisements || /linux|cros|chrome os/i.test(platform)) return null;
      const stop = new AbortController();
      return new Promise((resolve) => {
        const done = (data: Map<number, Uint8Array> | null) => {
          device.removeEventListener("advertisementreceived", heard);
          stop.abort();
          resolve(data);
        };
        // Manufacturer data comes in some advertisements only: the first ones may lack it.
        const heard = (event: Event) => {
          const data = (event as Event & { manufacturerData?: Map<number, DataView> }).manufacturerData;
          const found = new Map([...(data ?? [])].filter(([id]) => ids.includes(id)).map(([id, view]) => [id, bytes(view)]));
          if (found.size) done(found);
        };
        device.addEventListener("advertisementreceived", heard);
        device.watchAdvertisements!({ signal: stop.signal }).catch(() => done(null));
        setTimeout(() => done(null), 5000);
      });
    },
    services: async () => (await gatt.getPrimaryServices()).map((s) => uuid(s.uuid)),
    async subscribe(service, id, listener) {
      const c = await characteristic(service, id),
        key = uuid(service) + "/" + uuid(id);
      if (!wired.has(c)) {
        wired.add(c);
        c.addEventListener("characteristicvaluechanged", (event) => {
          const value = (event.target as WebCharacteristic).value;
          if (value) listeners.get(key)?.(bytes(value));
        });
      }
      listeners.set(key, listener);
      await c.startNotifications();
    },
    write: async (service, id, data) => (await characteristic(service, id)).writeValue(data as Uint8Array<ArrayBuffer>),
    read: async (service, id) => bytes(await (await characteristic(service, id)).readValue()),
    onDrop: (listener) => void drops.add(listener),
    async reconnect() {
      characteristics = new Map();
      await gatt.connect();
    },
    close() {
      closed = true;
      if (gatt.connected) gatt.disconnect();
    },
  };
};
