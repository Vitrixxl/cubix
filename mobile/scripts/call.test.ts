import { beforeEach, expect, mock, test } from "bun:test";

// The call's signalling (src/lib/call.ts) on a mocked react-native-webrtc and a mocked coaching socket: who offers, what
// goes on the socket, how the other party coming, going and the socket dropping move the call.
class Track {
  enabled = true;
  stopped = false;
  constructor(public kind: "audio" | "video", public id = kind + Math.random()) {}
  stop() { this.stopped = true; }
  _switchCamera = mock(() => {});
}
class MediaStream {
  tracks: Track[] = [];
  getTracks() { return this.tracks; }
  getAudioTracks() { return this.tracks.filter(t => t.kind === "audio"); }
  getVideoTracks() { return this.tracks.filter(t => t.kind === "video"); }
  addTrack(t: Track) { this.tracks.push(t); }
  toURL() { return "stream"; }
}
const transceiver = (kind: "audio" | "video") => ({ direction: "recvonly", receiver: { track: new Track(kind) }, sender: { replaceTrack: mock(async (_: Track | null) => {}) } });
const peers: Peer[] = [];
class Peer {
  localDescription: any = null;
  remoteDescription: any = null;
  connectionState = "new";
  iceGatheringState = "new";
  transceivers: (ReturnType<typeof transceiver> & { source?: Track | string })[] = [];
  added: any[] = [];
  closed = false;
  ontrack?: (e: any) => void;
  onicecandidate?: (e: any) => void;
  onconnectionstatechange?: () => void;
  onicegatheringstatechange?: () => void;
  constructor(public config: any) { peers.push(this); }
  addTransceiver(source: Track | string, init: any) {
    const t = { ...transceiver(typeof source === "string" ? (source as "audio") : source.kind), init, source };
    this.transceivers.push(t);
    return t;
  }
  getTransceivers() { return this.transceivers; }
  async createOffer(options: any) { return { type: "offer", sdp: "offer", options }; }
  async createAnswer() { return { type: "answer", sdp: "answer" }; }
  async setLocalDescription(d: any) { this.localDescription = { ...d, toJSON: () => ({ type: d.type, sdp: d.sdp }) }; }
  async setRemoteDescription(d: any) {
    this.remoteDescription = d;
    // An offer brings the coach's two transceivers.
    if (d.type === "offer") this.transceivers = [transceiver("audio"), transceiver("video")];
  }
  async addIceCandidate(c: any) { this.added.push(c); }
  close() { this.closed = true; }
}
let denied = false;
const getUserMedia = mock(async (constraints: { audio?: unknown; video?: unknown }) => {
  if (denied) throw Object.assign(new Error("Permission denied."), { name: "SecurityError" });
  const s = new MediaStream();
  if (constraints.audio) s.addTrack(new Track("audio"));
  if (constraints.video) s.addTrack(new Track("video"));
  return s;
});
mock.module("react-native-webrtc", () => ({ MediaStream, RTCPeerConnection: Peer, mediaDevices: { getUserMedia } }));
mock.module("expo-keep-awake", () => ({ activateKeepAwakeAsync: mock(async () => {}), deactivateKeepAwake: mock(async () => {}) }));
const alert = mock((..._: unknown[]) => {});
mock.module("react-native", () => ({ Alert: { alert }, Linking: { openSettings: async () => {} } }));
let listener: ((event: any) => void) | undefined;
const sent: any[] = [];
const coaching = {
  host: { changed: mock(() => {}) },
  me: { iceServers: [{ urls: "turn:turn.test", username: "u", credential: "p" }] },
  inCall: "",
  onCall: (l?: (event: any) => void) => { listener = l; },
  signal: (value: any) => { sent.push(value); },
};
mock.module("../src/lib/social", () => ({ coaching }));

const { enterCall, live } = await import("../src/lib/call");

const booking = (role: "coach" | "student") => ({ id: "b1", role, with: { id: "p", username: "alex_cubes" } }) as any;
const signals = () => sent.filter(s => s.type === "signal").map(s => s.data);
async function start(role: "coach" | "student") {
  const call = enterCall(booking(role));
  await new Promise(r => setTimeout(r, 0));
  return call;
}
async function hear(call: any, event: any) {
  listener!(event);
  await call.queue;
}

beforeEach(() => {
  live.call?.close();
  sent.length = peers.length = 0;
  denied = false;
  alert.mockClear();
});

