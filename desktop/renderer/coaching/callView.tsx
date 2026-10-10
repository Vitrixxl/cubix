/**
 * A session's call, alone on its page: who and until when on top, the other party large, oneself small in a corner
 * (moved by dragging), the controls in words under the picture; the chat beside, and the coach's private notes; the
 * whole can fill the screen. Leaving the page keeps the call going in a floating window (floating.tsx).
 */
import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CalendarX, Maximize, MessageSquare, Mic, MicOff, Minimize, MonitorUp, PhoneOff, PictureInPicture2, ScreenShareOff, Video, VideoOff } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Empty, NUMERIC, PAGE, PageHead, Segmented, StateMark, Surface, Tip, usePhone } from "../ui";
import { go } from "../navigation";
import { callOpen, coaching, type Booking } from "./client";
import { store as s } from "../store";
import { enterCall, type Call } from "./call";
import { Chat } from "./chat";
import { Movable, type Place } from "./movable";
import { useMinute } from "./sessions";
import { Back, relative, span, time, url } from "./parts";
import { ChatPanel } from "../chat";
import { ask } from "../confirm";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Toggle } from "@/components/ui/toggle";
import { tr } from "../../../src/client/i18n";
import { said } from "../base";
/** The coach's notes beside the call, loaded with them only: their editor weighs more than the rest of coaching. */
const PrivateNotes = lazy(() => import("./notes").then((m) => ({ default: m.PrivateNotes })));

export function CallView({ id }: { id: string }) {
  useEffect(() => {
    void coaching.load("bookings");
    void coaching.load("conversations");
  }, []);
  const now = useMinute();
  const b = coaching.bookings?.find((b) => b.id === id);
  const head = (sub?: React.ReactNode) => <PageHead lead={<Back to={url("sessions")} label={tr("Every session")} />} title={b ? tr("Session with {0}", { 0: b.with.username }) : tr("Session")} sub={sub} />;
  if (!coaching.bookings)
    return (
      <div className={PAGE} aria-busy="true" aria-label={tr("Loading")}>
        {head()}
        <Skeleton className="flex-1 rounded-[26px]" />
      </div>
    );
  if (!b || !callOpen(b, now))
    return (
      <div className={PAGE}>
        {head(b && span(b.startsAt, b.endsAt))}
        <Surface className="flex-1">
          <Empty icon={CalendarX}>
            {!b
              ? tr("This session does not exist.")
              : b.status === "cancelled"
                ? tr("This session was cancelled.")
                : b.startsAt > now
                  ? tr("The call opens 15 minutes before the session, {0}.", { 0: relative(b.startsAt - 15 * 60_000, now) })
                  : tr("This session is over.")}
            <UiButton variant="outline" onClick={() => go(url("sessions"))}>
              {tr("Every session")}
            </UiButton>
          </Empty>
        </Surface>
      </div>
    );
  return <Room key={b.id} b={b} now={now} />;
}

