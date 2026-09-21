import { cubePreview } from './cubePreview';
/** Headless Bun data engine shared by Electron and the archived GPUI reference.
 * Reusing the shared client preserves its local-first synchronization and HTTP/WS protocol.
 */
import { createLocalClient } from '../../src/client/local/client';
import { createApiClient } from '../../src/client/api-client';
import { generatePracticeScramble } from './practiceScramble';
import { applyAlg, combineAuf, compensateAuf, randomAuf, solved } from '../../src/shared/cube';
import { executableAlg, maskForStage } from '../../src/client/lib/caseState';
import { StaticCubeSvg } from '../../src/client/diagrams/StaticCubeSvg';
import { viewForStage } from '../../src/shared/cubeDiagram';
import { createElement } from 'react';
import { cases } from '../../src/client/local/catalog';
import { EMPTY_TRAINING_HISTORY, trainingHistoryReducer, type TrainingHistory } from '../../src/client/lib/trainingHistory';
import { renderToStaticMarkup } from 'react-dom/server';
import { puzzleInfo, type PracticeContext, type PuzzleId } from '../../src/shared/puzzles';
import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import {homedir} from 'node:os';
import {fmtDate} from '../../src/client/lib/format';
import { recordMessage, solveRecords } from '../../src/client/lib/personalBest';
import { createInterface } from 'node:readline';
const origin=process.env.CUBIX_API_ORIGIN??'https://cubix.vitrixxl.fr';
const root=process.env.CUBIX_DESKTOP_DATA??join(process.env.XDG_DATA_HOME??join(homedir(),'.local/share'),'cubix-desktop');
mkdirSync(root,{recursive:true,mode:0o700});
const file=join(root,'storage.json');
let values:Record<string,string>=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{};
function persist(next:Record<string,string>){const temp=file+'.tmp';writeFileSync(temp,JSON.stringify(next),{mode:0o600});const fd=openSync(temp,'r');try{fsyncSync(fd);}finally{closeSync(fd);}renameSync(temp,file);values=next;}
const storage={getItem:(k:string)=>values[k]??null,setItem:(k:string,v:string)=>persist({...values,[k]:v}),removeItem:(k:string)=>{const next={...values};delete next[k];persist(next);}};
const tokenKey=`cubix.auth:${origin}`;
const emit=(value:unknown)=>process.stdout.write(JSON.stringify(value)+'\n');
const local=createLocalClient({storage,getToken:()=>storage.getItem(tokenKey),setToken:t=>storage.setItem(tokenKey,t),clearToken:()=>storage.removeItem(tokenKey),remote:token=>createApiClient(origin,{getToken:()=>token}),changed:()=>emit({event:'changed'}),status:status=>emit({event:'sync',value:status})});
let live:ReturnType<typeof local.api.connectLive>|undefined;
let liveToken:string|null=null,reconnect:ReturnType<typeof setTimeout>|undefined;
function connect(){
 const token=storage.getItem(tokenKey);if(token===liveToken&&live)return;
 live?.close();live=undefined;liveToken=token;
 if(!token||local.current().isGuest)return;
 live=local.api.connectLive();const current=live;
 current.on('open',()=>current.send({type:'auth',token}));
 current.on('message',({data})=>{
  if(data.type==='ready'){emit({event:'live',value:'online'});void local.remoteChanged(data.cursor);}
  // Another device of this account changed practice data; pull it before the next periodic restore.
  if(data.type==='sync')void local.remoteChanged(data.cursor);
 });
 current.on('close',()=>{if(live!==current)return;live=undefined;emit({event:'live',value:'connecting'});reconnect=setTimeout(connect,3000);});
 current.on('error',()=>{});
}
let lastAdvance:{key:string,promise:Promise<Record<string,unknown>>}|undefined;
// One scramble per context is generated ahead, so asking for a new one answers without waiting for the search.
const nextScrambles=new Map<string,Promise<string>>();
const scrambleKey=(context:PracticeContext)=>`${context.puzzle}:${context.solveMode}:${context.scrambleType}`;
function prefetchScramble(context:PracticeContext){
   const key=scrambleKey(context);
   if(nextScrambles.has(key))return;
   const promise=generatePracticeScramble(context);
   promise.catch(()=>{if(nextScrambles.get(key)===promise)nextScrambles.delete(key);});
   nextScrambles.set(key,promise);
}
function takeScramble(context:PracticeContext){
   const key=scrambleKey(context),ready=nextScrambles.get(key)??generatePracticeScramble(context);
   nextScrambles.delete(key);
   prefetchScramble(context);
   return ready;
}
const trainingHistories=new Map<string,TrainingHistory>();
function training(action:string,puzzle:PuzzleId,ids:string[],useAuf:boolean,solveMode:string){
   const key=`${puzzle}:${solveMode}`;
   const pool=cases.filter(c=>ids.includes(c.id));
   const before=trainingHistories.get(key)??EMPTY_TRAINING_HISTORY;
   const size=puzzleInfo(puzzle).cubeSize;
   const history=trainingHistoryReducer(before,action==='previous'?{type:'previous'}:{type:'next',pool,sample:Math.random(),auf:useAuf&&size?randomAuf():''});
   trainingHistories.set(key,history);
   const entry=history.entries[history.index];
   if(!entry)return null;
   else {const {c,auf}=entry;const setup=size?combineAuf(c.setup,auf):c.setup;
     return {id:c.id,canPrevious:history.index>0,setup,algorithm:size?compensateAuf(executableAlg(c.algorithms[0]),auf):executableAlg(c.algorithms[0]),svg:size?renderToStaticMarkup(createElement(StaticCubeSvg,{state:applyAlg(solved(size),setup),size:300,mask:maskForStage(c.stage),view:viewForStage(c.stage)})):null};}
}
const methods=new Set(Object.keys(local.api).filter(k=>!['connectLive'].includes(k)));
const lines=createInterface({input:process.stdin,crlfDelay:Infinity});
let mutations=Promise.resolve();
async function handle(req:any){
 try{
 let value:unknown;
 if(req.method==='init')value={protocol:2,user:local.current(),storage:values,origin,learned:local.learned()};
 else if(req.method==='snapshot'){
   const q=req.args[0],context=q.context;
   const trainingMode=q.page==='training';
   const filter={solveMode:context.solveMode};
   const jobs:Record<string,Promise<unknown>>={
     solves:local.api.solves(trainingMode?'training':'playground',1000,context.puzzle,context),
     stats:local.api.stats(context.puzzle,filter),
   };
   if(q.page==='profile'){jobs.profile=local.api.profile(undefined,undefined,q.profilePuzzle,q.profileFilter);jobs.achievements=local.api.achievements();}
   if(q.caseId)jobs.caseHistory=local.api.caseHistory(q.caseId,filter);
   if(q.advance){
     if(!lastAdvance||lastAdvance.key!==q.advanceKey)lastAdvance={key:q.advanceKey,promise:trainingMode?Promise.resolve({training:training('next',context.puzzle,q.selected,q.randomAuf,context.solveMode)}):takeScramble(context).then(scramble=>({scramble}))};
     jobs[trainingMode?'training':'scramble']=lastAdvance.promise.then(v=>v[trainingMode?'training':'scramble']);
   }
   if(!trainingMode)prefetchScramble(context);
   value={revision:q.revision,learned:local.learned(),...Object.fromEntries(await Promise.all(Object.entries(jobs).map(async([key,promise])=>[key,await promise])))};
 }
 else if(req.method==='preference'){storage.setItem(req.args[0],JSON.stringify(req.args[1]));value=true;}
 else if(req.method==='cubePreview')value=cubePreview(req.args[0],req.args[1],req.args[2]);
 else if(req.method==='scramble')value=await takeScramble(req.args[0]);
 else if(req.method==='training'){
   value=training(req.args[0],req.args[1],req.args[2],req.args[3],req.args[4]);
 }
 else if(req.method==='trainingCase'){
   const [c,useAuf]=req.args,size=puzzleInfo(c.puzzle_id??String(c.cube_size??3).repeat(3)).cubeSize;
   const auf=useAuf&&size?randomAuf():'';
   const setup=size?combineAuf(c.setup,auf):c.setup;
   value={setup,algorithm:size?compensateAuf(executableAlg(c.algorithms[0]),auf):executableAlg(c.algorithms[0]),svg:size?renderToStaticMarkup(createElement(StaticCubeSvg,{state:applyAlg(solved(size),setup),size:300,mask:maskForStage(c.stage),view:viewForStage(c.stage)})):null};
 }
 else if(req.method==='addSolve'){
   // A timer solve that beats the all-time single, Ao5 or Ao12 of its context comes back with its praise.
   const body=req.args[0],solve=await local.api.addSolve(body);
   const record=body.caseId?null:recordMessage(solveRecords((await local.api.solves('playground',Infinity,body.puzzle,body)).reverse(),solve.id));
   value={...solve,record};
 }
 else if(req.method==='sync'){await local.retry();value=local.status();}
 else if(methods.has(req.method))value=await (local.api as any)[req.method](...req.args);
 else throw new Error('Unknown engine method');
 function display(v:any):any {if(Array.isArray(v))return v.map(display);if(v&&typeof v==='object'){const out=Object.fromEntries(Object.entries(v).map(([k,v])=>[k,display(v)]));if(typeof v.at==='string')out.displayDate=fmtDate(v.at);if(typeof v.createdAt==='string')out.displayDate=fmtDate(v.createdAt);if(typeof v.createdAt==='string'&&v.username)out.joined=new Date(v.createdAt).toLocaleDateString(undefined,{month:'short',year:'numeric'});if(typeof v.unlockedAt==='string')out.unlockedDate=new Date(v.unlockedAt).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});return out;}return v;}
 emit({id:req.id,value:display(value??null)});connect();
 }catch(error){emit({id:req.id,error:(error as Error).message});}
}
lines.on('line',line=>{try{const req=JSON.parse(line);mutations=mutations.then(()=>handle(req));}catch(error){emit({event:'error',value:'Invalid engine request'});}});
const retry=setInterval(()=>{void local.restore();connect();if(live?.ws.readyState===WebSocket.OPEN)live.send({type:'ping'});},30000);
lines.on('close',()=>{clearInterval(retry);clearTimeout(reconnect);local.stop();live?.close();process.exit(0);});
void local.restore().then(connect);
