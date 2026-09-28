import { createMMKV } from "react-native-mmkv";

/** Synchronous, durable key/value storage with the subset of the Web Storage API the shared code uses. */
const mmkv = createMMKV({ id: "cubix" });

export const storage = {
  getItem: (key: string): string | null => mmkv.getString(key) ?? null,
  setItem: (key: string, value: string) => { mmkv.set(key, value); },
  removeItem: (key: string) => { mmkv.remove(key); },
};
