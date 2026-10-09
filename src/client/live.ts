/**
 * The app's one socket, /api/live (go-api/live.go): practice sync, coaching, the community's events, duels and matches
 * share it, each message naming its channel. It signs in once (with the account's token, or without one), reconnects
 * with backoff, and after a real reconnection says so once (`again`): the sync pulls from its cursor here, each feature
 * reloads what it shows. The server pings it, so it needs no timer of its own: a throttled background tab stays online.
 */
import type { createLocalClient } from "./local/client";

/** A message of the socket, either way. */
export type LiveMessage = { channel: string; type: string; [key: string]: any };
/**
 * What the features see of the socket. Channel "live" hears `{ type: "ready", again }` once signed in (`again` after a
 * reconnection) and `{ type: "lost" }` when the socket closes.
 */
export interface LiveLink {
  /** Sends on the socket; false while it is not ready. */
  send(message: LiveMessage): boolean;
  /** The messages of a channel ("*": every one but the sync's); returns the unsubscription. */
  on(channel: string, listener: (message: any) => void): () => void;
  connected(): boolean;
}

type Local = ReturnType<typeof createLocalClient>;

/** `token`: the account's, null without an account (the socket opens all the same: duels need none). */
export function createLive(local: Local, token: () => string | null) {
  type Connection = ReturnType<Local["api"]["connectLive"]>;
  const listeners = new Map<string, Set<(message: any) => void>>();
  let connection: Connection | undefined, identity: string | null | undefined, ready = false, wasReady = false;
  let delay = 1000, retry: ReturnType<typeof setTimeout> | undefined, stopped = false;
  const emit = (message: LiveMessage) => {
    for (const key of [message.channel, "*"]) for (const listener of listeners.get(key) ?? []) listener(message);
  };
  function open() {
    clearTimeout(retry);
    retry = undefined;
    const ws = local.api.connectLive(), auth = identity;
    connection = ws;
    ws.on("open", () => ws.send({ channel: "live", type: "auth", ...(auth ? { token: auth, after: local.liveCursor() } : {}) }));
    ws.on("message", ({ data }) => {
      if (connection !== ws) return;
      if (data.channel === "sync" || (data.channel === "live" && data.type === "ready")) void local.receiveLive(ws, data);
      if (data.channel === "sync") return;
      if (data.channel === "live" && data.type === "ready") {
        ready = true;
        delay = 1000;
        emit({ ...data, again: wasReady });
        wasReady = true;
      } else emit(data);
    });
    ws.on("close", event => {
      local.disconnected(ws);
      if (connection !== ws) return;
      connection = undefined;
      if (ready) emit({ channel: "live", type: "lost" });
      ready = false;
      // A session the server no longer knows: the sync finds out and signs out, which opens a socket without it.
      if (event.code === 4001) void local.sync();
      if (!stopped) retry = setTimeout(open, delay);
      delay = Math.min(delay * 2, 15000);
    });
    ws.on("error", () => {});
  }
  return {
    /** Opens the socket, or opens it again with the account's current token. */
    ensure() {
      const current = token();
      if (stopped || (current === identity && (connection || retry))) return;
      if (current !== identity) {
        const previous = connection;
        connection = undefined;
        if (previous) { local.disconnected(previous); previous.close(); if (ready) emit({ channel: "live", type: "lost" }); }
        ready = wasReady = false;
        identity = current;
        delay = 1000;
      }
      open();
    },
    /** Back in front: a socket waiting for its next attempt tries at once. */
    wake() {
      if (stopped || connection) return;
      delay = 1000;
      open();
    },
    send(message: LiveMessage) {
      if (!ready || !connection) return false;
      connection.send(message);
      return true;
    },
    on(channel: string, listener: (message: any) => void) {
      if (!listeners.has(channel)) listeners.set(channel, new Set());
      listeners.get(channel)!.add(listener);
      return () => void listeners.get(channel)!.delete(listener);
    },
    connected: () => ready,
    stop() {
      stopped = true;
      clearTimeout(retry);
      if (connection) { local.disconnected(connection); connection.close(); }
      connection = undefined;
    },
  };
}
