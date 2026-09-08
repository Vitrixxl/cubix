/** Real Rust processes and disposable SQLite files for HTTP and WebSocket tests. */
import { afterEach } from "bun:test";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openDb as database } from "../scripts/sqlite";
import type { CaseDto } from "../src/shared/types";

const sets = JSON.parse(readFileSync(resolve('rust-api/catalog-sets.json'), 'utf8')) as {id:string;label:string;stage:string}[];
export const CASES: CaseDto[] = sets.flatMap(set => {
  const data = JSON.parse(readFileSync(resolve('data', set.id + '.json'), 'utf8'));
  return data.cases.map((c: any) => ({ id:c.id,name:c.name,stage:set.stage,set:set.id,setLabel:set.label,group:c.group,
    ...(c.subgroup ? {subgroup:c.subgroup} : {}), ...(c.probability ? {probability:c.probability} : {}),
    setup:c.setup,setups_alt:c.setups_alt??[],algorithms:c.algorithms.map(({verified, ...alg}: any)=>alg) }));
});
const temporary: string[] = [];
const children: ChildProcess[] = [];
afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
      child.kill(); await exited;
    }
  }
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});
export function openDb(path = ":memory:") {
  if (path === ":memory:") {
    const dir = mkdtempSync(join(tmpdir(), "cubix-api-test-")); temporary.push(dir); path = join(dir, "test.db");
  }
  return database(path);
}
export function createApi(db: {path:string}) { return createRustApi(db.path); }
export function createRustApi(path: string) {
  const reservation = spawnSync(process.execPath, ['-e', `
    const s=require('node:net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()});
  `], { encoding: 'utf8' });
  if (reservation.status !== 0) throw Error(reservation.stderr);
  const port = Number(reservation.stdout.trim());
  const child = spawn(resolve("rust-api/target/release/cubix-api"), [], {
    env: { ...process.env, CUBIX_DB:path, CUBIX_HOST:"127.0.0.1", PORT:String(port), CUBIX_EXTRA_PORTS:"" }, stdio:['ignore','ignore','inherit'],
  });
  children.push(child);
  const origin=`http://127.0.0.1:${port}`;
  const probe=spawnSync(process.execPath,['--input-type=module','-e',`
    for(let i=0;i<100;i++){
      try{if((await fetch(process.env.CUBIX_TEST_ORIGIN+'/api/health')).ok)process.exit(0)}catch{}
      await new Promise(r=>setTimeout(r,20));
    }process.exit(1);
  `],{env:{...process.env,CUBIX_TEST_ORIGIN:origin},encoding:'utf8'});
  if(probe.status!==0)throw Error('Rust test server did not start: '+probe.stderr);
  const app={
    server:{port,stop(_force?:boolean){child.kill()}},
    listen(_options?:unknown){return app},
    async handle(request:Request){
      const url=new URL(request.url);
      return fetch(origin+url.pathname+url.search, { method:request.method, headers:request.headers,
        body:['GET','HEAD'].includes(request.method)?undefined:new Uint8Array(await request.arrayBuffer()) });
    },
  };
  return app;
}