test("the coach joins, offers on the TURN servers when the student is there, and takes the answer and its candidates", async () => {
  const call = await start("coach");
  expect(sent[0]).toEqual({ type: "join", booking: "b1" });
  expect(call.phase).toBe("waiting");
  expect(call.devices).toEqual({ audio: true, video: true });
  expect(coaching.inCall).toBe("b1");

  await hear(call, { type: "joined", booking: "b1", peer: true });
  const pc = peers[0]!;
  expect(pc.config.iceServers).toEqual(coaching.me.iceServers);
  // One audio and one video transceiver carrying the camera and microphone, then the offer and the devices' state.
  expect(pc.transceivers.map(t => (t.source as Track).kind)).toEqual(["audio", "video"]);
  expect(signals()).toEqual([{ description: { type: "offer", sdp: "offer" } }, { state: { mic: true, camera: true } }]);

  // A candidate before the answer waits for it.
  await hear(call, { type: "signal", booking: "b1", data: { candidate: { candidate: "c1" } } });
  expect(pc.added).toEqual([]);
  await hear(call, { type: "signal", booking: "b1", data: { description: { type: "answer", sdp: "answer" } } });
  expect(pc.remoteDescription.type).toBe("answer");
  expect(pc.added).toEqual([{ candidate: "c1" }]);
  // Own candidates go to the other party.
  pc.onicecandidate!({ candidate: { toJSON: () => ({ candidate: "mine" }) } });
  expect(signals().at(-1)).toEqual({ candidate: { candidate: "mine" } });

  pc.connectionState = "connected";
  pc.onconnectionstatechange!();
  expect(call.phase).toBe("connected");
  const video = new Track("video");
  pc.ontrack!({ track: video });
  expect(call.remote.getVideoTracks() as unknown[]).toEqual([video]);
});

test("the student answers the coach's offer with their own tracks", async () => {
  const call = await start("student");
  await hear(call, { type: "joined", booking: "b1", peer: true });
  expect(peers).toHaveLength(1);
  // The student waits for the offer: nothing negotiated yet.
  expect(signals()).toEqual([{ state: { mic: true, camera: true } }]);
  await hear(call, { type: "signal", booking: "b1", data: { description: { type: "offer", sdp: "offer" } } });
  const pc = peers[0]!;
  expect(pc.transceivers.map(t => t.direction)).toEqual(["sendrecv", "sendrecv"]);
  expect(pc.transceivers[0]!.sender.replaceTrack.mock.calls[0]![0]).toBe(call.local.getAudioTracks()[0] as any);
  expect(pc.transceivers[1]!.sender.replaceTrack.mock.calls[0]![0]).toBe(call.local.getVideoTracks()[0] as any);
  expect(signals().at(-1)).toEqual({ description: { type: "answer", sdp: "answer" } });
});

test("the other party leaving, the socket dropping and the session ending move the call", async () => {
  const call = await start("coach");
  await hear(call, { type: "joined", booking: "b1", peer: true });
  await hear(call, { type: "peer", booking: "b1", present: false, reason: "left" });
  expect(peers[0]!.closed).toBe(true);
  expect(call.phase).toBe("waiting");
  expect(call.peerGone).toBe("left");
  // Another session's events are not this call's.
  await hear(call, { type: "peer", booking: "b2", present: true });
  expect(peers).toHaveLength(1);
  await hear(call, { type: "peer", booking: "b1", present: true });
  expect(call.peerGone).toBe("");
  expect(peers).toHaveLength(2);

  await hear(call, { type: "lost" });
  expect(call.offline).toBe(true);
  expect(peers[1]!.closed).toBe(true);
  sent.length = 0;
  await hear(call, { type: "ready" });
  expect(call.offline).toBe(false);
  expect(sent).toEqual([{ type: "join", booking: "b1" }]);

  await hear(call, { type: "ended", booking: "b1", reason: "elsewhere" });
  expect(call.phase).toBe("ended");
  expect(call.notice).toBe("You joined this session from another window.");
});

test("toggles say the devices' state; leaving frees them and the socket", async () => {
  const call = await start("coach");
  call.toggleMic();
  expect(call.local.getAudioTracks()[0]!.enabled).toBe(false);
  expect(signals().at(-1)).toEqual({ state: { mic: false, camera: true } });
  call.toggleCamera();
  expect(signals().at(-1)).toEqual({ state: { mic: false, camera: false } });
  call.switchCamera();
  expect((call.local.getVideoTracks()[0] as any)._switchCamera).toHaveBeenCalled();
  expect(call.front).toBe(false);
  const tracks = call.local.getTracks() as unknown as Track[];
  call.close();
  expect(sent.at(-1)).toEqual({ type: "leave", booking: "b1" });
  expect(tracks.every(t => t.stopped)).toBe(true);
  expect(live.call).toBeUndefined();
  expect(coaching.inCall).toBe("");
  expect(listener).toBeUndefined();
});

test("a refused camera and microphone says so, offers the settings, and still joins to see and hear", async () => {
  denied = true;
  const call = await start("student");
  expect(alert).toHaveBeenCalledTimes(1);
  expect((alert.mock.calls[0]![2] as { text: string }[]).map(b => b.text)).toEqual(["Not now", "Open settings"]);
  expect(call.devices).toEqual({ audio: false, video: false });
  expect(call.notice).toBe("Qbix was not allowed to use the camera and microphone.");
  expect(sent[0]).toEqual({ type: "join", booking: "b1" });
});
