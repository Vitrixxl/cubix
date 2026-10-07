import { describe, expect, test } from "bun:test";
import { annotationAlg, readAnnotation, readSolution, writeAnnotation } from "../src/client/lib/solution";

describe("hand-written solutions", () => {
  test("are kept with how the cube was held, any notation included", () => {
    const text = writeAnnotation({ top: "white", front: "green", moves: "  x2 y  R U r' M2  E S' Rw2 " })!;
    expect(text).toBe("hold:white/green x2 y R U r' M2 E S' Rw2");
    expect(readAnnotation(text)).toEqual({ top: "white", front: "green", moves: "x2 y R U r' M2 E S' Rw2" });
    // Not a recorded solution: the analysis leaves it alone.
    expect(readSolution(text)).toBeNull();
  });

  test("refuse unknown turns and impossible holds", () => {
    expect(writeAnnotation({ top: "white", front: "green", moves: "R Q" })).toBeNull();
    expect(writeAnnotation({ top: "white", front: "yellow", moves: "R" })).toBeNull();
    expect(readAnnotation("hold:white/white R")).toBeNull();
  });

  test("play from the cube Cubix shows, yellow on top and green in front", () => {
    expect(annotationAlg({ top: "yellow", front: "green", moves: "R U" })).toBe("R U");
    expect(annotationAlg({ top: "green", front: "white", moves: "R" })).toBe("x R");
    expect(annotationAlg({ top: "white", front: "green", moves: "R" })).toBe("z2 R");
    expect(annotationAlg({ top: "yellow", front: "orange", moves: "" })).toBe("y");
  });
});