function Room({ b, now }: { b: Booking; now: number }) {
  useSyncExternalStore(s.subscribe, () => s.version, () => s.version);
  // The call under way, if it is this one: it went on floating while the player was elsewhere.
  const [call] = useState(() => enterCall(b));
  const phone = usePhone();
  const [panel, setPanel] = useState<"" | "chat" | "notes">(phone ? "" : "chat");
  useEffect(() => {
    // The notice offering to join has done its job.
    toast.dismiss("coaching-call-" + b.id);
  }, [b.id]);
  const conversation = coaching.conversations?.find((c) => c.id === b.conversationId);
  const peerVideo = seesPeer(call);
  const status = callStatus(call);
  // The call and its chat fill the screen on demand; the browser's Escape brings them back.
  const room = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const follow = () => setFull(document.fullscreenElement === room.current);
    document.addEventListener("fullscreenchange", follow);
    return () => document.removeEventListener("fullscreenchange", follow);
  }, []);
  const toggleFull = () => void (document.fullscreenElement ? document.exitFullscreen() : room.current?.requestFullscreen())?.catch(() => {});
  const minutes = Math.max(0, Math.round((now - b.startsAt) / 60_000)),
    // The coach's private notes on the student sit beside the chat.
    notes = conversation && conversation.note !== null;
  const minimize = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    // Back where the player came from, the call floating in a corner.
    if ((history.state?.idx ?? 0) > 0) go(-1);
    else go(url("sessions"));
  };
  return (
    <div className={PAGE}>
      <div ref={room} className={cn("flex min-h-0 flex-1 gap-4 max-md:flex-col", full && "bg-background p-4")} data-slot="call-room">
        <Surface className="min-h-0 min-w-0 flex-1 gap-3 p-3 md:p-4">
          {/* Who the call is with, how long it has run and until when; the call made small or full screen. */}
          <header className="flex shrink-0 items-center gap-3 px-1" data-slot="call-info">
            <Avatar name={b.with.username} src={b.with.avatar} size={32} />
            <b className="truncate text-base font-extrabold">{tr("Session with {0}", { 0: b.with.username })}</b>
            {call.phase !== "ended" && !call.peerMic && (call.phase === "connected" || call.phase === "connecting") && <MicOff className="size-3.5 shrink-0 text-muted-foreground" aria-label={tr("Muted")} />}
            {call.phase === "connected" ? (
              <StateMark tone="good" className="max-sm:hidden">{tr("live · {0} min", { 0: minutes })}</StateMark>
            ) : (
              <StateMark tone={call.phase === "ended" ? "off" : ""} className="max-sm:hidden">
                {call.phase === "ended" ? tr("ended") : call.phase === "waiting" ? tr("waiting") : tr("connecting")}
              </StateMark>
            )}
            <span className={cn(NUMERIC, "truncate text-[13px] text-muted-foreground max-md:hidden")}>{now < b.endsAt ? tr("ends at {0}", { 0: time(b.endsAt) }) : tr("{0} · over", { 0: span(b.startsAt, b.endsAt) })}</span>
            <span className="ml-auto flex shrink-0 items-center gap-1">
              {call.phase !== "ended" && (
                <Tip content={tr("Keep the call in a corner and browse the app")}>
                  <UiButton variant="ghost" size="icon" aria-label={tr("Keep the call in a corner and browse the app")} onClick={minimize} data-action="call:minimize">
                    <PictureInPicture2 />
                  </UiButton>
                </Tip>
              )}
              <Tip content={full ? tr("Leave full screen") : tr("Full screen")}>
                <UiButton variant="ghost" size="icon" aria-label={full ? tr("Leave full screen") : tr("Full screen")} onClick={toggleFull} data-action="call:fullscreen">
                  {full ? <Minimize /> : <Maximize />}
                </UiButton>
              </Tip>
            </span>
          </header>
          {/* The picture's room stays dark whatever the theme, its words light over it. */}
          <div className="dark relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-[20px] bg-background text-foreground" data-slot="stage" data-phase={call.phase}>
            <Stream stream={call.remote} className={cn("size-full object-contain", !peerVideo && "invisible")} />
            {(!peerVideo || status) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                <Avatar name={b.with.username} src={b.with.avatar} size={88} className={cn(call.phase === "waiting" && "animate-pulse")} />
                <span data-slot="call-status" data-trouble={call.trouble || undefined} className="text-base font-bold text-foreground">
                  {status?.title ?? tr("{0}'s camera is off", { 0: b.with.username })}
                </span>
                {status?.detail && <p className="-mt-1.5 max-w-sm px-6 text-center text-xs text-muted-foreground">{said(status.detail)}</p>}
                {status?.retry && (
                  <UiButton variant="outline" data-action="call:retry" onClick={() => call.retry()}>
                    {tr("Try again")}
                  </UiButton>
                )}
              </div>
            )}
            {call.sharing && (
              <StateMark tone="good" className="absolute top-3 left-4">
                {tr("You share your screen · {0} sees it", { 0: b.with.username })}
              </StateMark>
            )}
            {call.phase !== "ended" && <SelfView call={call} />}
          </div>
          {call.notice && call.phase !== "ended" && <p className="shrink-0 text-center text-xs text-muted-foreground">{said(call.notice)}</p>}
          <div className="flex shrink-0 flex-wrap items-center justify-center gap-2" data-slot="call-controls">
            <Control off={!call.mic} disabled={!call.devices.audio} onClick={() => call.toggleMic()} tip={call.mic ? tr("Mute") : tr("Unmute")} label={phone ? undefined : tr("Microphone")} action="call:mic">
              {call.mic ? <Mic /> : <MicOff />}
            </Control>
            <Control off={!call.camera} disabled={!call.devices.video} onClick={() => call.toggleCamera()} tip={call.camera ? tr("Turn the camera off") : tr("Turn the camera on")} label={phone ? undefined : tr("Camera")} action="call:camera">
              {call.camera ? <Video /> : <VideoOff />}
            </Control>
            {!phone && (
              <Control active={call.sharing} onClick={() => void call.toggleScreen()} tip={call.sharing ? tr("Stop sharing") : tr("Share your screen")} label={call.sharing ? tr("Stop sharing") : tr("Share your screen")} action="call:screen">
                <MonitorUp />
              </Control>
            )}
            <Control active={!!panel} onClick={() => setPanel(panel ? "" : "chat")} tip={panel ? tr("Hide the chat") : tr("Show the chat")} label={phone ? undefined : tr("Chat")} action="call:chat">
              <MessageSquare />
            </Control>
            <UiButton
              variant="destructive"
              data-action="call:leave"
              onClick={() => {
                if (document.fullscreenElement) void document.exitFullscreen();
                call.close();
                go(url("sessions"));
              }}
            >
              <PhoneOff />
              {tr("Leave")}
            </UiButton>
          </div>
        </Surface>
        {panel && conversation && (
          <ChatPanel className="flex-none shrink-0 flex-col md:w-96 max-md:h-[45%]">
            {notes && (
              <Segmented
                label="Beside the call"
                value={panel}
                onChange={(v) => setPanel(v as "chat" | "notes")}
                action="call:panel:"
                className="m-3 mb-0 shrink-0 self-start"
                options={[
                  { id: "chat", label: "Chat" },
                  { id: "notes", label: "Private notes" },
                ]}
              />
            )}
            <aside className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={panel === "notes" ? tr("Private notes") : tr("Chat")}>
              {panel === "notes" && notes ? (
                <Suspense fallback={<Skeleton className="m-4 flex-1" />}>
                  <PrivateNotes conversation={conversation.id} note={conversation.note!} className="flex-1 bg-transparent" />
                </Suspense>
              ) : (
                <Chat conversation={conversation} head={false} />
              )}
            </aside>
          </ChatPanel>
        )}
      </div>
    </div>
  );
}

