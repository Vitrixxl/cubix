/** Write `data/catalog.json`, the one file every platform builds its catalogue from. */
import { writeFile } from "node:fs/promises";
import { buildCatalog } from "./catalog-model";
const catalog = buildCatalog();
await writeFile("data/catalog.json", JSON.stringify(catalog, null, 1) + "\n");
console.log(`data/catalog.json: ${catalog.cases.length} cases in ${catalog.sets.length} sets`);
