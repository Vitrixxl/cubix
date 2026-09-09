import { afterEach, expect, test } from "bun:test";
import { createLocalClient } from "../src/frontend/local/client";
import { createApiClient } from "../src/frontend/api-client";
import { createRustApi, openDb } from "./backend";
import type { SessionDto, SolveDto } from "../src/shared/types";

class Storage {
  values = new Map<string,string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string,value: string) { this.values.set(key,value); }
  removeItem(key: string) { this.values.delete(key); }
}
const cleanup: (()=>void)[] = [];
afterEach(() => cleanup.splice(0).forEach(fn => fn()));
function setup() {
  const db = openDb(); const server = createRustApi(db.path);
  cleanup.push(() => db.db.close());
  const origin = `http://127.0.0.1:${server.server.port}`;
  return {db,origin,remote:(token: string | null) => createApiClient(origin,{getToken:()=>token})};
}
function device(remote: ReturnType<typeof setup>["remote"], storage = new Storage()) {
  const control = { offline:false, loseAck:false, requests:0 };
  const local = createLocalClient({ storage, autoSync:false,
    getToken:()=>storage.getItem("token"),setToken:t=>storage.setItem("token",t),clearToken:()=>storage.removeItem("token"),
    remote:token => new Proxy(remote(token), {get(target,key) {
      const method = target[key as keyof typeof target];
      return async (...args: any[]) => {
        control.requests++;
        if (control.offline) throw new TypeError("Network unavailable");
        const result = await (method as Function)(...args);
        if (key === "syncPush" && control.loseAck) { control.loseAck=false; throw new TypeError("Response lost after commit"); }
        return result;
      };
    }}),
  });
  cleanup.push(local.stop);
  return {local,api:local.api,storage,control};
}

test("anonymous practice is entirely local and survives reopening offline",async () => {
  const {remote,db} = setup(); const a = device(remote); a.control.offline=true;
  await a.local.restore();
  const session = await a.api.createSession("training",["PLL Aa"]);
  const solve = await a.api.addSolve({sessionId:session.id,caseId:"PLL Aa",timeMs:1234});
  await a.api.setPenalty(solve.id,"+2");
  expect(a.control.requests).toBe(0);
  const reopened = device(remote,a.storage); reopened.control.offline=true;
  expect((await reopened.api.cases()).length).toBe(228);
  expect((await reopened.api.solves("training"))[0].id).toBe(solve.id);
  expect((await reopened.api.caseHistory("PLL Aa")).summary.best).toBe(3234);
  expect((await reopened.api.profile("Guest")).trainingSolves).toBe(1);
  await reopened.api.deleteSolve(solve.id);
  expect(await reopened.api.solves("training")).toEqual([]);
  expect(reopened.control.requests).toBe(0);
  expect(db.db.query<{n:number}>("SELECT count(*) n FROM users").get()?.n).toBe(0);
});

test("offline account writes import guest data, retry lost acknowledgements exactly once, and retain original dates",async () => {
  const {remote,db} = setup(); const a = device(remote);
  const session = await a.api.createSession("playground");
  const first = await a.api.addSolve({sessionId:session.id,timeMs:1000,scramble:"R U"});
  const auth = await a.api.register("local_alice","a-long-test-password");
  a.control.offline=true;
  const second = await a.api.addSolve({sessionId:session.id,timeMs:2000});
  await a.api.setPenalty(second.id,"+2");
  await a.local.sync(); expect(a.local.status().state).toBe("offline");
  expect((await a.api.profile(auth.user.username)).totalSolves).toBe(2);
  a.control.offline=false; a.control.loseAck=true;
  await a.local.sync(); expect(a.local.status().state).toBe("offline");
  const reopened = device(remote,a.storage);
  await reopened.local.sync();
  expect(reopened.local.status().pending).toBe(0);
  const rows = await remote(auth.token).solves("playground");
  expect(rows).toHaveLength(2);
  expect(rows.find(s=>s.time_ms===1000)?.created_at).toBe(first.created_at);
  expect(rows.find(s=>s.time_ms===2000)?.penalty).toBe("+2");
  expect(db.db.query<{n:number}>("SELECT count(*) n FROM sessions").get()?.n).toBe(1);
  expect((await reopened.api.solves("playground")).map(s=>s.id).sort()).toEqual([first.id,second.id].sort());
  await reopened.api.deleteSolve(first.id); await reopened.local.sync();
  expect(await remote(auth.token).solves("playground")).toHaveLength(1);
});

