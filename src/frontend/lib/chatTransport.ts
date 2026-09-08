import { api, ApiError } from "../api";
import type { ChatMessageDto } from "../../shared/types";

type Body = Parameters<typeof api.sendMessage>[1];
type Sender = (peer: string, body: Body) => Promise<ChatMessageDto>;
let sender: Sender | null = null;
export function registerChatTransport(transport: Sender) {
  sender = transport;
  return () => { if (sender === transport) sender = null; };
}

/** Prefer the live socket. HTTP safely retries with the same id after a dropped acknowledgement. */
export async function sendChatMessage(peer: string, body: Body) {
  if (sender) {
    try { return await sender(peer, body); }
    catch (error) { if (error instanceof ApiError) throw error; }
  }
  return api.sendMessage(peer, body);
}
