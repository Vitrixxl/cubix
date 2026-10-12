import { useEffect, useRef, type CSSProperties } from "react";

/**
 * react-native-webrtc in the browser (metro.config.js aliases it on the web): the browser's own WebRTC, with the two
 * things the app uses beyond it, a stream's `toURL()` for `RTCView` and a camera track's `_switchCamera()`.
 */
const streams = new Map<string, MediaStream>();
const stream = globalThis.MediaStream.prototype as MediaStream & { toURL?: () => string; release?: () => void };
stream.toURL = function (this: MediaStream) { streams.set(this.id, this); return this.id; };
stream.release = function (this: MediaStream) { streams.delete(this.id); };
(globalThis.MediaStreamTrack.prototype as MediaStreamTrack & { _switchCamera?: () => void })._switchCamera = function (this: MediaStreamTrack) {
  const facingMode = this.getSettings().facingMode === "environment" ? "user" : "environment";
  void this.applyConstraints({ facingMode }).catch(() => {});
};

export const RTCPeerConnection = globalThis.RTCPeerConnection;
export const MediaStream = globalThis.MediaStream;
export const mediaDevices = navigator.mediaDevices;

export function RTCView({ streamURL, objectFit = "cover", mirror, style }: { streamURL: string; objectFit?: "cover" | "contain"; mirror?: boolean; zOrder?: number; style?: object }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (video.current) video.current.srcObject = streams.get(streamURL) ?? null;
  }, [streamURL]);
  const css: CSSProperties = { ...(style as CSSProperties), objectFit, transform: mirror ? "scaleX(-1)" : undefined };
  // The app mirrors only its own camera, the one picture never to be heard (the other party's plays its sound).
  return <video ref={video} autoPlay playsInline muted={mirror !== undefined} style={css} />;
}
