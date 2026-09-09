import {cases,sets} from './catalog';
import {PUZZLES,puzzleId,puzzleOf,type PuzzleInput} from '../../shared/puzzles';
import type {CaseDto,SetDto} from '../../shared/types';
type Storage=Pick<globalThis.Storage,'getItem'|'setItem'|'removeItem'>;
export const CATALOG_CACHE_PREFIX='cubix.catalog.v1:';
interface Catalog {cases:CaseDto[];sets:SetDto[]}
const bundled=new Map<string,{version:string;catalog:Catalog}>();
function contentVersion(catalog:Catalog){
  const text=JSON.stringify(catalog);let hash=2166136261;
  for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
  return `${text.length}-${hash>>>0}`;
}
function source(puzzle:string){
  let value=bundled.get(puzzle);
  if(!value){
    const catalog={cases:cases.filter(c=>puzzleOf(c)===puzzle),sets:sets.filter(s=>puzzleOf(s)===puzzle)};
    // A content version invalidates corrected algorithms without an expiry or network revalidation.
    value={version:contentVersion(catalog),catalog};bundled.set(puzzle,value);
  }
  return value;
}
export function evictCatalogCache(storage:Storage){
  for(const puzzle of PUZZLES)try{storage.removeItem(CATALOG_CACHE_PREFIX+puzzle.id);}catch{/* Optional cache. */}
}
/** Public, immutable catalogue only. Personal times/statistics are never cached here. */
export function createCatalogCache(storage:Storage){
  const memory=new Map<string,Catalog>();
  return (input:PuzzleInput):Catalog=>{
    const puzzle=puzzleId(input),existing=memory.get(puzzle);if(existing)return existing;
    const {version,catalog}=source(puzzle),key=CATALOG_CACHE_PREFIX+puzzle;
    try{
      const cached=JSON.parse(storage.getItem(key)??'null');
      if(cached?.version===version&&Array.isArray(cached.cases)&&Array.isArray(cached.sets)&&contentVersion({cases:cached.cases,sets:cached.sets})===version){
        const result={cases:cached.cases,sets:cached.sets};memory.set(puzzle,result);return result;
      }
    }catch{/* A damaged cache can always be rebuilt from the bundled catalogue. */}
    try{storage.setItem(key,JSON.stringify({version,...catalog}));}catch{/* Keep working from memory if browser storage is unavailable. */}
    memory.set(puzzle,catalog);return catalog;
  };
}
