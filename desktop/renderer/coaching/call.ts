/**
 * A session's video call: the camera and microphone go peer to peer over WebRTC; the coaching socket carries the
 * signalling. The coach always makes the offer and the student answers, so the two never offer at once. Each side
 * keeps one audio and one video transceiver: muting, turning the camera off and sharing the screen only swap or
 * disable tracks, with no new negotiation.
 */
import { store as s } from "../store";
import { coaching, type Booking, type CallEvent } from "./client";

export type CallPhase = "starting" | "waiting" | "connecting" | "connected" | "ended";

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
  devices = { audio: false, video: false };
  private pc?: RTCPeerConnection;
  private audio?: RTCRtpTransceiver;
  private video?: RTCRtpTransceiver;
  private screen?: MediaStream;
  private pending: RTCIceCandidateInit[] = [];
  private closed = false;
  /** Socket events are handled one after the other: each may wait on the connection. */
  private queue = Promise.resolve();

  constructor(public booking: Booking, private changed: () => void) {}
  get offers() {
    return this.booking.role === "coach";
  }
  private emit() {
    this.changed();
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
      if (this.phase !== "ended") this.join();
      return;
    }
    if (event.type === "lost") {
      this.reset();
      this.phase = "waiting";
      this.emit();
      return;
    }
    if (event.booking !== this.booking.id) return;
    switch (event.type) {
      case "joined":
        this.phase = event.peer ? "connecting" : "waiting";
        if (event.peer) await this.connect();
        break;
      case "peer":
        if (event.present) {
          this.phase = "connecting";
          await this.connect();
        } else {
          this.reset();
          this.phase = "waiting";
        }
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
    pc.onicecandidate = (e) => e.candidate && this.send({ candidate: e.candidate.toJSON() });
    pc.onconnectionstatechange = () => {
      if (pc !== this.pc) return;
      if (pc.connectionState === "connected") this.phase = "connected";
      else if (pc.connectionState === "failed") {
        this.phase = "connecting";
        // A broken path gets a new negotiation from the coach.
        if (this.offers) void this.offer(true);
      }
      this.emit();
    };
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
  private reset() {
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
  }
}
