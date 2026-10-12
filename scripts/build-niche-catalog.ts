/** Source sequences are kept here; regenerated setups and SVGs use cubing.js's puzzle models. */
import { Alg } from "cubing/alg";
import { puzzles } from "cubing/puzzles";
import type { KPattern } from "cubing/kpuzzle";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { puzzleInfo, type PuzzleId } from "../src/shared/puzzles";
import type { AlgEntry, CaseDto, SetDto, Stage } from "../src/shared/types";
import { renderPatternSvg, assertLegalSquare1, HOLDS, kit, skewbWca, square1Alg, thenTurn, turn } from "./niche-model";

const sets: NicheSet[] = [], cases: CaseDto[] = [];
function set(puzzle: PuzzleId, suffix: string, stage: Stage, label: string, description: string): NicheSet {
  const value = {puzzle_id:puzzle,id:`${puzzle}-${suffix}`,stage,label,description,count:0};
  sets.push(value); return value;
}
type NicheSet = SetDto & { puzzle_id: PuzzleId };
/** A case: its algorithm (or algorithms, checked by `solving`, the one that sets it up first), shown in `group`. */
async function add(s: NicheSet, name: string, alg: string | AlgEntry[], source?: string, note?: string, group = s.label) {
  const n = s.count + 1, id = `${puzzleInfo(s.puzzle_id).label} ${s.id.split('-').slice(1).join('-').toUpperCase()} ${n}`;
  const kp = await puzzles[puzzleInfo(s.puzzle_id).twisty].kpuzzle();
  const algs = typeof alg === "string" ? [{ alg, source: source! }] : alg;
  let parsed = new Alg(algs[0]!.alg);
  if (s.puzzle_id === "sq1") {
    let aligned: Alg | undefined;
    // Step algorithms can finish in either square alignment. Include the final
    // layer alignment so their inverse is legal from our canonical solved grip.
    for (const u of [0,1,-1,2,-2,3,-3,4,-4,5,-5,6]) for (const d of [0,1,-1,2,-2,3,-3,4,-4,5,-5,6]) {
      if (aligned) continue;
      const candidate=new Alg(`${algs[0]!.alg}${u || d ? ` (${u},${d})` : ''}`);
      try { assertLegalSquare1(kp.defaultPattern(),new Alg(`${candidate.invert()} ${candidate}`)); aligned=new Alg(square1Alg(candidate.toString())); } catch {}
    }
    if (!aligned) throw Error(`No legal square alignment: ${id}`);
    if (!aligned.isIdentical(parsed)) note='The final layer alignment returns the puzzle to the solved grip shown in the preview.';
    parsed=aligned;
  }
  const setup = s.puzzle_id === 'minx' ? parsed.invert().toString() : parsed.invert().toString().replace(/\by2'/g,'y2');
  const pattern = kp.defaultPattern().applyAlg(setup);
  if (!pattern.applyAlg(parsed).isIdentical(kp.defaultPattern())) throw Error(`Invalid solution: ${id}`);
  if (pattern.isIdentical(kp.defaultPattern())) throw Error(`Solved case: ${id}`);
  const diagram = `/cases/${s.id}-${n}.svg`;
  s.count = n;
  await writeFile(`assets${diagram}`,renderPatternSvg(await puzzles[puzzleInfo(s.puzzle_id).twisty].svg(),pattern));
  const value: CaseDto = {puzzle_id:s.puzzle_id,id,name,stage:s.stage,set:s.id,setLabel:s.label,group,
    setup,setups_alt:[],algorithms:[{...algs[0]!,alg:parsed.toString()}],diagram,...(note?{notes:note}:{})};
  cases.push(value);
  for (const other of algs.slice(1)) await also(value, other);
  return value;
}

/** SpeedCubeDB's cases (bun scripts/fetch-niche-algsets.ts), their algorithms most voted first. */
const RAW: { page: string; name: string; subgroup: string; alts: { alg: string }[] }[] = JSON.parse(readFileSync("data/raw/speedcubedb_niche.json", "utf8"));
const scdb = (page: string) => RAW.filter(c => c.page === page).map(c => ({ ...c, source: `https://speedcubedb.com/a/${page}` }));

const key = (p: KPattern) => JSON.stringify(p.patternData);
/** The turns that only change how a solved puzzle sits, by the pattern they give, for each puzzle: `[turns, undo]`. */
const SITS: Partial<Record<PuzzleId, string[][]>> = {
  sq1: [-5,-4,-3,-2,-1,0,1,2,3,4,5,6].flatMap(u => [-5,-4,-3,-2,-1,0,1,2,3,4,5,6].map(d => [`(${u},${d})`, `(${-u},${-d})`])),
  pyram: [0, 1, 2].map(n => [turn("U", n, 3), turn("U", -n, 3)]),
  minx: [0, 1, 2, 3, 4].flatMap(u => [0, 1, 2, 3, 4].map(y => [`${turn("U", u, 5)} ${turn("y", y, 5)}`.trim(), `${turn("y", -y, 5)} ${turn("U", -u, 5)}`.trim()])),
  skewb: HOLDS.map(h => [h, new Alg(h).invert().toString()]),
};
/** What may come before an algorithm: an AUF, a rotation or the square-1's alignment. */
const BEFORE: Partial<Record<PuzzleId, string[]>> = {
  sq1: [-3,-2,-1,0,1,2,3,6].flatMap(u => [-3,-2,-1,0,1,2,3,6].map(d => `(${u},${d})`)),
  pyram: ["", "U", "U'"], minx: SITS.minx!.map(([t]) => t!), skewb: HOLDS,
};
const sits = new Map<PuzzleId, Map<string, string>>();
async function sitting(puzzle: PuzzleId) {
  if (!sits.has(puzzle)) {
    const { solved } = await kit(puzzleInfo(puzzle).twisty);
    sits.set(puzzle, new Map(SITS[puzzle]!.map(([t, undo]) => [key(solved.applyAlg(t!)), undo!])));
  }
  return sits.get(puzzle)!;
}
/**
 * The algorithm written to solve the case exactly from its setup, or null: what has to come before it (an AUF, kept
 * as `pre_auf`; a rotation or the square-1's alignment, written into it) and after it (the last alignment) is found.
 */
async function solving(c: CaseDto, other: AlgEntry): Promise<AlgEntry | null> {
  const puzzle = c.puzzle_id!, { solved } = await kit(puzzleInfo(puzzle).twisty), sit = await sitting(puzzle);
  const start = solved.applyAlg(c.setup);
  for (const before of BEFORE[puzzle]!) {
    let end: KPattern;
    try { end = start.applyAlg(before).applyAlg(other.alg); } catch { return null; }
    const undo = sit.get(key(end));
    if (undo === undefined) continue;
    const auf = puzzle === "pyram" || (puzzle === "minx" && !before.includes("y")) ? before : "";
    const body = `${auf ? "" : before} ${other.alg}`;
    const alg = puzzle === "sq1" ? new Alg(square1Alg(`${body} ${undo}`)).toString() : puzzle === "skewb" ? skewbWca(solved.kpuzzle, `${body} ${undo}`) : merged(body, undo, puzzle === "minx" ? 5 : 3);
    const entry = { ...other, alg, ...(auf ? { pre_auf: auf } : {}) };
    if (!start.applyAlg(`${auf} ${alg}`).isIdentical(solved)) continue;
    if (puzzle === "sq1") try { assertLegalSquare1(solved, new Alg(`${c.setup} ${alg}`)); } catch { continue; }
    return entry;
  }
  return null;
}
/** An algorithm followed by turns, each merged into the last turn of its face. */
const merged = (alg: string, after: string, mod: number) => after.split(/\s+/).filter(Boolean).reduce((a, t) => {
  const [, face, n, prime] = /^([A-Za-z]+)(\d*)('?)$/.exec(t)!;
  return thenTurn(a, face!, Number(n || 1) * (prime ? -1 : 1), mod);
}, alg.trim());
/** Another algorithm for a case, when it solves it. */
async function also(c: CaseDto, other: AlgEntry) {
  const found = await solving(c, other);
  if (found && !c.algorithms.some(a => a.alg === found.alg && a.pre_auf === found.pre_auf)) c.algorithms.push(found);
  return !!found;
}
/**
 * SpeedCubeDB's cases of a page into a set: each algorithm goes to the case of the set it solves (with `merge`, any
 * case already there); a case none solves is added, named by `name`, its first algorithm that reads setting it up.
 */
async function fromScdb(s: NicheSet, page: string, name: (c: ReturnType<typeof scdb>[number]) => string, opts: { convert?: (alg: string) => string; group?: (c: ReturnType<typeof scdb>[number]) => string; merge?: boolean; only?: (c: ReturnType<typeof scdb>[number]) => boolean } = {}) {
  const { solved } = await kit(puzzleInfo(s.puzzle_id).twisty);
  let added = 0;
  for (const c of scdb(page).filter(opts.only ?? (() => true))) {
    const algs = c.alts.flatMap(a => { try { const alg = (opts.convert ?? (x => x))(a.alg); solved.applyAlg(alg); return [{ alg, source: c.source }]; } catch { return []; } });
    let own: CaseDto | undefined, placedAny = false;
    for (const alg of algs) {
      const candidates = opts.merge ? cases.filter(x => x.set === s.id) : own ? [own] : [];
      let placed = false;
      for (const x of candidates) if (!placed) placed = await also(x, alg);
      // An algorithm whose case cannot be set up (a square-1 cut through a corner) is passed over.
      placedAny ||= placed;
      if (!placed && !own && !placedAny) try { own = await add(s, name(c), [alg], undefined, undefined, opts.group?.(c) ?? s.label); added++; } catch (e) { console.log(`${c.page} ${c.name}: ${(e as Error).message}`); }
    }
  }
  return added;
}
await mkdir('assets/cases',{recursive:true});
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

// SpeedCubeDB's one-look sets: their algorithms join the cases above they solve, the other cases are added.
const byId = (id: string) => sets.find(x => x.id === id) as NicheSet;
/** A new set, listed right after another one of its puzzle. */
function setAfter(after: string, ...args: Parameters<typeof set>) {
  const value = set(...args);
  sets.splice(sets.indexOf(byId(after)) + 1, 0, sets.pop()!);
  return value;
}
const expand = (name: string) => name.trim().replace(/\bAdj\b/g, 'Adjacent').replace(/\bOpp\b/g, 'Opposite').replace(/ Parity$/, ' parity');
const numbered = (s: NicheSet) => () => `${s.label} ${s.count + 1}`;
s=byId('sq1-co'); await fromScdb(s,'SQ1/SQ1CO',c=>/^\d/.test(c.name)?`Corners ${c.name}`:`Corners ${expand(c.name).toLowerCase()}`,{convert:square1Alg,merge:true});
s=byId('sq1-eo'); await fromScdb(s,'SQ1/SQ1EO',c=>`Edges ${c.name}`,{convert:square1Alg,merge:true});
s=byId('sq1-cp'); await fromScdb(s,'SQ1/SQ1CP',c=>expand(c.name),{convert:square1Alg,merge:true});
s=byId('sq1-ep'); s.description='Paired swaps to place the edges, then each one-look case of both layers, named top / bottom (Vandenbergh EP).';
await fromScdb(s,'SQ1/SQ1EP',c=>expand(c.name),{convert:square1Alg,merge:true});
s=byId('sq1-parity'); await fromScdb(s,'SQ1/SQ1Parity',c=>expand(c.name),{convert:square1Alg,merge:true});
s=setAfter('sq1-shape','sq1','cubeshape','Cube shape','All shapes','Every shape back to a square in one sequence, grouped by the number of slices it takes. Names give the top layer, then the bottom.');
await fromScdb(s,'SQ1/SQ1CS',c=>c.name.trim(),{convert:square1Alg,group:c=>c.subgroup.replace(/^(\d+) Slices?$/,(_,n)=>n==='1'?'1 slice':`${n} slices`),only:c=>c.name!=='Square / Square'});

const L4E_GROUPS: Record<string,string> = {'Last Layer':'Top centre turned','L3E':'Last three edges','Flipped Edges':'Flipped edges','Polish Flip':'Polish flip','Separated Bar':'Separated bar','Connected Bar':'Connected bar','No Bar':'No bar'};
s=setAfter('pyram-ll','pyram','l4e','Last layer','Last four edges','The last four edges in one algorithm once the V is built, grouped by how the edges sit.');
await fromScdb(s,'Pyraminx/L4E',c=>c.name.replace(/^AntiSune$/,'Antisune').replace(/^Anti SUS$/,'Anti-SUS').replace(/^2 Flip$/,'Two flips').replace(/^4 Flip$/,'Four flips'),{group:c=>L4E_GROUPS[c.subgroup]!});

// Sarah's notation turns the corners R, r, B and b; S and H are her sledgehammer and hedgeslammer. In cubing.js's
// fixed corners they are R, B, UR and U (found by making every algorithm of every case agree), then written in WCA turns.
const skewb = (await kit('skewb')).kp;
const SARAH: Record<string,string> = {R:'R',r:'B',B:'UR',b:'U',S:"UL' F UL F'",H:"F UL' F' UL"};
const sarah = (alg: string) => skewbWca(skewb, alg.trim().split(/\s+/).map(t => {
  const [, l, n, prime] = /^([A-Za-z])(2?)('?)$/.exec(t) ?? [];
  if (!l || !(l in SARAH || 'xyz'.includes(l))) throw Error(`Unknown turn ${t}`);
  if ('xyz'.includes(l)) return t;
  const n_ = ((n ? 2 : 1) * (prime ? -1 : 1) + 3) % 3, base = new Alg(SARAH[l]!);
  // A corner turned twice is turned back once; S2 and H2 are done twice.
  return 'SH'.includes(l) ? Array(n ? 2 : 1).fill((prime ? base.invert() : base).toString()).join(' ') : (n_ === 1 ? base : base.invert()).toString();
}).join(' '));
const tidy = (group: string) => group.replace(/\s+/g,' ').replace(/\s*\+\s*/g,' + ').replace(/ (Perm|Sledge|Perm Conjugates)\b/g, w => w.toLowerCase()).replace(/ (Swirl|Wat|Horizontal|Vertical|Triple|Pure)\b/g, w => w.toLowerCase()).replace(/ H or Z/, ' H or Z');
const sarahName = (c: { name: string }) => c.name === 'U Perm' ? 'U perm' : `Case ${c.name}`;
s=setAfter('skewb-centers','skewb','l2l','Last layer',"Sarah's advanced",'Everything after the first layer in one algorithm (L2L): grouped by the top corners, then by how the centres move.');
await fromScdb(s,'Skewb/SarahsAdvanced',sarahName,{convert:sarah,group:c=>tidy(c.subgroup),only:c=>!/^L[45]C$/.test(c.subgroup)});
s=setAfter('skewb-l2l','skewb','l5c','Centers','Last four or five centers','The corners solved, the last four or five centers in one algorithm (L4C, L5C).');
await fromScdb(s,'Skewb/SarahsAdvanced',sarahName,{convert:sarah,group:c=>c.subgroup,only:c=>/^L[45]C$/.test(c.subgroup)});

for (const [key, page] of [['eo','MegaminxEO'],['co','MegaminxCO'],['ep','MegaminxEP'],['cp','MegaminxCP']] as const) {
  s=byId(`minx-${key}`); await fromScdb(s,`Megaminx/${page}`,numbered(s),{merge:true});
}

await writeFile('data/niche-catalog.json',JSON.stringify({sets,cases},null,2)+'\n');
console.log(`${cases.length} verified cases across ${sets.length} sets.`);