test("two devices exchange changes and deletions; cached account work never moves to a different account",async () => {
  const {remote} = setup(); const a = device(remote);
  const auth = await a.api.register("device_alice","a-long-test-password");
  const session = await a.api.createSession("training",["PLL Aa"]);
  const solve = await a.api.addSolve({sessionId:session.id,caseId:"PLL Aa",timeMs:1500});
  await a.local.sync();
  const b = device(remote); await b.api.login("device_alice","a-long-test-password"); await b.local.sync();
  const copied = (await b.api.solves("training"))[0];
  await b.api.setPenalty(copied.id,"dnf"); await b.local.sync(); await a.local.sync();
  expect((await a.api.solves("training"))[0].penalty).toBe("dnf");
  await b.api.deleteSolve(copied.id); await b.local.sync();
  await a.api.setPenalty(solve.id,"+2"); await a.local.sync();
  expect(await a.api.solves("training")).toEqual([]);
  a.control.offline=true;
  await a.api.addSolve({sessionId:session.id,caseId:"PLL Aa",timeMs:2700});
  await a.api.logout(); a.control.offline=false;
  const other = await a.api.register("device_bob","a-long-test-password"); await a.local.sync();
  expect(await remote(other.token).solves("training")).toEqual([]);
  await a.api.logout(); await a.api.login("device_alice","a-long-test-password"); await a.local.sync();
  expect((await remote(auth.token).solves("training"))[0].time_ms).toBe(2700);
});

test("server sync enforces ownership, keeps receipts after delete, rejects reused IDs, and paginates old history",async () => {
  const {remote,db} = setup();
  const a = await remote(null).register("sync_alice","a-long-test-password");
  const b = await remote(null).register("sync_bob","a-long-test-password");
  const api = remote(a.token);
  const op = {id:crypto.randomUUID(),method:"POST",path:"solves",body:{timeMs:3456},createdAt:"2026-08-01T12:34:56.000Z"};
  const result = await api.syncPush([op]); const solve = result.results[0].value as SolveDto;
  await api.deleteSolve(solve.id);
  expect(await api.syncPush([op])).toEqual(result);
  expect(await api.solves("playground")).toEqual([]);
  await expect(api.syncPush([{...op,body:{timeMs:999}}])).rejects.toMatchObject({status:409});
  const session = await api.createSession("playground");
  await expect(remote(b.token).syncPush([{...op,id:crypto.randomUUID(),body:{timeMs:1000,sessionId:session.id}}])).rejects.toMatchObject({status:404});
  expect((await remote(b.token).syncPull(0)).changes).toEqual([]);
  const statement = db.db.query("INSERT INTO solves(time_ms,user_id) VALUES(?,?)");
  db.db.transaction(()=>{for(let i=0;i<510;i++)statement.run(i,a.user.id)})();
  let cursor=0, count=0, more=true;
  while(more) { const page = await api.syncPull(cursor); expect(page.changes.length).toBeLessThanOrEqual(500); count+=page.changes.length;cursor=page.cursor;more=page.more; }
  expect(count).toBe(512);
  expect((await api.syncPull(cursor)).changes).toEqual([]);
});

