import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { AppState } from "react-native";
import { api, authToken, local, localChanged } from "../api";
import { chatActivityAtom, chatConnectionAtom, chatVersionAtom, userAtom } from "../state";

/** Live notifications supplement the durable local outbox; writes never depend on this socket.
 * `sync` messages announce changes made on the account's other devices, which are pulled at once. */
export function ChatConnection() {
  const user = useAtomValue(userAtom);
  const sessionToken = authToken.get();
  const setConnection = useSetAtom(chatConnectionAtom), setActivity = useSetAtom(chatActivityAtom), bump = useSetAtom(chatVersionAtom);
  useEffect(() => {
    if (!user || user.isGuest) { setConnection("offline"); setActivity(false); return; }
    let disposed = false, delay = 1000;
    let retry: ReturnType<typeof setTimeout> | undefined, heartbeat: ReturnType<typeof setInterval> | undefined;
    let socket: ReturnType<typeof api.connectChat> | undefined;
    const connect = () => {
      if (disposed || !authToken.get()) return;
      clearTimeout(retry); clearInterval(heartbeat);
      const previous = socket; socket = undefined; previous?.close();
      setConnection("connecting");
      let current: ReturnType<typeof api.connectChat>;
      try { current = api.connectChat(); } catch { setConnection("offline"); retry = setTimeout(connect, delay); delay = Math.min(delay * 2, 15000); return; }
      socket = current;
      current.on("open", () => { if (!disposed && socket === current) current.send({ type: "auth", token: authToken.get() ?? "" }); });
      current.on("message", ({ data }) => {
        if (disposed || socket !== current) return;
        if (data.type === "ready") {
          local.invalidateSocial(); void local.remoteChanged(data.cursor);
          delay = 1000; setConnection("online"); bump(v => v + 1);
          heartbeat = setInterval(() => { if (current.ws.readyState === 1) current.send({ type: "ping" }); }, 20000);
        } else if (data.type === "changed") { local.invalidateSocial(); setActivity(true); bump(v => v + 1); }
        else if (data.type === "sync") void local.remoteChanged(data.cursor);
      });
      current.on("close", event => {
        if (disposed || socket !== current) return;
        clearInterval(heartbeat); setConnection("offline");
        if (event.code === 4001) { void local.sync(); return; }
        retry = setTimeout(connect, delay); delay = Math.min(delay * 2, 15000);
      });
      current.on("error", () => { if (!disposed && socket === current) setConnection("offline"); });
    };
    const unsubscribe = localChanged.on(() => bump(v => v + 1));
    // Reconnect promptly when the app returns to the foreground.
    const appState = AppState.addEventListener("change", state => { if (state === "active" && (!socket || socket.ws.readyState > 1)) { clearTimeout(retry); delay = 1000; connect(); } });
    connect();
    return () => { disposed = true; clearTimeout(retry); clearInterval(heartbeat); socket?.close(); unsubscribe(); appState.remove(); };
  }, [user?.id, user?.isGuest, sessionToken, setConnection, setActivity, bump]);
  return null;
}
