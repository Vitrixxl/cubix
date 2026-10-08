import { useSetAtom } from "jotai";
import { CalendarX, MessageSquare, Mic, MicOff, PhoneOff, PictureInPicture2, SwitchCamera, Video, VideoOff, type LucideIcon } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import { RTCView } from "react-native-webrtc";
import { tr } from "../../../../../src/client/i18n";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { enterCall, type Call } from "../../../lib/call";
import { goBackAtom } from "../../../state";
import { BackButton, Empty, Page, PageHead, Surface } from "../../layout";
import { toastAtom } from "../../Toast";
import { Chat } from "../CoachingMessages";
import { callOpen, coaching, useCoaching, type Booking } from "../client";
import { Face, relative, span, useCoachingNav } from "../parts";
import { useMinute } from "../sessions";
import { Movable, type Place } from "./Movable";

/**
 * A session's call, alone on its page (the web's coaching/callView.tsx, phone layout): the other party large, with who
 * and until when above them and the controls over the bottom of the picture, oneself small in a corner (moved by
 * dragging, turned to the other camera from it), the chat under it on demand. Leaving the page, or Android's back,
 * keeps the call going in a floating window (Floating.tsx).
 */
export function CallView({ id }: { id: string }) {
  const c = useCoaching(), nav = useCoachingNav();
  useEffect(() => {
    void coaching.load("bookings");
    void coaching.load("conversations");
  }, []);
  const now = useMinute();
  const b = c.bookings?.find(b => b.id === id);
  const head = (sub?: string) => <PageHead lead={<BackButton label={tr("Every session")} onPress={() => nav.back("sessions")} />} title={b ? tr("Session with {0}", { 0: b.with.username }) : tr("Session")} sub={sub} />;
  if (!c.bookings) return <Page accessibilityLabel={tr("Loading")}>
    {head()}
    <Skeleton className="flex-1 rounded-xl" />
  </Page>;
  if (!b || !callOpen(b, now)) return <Page>
    {head(b && span(b.startsAt, b.endsAt))}
    <Surface className="flex-1">
      <Empty icon={CalendarX} title={!b ? tr("This session does not exist.")
        : b.status === "cancelled" ? tr("This session was cancelled.")
          : b.startsAt > now ? tr("The call opens 15 minutes before the session, {0}.", { 0: relative(b.startsAt - 15 * 60_000, now) })
            : tr("This session is over.")}>
        <Button variant="outline" className="h-11 rounded-lg" onPress={() => nav.go("sessions", true)}><Text>{tr("Every session")}</Text></Button>
      </Empty>
    </Surface>
  </Page>;
  return <Room key={b.id} b={b} now={now} />;
}

/** Fills its parent: a picture of the call (RTCView takes styles, not classes). */
export const FILL: ViewStyle = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 };
/** The shade over the top and the bottom of the picture, so its words and controls read on any picture. */
const shade = (to: "bottom" | "top", alpha: number): ViewStyle => ({ experimental_backgroundImage: `linear-gradient(to ${to}, rgba(0,0,0,${alpha}), rgba(0,0,0,0))` });

function Room({ b, now }: { b: Booking; now: number }) {
  useCoaching();
  // The call under way, if it is this one: it went on floating while the player was elsewhere.
  const [call] = useState(() => enterCall(b));
  const [chat, setChat] = useState(false);
  const nav = useCoachingNav(), pop = useSetAtom(goBackAtom), setToast = useSetAtom(toastAtom);
  // The notice offering to join has done its job.
  useEffect(() => setToast(t => (t?.id === "coaching-call-" + b.id ? null : t)), [b.id]);
  const conversation = coaching.conversations?.find(c => c.id === b.conversationId);
  const peerVideo = seesPeer(call), status = callStatus(call), ended = call.phase === "ended";
  return <Page>
    {/* The picture's room stays dark whatever the theme, its words light over it. */}
    <View className="min-h-0 flex-1 overflow-hidden rounded-xl bg-black" testID="call-stage">
      {peerVideo ? <RTCView key={call.remote.getVideoTracks()[0]!.id} streamURL={call.remote.toURL()} objectFit="contain" zOrder={0} style={FILL} /> : null}
      {!peerVideo || status ? <View className="absolute inset-0 items-center justify-center gap-3 px-6 pb-16">
        <Face name={b.with.username} src={b.with.avatar} size={72} />
        <Text testID="call-status" className="text-center text-sm font-medium text-white">{status ? tr(status.title) : tr("{0}'s camera is off", { 0: b.with.username })}</Text>
        {status?.detail ? <Text className="-mt-1.5 max-w-sm text-center text-xs text-white/60">{tr(status.detail)}</Text> : null}
        {status?.retry ? <Button variant="outline" size="sm" className="h-10 rounded-lg" onPress={() => call.retry()}><Text>{tr("Try again")}</Text></Button> : null}
      </View> : null}
      {/* Who the call is with and until when, over the picture: the page holds nothing but the call. */}
      <View pointerEvents="none" className="absolute inset-x-0 top-0 gap-0.5 p-3 pb-8" style={shade("bottom", 0.6)}>
        <View className="flex-row items-center gap-1.5 pl-1">
          <Text numberOfLines={1} className="text-sm font-medium text-white">{b.with.username}</Text>
          {!ended && !call.peerMic && (call.phase === "connected" || call.phase === "connecting") ? <Icon as={MicOff} size={14} className="text-white/60" accessibilityLabel={tr("Muted")} /> : null}
        </View>
        <Text numberOfLines={1} className="pl-1 text-xs text-white/60">{now < b.endsAt ? tr("{0} · ends {1}", { 0: span(b.startsAt, b.endsAt), 1: relative(b.endsAt, now) }) : tr("{0} · over", { 0: span(b.startsAt, b.endsAt) })}</Text>
      </View>
      {!ended ? <SelfView call={call} /> : null}
      <View className="absolute inset-x-0 bottom-0 items-center gap-2 px-3 pt-10 pb-4" style={shade("top", 0.7)}>
        {call.notice && !ended ? <Text className="text-center text-xs text-white/60">{tr(call.notice)}</Text> : null}
        <View className="flex-row items-center justify-center gap-2" testID="call-controls">
          <Control off={!call.mic} disabled={!call.devices.audio} onPress={() => call.toggleMic()} label={call.mic ? tr("Mute") : tr("Unmute")} icon={call.mic ? Mic : MicOff} />
          <Control off={!call.camera} disabled={!call.devices.video} onPress={() => call.toggleCamera()} label={call.camera ? tr("Turn the camera off") : tr("Turn the camera on")} icon={call.camera ? Video : VideoOff} />
          <Control active={chat} onPress={() => setChat(!chat)} label={chat ? tr("Hide the chat") : tr("Show the chat")} icon={MessageSquare} />
          {/* Back where the player came from, the call floating in a corner. */}
          {!ended ? <Control onPress={() => pop() || nav.go("sessions", true)} label={tr("Keep the call in a corner and browse the app")} icon={PictureInPicture2} /> : null}
          <Button variant="destructive" className="h-11 rounded-lg px-4" testID="call-leave" onPress={() => { call.close(); nav.go("sessions", true); }}>
            <Icon as={PhoneOff} size={18} className="text-white" />
            <Text className="text-white">{tr("Leave")}</Text>
          </Button>
        </View>
      </View>
    </View>
    {chat && conversation ? <Surface className="h-[45%]" accessibilityLabel={tr("Chat")}>
      <Chat conversation={conversation} head={false} />
    </Surface> : null}
  </Page>;
}

