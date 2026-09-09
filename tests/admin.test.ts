import {afterEach,expect,test} from "bun:test";
import {createRustApi,openDb} from "./backend";
import {createApiClient} from "../src/frontend/api-client";
const cleanup:(()=>void)[]=[];afterEach(()=>cleanup.splice(0).forEach(fn=>fn()));
function setup(settings:Record<string,string>={}) {const db=openDb();cleanup.push(()=>db.db.close());const app=createRustApi(db.path,settings);return {db,app,origin:`http://127.0.0.1:${app.server.port}`};}
async function login(origin:string,password="synthetic-admin-test-password",headers:Record<string,string>={}) {const response=await fetch(origin+"/api/admin/login",{method:"POST",headers:{"content-type":"application/json",...headers},body:JSON.stringify({password})});const value=await response.json();return {response,value,cookie:response.headers.get("set-cookie")?.split(";")[0]??""};}

test("admin access requires its own password; HttpOnly session lasts one day, survives restart, and can be revoked",async()=>{
 const {origin,db,app}=setup();
 expect((await fetch(origin+"/api/admin/dashboard")).status).toBe(401);
 const user=await createApiClient(origin,{getToken:()=>null}).register("ordinary_user","a-long-test-password");
 expect((await fetch(origin+"/api/admin/dashboard",{headers:{authorization:"Bearer "+user.token}})).status).toBe(401);
 expect((await login(origin,"incorrect-password")).response.status).toBe(401);
 const admin=await login(origin);expect(admin.response.status).toBe(200);
 const header=admin.response.headers.get("set-cookie")!;expect(header).toContain("HttpOnly");expect(header).toContain("SameSite=Strict");expect(header).toContain("Max-Age=86400");
 expect(admin.value.expiresAt-Date.now()).toBeGreaterThan(86390000);expect(admin.value.expiresAt-Date.now()).toBeLessThanOrEqual(86400000);
 const stored=db.db.query<{token_hash:string}>("SELECT token_hash FROM admin_tokens").get()!;expect(admin.cookie).not.toContain(stored.token_hash);
 app.server.stop();const restarted=createRustApi(db.path);const again=`http://127.0.0.1:${restarted.server.port}`;
 expect((await fetch(again+"/api/admin/dashboard",{headers:{cookie:admin.cookie}})).status).toBe(200);
 expect((await fetch(again+"/api/admin/logout",{method:"POST",headers:{cookie:admin.cookie}})).status).toBe(200);
 expect((await fetch(again+"/api/admin/dashboard",{headers:{cookie:admin.cookie}})).status).toBe(401);
 const expired=await login(again);db.db.exec("UPDATE admin_tokens SET expires_at=0");expect((await fetch(again+"/api/admin/dashboard",{headers:{cookie:expired.cookie}})).status).toBe(401);
});

test("admin dashboard lists accounts and HTTP traffic without secrets or spoofed IPs",async()=>{
 const {origin}=setup();const remote=createApiClient(origin,{getToken:()=>null});await remote.register("visible_user","a-long-test-password");await remote.guest();
 await fetch(origin+"/missing-path?token=do-not-log-this",{headers:{"x-forwarded-for":"203.0.113.200",authorization:"Bearer do-not-log-this"}});
 const admin=await login(origin);
 const response=await fetch(origin+"/api/admin/dashboard",{headers:{cookie:admin.cookie}});expect(response.headers.get("cache-control")).toBe("no-store");
 const body=await response.json();expect(body.users.counts).toEqual({total:2,registered:1,guests:1});expect(body.users.rows).toHaveLength(1);expect(body.users.rows[0].username).toBe("visible_user");
 const row=body.traffic.requests.find((r:any)=>r.path==="/missing-path");expect(row.status).toBe(404);expect(row.ip).toBe("127.0.0.1");expect(body.traffic.ips[0].requests).toBeGreaterThan(3);
 expect(JSON.stringify(body)).not.toContain("do-not-log-this");expect(JSON.stringify(body)).not.toContain("password_hash");expect(JSON.stringify(body)).not.toContain("token_hash");
 expect((await (await fetch(origin+"/api/admin/dashboard?guests=1",{headers:{cookie:admin.cookie}})).json()).users.rows).toHaveLength(2);
 expect((await fetch(origin+"/aaaaadmin")).status).toBe(200);
});