test("legacy server guests are downloaded once; expired sessions retain the local account and outbox",async () => {
  const {remote} = setup();
  const guest = await remote(null).guest();
  await remote(guest.token).addSolve({timeMs:7654});
  const a = device(remote); a.storage.setItem("token",guest.token); await a.local.restore();
  expect(a.storage.getItem("token")).toBeNull();
  expect((await a.api.solves("playground"))[0].time_ms).toBe(7654);
  const auth = await a.api.register("expired_alice","a-long-test-password"); await a.local.sync();
  await remote(auth.token).logout();
  await a.api.addSolve({timeMs:8765}); await a.local.sync();
  expect(a.local.status().state).toBe("signin");
  expect(a.local.current().id).toBe(auth.user.id);
  expect(await a.api.solves("playground")).toHaveLength(2);
  await a.api.login("expired_alice","a-long-test-password"); await a.local.sync();
  expect(a.local.status().pending).toBe(0);
});

test("offline messages and unsynced solve attachments are delivered once after reconnecting",async () => {
  const {remote} = setup(); const a = device(remote);
  const alice = await a.api.register("msg_alice","a-long-test-password");
  const bob = await remote(null).register("msg_bob","a-long-test-password");
  const [invite] = await remote(alice.token).addFriend("msg_bob"); await remote(bob.token).acceptFriend(invite.id);
  a.control.offline=true;
  const solve = await a.api.addSolve({timeMs:999});
  const body={text:"Offline PB",solveId:solve.id,clientId:crypto.randomUUID()};
  const message = await a.api.sendMessage(bob.user.id,body);
  expect(message.id).toBeLessThan(0);
  expect((await a.api.messages(bob.user.id))[0].text).toBe("Offline PB");
  await a.api.sendMessage(bob.user.id,body);
  a.control.offline=false; await a.local.sync();
  const rows = await remote(bob.token).messages(alice.user.id);
  expect(rows).toHaveLength(1); expect(rows[0].solve?.time_ms).toBe(999);
  expect((await a.api.messages(bob.user.id)).filter(m=>m.id<0)).toHaveLength(0);
});

test("storage quota failures leave saved history intact and are reported instead of pretending to save",async () => {
  const {remote} = setup(); const storage = new Storage(), a = device(remote,storage);
  await a.api.addSolve({timeMs:1000});
  const saved = storage.getItem("cubix.local.v1:workspace:guest");
  storage.setItem = () => { throw new DOMException("Full","QuotaExceededError"); };
  await expect(a.api.addSolve({timeMs:2000})).rejects.toThrow("could not be saved");
  expect(storage.getItem("cubix.local.v1:workspace:guest")).toBe(saved);
  expect(a.local.status().state).toBe("error");
});

test("local WCA statistics match Rust, and the embedded catalogue matches the server",async () => {
  const {remote} = setup(); const a = device(remote);
  const auth = await a.api.register("stats_local","a-long-test-password");
  for (let i=0;i<15;i++) await a.api.addSolve({caseId:"PLL Aa",timeMs:1000+i*100,penalty:i===4||i===5?"dnf":i===8?"+2":"none"});
  const local = await a.api.caseHistory("PLL Aa"); await a.local.sync();
  const server = await remote(auth.token).caseHistory("PLL Aa");
  expect(local.summary).toEqual(server.summary); expect(local.ao5).toEqual(server.ao5); expect(local.ao12).toEqual(server.ao12);
  expect(await a.api.cases()).toEqual(await remote(null).cases()); expect(await a.api.sets()).toEqual(await remote(null).sets());
});

test("a failed sync batch rolls back its successful prefix and retries safely",async () => {
  const {remote,db} = setup(); const auth = await remote(null).register("atomic_alice","a-long-test-password"); const api=remote(auth.token);
  const session = {id:crypto.randomUUID(),method:"POST",path:"sessions",body:{mode:"playground"},createdAt:"2026-09-01T10:00:00.000Z"};
  const invalid = {id:crypto.randomUUID(),method:"POST",path:"solves",body:{timeMs:-1},createdAt:session.createdAt};
  await expect(api.syncPush([session,invalid])).rejects.toMatchObject({status:422});
  expect(db.db.query<{n:number}>("SELECT count(*) n FROM sessions").get()?.n).toBe(0);
  expect(db.db.query<{n:number}>("SELECT count(*) n FROM sync_receipts").get()?.n).toBe(0);
  expect((await api.syncPush([session])).results).toHaveLength(1);
});

