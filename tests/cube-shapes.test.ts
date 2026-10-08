import { expect, test } from "bun:test";
import { cubeOrientation, cubeScene, cubeShapes, turnCube } from "../src/shared/cubeScene";

/** The drawing's shapes, rounded to a billionth and hashed: a change to the maths shows as a new fingerprint. */
const fingerprint = (value: unknown) =>
  new Bun.CryptoHasher("sha256").update(JSON.stringify(value, (_, v) => (typeof v === "number" ? Math.round(v * 1e9) / 1e9 : v))).digest("hex").slice(0, 16);

test("the cube's shapes stay exactly as drawn, mid-move, held, turned and at every size", () => {
  const turned = turnCube(cubeOrientation(), 0.7, 0.3);
  expect(fingerprint(cubeShapes(cubeScene("R U R' U'", 3, "full"), 1.3))).toBe("c40d2c62c312956c");
  expect(fingerprint(cubeShapes(cubeScene("F2 Rw 3U' B", 5, "full", true, true), 2.2, undefined, undefined, turned))).toBe("663c3eb324b600a3");
  expect(fingerprint(cubeShapes(cubeScene("L D2 Fw", 7, "full"), 4.1, undefined, undefined, turned))).toBe("f5feb1322008cb6e");
  expect(fingerprint(cubeShapes(cubeScene("", 2, "full"), 0))).toBe("3d2644a767baa405");
});