test("per-IP rate limits return 429 with Retry-After and cannot be bypassed by spoofing forwarding headers",async()=>{
 const {origin}=setup({CUBIX_RATE_LIMIT:"5"});const responses=[];
 for(let i=0;i<7;i++)responses.push(await fetch(origin+"/api/health",{headers:{"x-forwarded-for":`192.0.2.${i}`}}));
 expect(responses.filter(r=>r.status===429).length).toBeGreaterThanOrEqual(3);expect(responses.at(-1)!.headers.get("retry-after")).toBe("60");
});

test("health probes are excluded from admin logs, counters and IP listings even when rate limited",async()=>{
 const {origin}=setup({CUBIX_TRUSTED_PROXIES:"127.0.0.1",CUBIX_RATE_LIMIT:"5"});
 for(let i=0;i<7;i++){
  const response=await fetch(origin+"/api/health?probe=1",{headers:{"x-forwarded-for":"203.0.113.8"}});
  expect(response.status).toBe(i<5?200:429);
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
 }
 const admin=await login(origin);
 const {traffic}=await (await fetch(origin+"/api/admin/dashboard",{headers:{cookie:admin.cookie}})).json();
 expect(traffic.total).toBe(1);expect(traffic.retained).toBe(1);
 expect(traffic.errors).toBe(0);expect(traffic.limited).toBe(0);
 expect(traffic.ipCount).toBe(1);expect(traffic.matchingIps).toBe(1);
 expect(traffic.ips).toHaveLength(1);expect(traffic.ips[0].requests).toBe(1);
 expect(traffic.requests.map((r:any)=>r.path)).toEqual(["/api/admin/login"]);
 const filtered=await (await fetch(origin+"/api/admin/dashboard?ip=203.0.113.8",{headers:{cookie:admin.cookie}})).json();
 expect(filtered.traffic.matchingIps).toBe(0);expect(filtered.traffic.ips).toHaveLength(0);expect(filtered.traffic.requests).toHaveLength(0);
});

test("admin login has a separate brute-force limit and rejects cross-origin submissions",async()=>{
 const {origin}=setup();const cross=await login(origin,"synthetic-admin-test-password",{origin:"https://foreign.example"});expect(cross.response.status).toBe(403);
 for(let i=0;i<4;i++)expect((await login(origin,"wrong-password")).response.status).toBe(401);
 const limited=await login(origin);expect(limited.response.status).toBe(429);expect(limited.response.headers.get("retry-after")).toBe("180");
});

test("only configured proxies may supply client IPs; the rightmost untrusted hop wins",async()=>{
 const {origin}=setup({CUBIX_TRUSTED_PROXIES:"127.0.0.1"});
 await fetch(origin+"/api/moves",{headers:{"x-forwarded-for":"192.0.2.5, 203.0.113.7"}});
 const admin=await login(origin);const body=await (await fetch(origin+"/api/admin/dashboard?ip=203.0.113.7",{headers:{cookie:admin.cookie}})).json();
 expect(body.traffic.ips[0].ip).toBe("203.0.113.7");expect(body.traffic.ips[0].requests).toBe(1);
});

test("missing configuration disables admin access and rotating the password invalidates old tokens",async()=>{
 const disabled=setup({CUBIX_ADMIN_PASSWORD:""});expect((await login(disabled.origin)).response.status).toBe(503);
 const {origin,db,app}=setup();const admin=await login(origin);app.server.stop();
 const changed=createRustApi(db.path,{CUBIX_ADMIN_PASSWORD:"another-synthetic-admin-password"});const next=`http://127.0.0.1:${changed.server.port}`;
 expect((await fetch(next+"/api/admin/dashboard",{headers:{cookie:admin.cookie}})).status).toBe(401);
 expect((await login(next,"another-synthetic-admin-password")).response.status).toBe(200);
});

