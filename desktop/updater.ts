/** Signed, content-addressed releases. Downloads never modify the running release. */
import { setTimeout as sleep } from "node:timers/promises";
import { createHash, createPublicKey, verify } from "node:crypto";
import { createReadStream } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
  chmod,
  copyFile,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join, resolve, sep } from "node:path";
export type ReleaseFile = {
  path: string;
  sha256: string;
  size: number;
  executable: boolean;
};
/** The launcher binary as published: its raw digest and size, and when available a gzip variant that halves the download. */
export type LauncherAsset = { sha256: string; size: number; gzip?: { sha256: string; size: number } };
export type Manifest = {
  schema: 1;
  target: string;
  build: number;
  commit: string;
  files: ReleaseFile[];
  /** The launcher binary is announced rather than listed: the launcher installs it after the release
   * files (resumable, compressed), and the application retries in the background if that failed. */
  launcher?: LauncherAsset;
};
export type SignedRelease = { manifest: string; signature: string };
export const sha256 = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
/** Large releases may span the server's per-minute request allowance. */
export async function releaseRequest(
  url: string | URL,
  options: RequestInit = {},
  timeout = 180000,
) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(timeout),
      redirect: "error",
    });
    if (response.status !== 429 || attempt >= 3) return response;
    const retry = response.headers.get("retry-after");
    const delay =
      retry && Number.isFinite(Number(retry)) ? Number(retry) * 1000 : 60000;
    await response.body?.cancel();
    await sleep(Math.min(180000, Math.max(1000, delay)));
  }
}
/**
 * Whether an update failure means the server could not be reached at all: no network, DNS failure,
 * refused or dropped connection, or a timeout. The launcher then opens the installed release offline.
 * HTTP errors, invalid signatures and damaged downloads are not connection problems.
 */
export function isOfflineError(error: unknown): boolean {
  const failure = error as { code?: unknown; name?: unknown; message?: unknown; cause?: unknown } | null;
  if (!failure || typeof failure !== "object") return false;
  const codes = ["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "ENETUNREACH", "ENETDOWN", "EHOSTUNREACH", "EPIPE",
    "ConnectionRefused", "ConnectionClosed", "FailedToOpenSocket", "DNSException", "UNABLE_TO_CONNECT"];
  if (typeof failure.code === "string" && codes.includes(failure.code)) return true;
  if (failure.name === "TimeoutError" || failure.name === "AbortError" || failure.name === "ConnectTimeoutError") return true;
  if (failure.cause && failure.cause !== error && isOfflineError(failure.cause)) return true;
  return /fetch failed|unable to connect|network|socket|connection|timed? ?out/i.test(String(failure.message ?? ""));
}
export function validateRelease(
  signed: SignedRelease,
  publicKey: string,
  target: string,
): Manifest {
  if (
    typeof signed?.manifest !== "string" ||
    signed.manifest.length > 4 * 1024 * 1024 ||
    typeof signed.signature !== "string" ||
    !verify(
      null,
      Buffer.from(signed.manifest),
      createPublicKey(publicKey),
      Buffer.from(signed.signature, "base64"),
    )
  )
    throw Error("Invalid release signature");
  const v = JSON.parse(signed.manifest) as Manifest;
  if (
    v.schema !== 1 ||
    v.target !== target ||
    !Number.isSafeInteger(v.build) ||
    v.build < 1 ||
    !Array.isArray(v.files) ||
    !v.files.length ||
    v.files.length > 20000
  )
    throw Error("Invalid release manifest");
  const seen = new Set<string>();
  let total = 0;
  for (const f of v.files) {
    if (
      typeof f.path !== "string" ||
      !f.path ||
      f.path.length > 400 ||
      f.path.startsWith("/") ||
      f.path.includes("\\") ||
      f.path.includes(":") ||
      f.path
        .split("/")
        .some(
          (p) =>
            !p || p === "." || p === ".." || p.endsWith(".") || p.endsWith(" "),
        ) ||
      !/^[a-f0-9]{64}$/.test(f.sha256) ||
      !Number.isSafeInteger(f.size) ||
      f.size < 0 ||
      f.size > 512 * 1024 * 1024 ||
      typeof f.executable !== "boolean" ||
      seen.has(f.path.toLowerCase())
    )
      throw Error("Unsafe release file");
    seen.add(f.path.toLowerCase());
    total += f.size;
  }
  const validAsset = (asset: unknown) =>
    typeof asset === "object" && asset !== null &&
    /^[a-f0-9]{64}$/.test((asset as LauncherAsset).sha256) &&
    Number.isSafeInteger((asset as LauncherAsset).size) &&
    (asset as LauncherAsset).size >= 1 && (asset as LauncherAsset).size <= 512 * 1024 * 1024;
  if (v.launcher !== undefined && (!validAsset(v.launcher) || (v.launcher.gzip !== undefined && !validAsset(v.launcher.gzip))))
    throw Error("Invalid launcher asset");
  if (
    total > 2 * 1024 ** 3 ||
    !seen.has("app/main.cjs") ||
    !seen.has("app/package.json") ||
    !seen.has("app/renderer/index.html")
  )
    throw Error("Incomplete release");
  return v;
}
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/**
 * Download one content-addressed asset and verify its signed size and digest. The deadline is on
 * inactivity, not on the whole transfer, so a large file on a slow connection still arrives.
 * Plain fetch only: this also runs inside the Electron application, outside Bun.
 */
