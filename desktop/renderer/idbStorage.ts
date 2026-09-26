import type { EngineStorage } from "../engine/core";

const request = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

/** Preferences and the local-first workspace, kept in memory for the engine's synchronous reads
 * and written through to IndexedDB, which has room for years of solves. */
export async function openStorage(failed: (message: string) => void): Promise<EngineStorage & { importAll(values: Record<string, string>): Promise<void> }> {
  const open = indexedDB.open("cubix", 1);
  open.onupgradeneeded = () => open.result.createObjectStore("storage");
  const db = await request(open);
  const read = db.transaction("storage").objectStore("storage");
  const [keys, stored] = await Promise.all([request(read.getAllKeys()), request(read.getAll())]);
  const values: Record<string, string> = {};
  keys.forEach((key, i) => { values[String(key)] = stored[i]; });
  // Transactions on one store complete in the order they were created, so the last write wins.
  const write = (action: (store: IDBObjectStore) => void) => {
    const transaction = db.transaction("storage", "readwrite");
    action(transaction.objectStore("storage"));
    transaction.onerror = () => failed("Your device storage is full or unavailable. This change could not be saved.");
    return new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error); });
  };
  return {
    getItem: key => values[key] ?? null,
    setItem(key, value) { values[key] = value; void write(store => store.put(value, key)).catch(() => {}); },
    removeItem(key) { delete values[key]; void write(store => store.delete(key)).catch(() => {}); },
    all: () => ({ ...values }),
    async importAll(next) {
      Object.assign(values, next);
      await write(store => { for (const [key, value] of Object.entries(next)) store.put(value, key); });
    },
  };
}
