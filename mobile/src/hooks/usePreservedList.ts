import { useCallback, useRef } from "react";
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from "react-native";

const positions = new Map<string, number>();

/** Virtualized-list counterpart to usePreservedScroll. Remount the list when its key changes. */
export function usePreservedList<T>(key: string) {
  const ref = useRef<FlatList<T>>(null);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    positions.set(key, event.nativeEvent.contentOffset.y);
    if (positions.size > 200) positions.delete(positions.keys().next().value!);
  }, [key]);
  return { ref, onScroll, contentOffset: { x: 0, y: positions.get(key) ?? 0 } };
}
