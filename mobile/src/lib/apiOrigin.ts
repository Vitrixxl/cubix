export const PRODUCTION_API_ORIGIN = "https://cubix.vitrixxl.fr";
const manifestPath = "/api/mobile/updates/manifest";

/** Use the running update's configuration, not a separately inlined Metro env value. */
export function apiOrigin(updateUrl?: string): string {
  if (!updateUrl) return PRODUCTION_API_ORIGIN;
  const url = new URL(updateUrl);
  if (!/^https?:$/.test(url.protocol) || url.pathname !== manifestPath)
    throw Error("Invalid Cubix update URL");
  return url.origin;
}
