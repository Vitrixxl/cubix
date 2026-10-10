import { expect, test } from "bun:test";
import { cubeOrientation, cubeScene, cubeShapes, turnCube } from "../src/shared/cubeScene";

/** The drawing's shapes, rounded to a billionth and hashed: a change to the maths shows as a new fingerprint. */
const fingerprint = (value: unknown) =>
  new Bun.CryptoHasher("sha256").update(JSON.stringify(value, (_, v) => (typeof v === "number" ? Math.round(v * 1e9) / 1e9 : v))).digest("hex").slice(0, 16);

test("the cube's shapes stay exactly as drawn, mid-move, held, turned and at every size", () => {
  const turned = turnCube(cubeOrientation(), 0.7, 0.3);
  expect(fingerprint(cubeShapes(cubeScene("R U R' U'", 3, "full"), 1.3))).toBe("d229204b7c5efaad");
  expect(fingerprint(cubeShapes(cubeScene("F2 Rw 3U' B", 5, "full", true, true), 2.2, undefined, undefined, turned))).toBe("b0c8bd5055ddef80");
  expect(fingerprint(cubeShapes(cubeScene("L D2 Fw", 7, "full"), 4.1, undefined, undefined, turned))).toBe("354a7ad37e4c07c2");
  expect(fingerprint(cubeShapes(cubeScene("", 2, "full"), 0))).toBe("5902713bb6c5352c");
});
