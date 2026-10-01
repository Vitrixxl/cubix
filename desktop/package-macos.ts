/** Build the native macOS bundle; Packager renames the app, helpers and bundle identifiers together. */
import { packager, type Options } from "@electron/packager";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

export async function macPackageOptions(arch: "arm64" | "x64"): Promise<Options> {
  const { version: electronVersion } = await Bun.file(join(root, "node_modules/electron/package.json")).json();
  return {
    dir: join(root, "desktop/dist"),
    out: join(root, "artifacts/electron"),
    name: "Cubix",
    platform: "darwin",
    arch,
    electronVersion,
    asar: true,
    appBundleId: "fr.vitrixxl.cubix",
    appCategoryType: "public.app-category.games",
    icon: join(root, "desktop/macos/cubix.icns"),
    extraResource: [join(root, "desktop/NOTICE"), join(root, "desktop/licenses")],
    overwrite: true,
    // Local builds need no Apple account. Re-sign every renamed executable and fail if signing fails.
    osxSign: {
      identity: "-",
      identityValidation: false,
      preAutoEntitlements: false,
      preEmbedProvisioningProfile: false,
      continueOnError: false,
      optionsForFile: () => ({ hardenedRuntime: false, timestamp: "none" }),
    },
  };
}

export async function packageMac() {
  if (process.platform !== "darwin") throw Error("Build the signed macOS application on a Mac.");
  if (process.arch !== "arm64" && process.arch !== "x64") throw Error(`Unsupported macOS architecture: ${process.arch}`);
  const paths = await packager(await macPackageOptions(process.arch));
  for (const path of paths) console.log(`Electron application: ${join(path, "Cubix.app")}`);
}
