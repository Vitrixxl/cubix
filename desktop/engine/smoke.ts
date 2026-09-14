import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'cubix-engine-smoke-'));
const p=Bun.spawn(process.env.CUBIX_ENGINE_EXE?[process.env.CUBIX_ENGINE_EXE]:['bun','desktop/bin/main.js'],{env:{...process.env,CUBIX_DESKTOP_DATA:dir,CUBIX_API_ORIGIN:'http://127.0.0.1:47139'},stdin:'pipe',stdout:'pipe',stderr:'inherit'});
const pending=new Map();let id=0;
void (async()=>{const reader=p.stdout.getReader();const decoder=new TextDecoder();let buffer='';for(;;){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});for(let end;(end=buffer.indexOf('\n'))>=0;){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{const v=JSON.parse(line);const job=pending.get(v.id);if(job){pending.delete(v.id);v.error?job.reject(Error(v.error)):job.resolve(v.value);}}catch{}}}})();
function call(method:string,...args:any[]){return new Promise<any>((resolve,reject)=>{const key=++id;const timer=setTimeout(()=>reject(Error(`Timeout: ${method}`)),45000);pending.set(key,{resolve:(v:any)=>{clearTimeout(timer);resolve(v);},reject:(e:any)=>{clearTimeout(timer);reject(e);}});p.stdin.write(JSON.stringify({id:key,method,args})+'\n');});}
try{
const init=await call('init');if(!init.user.isGuest)throw Error('Expected guest');
for(const puzzle of ['222','333','444','555','666','777','pyram','skewb','sq1','minx','clock']){const text=await call('scramble',{puzzle,solveMode:'standard',scrambleType:'competition'});if(!text?.length)throw Error('Empty scramble');console.log(puzzle,'competition',text.length);}
const first=await call('training','next','333',['F2L 1','F2L 2'],true,'standard');await call('training','next','333',['F2L 1','F2L 2'],true,'standard');const previous=await call('training','previous','333',['F2L 1','F2L 2'],true,'standard');if(first.setup!==previous.setup||first.algorithm!==previous.algorithm)throw Error('Training history mismatch');console.log('training history: OK');
const session=await call('createSession','training',['F2L 1'],'333',{solveMode:'standard',scrambleType:'case'});
await call('addSolve',{sessionId:session.id,caseId:'F2L 1',timeMs:3456,scramble:first.setup,puzzle:'333'});
const query={revision:1,page:'training',context:{puzzle:'333',solveMode:'standard',scrambleType:'case'},caseId:'F2L 1',selected:['F2L 1','F2L 2'],randomAuf:true,advance:true,advanceKey:'test-solve-1'};
const snapshot=await call('snapshot',query);const again=await call('snapshot',{...query,revision:2});
if(snapshot.solves.length!==1||snapshot.stats[0].count!==1||snapshot.caseHistory.summary.count!==1)throw Error('Snapshot inconsistent');
if(snapshot.training.id!==again.training.id||snapshot.training.setup!==again.training.setup)throw Error('Snapshot retry advanced training twice');console.log('atomic snapshot and idempotent advance: OK');
}finally{p.kill();await p.exited;await rm(dir,{recursive:true,force:true});}