test("an edit made while an upload is in flight survives the acknowledgement",async () => {
  const {remote} = setup(); const storage=new Storage();
  let uploadStarted:()=>void=()=>{}, release:()=>void=()=>{};
  const started=new Promise<void>(resolve=>uploadStarted=resolve), gate=new Promise<void>(resolve=>release=resolve);
  let pause=true;
  const a=device(token=>new Proxy(remote(token),{get(target,key){
    if(key!=="syncPush")return target[key as keyof typeof target];
    return async (...args: Parameters<typeof target.syncPush>)=>{const result=await target.syncPush(...args);if(pause){pause=false;uploadStarted();await gate;}return result;};
  }}),storage);
  const auth=await a.api.register("inflight_alice","a-long-test-password");
  const solve=await a.api.addSolve({timeMs:1200});
  const syncing=a.local.sync(); await started;
  await a.api.setPenalty(solve.id,"+2"); release(); await syncing;
  expect((await a.api.solves("playground"))[0].penalty).toBe("+2");
  expect((await remote(auth.token).solves("playground"))[0].penalty).toBe("+2");
  expect(a.local.status().pending).toBe(0);
});

test("cube context survives offline storage, guest import, sync and another device without mixing statistics", async () => {
  const {remote,db,origin} = setup(); const a = device(remote);
  const oldSession = await a.api.createSession("playground");
  const oldSolve = await a.api.addSolve({sessionId:oldSession.id,timeMs:3333});
  // The browser records saved before this feature have no cube_size field.
  const key = "cubix.local.v1:workspace:guest";
  const saved = JSON.parse(a.storage.getItem(key)!);
  delete saved.sessions[oldSession.id].cube_size;
  delete saved.solves[oldSolve.id].cube_size;
  for (const field of ["puzzle_id","solve_mode","scramble_type"]) {
    delete saved.sessions[oldSession.id][field];
    delete saved.solves[oldSolve.id][field];
  }
  a.storage.setItem(key,JSON.stringify(saved));
  for (const cube of [2,4,5,6,7] as const) {
    const c = (await a.api.cases(cube))[0]!;
    const training = await a.api.createSession("training",[c.id],cube);
    await a.api.addSolve({sessionId:training.id,caseId:c.id,timeMs:cube*1000});
    const session = await a.api.createSession("playground",[],cube);
    await a.api.addSolve({sessionId:session.id,timeMs:cube*2000});
    expect((await a.api.latestSession("training",cube))?.id).toBe(training.id);
    await expect(a.api.addSolve({sessionId:session.id,cubeSize:3,timeMs:10})).rejects.toThrow("cube");
    await expect(a.api.createSession("training",[c.id],3)).rejects.toThrow("cube");
  }
  expect((await a.api.profile("Guest")).playground.summary.best).toBe(3333);
  const auth = await a.api.register("multi_cube_alice","a-long-test-password");
  await a.local.sync();
  expect(a.local.status().pending).toBe(0);
  const b = device(remote);
  await b.api.login(auth.user.username,"a-long-test-password"); await b.local.sync();
  for (const cube of [2,3,4,5,6,7] as const) {
    expect(await b.api.cases(cube)).toEqual(await remote(auth.token).cases(cube));
    expect(await b.api.sets(cube)).toEqual(await remote(auth.token).sets(cube));
    const localProfile = await b.api.profile(auth.user.username,undefined,cube);
    const serverProfile = await remote(auth.token).profile(auth.user.username,undefined,cube);
    expect(localProfile.playground.summary).toEqual(serverProfile.playground.summary);
    expect(localProfile.totalSolves).toBe(cube === 3 ? 1 : 2);
    expect(localProfile.playground.summary.best).toBe(cube === 3 ? 3333 : cube*2000);
    expect(await b.api.solves("playground",100,cube)).toHaveLength(1);
    expect(await b.api.stats(cube)).toHaveLength(cube === 3 ? 0 : 1);
  }
  expect(db.db.query<{n:number}>("SELECT count(*) n FROM solves").get()?.n).toBe(11);
  const badCase = (await a.api.cases(2))[0]!;
  await expect(remote(auth.token).createSession("training",[badCase.id],3)).rejects.toThrow("cube");
  const four = await remote(auth.token).createSession("playground",[],4);
  await expect(remote(auth.token).addSolve({sessionId:four.id,cubeSize:7,timeMs:100})).rejects.toThrow("cube");
  const response = await fetch(`${origin}/api/cases?cubeSize=9`);
  expect(response.status).toBe(422);
});


