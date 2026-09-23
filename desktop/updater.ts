/** Signed, content-addressed releases. Downloads never modify the running release. */
import { setTimeout as sleep } from "node:timers/promises";
import { createHash, createPublicKey, verify } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve, sep } from "node:path";
export type ReleaseFile = {
  path: string;
  sha256: string;
  size: number;
  executable: boolean;
};
export type Manifest = {
  schema: 1;
  target: string;
  build: number;
  commit: string;
  files: ReleaseFile[];
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
  if (
    total > 2 * 1024 ** 3 ||
    !seen.has("app/main.cjs") ||
    !seen.has("app/package.json") ||
    !seen.has("app/renderer/index.html")
  )
    throw Error("Incomplete release");
  return v;
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
}: {
  base: string;
  origin: string;
  publicKey: string;
  target: string;
  onProgress?: (text: string) => void;
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
  if (
    current &&
    (current.id === id || current.manifest.build >= manifest.build)
  )
    return current;
  // A previously failed release stays quarantined until a different release is published.
  const failed = await json(join(base, "failed.json"));
  if (failed?.id === id) return current;
  const release = join(base, "releases", id),
    stage = join(base, "releases", `.staging-${process.pid}`);
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  try {
    const existing = new Map(current?.manifest.files.map((f) => [f.path, f]));
    let done = 0;
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
      if (!copied) {
        onProgress(
          `Mise à jour de Cubix… ${Math.floor((done / manifest.files.length) * 100)} %`,
        );
        const asset = await releaseRequest(
          new URL(`/api/desktop/assets/${f.sha256}`, url),
        );
        if (!asset.ok || !asset.body)
          throw Error(`Download failed: ${asset.status}`);
        const chunks: Uint8Array[] = [];
        let size = 0;
        for await (const chunk of asset.body as any) {
          size += chunk.length;
          if (size > f.size) throw Error("Download larger than signed size");
          chunks.push(chunk);
        }
        const bytes = Buffer.concat(chunks);
        if (size !== f.size || sha256(bytes) !== f.sha256)
          throw Error("Download integrity check failed");
        await writeFile(path, bytes);
      }
      await chmod(path, f.executable ? 0o755 : 0o644);
      done++;
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

/** Promote the signed bootstrap shipped with a release, including on legacy installations.
 * Linux permits replacing the executable while the old launcher finishes its work. */
export async function refreshLauncher(base: string, release: { id: string; manifest: Manifest }) {
  for (const name of [process.platform === "win32" ? "cubix.exe" : "cubix", "splash.cjs"]) {
    const file = release.manifest.files.find(file => file.path === `bootstrap/${name}`);
    if (!file) continue;
    const source = join(base, "releases", release.id, file.path), destination = join(base, name);
    const bytes = await readFile(source);
    if (sha256(bytes) !== file.sha256) throw Error("Invalid bootstrap checksum");
    try { if (sha256(await readFile(destination)) === file.sha256) continue; } catch {}
    const temporary = destination + `.new-${process.pid}`;
    try {
      await writeFile(temporary, bytes, { mode: file.executable ? 0o755 : 0o644 });
      await rename(temporary, destination);
    } finally { await rm(temporary, { force: true }); }
  }
}
