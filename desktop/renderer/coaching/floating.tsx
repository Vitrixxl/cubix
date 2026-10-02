/**
 * The call under way while the player is elsewhere in the app: a small window in the bottom right corner with the other
 * party and the main controls, or folded to a single button; resized from its top left corner. The page of the call takes it
 * back full size.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { ChevronDown, Maximize2, Mic, MicOff, PhoneOff, Video, VideoOff, X } from "lucide-react";
import { store as s } from "../store";
import { Avatar, Tip } from "../ui";
import { go } from "../navigation";
import { live } from "./call";
import { callStatus, ResizeCorner, seesPeer, Stream } from "./callView";
import { url } from "./parts";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";

/** How wide the floating window is in pixels, once resized; kept while the app is open. */
let floatingWidth: number | undefined;

export function FloatingCall() {
  const { pathname } = useLocation();
  const [width, setWidth] = useState(floatingWidth);
  const drag = useRef<{ x: number; y: number; from: number } | null>(null);
  const call = live.call;
  if (!call || pathname === "/coaching/call/" + call.booking.id) return null;
  const b = call.booking,
    status = callStatus(call),
    peerVideo = seesPeer(call),
    ended = call.phase === "ended";
  const open = () => go(url("call/" + b.id));
  const fold = (hidden: boolean) => {
    live.hidden = hidden;
    s.emit();
  };
  return (
    <div className="fixed right-4 bottom-4 z-50 max-md:bottom-20" data-slot="floating-call" data-phase={call.phase}>
      {/* The other party is heard whether the window is open or folded. */}
      <Sound stream={call.remote} />
      {live.hidden ? (
        <UiButton size="lg" className="h-11 gap-2.5 rounded-full pr-3 pl-4 shadow-lg" onClick={() => fold(false)} onMouseDown={(e) => e.preventDefault()} data-action="call:show">
          <span className={cn("size-2 rounded-full", call.phase === "connected" ? "bg-emerald-400" : "animate-pulse bg-amber-300")} />
          Call with {b.with.username}
          <Maximize2 />
        </UiButton>
      ) : (
        <div className={cn("group relative aspect-video max-w-[calc(100vw-2rem)] min-w-56 overflow-hidden rounded-xl bg-neutral-950 text-white shadow-2xl ring-1 ring-white/15", !width && "w-80 max-sm:w-64")} style={{ width }}>
          <Stream stream={call.remote} muted className={cn("size-full object-cover", !peerVideo && "invisible")} />
          {(!peerVideo || status) && (
            <button type="button" className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-xs text-neutral-300" onClick={open}>
              <Avatar name={b.with.username} src={b.with.avatar} size={44} className={cn(call.phase === "waiting" && "animate-pulse")} />
              <span data-slot="call-status">{status ?? `${b.with.username}'s camera is off`}</span>
            </button>
          )}
          <div className="absolute inset-x-0 top-0 flex items-center gap-1 bg-linear-to-b from-black/70 to-transparent py-1.5 pr-1.5 pl-6">
            <span className="min-w-0 flex-1 truncate text-xs font-medium">
              {b.with.username}
              {!ended && !call.peerMic && <MicOff className="ml-1.5 inline size-3 text-neutral-400" />}
            </span>
            <Small tip="Open the call" onClick={open} action="call:open">
              <Maximize2 />
            </Small>
            <Small tip={ended ? "Close" : "Fold to a button"} onClick={() => (ended ? call.close() : fold(true))} action="call:hide">
              {ended ? <X /> : <ChevronDown />}
            </Small>
          </div>
          <ResizeCorner
            top
            left
            title="Drag to resize"
            className="z-10"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = { x: e.clientX, y: e.clientY, from: e.currentTarget.parentElement!.offsetWidth };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              // The window stays pinned by its bottom right corner: pulling the handle up or left grows it.
              const grow = Math.max(d.x - e.clientX, ((d.y - e.clientY) * 16) / 9);
              floatingWidth = Math.min(innerWidth - 32, ((innerHeight - 112) * 16) / 9, Math.max(224, d.from + grow));
              setWidth(floatingWidth);
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          />
          {!ended && (
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-linear-to-t from-black/70 to-transparent pt-4 pb-2">
              <Small tip={call.mic ? "Mute" : "Unmute"} off={!call.mic} disabled={!call.devices.audio} onClick={() => call.toggleMic()} action="call:mic">
                {call.mic ? <Mic /> : <MicOff />}
              </Small>
              <Small tip={call.camera ? "Turn the camera off" : "Turn the camera on"} off={!call.camera} disabled={!call.devices.video} onClick={() => call.toggleCamera()} action="call:camera">
                {call.camera ? <Video /> : <VideoOff />}
              </Small>
              <Small tip="Leave the call" leave onClick={() => call.close()} action="call:leave">
                <PhoneOff />
              </Small>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** A round button over the floating picture. */
function Small({ tip, off = false, leave = false, disabled, onClick, action, children }: { tip: string; off?: boolean; leave?: boolean; disabled?: boolean; onClick: () => void; action: string; children: React.ReactNode }) {
  return (
    <Tip content={tip} side="top">
      <UiButton
        variant="ghost"
        size="icon-sm"
        aria-label={tip}
        disabled={disabled}
        onClick={onClick}
        // Clicked, it keeps no focus: Space goes on starting the timer rather than pressing it again.
        onMouseDown={(e) => e.preventDefault()}
        data-action={action}
        className={cn("rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white", off && "bg-destructive/80 hover:bg-destructive", leave && "bg-destructive hover:bg-destructive/85")}
      >
        {children}
      </UiButton>
    </Tip>
  );
}

/** Plays a stream's sound, with nothing on screen. */
function Sound({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  });
  return <audio ref={ref} autoPlay />;
}