/**
 * What to say over the other party's picture, or null once they are there: a headline, what it means or what to do,
 * and whether trying again may help. In English, as the web builds it; `tr` reads it in the app's language.
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
      return { title: "Your phone cannot make the call", detail: "It found no network route for the call. Try another network.", retry: true };
    case "peer-no-route":
      return { title: `${name}'s browser cannot make the call`, detail: "It found no network route for the call. They can join from another browser, such as Brave or Firefox.", retry: true };
    case "unreachable":
      return { title: `Could not connect to ${name}`, detail: "Your two networks cannot reach each other: a firewall or a VPN may block calls. Try again, or join from another network.", retry: true };
  }
  if (call.unstable) return { title: `Connection to ${name} lost`, detail: "Reconnecting…" };
  return { title: `Connecting to ${name}…` };
}
/** Whether the other party's picture comes through. */
export const seesPeer = (call: Call) => call.remote.getVideoTracks().length > 0 && call.peerCamera;

/** Where one's own picture sits over the other party's; kept between calls. */
const selfAt: Place = { x: 1, y: 1 };

/** One's own picture in a corner of the other party's, dragged anywhere over it, with the button that turns to the other camera; without a camera it says so. */
function SelfView({ call }: { call: Call }) {
  const shown = call.devices.video && call.camera;
  // Clear of the words at the top and of the controls at the bottom.
  return <Movable place={selfAt} width={112} ratio={3 / 4} className="inset-x-3 top-16 bottom-24" frame="rounded-lg border border-white/15 bg-neutral-800">
    {() => shown ? <>
      <RTCView streamURL={call.local.toURL()} mirror={call.front} objectFit="cover" zOrder={1} style={FILL} />
      <Pressable accessibilityRole="button" accessibilityLabel={tr("Switch camera")} hitSlop={8} onPress={() => call.switchCamera()}
        className="absolute right-1.5 bottom-1.5 size-8 items-center justify-center rounded-full bg-black/55 active:bg-black/75">
        <Icon as={SwitchCamera} size={16} className="text-white" />
      </Pressable>
    </> : <View className="flex-1 items-center justify-center gap-1">
      <Icon as={VideoOff} size={20} className="text-white/60" />
      <Text className="text-xs text-white/60">{call.devices.video ? tr("Camera off") : tr("No camera")}</Text>
    </View>}
  </Movable>;
}

/**
 * A toggle of the call on a dark glass over the picture: a device turned off goes red, a panel shown takes the accent.
 * `className` resizes it.
 */
export function Control({ off = false, active = false, disabled, onPress, label, icon, className }: { off?: boolean; active?: boolean; disabled?: boolean; onPress: () => void; label: string; icon: LucideIcon; className?: string }) {
  const on = off || active;
  return <Pressable accessibilityRole="togglebutton" accessibilityLabel={label} accessibilityState={{ checked: on, disabled }} disabled={disabled} onPress={onPress}
    className={cn("h-11 w-12 items-center justify-center rounded-lg border", off ? "border-destructive/40 bg-destructive/15 active:bg-destructive/25" : active ? "border-primary/40 bg-primary/15 active:bg-primary/25" : "border-white/15 bg-black/50 active:bg-white/15", disabled && "opacity-40", className)}>
    <Icon as={icon} size={18} className={off ? "text-destructive" : active ? "text-primary" : "text-white"} />
  </Pressable>;
}
