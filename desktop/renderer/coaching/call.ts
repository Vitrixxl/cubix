/**
 * A session's video call: the camera and microphone go peer to peer over WebRTC; the coaching socket carries the
 * signalling. The coach always makes the offer and the student answers, so the two never offer at once. Each side
 * keeps one audio and one video transceiver: muting, turning the camera off and sharing the screen only swap or
 * disable tracks, with no new negotiation. The call outlives its page: leaving it for the rest of the app keeps the call
 * going in a floating window (see `live`), until one leaves it.
 */
import { store as s } from "../store";
import { coaching, type Booking, type CallEvent } from "./client";

export type CallPhase = "starting" | "waiting" | "connecting" | "connected" | "ended";
/**
 * Why the connection does not come: this browser found no network route ("no-route"), the other party's did not
 * ("peer-no-route"), or the two never reached each other ("unreachable").
 */
export type CallTrouble = "" | "no-route" | "peer-no-route" | "unreachable";

/** How long a connection may take before the call says it cannot reach the other party. */
const CONNECT_TIMEOUT = 20_000;

export class Call {
  phase: CallPhase = "starting";
  /** Why the call ended, or what went wrong with the devices. */
  notice = "";
  local = new MediaStream();
  remote = new MediaStream();
  mic = true;
  camera = true;
  sharing = false;
  /** What the other party said about their own devices. */
  peerMic = true;
  peerCamera = true;
  /** Whether the other party has the app open, while they are not in the call. */
  peerOnline = true;
  /** How the other party went, until they come back. */
  peerGone: "" | "left" | "lost" = "";
  /** Our own link to the server dropped: the call waits for it to come back. */
  offline = false;
  trouble: CallTrouble = "";
  /** The connection dropped once made, and tries to come back. */
  unstable = false;
  devices = { audio: false, video: false };
  private pc?: RTCPeerConnection;
  private audio?: RTCRtpTransceiver;
  private video?: RTCRtpTransceiver;
  /** The screen (or window) being shown instead of the camera. */
  screen?: MediaStream;
  private pending: RTCIceCandidateInit[] = [];
  private closed = false;
  /** Socket events are handled one after the other: each may wait on the connection. */
  private queue = Promise.resolve();
  private timer?: ReturnType<typeof setTimeout>;

  constructor(public booking: Booking) {}
  get offers() {
    return this.booking.role === "coach";
  }
  private emit() {
    s.emit();
  }

