/** Source sequences are kept here; regenerated setups and SVGs use cubing.js's puzzle models. */
import { Alg } from "cubing/alg";
import { puzzles } from "cubing/puzzles";
import { mkdir, writeFile } from "node:fs/promises";
import { puzzleInfo, type PuzzleId } from "../src/shared/puzzles";
import type { CaseDto, SetDto, Stage } from "../src/shared/types";
import { renderPatternSvg, assertLegalSquare1 } from "./niche-model";

const sets: SetDto[] = [], cases: CaseDto[] = [];
function set(puzzle: PuzzleId, suffix: string, stage: Stage, label: string, description: string) {
  const value = {puzzle_id:puzzle,id:`${puzzle}-${suffix}`,stage,label,description,count:0};
  sets.push(value); return value;
}
async function add(s: ReturnType<typeof set>, name: string, alg: string, source: string, note?: string) {
  const id = `${puzzleInfo(s.puzzle_id).label} ${s.id.split('-').slice(1).join('-').toUpperCase()} ${++s.count}`;
  const kp = await puzzles[puzzleInfo(s.puzzle_id).twisty].kpuzzle();
  let parsed = new Alg(alg);
  if (s.puzzle_id === "sq1") {
    let aligned: Alg | undefined;
    // Step algorithms can finish in either square alignment. Include the final
    // layer alignment so their inverse is legal from our canonical solved grip.
    for (const u of [0,1,-1,2,-2]) for (const d of [0,1,-1,2,-2]) {
      if (aligned) continue;
      const candidate=new Alg(`${alg}${u || d ? ` (${u},${d})` : ''}`);
      try { assertLegalSquare1(kp.defaultPattern(),new Alg(`${candidate.invert()} ${candidate}`)); aligned=candidate; } catch {}
    }
    if (!aligned) throw Error(`No legal square alignment: ${id}`);
    if (!aligned.isIdentical(parsed)) note='The final layer alignment returns the puzzle to the solved grip shown in the preview.';
    parsed=aligned;
  }
  const setup = parsed.invert().toString().replace(/\by2'/g,'y2');
  const pattern = kp.defaultPattern().applyAlg(setup);
  if (!pattern.applyAlg(parsed).isIdentical(kp.defaultPattern())) throw Error(`Invalid solution: ${id}`);
  if (pattern.isIdentical(kp.defaultPattern())) throw Error(`Solved case: ${id}`);
  const diagram = `/cases/${s.id}-${s.count}.svg`;
  await writeFile(`public${diagram}`,renderPatternSvg(await puzzles[puzzleInfo(s.puzzle_id).twisty].svg(),pattern));
  cases.push({puzzle_id:s.puzzle_id,id,name,stage:s.stage,set:s.id,setLabel:s.label,group:s.label,
    setup,setups_alt:[],algorithms:[{alg:parsed.toString(),source}],diagram,...(note?{notes:note}:{})});
}
await mkdir('public/cases',{recursive:true});
const sqSource='https://www.jaapsch.net/puzzles/square1.htm';
let s=set('sq1','shape','Cube shape','Cube shape','Five star cases: restore the square shape from a layer with six corners.');
for(const [i,alg] of ["/ (-2,-4) / (-1,-2) / (-3,-3) /","/ (2,-2) / (-3,-4) / (4,-3) / (-5,-4) / (6,-3) /","/ (-4,-2) / (-1,4) / (-3,0) /","/ (-4,0) / (5,4) / (2,-3) / (-5,-4) / (6,-3) /","/ (2,2) / (0,-1) / (3,3) /"].entries())
  await add(s,`Star · ${i} edges between the two corners`,alg,sqSource);
// CubeZone's complete beginner CO, EO and CP sets, in the source's table order.
for(const [step,key,stage,label,description] of [
  [2,'co','Corners','Corner orientation','Move corners into their correct layer.'],
  [3,'eo','Edges','Edge orientation','Separate top and bottom edges without disturbing the corners.'],
  [4,'cp','Corners','Corner permutation','All eight non-solved corner-permutation cases.'],
] as const){
  s=set('sq1',key,stage,label,description);
  const source=`https://www.cubezone.be/square1step${step}.html`;
  const html=await (await fetch(source)).text();
  const algorithms=[...html.matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map(m=>m[1].replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').trim()).filter(t=>/\(\s*-?\d/.test(t)&&t.includes('/')&&/^[\s()\d,\-/]+$/.test(t));
  const expected={2:5,3:7,4:8}[step];
  if(algorithms.length!==expected)throw Error(`Source changed: ${source} (${algorithms.length})`);
  for(const [i,alg] of algorithms.entries())await add(s,`${label} ${i+1}`,alg,source);
}
s=set('sq1','ep','Edges','Edge permutation','Paired swaps to place the edges, followed by the odd-parity fix.');
await add(s,'Opposite edge swaps',"(1,0) / (-1,-1) / (6,0) / (1,1) / (-1,0)",sqSource);
await add(s,'Adjacent edge swaps',"(1,0) / (-3,0) / (-1,-1) / (3,0) / (1,1) / (-3,0) / (-1,-1) / (4,1) / (-1,0)",sqSource);
s=set('sq1','parity','Parity','Parity & middle layer','Resolve an odd edge swap or restore the middle layer.');
await add(s,'Opposite edge parity',"/ (3,3) / (1,0) / (-2,-2) / (2,0) / (2,2) / (-1,0) / (-3,-3) / (-2,0) / (3,3) / (3,0) / (-1,-1) / (-3,0) / (1,1) / (-4,-3)",sqSource);
await add(s,'Middle layer flip',"/ (6,0) / (6,0) / (6,0)",sqSource);

const pySource='https://www.speedcube.com.au/blogs/pyraminx-beginner';
s=set('pyram','basics','Basics','Tips & insertions','Align the tips and practise inserting the first-layer edges. Uppercase turns include the tip.');
for(const tip of ['u','r','l','b'])await add(s,`Align ${tip.toUpperCase()} tip`,tip,'https://www.jaapsch.net/puzzles/pyraminx.htm');
await add(s,'Right insertion',"R U' R'",'https://www.speedcube.com.au/blogs/speedcubing-solutions/how-to-solve-a-pyraminx-easy-to-follow-beginners-steps');
await add(s,'Left insertion',"L' U L",'https://www.speedcube.com.au/blogs/speedcubing-solutions/how-to-solve-a-pyraminx-easy-to-follow-beginners-steps');
s=set('pyram','ll','Last layer','Last three edges','The five beginner last-layer cases, with the solved face down.');
for(const [name,alg] of [
 ['Clockwise cycle',"R U' R' U' R U' R'"],['Counterclockwise cycle',"R U R' U R U R'"],
 ['Two flipped edges',"L R' L' R U' R U R'"],['Cycle with two flips · A',"L R' L' R U R U' R'"],['Cycle with two flips · B',"L U R U' R' L'"],
])await add(s,name,alg,name.endsWith("· B")?"https://www.youtube.com/watch?v=Fyl7-RgkfCs":pySource);

const skSource='https://www.speedcube.com.au/blogs/skewb-beginner';
s=set('skewb','corners','Corners','First face & corners','Beginner corner insertions and sledgehammer sequences. Follow the displayed grip and rotations.');
for(const [name,alg] of [['Right insertion',"R' L R"],['Left insertion',"y' L R' L'"],['Sledgehammer',"R' L R L'"],['Opposite corners',"R' L R L' y R' L R L'"],['Hedgeslammer',"L R' L' R"]])await add(s,name,alg,skSource);
s=set('skewb','centers','Centers','Last centers','Cycle the remaining centers after the corners are solved.');
await add(s,'Center cycle · clockwise',"R' L R L' y2 R' L R L'",skSource);
await add(s,'Center cycle · counterclockwise',"L R' L' R y2 L R' L' R",'https://sarah.cubing.net/skewb/my-method');

const minxSource='https://www.cubeskills.com/uploads/pdf/tutorials/intermediate-megaminx-techniques.pdf';
s=set('minx','pairs','F2L','Pair insertions','Practise corner-edge pair insertions before the last layer. Megaminx face turns are 72°, not 90°.');
for(const [name,alg] of [['Right pair',"R U R'"],['Left pair',"L' U' L"],['Right split pair',"R U' R' U R U R'"],['Left split pair',"L' U L U' L' U' L"]])await add(s,name,alg,'Cubix · Megaminx pair insertion drills');
s=set('minx','eo','OLL','Edge orientation','Three edge-orientation cases for the last layer. Match the U face in the diagram.');
for(const [i,alg] of ["F R U R' U' F'","F U R U' R' F'","F R U2 R2' F R F' U2' F'"].entries())await add(s,`Edge orientation ${i+1}`,alg,minxSource);
s=set('minx','co','OLL','Corner orientation','Sixteen corner-orientation cases for the four-look last layer.');
for(const [i,alg] of [
 "R U R' U R U R' U2' R U' R'","F R U2 R' U' R U' R' F'","R U2 R' U R U2 R'","R U R' U' R' F R U R U' R' F'",
 "R U R' U R U2' R'","R' U' R U' R' U2 R","R U2 R' U' R U' R'","R U R' U2 R U2 R'",
 "R U2 R' U' R U R' U' R U' R'","R U R' U R U' R' U R U2' R'","R U R' U R U R' U' R U2' R'",
 "R U2 R' U' R U' R2' U' R U' R' U2 R","R U2 R2' U' R2 U' R2' U2 R","R' U2' R2 U R2' U R2 U2' R'",
 "R U R' U2 R U2' R' U R U2' R'","R U2 R' U' R U2 R' U2' R U' R'",
].entries())await add(s,`Corner orientation ${i+1}`,alg,minxSource);
s=set('minx','ep','PLL','Edge permutation','Five edge-permutation cases for the four-look last layer.');
for(const [i,alg] of ["R2 U2' R2' U' R2 U2' R2'","R2 U2 R2' U R2 U2 R2'","R U R' F' R U R' U' R' F R2 U' R'","R U R' U R' U' R2 U' R' U R' U R U2'","L R U2 L' U R' L U' R U2 L' U2 R'"].entries())await add(s,`Edge permutation ${i+1}`,alg,minxSource);
s=set('minx','cp','PLL','Corner permutation','Corner cycles and swaps to finish the last layer. BR means the back-right face.');
for(const [i,alg] of ["R' BR' R BR R' F' R BR' R' BR F R","R' F' BR' R BR R' F R BR' R' BR R","BR' R' U L U' R' U L' U' R2 BR","BR' R2' U L U' R U L' U' R BR","y L' R U2 R' U' R U R' U' R U R' U' R U' R' L","R U R' U R' U' R F' R U R' U' R' F R2 U' R2' U R U'"].entries())await add(s,`Corner permutation ${i+1}`,alg,minxSource);

const clockSource='https://www.jaapsch.net/puzzles/clock.htm';
s=set('clock','pins','Dials','Pin groups','Read a dial offset, choose the raised pins and turn towards 12. These are dial-alignment drills, not fixed OLL-style cases.');
for(const [i,group] of ['UR','DR','DL','UL','U','R','D','L','ALL'].entries())await add(s,`${group} · front alignment`,`${group}${i%5+1}${i%2?'-':'+'}`,clockSource,'The letters identify the raised pin group. The number counts hours; + is clockwise and − counterclockwise when looking at that side.');
s=set('clock','back','Dials','Back cross','Turn the puzzle over with y2, align the rear cross, then return to the starting side.');
for(const [i,group] of ['U','R','D','L','ALL'].entries())await add(s,`${group} · back alignment`,`y2 ${group}${i+1}+ y2`,clockSource);
s=set('clock','sequences','Dials','Complete sequences','Combine pin groups into cross and full-puzzle practice. The required offsets depend on the displayed setup.');
for(const [name,alg] of [
 ['Front cross',"U3+ R2- D4+ L1- ALL2+"],['Back cross',"y2 U2- R4+ D1- L3+ ALL1- y2"],
 ['Front dial sequence',"UR2+ DR1- DL4+ UL3- U1+ R2- D3+ L4- ALL2+"],
 ['Full clock sequence',"UR2+ DR1- DL4+ UL3- U1+ R2- D3+ L4- ALL2+ y2 U3- R2+ D1- L4+ ALL1+ y2"],
])await add(s,name,alg,'Cubix · Clock dial-sequence drills', 'Solve all dials to 12. This fixed setup lets you practise the sequence; adapt each turn amount when solving a different scramble.');
await writeFile('data/niche-catalog.json',JSON.stringify({sets,cases},null,2)+'\n');
console.log(`${cases.length} verified cases across ${sets.length} sets.`);
