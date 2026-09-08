import { useEffect } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { api, local, authToken } from "../api";
import { chatActivityAtom, chatConnectionAtom, chatVersionAtom, userAtom } from "../state";

/** Live notifications supplement the durable local outbox; writes never depend on this socket. */
export function ChatConnection() {
  const user = useAtomValue(userAtom);
  const setConnection = useSetAtom(chatConnectionAtom), setActivity = useSetAtom(chatActivityAtom), bump = useSetAtom(chatVersionAtom);
  useEffect(() => {
    if (!user || user.isGuest) { setConnection("offline"); setActivity(false); return; }
    let disposed = false, delay = 1000;
    let retry: ReturnType<typeof setTimeout> | undefined, heartbeat: ReturnType<typeof setInterval> | undefined;
    let socket: ReturnType<typeof api.connectChat> | undefined;
    const connect = () => {
      if (disposed || !authToken.get()) return;
      setConnection("connecting");
      const current = api.connectChat(); socket = current;
      current.on("open",() => current.send({type:"auth",token:authToken.get() ?? ""}));
      current.on("message",({data}) => {
        if (disposed) return;
        if (data.type === "ready") {
          delay = 1000; setConnection("online"); bump(v => v+1);
          heartbeat = setInterval(() => { if (current.ws.readyState === WebSocket.OPEN) current.send({type:"ping"}); },20000);
        } else if (data.type === "changed") { setActivity(true); bump(v => v+1); }
      });
      current.on("close",event => {
        clearInterval(heartbeat); if (disposed) return; setConnection("offline");
        if (event.code === 4001) { void local.sync(); return; }
        retry = setTimeout(connect,delay); delay = Math.min(delay*2,15000);
      });
      current.on("error",() => { if (!disposed) setConnection("offline"); });
    };
    const changed = () => bump(v => v+1);
    window.addEventListener("cubix-local-changed",changed);
    connect();
    return () => { disposed=true; clearTimeout(retry); clearInterval(heartbeat); socket?.close(); window.removeEventListener("cubix-local-changed",changed); };
  },[user?.id,user?.isGuest,setConnection,setActivity,bump]);
  return null;
}
