import { useCallback, useRef } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from "react-native";

const positions = new Map<string, number>();

/** Remember the scroll offset of a list by key, so returning to it restores the same position. */
export function usePreservedScroll(key: string) {
  const ref = useRef<ScrollView>(null);
  const restoredKey = useRef<string | null>(null);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    positions.set(key, event.nativeEvent.contentOffset.y);
    if (positions.size > 200) positions.delete(positions.keys().next().value!);
  }, [key]);
  const onContentSizeChange = useCallback(() => {
    if (restoredKey.current === key) return;
    const target = positions.get(key);
    if (target) ref.current?.scrollTo({ y: target, animated: false });
    restoredKey.current = key;
  }, [key]);
  return { ref, onScroll, onContentSizeChange, scrollEventThrottle: 64 };
}
