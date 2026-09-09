import type { Alg } from 'cubing/alg';
import { Move } from 'cubing/alg';
import type { KPattern } from 'cubing/kpuzzle';

/** Render cubing.js's sticker-addressed SVG template at an exact puzzle pattern. */
export function renderPatternSvg(template: string, pattern: KPattern): string {
  const colors = new Map<string,string>();
  for (const match of template.matchAll(/<[^>]+\bid="([\w]+-l\d+-o\d+)"[^>]*>/g)) {
    colors.set(match[1], /\bstyle="[^"]*fill:\s*([^;"\s]+)/.exec(match[0])?.[1] ?? 'none');
  }
  const targetColors = new Map<string,string>();
  for (const orbit of pattern.kpuzzle.definition.orbits) {
    const data = pattern.patternData[orbit.orbitName];
    for (let i=0;i<orbit.numPieces;i++) for(let o=0;o<orbit.numOrientations;o++) {
      const from = `${orbit.orbitName}-l${data.pieces[i]}-o${(o-data.orientation[i]+orbit.numOrientations)%orbit.numOrientations}`;
      targetColors.set(`${orbit.orbitName}-l${i}-o${o}`,colors.get(from) ?? 'none');
    }
  }
  return template.replace(/<\?xml[^>]*>|<!DOCTYPE[^>]*>/g,'').replace(/<[^>]+\b(?:id|data-copy-id)="([\w]+-l\d+-o\d+)"[^>]*>/g,(tag,id) => {
    const fill=`fill:${targetColors.get(id) ?? 'none'}`;
    return /\bstyle="/.test(tag) ? tag.replace(/\bstyle="[^"]*"/,`style="${fill}"`) : tag.replace(/\s*\/?\s*>$/, (end:string)=>` style="${fill}"${end}`);
  });
}

/** KPuzzle alone allows cuts through corners; enforce Square-1's bandaging too. */
export function assertLegalSquare1(start: KPattern, alg: Alg): void {
  const cornerPairs = [[0,1],[3,4],[6,7],[9,10],[13,14],[16,17],[19,20],[22,23]];
  let pattern=start;
  for (const node of alg.experimentalExpand()) {
    if (!(node instanceof Move)) continue;
    if (node.family === '_SLASH_') {
      const pieces=pattern.patternData.WEDGES.pieces;
      for(const [a,b] of [[5,6],[11,0],[17,18],[23,12]]) {
        if(cornerPairs.some(pair=>pair.includes(pieces[a])&&pair.includes(pieces[b])))throw Error(`Square-1 cuts a corner before ${node} in ${alg}`);
      }
    }
    pattern=pattern.applyMove(node);
  }
}
