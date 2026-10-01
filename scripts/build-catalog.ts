/** Write `data/catalog.json`, the one file every platform builds its catalogue from. */
import { writeFile } from "node:fs/promises";
import { buildCatalog } from "./catalog-model";
import { METHODS } from "../src/shared/methods";
const catalog = buildCatalog();
await writeFile("data/catalog.json", JSON.stringify(catalog, null, 1) + "\n");
await writeFile("data/method-ids.json", JSON.stringify(Object.fromEntries(Object.entries(METHODS).map(([p, methods]) => [p, methods.map(m => m.id)])), null, 2) + "\n");
console.log(`data/catalog.json: ${catalog.cases.length} cases in ${catalog.sets.length} sets`);
