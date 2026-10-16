import { PermissionsAndroid, Platform } from "react-native";
import { BleManager, type Device, type Subscription } from "react-native-ble-plx";

import { BLUETOOTH_OFF, NO_DEVICE, uuid, type BleAdapter } from "../../../src/client/lib/bluetooth/link";

/**
 * Bluetooth on Android (react-native-ble-plx), as the web's Web Bluetooth (src/client/lib/bluetooth/link.ts): there is
 * no chooser, so the first device found whose name the protocols know is taken. Android gives its MAC address
 * (`id`), which the encrypted cubes need. A larger MTU lets the QiYi cubes send their 96-byte messages whole.
 */
let manager: BleManager | undefined;
const ble = () => (manager ??= new BleManager());

const toBase64 = (data: Uint8Array) => btoa(String.fromCharCode(...data));
const fromBase64 = (text: string | null | undefined) => Uint8Array.from(atob(text ?? ""), (c) => c.charCodeAt(0));

/** Asks for the permissions Bluetooth needs: scanning and connecting from Android 12, the location before. */
async function allowed() {
  if (Platform.OS !== "android") return true;
  const wanted = Number(Platform.Version) >= 31
    ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
    : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const answers = await PermissionsAndroid.requestMultiple(wanted);
  return wanted.every((p) => answers[p] === PermissionsAndroid.RESULTS.GRANTED);
}

/** The first device advertising one of these names, within 15 seconds. */
const find = (names: readonly string[]) =>
  new Promise<Device>((resolve, reject) => {
    const done = (error: Error | null, device?: Device) => {
      clearTimeout(timer);
      void ble().stopDeviceScan().catch(() => {});
      if (device) resolve(device);
      else reject(error ?? new Error(NO_DEVICE));
    };
    const timer = setTimeout(() => done(null), 15_000);
    void ble().startDeviceScan(null, null, (error, device) => {
      if (error) return done(new Error(BLUETOOTH_OFF));
      const name = (device?.name ?? device?.localName ?? "").trim();
      if (device && names.some((prefix) => name.startsWith(prefix))) done(null, device);
    });
  });

export const bleAdapter: BleAdapter = async ({ names }) => {
  if (!(await allowed())) throw new Error(BLUETOOTH_OFF);
  // An app installed before Bluetooth came (its JavaScript updated since) has no native module: no Bluetooth then.
  // The adapter's state is Unknown for a moment after the manager starts.
  let state = "Unknown";
  for (let i = 0; i < 20 && (state === "Unknown" || state === "Resetting"); i++) {
    state = await Promise.resolve().then(() => ble().state()).catch(() => "Unsupported");
    if (state === "Unknown") await new Promise((r) => setTimeout(r, 100));
  }
  if (state !== "PoweredOn") throw new Error(BLUETOOTH_OFF);
  const found = await find(names),
    id = found.id,
    name = (found.name ?? found.localName ?? "Bluetooth").trim();
  const open = async () => {
    await ble().connectToDevice(id, { requestMTU: 517 });
    await ble().discoverAllServicesAndCharacteristicsForDevice(id);
  };
  await open();
  const subscriptions = new Map<string, Subscription>(),
    drops = new Set<() => void>();
  let closed = false;
  const watch = ble().onDeviceDisconnected(id, () => {
    if (!closed) drops.forEach((drop) => drop());
  });
  return {
    name,
    mac: id,
    advertisement: async () => null,
    services: async () => (await ble().servicesForDevice(id)).map((s) => uuid(s.uuid)),
    async subscribe(service, characteristic, listener) {
      const key = uuid(service) + "/" + uuid(characteristic);
      subscriptions.get(key)?.remove();
      subscriptions.set(
        key,
        ble().monitorCharacteristicForDevice(id, uuid(service), uuid(characteristic), (error, c) => {
          if (!error && c?.value) listener(fromBase64(c.value));
        }),
      );
    },
    async write(service, characteristic, data) {
      const value = toBase64(data);
      await ble()
        .writeCharacteristicWithResponseForDevice(id, uuid(service), uuid(characteristic), value)
        .catch(() => ble().writeCharacteristicWithoutResponseForDevice(id, uuid(service), uuid(characteristic), value));
    },
    read: async (service, characteristic) => fromBase64((await ble().readCharacteristicForDevice(id, uuid(service), uuid(characteristic))).value),
    onDrop: (listener) => void drops.add(listener),
    async reconnect() {
      subscriptions.forEach((s) => s.remove());
      subscriptions.clear();
      await open();
    },
    close() {
      closed = true;
      watch.remove();
      subscriptions.forEach((s) => s.remove());
      void ble().cancelDeviceConnection(id).catch(() => {});
    },
  };
};
