import { expect, test } from "bun:test";
import catalog from "../data/catalog.json";
import { buildCatalog } from "../scripts/catalog-model";

test("data/catalog.json is up to date with its inputs (run `bun run build:catalog`)", () => {
  const fresh = JSON.parse(JSON.stringify(buildCatalog(catalog.generated)));
  expect(catalog).toEqual(fresh);
});