export async function fetchAsset(
  url: string | URL,
  file: { size: number; sha256: string },
  { onProgress = () => {}, idleTimeout = 60000 }: { onProgress?: (bytes: number) => void; idleTimeout?: number } = {},
): Promise<Buffer> {
  const controller = new AbortController();
  let timer = setTimeout(() => controller.abort(), idleTimeout);
  const touch = () => { clearTimeout(timer); timer = setTimeout(() => controller.abort(), idleTimeout); };
  try {
    let response: Response;
    for (let attempt = 0; ; attempt++) {
      response = await fetch(url, { signal: controller.signal, redirect: "error" });
      if (response.status !== 429 || attempt >= 3) break;
      const retry = Number(response.headers.get("retry-after"));
      await response.body?.cancel();
      await pause(Math.min(180000, Math.max(1000, Number.isFinite(retry) && retry > 0 ? retry * 1000 : 60000)));
      touch();
    }
    if (!response.ok || !response.body) throw Error(`Download failed: ${response.status}`);
    const hash = createHash("sha256");
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      if (size > file.size) throw Error("Download larger than signed size");
      hash.update(chunk);
      chunks.push(Buffer.from(chunk));
      touch();
      onProgress(size);
    }
    if (size !== file.size || hash.digest("hex") !== file.sha256)
      throw Error("Download integrity check failed");
    return Buffer.concat(chunks);
  } catch (error) {
    if (controller.signal.aborted)
      throw Object.assign(Error("The download stalled."), { name: "TimeoutError", cause: error });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
/**
 * Stream one asset to `path` on disk. A `.part` file left by an earlier session is resumed with a
 * `Range` request when the server honours it (206), otherwise the download restarts. The signed digest
 * is checked over the whole file before it replaces `path`. A stall keeps the partial file for next time.
 */
export async function downloadAssetToFile(
  url: string | URL,
  file: { size: number; sha256: string },
  path: string,
  { onProgress = () => {}, idleTimeout = 120000, mode = 0o644 }: { onProgress?: (bytes: number) => void; idleTimeout?: number; mode?: number } = {},
): Promise<void> {
  const partial = `${path}.part`;
  let offset = 0;
  try {
    offset = (await stat(partial)).size;
    if (offset >= file.size) offset = 0;
  } catch {}
  const controller = new AbortController();
  let timer = setTimeout(() => controller.abort(), idleTimeout);
  const touch = () => { clearTimeout(timer); timer = setTimeout(() => controller.abort(), idleTimeout); };
  let discard = false;
  try {
    const response = await fetch(url, {
      signal: controller.signal, redirect: "error",
      headers: offset ? { range: `bytes=${offset}-` } : {},
    });
    if (!response.ok || !response.body) throw Error(`Download failed: ${response.status}`);
    if (response.status !== 206) offset = 0;
    const handle = await open(partial, offset ? "a" : "w");
    let size = offset;
    try {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        size += chunk.length;
        if (size > file.size) { discard = true; throw Error("Download larger than signed size"); }
        await handle.write(chunk);
        touch();
        onProgress(size);
      }
    } finally { await handle.close(); }
    if (size !== file.size) { discard = true; throw Error("Download incomplete"); }
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(partial)) hash.update(chunk as Buffer);
    if (hash.digest("hex") !== file.sha256) { discard = true; throw Error("Download integrity check failed"); }
    await chmod(partial, mode);
    await rename(partial, path);
  } catch (error) {
    if (discard) await rm(partial, { force: true });
    if (controller.signal.aborted)
      throw Object.assign(Error("The download stalled."), { name: "TimeoutError", cause: error });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
/** Exclusive lock file holding the owner's PID; a lock left by a dead process is taken over. */
export async function acquireLock(path: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = await open(path, "wx", 0o600);
      await fd.writeFile(String(process.pid));
      await fd.close();
      return true;
    } catch (error: any) {
      if (error.code !== "EEXIST") throw error;
      const pid = Number(await readFile(path, "utf8").catch(() => ""));
      try {
        if (!pid) return false; // Another launcher may still be writing its PID.
        process.kill(pid, 0);
        return false;
      } catch (error: any) {
        if (error.code !== "ESRCH") throw error;
        await rm(path, { force: true });
      }
    }
  }
  return false;
}
async function json(path: string) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}
export async function currentRelease(
  base: string,
): Promise<{ id: string; manifest: Manifest } | null> {
  const pointer = await json(join(base, "current.json"));
  if (!pointer || !/^[a-f0-9]{64}$/.test(pointer.id)) return null;
  const manifest = await json(
    join(base, "releases", pointer.id, "release.json"),
  );
  return manifest ? { id: pointer.id, manifest } : null;
}
export async function installUpdate({
  base,
  origin,
  publicKey,
  target,
  onProgress = () => {},
  onUpdate = async () => {},
  launcherBinary = false,
  onWarning = () => {},
  onPercent = () => {},
}: {
  base: string;
  origin: string;
  publicKey: string;
  target: string;
  onProgress?: (text: string) => void;
  /** Called once, before the first download, when a newer release really has files to fetch. */
  onUpdate?: () => void | Promise<void>;
  /** Also bring the announced launcher binary up to date, after the release files (the launcher itself does this). */
  launcherBinary?: boolean;
  /** A launcher binary that could not be fetched does not fail the update: the release is current already. */
  onWarning?: (message: string) => void;
  /** Download progress of the whole update, 0–100, alongside the `onProgress` text. */
  onPercent?: (percent: number) => void;
}) {
  const url = new URL(origin);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    )
  )
    throw Error("Updates require HTTPS");
  const current = await currentRelease(base);
  onProgress("Recherche de mises à jour…");
  const response = await fetch(
    new URL(`/api/desktop/releases/${target}`, url),
    { signal: AbortSignal.timeout(5000), redirect: "error" },
  );
  if (response.status === 404 || response.status === 204) return current;
  if (!response.ok) throw Error(`Release server: ${response.status}`);
  const signed = (await response.json()) as SignedRelease,
    manifest = validateRelease(signed, publicKey, target),
    id = sha256(signed.manifest);
  const binaryPath = join(base, process.platform === "win32" ? "cubix.exe" : "cubix");
  const binaryOutdated = async () => {
    if (!launcherBinary || !manifest.launcher) return false;
    try { return sha256(await readFile(binaryPath)) !== manifest.launcher.sha256; } catch { return true; }
  };
  if (
    current &&
    (current.id === id || current.manifest.build >= manifest.build)
  ) {
    // Same release, but a launcher binary left behind by an earlier interrupted download.
    if (await binaryOutdated()) {
      await onUpdate();
      let reported = -1;
      const asset = manifest.launcher!.gzip ?? manifest.launcher!;
      try {
        await installLauncherBinary(base, manifest, origin, bytes => {
          const percent = Math.min(100, Math.floor((bytes / asset.size) * 100));
          if (percent !== reported) {
            reported = percent;
            onProgress(`Téléchargement de la mise à jour… ${percent} %`);
            onPercent(percent);
          }
        });
      } catch (error) { onWarning(`Launcher binary: ${String(error)}`); }
    }
    return current;
  }
  // A previously failed release stays quarantined until a different release is published.
  const failed = await json(join(base, "failed.json"));
  if (failed?.id === id) return current;
  const release = join(base, "releases", id),
    stage = join(base, "releases", `.staging-${process.pid}`);
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  try {
    const existing = new Map(current?.manifest.files.map((f) => [f.path, f]));
    // Unchanged files are copied from the installed release; the rest is downloaded with a
    // progress that follows bytes, not file counts, since a release is a few large files.
    const pending: ReleaseFile[] = [];
    for (const f of manifest.files) {
      const path = resolve(stage, f.path);
      if (!path.startsWith(resolve(stage) + sep))
        throw Error("Unsafe release path");
      await mkdir(resolve(path, ".."), { recursive: true });
      const old = existing.get(f.path);
      let copied = false;
      if (current && old?.sha256 === f.sha256) {
        try {
          const oldPath = join(base, "releases", current.id, f.path);
          if (sha256(await readFile(oldPath)) === f.sha256) {
            await copyFile(oldPath, path);
            copied = true;
          }
        } catch {}
      }
      if (copied) await chmod(path, f.executable ? 0o755 : 0o644);
      else pending.push(f);
    }
    // The launcher binary counts in the same bar, so the bar tells the truth about the whole update.
    const binary = await binaryOutdated();
    const binaryAsset = binary ? manifest.launcher!.gzip ?? manifest.launcher! : null;
    const total = pending.reduce((sum, f) => sum + f.size, 0) + (binaryAsset?.size ?? 0);
    let received = 0, reported = -1;
    const report = (bytes: number) => {
      const percent = total ? Math.min(100, Math.floor(((received + bytes) / total) * 100)) : 100;
      if (percent === reported) return;
      reported = percent;
      onProgress(`Téléchargement de la mise à jour… ${percent} %`);
      onPercent(percent);
    };
    if (pending.length || binaryAsset) {
      await onUpdate();
      report(0);
    }
    for (const f of pending) {
      const bytes = await fetchAsset(new URL(`/api/desktop/assets/${f.sha256}`, url), f, { onProgress: report });
      received += f.size;
      const path = resolve(stage, f.path);
      await writeFile(path, bytes);
      await chmod(path, f.executable ? 0o755 : 0o644);
    }
    await writeFile(join(stage, "release.json"), JSON.stringify(manifest));
    await writeFile(join(stage, "signed-release.json"), JSON.stringify(signed));
    await rm(release, { recursive: true, force: true });
    await rename(stage, release);
    // The pointer is committed only after the complete release has been verified and installed.
    if (current)
      await writeFile(
        join(base, "previous.json"),
        JSON.stringify({ id: current.id }),
      );
    await setCurrent(base, id);
    if (binaryAsset) {
      // After the release is current: an interrupted binary download resumes at the next start.
      try {
        await installLauncherBinary(base, manifest, origin, report);
        received += binaryAsset.size;
        report(0);
      } catch (error) { onWarning(`Launcher binary: ${String(error)}`); }
    }
    return { id, manifest };
  } catch (e) {
    await rm(stage, { recursive: true, force: true });
    throw e;
  }
}
export async function setCurrent(base: string, id: string) {
  await mkdir(base, { recursive: true });
  const temp = join(base, `current-${process.pid}.tmp`);
  await writeFile(temp, JSON.stringify({ id }));
  await rename(temp, join(base, "current.json"));
}
export async function rollback(base: string, failedId: string) {
  const previous = await json(join(base, "previous.json"));
  await writeFile(join(base, "failed.json"), JSON.stringify({ id: failedId }));
  if (!previous || !/^[a-f0-9]{64}$/.test(previous.id)) return null;
  await setCurrent(base, previous.id);
  return currentRelease(base);
}

