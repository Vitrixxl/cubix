/**
 * A session's call: the other party large, oneself small in a corner (moved by dragging), the controls under them and
 * the chat beside. Leaving the page keeps the call going in a floating window (floating.tsx).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MessageSquare, Mic, MicOff, MonitorUp, PhoneOff, PictureInPicture2, ScreenShareOff, Video, VideoOff } from "lucide-react";
import { toast } from "sonner";
import { Avatar, PAGE, PageHead, Tip, usePhone } from "../ui";
import { go } from "../navigation";
import { callOpen, coaching, type Booking } from "./client";
import { store as s } from "../store";
import { enterCall, type Call } from "./call";
import { Chat } from "./chat";
import { useMinute } from "./sessions";
import { Back, Nothing, PANEL, relative, span, url } from "./parts";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export function CallView({ id }: { id: string }) {
  useEffect(() => {
    void coaching.load("bookings");
    void coaching.load("conversations");
  }, []);
  const now = useMinute();
  const b = coaching.bookings?.find((b) => b.id === id);
  const head = (sub?: React.ReactNode) => <PageHead lead={<Back to={url("sessions")} label="Every session" />} title={b ? `Session with ${b.with.username}` : "Session"} sub={sub} />;
  if (!coaching.bookings)
    return (
      <div className={PAGE} aria-busy="true" aria-label="Loading">
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
              ? "This session does not exist."
              : b.status === "cancelled"
                ? "This session was cancelled."
                : b.startsAt > now
                  ? `The call opens 15 minutes before the session, ${relative(b.startsAt - 15 * 60_000, now)}.`
                  : "This session is over."}
            <UiButton variant="outline" onClick={() => go(url("sessions"))}>
              Every session
            </UiButton>
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
  return (
    <div className={PAGE}>
      <PageHead
        lead={<Back to={url("sessions")} label="Every session" />}
        title={`Session with ${b.with.username}`}
        sub={now < b.endsAt ? `${span(b.startsAt, b.endsAt)} · ends ${relative(b.endsAt, now)}` : `${span(b.startsAt, b.endsAt)} · over`}
      />
      <div className="flex min-h-0 flex-1 gap-4 max-md:flex-col">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl bg-neutral-950" data-slot="stage" data-phase={call.phase}>
            <Stream stream={call.remote} className={cn("size-full object-contain", !peerVideo && "invisible")} />
            {(!peerVideo || status) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-neutral-300">
                <Avatar name={b.with.username} src={b.with.avatar} size={72} className={cn(call.phase === "waiting" && "animate-pulse")} />
                <span data-slot="call-status">{status ?? `${b.with.username}'s camera is off`}</span>
                {(call.phase === "connected" || call.phase === "connecting") && !call.peerMic && (
                  <span className="flex items-center gap-1.5 text-xs text-neutral-400">
                    <MicOff className="size-3.5" /> Muted
                  </span>
                )}
              </div>
            )}
            {call.phase === "connected" && peerVideo && !call.peerMic && (
              <span className="absolute top-3 left-3 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs text-white">
                <MicOff className="size-3.5" /> {b.with.username} is muted
              </span>
            )}
            {call.phase !== "ended" && <SelfView call={call} />}
          </div>
          {call.notice && call.phase !== "ended" && <p className="shrink-0 text-center text-xs text-muted-foreground">{call.notice}</p>}
          <div className="flex shrink-0 items-center justify-center gap-2" data-slot="call-controls">
            <Control off={!call.mic} disabled={!call.devices.audio} onClick={() => call.toggleMic()} tip={call.mic ? "Mute" : "Unmute"} action="call:mic">
              {call.mic ? <Mic /> : <MicOff />}
            </Control>
            <Control off={!call.camera} disabled={!call.devices.video} onClick={() => call.toggleCamera()} tip={call.camera ? "Turn the camera off" : "Turn the camera on"} action="call:camera">
              {call.camera ? <Video /> : <VideoOff />}
            </Control>
            {!phone && (
              <Control active={call.sharing} onClick={() => void call.toggleScreen()} tip={call.sharing ? "Stop sharing" : "Share your screen"} action="call:screen">
                <MonitorUp />
              </Control>
            )}
            <Control active={chat} onClick={() => setChat(!chat)} tip={chat ? "Hide the chat" : "Show the chat"} action="call:chat">
              <MessageSquare />
            </Control>
            {call.phase !== "ended" && (
              <Control
                onClick={() => {
                  // Back where the player came from, the call floating in a corner.
                  if ((history.state?.idx ?? 0) > 0) go(-1);
                  else go(url("sessions"));
                }}
                tip="Keep the call in a corner and browse the app"
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
                call.close();
                go(url("sessions"));
              }}
            >
              <PhoneOff />
              Leave
            </UiButton>
          </div>
        </div>
        {chat && conversation && (
          <aside className={cn(PANEL, "shrink-0 md:w-80 max-md:h-[45%]")} aria-label="Chat">
            <Chat conversation={conversation} head={false} />
          </aside>
        )}
      </div>
    </div>
  );
}

/** What to say over the other party's picture, or null once they are there. */
export function callStatus(call: Call) {
  const name = call.booking.with.username;
  return call.phase === "ended"
    ? call.notice || "The call has ended."
    : call.phase === "connected"
      ? null
      : call.phase === "starting"
        ? "Starting your camera…"
        : call.phase === "waiting"
          ? `Waiting for ${name} to join…`
          : `Connecting to ${name}…`;
}
/** Whether the other party's picture comes through. */
export const seesPeer = (call: Call) => call.remote.getVideoTracks().length > 0 && call.peerCamera;