/** A browser to suggest when this one cannot make calls. */
const OTHER_BROWSER = "another browser, such as Brave or Firefox";

/**
 * What to say over the other party's picture, or null once they are there: a headline, what it means or what to do,
 * and whether trying again may help.
 */
export function callStatus(call: Call): { title: string; detail?: string; retry?: boolean } | null {
  const name = call.booking.with.username;
  if (call.phase === "ended") return { title: call.notice || "The call has ended." };
  if (call.offline) return { title: "You are offline", detail: "Reconnecting to Qbix…" };
  if (call.phase === "starting") return { title: "Starting your camera…" };
  if (call.phase === "waiting") {
    if (call.peerGone === "left") return { title: `${name} left the call`, detail: "Waiting for them to come back…" };
    if (call.peerGone === "lost") return { title: `${name} was disconnected`, detail: call.peerOnline ? "Their connection dropped. Waiting for them to come back…" : "They lost their connection to Qbix. Waiting for them to come back…" };
    if (!call.peerOnline) return { title: `${name} is offline`, detail: "They do not have Qbix open. The call starts as soon as they join." };
    return { title: `Waiting for ${name} to join…`, detail: "They are online and know you are here." };
  }
  if (call.phase === "connected") return null;
  switch (call.trouble) {
    case "no-route":
      return { title: "Your browser cannot make the call", detail: `It found no network route for the call. Join from ${OTHER_BROWSER}.`, retry: true };
    case "peer-no-route":
      return { title: `${name}'s browser cannot make the call`, detail: `It found no network route for the call. They can join from ${OTHER_BROWSER}.`, retry: true };
    case "unreachable":
      return { title: `Could not connect to ${name}`, detail: "Your two networks cannot reach each other: a firewall, a VPN or the browser may block calls. Try again, or join from another network or browser.", retry: true };
  }
  if (call.unstable) return { title: `Connection to ${name} lost`, detail: "Reconnecting…" };
  return { title: `Connecting to ${name}…` };
}
/** Whether the other party's picture comes through. */
export const seesPeer = (call: Call) => call.remote.getVideoTracks().length > 0 && call.peerCamera;

/** Where one's own picture sits over the other party's; kept between calls. */
const selfAt: Place = { x: 1, y: 1 };