/** Keep only the healthy release and the rollback candidate, after startup acknowledgement. */
export async function pruneReleases(base: string, healthyId: string) {
  const previous = await json(join(base, "previous.json"));
  const { readdir } = await import("node:fs/promises");
  for (const entry of await readdir(join(base, "releases"), {
    withFileTypes: true,
  })) {
    if (
      entry.isDirectory() &&
      /^[a-f0-9]{64}$/.test(entry.name) &&
      entry.name !== healthyId &&
      entry.name !== previous?.id
    ) {
      await rm(join(base, "releases", entry.name), {
        recursive: true,
        force: true,
      });
    }
  }
}

/** Replace the installed launcher binary with the one the release announces, when it differs. The
 * launcher does this during the update; the application retries in the background if it failed.
 * Linux allows replacing the executable of the launcher process that started us. The gzip variant is
 * preferred when published: half the bytes. Returns whether a new binary was installed. */
export async function installLauncherBinary(base: string, manifest: Manifest, origin: string, onProgress?: (bytes: number) => void) {
  const asset = manifest.launcher;
  if (!asset) return false;
  const destination = join(base, process.platform === "win32" ? "cubix.exe" : "cubix");
  try { if (sha256(await readFile(destination)) === asset.sha256) return false; } catch {}
  // Resumable across sessions: a short session still brings the binary a little closer.
  if (asset.gzip) {
    const compressed = `${destination}.gz`;
    await downloadAssetToFile(new URL(`/api/desktop/assets/${asset.gzip.sha256}`, origin), asset.gzip, compressed, { onProgress, idleTimeout: 120000 });
    try {
      const bytes = gunzipSync(await readFile(compressed));
      if (bytes.length !== asset.size || sha256(bytes) !== asset.sha256) throw Error("Launcher binary integrity check failed");
      const temporary = `${destination}.new-${process.pid}`;
      try {
        await writeFile(temporary, bytes, { mode: 0o755 });
        await rename(temporary, destination);
      } finally { await rm(temporary, { force: true }); }
    } finally { await rm(compressed, { force: true }); }
    return true;
  }
  await downloadAssetToFile(new URL(`/api/desktop/assets/${asset.sha256}`, origin), asset, destination, { onProgress, idleTimeout: 120000, mode: 0o755 });
  return true;
}

/** Promote the signed bootstrap shipped with a release (launcher binary, startup window and its
 * renderer), including on legacy installations. Linux permits replacing the executable while the
 * old launcher finishes its work. */
export async function refreshLauncher(base: string, release: { id: string; manifest: Manifest }) {
  for (const file of release.manifest.files) {
    if (!file.path.startsWith("bootstrap/")) continue;
    const source = join(base, "releases", release.id, file.path), destination = join(base, file.path.slice("bootstrap/".length));
    const bytes = await readFile(source);
    if (sha256(bytes) !== file.sha256) throw Error("Invalid bootstrap checksum");
    try { if (sha256(await readFile(destination)) === file.sha256) continue; } catch {}
    await mkdir(resolve(destination, ".."), { recursive: true });
    const temporary = destination + `.new-${process.pid}`;
    try {
      await writeFile(temporary, bytes, { mode: file.executable ? 0o755 : 0o644 });
      await rename(temporary, destination);
    } finally { await rm(temporary, { force: true }); }
  }
}
