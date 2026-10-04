import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { AppState } from "react-native";
import { api, authToken, local } from "../api";
import { userAtom } from "../state";

/** Stream account changes and durable outbox acknowledgements over one authenticated socket. */
export function LiveConnection() {
  const user = useAtomValue(userAtom);
  const sessionToken = authToken.get();
  useEffect(() => {
    if (!user || user.isGuest) return;
    let disposed = false, delay = 1000;
    let retry: ReturnType<typeof setTimeout> | undefined, heartbeat: ReturnType<typeof setInterval> | undefined;
    let socket: ReturnType<typeof api.connectLive> | undefined;
    const connect = () => {
      if (disposed || !authToken.get()) return;
      clearTimeout(retry); clearInterval(heartbeat);
      const previous = socket; socket = undefined; if (previous) { local.disconnected(previous); previous.close(); }
      let current: ReturnType<typeof api.connectLive>;
      try { current = api.connectLive(); } catch { retry = setTimeout(connect, delay); delay = Math.min(delay * 2, 15000); return; }
      socket = current;
      current.on("open", () => { if (!disposed && socket === current) current.send({ type: "auth", token: authToken.get() ?? "", protocol: 2, after: local.liveCursor() }); });
      current.on("message", ({ data }) => {
        if (disposed || socket !== current) return;
        if (data.type === "ready") {
          delay = 1000;
          heartbeat = setInterval(() => { if (current.ws.readyState === 1) current.send({ type: "ping" }); }, 20000);
        }
        void local.receiveLive(current, data);
      });
      current.on("close", event => {
        local.disconnected(current);
        if (disposed || socket !== current) return;
        clearInterval(heartbeat);
        if (event.code === 4001) { void local.sync(); return; }
        retry = setTimeout(connect, delay); delay = Math.min(delay * 2, 15000);
      });
      current.on("error", () => {});
    };
    // Reconnect promptly when the app returns to the foreground.
    const appState = AppState.addEventListener("change", state => { if (state === "active" && (!socket || socket.ws.readyState > 1)) { clearTimeout(retry); delay = 1000; connect(); } });
    connect();
    return () => { disposed = true; clearTimeout(retry); clearInterval(heartbeat); if (socket) { local.disconnected(socket); socket.close(); } appState.remove(); };
  }, [user?.id, user?.isGuest, sessionToken]);
  return null;
}