  /** Asks for the camera and microphone (whichever exist), then enters the call. */
  async start() {
    coaching.onCall((event) => {
      this.queue = this.queue.then(() => this.event(event)).catch((e) => {
        this.notice = (e as Error).message;
        this.emit();
      });
    });
    for (const constraints of [{ audio: true, video: { width: { ideal: 1280 }, height: { ideal: 720 } } }, { audio: true }, { video: true }] as MediaStreamConstraints[]) {
      try {
        this.local = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (e) {
        if ((e as Error).name === "NotAllowedError") {
          this.notice = "The browser was not allowed to use the camera and microphone.";
          break;
        }
      }
    }
    if (this.closed) return this.stopTracks();
    this.devices = { audio: this.local.getAudioTracks().length > 0, video: this.local.getVideoTracks().length > 0 };
    if (!this.devices.audio && !this.devices.video && !this.notice) this.notice = "No camera or microphone was found. You can still see and hear the other party.";
    this.camera = this.devices.video;
    this.mic = this.devices.audio;
    this.join();
    this.emit();
  }
  private join() {
    this.phase = "waiting";
    coaching.signal({ type: "join", booking: this.booking.id });
  }

  private async event(event: CallEvent) {
    if (this.closed) return;
    if (event.type === "ready") {
      // The socket came back: enter the call again.
      this.offline = false;
      if (this.phase !== "ended") this.join();
      this.emit();
      return;
    }
    if (event.type === "lost") {
      this.reset();
      this.offline = true;
      this.phase = "waiting";
      this.emit();
      return;
    }
    if (event.booking !== this.booking.id) return;
    switch (event.type) {
      case "joined":
        this.phase = event.peer ? "connecting" : "waiting";
        this.peerOnline = event.peer || event.online !== false;
        if (event.peer) await this.connect();
        break;
      case "peer":
        if (event.present) {
          this.phase = "connecting";
          this.peerGone = "";
          this.peerOnline = true;
          await this.connect();
        } else {
          this.reset();
          this.phase = "waiting";
          this.peerGone = event.reason === "left" ? "left" : "lost";
        }
        break;
      case "online":
        this.peerOnline = event.online;
        break;
      case "ended":
        this.phase = "ended";
        this.notice = event.reason === "elsewhere" ? "You joined this session from another window." : event.reason;
        this.reset();
        break;
      case "signal":
        await this.signal(event.data);
        break;
    }
    this.emit();
  }

  /** A fresh connection whenever the other party arrives; the coach offers at once, the student waits for it. */
  private async connect() {
    this.reset();
    const pc = new RTCPeerConnection({ iceServers: coaching.me?.iceServers ?? [] });
    this.pc = pc;
    this.remote = new MediaStream();
    pc.ontrack = (e) => {
      if (!this.remote.getTracks().includes(e.track)) this.remote.addTrack(e.track);
      this.emit();
    };
    let candidates = 0;
    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      candidates++;
      this.send({ candidate: e.candidate.toJSON() });
    };
    pc.onicegatheringstatechange = () => {
      // Done looking without a single way out: this browser cannot make the call (seen with some Chromium builds).
      if (pc !== this.pc || pc.iceGatheringState !== "complete" || candidates) return;
      this.trouble = "no-route";
      this.send({ failure: "no-route" });
      this.emit();
    };
    pc.onconnectionstatechange = () => {
      if (pc !== this.pc) return;
      if (pc.connectionState === "connected") {
        this.phase = "connected";
        this.trouble = "";
        this.unstable = false;
        clearTimeout(this.timer);
      } else if (pc.connectionState === "disconnected" && this.phase === "connected") {
        this.phase = "connecting";
        this.unstable = true;
      } else if (pc.connectionState === "failed") {
        this.phase = "connecting";
        this.trouble ||= "unreachable";
        // A broken path gets a new negotiation from the coach.
        if (this.offers) void this.offer(true);
      }
      this.emit();
    };
    this.timer = setTimeout(() => {
      if (pc !== this.pc || this.phase === "connected") return;
      this.trouble ||= "unreachable";
      this.emit();
    }, CONNECT_TIMEOUT);
    if (this.offers) {
      this.audio = pc.addTransceiver(this.local.getAudioTracks()[0] ?? "audio", { direction: "sendrecv", streams: [this.local] });
      this.video = pc.addTransceiver(this.screenTrack() ?? this.local.getVideoTracks()[0] ?? "video", { direction: "sendrecv", streams: [this.local] });
      await this.offer();
    }
    this.sendState();
  }
  private async offer(restart = false) {
    const pc = this.pc!;
    await pc.setLocalDescription(await pc.createOffer({ iceRestart: restart }));
    this.send({ description: pc.localDescription!.toJSON() });
  }
  private async signal(data: any) {
    if (data.state) {
      this.peerMic = !!data.state.mic;
      this.peerCamera = !!data.state.camera;
      return;
    }
    if (data.failure) {
      if (data.failure === "no-route" && this.trouble !== "no-route") this.trouble = "peer-no-route";
      return;
    }
    if (data.retry) {
      // The other party tries again: a fresh connection, offered by the coach.
      this.phase = "connecting";
      return this.connect();
    }
    if (!this.pc) await this.connect();
    const pc = this.pc!;
    if (data.description) {
      await pc.setRemoteDescription(data.description);
      if (data.description.type === "offer") {
        // The student's tracks go on the transceivers the coach's offer created.
        for (const t of pc.getTransceivers()) {
          const kind = t.receiver.track.kind;
          const track = kind === "audio" ? this.local.getAudioTracks()[0] : this.screenTrack() ?? this.local.getVideoTracks()[0];
          t.direction = "sendrecv";
          if (track) await t.sender.replaceTrack(track);
          t.sender.setStreams?.(this.local);
          if (kind === "audio") this.audio = t;
          else this.video = t;
        }
        await pc.setLocalDescription(await pc.createAnswer());
        this.send({ description: pc.localDescription!.toJSON() });
      }
      for (const candidate of this.pending.splice(0)) await pc.addIceCandidate(candidate).catch(() => {});
    } else if (data.candidate) {
      if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
      else this.pending.push(data.candidate);
    }
  }
  private send(data: object) {
    coaching.signal({ type: "signal", booking: this.booking.id, data });
  }
  private sendState() {
    this.send({ state: { mic: this.mic, camera: this.camera || this.sharing } });
  }
  /** Starts the connection afresh on both sides, after it could not be made. */
  retry() {
    this.queue = this.queue.then(async () => {
      if (this.closed || this.phase !== "connecting") return;
      this.send({ retry: true });
      await this.connect();
      this.emit();
    });
    this.emit();
  }
  private reset() {
    clearTimeout(this.timer);
    this.trouble = "";
    this.unstable = false;
    this.pc?.close();
    this.pc = this.audio = this.video = undefined;
    this.pending = [];
    this.remote = new MediaStream();
    this.peerMic = this.peerCamera = true;
  }
  private screenTrack() {
    return this.screen?.getVideoTracks()[0];
  }