/**
 * One's own picture, or the screen being shared, in a corner of the other party's; dragged anywhere over it, resized from
 * its edges. Without a camera it says so. A shared screen keeps its own shape, and a button on it stops it once confirmed.
 */
function SelfView({ call }: { call: Call }) {
  const stream = call.sharing ? call.screen : call.devices.video ? call.local : undefined;
  const shown = call.sharing || (call.devices.video && call.camera);
  // The shared screen's width over its height, so no bars frame it; the camera fills a 16:9 tile.
  const [screenRatio, setScreenRatio] = useState(16 / 9);
  const ratio = call.sharing ? screenRatio : 16 / 9;
  const stop = async () => {
    if (await ask({ title: tr("Stop sharing your screen?"), text: tr("{0} sees your camera again.", { 0: call.booking.with.username }), action: tr("Stop sharing"), cancel: tr("Keep sharing") })) if (call.sharing) void call.toggleScreen();
  };
  return (
    // Clear of the bar of controls at the bottom and of the one at the top.
    <div className="pointer-events-none absolute inset-x-3 top-16 bottom-20">
      <Movable
        place={selfAt}
        ratio={ratio}
        min={128}
        className={cn("max-w-[70%] min-w-32", !selfAt.w && "w-[min(30%,14rem)]")}
        frame="overflow-hidden rounded-[14px] bg-muted shadow-lg"
        data-slot="self-view"
        title={tr("Drag to move your picture, or its edges to resize it")}
      >
        {(at) => (
          <>
            {stream && <Stream stream={stream} muted onRatio={call.sharing ? setScreenRatio : undefined} className={cn("pointer-events-none size-full", call.sharing ? "object-contain" : "-scale-x-100 object-cover", !shown && "invisible")} />}
            {!shown && (
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
                <VideoOff className="size-5" />
                {call.devices.video ? tr("Camera off") : tr("No camera")}
              </span>
            )}
            {call.sharing && (
              <UiButton
                variant="secondary"
                data-action="call:stop-sharing"
                onClick={stop}
                // On the corner facing the middle of the room, so it never hides against an edge.
                className={cn("absolute shadow-sm hover:text-destructive", at.y > 0.5 ? "top-1.5" : "bottom-1.5", at.x > 0.5 ? "left-1.5" : "right-1.5")}
              >
                <ScreenShareOff />
                {tr("Stop sharing")}
              </UiButton>
            )}
          </>
        )}
      </Movable>
    </div>
  );
}

/** A device of the call turned off: its word in red. */
const OFF = "aria-pressed:bg-accent aria-pressed:text-destructive aria-pressed:hover:text-destructive";
/** A panel or the screen shown: its word in the accent. */
const ACTIVE = "aria-pressed:bg-accent aria-pressed:text-primary aria-pressed:hover:text-primary";

/**
 * A toggle of the call: its icon, and its word when `label` is given; a device turned off goes red, a panel or the
 * screen shown takes the accent.
 */
export function Control({ off = false, active = false, disabled, onClick, tip, label, action, className, children }: { off?: boolean; active?: boolean; disabled?: boolean; onClick: () => void; tip: string; label?: string; action: string; className?: string; children: React.ReactNode }) {
  return (
    <Tip content={tip}>
      <Toggle
        size={label ? "default" : "icon"}
        aria-label={said(tip)}
        pressed={off || active}
        disabled={disabled}
        onClick={onClick}
        // Clicked, it keeps no focus: Space goes on starting the timer rather than pressing it again.
        onMouseDown={(e) => e.preventDefault()}
        data-action={action}
        className={cn("bg-muted text-foreground hover:bg-accent", off ? OFF : ACTIVE, className)}
      >
        {children}
        {label}
      </Toggle>
    </Tip>
  );
}

/** A <video> showing a stream, which may change under it; `onRatio` hears its width over its height as it changes. */
export function Stream({ stream, muted = false, onRatio, className }: { stream: MediaStream; muted?: boolean; onRatio?: (ratio: number) => void; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  });
  useEffect(() => {
    const video = ref.current;
    if (!video || !onRatio) return;
    const measure = () => video.videoWidth && video.videoHeight && onRatio(video.videoWidth / video.videoHeight);
    measure();
    video.addEventListener("resize", measure);
    return () => video.removeEventListener("resize", measure);
  }, [onRatio]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />;
}
