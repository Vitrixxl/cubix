import {afterEach,expect,test} from "bun:test";
import {adminToken,createRustApi,openDb} from "./backend";
import {createApiClient} from "../src/client/api-client";
const cleanup:(()=>void)[]=[];afterEach(()=>cleanup.splice(0).forEach(fn=>fn()));

function setup() {
 const db=openDb();cleanup.push(()=>db.db.close());const app=createRustApi(db.path);
 return {db,origin:`http://127.0.0.1:${app.server.port}`,admin:adminToken(db.path)};
}
async function account(origin:string,name:string) {
 const {token,user}=await createApiClient(origin,{getToken:()=>null}).register(name,"a-long-test-password");
 const call=async(method:string,path:string,body?:unknown)=>{
  const response=await fetch(origin+"/api/coaching/"+path,{method,headers:{authorization:"Bearer "+token,...(body===undefined?{}:{"content-type":"application/json"})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,value:await response.json()};
 };
 return {token,id:user.id as string,call,get:async(path:string)=>(await call("GET",path)).value};
}
async function adminSession(origin:string,token:string) {
 const response=await fetch(origin+"/api/admin/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token})});
 const cookie=response.headers.get("set-cookie")!.split(";")[0]!;
 return async(method:string,path:string)=>{const r=await fetch(origin+"/api/admin/"+path,{method,headers:{cookie}});return {status:r.status,value:await r.json()};};
}
/** A coaching socket, signed in, that keeps what it hears. */
async function socket(origin:string,token:string) {
 const ws=new WebSocket(origin.replace("http:","ws:")+"/api/coaching/live");cleanup.push(()=>ws.close());
 const heard:any[]=[];const waiters:[(m:any)=>boolean,(m:any)=>void][]=[];
 ws.onmessage=e=>{const m=JSON.parse(String(e.data));heard.push(m);for(const w of [...waiters])if(w[0](m)){waiters.splice(waiters.indexOf(w),1);w[1](m);}};
 await new Promise(r=>ws.onopen=r);
 const next=(match:(m:any)=>boolean)=>new Promise<any>((resolve,reject)=>{const found=heard.find(match);if(found){heard.splice(heard.indexOf(found),1);return resolve(found);}waiters.push([match,m=>{heard.splice(heard.indexOf(m),1);resolve(m);}]);setTimeout(()=>reject(Error("nothing heard")),3000);});
 ws.send(JSON.stringify({type:"auth",token}));await next(m=>m.type==="ready");
 return {send:(v:unknown)=>ws.send(JSON.stringify(v)),next};
}

test("an application, once approved, makes a coach whom players can book, review and message",async()=>{
 const {origin,db,admin}=setup();
 const coach=await account(origin,"coach_anna"),player=await account(origin,"player_ben");
 expect((await coach.call("PUT","profile",{headline:"x"})).status).toBe(403);
 expect((await coach.call("POST","application",{email:"not-an-email",message:"I coach"})).status).toBe(422);
 const applied=await coach.call("POST","application",{email:"anna@example.com",events:["333","222"],experience:"Sub-8 average",message:"I teach CFOP"});
 expect(applied.status).toBe(200);expect(applied.value.status).toBe("pending");
 expect((await coach.call("POST","application",{email:"anna@example.com",message:"again"})).status).toBe(409);
 expect((await coach.get("me")).application).toMatchObject({email:"anna@example.com",status:"pending"});

 const adm=await adminSession(origin,admin);
 const listed=(await adm("GET","coaching")).value;
 expect(listed.pending).toBe(1);expect(listed.applications[0]).toMatchObject({username:"coach_anna",email:"anna@example.com",events:["333","222"]});
 expect((await adm("POST",`coaching/applications/${applied.value.id}/approve`)).status).toBe(200);
 expect((await adm("POST",`coaching/applications/${applied.value.id}/reject`)).status).toBe(409);

 const me=await coach.get("me");expect(me.coach).toMatchObject({active:true,events:["333","222"]});expect(me.iceServers.length).toBeGreaterThan(0);
 expect((await coach.call("PUT","profile",{headline:"CFOP coach",bio:"Hi",events:["333"],languages:["French","English"],priceCents:2500,accepting:true})).value).toMatchObject({headline:"CFOP coach",priceCents:2500,languages:["French","English"]});
 expect((await coach.call("PUT","availability",{timezone:"Mars/Olympus",sessionMinutes:60,windows:[],daysOff:[]})).status).toBe(422);
 expect((await coach.call("PUT","availability",{timezone:"UTC",sessionMinutes:60,windows:[{weekday:0,start:10,end:60}],daysOff:[]})).status).toBe(422);
 const everyDay=[0,1,2,3,4,5,6].map(weekday=>({weekday,start:0,end:1440}));
 expect((await coach.call("PUT","availability",{timezone:"UTC",sessionMinutes:60,windows:everyDay,daysOff:[]})).status).toBe(200);

 const coaches=await player.get("coaches");expect(coaches.map((c:any)=>c.username)).toEqual(["coach_anna"]);
 expect(coaches[0].nextSlot).toBeGreaterThanOrEqual(Date.now()+3600000-1000);
 const {slots}=await player.get(`coaches/${coach.id}/slots?days=2`);
 expect(slots.length).toBeGreaterThan(20);expect(slots[0].end-slots[0].start).toBe(3600000);
 expect((await coach.call("POST","bookings",{coachId:coach.id,start:slots[0].start})).status).toBe(422);
 expect((await player.call("POST","bookings",{coachId:coach.id,start:slots[0].start+60000})).status).toBe(409);
 // Messages open once a session is booked.
 expect((await player.call("POST","conversations",{coachId:coach.id})).status).toBe(403);

 const coachSocket=await socket(origin,coach.token),playerSocket=await socket(origin,player.token);
 const booked=await player.call("POST","bookings",{coachId:coach.id,start:slots[0].start,note:"F2L lookahead"});
 expect(booked.status).toBe(200);expect(booked.value).toMatchObject({role:"student",status:"booked",priceCents:2500,note:"F2L lookahead",with:{username:"coach_anna"}});
 await coachSocket.next(m=>m.type==="bookings");
 expect((await player.call("POST","bookings",{coachId:coach.id,start:slots[0].start})).status).toBe(409);
 expect((await player.get(`coaches/${coach.id}/slots?days=2`)).slots[0].start).toBe(slots[1].start);
 const coachView=(await coach.get("bookings"))[0];expect(coachView).toMatchObject({role:"coach",with:{username:"player_ben"}});

 // The booking opened the conversation; messages reach both apps live.
 const [conversation]=await player.get("conversations");expect(conversation.id).toBe(coachView.conversationId);
 const sent=await player.call("POST",`conversations/${conversation.id}/messages`,{body:"Hello coach"});expect(sent.status).toBe(200);
 expect((await coachSocket.next(m=>m.type==="message")).message.body).toBe("Hello coach");
 expect((await coach.get("me")).unread).toBe(1);
 expect((await coach.call("POST",`conversations/${conversation.id}/read`)).value.unread).toBe(0);
 expect((await coach.call("PUT",`conversations/${conversation.id}/note`,{note:"Works on F2L"})).value.note).toBe("Works on F2L");
 expect((await player.get("conversations"))[0].note).toBeNull();
 const outsider=await account(origin,"outsider");
 expect((await outsider.call("GET",`conversations/${conversation.id}/messages`)).status).toBe(404);
 // Pictures and videos travel raw, typed by their first bytes; only the two parties fetch them back.
 const png=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3,4]);
 const upload=(who:{token:string},body:Uint8Array,name="cube.png")=>fetch(`${origin}/api/coaching/conversations/${conversation.id}/media`,{method:"POST",headers:{authorization:"Bearer "+who.token,"content-type":"image/png","x-file-name":encodeURIComponent(name)},body:new Blob([body as Uint8Array<ArrayBuffer>])});
 const picture=await upload(player,png,"my cube é.png");expect(picture.status).toBe(200);
 const media=(await picture.json()).media;expect(media).toMatchObject({type:"image/png",size:12,name:"my cube é.png"});
 expect((await coachSocket.next(m=>m.type==="message")).message.media.id).toBe(media.id);
 expect((await coach.get("conversations"))[0].lastMessage).toMatchObject({body:"",media:"image/png"});
 const fetched=await fetch(`${origin}/api/coaching/media/${media.id}`,{headers:{authorization:"Bearer "+coach.token}});
 expect(fetched.headers.get("content-type")).toBe("image/png");expect(new Uint8Array(await fetched.arrayBuffer())).toEqual(png);
 expect((await fetch(`${origin}/api/coaching/media/${media.id}`,{headers:{authorization:"Bearer "+outsider.token}})).status).toBe(404);
 expect((await fetch(`${origin}/api/coaching/media/${media.id}`)).status).toBe(401);
 expect((await fetch(`${origin}/api/coaching/media/..%2F..%2Fserver.db`,{headers:{authorization:"Bearer "+coach.token}})).status).toBe(404);
 expect((await upload(player,new TextEncoder().encode("<svg onload=alert(1)>"),"x.svg")).status).toBe(415);
 expect((await upload(outsider,png)).status).toBe(404);
 const mp4=new Uint8Array([0,0,0,0x18,...new TextEncoder().encode("ftypisom"),0,0,0,0]);
 expect((await (await upload(player,mp4,"ao5.mp4")).json()).media.type).toBe("video/mp4");
 const big=new Uint8Array(10*1024*1024+1);big.set([0xff,0xd8,0xff]);expect((await upload(player,big,"big.jpg")).status).toBe(413);

 // Each party sees the other's card: their sessions together and how they practise; the coach's notes stay the coach's.
 const card=await coach.get(`people/${player.id}`);
 expect(card).toMatchObject({username:"player_ben",role:"student",note:"Works on F2L",practice:{solves:0,puzzles:[]},history:{days:[],puzzles:{},learned:[]}});expect(card.sessions.length).toBe(1);
 expect(await player.get(`people/${coach.id}`)).toMatchObject({username:"coach_anna",role:"coach",note:null});
 expect((await outsider.call("GET",`people/${player.id}`)).status).toBe(404);
 // A best time given at setup shows in the stats the other party sees.
 const journey=await fetch(origin+"/api/journey",{method:"PUT",headers:{authorization:"Bearer "+player.token,"content-type":"application/json"},body:JSON.stringify({key:"profile",value:{kind:"profile",knownPuzzles:["333"],priority:null,completedAt:new Date().toISOString(),bests:{"333":11234}}})});
 expect(journey.status).toBe(200);
 expect((await coach.get(`people/${player.id}`)).practice.puzzles).toEqual([{puzzle:"333",solves:0,best:11234,ao5:null}]);
 expect((await fetch(origin+"/api/journey",{method:"PUT",headers:{authorization:"Bearer "+player.token,"content-type":"application/json"},body:JSON.stringify({key:"profile",value:{kind:"profile",knownPuzzles:["333"],priority:null,completedAt:new Date().toISOString(),bests:{"222":900}}})})).status).toBe(422);

 // A picture for the account, shown wherever its name is; another replaces it, and it can go.
 const jpeg=new Uint8Array([0xff,0xd8,0xff,0xe0,1,2,3]);
 const put=await fetch(origin+"/api/coaching/avatar",{method:"PUT",headers:{authorization:"Bearer "+coach.token,"content-type":"image/jpeg"},body:new Blob([jpeg])});
 const {avatar}=await put.json();expect(avatar).toMatch(/^\/api\/avatars\/[0-9a-f-]+\.jpeg$/);
 expect(new Uint8Array(await (await fetch(origin+avatar)).arrayBuffer())).toEqual(jpeg);
 expect((await player.get(`coaches/${coach.id}`)).avatar).toBe(avatar);expect((await player.get("conversations"))[0].with.avatar).toBe(avatar);
 expect((await fetch(origin+"/api/coaching/avatar",{method:"PUT",headers:{authorization:"Bearer "+coach.token},body:"GIF89a"})).status).toBe(415);
 expect((await (await fetch(origin+"/api/coaching/avatar",{method:"DELETE",headers:{authorization:"Bearer "+coach.token}})).json()).avatar).toBeNull();
 expect((await fetch(origin+avatar)).status).toBe(404);

 // A coach may keep to their students: the others see no slot and cannot book; theirs still can.
 expect((await coach.call("PUT","profile",{headline:"CFOP coach",bio:"Hi",events:["333"],languages:["French"],priceCents:2500,accepting:true,newStudents:false})).value.newStudents).toBe(false);
 expect(await outsider.get(`coaches/${coach.id}/slots?days=2`)).toMatchObject({welcome:false,slots:[]});
 const theirs=await player.get(`coaches/${coach.id}/slots?days=2`);expect(theirs.welcome).toBe(true);expect(theirs.slots.length).toBeGreaterThan(0);
 expect((await outsider.call("POST","bookings",{coachId:coach.id,start:theirs.slots[0].start})).status).toBe(403);
 await coach.call("PUT","profile",{headline:"CFOP coach",bio:"Hi",events:["333"],languages:["French"],priceCents:2500,accepting:true,newStudents:true});

 const dashboard=await coach.get("dashboard");
 expect(dashboard.weeks[0]).toMatchObject({sessions:1,minutes:60,incomeCents:2500});expect(dashboard.students[0]).toMatchObject({username:"player_ben",upcoming:1,note:"Works on F2L"});

 // The call opens a quarter of an hour before; then the two parties meet and their signalling is relayed.
 coachSocket.send({type:"join",booking:booked.value.id});
 expect((await coachSocket.next(m=>m.type==="ended")).reason).toContain("15 minutes");
 db.db.query("UPDATE coach_bookings SET starts_at=?,ends_at=? WHERE id=?").run(Date.now()-60000,Date.now()+3540000,booked.value.id);
 const intruder=await socket(origin,outsider.token);intruder.send({type:"join",booking:booked.value.id});
 expect((await intruder.next(m=>m.type==="ended")).reason).toBe("Unknown session");
 coachSocket.send({type:"join",booking:booked.value.id});
 expect(await coachSocket.next(m=>m.type==="joined")).toMatchObject({peer:false});
 expect(await playerSocket.next(m=>m.type==="presence")).toMatchObject({inCall:true,user:"coach_anna"});
 playerSocket.send({type:"join",booking:booked.value.id});
 expect(await playerSocket.next(m=>m.type==="joined")).toMatchObject({peer:true});
 expect(await coachSocket.next(m=>m.type==="peer")).toMatchObject({present:true});
 coachSocket.send({type:"signal",booking:booked.value.id,data:{description:{type:"offer",sdp:"v=0"}}});
 expect((await playerSocket.next(m=>m.type==="signal")).data.description.type).toBe("offer");
 playerSocket.send({type:"leave",booking:booked.value.id});
 expect(await coachSocket.next(m=>m.type==="peer")).toMatchObject({present:false});

 // Reviews come once the session is over, from the student only.
 expect((await player.call("POST",`bookings/${booked.value.id}/review`,{rating:5})).status).toBe(409);
 db.db.query("UPDATE coach_bookings SET starts_at=?,ends_at=? WHERE id=?").run(Date.now()-7200000,Date.now()-3600000,booked.value.id);
 expect((await coach.call("POST",`bookings/${booked.value.id}/review`,{rating:1})).status).toBe(403);
 expect((await player.call("POST",`bookings/${booked.value.id}/review`,{rating:6})).status).toBe(422);
 expect((await player.call("POST",`bookings/${booked.value.id}/review`,{rating:4,comment:"Great tips"})).value.review).toEqual({rating:4,comment:"Great tips"});
 const detail=await player.get(`coaches/${coach.id}`);
 expect(detail).toMatchObject({rating:4,reviews:1,sessions:1,ratingCounts:[0,0,0,1,0]});expect(detail.reviewList[0]).toMatchObject({username:"player_ben",comment:"Great tips"});
 expect((await player.call("POST",`bookings/${booked.value.id}/cancel`)).status).toBe(409);

 // The coach offers another time; the student keeps the session where it is, or moves it there.
 expect((await outsider.call("POST","conversations",{coachId:coach.id})).status).toBe(403);
 const second=await player.call("POST","bookings",{coachId:coach.id,start:slots[3].start}),move=`bookings/${second.value.id}`;
 expect((await player.call("POST",`${move}/propose`,{start:slots[5].start})).status).toBe(403);
 expect((await coach.call("POST",`${move}/propose`,{start:slots[3].start})).status).toBe(422);
 expect((await coach.call("POST",`${move}/propose`,{start:slots[5].start})).value.proposal).toEqual({start:slots[5].start,end:slots[5].end});
 expect((await player.get("bookings")).find((b:any)=>b.id===second.value.id).proposal).toEqual({start:slots[5].start,end:slots[5].end});
 expect((await player.call("POST",`${move}/answer`,{accept:false})).value).toMatchObject({startsAt:slots[3].start,proposal:null});
 expect((await player.call("POST",`${move}/answer`,{accept:true})).status).toBe(409);
 await coach.call("POST",`${move}/propose`,{start:slots[5].start});
 expect((await coach.call("POST",`${move}/answer`,{accept:true})).status).toBe(403);
 expect((await player.call("POST",`${move}/answer`,{accept:true})).value).toMatchObject({startsAt:slots[5].start,endsAt:slots[5].end,proposal:null});
 expect((await player.get(`coaches/${coach.id}/slots?days=2`)).slots.some((s:any)=>s.start===slots[3].start)).toBe(true);

 // A cancelled session frees its slot; a disabled coach leaves the list.
 expect((await coach.call("POST",`${move}/cancel`)).value).toMatchObject({status:"cancelled",cancelledByMe:true});
 expect((await player.get(`coaches/${coach.id}/slots?days=2`)).slots.some((s:any)=>s.start===slots[5].start)).toBe(true);
 expect((await adm("POST",`coaching/coaches/${coach.id}/disable`)).status).toBe(200);
 expect(await player.get("coaches")).toEqual([]);
 expect((await player.call("POST","conversations",{coachId:coach.id})).status).toBe(404);
});
