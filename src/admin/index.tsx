import {useEffect,useRef,useState,type FormEvent} from "react";
import {createRoot} from "react-dom/client";

type Traffic = {startedAt:number;total:number;errors:number;limited:number;ipCount:number;matchingIps:number;untrackedRequests:number;retained:number;capacity:number;rateLimit:number;ips:{ip:string;requests:number;limited:number;errors:number;lastAt:number}[];requests:{id:number;at:number;ip:string;method:string;path:string;status:number;durationMs:number}[]};
type Dashboard = {expiresAt:number;traffic:Traffic;users:{counts:{total:number;registered:number;guests:number};matching:number;page:number;rows:{id:string;username:string;bio:string;createdAt:string;isGuest:number;solves:number;sessions:number}[]}};
const number=(value:number)=>value.toLocaleString("fr-FR");
const time=(value:number|string)=>new Date(value).toLocaleString("fr-FR");
async function request<T>(path:string,body?:unknown,signal?:AbortSignal):Promise<T> {
 const response=await fetch("/api/admin/"+path,{method:body===undefined?"GET":"POST",credentials:"same-origin",cache:"no-store",headers:body===undefined?{}:{"content-type":"application/json"},body:body===undefined?undefined:JSON.stringify(body),signal});
 const value=await response.json(); if(!response.ok)throw Object.assign(new Error(value.error||"Serveur indisponible"),{status:response.status});return value;
}
function Admin() {
 const [data,setData]=useState<Dashboard|null>(null),[authenticated,setAuthenticated]=useState(false),[checking,setChecking]=useState(true),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const [live,setLive]=useState(true),[tab,setTab]=useState("requests"),[ip,setIp]=useState(""),[path,setPath]=useState(""),[status,setStatus]=useState(""),[query,setQuery]=useState(""),[guests,setGuests]=useState(false),[page,setPage]=useState(0),[ipPage,setIpPage]=useState(0),[refresh,setRefresh]=useState(0);
 const [connection,setConnection]=useState<"connecting"|"connected"|"disconnected">("connecting");
 const subscribe=useRef<(()=>void)|null>(null);
 const preferences=useRef({});
 preferences.current={type:"subscribe",live,filters:{ip,path,status,q:query,guests:guests?"1":"0",page:String(page),ipPage:String(ipPage)}};
 useEffect(()=>{
  const controller=new AbortController();
  void request("session",undefined,controller.signal).then(()=>{if(!controller.signal.aborted)setAuthenticated(true)}).catch(e=>{
   if(controller.signal.aborted)return;
   if(e.status!==401)setError(e.message);setChecking(false);
  });
  return()=>controller.abort();
 },[]);
 useEffect(()=>{
  if(!authenticated)return;
  let stopped=false,socket:WebSocket|null=null,retry:ReturnType<typeof setTimeout>|undefined,attempt=0;
  const controller=new AbortController();
  const connect=()=>{
   if(stopped)return;
   setConnection("connecting");
   const url=new URL("/api/admin/live",location.href);url.protocol=location.protocol==="https:"?"wss:":"ws:";
   const ws=new WebSocket(url);socket=ws;
   const send=()=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(preferences.current))};
   subscribe.current=send;
   ws.onopen=()=>{if(stopped)return;setConnection("connected");send()};
   ws.onmessage=event=>{
    if(stopped)return;
    try{const message=JSON.parse(String(event.data));if(message.type==="snapshot"){attempt=0;setData(message.data);setChecking(false);setError("");}}
    catch{setError("Réponse du direct invalide.");ws.close()}
   };
   ws.onclose=async event=>{
    if(stopped)return;
    subscribe.current=null;setConnection("disconnected");setChecking(false);
    if(event.code===4001){setAuthenticated(false);setData(null);setError("Session expirée. Reconnecte-toi.");return;}
    // A rejected upgrade cannot expose its HTTP status to browser JavaScript.
    // Check the session only after a disconnection, never poll a healthy socket.
    try{await request("session",undefined,controller.signal)}catch(e){
     if(stopped)return;
     if((e as Error&{status?:number}).status===401){setAuthenticated(false);setData(null);setError("Session expirée. Reconnecte-toi.");return;}
    }
    if(stopped)return;
    setError("Connexion au direct interrompue. Reconnexion automatique…");
    retry=setTimeout(connect,Math.min(30000,1000*2**Math.min(attempt++,5)));
   };
  };
  connect();
  return()=>{stopped=true;controller.abort();clearTimeout(retry);subscribe.current=null;socket?.close()};
 },[authenticated]);
 useEffect(()=>{subscribe.current?.()},[live,ip,path,status,query,guests,page,ipPage,refresh]);
 const login=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();const form=event.currentTarget,password=String(new FormData(form).get("password"));setBusy(true);setError("");
  try{await request("login",{password});form.reset();setChecking(true);setAuthenticated(true);setRefresh(n=>n+1);}catch(e){setError((e as Error).message)}finally{setBusy(false)}
 };
 const logout=async()=>{setBusy(true);try{await request("logout",{});setAuthenticated(false);setData(null);}catch(e){setError((e as Error).message)}finally{setBusy(false)}};
 if(!authenticated||!data)return <main className="login-screen"><a className="brand" href="/">CUBIX<span> / ADMIN</span></a><form className="login-card" onSubmit={login}><span className="eyebrow">ACCÈS ADMINISTRATEUR</span><h1>Bienvenue<br/>aux commandes.</h1><p>Une session privée, valable 24 heures.</p><label>Mot de passe<input name="password" type="password" autoComplete="current-password" required autoFocus disabled={busy||checking}/></label>{error&&<p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy||checking}>{checking?"Vérification…":busy?"Connexion…":"Ouvrir l’administration ↗"}</button><small>Mot de passe configuré dans <code>.env</code>.</small></form></main>;
 const traffic=data.traffic;
 return <div className="admin-shell"><header className="admin-header"><a className="brand" href="/">CUBIX<span> / ADMIN</span></a><div className="header-actions"><span className="expiry">Session jusqu’au {time(data.expiresAt)}</span><button onClick={logout} disabled={busy}>Déconnexion</button></div></header>
 <main><section className="intro"><div><span className="eyebrow">VUE D’ENSEMBLE</span><h1>Le pouls de Cubix.</h1><p>Trafic HTTP depuis le {time(traffic.startedAt)}.</p></div><div className="live-controls"><button className={live&&connection==="connected"?"live":""} aria-pressed={live} onClick={()=>setLive(v=>!v)}><i/>{!live?"En pause":connection==="connected"?"En direct":connection==="connecting"?"Connexion…":"Reconnexion…"}</button><button aria-label="Actualiser" onClick={()=>setRefresh(v=>v+1)}>↻</button></div></section>
 {error&&<p className="error" role="alert">{error}</p>}
 <section className="metrics">{[["Comptes",data.users.counts.registered],["Requêtes HTTP",traffic.total],["Adresses IP suivies",traffic.ipCount],["Requêtes limitées",traffic.limited]].map(([label,value])=><article key={label}><span>{label}</span><strong>{number(Number(value))}</strong></article>)}</section>
 <nav className="tabs" aria-label="Sections d’administration">{[["requests","Requêtes"],["ips","Adresses IP"],["users","Utilisateurs"]].map(([key,label])=><button key={key} className={tab===key?"selected":""} onClick={()=>setTab(key)}>{label}</button>)}</nav>
 <section className="panel">
 {tab==="requests"&&<><div className="panel-heading"><div><h2>Journal des requêtes</h2><p>200 dernières correspondances · {number(traffic.retained)} / {number(traffic.capacity)} requêtes en mémoire</p></div><span className="badge">HTTP + ouvertures WebSocket</span></div><div className="filters"><input aria-label="Filtrer les requêtes par IP" placeholder="Adresse IP…" value={ip} onChange={e=>{setIp(e.target.value);setIpPage(0)}}/><input aria-label="Filtrer par route" placeholder="Route /api/…" value={path} onChange={e=>setPath(e.target.value)}/><select aria-label="Filtrer par statut" value={status} onChange={e=>setStatus(e.target.value)}><option value="">Tous les statuts</option><option value="2">2xx · Succès</option><option value="3">3xx · Redirections</option><option value="4">4xx · Erreurs client</option><option value="5">5xx · Erreurs serveur</option><option value="429">429 · Rate limit</option></select></div><div className="table-scroll"><table><thead><tr><th>Heure</th><th>IP</th><th>Méthode</th><th>Route</th><th>Statut</th><th>Durée</th></tr></thead><tbody>{traffic.requests.map(row=><tr key={row.id}><td>{time(row.at)}</td><td><button className="text-button" onClick={()=>setIp(row.ip)}>{row.ip}</button></td><td><code>{row.method}</code></td><td className="route" title={row.path}>{row.path}</td><td><span className={`status ${row.status>=400?"bad":"good"}`}>{row.status}</span></td><td>{row.durationMs.toFixed(1)} ms</td></tr>)}</tbody></table>{!traffic.requests.length&&<p className="empty">Aucune requête ne correspond aux filtres.</p>}</div></>}
 {tab==="ips"&&<><div className="panel-heading"><div><h2>Trafic par adresse IP</h2><p>Trié par volume · limite générale : {number(traffic.rateLimit)} requêtes/minute/IP.</p></div></div><div className="filters"><input aria-label="Rechercher une IP" placeholder="Rechercher une IP…" value={ip} onChange={e=>{setIp(e.target.value);setIpPage(0)}}/></div><div className="table-scroll"><table><thead><tr><th>Adresse IP</th><th>Requêtes</th><th>Erreurs</th><th>Limitées</th><th>Dernière activité</th></tr></thead><tbody>{traffic.ips.map(row=><tr key={row.ip}><td><button className="text-button" onClick={()=>{setIp(row.ip);setTab("requests")}}>{row.ip}</button></td><td>{number(row.requests)}</td><td>{number(row.errors)}</td><td>{number(row.limited)}</td><td>{time(row.lastAt)}</td></tr>)}</tbody></table></div><Pagination page={ipPage} count={traffic.matchingIps} change={setIpPage}/>{traffic.untrackedRequests>0&&<p className="error">{number(traffic.untrackedRequests)} requêtes bloquées car la capacité de suivi IP était atteinte.</p>}</>}
 {tab==="users"&&<><div className="panel-heading"><div><h2>Utilisateurs</h2><p>{number(data.users.counts.registered)} comptes · {number(data.users.counts.guests)} anciens invités serveur</p></div><span className="badge">{number(data.users.matching)} résultats</span></div><div className="filters"><input aria-label="Rechercher un utilisateur" placeholder="Rechercher un pseudo…" value={query} onChange={e=>{setQuery(e.target.value);setPage(0)}}/><label className="checkbox"><input type="checkbox" checked={guests} onChange={e=>{setGuests(e.target.checked);setPage(0)}}/>Inclure les anciens invités</label></div><div className="table-scroll"><table><thead><tr><th>Utilisateur</th><th>Identifiant</th><th>Création</th><th>Temps</th><th>Sessions</th></tr></thead><tbody>{data.users.rows.map(row=><tr key={row.id}><td><strong>{row.username}</strong>{!!row.isGuest&&<span className="badge">Invité</span>}{row.bio&&<small className="bio">{row.bio}</small>}</td><td><code>{row.id}</code></td><td>{time(row.createdAt)}</td><td>{number(row.solves)}</td><td>{number(row.sessions)}</td></tr>)}</tbody></table>{!data.users.rows.length&&<p className="empty">Aucun utilisateur trouvé.</p>}</div><Pagination page={page} count={data.users.matching} change={setPage}/></>}
 </section><footer>Comptes serveur uniquement : les invités locaux ne sont pas recensés. Les corps, paramètres de requête, mots de passe et jetons ne sont pas journalisés. Compteurs remis à zéro au redémarrage ; suivi limité à 20 000 IP, avec éviction des IP inactives quand cette capacité est atteinte.</footer></main></div>
}
function Pagination({page,count,change}:{page:number;count:number;change:(n:number)=>void}) {return <div className="pagination"><span>{number(count)} résultats · page {page+1} / {Math.max(1,Math.ceil(count/50))}</span><button disabled={!page} onClick={()=>change(page-1)}>← Précédent</button><button disabled={(page+1)*50>=count} onClick={()=>change(page+1)}>Suivant →</button></div>}
const root=import.meta.hot?(import.meta.hot.data.root??=createRoot(document.getElementById("root")!)):createRoot(document.getElementById("root")!);root.render(<Admin/>);
