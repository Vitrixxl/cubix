import { test, expect } from "bun:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  installUpdate,
  currentRelease,
  rollback,
  validateRelease,
  sha256,
  releaseRequest,
  type Manifest,
} from "../updater";
const keys = generateKeyPairSync("ed25519"),
  publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
function signed(manifest: Manifest) {
  const raw = JSON.stringify(manifest);
  return {
    manifest: raw,
    signature: sign(null, Buffer.from(raw), keys.privateKey).toString("base64"),
  };
}
const manifest = (build: number, text = "hello"): Manifest => ({
  schema: 1,
  target: "linux-x64",
  build,
  commit: "abc",
  files: [
    "app/main.cjs",
    "app/package.json",
    "app/renderer/index.html",
    "runtime/electron",
  ].map((path) => ({
    path,
    sha256: sha256(text),
    size: Buffer.byteLength(text),
    executable: path === "runtime/electron",
  })),
});
test("asset transfers resume after the server's rate limit", async () => {
  let requests = 0;
  const server = Bun.serve({
    port: 0,
    fetch() {
      return requests++ === 0
        ? new Response("limited", {
            status: 429,
            headers: { "Retry-After": "0" },
          })
        : new Response("asset");
    },
  });
  try {
    expect(await (await releaseRequest(server.url)).text()).toBe("asset");
    expect(requests).toBe(2);
  } finally {
    server.stop();
  }
});
test("signed releases reject tampering, path traversal, duplicates and wrong target", () => {
  const m = manifest(1),
    v = signed(m);
  expect(validateRelease(v, publicKey, "linux-x64")).toEqual(m);
  expect(() =>
    validateRelease(
      { ...v, manifest: v.manifest + " " },
      publicKey,
      "linux-x64",
    ),
  ).toThrow();
  expect(() => validateRelease(v, publicKey, "linux-arm64")).toThrow();
  for (const path of [
    "../escape",
    "/tmp/escape",
    "app/../../escape",
    "app\\escape",
    "app/../escape",
    "app/main.cjs",
  ]) {
    const m = manifest(1);
    m.files.push({ ...m.files[0], path });
    expect(() => validateRelease(signed(m), publicKey, "linux-x64")).toThrow();
  }
});
test("atomic installation, offline retention, changed files, rollback and quarantine", async () => {
  const base = await mkdtemp(join(tmpdir(), "cubix-update-"));
  let release = signed(manifest(1)),
    body = "hello",
    downloads = 0,
    fail = false;
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      if (new URL(req.url).pathname.includes("/releases/"))
        return Response.json(release);
      downloads++;
      return fail ? new Response("bad") : new Response(body);
    },
  });
  const options = {
    base,
    origin: server.url.origin,
    publicKey,
    target: "linux-x64",
  };
  try {
    const first = await installUpdate(options);
    expect(first?.manifest.build).toBe(1);
    expect(
      await readFile(
        join(base, "releases", first!.id, "runtime/electron"),
        "utf8",
      ),
    ).toBe("hello");
    const before = downloads;
    release = signed(manifest(2));
    const second = await installUpdate(options);
    expect(second?.manifest.build).toBe(2);
    expect(downloads).toBe(before);
    release = signed(manifest(3, "updated"));
    body = "updated";
    fail = true;
    await expect(installUpdate(options)).rejects.toThrow();
    expect((await currentRelease(base))?.id).toBe(second?.id);
    fail = false;
    const third = await installUpdate(options);
    expect(third?.manifest.build).toBe(3);
    expect((await rollback(base, third!.id))?.id).toBe(second?.id);
    expect((await installUpdate(options))?.id).toBe(second?.id);
    server.stop();
    await expect(installUpdate(options)).rejects.toThrow();
    expect((await currentRelease(base))?.id).toBe(second?.id);
  } finally {
    server.stop();
    await rm(base, { recursive: true, force: true });
  }
});

test("only connection failures count as being offline", async () => {
  const { isOfflineError } = await import("../updater");
  const refused = await fetch("http://127.0.0.1:9", { signal: AbortSignal.timeout(2000) }).then(() => null, (e) => e);
  expect(isOfflineError(refused)).toBe(true);
  expect(isOfflineError(Object.assign(new Error("The operation timed out"), { name: "TimeoutError" }))).toBe(true);
  expect(isOfflineError(Object.assign(new Error("getaddrinfo ENOTFOUND cubix.example"), { code: "ENOTFOUND" }))).toBe(true);
  expect(isOfflineError(new Error("Release server: 503"))).toBe(false);
  expect(isOfflineError(new Error("Invalid release signature"))).toBe(false);
  expect(isOfflineError(new Error("Download integrity check failed"))).toBe(false);
  expect(isOfflineError(null)).toBe(false);
});

test("assets stream with a byte progress and an inactivity deadline instead of a total one", async () => {
  const { fetchAsset } = await import("../updater");
  const body = Buffer.alloc(300000, 7);
  let stall = false;
  const server = Bun.serve({ port: 0, fetch() {
    const stream = new ReadableStream({ async start(controller) {
      for (let offset = 0; offset < body.length; offset += 100000) {
        controller.enqueue(body.subarray(offset, offset + 100000));
        await Bun.sleep(stall ? 400 : 60);
      }
      controller.close();
    } });
    return new Response(stream);
  } });
  try {
    const file = { size: body.length, sha256: sha256(body) };
    const seen: number[] = [];
    // Slower than a whole-transfer deadline of 100 ms, yet every chunk arrives within the idle window.
    const bytes = await fetchAsset(server.url, file, { onProgress: (b) => seen.push(b), idleTimeout: 250 });
    expect(bytes.equals(body)).toBe(true);
    expect(seen.at(-1)).toBe(body.length);
    expect(seen.length).toBeGreaterThanOrEqual(3);
    stall = true;
    const stalled = await fetchAsset(server.url, file, { idleTimeout: 150 }).then(() => null, (e) => e);
    expect(stalled?.name).toBe("TimeoutError");
    await expect(fetchAsset(server.url, { ...file, sha256: "0".repeat(64) }, { idleTimeout: 2000 })).rejects.toThrow("integrity");
  } finally { server.stop(true); }
});