/**
 * Where one's own picture sits over the other party's, as fractions of the room it moves in, and how wide it is in pixels
 * (none until resized); kept between calls.
 */
const selfAt: { x: number; y: number; w?: number } = { x: 1, y: 1 };

/**
 * One's own picture, or the screen being shared, in a corner of the other party's; dragged anywhere over it, resized from
 * its inner corner. Without a camera it says so. A shared screen keeps its own shape, and a button on it stops it once confirmed.
 */
function SelfView({ call }: { call: Call }) {
  // A copy: the drag measures from where the picture was, which writing `selfAt` must not move.
  const [at, setAt] = useState(() => ({ ...selfAt }));
  const drag = useRef<{ x: number; y: number; from: typeof selfAt; resize?: number } | null>(null);
  const stream = call.sharing ? call.screen : call.devices.video ? call.local : undefined;
  const shown = call.sharing || (call.devices.video && call.camera);
  // The shared screen's width over its height, so no bars frame it; the camera fills a 16:9 tile.
  const [screenRatio, setScreenRatio] = useState(16 / 9);
  const ratio = call.sharing ? screenRatio : 16 / 9;
  const [stopping, setStopping] = useState(false);
  // The handle sits on the corner facing the middle of the room, so it never hides against an edge.
  const left = at.x > 0.5,
    top = at.y > 0.5;
  const move = (next: typeof selfAt) => {
    Object.assign(selfAt, next);
    setAt(next);
  };
  return (
    <div className="pointer-events-none absolute inset-3">
      <div
        className={cn("group pointer-events-auto absolute max-w-[70%] min-w-32 cursor-grab touch-none overflow-hidden rounded-lg bg-neutral-800 shadow-lg ring-1 ring-white/15 select-none active:cursor-grabbing", !at.w && "w-[min(30%,14rem)]")}
        style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%`, translate: `${-at.x * 100}% ${-at.y * 100}%`, width: at.w, aspectRatio: ratio }}
        data-slot="self-view"
        title="Drag to move your picture"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const resize = (e.target as HTMLElement).closest("[data-slot=self-resize]") ? e.currentTarget.offsetWidth : undefined;
          drag.current = { x: e.clientX, y: e.clientY, from: at, resize };
        }}
        onPointerMove={(e) => {
          const d = drag.current,
            tile = e.currentTarget,
            room = tile.parentElement;
          if (!d || !room) return;
          const dx = e.clientX - d.x,
            dy = e.clientY - d.y;
          if (d.resize !== undefined) {
            // Pulling the handle away from the picture grows it, whichever way the height or the width says more.
            const grow = Math.max(left ? -dx : dx, (top ? -dy : dy) * ratio);
            return move({ ...d.from, w: Math.min(room.clientWidth, room.clientHeight * ratio, Math.max(128, d.resize + grow)) });
          }
          const clamp = (v: number) => Math.min(1, Math.max(0, v));
          move({
            ...d.from,
            x: clamp(d.from.x + dx / Math.max(1, room.clientWidth - tile.offsetWidth)),
            y: clamp(d.from.y + dy / Math.max(1, room.clientHeight - tile.offsetHeight)),
          });
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        {stream && <Stream stream={stream} muted onRatio={call.sharing ? setScreenRatio : undefined} className={cn("pointer-events-none size-full", call.sharing ? "object-contain" : "-scale-x-100 object-cover", !shown && "invisible")} />}
        {!shown && (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs text-neutral-400">
            <VideoOff className="size-5" />
            {call.devices.video ? "Camera off" : "No camera"}
          </span>
        )}
        <ResizeCorner top={top} left={left} data-slot="self-resize" title="Drag to resize your picture" />
        {call.sharing && (
          <button
            type="button"
            data-action="call:stop-sharing"
            // Not a drag of the picture.
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setStopping(true)}
            className={cn("absolute flex h-6 cursor-pointer items-center gap-1 rounded-md bg-black/70 px-1.5 text-xs whitespace-nowrap text-white transition-colors hover:bg-destructive", top ? "top-1.5" : "bottom-1.5", left ? "right-1.5" : "left-1.5")}
          >
            <ScreenShareOff className="size-3.5" />
            Stop sharing
          </button>
        )}
      </div>
      <AlertDialog open={stopping && call.sharing} onOpenChange={setStopping}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop sharing your screen?</AlertDialogTitle>
            <AlertDialogDescription>{call.booking.with.username} sees your camera again.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep sharing</AlertDialogCancel>
            <AlertDialogAction variant="destructive" data-action="call:stop-sharing-confirm" onClick={() => void call.toggleScreen()}>
              Stop sharing
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** The corner bracket that resizes a picture when dragged, shown while the picture (a `group`) is hovered. */
export function ResizeCorner({ top, left, className, ...props }: { top: boolean; left: boolean } & React.ComponentProps<"span">) {
  return (
    <span {...props} className={cn("absolute size-5 touch-none opacity-0 transition-opacity group-hover:opacity-100", top ? "top-0" : "bottom-0", left ? "left-0" : "right-0", left === top ? "cursor-nwse-resize" : "cursor-nesw-resize", className)}>
      <span className={cn("absolute size-2.5 border-white/80", top ? "top-1.5 border-t-2" : "bottom-1.5 border-b-2", left ? "left-1.5 border-l-2" : "right-1.5 border-r-2")} />
    </span>
  );
}

/** A square toggle of the call: a device turned off goes red, a panel or the screen shown takes the accent. */
export function Control({ off = false, active = false, disabled, onClick, tip, action, children }: { off?: boolean; active?: boolean; disabled?: boolean; onClick: () => void; tip: string; action: string; children: React.ReactNode }) {
  return (
    <Tip content={tip}>
      <UiButton
        variant="outline"
        size="icon-lg"
        aria-label={tip}
        aria-pressed={off || active}
        disabled={disabled}
        onClick={onClick}
        data-action={action}
        className={cn("size-11", off && "border-destructive/40 bg-destructive/15 text-destructive hover:bg-destructive/25 dark:border-destructive/40 dark:bg-destructive/15 dark:hover:bg-destructive/25", active && "border-primary/40 bg-primary/12 text-primary hover:bg-primary/20 dark:border-primary/40 dark:bg-primary/12 dark:hover:bg-primary/20")}
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
