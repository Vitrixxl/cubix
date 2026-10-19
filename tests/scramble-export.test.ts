import { expect, test } from "bun:test";
import { scramblesFile } from "../src/client/lib/exportData";

test("scrambles export as a numbered sheet, a table or JSON, a relay's puzzles apart", () => {
  expect(scramblesFile("txt", ["R U", "F2"], "3×3").body).toBe("3×3\n\n1. R U\n2. F2\n");
  expect(scramblesFile("csv", ["R U", "F2"], "3×3").body).toBe("#,Scramble\n1,R U\n2,F2\n");
  expect(JSON.parse(scramblesFile("json", ["R U"], "3×3").body)).toEqual({ event: "3×3", scrambles: ["R U"] });
  const relay = ["R U\nF2 D"];
  expect(scramblesFile("csv", relay, "2–3", ["2×2", "3×3"]).body).toBe("#,2×2,3×3\n1,R U,F2 D\n");
  expect(JSON.parse(scramblesFile("json", relay, "2–3", ["2×2", "3×3"]).body).scrambles).toEqual([{ "2×2": "R U", "3×3": "F2 D" }]);
});
