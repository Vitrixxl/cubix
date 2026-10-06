/**
 * A session's call, alone on its page: the other party large, with who and until when above them and the controls over
 * the bottom of the picture, oneself small in a corner (moved by dragging), the chat beside; the whole can fill the
 * screen. Leaving the page keeps the call going in a floating window (floating.tsx).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Maximize, MessageSquare, Mic, MicOff, Minimize, MonitorUp, PhoneOff, PictureInPicture2, ScreenShareOff, Video, VideoOff } from "lucide-react";
import { toast } from "sonner";
import { Avatar, PAGE, PageHead, Tip, usePhone } from "../ui";
import { go } from "../navigation";
import { callOpen, coaching, type Booking } from "./client";
import { store as s } from "../store";
import { enterCall, type Call } from "./call";
import { Chat } from "./chat";
import { Movable, type Place } from "./movable";
import { useMinute } from "./sessions";
import { Back, Nothing, PANEL, relative, span, url } from "./parts";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { tr } from "../../../src/client/i18n";
import { said } from "../base";

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
        <Skeleton className="flex-1 rounded-xl" />
      </div>
    );
  if (!b || !callOpen(b, now))
    return (
      <div className={PAGE}>
        {head(b && span(b.startsAt, b.endsAt))}
        <div className={cn(PANEL, "flex-1")}>
          <Nothing>
            {!b
              ? tr("This session does not exist.")
              : b.status === "cancelled"
                ? tr("This session was cancelled.")
                : b.startsAt > now
                  ? tr("The call opens 15 minutes before the session, {0}.", { 0: relative(b.startsAt - 15 * 60_000, now) })
                  : tr("This session is over.")}
            <UiButton variant="outline" onClick={() => go(url("sessions"))}>
              {tr("Every session")}</UiButton>
          </Nothing>
        </div>
      </div>
    );
  return <Room key={b.id} b={b} now={now} />;
}

function Room({ b, now }: { b: Booking; now: number }) {
  useSyncExternalStore(s.subscribe, () => s.version);
  // The call under way, if it is this one: it went on floating while the player was elsewhere.
  const [call] = useState(() => enterCall(b));
  const phone = usePhone();
  const [chat, setChat] = useState(!phone);
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
  return (
    <div className={PAGE}>
      <div ref={room} className={cn("flex min-h-0 flex-1 gap-4 max-md:flex-col", full && "bg-background p-4")} data-slot="call-room">
        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl bg-neutral-950" data-slot="stage" data-phase={call.phase}>
          <Stream stream={call.remote} className={cn("size-full object-contain", !peerVideo && "invisible")} />
          {(!peerVideo || status) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pb-16 text-sm text-neutral-300">
              <Avatar name={b.with.username} src={b.with.avatar} size={72} className={cn(call.phase === "waiting" && "animate-pulse")} />
              <span data-slot="call-status" data-trouble={call.trouble || undefined} className="font-medium text-neutral-100">
                {status?.title ?? tr("{0}'s camera is off", { 0: b.with.username })}
              </span>
              {status?.detail && <p className="-mt-1.5 max-w-sm px-6 text-center text-xs text-neutral-400">{said(status.detail)}</p>}
              {status?.retry && (
                <UiButton variant="outline" size="sm" data-action="call:retry" onClick={() => call.retry()}>
                  {tr("Try again")}</UiButton>
              )}
            </div>
          )}
          {/* Who the call is with and until when, over the picture: the page holds nothing but the call. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-linear-to-b from-black/60 to-transparent p-3 pb-8 text-white">
            <div className="flex min-w-0 flex-col gap-0.5 pl-1" data-slot="call-info">
              <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                {b.with.username}
                {call.phase !== "ended" && !call.peerMic && (call.phase === "connected" || call.phase === "connecting") && <MicOff className="size-3.5 text-neutral-300" aria-label={tr("Muted")} />}
              </span>
              <span className="truncate text-xs text-neutral-300">{now < b.endsAt ? tr("{0} · ends {1}", { 0: span(b.startsAt, b.endsAt), 1: relative(b.endsAt, now) }) : tr("{0} · over", { 0: span(b.startsAt, b.endsAt) })}</span>
            </div>
            <div className="pointer-events-auto">
              <Control className="h-9 w-11" onClick={toggleFull} tip={full ? tr("Leave full screen") : tr("Full screen")} action="call:fullscreen">
                {full ? <Minimize /> : <Maximize />}
              </Control>
            </div>
          </div>
          {call.phase !== "ended" && <SelfView call={call} />}
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 bg-linear-to-t from-black/70 to-transparent px-3 pt-10 pb-4">
            {call.notice && call.phase !== "ended" && <p className="text-center text-xs text-neutral-300">{said(call.notice)}</p>}
            <div className="flex items-center justify-center gap-2" data-slot="call-controls">
              <Control off={!call.mic} disabled={!call.devices.audio} onClick={() => call.toggleMic()} tip={call.mic ? tr("Mute") : tr("Unmute")} action="call:mic">
                {call.mic ? <Mic /> : <MicOff />}
              </Control>
              <Control off={!call.camera} disabled={!call.devices.video} onClick={() => call.toggleCamera()} tip={call.camera ? tr("Turn the camera off") : tr("Turn the camera on")} action="call:camera">
                {call.camera ? <Video /> : <VideoOff />}
              </Control>
              {!phone && (
                <Control active={call.sharing} onClick={() => void call.toggleScreen()} tip={call.sharing ? tr("Stop sharing") : tr("Share your screen")} action="call:screen">
                  <MonitorUp />
                </Control>
              )}
              <Control active={chat} onClick={() => setChat(!chat)} tip={chat ? tr("Hide the chat") : tr("Show the chat")} action="call:chat">
                <MessageSquare />
              </Control>
              {call.phase !== "ended" && (
                <Control
                  onClick={() => {
                    if (document.fullscreenElement) void document.exitFullscreen();
                    // Back where the player came from, the call floating in a corner.
                    if ((history.state?.idx ?? 0) > 0) go(-1);
                    else go(url("sessions"));
                  }}
                  tip={tr("Keep the call in a corner and browse the app")}
                  action="call:minimize"
                >
                  <PictureInPicture2 />
                </Control>
              )}
              <UiButton
                variant="destructive"
                size="lg"
                className="h-11 px-5"
                data-action="call:leave"
                onClick={() => {
                  if (document.fullscreenElement) void document.exitFullscreen();
                  call.close();
                  go(url("sessions"));
                }}
              >
                <PhoneOff />
                {tr("Leave")}</UiButton>
            </div>
          </div>
        </div>
        {chat && conversation && (
          <aside className={cn(PANEL, "shrink-0 md:w-80 max-md:h-[45%]")} aria-label={tr("Chat")}>
            <Chat conversation={conversation} head={false} />
          </aside>
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
  const [stopping, setStopping] = useState(false);
  return (
    // Clear of the bar of controls at the bottom and of the one at the top.
    <div className="pointer-events-none absolute inset-x-3 top-16 bottom-20">
      <Movable
        place={selfAt}
        ratio={ratio}
        min={128}
        className={cn("max-w-[70%] min-w-32", !selfAt.w && "w-[min(30%,14rem)]")}
        frame="overflow-hidden rounded-lg bg-neutral-800 shadow-lg ring-1 ring-white/15"
        data-slot="self-view"
        title={tr("Drag to move your picture, or its edges to resize it")}
      >
        {(at) => (
          <>
            {stream && <Stream stream={stream} muted onRatio={call.sharing ? setScreenRatio : undefined} className={cn("pointer-events-none size-full", call.sharing ? "object-contain" : "-scale-x-100 object-cover", !shown && "invisible")} />}
            {!shown && (
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs text-neutral-400">
                <VideoOff className="size-5" />
                {call.devices.video ? tr("Camera off") : tr("No camera")}
              </span>
            )}
            {call.sharing && (
              <button
                type="button"
                data-action="call:stop-sharing"
                onClick={() => setStopping(true)}
                // On the corner facing the middle of the room, so it never hides against an edge.
                className={cn("absolute flex h-6 cursor-pointer items-center gap-1 rounded-md bg-black/70 px-1.5 text-xs whitespace-nowrap text-white transition-colors hover:bg-destructive", at.y > 0.5 ? "top-1.5" : "bottom-1.5", at.x > 0.5 ? "left-1.5" : "right-1.5")}
              >
                <ScreenShareOff className="size-3.5" />
                {tr("Stop sharing")}</button>
            )}
          </>
        )}
      </Movable>
      <AlertDialog open={stopping && call.sharing} onOpenChange={setStopping}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("Stop sharing your screen?")}</AlertDialogTitle>
            <AlertDialogDescription>{call.booking.with.username} {" "}{tr("sees your camera again.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Keep sharing")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" data-action="call:stop-sharing-confirm" onClick={() => void call.toggleScreen()}>
              {tr("Stop sharing")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * A toggle of the call, a little wider than tall: a device turned off goes red, a panel or the screen shown takes the
 * accent. `className` resizes it (the floating window's are smaller).
 */
export function Control({ off = false, active = false, disabled, onClick, tip, action, className, children }: { off?: boolean; active?: boolean; disabled?: boolean; onClick: () => void; tip: string; action: string; className?: string; children: React.ReactNode }) {
  return (
    <Tip content={tip}>
      <UiButton
        variant="outline"
        size="icon-lg"
        aria-label={said(tip)}
        aria-pressed={off || active}
        disabled={disabled}
        onClick={onClick}
        // Clicked, it keeps no focus: Space goes on starting the timer rather than pressing it again.
        onMouseDown={(e) => e.preventDefault()}
        data-action={action}
        className={cn("h-11 w-14", className, off && "border-destructive/40 bg-destructive/15 text-destructive hover:bg-destructive/25 dark:border-destructive/40 dark:bg-destructive/15 dark:hover:bg-destructive/25", active && "border-primary/40 bg-primary/12 text-primary hover:bg-primary/20 dark:border-primary/40 dark:bg-primary/12 dark:hover:bg-primary/20")}
      >
        {children}
      </UiButton>
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
