import {expect,test} from 'bun:test';
import {Alg} from 'cubing/alg';
import {puzzles} from 'cubing/puzzles';
import {cases,sets} from '../src/frontend/local/catalog';
import {PUZZLES,puzzleOf,puzzleInfo} from '../src/shared/puzzles';
import {renderPatternSvg,assertLegalSquare1} from '../scripts/niche-model';
import {readFile} from 'node:fs/promises';

test('all selectable puzzles have a distinct, nonempty algorithm and training catalogue',()=>{
  expect(new Set(cases.map(c=>c.id)).size).toBe(cases.length);
  for(const p of PUZZLES){
    const puzzleCases=cases.filter(c=>puzzleOf(c)===p.id),puzzleSets=sets.filter(s=>puzzleOf(s)===p.id);
    expect(puzzleCases.length,p.label).toBeGreaterThan(0);
    expect(puzzleSets.length,p.label).toBeGreaterThan(0);
    for(const s of puzzleSets)expect(puzzleCases.filter(c=>c.set===s.id)).toHaveLength(s.count);
  }
});

test('each niche solution resolves its real puzzle and every saved diagram matches the setup',async()=>{
  for(const p of PUZZLES.filter(p=>!p.cubeSize)){
    const loader=puzzles[p.twisty],kp=await loader.kpuzzle(),solved=kp.defaultPattern(),svg=await loader.svg();
    for(const c of cases.filter(c=>puzzleOf(c)===p.id)){
      const pattern=solved.applyAlg(c.setup);
      expect(pattern.isIdentical(solved),c.id).toBe(false);
      for(const a of c.algorithms){
        expect(pattern.applyAlg(`${a.pre_auf??''} ${a.alg}`).isIdentical(solved),c.id).toBe(true);
        if(p.id==='sq1')assertLegalSquare1(solved,new Alg(`${c.setup} ${a.alg}`));
      }
      expect(c.diagram,c.id).toBeDefined();
      expect(await readFile(`public${c.diagram}`,'utf8'),c.id).toBe(renderPatternSvg(svg,pattern));
    }
  }
});

test('Square-1 legality checks reject cuts through a corner independently of algebraic cancellation',async()=>{
  const solved=(await puzzles.square1.kpuzzle()).defaultPattern();
  expect(()=>assertLegalSquare1(solved,new Alg('(2,0) / / (-2,0)'))).toThrow('cuts a corner');
  expect(()=>assertLegalSquare1(solved,new Alg('(1,0) / / (-1,0)'))).not.toThrow();
});

test('last-layer drills preserve the completed part of Pyraminx and Megaminx',async()=>{
  const py=(await puzzles.pyraminx.kpuzzle()).defaultPattern();
  for(const c of cases.filter(c=>c.set==='pyram-ll')){
    const data=py.applyAlg(c.setup).patternData;
    expect(data.CORNERS,c.id).toEqual(py.patternData.CORNERS);
    expect(data.CORNERS2,c.id).toEqual(py.patternData.CORNERS2);
    const moved=data.EDGES.pieces.filter((piece,i)=>piece!==i||data.EDGES.orientation[i]!==0);
    expect(moved.length,c.id).toBeLessThanOrEqual(3);
  }
  const kp=await puzzles.megaminx.kpuzzle(),solved=kp.defaultPattern();
  const upper=kp.moveToTransformation('U').transformationData;
  for(const c of cases.filter(c=>puzzleOf(c)==='minx'&&c.set!=='minx-pairs')){
    const actual=solved.applyAlg(c.setup).patternData;
    // Ignore whole-puzzle grip changes in these two source CP sequences.
    if(/\by/.test(c.algorithms[0].alg))continue;
    for(const orbit of ['CORNERS','EDGES'])for(let i=0;i<actual[orbit].pieces.length;i++){
      if(upper[orbit].permutation[i]!==i)continue;
      expect(actual[orbit].pieces[i],c.id).toBe(i);
      expect(actual[orbit].orientation[i],c.id).toBe(0);
    }
  }
});
