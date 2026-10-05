/** The driver of the virtual cube (see protocol.ts): it connects like a Bluetooth cube, once the cube page answers. */
import { toast } from "sonner";
import type { SmartCubeDriver } from "../../../src/client/lib/smartCube";
import { socketUrl, VIRTUAL_CUBE_NAME, VIRTUAL_CUBE_PAGE, type AppMessage, type CubeMessage, type RelayMessage } from "./protocol";

const TOAST = "virtual-cube";

export const virtualSmartCube: SmartCubeDriver = {
  label: VIRTUAL_CUBE_NAME,
  connect: (listen, signal) =>
    new Promise((resolve, reject) => {
      const socket = new WebSocket(socketUrl("app"));
      let connected = false;
      const send = (message: AppMessage) => socket.send(JSON.stringify(message));
      signal.addEventListener("abort", () => {
        toast.dismiss(TOAST);
        socket.close();
      });
      socket.onopen = () => send({ type: "hello" });
      socket.onmessage = ({ data }) => {
        const message = JSON.parse(String(data)) as CubeMessage | RelayMessage;
        if (message.type === "facelets") {
          listen({ type: "facelets", facelets: message.facelets });
          listen({ type: "battery", level: message.battery });
          if (!connected) {
            connected = true;
            toast.dismiss(TOAST);
            resolve({ name: message.name, disconnect: () => socket.close() });
          }
        } else if (message.type === "move" || message.type === "orientation") {
          if (connected) listen(message);
        } else if (message.type === "cube" && !message.online && connected) {
          // Its page was closed: the cube is gone, like a real one out of reach.
          connected = false;
          socket.close();
          listen({ type: "disconnected", reason: "The virtual cube was closed" });
          toast("The virtual cube was closed", { id: TOAST, duration: 4000 });
        } else if (message.type === "cube" && !message.online) {
          // Waits for its page: the connection completes as soon as it opens.
          toast("Waiting for the virtual cube", {
            id: TOAST,
            duration: Infinity,
            action: { label: "Open it", onClick: () => window.open(VIRTUAL_CUBE_PAGE, "_blank") },
          });
        }
      };
      socket.onclose = () => {
        if (connected) listen({ type: "disconnected", reason: "The development server stopped" });
        else if (!signal.aborted) reject(new Error("The development server is not reachable"));
      };
    }),
};
