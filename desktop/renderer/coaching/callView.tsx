/** A session's call: the other party large, oneself small in the corner, the controls under them and the chat beside. */
import { useEffect, useReducer, useRef, useState } from "react";
import { MessageSquare, Mic, MicOff, MonitorUp, PhoneOff, Video, VideoOff } from "lucide-react";
import { toast } from "sonner";
import { Avatar, PAGE, PageHead, Tip, usePhone } from "../ui";
import { go } from "../navigation";
import { callOpen, coaching, type Booking } from "./client";
import { Call } from "./call";
import { Chat } from "./chat";
import { useMinute } from "./sessions";
import { Back, Nothing, PANEL, relative, span, url } from "./parts";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const [call] = useState(() => new Call(b, redraw));
  const phone = usePhone();
  const [chat, setChat] = useState(!phone);
  useEffect(() => {
    // The notice offering to join has done its job.
    toast.dismiss("coaching-call-" + b.id);
    void call.start();
    // Closing the window leaves the call too.
    const leave = () => call.close();
    addEventListener("pagehide", leave);
    return () => {
      removeEventListener("pagehide", leave);
      call.close();
    };
  }, [call]);
  const conversation = coaching.conversations?.find((c) => c.id === b.conversationId);
  const peerVideo = call.remote.getVideoTracks().length > 0 && call.peerCamera;
  const status =
    call.phase === "ended"
      ? call.notice || "The call has ended."
      : call.phase === "connected"
        ? null
        : call.phase === "starting"
          ? "Starting your camera…"
          : call.phase === "waiting"
            ? `Waiting for ${b.with.username} to join…`
            : `Connecting to ${b.with.username}…`;
  return (
    <div className={PAGE}>
      <PageHead
        lead={<Back to={url("sessions")} label="Leave the call" />}
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
            {call.devices.video && (
              <div className="absolute right-3 bottom-3 aspect-video w-[min(30%,14rem)] overflow-hidden rounded-lg bg-neutral-800 ring-1 ring-white/15">
                <Stream stream={call.local} muted className={cn("size-full object-cover", !call.sharing && "-scale-x-100", !call.camera && !call.sharing && "invisible")} />
                {!call.camera && !call.sharing && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <VideoOff className="size-5 text-neutral-400" />
                  </span>
                )}
              </div>
            )}
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

/** A square toggle of the call: a device turned off goes red, a panel or the screen shown takes the accent. */
function Control({ off = false, active = false, disabled, onClick, tip, action, children }: { off?: boolean; active?: boolean; disabled?: boolean; onClick: () => void; tip: string; action: string; children: React.ReactNode }) {
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

/** A <video> showing a stream, which may change under it. */
function Stream({ stream, muted = false, className }: { stream: MediaStream; muted?: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  });
  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />;
}
