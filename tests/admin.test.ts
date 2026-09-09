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

test("admin login has a separate brute-force limit and rejects cross-origin submissions",async()=>{
 const {origin}=setup();const cross=await login(origin,"synthetic-admin-test-password",{origin:"https://foreign.example"});expect(cross.response.status).toBe(403);
 for(let i=0;i<4;i++)expect((await login(origin,"wrong-password")).response.status).toBe(401);
 const limited=await login(origin);expect(limited.response.status).toBe(429);expect(limited.response.headers.get("retry-after")).toBe("180");
});

test("only configured proxies may supply client IPs; the rightmost untrusted hop wins",async()=>{
 const {origin}=setup({CUBIX_TRUSTED_PROXIES:"127.0.0.1"});
 await fetch(origin+"/api/health",{headers:{"x-forwarded-for":"192.0.2.5, 203.0.113.7"}});
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
