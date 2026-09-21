/** Publish the locally built signed release through the authenticated Cubix API. */
import { resolve, join } from "node:path";
import type { Manifest, SignedRelease } from "./updater";
export async function publishDesktop(origin: string, password: string) {
  const base = resolve(
      "artifacts/electron",
      `cubix-${process.platform}-${process.arch}`,
    ),
    signed = (await Bun.file(
      join(base, "release.json"),
    ).json()) as SignedRelease,
    manifest = JSON.parse(signed.manifest) as Manifest;
  for (const f of manifest.files) {
    const url = `${origin}/api/desktop/assets/${f.sha256}`;
    const exists = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(15000),
    });
    if (exists.ok) continue;
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${password}`,
        "Content-Type": "application/octet-stream",
      },
      body: Bun.file(join(base, "release", f.path)),
      signal: AbortSignal.timeout(300000),
    });
    if (!response.ok)
      throw Error(
        `Desktop upload failed (${f.path}): ${response.status} ${await response.text()}`,
      );
  }
  const response = await fetch(
    `${origin}/api/desktop/releases/${manifest.target}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${password}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(signed),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok)
    throw Error(
      `Desktop publish failed: ${response.status} ${await response.text()}`,
    );
  console.log(
    `Desktop ${manifest.target}, build ${manifest.build}, published.`,
  );
}
if (import.meta.main) {
  if (!process.env.CUBIX_DEPLOY_PASSWORD)
    throw Error("Set CUBIX_DEPLOY_PASSWORD to publish");
  await publishDesktop(
    process.env.CUBIX_ORIGIN ?? "https://cubix.vitrixxl.fr",
    process.env.CUBIX_DEPLOY_PASSWORD,
  );
}
