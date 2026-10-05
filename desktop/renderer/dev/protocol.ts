/**
 * The virtual smart cube of development: its page (/dev/cube) plays a cube, the app's tabs connect to it as to a
 * Bluetooth cube. The development server relays their messages over one WebSocket (desktop/dev.ts); production has
 * neither the page nor the socket.
 */
import type { Quaternion } from "../../../src/client/lib/smartCube";

export const SMART_CUBE_SOCKET = "/dev/smartcube";
export const VIRTUAL_CUBE_PAGE = "/dev/cube";
export const VIRTUAL_CUBE_NAME = "Virtual cube";

/** From the cube to every app tab: its turns, named white on top as a real cube does, its whole state, and how it is held. */
export type CubeMessage =
  | { type: "move"; move: string; at: number }
  | { type: "orientation"; quaternion: Quaternion }
  | { type: "facelets"; facelets: string; name: string; battery: number };
/** From an app tab to the cube: tell me where you stand. */
export type AppMessage = { type: "hello" };
/** From the server: whether a cube page is open (to the apps), how many app tabs listen (to the cube). */
export type RelayMessage = { type: "cube"; online: boolean } | { type: "apps"; count: number };

export const socketUrl = (role: "cube" | "app") => {
  const url = new URL(`${SMART_CUBE_SOCKET}?role=${role}`, location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
};
