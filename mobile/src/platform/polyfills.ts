import { getRandomValues, randomUUID } from "expo-crypto";

// The shared scramble and local data modules use the Web Crypto surface of the browser.
const globalCrypto = (globalThis as { crypto?: { getRandomValues?: unknown; randomUUID?: unknown } }).crypto;
if (!globalCrypto || typeof globalCrypto.getRandomValues !== "function" || typeof globalCrypto.randomUUID !== "function") {
  (globalThis as { crypto: unknown }).crypto = {
    ...(globalCrypto ?? {}),
    getRandomValues: <T extends ArrayBufferView>(array: T) => getRandomValues(array as unknown as Uint8Array) as unknown as T,
    randomUUID: () => randomUUID(),
  };
}

// The HTTP client relies on AbortSignal.timeout for request deadlines.
const signal = globalThis.AbortSignal as typeof AbortSignal & { timeout?: (ms: number) => AbortSignal };
if (signal && typeof signal.timeout !== "function") {
  signal.timeout = (ms: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error("Request timed out.")), ms);
    return controller.signal;
  };
}