  toggleMic() {
    if (!this.devices.audio) return;
    this.mic = !this.mic;
    this.local.getAudioTracks().forEach((t) => (t.enabled = this.mic));
    this.sendState();
    this.emit();
  }
  toggleCamera() {
    if (!this.devices.video) return;
    this.camera = !this.camera;
    this.local.getVideoTracks().forEach((t) => (t.enabled = this.camera));
    this.sendState();
    this.emit();
  }
  /** Shows the screen (or a window) instead of the camera, until stopped here or by the browser. */
  async toggleScreen() {
    if (this.sharing) return this.stopSharing();
    try {
      this.screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
    } catch {
      return;
    }
    const track = this.screenTrack()!;
    track.onended = () => this.stopSharing();
    this.sharing = true;
    await this.video?.sender.replaceTrack(track);
    this.sendState();
    this.emit();
  }
  private async stopSharing() {
    this.screen?.getTracks().forEach((t) => t.stop());
    this.screen = undefined;
    this.sharing = false;
    await this.video?.sender.replaceTrack(this.local.getVideoTracks()[0] ?? null);
    this.sendState();
    this.emit();
  }
  private stopTracks() {
    this.local.getTracks().forEach((t) => t.stop());
    this.screen?.getTracks().forEach((t) => t.stop());
  }
  /** Leaves the call and frees the devices. */
  close() {
    if (this.closed) return;
    this.closed = true;
    coaching.onCall(undefined);
    coaching.signal({ type: "leave", booking: this.booking.id });
    this.reset();
    this.stopTracks();
    if (live.call === this) {
      live.call = undefined;
      coaching.inCall = "";
    }
    s.emit();
  }
}

/** The call under way, kept while the player goes elsewhere in the app; `hidden` folds its floating window to a button. */
export const live: { call?: Call; hidden: boolean } = { hidden: false };

/** The call of a session: the one under way, or a new one (which ends any other). */
export function enterCall(booking: Booking) {
  if (live.call?.booking.id === booking.id && live.call.phase !== "ended") return live.call;
  live.call?.close();
  const call = new Call(booking);
  live.call = call;
  live.hidden = false;
  coaching.inCall = booking.id;
  void call.start();
  return call;
}

// Closing the window leaves the call too.
addEventListener("pagehide", () => live.call?.close());
