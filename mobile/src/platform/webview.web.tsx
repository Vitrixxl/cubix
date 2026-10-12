import { forwardRef, useImperativeHandle, useRef, type CSSProperties } from "react";

/**
 * react-native-webview in the browser (metro.config.js aliases it on the web): the page in a frame of this site, its
 * `ReactNativeWebView.postMessage` calling `frameElement.__message` (public/scan.js). The site's Content-Security-Policy
 * runs no code from a string, so `injectJavaScript` only takes the calls the app makes, `window.f&&window.f(<json>);true;`.
 */
export type WebViewMessageEvent = { nativeEvent: { data: string } };
type Props = { source: { html?: string; uri?: string }; onMessage?: (event: WebViewMessageEvent) => void; onError?: () => void; style?: unknown };
export type WebView = { injectJavaScript(code: string): void };
type Frame = HTMLIFrameElement & { __message?: (data: string) => void };

const FILL: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, background: "transparent" };

export const WebView = forwardRef<WebView, Props>(function WebView({ source, onMessage, onError }, ref) {
  const frame = useRef<Frame | null>(null);
  const message = useRef(onMessage);
  message.current = onMessage;
  useImperativeHandle(ref, () => ({
    injectJavaScript(code) {
      const call = /^window\.(\w+)&&window\.\1\(([\s\S]*)\);true;$/.exec(code.trim());
      const target = frame.current?.contentWindow as unknown as Record<string, ((value: unknown) => void) | undefined> | null | undefined;
      if (call && target) target[call[1]!]?.(JSON.parse(call[2]!));
    },
  }), []);
  return <iframe ref={element => {
    frame.current = element;
    if (element) (element as Frame).__message = data => message.current?.({ nativeEvent: { data } });
  }} srcDoc={source.html} src={source.uri} allow="camera" style={FILL} onError={onError} title="" />;
});
export default WebView;