test("the announced launcher binary is validated, then installed in place by the application", async () => {
  const { installLauncherBinary } = await import("../updater");
  const binary = Buffer.from("#!/bin/sh\necho new launcher\n");
  const launcher = { sha256: sha256(binary), size: binary.length };
  expect(validateRelease(signed({ ...manifest(1), launcher }), publicKey, "linux-x64").launcher).toEqual(launcher);
  expect(() => validateRelease(signed({ ...manifest(1), launcher: { sha256: "zz", size: 1 } } as any), publicKey, "linux-x64")).toThrow("launcher asset");
  const base = await mkdtemp(join(tmpdir(), "cubix-launcher-binary-"));
  const server = Bun.serve({ port: 0, fetch: (req) => new URL(req.url).pathname.endsWith(launcher.sha256) ? new Response(binary) : new Response("missing", { status: 404 }) });
  try {
    await writeFile(join(base, "cubix"), "old", { mode: 0o755 });
    expect(await installLauncherBinary(base, { ...manifest(1), launcher }, server.url.origin)).toBe(true);
    expect((await readFile(join(base, "cubix"))).equals(binary)).toBe(true);
    expect(((await import("node:fs/promises")).stat(join(base, "cubix")).then((s) => s.mode & 0o755))).resolves.toBe(0o755);
    // Already current: nothing is fetched again.
    expect(await installLauncherBinary(base, { ...manifest(1), launcher }, "http://127.0.0.1:9")).toBe(false);
    // Releases without an announced binary leave the installed launcher alone.
    expect(await installLauncherBinary(base, manifest(1), server.url.origin)).toBe(false);
  } finally { server.stop(true); await rm(base, { recursive: true, force: true }); }
});

test("the launcher binary download resumes across sessions and survives servers without Range", async () => {
  const { downloadAssetToFile, installLauncherBinary } = await import("../updater");
  const { stat } = await import("node:fs/promises");
  const body = Buffer.alloc(300000);
  for (let i = 0; i < body.length; i++) body[i] = (i * 7) & 0xff;
  const file = { size: body.length, sha256: sha256(body) };
  let stallAfter = 120000, ranges: string[] = [], honourRange = true;
  const server = Bun.serve({ port: 0, fetch(req) {
    const range = req.headers.get("range"); if (range) ranges.push(range);
    const offset = honourRange && range ? Number(range.slice("bytes=".length, -1)) : 0;
    const stream = new ReadableStream({ async start(controller) {
      for (let at = offset; at < body.length; at += 50000) {
        if (at >= stallAfter) { await Bun.sleep(600); }
        controller.enqueue(body.subarray(at, at + 50000));
        await Bun.sleep(5);
      }
      controller.close();
    } });
    return new Response(stream, { status: offset ? 206 : 200, headers: offset ? { "content-range": `bytes ${offset}-${body.length - 1}/${body.length}` } : {} });
  } });
  const base = await mkdtemp(join(tmpdir(), "cubix-resume-"));
  const path = join(base, "cubix");
  try {
    // First session: the transfer stalls; the partial file stays for next time.
    const stalled = await downloadAssetToFile(server.url, file, path, { idleTimeout: 200 }).then(() => null, (e) => e);
    expect(stalled?.name).toBe("TimeoutError");
    const partial = (await stat(path + ".part")).size;
    expect(partial).toBeGreaterThan(0); expect(partial).toBeLessThan(body.length);
    // Second session resumes from there and only fetches the rest.
    stallAfter = Infinity;
    await downloadAssetToFile(server.url, file, path, { idleTimeout: 2000, mode: 0o755 });
    expect(ranges).toEqual([`bytes=${partial}-`]);
    expect((await readFile(path)).equals(body)).toBe(true);
    expect((await stat(path)).mode & 0o777).toBe(0o755);
    expect(await Bun.file(path + ".part").exists()).toBe(false);
    // A server that ignores Range answers 200: the leftover part is thrown away and the whole file re-read.
    honourRange = false;
    await writeFile(path + ".part", body.subarray(0, 1000));
    await downloadAssetToFile(server.url, file, join(base, "again"), { idleTimeout: 2000 });
    expect((await readFile(join(base, "again"))).equals(body)).toBe(true);
    // The application entry point uses the same path for the announced launcher.
    await writeFile(path, "old");
    const manifestWithLauncher = { ...manifest(1), launcher: file };
    const origin = server.url.origin;
    const assetServer = Bun.serve({ port: 0, fetch: (req) => fetch(new URL(new URL(req.url).pathname.endsWith(file.sha256) ? "/" : "/missing", origin), { headers: req.headers }) });
    try {
      expect(await installLauncherBinary(base, manifestWithLauncher, assetServer.url.origin)).toBe(true);
      expect((await readFile(path)).equals(body)).toBe(true);
    } finally { assetServer.stop(true); }
  } finally { server.stop(true); await rm(base, { recursive: true, force: true }); }
});
