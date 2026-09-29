import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Modal, Pressable, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { useTheme } from "../theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface Anchor { x: number; y: number; width: number; height: number }

/**
 * `.select-menu`: a column of rows on the page colour, hanging flush from the cell that opened it: its top line on
 * the cell's bottom line (`overlap` 1 when the cell draws that line itself, 0 when it belongs to the row under it),
 * its left line on the cell's. Above the cell when there is no room below; the whole width on phones. Closes on
 * outside taps. Fill it with `MenuOption`s (Select.tsx).
 */
export function Popover({ anchor, onClose, children, width, overlap = 1 }: { anchor: Anchor | null; onClose: () => void; children: ReactNode; width?: number; overlap?: number }) {
  const t = useTheme();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!anchor) { progress.setValue(0); setSize(null); return; }
  }, [anchor, progress]);
  useEffect(() => {
    if (size) Animated.timing(progress, { toValue: 1, duration: 120, useNativeDriver: true }).start();
  }, [size, progress]);
  if (!anchor) return null;
  const phone = window.width <= 700;
  const menuWidth = phone ? window.width : width;
  const bottom = anchor.y + anchor.height - overlap;
  const spaceBelow = window.height - insets.bottom - bottom;
  const spaceAbove = anchor.y + overlap - insets.top;
  const contentHeight = size?.height ?? 0;
  const above = contentHeight > spaceBelow && spaceAbove > spaceBelow;
  // Measure in the larger available space before deciding which side fits.
  const limit = Math.max(0, size ? (above ? spaceAbove : spaceBelow) : Math.max(spaceAbove, spaceBelow));
  const top = above ? anchor.y + overlap - Math.min(contentHeight, limit) : bottom;
  const left = phone ? 0 : Math.max(0, anchor.x + (menuWidth ?? 0) > window.width ? anchor.x + anchor.width - (menuWidth ?? 0) : anchor.x);
  const onLayout = (event: LayoutChangeEvent) => {
    const { width: w, height: h } = event.nativeEvent.layout;
    if (!size || Math.abs(size.width - w) > 1 || Math.abs(size.height - h) > 1) setSize({ width: w, height: h });
  };
  return <Modal transparent visible statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={onClose}>
    <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
    <Animated.View onLayout={onLayout} style={[styles.popover, { top, left, width: menuWidth, maxHeight: limit, backgroundColor: t.bg, borderColor: t.line, opacity: size ? progress : 0 }]}>
      {children}
    </Animated.View>
  </Modal>;
}

const styles = StyleSheet.create({
  popover: { position: "absolute", borderRadius: 0, borderWidth: 1, overflow: "hidden" },
});

/** Measures a trigger (`ref`) in the window and opens a `Popover` on it: `open()`, `close()`, `anchor`, `isOpen`. */
export function useAnchor() {
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const open = () => ref.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
  const close = () => setAnchor(null);
  return { ref, anchor, open, close, isOpen: anchor !== null };
}
