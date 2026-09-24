/** Publish the locally built signed release through the authenticated Cubix API. */
import { resolve, join } from "node:path";
import {
  releaseRequest,
  validateRelease,
  type Manifest,
  type SignedRelease,
} from "./updater";
export async function publishDesktop(origin: string, password: string) {
  const base = resolve(
      "artifacts/electron",
      `cubix-${process.platform}-${process.arch}`,
    ),
    signed = (await Bun.file(
      join(base, "release.json"),
    ).json()) as SignedRelease,
    manifest = JSON.parse(signed.manifest) as Manifest;
  // The API checks every blob before publishing a manifest. Reuse that inventory
  // so a small update doesn't issue thousands of HEAD requests to the Pi.
  const publishedAssets = new Set<string>();
  const previous = await releaseRequest(
    `${origin}/api/desktop/releases/${manifest.target}`,
    {},
    15000,
  );
  if (previous.ok) {
    const config = await Bun.file(join(base, "launcher.json")).json();
    const release = validateRelease(
      await previous.json(),
      config.publicKey,
      manifest.target,
    );
    for (const file of release.files) publishedAssets.add(file.sha256);
    if (release.launcher) publishedAssets.add(release.launcher.sha256);
  } else if (previous.status !== 404 && previous.status !== 204) {
    throw Error(`Desktop release check failed: ${previous.status}`);
  }
  const launcherPath = `bootstrap/${manifest.target.startsWith("win32") ? "cubix.exe" : "cubix"}`;
  const uploads = [
    ...manifest.files,
    ...(manifest.launcher ? [{ ...manifest.launcher, path: launcherPath }] : []),
  ];
  const unique = [
    ...new Map(uploads.map((f) => [f.sha256, f])).values(),
  ].filter((f) => !publishedAssets.has(f.sha256));
  let checked = 0;
  for (const f of unique) {
    if (checked++ % 100 === 0)
      console.log(`Desktop assets: ${checked - 1}/${unique.length}`);
    const url = `${origin}/api/desktop/assets/${f.sha256}`;
    const exists = await releaseRequest(
      url,
      {
        method: "HEAD",
      },
      15000,
    );
    if (exists.ok) continue;
    if (exists.status !== 404)
      throw Error(`Desktop asset check failed: ${exists.status}`);
    const response = await releaseRequest(
      url,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${password}`,
          "Content-Type": "application/octet-stream",
        },
        body: Bun.file(join(base, "release", f.path)),
      },
      300000,
    );
    if (!response.ok)
      throw Error(
        `Desktop upload failed (${f.path}): ${response.status} ${await response.text()}`,
      );
  }
  const response = await releaseRequest(
    `${origin}/api/desktop/releases/${manifest.target}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${password}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(signed),
    },
    15000,
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
