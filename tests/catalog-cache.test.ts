import {test,expect} from 'bun:test';
import {createCatalogCache,evictCatalogCache,CATALOG_CACHE_PREFIX} from '../src/frontend/local/catalog-cache';
import {PUZZLES} from '../src/shared/puzzles';
function storage(){const values=new Map<string,string>();let writes=0;return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{writes++;values.set(key,value);},removeItem:(key:string)=>{values.delete(key);},values,writes:()=>writes};}
test('all puzzle algorithms persist across client reopening without fetching or rewriting',()=>{
  const s=storage(),first=createCatalogCache(s);
  for(const p of PUZZLES){const catalog=first(p.id);expect(catalog.cases.length).toBeGreaterThan(0);expect(first(p.id)).toBe(catalog);}
  expect(s.writes()).toBe(PUZZLES.length);
  const reopened=createCatalogCache(s);
  for(const p of PUZZLES)expect(reopened(p.id)).toEqual(first(p.id));
  expect(s.writes()).toBe(PUZZLES.length);
});
test('outdated, malformed and unavailable caches recover from the shipped catalogue',()=>{
  for(const bad of ['{',JSON.stringify({version:'old',cases:[],sets:[]})]){const s=storage();s.setItem(CATALOG_CACHE_PREFIX+'333',bad);expect(createCatalogCache(s)(3).cases.length).toBe(228);expect(JSON.parse(s.getItem(CATALOG_CACHE_PREFIX+'333')!).cases.length).toBe(228);}
  const unavailable={getItem:()=>{throw Error('denied');},setItem:()=>{throw Error('full');},removeItem:()=>{throw Error('denied');}};
  expect(createCatalogCache(unavailable)('sq1').cases.length).toBe(29);
});
test('cache eviction frees space without removing times, accounts or preferences',()=>{
  const s=storage();s.setItem('cubix.local.v1:workspace:guest','personal solves');s.setItem('theme','dark');const cache=createCatalogCache(s);cache(3);cache(7);evictCatalogCache(s);
  expect([...s.values]).toEqual([['cubix.local.v1:workspace:guest','personal solves'],['theme','dark']]);
});
