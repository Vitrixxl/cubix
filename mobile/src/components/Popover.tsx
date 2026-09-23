import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Modal, Pressable, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { useTheme } from "../theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface Anchor { x: number; y: number; width: number; height: number }

/**
 * A floating surface anchored to a control (`.popover` / `.select-content`): opens below the anchor,
 * flips above when there is no room, clamps to the window, and closes on outside taps.
 */
export function Popover({ anchor, onClose, children, width, alignRight, gap = 4, maxHeight }: { anchor: Anchor | null; onClose: () => void; children: ReactNode; width?: number; alignRight?: boolean; gap?: number; maxHeight?: number }) {
  const t = useTheme();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!anchor) { progress.setValue(0); setSize(null); return; }
  }, [anchor, progress]);
  useEffect(() => {
    if (size) Animated.timing(progress, { toValue: 1, duration: 140, useNativeDriver: true }).start();
  }, [size, progress]);
  if (!anchor) return null;
  const margin = 8;
  const spaceBelow = window.height - insets.bottom - (anchor.y + anchor.height) - margin;
  const spaceAbove = anchor.y - insets.top - margin;
  const contentHeight = size?.height ?? 0;
  const above = contentHeight > spaceBelow && spaceAbove > spaceBelow;
  // Measure in the larger available space before deciding which side fits.
  // Measuring against the space below first hides overflow from the flip check.
  const limit = Math.max(0, (size ? (above ? spaceAbove : spaceBelow) : Math.max(spaceAbove, spaceBelow)) - gap);
  const top = above ? Math.max(insets.top + margin, anchor.y - gap - Math.min(contentHeight, limit)) : anchor.y + anchor.height + gap;
  const preferredLeft = alignRight ? anchor.x + anchor.width - (size?.width ?? width ?? 0) : anchor.x;
  const left = Math.max(margin, Math.min(preferredLeft, window.width - (size?.width ?? width ?? 0) - margin));
  const onLayout = (event: LayoutChangeEvent) => {
    const { width: w, height: h } = event.nativeEvent.layout;
    if (!size || Math.abs(size.width - w) > 1 || Math.abs(size.height - h) > 1) setSize({ width: w, height: h });
  };
  return <Modal transparent visible statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={onClose}>
    <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
    <Animated.View onLayout={onLayout} style={[styles.popover, { top, left, width, maxHeight: maxHeight ? Math.min(maxHeight, limit) : limit, backgroundColor: t.surface, borderColor: t.line, opacity: size ? progress : 0, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }, { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }] }, t.shadow]}>
      {children}
    </Animated.View>
  </Modal>;
}

const styles = StyleSheet.create({
  popover: { position: "absolute", borderRadius: 14, borderWidth: 1, padding: 6, overflow: "hidden" },
});

export function useAnchor() {
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const open = () => ref.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
  const close = () => setAnchor(null);
  return { ref, anchor, open, close, isOpen: anchor !== null };
}
