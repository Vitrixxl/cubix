/** Rebuild the portable multi-cube drills consumed by both the browser and Rust. */
import { writeFile } from "node:fs/promises";
import { invertAlg } from "../src/shared/cube";
import type { CaseDto, SetDto, Stage } from "../src/shared/types";
import type { CubeSize } from "../src/shared/puzzles";
const sets: SetDto[] = [], cases: CaseDto[] = [];
function add(size: CubeSize, key: string, stage: Stage, label: string, description: string, entries: [string, string, string, string][]) {
  const id = `${size}x${size}-${key}`;
  sets.push({ id, cube_size: size, stage, label, description, count: entries.length });
  for (const [name, group, alg, source] of entries) cases.push({ id: `${size}x${size} ${key.toUpperCase()} ${name}`, cube_size: size, name, group, stage, set: id, setLabel: label, setup: invertAlg(alg), setups_alt: [], algorithms: [{ alg, source }] });
}
const oll = "https://www.jperm.net/algs/2x2/oll", pbl = "https://www.jperm.net/algs/2x2/pbl";
add(2, "oll", "OLL", "Ortega OLL", "Orient the last face after building the first face. Seven Ortega cases.", [
  ["L", "2 corners", "F R' F' R U R U' R'", oll],
  ["U", "2 corners", "F R U R' U' F'", oll],
  ["T", "2 corners", "R U R' U' R' F R F'", oll],
  ["Pi", "0 corners", "R U2 (R2 U' R2 U' R2) U2 R", oll],
  ["H", "0 corners", "R2 U2 R U2 R2", oll],
  ["Antisune", "1 corner", "R U2 R' U' R U' R'", oll],
  ["Sune", "1 corner", "R U R' U R U2 R'", oll],
]);
add(2, "pbl", "PBL", "Ortega PBL", "Permute both layers after orienting both faces. Five Ortega cases.", [
  ["Adjacent U", "Solved bottom", "R U R' U' R' F R2 U' R' U' R U R' F'", pbl],
  ["Diagonal U", "Solved bottom", "F R U' R' U' R U R' F' R U R' U' R' F R F'", pbl],
  ["Adjacent / adjacent", "Both layers", "R2 U' B2 U2 R2 U' R2", pbl],
  ["Adjacent / diagonal", "Both layers", "R U' R F2 R' U R'", pbl],
  ["Diagonal / diagonal", "Both layers", "R2 F2 R2", pbl],
]);
for (const size of [4, 5, 6, 7] as const) {
  const centers: [string,string,string,string][] = [], edges: typeof centers = [], parity: typeof centers = [];
  const tutorial = size === 4 ? "https://www.jperm.net/4x4" : "https://jperm.net/5x5";
  for (let depth = 2; depth <= Math.floor(size / 2); depth++) {
    const r = `${depth}R`, u = `${depth}U`;
    // Commutator drills are exact inverse setups, not an exhaustive catalogue of intuitive reduction.
    centers.push([`Center cycle · slice ${depth}`, "Center commutators", `${r} U ${r}' ${u} ${r} U' ${r}' ${u}'`, "Cubix · center commutator drill"]);
    centers.push([`Reverse center cycle · slice ${depth}`, "Center commutators", `${u} ${r} U ${r}' ${u}' ${r} U' ${r}'`, "Cubix · center commutator drill"]);
    edges.push([`Slice / flip / restore · slice ${depth}`, "Edge pairing", `${u} R U R' F R' F' R ${u}'`, tutorial]);
    // The wing parity sequence acts on the selected inner slice, preserving other wing orbits.
    parity.push([`Wing parity · slice ${depth}`, "Last two edges", `${r}' U2 ${depth}L F2 ${depth}L' F2 ${r}2 U2 ${r} U2 ${r}' U2 F2 ${r}2 F2`, "https://www.speedcubedb.com/a/5x5/L2E"]);
  }
  edges.push(["Edge flip", "Edge pairing", "R U R' F R' F' R", tutorial]);
  if (size % 2 === 0) {
    const width = size / 2;
    const r = width === 2 ? "Rw" : `${width}Rw`, l = width === 2 ? "Lw" : `${width}Lw`, u = width === 2 ? "Uw" : `${width}Uw`;
    parity.push(["OLL parity", "After reduction", `${r} U2 x ${r} U2 ${r} U2 ${r}' U2 ${l} U2 ${r}' U2 ${r} U2 ${r}' U2 ${r}'`, "https://www.jperm.net/4x4"]);
    // Turn the inner half-block only; outer R cancels the outer layer of Rw.
    const inner = `${r}2 R2`;
    parity.push(["PLL parity", "After reduction", `${inner} U2 ${inner} ${u}2 ${inner} ${u}2`, "https://www.jperm.net/4x4"]);
  }
  add(size, "centers", "Centers", "Center drills", "Practise center commutators at each inner depth. Build bars and centers intuitively; these drills cover useful cycles.", centers);
  add(size, "edges", "Edges", "Edge pairing", "Practise the edge-flip trigger and slice / flip / restore at each wing depth. Start from the displayed setup.", edges);
  add(size, "parity", "Parity", "Parity", size % 2 ? "Last-two-edge wing parity, by slice depth. Odd cubes have no PLL parity after reduction." : "Wing parity by slice depth, plus OLL and PLL parity after reduction. Start from the displayed setup.", parity);
}
await writeFile("data/multi-cube.json", JSON.stringify({ sets, cases }, null, 2) + "\n");
