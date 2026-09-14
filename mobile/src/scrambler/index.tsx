import { memo, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { ScrambleEngine } from "../../../src/client/lib/practiceScrambleCore";
import { SCRAMBLER_HTML } from "./scrambler-html";

/**
 * cubing.js runs in a hidden WebView (Hermes has neither WebAssembly nor module workers).
 * Requests are queued until the page reports it is ready; each has a timeout so a crashed
 * page surfaces as a retryable error instead of a hang.
 */
type Pending = { resolve: (value: string) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
const pending = new Map<number, Pending>();
let nextId = 1;
let post: ((message: string) => void) | null = null;
let ready = false;
const queue = new Map<number, string>();

function send(kind: string, payload: unknown, timeoutMs = 30000): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); queue.delete(id); reject(new Error("The scramble generator did not respond. Please try again.")); }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    const message = JSON.stringify({ id, kind, payload });
    if (ready && post) post(message); else queue.set(id, message);
  });
}
export const nativeEngine: ScrambleEngine = {
  randomScrambleForEvent: event => send("event", { event }),
  orbitScramble: orbit => send("orbit", { orbit }),
};

function receive(raw: string) {
  let data: { ready?: boolean; id?: number; value?: string; error?: string };
  try { data = JSON.parse(raw); } catch { return; }
  if (data.ready) { ready = true; for (const message of queue.values()) post?.(message); queue.clear(); return; }
  if (typeof data.id !== "number") return;
  const entry = pending.get(data.id);
  if (!entry) return;
  pending.delete(data.id); clearTimeout(entry.timer);
  if (typeof data.value === "string") entry.resolve(data.value); else entry.reject(new Error(data.error || "The scramble generator failed."));
}

/** Mount once at the root. A crashed page restarts and exposes a retryable error. */
export const ScramblerHost = memo(function ScramblerHost() {
  const ref = useRef<WebView>(null);
  const [key, setKey] = useState(0);
  useEffect(() => {
    post = message => ref.current?.injectJavaScript(`window.dispatchEvent(new MessageEvent("message",{data:${JSON.stringify(message)}}));true;`);
    return () => { post = null; ready = false; };
  }, [key]);
  const restart = () => {
    ready = false; queue.clear();
    for (const [id, entry] of pending) { clearTimeout(entry.timer); pending.delete(id); entry.reject(new Error("The scramble generator restarted. Please try again.")); }
    setKey(k => k + 1);
  };
  return <View style={styles.host} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <WebView key={key} ref={ref} originWhitelist={["*"]} source={{ html: SCRAMBLER_HTML, baseUrl: "https://cubix.local/" }}
      javaScriptEnabled domStorageEnabled={false} cacheEnabled={false} androidLayerType="none" mixedContentMode="never"
      onMessage={(event: WebViewMessageEvent) => receive(event.nativeEvent.data)}
      onRenderProcessGone={restart} onContentProcessDidTerminate={restart}
      onError={() => restart()} />
  </View>;
});

const styles = StyleSheet.create({ host: { position: "absolute", width: 1, height: 1, opacity: 0, left: -10, top: -10 } });