test("practice labels survive offline reopening, guest import and sync while histories stay separate", async () => {
  const {remote,db} = setup(); const a = device(remote); a.control.offline = true;
  const contexts = [
    {puzzle:"333", solveMode:"standard", scrambleType:"random-moves"},
    {puzzle:"333", solveMode:"standard", scrambleType:"2gen-ru"},
    {puzzle:"333", solveMode:"one-handed", scrambleType:"2gen-ru"},
    {puzzle:"333", solveMode:"blindfolded", scrambleType:"competition"},
    ...(["sq1","pyram","skewb","minx","clock"] as const).map(puzzle => ({puzzle, solveMode:"standard", scrambleType:"competition"} as const)),
  ] as const;
  for (const [i,context] of contexts.entries()) {
    const session = await a.api.createSession("playground",[],context.puzzle,context);
    const solve = await a.api.addSolve({sessionId:session.id,timeMs:1000+i*1000,scramble:"test scramble"});
    expect(solve).toMatchObject({puzzle_id:context.puzzle,solve_mode:context.solveMode,scramble_type:context.scrambleType});
    if (i >= 4) expect(solve.cube_size).toBeNull();
  }
  const reopened = device(remote,a.storage); reopened.control.offline = true;
  for (const [i,context] of contexts.entries()) {
    expect(await reopened.api.solves("playground",100,context.puzzle,context)).toHaveLength(1);
    expect((await reopened.api.profile("Guest",undefined,context.puzzle,context)).playground.summary.best).toBe(1000+i*1000);
    expect((await reopened.api.latestSession("playground",context.puzzle,context))?.scramble_type).toBe(context.scrambleType);
  }
  reopened.control.offline = false;
  const auth = await reopened.api.register("practice_labels","a-long-test-password");
  await reopened.local.sync(); expect(reopened.local.status().pending).toBe(0);
  const b = device(remote); await b.api.login(auth.user.username,"a-long-test-password"); await b.local.sync();
  for (const [i,context] of contexts.entries()) {
    const localRows = await b.api.solves("playground",100,context.puzzle,context);
    const serverRows = await remote(auth.token).solves("playground",100,context.puzzle,context);
    expect(localRows).toMatchObject(serverRows);
    expect(serverRows).toHaveLength(1);
    const localProfile = await b.api.profile(auth.user.username,undefined,context.puzzle,context);
    const serverProfile = await remote(auth.token).profile(auth.user.username,undefined,context.puzzle,context);
    expect(localProfile.playground.summary).toEqual(serverProfile.playground.summary);
    expect(serverProfile.playground.summary.best).toBe(1000+i*1000);
  }
  expect(db.db.query<{n:number}>("SELECT count(*) n FROM solves WHERE puzzle_id='sq1' AND cube_size IS NULL AND solve_mode='standard' AND scramble_type='competition'").get()?.n).toBe(1);
});

