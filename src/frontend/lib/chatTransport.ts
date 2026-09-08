import { api } from "../api";
export function sendChatMessage(peer: string, body: Parameters<typeof api.sendMessage>[1]) {
  return api.sendMessage(peer,body);
}
