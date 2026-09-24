import { test, expect } from "bun:test";
import { createRustApi, openDb } from "./backend";
import { sha256 } from "../desktop/updater";
test("desktop API requires admin auth, verifies asset hashes and publishes only complete releases", async () => {
  const app = createRustApi(openDb().path),
    request = (path: string, method = "GET", body?: BodyInit, auth = true) =>
      app.handle(
        new Request("http://test/api/desktop" + path, {
          method,
          headers: {
            ...(auth
              ? { Authorization: "Bearer synthetic-admin-test-password" }
              : {}),
            "Content-Type": "application/json",
          },
          body,
        }),
      );
  expect((await request("/releases/linux-x64")).status).toBe(404);
  const bytes = "release-asset",
    hash = sha256(bytes);
  expect((await request("/assets/" + hash, "PUT", bytes, false)).status).toBe(
    401,
  );
  expect((await request("/assets/" + hash, "PUT", "invalid")).status).toBe(422);
  const manifest = JSON.stringify({
      schema: 1,
      target: "linux-x64",
      build: 1,
      files: [
        {
          path: "app/main.cjs",
          sha256: hash,
          size: bytes.length,
          executable: false,
        },
      ],
    }),
    envelope = JSON.stringify({
      manifest,
      signature: "test-signature-client-verifies-it",
    });
  expect((await request("/releases/linux-x64", "PUT", envelope)).status).toBe(
    422,
  );
  expect((await request("/assets/" + hash, "PUT", bytes)).status).toBe(200);
  expect(await (await request("/assets/" + hash)).text()).toBe(bytes);
  expect((await request("/assets/" + hash, "HEAD")).status).toBe(200);
  // Immutable assets resume: the desktop app fetches the launcher binary across sessions.
  const resumed = await app.handle(new Request("http://test/api/desktop/assets/" + hash, { headers: { Range: "bytes=8-" } }));
  expect(resumed.status).toBe(206);
  expect(resumed.headers.get("content-range")).toBe(`bytes 8-${bytes.length - 1}/${bytes.length}`);
  expect(resumed.headers.get("accept-ranges")).toBe("bytes");
  expect(await resumed.text()).toBe(bytes.slice(8));
  // Ranges the server does not support fall back to the whole asset.
  const whole = await app.handle(new Request("http://test/api/desktop/assets/" + hash, { headers: { Range: "bytes=0-3" } }));
  expect(whole.status).toBe(200);
  expect(await whole.text()).toBe(bytes);
  expect(
    (await request("/releases/linux-x64", "PUT", envelope, false)).status,
  ).toBe(401);
  expect((await request("/releases/linux-x64", "PUT", envelope)).status).toBe(
    200,
  );
  expect(await (await request("/releases/linux-x64")).json()).toEqual(
    JSON.parse(envelope),
  );
  expect((await request("/releases/unknown", "PUT", envelope)).status).toBe(
    422,
  );
});