test("both APIs inherit context, reject incompatible labels and isolate training modes", async () => {
  const {remote} = setup(); const a = device(remote);
  const auth = await a.api.register("practice_validation","a-long-test-password");
  for (const api of [a.api,remote(auth.token)]) {
    const direct = await api.addSolve({puzzle:"sq1",timeMs:3000});
    expect(direct).toMatchObject({puzzle_id:"sq1",cube_size:null,solve_mode:"standard",scramble_type:"competition"});
    await expect(api.createSession("playground",[],"sq1",{scrambleType:"2gen-ru"})).rejects.toThrow();
    await expect(api.createSession("training",["PLL Aa"],"sq1")).rejects.toThrow();
    await expect(api.createSession("playground",[],3,{solveMode:"invalid" as any})).rejects.toThrow();
    await expect(api.addSolve({puzzle:"sq1",cubeSize:3,timeMs:100})).rejects.toThrow();
    const session = await api.createSession("playground",[],3,{solveMode:"one-handed",scrambleType:"2gen-ru"});
    await expect(api.addSolve({sessionId:session.id,solveMode:"standard",timeMs:100})).rejects.toThrow();
    await expect(api.addSolve({sessionId:session.id,scrambleType:"random-moves",timeMs:100})).rejects.toThrow();
    const training = await api.createSession("training",["PLL Aa"],3,{solveMode:"blindfolded"});
    await api.addSolve({sessionId:training.id,caseId:"PLL Aa",timeMs:8000});
    expect((await api.caseHistory("PLL Aa")).summary.count).toBe(0);
    expect((await api.caseHistory("PLL Aa",{solveMode:"blindfolded"})).summary.count).toBe(1);
    expect(await api.stats(3)).toHaveLength(0);
    expect(await api.stats(3,{solveMode:"blindfolded"})).toHaveLength(1);
  }
});

test('niche training sessions, case statistics and modes survive guest import and another device',async()=>{
  const {remote,db}=setup(),a=device(remote);
  const puzzles=['sq1','pyram','skewb','minx','clock'] as const;
  for(const puzzle of puzzles){
    const catalogue=await a.api.cases(puzzle);expect(catalogue.length).toBeGreaterThan(0);
    const c=catalogue[0],context={solveMode:'one-handed' as const,scrambleType:'case' as const};
    const session=await a.api.createSession('training',[c.id],puzzle,context);
    await a.api.addSolve({sessionId:session.id,caseId:c.id,timeMs:4321,scramble:c.setup});
    const direct=await a.api.addSolve({caseId:c.id,timeMs:1000});
    expect(direct).toMatchObject({puzzle_id:puzzle,cube_size:null,solve_mode:'standard',scramble_type:'case'});
  }
  const auth=await a.api.register('all_puzzle_training','a-long-test-password');await a.local.sync();
  expect(a.local.status().pending).toBe(0);
  const b=device(remote);await b.api.login(auth.user.username,'a-long-test-password');await b.local.sync();
  for(const puzzle of puzzles){
    const c=(await b.api.cases(puzzle))[0],context={solveMode:'one-handed' as const};
    expect(await b.api.cases(puzzle)).toEqual(await remote(auth.token).cases(puzzle));
    expect(await b.api.sets(puzzle)).toEqual(await remote(auth.token).sets(puzzle));
    expect((await b.api.latestSession('training',puzzle,context))?.puzzle_id).toBe(puzzle);
    expect((await b.api.caseHistory(c.id,context)).summary.best).toBe(4321);
    expect((await b.api.caseHistory(c.id)).summary.best).toBe(1000);
    const local=await b.api.profile(auth.user.username,undefined,puzzle,context);
    const server=await remote(auth.token).profile(auth.user.username,undefined,puzzle,context);
    expect(local.trainingSolves).toBe(1);expect(local.cases).toEqual(server.cases);
  }
  expect(db.db.query<{n:number}>("SELECT count(*) n FROM solves WHERE cube_size IS NULL AND scramble_type='case'").get()?.n).toBe(10);
});
