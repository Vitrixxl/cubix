/** Real keyboard/mouse smoke tests, isolated from personal data. */
import {mkdtemp,rm,writeFile,rename,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'cubix-interactions-'));
const fixture=await Bun.file('artifacts/gpui/reference-storage.json').json();
await writeFile(join(dir,'storage.json'),JSON.stringify(fixture.guest),{mode:0o600});
const p=Bun.spawn([resolve('desktop/target/debug/cubix-desktop')],{env:{...process.env,WAYLAND_DISPLAY:'',CUBIX_API_ORIGIN:'http://127.0.0.1:47139',CUBIX_DESKTOP_DATA:dir,CUBIX_REFERENCE_CONTROL:dir},stdout:'ignore',stderr:'inherit'});
const x=process.env.CUBIX_XDOTOOL??'xdotool';
async function run(args:string[]){const p=Bun.spawn(args,{stdout:'pipe',stderr:'pipe'});const result=await new Response(p.stdout).text();if(await p.exited)throw Error(await new Response(p.stderr).text());return result.trim();}
async function state(){return Bun.file(join(dir,'state.json')).json();}
async function wait(test:(s:any)=>boolean){for(let i=0;i<300;i++){if(p.exitCode!==null)throw Error('Native app exited');try{const s=await state();if(s.error)throw Error(s.error);if(test(s))return s;}catch(e){if(i===299)throw e;}await Bun.sleep(20);}throw Error('Timed out waiting for UI');}
async function command(v:any){await writeFile(join(dir,'command.tmp'),JSON.stringify(v));await rename(join(dir,'command.tmp'),join(dir,'command.json'));while(await Bun.file(join(dir,'command.json')).exists())await Bun.sleep(20);return wait(s=>s.pending===0&&!s.saving&&!s.generating);}
try{
await wait(s=>s.pending===0&&!s.generating&&s.bounds['menu:modes']);
const win=(await run([x,'search','--pid',String(p.pid)])).split('\n').at(-1)!;
await run([x,'windowsize',win,'1280','800','windowmove',win,'0','0','windowfocus',win]);await Bun.sleep(150);
const click=async(key:string)=>{const b=(await state()).bounds[key];await run([x,'mousemove','--window',win,String(Math.round(b.x+b.w/2)),String(Math.round(b.y+b.h/2)),'click','1']);};
const initial=(await state()).scramble;await click('next');await wait(s=>s.scramble!==initial&&!s.generating);console.log('scramble: button generates a new scramble');const clicked=(await state()).scramble;await run([x,'key','alt+n']);await wait(s=>s.scramble!==clicked&&!s.generating);console.log('scramble: Alt+N generates a new scramble');
await click('menu:modes');await wait(s=>s.overlay==='modes');await run([x,'key','Down','Return']);await wait(s=>s.solveMode==='one-handed'&&s.overlay===''&&s.pending===0&&!s.generating);console.log('select: anchored click, arrows and Enter OK');
await click('menu:modes');await run([x,'key','Escape']);await wait(s=>s.overlay==='');console.log('select: Escape OK');
await run([x,'keydown','space']);await Bun.sleep(90);await run([x,'keyup','space']);await wait(s=>s.phase==='Idle');if((await state()).solves!==0)throw Error('Early release incorrectly saved');console.log('timer: short hold cancels');
const preSolveScramble=(await state()).scramble;await run([x,'keydown','space']);await wait(s=>s.phase==='Ready');await run([x,'keyup','space']);await wait(s=>s.phase==='Running');await Bun.sleep(180);await run([x,'key','a']);
const solved=await wait(s=>s.solves===1&&!s.saving&&s.pending===0);if(solved.scramble===preSolveScramble)throw Error('Scramble did not change after solve');const metrics=Object.fromEntries(solved.metrics);if(metrics.Solves!=='1'||metrics.Best!==metrics.Mean)throw Error('Inconsistent statistics');console.log('timer: stop and atomic statistics OK');
await command({actions:['nav:algorithms','case:F2L 1']});
await run([x,'mousemove','--window',win,'600','400','click','8']);await wait(s=>s.page==='algorithms'&&s.case==='');
await run([x,'click','8']);await wait(s=>s.page==='playground');
await run([x,'click','9']);await wait(s=>s.page==='algorithms'&&s.case==='');
await run([x,'click','9']);await wait(s=>s.case==='F2L 1');
await run([x,'key','alt+Left']);await wait(s=>s.case==='');
await command({actions:['nav:training']});await run([x,'click','9']);await Bun.sleep(80);if((await state()).page!=='training')throw Error('Forward history not cleared by new navigation');
console.log('navigation: mouse Back/Forward, Alt+Left, and new history branch OK');
await command({actions:['nav:algorithms']});const before=await state();await run([x,'mousemove','--window',win,'960','540','click','--repeat','20','--delay','25','5']);await Bun.sleep(150);const after=await state();if(after.virtualRowsRendered<=before.virtualRowsRendered)throw Error('Scroll did not paint list rows');console.log('catalog: scroll completed, visible rows painted',after.virtualRowsRendered-before.virtualRowsRendered);
await command({actions:['stage:PLL']});await Bun.sleep(100);await mkdir('artifacts/gpui/interaction-tests',{recursive:true});await run(['import','-window',win,'artifacts/gpui/interaction-tests/catalog-pll.png']);
await command({actions:['nav:training','selectSet:f2l']});await Bun.sleep(200);await run(['import','-window',win,'artifacts/gpui/interaction-tests/selector.png']);
await command({actions:['nav:playground']});await run([x,'windowsize',win,'1280','1000']);await Bun.sleep(160);await run(['import','-window',win,'artifacts/gpui/interaction-tests/toolbar.png']);
const toolbarState=await state();if(toolbarState.bounds['menu:scrambles'].x>30)throw Error('Toolbar still centered in timer column');
await run([x,'windowsize',win,'390','844']);await Bun.sleep(180);await click('menu:modes');await wait(s=>s.overlay==='modes');await run(['import','-window',win,'artifacts/gpui/interaction-tests/compact-select.png']);await run([x,'key','End','Return']);await wait(s=>s.solveMode==='blindfolded'&&s.overlay==='');console.log('compact select: resize, End and Enter OK');
await Bun.write('artifacts/gpui/interaction-tests/result.json',JSON.stringify({passed:true,tests:10,paintedRows:after.virtualRowsRendered-before.virtualRowsRendered},null,2));
}finally{p.kill();await p.exited;await rm(dir,{recursive:true,force:true});}
