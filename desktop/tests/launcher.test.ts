/** Real compiled launcher + signed HTTP updates, using a headless process fixture instead of Electron. */
import {beforeAll, afterAll, test, expect} from 'bun:test';
import {generateKeyPairSync, sign} from 'node:crypto';
import {mkdtemp, mkdir, writeFile, cp, rm, readFile, chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {sha256, type Manifest} from '../updater';
let suite: string;
const keys = generateKeyPairSync('ed25519');
const publicKey = keys.publicKey.export({type:'spki',format:'pem'}).toString();
// Stands in for Electron: the startup window answers the launcher's protocol, the app acknowledges startup.
const runtime = `#!${process.execPath}
import {createInterface} from 'node:readline';
import {appendFileSync, writeFileSync} from 'node:fs';
if (process.argv.at(-1).endsWith('splash.cjs')) {
  process.stdout.write('ready\\n');
  createInterface({input:process.stdin}).on('line',line=>{
    appendFileSync(process.env.FIXTURE_STATUS,line+'\\n');
    if(JSON.parse(line).phase==='opening') {
      if(process.env.FIXTURE_CANCEL){process.stdout.write('cancel\\n');process.exit(0);}
      setTimeout(()=>process.stdout.write('settled\\n'),50);
    }
  }).on('close',()=>process.exit(0));
} else {
  appendFileSync(process.env.FIXTURE_LAUNCHES,process.env.CUBIX_RELEASE_ID+' '+(process.env.CUBIX_STARTUP_NOTICE??'-')+'\\n');
  if (process.env.FIXTURE_FAIL_APP) process.exit(42);
  writeFileSync(process.env.CUBIX_LAUNCH_READY,'ready');
  await Bun.sleep(500);
}
`;
const signed = (m: Manifest) => {
  const manifest=JSON.stringify(m);
  return {manifest,signature:sign(null,Buffer.from(manifest),keys.privateKey).toString('base64')};
};
beforeAll(async()=>{
  suite=await mkdtemp(join(tmpdir(),'cubix-launcher-headless-'));
  const build=Bun.spawn([process.execPath,'build',resolve('desktop/launcher.ts'),'--compile','--outfile',join(suite,'cubix')],{stdout:'ignore',stderr:'pipe'});
  expect(await build.exited).toBe(0);
});
afterAll(async()=>{await Bun.sleep(600);await rm(suite,{recursive:true,force:true});});
async function fixture() {
  const base=await mkdtemp(join(suite,'case-'));
  const files=new Map<string,string>([['runtime/electron',runtime],['app/main.cjs','initial'],['app/package.json','{}'],['app/renderer/index.html','initial']]);
  function manifest(build:number):Manifest {return {schema:1,target:'linux-x64',build,commit:'test',files:[...files].map(([path,body])=>({path,sha256:sha256(body),size:Buffer.byteLength(body),executable:path==='runtime/electron'}))};}
  const initial=manifest(1);const old=sha256(JSON.stringify(initial));
  for(const [path,body] of files){const out=join(base,'releases',old,path);await mkdir(join(out,'..'),{recursive:true});await writeFile(out,body);await chmod(out,0o755);}
  await writeFile(join(base,'releases',old,'release.json'),JSON.stringify(initial));
  await writeFile(join(base,'current.json'),JSON.stringify({id:old}));
  await cp(join(suite,'cubix'),join(base,'cubix'));
  let release=signed(initial), fail=false;
  let gate:Promise<void>=Promise.resolve();
  let assetGate:Promise<void>=Promise.resolve();
  let requests=0,downloads=0;
  const server=Bun.serve({port:0,async fetch(req){
    if(new URL(req.url).pathname.includes('/releases/')){requests++;await gate;return fail?new Response('failure',{status:503}):Response.json(release);}
    downloads++;await assetGate;
    const hash=new URL(req.url).pathname.split('/').at(-1);
    const body=[...files.values()].find(body=>sha256(body)===hash);
    return body===undefined?new Response('missing',{status:404}):new Response(body);
  }});
  await writeFile(join(base,'launcher.json'),JSON.stringify({origin:server.url.origin,target:'linux-x64',publicKey}));
  const launch=(env:Record<string,string>={})=>Bun.spawn([join(base,'cubix')],{env:{...process.env,DISPLAY:'',WAYLAND_DISPLAY:'',CUBIX_API_ORIGIN:server.url.origin,FIXTURE_LAUNCHES:join(base,'launches'),FIXTURE_STATUS:join(base,'status'),...env},stdout:'pipe',stderr:'pipe'});
  const text=async(name:string)=>await Bun.file(join(base,name)).exists()?await readFile(join(base,name),'utf8'):'';
  return {base,old,server,launch,launched:()=>text('launches'),status:()=>text('status'),
    publish(){files.set('app/main.cjs','updated'); release=signed(manifest(2));return sha256(release.manifest);},
    fail(){fail=true;},tamper(){release.signature='invalid';},
    hold(){let done!:()=>void;gate=new Promise(resolve=>{done=resolve});return done;},
    holdAssets(){let done!:()=>void;assetGate=new Promise(resolve=>{done=resolve});return done;},
    requests:()=>requests,downloads:()=>downloads,
  };
}
async function until(predicate:()=>boolean|Promise<boolean>){for(let i=0;i<300;i++){if(await predicate())return;await Bun.sleep(10);}throw Error('fixture timed out');}
test('compiled launcher waits for manifest AND assets, then launches the updated release',async()=>{
  const f=await fixture(), id=f.publish(), release=f.hold(), assets=f.holdAssets();let child:ReturnType<typeof f.launch>|undefined;
  try {
    child=f.launch();await until(()=>f.requests()>0);expect(await f.launched()).toBe('');
    release();await until(()=>f.downloads()>0);expect(await f.launched()).toBe('');
    assets();expect(await child.exited).toBe(0);expect((await f.launched()).trim()).toBe(`${id} -`);
    expect((await Bun.file(join(f.base,'last-launch.json')).json()).id).toBe(id);
    expect((await Bun.file(join(f.base,'current.json')).json()).id).toBe(id);
    const status=await f.status();
    expect(status).toContain('Recherche de mises à jour');
    expect(status).toContain('"phase":"opening"');
    expect(status.indexOf('"phase":"opening"')).toBe(status.lastIndexOf('"phase":"opening"'));
  } finally {release();assets();child?.kill();f.server.stop();}
},15000);
test('no update launches current only after verification, without any notice',async()=>{
  const f=await fixture();try{const child=f.launch();expect(await child.exited).toBe(0);expect((await f.launched()).trim()).toBe(`${f.old} -`);expect(f.requests()).toBe(1);expect(f.downloads()).toBe(0);}finally{f.server.stop();}
});
test('without a connection the installed version opens and the app is told it is offline',async()=>{
  const f=await fixture();f.publish();f.server.stop(true);
  const child=f.launch();expect(await child.exited).toBe(0);
  expect((await f.launched()).trim()).toBe(`${f.old} offline`);
  expect(await Bun.file(join(f.base,'update-error.log')).exists()).toBe(true);
  expect(await f.status()).toContain('Hors ligne. Ouverture de Cubix');
});
for(const failure of ['server','signature'] as const)test(`a ${failure} failure opens the installed version and reports the failed update`,async()=>{
  const f=await fixture();try{f.publish();if(failure==='server')f.fail();else f.tamper();const child=f.launch();expect(await child.exited).toBe(0);expect((await f.launched()).trim()).toBe(`${f.old} update-failed`);expect(await Bun.file(join(f.base,'update-error.log')).exists()).toBe(true);expect((await Bun.file(join(f.base,'current.json')).json()).id).toBe(f.old);}finally{f.server.stop();}
});
test('a new version that fails to start rolls back to the previous one during the same startup',async()=>{
  const f=await fixture();const next=f.publish();try{
    const child=f.launch({FIXTURE_FAIL_APP:'1'});await child.exited;
    expect((await f.launched()).trim().split('\n')[0]).toBe(`${next} -`);
    expect((await Bun.file(join(f.base,'failed.json')).json()).id).toBe(next);
    expect((await Bun.file(join(f.base,'current.json')).json()).id).toBe(f.old);
  }finally{f.server.stop();}
});
test('closing the startup window before the app starts cancels the launch',async()=>{
  const f=await fixture();try{
    const child=f.launch({FIXTURE_CANCEL:'1'});expect(await child.exited).toBe(0);
    expect(await f.launched()).toBe('');
    expect(await Bun.file(join(f.base,'last-launch.json')).exists()).toBe(false);
  }finally{f.server.stop();}
});
