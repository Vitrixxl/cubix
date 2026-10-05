import { describe, expect, test } from "bun:test";
import { createScramblePool, SCRAMBLE_POOL_KEY } from "../src/client/lib/scramblePool";

const memory = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
};

describe("the reserve of scrambles", () => {
  test("fills every event in the background, the one asked for first, and keeps them on the device", async () => {
    const storage = memory(), order: string[] = [];
    let n = 0;
    const pool = createScramblePool({ storage, events: ["333", "444"], size: 2, pause: 0, generate: async (event) => (order.push(event), `${event}-${++n}`) });
    await pool.fill("444");
    expect(order).toEqual(["444", "444", "333", "333"]);
    expect(JSON.parse(storage.data[SCRAMBLE_POOL_KEY]!)).toEqual({ "444": ["444-1", "444-2"], "333": ["333-3", "333-4"] });
    // Opened again: the scrambles are there at once, and the one taken is replaced.
    const again = createScramblePool({ storage, events: ["333", "444"], size: 2, pause: 0, generate: async (event) => `${event}-new` });
    expect(again.take("444")).toBe("444-1");
    expect(again.count("444")).toBe(1);
    await again.fill();
    expect(again.count("444")).toBe(2);
  });

  test("an empty reserve answers nothing and starts filling; a failing scrambler is left aside", async () => {
    const pool = createScramblePool({ storage: memory(), events: ["clock", "333"], size: 1, pause: 0, generate: async (event) => {
      if (event === "clock") throw new Error("unavailable");
      return "R U";
    } });
    expect(pool.take("333")).toBeUndefined();
    await pool.fill();
    expect(pool.count("333")).toBe(1);
    expect(pool.count("clock")).toBe(0);
  });

  test("a scrambler that failed once is tried again at the next filling", async () => {
    let down = true;
    const pool = createScramblePool({ storage: memory(), events: ["444"], size: 1, pause: 0, generate: async () => {
      if (down) throw new Error("No open tab can draw scrambles.");
      return "Rw U";
    } });
    await pool.fill();
    expect(pool.count("444")).toBe(0);
    down = false;
    await pool.fill();
    expect(pool.count("444")).toBe(1);
  });

  test("a damaged reserve on the device is started afresh", () => {
    const pool = createScramblePool({ storage: memory({ [SCRAMBLE_POOL_KEY]: "{oops" }), events: [], generate: async () => "" });
    expect(pool.count("333")).toBe(0);
  });
});
