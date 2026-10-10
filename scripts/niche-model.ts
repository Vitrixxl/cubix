import type { Alg } from 'cubing/alg';
import { Move } from 'cubing/alg';
import type { KPattern } from 'cubing/kpuzzle';
import { FACE_HEX, MINX_HEX } from '../src/shared/cubeAppearance';

/** cubing.js's sticker colours, mapped onto the app's softened palette (`FACE_HEX`, `MINX_HEX`). */
const SOFT: Record<string, number> = {
  white: FACE_HEX.D, '#ffffff': FACE_HEX.D, yellow: FACE_HEX.U, '#f4f400': FACE_HEX.U, red: FACE_HEX.R, '#ff0000': FACE_HEX.R,
  orange: FACE_HEX.L, '#ff8000': FACE_HEX.L, limegreen: FACE_HEX.B, '#44ee00': FACE_HEX.B, '#26f': FACE_HEX.F, '#2266ff': FACE_HEX.F,
  '#008800': MINX_HEX.F, '#8800dd': MINX_HEX.L, '#0000ff': MINX_HEX.BR, '#ff66cc': MINX_HEX.DBR, '#99ff00': MINX_HEX.B,
  '#3399ff': MINX_HEX.DL, '#e8d0a0': MINX_HEX.DR, '#888888': MINX_HEX.D,
};
const soft = (fill: string) => fill.toLowerCase() in SOFT ? `#${SOFT[fill.toLowerCase()]!.toString(16).padStart(6, '0')}` : fill;

/** Render cubing.js's sticker-addressed SVG template at an exact puzzle pattern. */
export function renderPatternSvg(template: string, pattern: KPattern): string {
  const colors = new Map<string,string>();
  for (const match of template.matchAll(/<[^>]+\bid="([\w]+-l\d+-o\d+)"[^>]*>/g)) {
    colors.set(match[1], soft(/\bstyle="[^"]*fill:\s*([^;"\s]+)/.exec(match[0])?.[1] ?? 'none'));
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
