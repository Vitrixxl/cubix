// Writes the solving methods (src/shared/methods.ts) as JSON for the native app: bun native/core/data/export-methods.ts
import { METHODS, BLD_METHODS } from "../../../src/shared/methods";
await Bun.write(new URL("./methods.json", import.meta.url), JSON.stringify({ methods: METHODS, bld: BLD_METHODS }));
