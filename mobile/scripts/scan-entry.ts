// Runs inside the camera's WebView (src/scan). Bundled by scripts/build-scan.ts.
import { difference, type Rgb } from "../../src/client/lib/cubeScan";
import { CELL, CORNER, CORNER_AT, FaceReader, findFace, readFace, type FoundFace } from "../../src/client/lib/faceFinder";

/**
 * The camera's picture, a square of it read 30 times a second with the web's own reader (faceFinder.ts): the face
 * found is drawn where it stands, each sticker filled with the colour read, and posted once held still. The app says
 * which faces are read already (`known`, their centres), whether to read at all (`active`), and its accent.
 */
declare global {
  interface Window { ReactNativeWebView?: { postMessage(message: string): void }; __scan(message: Incoming): void }
}
type Incoming = { type: "state"; known: Rgb[]; active: boolean; primary: string } | { type: "read" } | { type: "switch" };
export type Hint = "dark" | "again" | "none" | "close" | "far" | null;

/** The square read, in pixels; the guide's share of it, read where no face is found. */
const READ = 160, GUIDE = 0.62;
const post = (message: unknown) => window.ReactNativeWebView?.postMessage(JSON.stringify(message));
const video = document.querySelector("video")!, view = document.getElementById("view")!, overlay = document.getElementById("overlay")!;
const canvas = document.createElement("canvas");
canvas.width = canvas.height = READ;
const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
const reader = new FaceReader();
let app: { known: Rgb[]; active: boolean; primary: string } = { known: [], active: true, primary: "#fff" };
let frame: Uint8ClampedArray | null = null, face: FoundFace | null = null, stream: MediaStream | null = null;
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

/** The face read: its colours posted, the reader starting over; the camera then keeps its exposure where it can. */
function capture(colours: Rgb[]) {
  reader.reset();
  post({ type: "face", colours });
  const track = stream?.getVideoTracks()[0],
    can = track?.getCapabilities?.() as { exposureMode?: string[]; whiteBalanceMode?: string[] } | undefined,
    hold = { ...(can?.exposureMode?.includes("manual") && { exposureMode: "manual" }), ...(can?.whiteBalanceMode?.includes("manual") && { whiteBalanceMode: "manual" }) };
  if (track && Object.keys(hold).length) track.applyConstraints({ advanced: [hold as MediaTrackConstraintSet] }).catch(() => {});
}

const at = (c: number[], u: number[], v: number[], i: number, j: number) => `${(c[0]! + i * u[0]! + j * v[0]!).toFixed(1)},${(c[1]! + i * u[1]! + j * v[1]!).toFixed(1)}`;
const square = (c: number[], u: number[], v: number[], i: number, j: number, e: number) => [at(c, u, v, i - e, j - e), at(c, u, v, i + e, j - e), at(c, u, v, i + e, j + e), at(c, u, v, i - e, j + e)].join(" ");
function draw(holding: boolean) {
  const cell = (READ * GUIDE) / 3;
  if (!face) {
    overlay.innerHTML = `<polygon points="${square([READ / 2, READ / 2], [cell, 0], [0, cell], 0, 0, 1.5)}" fill="none" stroke="white" stroke-opacity="0.7" stroke-width="1" stroke-dasharray="4 3" stroke-linejoin="round"/>`;
    return;
  }
  const { centre, u, v, colours } = face;
  overlay.innerHTML = `<polygon points="${square(centre, u, v, 0, 0, 1.5)}" fill="none" stroke="${holding ? app.primary : "white"}" stroke-opacity="${holding ? 1 : 0.8}" stroke-width="1.5" stroke-linejoin="round"/>`
    // Where each colour is read: the middle of the sticker, or the centre's four corners (a logo).
    + colours.map(([r, g, b], k) => {
      const [i, j] = [(k % 3) - 1, Math.floor(k / 3) - 1],
        squares = k === 4 ? [-1, 1].flatMap(x => [-1, 1].map(y => square(centre, u, v, x * CORNER_AT, y * CORNER_AT, CORNER / 2))) : [square(centre, u, v, i, j, CELL / 2)];
      return squares.map(points => `<polygon points="${points}" fill="rgb(${r},${g},${b})" stroke="white" stroke-width="${k === 4 ? 0.5 : 0.8}" stroke-linejoin="round"/>`).join("");
    }).join("");
}

function tick() {
  requestAnimationFrame(tick);
  if (!video.videoWidth || document.hidden) return;
  const crop = Math.min(video.videoWidth, video.videoHeight);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(video, (video.videoWidth - crop) / 2, (video.videoHeight - crop) / 2, crop, crop, 0, 0, READ, READ);
  const data = (frame = ctx.getImageData(0, 0, READ, READ).data);
  face = findFace(data, READ, READ);
  // A face read already shows again (its centre the same): it waits for the next one.
  const again = !!face && app.known.some(c => difference(c, face!.colours[4]!) < 12);
  const read = app.active && !again ? reader.push(face) : null;
  let light = 0;
  for (let i = 0; i < data.length; i += 4 * 37) light += 0.3 * data[i]! + 0.59 * data[i + 1]! + 0.11 * data[i + 2]!;
  light /= data.length / (4 * 37);
  const width = face ? (3 * Math.hypot(...face.u)) / READ : 0,
    progress = again || !app.active ? 0 : reader.progress,
    hint: Hint = light < 45 ? "dark" : again ? "again" : !face ? "none" : width < 0.34 ? "close" : width > 0.9 ? "far" : null;
  draw(!!face && progress > 0);
  // Only what changed crosses to the app.
  const live = JSON.stringify({ type: "live", found: !!face, progress, hint });
  if (live !== sent) { sent = live; window.ReactNativeWebView?.postMessage(live); }
  if (read) capture(read);
}

window.__scan = message => {
  if (message.type === "state") app = message;
  else if (message.type === "switch" && devices.length > 1) { device = devices[(devices.indexOf(device ?? "") + 1) % devices.length]!; reader.reset(); void start(); }
  else if (message.type === "read" && frame) {
    const cell = (READ * GUIDE) / 3;
    capture(face?.colours ?? readFace(frame, READ, READ, [READ / 2, READ / 2], [cell, 0], [0, cell]));
  }
};
if (!navigator.mediaDevices?.getUserMedia) post({ type: "status", state: "none", error: "unsupported" });
else void start();
requestAnimationFrame(tick);
post({ type: "ready" });
