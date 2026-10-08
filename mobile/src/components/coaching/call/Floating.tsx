import { useAtomValue, useSetAtom } from "jotai";
import { ChevronDown, Maximize2, Mic, MicOff, PhoneOff, Video, VideoOff, X, type LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { RTCView } from "react-native-webrtc";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tr } from "../../../../../src/client/i18n";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { live } from "../../../lib/call";
import { coaching, useSocial } from "../../../lib/social";
import { routeAtom } from "../../../state";
import { Face } from "../parts";
import { callStatus, Control, FILL, seesPeer } from "./CallView";
import { Movable, type Place } from "./Movable";

/** Where the floating window sits on the screen; kept while the app is open. */
const floatingAt: Place = { x: 1, y: 1 };

/**
 * The call under way while the player is elsewhere in the app (the web's coaching/floating.tsx): a small window over
 * the app with the other party and the main controls, dragged anywhere above the tab bar, or folded to a single button.
 * A tap on the picture takes the call back to its page. The other party is heard either way: WebRTC plays them itself.
 */
export function FloatingCall() {
  useSocial();
  const route = useAtomValue(routeAtom), push = useSetAtom(routeAtom), insets = useSafeAreaInsets();
  const call = live.call;
  if (!call || route.page === "coaching" && route.view === "call/" + call.booking.id) return null;
  const b = call.booking, status = callStatus(call), peerVideo = seesPeer(call), ended = call.phase === "ended";
  const open = () => push({ page: "coaching", view: "call/" + b.id });
  const fold = (hidden: boolean) => {
    live.hidden = hidden;
    coaching.host.changed();
  };
  // Above the tab bar, clear of the status bar.
  const room = { top: insets.top + 8, bottom: Math.max(insets.bottom, 6) + 72 };
  if (live.hidden) return <View pointerEvents="box-none" className="absolute right-4" style={{ bottom: room.bottom }} testID="floating-call">
    <Pressable accessibilityRole="button" accessibilityLabel={`${tr("Call with")} ${b.with.username}`} onPress={() => fold(false)}
      className="h-11 flex-row items-center gap-2.5 rounded-full bg-primary pr-3 pl-4 shadow-lg active:bg-primary/90">
      <View className={cn("size-2 rounded-full", call.phase === "connected" ? "bg-success" : "bg-warning")} />
      <Text className="text-sm font-medium text-primary-foreground">{`${tr("Call with")} ${b.with.username}`}</Text>
      <Icon as={Maximize2} size={16} className="text-primary-foreground" />
    </Pressable>
  </View>;
  return <Movable place={floatingAt} width={256} ratio={16 / 9} className="inset-x-3" style={room} frame="rounded-xl border border-white/15 bg-black shadow-2xl">
    {() => <View className="flex-1" testID="floating-call">
      {peerVideo ? <RTCView key={call.remote.getVideoTracks()[0]!.id} streamURL={call.remote.toURL()} objectFit="cover" zOrder={1} style={FILL} /> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={tr("Open the call")} onPress={open} className={cn("absolute inset-0 items-center justify-center gap-2 px-4 pt-6", !ended && "pb-14")}>
        {!peerVideo || status ? <>
          <Face name={b.with.username} src={b.with.avatar} size={44} />
          <Text numberOfLines={2} className="text-center text-xs text-white/70">{status ? tr(status.title) : tr("{0}'s camera is off", { 0: b.with.username })}</Text>
        </> : null}
      </Pressable>
      <View className="absolute inset-x-0 top-0 flex-row items-center gap-1 py-1.5 pr-1.5 pl-3" style={{ experimental_backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,0.7), rgba(0,0,0,0))" }}>
        <Text numberOfLines={1} className="min-w-0 flex-1 text-xs font-medium text-white">{b.with.username}</Text>
        {!ended && !call.peerMic ? <Icon as={MicOff} size={12} className="text-white/60" /> : null}
        <Small label={tr("Open the call")} icon={Maximize2} onPress={open} />
        <Small label={ended ? tr("Close") : tr("Fold to a button")} icon={ended ? X : ChevronDown} onPress={() => (ended ? call.close() : fold(true))} />
      </View>
      {!ended ? <View className="absolute inset-x-0 bottom-0 flex-row items-center justify-center gap-2 pt-6 pb-2" style={{ experimental_backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.8), rgba(0,0,0,0))" }}>
        <Control className="h-10 w-11" off={!call.mic} disabled={!call.devices.audio} onPress={() => call.toggleMic()} label={call.mic ? tr("Mute") : tr("Unmute")} icon={call.mic ? Mic : MicOff} />
        <Control className="h-10 w-11" off={!call.camera} disabled={!call.devices.video} onPress={() => call.toggleCamera()} label={call.camera ? tr("Turn the camera off") : tr("Turn the camera on")} icon={call.camera ? Video : VideoOff} />
        <Pressable accessibilityRole="button" accessibilityLabel={tr("Leave the call")} onPress={() => call.close()} className="h-10 w-11 items-center justify-center rounded-lg bg-destructive active:bg-destructive/90">
          <Icon as={PhoneOff} size={18} className="text-white" />
        </Pressable>
      </View> : null}
    </View>}
  </Movable>;
}

/** A small button on the bar over the floating picture, lightened to show on any picture. */
function Small({ label, icon, onPress }: { label: string; icon: LucideIcon; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={6} onPress={onPress} className="size-8 items-center justify-center rounded-md bg-white/10 active:bg-white/20">
    <Icon as={icon} size={16} className="text-white" />
  </Pressable>;
}
