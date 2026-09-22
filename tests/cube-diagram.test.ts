import { describe, expect, test } from 'bun:test';
import { cases } from '../src/client/local/catalog';
import { applyAlg, solved } from '../src/shared/cube';
import { diagramPaths, isoCells, mergeCells, topLayerCells } from '../src/shared/cubeDiagram';
import { caseState, maskForStage } from '../src/client/lib/caseState';
import { viewForStage } from '../src/shared/cubeDiagram';

const subpaths = (d: string) => d.split('M').length - 1;

describe('merged diagram paths', () => {
  test('every tile of the isometric view lands in the path of its own colour', () => {
    const state = applyAlg(solved(), "R U R' U'");
    const cells = isoCells(state, 'full');
    const tiles = mergeCells(cells);
    expect(tiles.reduce((sum, { d }) => sum + subpaths(d), 0)).toBe(27);
    expect(tiles.length).toBeLessThanOrEqual(7);
    for (const cell of cells) expect(tiles.find(t => t.fill === cell.fill)!.d).toContain(`M${cell.points.replaceAll(' ', 'L')}Z`);
  });
  test('the isometric diagram keeps its hull and three edges; the top view has neither', () => {
    const state = applyAlg(solved(), "F R U R' U' F'");
    const iso = diagramPaths(state, 'full', 'iso');
    // Android's native PathParser rejects polygon coordinates in a Path's d prop.
    expect(iso.hull).toMatch(/^M[-\d.,L]+Z$/);
    expect(subpaths(iso.hull!)).toBe(1);
    expect(subpaths(iso.edges!)).toBe(3);
    const top = diagramPaths(state, 'OLL', 'top');
    expect(top.hull).toBeUndefined();
    expect(top.edges).toBeUndefined();
    expect(top.tiles.reduce((sum, { d }) => sum + subpaths(d), 0)).toBe(topLayerCells(state, 'OLL', 'top').length);
  });
  test('paths are memoised per state, mask and view', () => {
    const state = solved(4);
    expect(diagramPaths(state, 'full', 'iso')).toBe(diagramPaths(state, 'full', 'iso'));
    expect(diagramPaths(state, 'full', 'iso')).not.toBe(diagramPaths(state, 'full', 'top'));
    expect(diagramPaths(state, 'full', 'iso').tiles.reduce((sum, { d }) => sum + subpaths(d), 0)).toBe(48);
  });
  test('every catalogue cube case renders in a handful of paths', () => {
    for (const c of cases.filter(c => !c.diagram)) {
      const { hull, tiles, edges } = diagramPaths(caseState(c), maskForStage(c.stage), viewForStage(c.stage));
      if (hull) expect(hull, c.id).toMatch(/^M[-\d.,L]+Z$/);
      if (edges) expect(edges, c.id).toMatch(/^(M[-\d.,L]+)+$/);
      for (const { d } of tiles) expect(d, c.id).toMatch(/^(M[-\d.,L]+Z)+$/);
      expect(tiles.length, c.id).toBeGreaterThan(0);
      expect(tiles.length, c.id).toBeLessThanOrEqual(8);
    }
  });
});
