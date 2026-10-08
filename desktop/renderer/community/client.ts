/**
 * The community and tournaments of the web app: the shared client (src/client/lib/community.ts) on the store, its
 * notifications as toasts, its confirmations as `ask` and its links through the router.
 */
import { createElement } from "react";
import { toast } from "sonner";
import { Play, Swords, Users } from "lucide-react";
import { Avatar } from "../base";
import { store as s } from "../store";
import { call } from "../bridge";
import { go } from "../navigation";
import { ask } from "../confirm";
import { Community, type Notice, type SocialHost } from "../../../src/client/lib/community";

export * from "../../../src/client/lib/community";

const ICONS = { group: Users, play: Play, battle: Swords };
/** A notification as a toast: its face the avatar of the player it comes from, or its kind's icon. */
export function notify(n: Notice) {
  if (n.error) return void toast.error(n.title, { id: n.id });
  toast(n.title, {
    id: n.id,
    icon: n.face ? createElement(Avatar, { name: n.face.username, src: n.face.avatar, size: 36 }) : n.icon ? createElement(ICONS[n.icon]) : undefined,
    description: n.description,
    duration: n.duration,
    action: n.action && { label: n.action.label, onClick: n.action.run },
  });
}

/** The web app's host of the community and the coaching. The store is still being created while this module loads:
 * it is reached only when needed. */
export const host: SocialHost = {
  origin: location.origin,
  token: () => call("apiToken"),
  account: () => s.user,
  changed: () => s.emit(),
  notify,
  confirm: ask,
  navigate: (url) => go(url),
  path: () => location.pathname,
  visible: () => document.visibilityState === "visible",
};

export const community = new Community(host);
