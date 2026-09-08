import { useEffect } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { api, ApiError, authToken } from "../api";
import { registerChatTransport } from "../lib/chatTransport";
import type { ChatMessageDto } from "../../shared/types";
import { chatActivityAtom, chatConnectionAtom, chatVersionAtom, userAtom } from "../state";

/** One authenticated live connection per signed-in tab, including while practising. */
export function ChatConnection() {
  const user = useAtomValue(userAtom);
  const setConnection = useSetAtom(chatConnectionAtom);
  const setActivity = useSetAtom(chatActivityAtom);
  const bump = useSetAtom(chatVersionAtom);
  useEffect(() => {
    if (!user || user.isGuest) { setConnection("offline"); setActivity(false); return; }
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let socket: ReturnType<typeof api.connectChat> | undefined;
    let delay = 1000;
    let unregister: (() => void) | undefined;
    const pending = new Map<string, { resolve: (message: ChatMessageDto) => void; reject: (error: Error) => void; timeout: ReturnType<typeof setTimeout> }>();
    const clearPending = () => {
      unregister?.();
      for (const request of pending.values()) { clearTimeout(request.timeout); request.reject(new Error("Connection interrupted")); }
      pending.clear();
    };
    const connect = () => {
      if (disposed) return;
      setConnection("connecting");
      const current = api.connectChat();
      socket = current;
      current.on("open", () => current.send({ type: "auth", token: authToken.get() ?? "" }));
      current.on("message", ({ data }) => {
        if (disposed) return;
        if (data.type === "ready") {
          delay = 1000;
          setConnection("online");
          unregister = registerChatTransport((peer, body) => new Promise((resolve, reject) => {
            if (current.ws.readyState !== WebSocket.OPEN) return reject(new Error("Offline"));
            const timeout = setTimeout(() => { pending.delete(body.clientId); reject(new Error("Acknowledgement timed out")); }, 10000);
            pending.set(body.clientId, { resolve, reject, timeout });
            current.send({ type: "send", peer, ...body });
          }));
          bump(v => v + 1);
          heartbeat = setInterval(() => {
            if (current.ws.readyState === WebSocket.OPEN) current.send({ type: "ping" });
          }, 20000);
        } else if (data.type === "changed") { setActivity(true); bump(v => v + 1); }
        else if (data.type === "sent" || data.type === "error") {
          const request = pending.get(data.clientId);
          if (request) {
            clearTimeout(request.timeout); pending.delete(data.clientId);
            if (data.type === "sent") request.resolve(data.message);
            else request.reject(new ApiError(data.status, data.error));
          }
        }
      });
      current.on("close", event => {
        clearInterval(heartbeat);
        clearPending();
        if (disposed) return;
        setConnection("offline");
        if (event.code === 4001) {
          window.dispatchEvent(new Event("cubix-session-expired"));
          return;
        }
        retry = setTimeout(connect, delay);
        delay = Math.min(delay * 2, 15000);
      });
      current.on("error", () => { if (!disposed) setConnection("offline"); });
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      clearInterval(heartbeat);
      clearPending();
      socket?.close();
    };
  }, [user?.id, user?.isGuest, setConnection, setActivity, bump]);
  return null;
}
