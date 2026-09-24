import {expect, test} from 'bun:test';
import {appearanceFromStorage} from '../appearance';
import {THEMES} from '../../src/client/lib/theme';
for (const theme of THEMES) for (const light of [false, true]) {
  test(`startup reads the app's stored ${theme.id} ${light ? 'light' : 'dark'} appearance`, () => {
    expect(appearanceFromStorage({'cubix.ui.theme':JSON.stringify(theme.id), 'cubix.ui.colorMode':JSON.stringify(light ? 'light' : 'dark')})).toEqual({themeName:theme.id,light});
  });
}
test('missing and invalid preferences fall back to the app defaults', () => {
  for (const values of [{},{'cubix.ui.theme':'broken','cubix.ui.colorMode':'invalid'},{'cubix.ui.theme':'"unknown"','cubix.ui.colorMode':'"system"'}]) {
    expect(appearanceFromStorage(values)).toEqual({themeName:'t3-code',light:false});
  }
});
