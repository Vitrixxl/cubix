/**
 * A reserve of competition scrambles for every event, kept on the device: a scramble is taken at once, even right
 * after the app opens, and replaced in the background. Random-state scramblers (the 4×4's above all) take seconds to
 * build their tables and to search; the reserve is filled one scramble at a time, the event in use first.
 */
export const SCRAMBLE_POOL_KEY = "cubix.scramblePool";
/** Scrambles kept ahead per event. */
export const SCRAMBLE_POOL_SIZE = 5;
/** Scrambles every event gets before any is topped up to the full reserve: none waits behind another's five. */
const READY = 2;

interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function createScramblePool({ storage, events, generate, size = SCRAMBLE_POOL_SIZE, pause = 0 }: {
  storage: Storage;
  /** Every event, in the order to fill them. */
  events: readonly string[];
  generate: (event: string) => Promise<string>;
  size?: number;
  /** Rest between two scrambles (none by default: the search runs in a worker of its own). */
  pause?: number;
}) {
  const pool: Record<string, string[]> = (() => {
    try {
      const saved = JSON.parse(storage.getItem(SCRAMBLE_POOL_KEY) ?? "{}");
      return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
    } catch {
      return {};
    }
  })();
  const save = () => storage.setItem(SCRAMBLE_POOL_KEY, JSON.stringify(pool));
  /** Events asked for since the filling started: served first. */
  const first: string[] = [];
  /** Events whose scrambler failed in this filling (no tab to draw it, a scrambler that could not load): skipped. */
  const failed = new Set<string>();
  let filling: Promise<void> | undefined;

  /** Fills every event's reserve, `priority` first: each event to READY, then each to `size`; one filling at a time. */
  function fill(priority?: string): Promise<void> {
    if (priority && !first.includes(priority)) first.unshift(priority);
    filling ??= (async () => {
      failed.clear();
      try {
        for (;;) {
          const order = [...first, ...events].filter((e) => !failed.has(e)),
            event = [Math.min(READY, size), size].map((level) => order.find((e) => (pool[e]?.length ?? 0) < level)).find(Boolean);
          if (!event) break;
          try {
            const scramble = await generate(event);
            (pool[event] ??= []).push(scramble);
            save();
          } catch {
            failed.add(event);
          }
          await new Promise((resolve) => setTimeout(resolve, pause));
        }
      } finally {
        first.length = 0;
        filling = undefined;
      }
    })();
    return filling;
  }

  return {
    /** A scramble of the reserve, replaced in the background; undefined when the reserve is empty. */
    take(event: string): string | undefined {
      const scramble = pool[event]?.shift();
      if (scramble !== undefined) save();
      void fill(event);
      return scramble;
    },
    fill,
    count: (event: string) => pool[event]?.length ?? 0,
  };
}
