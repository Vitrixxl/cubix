/**
 * The call under way while the player is elsewhere in the app: a small window in the bottom right corner with the other
 * party and the main controls, dragged anywhere on the screen and resized from its edges, or folded to a single button.
 * The page of the call takes it back full size.
 */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router";
import { ChevronDown, Maximize2, Mic, MicOff, PhoneOff, Video, VideoOff, X } from "lucide-react";
import { store as s } from "../store";
import { Avatar, FOCUS, Tip } from "../ui";
import { go } from "../navigation";
import { live } from "./call";
import { callStatus, Control, seesPeer, Stream } from "./callView";
import { Movable, type Place } from "./movable";
import { url } from "./parts";
import { cn } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";
import { tr } from "../../../src/client/i18n";
import { said } from "../base";

/** Where the floating window sits on the screen; kept while the app is open. */
const floatingAt: Place = { x: 1, y: 1 };

export function FloatingCall() {
  const { pathname } = useLocation();
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
  // On the page itself, outside the app's layers, so nothing of the app covers it.
  return createPortal(
    // Folded, a button in the corner; open, a window moved over the whole screen but the tab bar.
    <div className={cn("fixed z-50", live.hidden ? "right-4 bottom-4 max-md:bottom-20" : "pointer-events-none inset-4 max-md:bottom-20")} data-slot="floating-call" data-phase={call.phase}>
      {/* The other party is heard whether the window is open or folded. */}
      <Sound stream={call.remote} />
      {live.hidden ? (
        <UiButton className="shadow-lg" onClick={() => fold(false)} onMouseDown={(e) => e.preventDefault()} data-action="call:show">
          <span className={cn("size-2 rounded-full ring-2 ring-primary-foreground/30", call.phase === "connected" ? "bg-success" : "animate-pulse bg-warning")} />
          {tr("Call with")}{" "}{b.with.username}
          <Maximize2 />
        </UiButton>
      ) : (
        <Movable place={floatingAt} ratio={16 / 9} min={224} className={cn("max-w-full", !floatingAt.w && "w-80 max-sm:w-64")} frame="dark overflow-hidden rounded-[20px] bg-background text-foreground shadow-2xl">
          {() => (
            <>
              <Stream stream={call.remote} muted className={cn("size-full object-cover", !peerVideo && "invisible")} />
              {(!peerVideo || status) && (
                <button type="button" className={cn("absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 pt-6 text-center text-xs text-muted-foreground", FOCUS, !ended && "pb-14")} onClick={open}>
                  <Avatar name={b.with.username} src={b.with.avatar} size={44} className={cn(call.phase === "waiting" && "animate-pulse")} />
                  <span data-slot="call-status">{status?.title ?? tr("{0}'s camera is off", { 0: b.with.username })}</span>
                </button>
              )}
              <div className="absolute inset-x-0 top-0 flex items-center gap-1 bg-linear-to-b from-black/70 to-transparent py-1.5 pr-1.5 pl-3">
                <span className="min-w-0 flex-1 truncate text-xs font-medium">
                  {b.with.username}
                  {!ended && !call.peerMic && <MicOff className="ml-1.5 inline size-3 text-muted-foreground" />}
                </span>
                <Small tip={tr("Open the call")} onClick={open} action="call:open">
                  <Maximize2 />
                </Small>
                <Small tip={ended ? tr("Close") : tr("Fold to a button")} onClick={() => (ended ? call.close() : fold(true))} action="call:hide">
                  {ended ? <X /> : <ChevronDown />}
                </Small>
              </div>
              {!ended && (
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-linear-to-t from-black/80 to-transparent pt-8 pb-3">
                  <Control className="w-11" off={!call.mic} disabled={!call.devices.audio} onClick={() => call.toggleMic()} tip={call.mic ? tr("Mute") : tr("Unmute")} action="call:mic">
                    {call.mic ? <Mic /> : <MicOff />}
                  </Control>
                  <Control className="w-11" off={!call.camera} disabled={!call.devices.video} onClick={() => call.toggleCamera()} tip={call.camera ? tr("Turn the camera off") : tr("Turn the camera on")} action="call:camera">
                    {call.camera ? <Video /> : <VideoOff />}
                  </Control>
                  <Tip content={tr("Leave the call")}>
                    <UiButton variant="destructive" size="icon" aria-label={tr("Leave the call")} onClick={() => call.close()} onMouseDown={(e) => e.preventDefault()} data-action="call:leave" className="w-11">
                      <PhoneOff />
                    </UiButton>
                  </Tip>
                </div>
              )}
            </>
          )}
        </Movable>
      )}
    </div>,
    document.body,
  );
}

/** A small button on the bar over the floating picture, lightened to show on any picture. */
function Small({ tip, onClick, action, children }: { tip: string; onClick: () => void; action: string; children: React.ReactNode }) {
  return (
    <Tip content={tip} side="top">
      <UiButton
        variant="ghost"
        size="icon"
        aria-label={said(tip)}
        onClick={onClick}
        // Clicked, it keeps no focus: Space goes on starting the timer rather than pressing it again.
        onMouseDown={(e) => e.preventDefault()}
        data-action={action}
        className="bg-foreground/10 text-foreground hover:bg-foreground/20"
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