async function adminSocket(origin:string,cookie:string,filters:Record<string,string>={}) {
 const {default:WebSocket}=await import("ws");
 const ws=new WebSocket(origin.replace('http:','ws:')+'/api/admin/live',{headers:{cookie,origin}});
 cleanup.unshift(()=>ws.terminate());
 const snapshots:any[]=[];
 ws.on('error',()=>{});
 ws.on('message',raw=>{const message=JSON.parse(String(raw));if(message.type==='snapshot')snapshots.push(message.data)});
 const wait=async(predicate:(value:any)=>boolean)=>{
  for(let i=0;i<300;i++){const found=snapshots.find(predicate);if(found)return found;await Bun.sleep(10)}
  throw Error('Missing admin snapshot');
 };
 const subscribe=(filters:Record<string,string>,live=true)=>ws.send(JSON.stringify({type:'subscribe',filters,live}));
 await new Promise<void>((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)});
 subscribe(filters);
 await wait(()=>true);
 return {ws,snapshots,wait,subscribe};
}

test('admin WebSocket pushes traffic and users, applies filters, pauses, resumes and stays idle without polling',async()=>{
 const {origin}=setup();const admin=await login(origin);const live=await adminSocket(origin,admin.cookie);
 await Bun.sleep(600);const before=live.snapshots.length;
 await fetch(origin+'/api/health');await fetch(origin+'/api/health?probe=1');
 await Bun.sleep(700);expect(live.snapshots.length).toBe(before);
 await fetch(origin+'/websocket-proof');
 const pushed=await live.wait(data=>data.traffic.requests.some((r:any)=>r.path==='/websocket-proof'));
 expect(pushed.traffic.requests.some((r:any)=>r.path==='/api/admin/live'&&r.status===101)).toBe(true);
 await createApiClient(origin,{getToken:()=>null}).register('websocket_user','a-long-test-password');
 await live.wait(data=>data.users.rows.some((r:any)=>r.username==='websocket_user'));
 live.subscribe({path:'/websocket-proof'});
 await live.wait(data=>data.traffic.requests.length===1&&data.traffic.requests[0].path==='/websocket-proof');
 live.subscribe({},false);await Bun.sleep(600);const paused=live.snapshots.length;
 await fetch(origin+'/during-pause');await Bun.sleep(650);expect(live.snapshots.length).toBe(paused);
 live.subscribe({});await live.wait(data=>data.traffic.requests.some((r:any)=>r.path==='/during-pause'));
 const allRequests=live.snapshots.at(-1).traffic.requests;
 expect(allRequests.filter((r:any)=>r.path==='/api/admin/dashboard')).toHaveLength(0);
});

test('admin WebSocket rejects missing cookies and foreign origins; logout closes an open session',async()=>{
 const {origin}=setup();const admin=await login(origin);
 const {default:WebSocket}=await import('ws');
 async function rejected(headers:Record<string,string>){return new Promise<number>((resolve,reject)=>{
  const ws=new WebSocket(origin.replace('http:','ws:')+'/api/admin/live',{headers});cleanup.unshift(()=>ws.terminate());ws.on('error',()=>{});
  ws.on('unexpected-response',(_,response)=>{const status=response.statusCode!;response.destroy();ws.terminate();resolve(status)});ws.on('open',()=>reject(Error('Unexpected upgrade')));
 })}
 expect(await rejected({origin})).toBe(401);
 expect(await rejected({cookie:admin.cookie,origin:'https://foreign.example'})).toBe(403);
 const live=await adminSocket(origin,admin.cookie);
 live.subscribe({},false);
 const closed=new Promise<number>(resolve=>live.ws.once('close',code=>resolve(code)));
 await fetch(origin+'/api/admin/logout',{method:'POST',headers:{cookie:admin.cookie,origin}});
 expect(await closed).toBe(4001);
 expect(await rejected({cookie:admin.cookie,origin})).toBe(401);
});

test('admin WebSocket closes expired sessions and rejects invalid filter messages',async()=>{
 const {origin,db}=setup();const admin=await login(origin);const live=await adminSocket(origin,admin.cookie);
 const expired=new Promise<number>(resolve=>live.ws.once('close',code=>resolve(code)));
 db.db.exec('UPDATE admin_tokens SET expires_at=0');await fetch(origin+'/expiry-trigger');expect(await expired).toBe(4001);
 const second=await login(origin);const invalid=await adminSocket(origin,second.cookie);
 const rejected=new Promise<number>(resolve=>invalid.ws.once('close',code=>resolve(code)));
 invalid.subscribe({path:'x'.repeat(101)});expect(await rejected).toBe(1008);
});
