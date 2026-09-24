import { PRODUCTION_API_ORIGIN } from "../src/lib/apiOrigin";

/** Check the actual executable as well as metadata before publishing to phones. */
export function validateProductionUpdate(update: { expoClient?: { updates?: { url?: string } } }, bundle: Buffer) {
  if (update.expoClient?.updates?.url !== `${PRODUCTION_API_ORIGIN}/api/mobile/updates/manifest`)
    throw Error("Refusing to publish a mobile update configured for a non-production server");
  if (!bundle.includes(PRODUCTION_API_ORIGIN))
    throw Error("Production API origin is missing from the compiled mobile bundle");
  if (/https?:\/\/(?:127\.0\.0\.1|localhost|10\.0\.2\.2)(?=[:/\s\x00])/.test(bundle.toString("latin1")))
    throw Error("Refusing to publish a mobile bundle containing a local test server");
}
