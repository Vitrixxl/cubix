import { atom, useAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";

export interface ToastMessage { title: string; description?: string; duration?: number }
/** Setting it shows a notification; null hides it. */
export const toastAtom = atom<ToastMessage | null>(null);

/** A notification at the top, like the web's Sonner toast: a popover card, tap to dismiss. */
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
  return <View pointerEvents="box-none" className="absolute z-50 flex-row justify-center" style={{ top: insets.top + 10, left: insets.left + 14, right: insets.right + 14 }}>
    <Animated.View accessibilityLiveRegion="polite" className="w-full max-w-[420px] shrink rounded-xl border border-border bg-popover shadow-lg"
      style={{ opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notification" onPress={() => setMessage(null)} className="gap-0.5 px-4 py-3.5">
        <Text className="text-sm font-medium">{shown.title}</Text>
        {shown.description ? <Text className="text-sm leading-[20px] text-muted-foreground">{shown.description}</Text> : null}
      </Pressable>
    </Animated.View>
  </View>;
}
