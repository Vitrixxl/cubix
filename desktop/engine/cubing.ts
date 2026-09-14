// Keep cubing's worker module graph intact. Flattening it into the RPC bundle
// changes import.meta URLs and prevents competition scramblers from starting.
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
const base=process.env.CUBIX_DESKTOP_VENDOR??join(process.execPath.includes('cubix-engine')?dirname(process.execPath):import.meta.dir,'vendor','cubing');
const module=(name:string)=>import(pathToFileURL(join(base,name,'index.js')).href);
export const loadScrambler = () => module('scramble');
export const loadSearch = () => module('search');
export const loadKPuzzle = () => module('kpuzzle');
