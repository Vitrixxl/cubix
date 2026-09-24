import { expect, test } from "bun:test";
import { apiOrigin, PRODUCTION_API_ORIGIN } from "../src/lib/apiOrigin";
import { validateProductionUpdate } from "../scripts/validate-update";
const production = { expoClient: { updates: { url: `${PRODUCTION_API_ORIGIN}/api/mobile/updates/manifest` } } };

test("API uses the running update config even when a previous build's environment was local", () => {
  const previous = process.env.EXPO_PUBLIC_API_ORIGIN;
  process.env.EXPO_PUBLIC_API_ORIGIN = "http://127.0.0.1:14740";
  try {
    expect(apiOrigin(production.expoClient.updates.url)).toBe(PRODUCTION_API_ORIGIN);
    expect(apiOrigin()).toBe(PRODUCTION_API_ORIGIN);
    expect(apiOrigin("http://127.0.0.1:14740/api/mobile/updates/manifest")).toBe("http://127.0.0.1:14740");
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_API_ORIGIN;
    else process.env.EXPO_PUBLIC_API_ORIGIN = previous;
  }
});

test("publication checks compiled bytes, not just the correct-looking update metadata", () => {
  expect(() => validateProductionUpdate(production, Buffer.from(PRODUCTION_API_ORIGIN))).not.toThrow();
  expect(() => validateProductionUpdate(production, Buffer.from("http://127.0.0.1:14740"))).toThrow();
  expect(() => validateProductionUpdate(production, Buffer.from(`${PRODUCTION_API_ORIGIN}\x00http://127.0.0.1:14740\x00`))).toThrow();
  expect(() => validateProductionUpdate({ expoClient: { updates: { url: "http://localhost:14740/api/mobile/updates/manifest" } } }, Buffer.from(PRODUCTION_API_ORIGIN))).toThrow();
});
