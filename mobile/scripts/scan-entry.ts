// Runs inside the camera's WebView (src/scan). Bundled by scripts/build-scan.ts.
import { type Face } from "../../src/shared/cube";
import { HELD_HEX } from "../../src/shared/cubeAppearance";
import { scanColour, VIEW, type Rgb } from "../../src/client/lib/cubeScan";
import { faceWatcher, latticeShapes } from "../../src/client/lib/faceFinder";

/**
 * The camera's picture read as the web's (desktop/renderer/CubeScan.tsx): the face found wherever it stands (nothing
 * drawn and nothing to read while none is), read 30 times a second, each cell marked with the colour read there, the face posted when the app asks. The app gives each
 * colour's look (`refs`) and the colour of the face asked for (`want`), whose live centre is that colour's look.
 */
declare global {
  interface Window { ReactNativeWebView?: { postMessage(message: string): void }; __scan(message: Incoming): void }
}
type Incoming = { type: "state"; refs: Record<Face, Rgb>; want: Face | null } | { type: "read" } | { type: "switch" };

const post = (message: unknown) => window.ReactNativeWebView?.postMessage(JSON.stringify(message));
const hex = (face: Face) => `#${HELD_HEX[face].toString(16).padStart(6, "0")}`;
const video = document.querySelector("video")!, view = document.getElementById("view")!, overlay = document.getElementById("overlay")!;
overlay.setAttribute("viewBox", `0 0 ${VIEW} ${VIEW}`);
const watch = faceWatcher();
let app: { refs: Record<Face, Rgb> | null; want: Face | null } = { refs: null, want: null };
let samples: Rgb[] | null = null, stream: MediaStream | null = null;
let devices: string[] = [], device: string | null = null, sent = "";

async function start() {
  stream?.getTracks().forEach(t => t.stop());
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: device ? { deviceId: { exact: device } } : { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false,
    });
  } catch (error) {
    return post({ type: "status", state: "none", error: String((error as Error)?.name ?? error) });
  }
  const track = stream.getVideoTracks()[0];
  // Mirrored like a selfie when it faces the player; always read as it comes.
  view.style.transform = track?.getSettings().facingMode === "environment" ? "" : "scaleX(-1)";
  video.srcObject = stream;
  await video.play().catch(() => {});
  devices = (await navigator.mediaDevices.enumerateDevices().catch(() => [])).filter(d => d.kind === "videoinput" && d.deviceId).map(d => d.deviceId);
  device ??= track?.getSettings().deviceId ?? null;
  post({ type: "status", state: "live", cameras: devices.length });
}

/** The face read posted; the camera then keeps its exposure and white balance where it can. */
function capture(colours: Rgb[]) {
  post({ type: "face", colours });
  const track = stream?.getVideoTracks()[0],
    can = track?.getCapabilities?.() as { exposureMode?: string[]; whiteBalanceMode?: string[] } | undefined,
    hold = { ...(can?.exposureMode?.includes("manual") && { exposureMode: "manual" }), ...(can?.whiteBalanceMode?.includes("manual") && { whiteBalanceMode: "manual" }) };
  if (track && Object.keys(hold).length) track.applyConstraints({ advanced: [hold as MediaTrackConstraintSet] }).catch(() => {});
}

/** The face's nine cells, where the centre is read around its logo, and a disc of the colour read in each. */
function draw(face: ReturnType<typeof watch> | null, seen: Face[] | null) {
  if (!face) return void (overlay.innerHTML = "");
  const { cells, patches, dots, r } = latticeShapes(face.centre, face.u, face.v);
  overlay.innerHTML = `<g fill="none" stroke-linejoin="round">`
    + cells.map(points => `<polygon points="${points}" stroke="black" stroke-opacity="0.75" stroke-width="2"/>`).join("")
    + patches.map(points => `<polygon points="${points}" stroke="white" stroke-opacity="0.8" stroke-width="1"/>`).join("")
    + (seen ?? []).map((c, k) => `<circle cx="${dots[k]![0].toFixed(1)}" cy="${dots[k]![1].toFixed(1)}" r="${r.toFixed(1)}" fill="${hex(c)}" stroke="black" stroke-opacity="0.6" stroke-width="1.5"/>`).join("")
    + "</g>";
}

function tick() {
  requestAnimationFrame(tick);
  if (!video.videoWidth || document.hidden) return;
  const face = watch(video), read = (samples = face?.colours ?? null);
  // The face asked for's centre is its colour while it is held.
  draw(face, read && app.refs && app.want ? read.map(c => scanColour(c, { ...app.refs!, [app.want!]: read[4]! })) : null);
  // Only what changed crosses to the app.
  const live = JSON.stringify({ type: "live", found: !!face, dark: !!read && read.reduce((s, [r, g, b]) => s + 0.3 * r + 0.59 * g + 0.11 * b, 0) / 9 < 45 });
  if (live !== sent) { sent = live; window.ReactNativeWebView?.postMessage(live); }
}

window.__scan = message => {
  if (message.type === "state") app = message;
  else if (message.type === "switch" && devices.length > 1) { device = devices[(devices.indexOf(device ?? "") + 1) % devices.length]!; void start(); }
  else if (message.type === "read" && samples && app.want) capture(samples);
};
if (!navigator.mediaDevices?.getUserMedia) post({ type: "status", state: "none", error: "unsupported" });
else void start();
requestAnimationFrame(tick);
post({ type: "ready" });
