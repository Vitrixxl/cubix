import { mock } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Replace every lucide-react-native export with a host node named after it (`Check` renders `<Check>`), so a page
 * can import any icon without the test listing them. Bun needs the export names up front: they are read from the
 * package's ES entry.
 */
export function mockLucide() {
  const root = resolve(import.meta.dir, "../node_modules/lucide-react-native");
  const entry = readFileSync(resolve(root, JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).module), "utf8");
  const names = [...entry.matchAll(/export \{([^}]*)\}/g)].flatMap(([, list]) => list!.split(",").map(spec => spec.trim().split(/\s+/).pop()!));
  mock.module("lucide-react-native", () => Object.fromEntries(names.map(name => [name, name])));
}
