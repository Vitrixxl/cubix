/**
 * On the web the phone app keeps its data where the desktop app does: the same IndexedDB store (desktop/renderer/
 * idbStorage.ts), under the same keys (the shared engine's). A window resized from one app to the other (boot.ts) thus
 * keeps its account, its solves and its settings. The store is read whole before the app starts (start.web.ts), then
 * kept in memory for the synchronous reads and written through.
 */
const values: Record<string, string> = {};
let db: IDBDatabase | null = null;

const request = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
/** Where react-native-mmkv kept the phone app's data on the web before (`<id>\<key>` in localStorage). */
const LEGACY = "cubix\\";

export const storageReady: Promise<void> = (async () => {
  try {
    const open = indexedDB.open("cubix", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("storage");
    db = await request(open);
    const read = db.transaction("storage").objectStore("storage");
    const [keys, stored] = await Promise.all([request(read.getAllKeys()), request(read.getAll())]);
    keys.forEach((key, i) => { values[String(key)] = stored[i]; });
  } catch {
    // No IndexedDB (a private window of some browsers): the data lives in memory and localStorage below.
    db = null;
  }
  // The phone app's former data joins once, without replacing what the desktop app already wrote.
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(LEGACY)) continue;
      const name = key.slice(LEGACY.length), value = localStorage.getItem(key);
      if (value !== null && !(name in values)) write(name, value);
      if (db) localStorage.removeItem(key);
    }
  } catch {}
})();

function write(key: string, value: string | null) {
  if (value === null) delete values[key];
  else values[key] = value;
  if (!db) {
    try { value === null ? localStorage.removeItem(LEGACY + key) : localStorage.setItem(LEGACY + key, value); } catch {}
    return;
  }
  // Transactions on one store complete in the order they were created, so the last write wins.
  const store = db.transaction("storage", "readwrite").objectStore("storage");
  if (value === null) store.delete(key);
  else store.put(value, key);
}

/** Synchronous, durable key/value storage with the subset of the Web Storage API the shared code uses. */
export const storage = {
  getItem: (key: string): string | null => values[key] ?? null,
  setItem: (key: string, value: string) => write(key, value),
  removeItem: (key: string) => write(key, null),
};
