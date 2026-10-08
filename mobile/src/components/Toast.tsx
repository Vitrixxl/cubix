import { atom, useAtom } from "jotai";
import { Play, Swords, Users } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Notice } from "../../../src/client/lib/community";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { UserAvatar } from "./UserAvatar";
import { said, tr } from "../../../src/client/i18n";

/** A notification, as the community and the coaching send them (src/client/lib/community.ts `Notice`). */
export type ToastMessage = Notice;
/** Setting it shows a notification; null hides it. */
export const toastAtom = atom<ToastMessage | null>(null);

const ICONS = { group: Users, play: Play, battle: Swords };

/**
 * A notification at the top, like the web's Sonner toast: a popover card, tap to dismiss. Its face is the avatar of the
 * player it comes from, or its kind's icon; an error is drawn in red; its action is a button that also dismisses it.
 */
export function Toast() {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useAtom(toastAtom);
  const [shown, setShown] = useState<ToastMessage | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!message) return;
    setShown(message);
    Animated.timing(progress, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    const timer = setTimeout(() => setMessage(null), message.duration ?? 7000);
    return () => clearTimeout(timer);
  }, [message, progress, setMessage]);
  useEffect(() => {
    if (message || !shown) return;
    Animated.timing(progress, { toValue: 0, duration: 180, useNativeDriver: true }).start(({ finished }) => { if (finished) setShown(null); });
  }, [message, shown, progress]);
  if (!shown) return null;
  const { face, icon, action, error } = shown;
  return <View pointerEvents="box-none" className="absolute z-50 flex-row justify-center" style={{ top: insets.top + 10, left: insets.left + 14, right: insets.right + 14 }}>
    <Animated.View accessibilityLiveRegion="polite" className={cn("w-full max-w-[420px] shrink flex-row items-center rounded-xl border bg-popover shadow-lg", error ? "border-destructive/50" : "border-border")}
      style={{ opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] }}>
      <Pressable accessibilityRole="button" accessibilityLabel={tr("Dismiss notification")} onPress={() => setMessage(null)} className="min-w-0 flex-1 flex-row items-center gap-3 px-4 py-3.5">
        {face ? <UserAvatar user={{ username: face.username, isGuest: false }} size={36} />
          : icon ? <Icon as={ICONS[icon]} size={18} className="text-foreground" /> : null}
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className={cn("text-sm font-medium", error && "text-destructive")}>{said(shown.title)}</Text>
          {shown.description ? <Text className="text-sm text-muted-foreground">{said(shown.description)}</Text> : null}
        </View>
      </Pressable>
      {action && <Button size="sm" className="mr-3" onPress={() => { setMessage(null); action.run(); }}><Text>{said(action.label)}</Text></Button>}
    </Animated.View>
  </View>;
}
