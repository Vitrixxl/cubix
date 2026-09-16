/** Capture real GPUI frames against the same isolated fixture as capture.ts.
 * Build with --features reference; the control interface is absent from normal builds.
 * Requires an X11 test display with a window manager, ImageMagick and xdotool.
 */
import {mkdtemp,rm,mkdir,writeFile,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const origin=process.env.CUBIX_REFERENCE_ORIGIN??'http://127.0.0.1:47139';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('Local fixture API required');
const fixture=await Bun.file('artifacts/gpui/reference-storage.json').json();
const out='artifacts/gpui/native';await mkdir(out,{recursive:true});
const xdotool=process.env.CUBIX_XDOTOOL??'xdotool';
async function run(args:string[]){const p=Bun.spawn(args,{env:process.env,stdout:'pipe',stderr:'pipe'});const text=await new Response(p.stdout).text();if(await p.exited)throw Error(await new Response(p.stderr).text());return text.trim();}
for(const [variant,width,height] of [['desktop',1280,800],['compact',390,844]] as const){
for(const account of [false,true]){
 const dir=await mkdtemp(join(tmpdir(),'cubix-native-capture-'));await writeFile(join(dir,'storage.json'),JSON.stringify(account?fixture.account:fixture.guest),{mode:0o600});
 const child=Bun.spawn([resolve('desktop/target/debug/cubix-desktop')],{env:{...process.env,WAYLAND_DISPLAY:'',CUBIX_WIDTH:String(width),CUBIX_HEIGHT:String(height),CUBIX_API_ORIGIN:origin,CUBIX_DESKTOP_DATA:dir,CUBIX_REFERENCE_CONTROL:dir},stdout:'ignore',stderr:Bun.file(join(dir,'stderr.log'))});
 let state:any;
 async function ready(){for(let i=0;i<300;i++){if(child.exitCode!==null)throw Error('GPUI exited: '+await Bun.file(join(dir,'stderr.log')).text());try{state=await Bun.file(join(dir,'state.json')).json();if(state.pending===0&&!state.generating&&!state.saving){if(state.error)throw Error(state.error);return;}}catch(e){if(i===299)throw e;}await Bun.sleep(50);}throw Error('GPUI not ready');}
 async function command(value:any){await writeFile(join(dir,'command.tmp'),JSON.stringify(value));await rename(join(dir,'command.tmp'),join(dir,'command.json'));for(let i=0;i<100&&await Bun.file(join(dir,'command.json')).exists();i++)await Bun.sleep(40);await ready();await Bun.sleep(120);}
 const act=async(...actions:string[])=>command({actions});
 let win='';
 try{
 await ready();win=(await run([xdotool,'search','--pid',String(child.pid)])).split('\n').at(-1)!;
 await run([xdotool,'windowsize',win,String(width),String(height),'windowmove',win,'0','0','windowfocus',win]);
 await Bun.sleep(200);
 const shot=async(name:string)=>{await ready();await Bun.sleep(200);await run(['import','-window',win,`${out}/${variant}-${name}.png`]);await Bun.write(`${out}/${variant}-${name}.json`,JSON.stringify({width,height,state},null,2));console.log(`${variant}-${name}`);};
 const nav=async(page:string)=>act(`nav:${page}`);
 if(!account){
 await shot('timer');await act('menu:scrambles');await shot('scramble-menu');await nav('playground');await act('menu:modes');await shot('mode-menu');await nav('playground');await act('times');await shot('times');
 const data=JSON.parse(fixture.guest['cubix.local.v1:workspace:guest']);const solve=Object.values(data.solves).filter((s:any)=>s.case_id===null).at(-1) as any;
 if(solve){await act(`solve:${solve.id}`);await shot('time-actions');}
 await nav('algorithms');await shot('catalog');await act('case:F2L 1');await shot('case-detail');await nav('algorithms');const catalog=await Bun.file('desktop/assets/catalog.json').json();const advanced=catalog.sets.find((s:any)=>s.label==='F2L Advanced');await act(`set:${advanced.id}`);await shot('advanced-catalog');
 await nav('training');await shot('training');await act('solution');await shot('training-solution');if(width<1024){await act('cases');await shot('case-selector');}
 await nav('profile');await shot('account-register');await act('authMode:login');await shot('account-login');
 }else{
 await nav('profile');await shot('profile');await act('edit');await shot('settings');await act('light:light');await shot('settings-light');await act('light:dark','edit','profileMode:training');await shot('profile-training');await act('profileCase:F2L 1');await shot('profile-case');await act('back','profileMode:achievements');await shot('profile-achievements');
 await nav('playground');await act('menu:puzzles');await shot('puzzle-menu');await act('menu:puzzles');
 for(const theme of ['t3-code','t3-chat','grove','ocean','ember','iris'])for(const mode of ['dark','light']){await act(`theme:${theme}`,`light:${mode}`);await shot(`timer-${theme}-${mode}`);}
 for(const page of ['overviewGuide','algorithmsGuide','trainingGuide','timerGuide','averagesGuide']){await command({route:page});await shot(page);}
 }
 }finally{child.kill();await child.exited;await rm(dir,{recursive:true,force:true});}
}}
