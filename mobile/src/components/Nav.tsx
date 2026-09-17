import { memo } from "react";
import { Animated, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Page } from "../state";
import { useExit } from "../hooks/useExit";
import { useTheme } from "../theme";
import { IconBook, IconSettings, IconTimer, IconTraining, IconUser, type Icon } from "./icons";

/** The timer sits in the middle of the five tabs (settings included), as the app's home. */
export const NAV: { page: Page; label: string; icon: Icon }[] = [
  { page: "algorithms", label: "Algorithms", icon: IconBook },
  { page: "training", label: "Training", icon: IconTraining },
  { page: "playground", label: "Timer", icon: IconTimer },
  { page: "profile", label: "Account", icon: IconUser },
];

/** Side gap of the phone bar, so its rounded top corners show against the page. */
export const NAV_SIDE_GAP = 6;

/**
 * Stable icon-only tabs, with settings separate from navigation history.
 * Phones get a full-width bar in the layout flow, under the page content; larger screens keep
 * the floating island above the content.
 */
export const Nav = memo(function Nav({ active, onNavigate, onSettings, settingsOpen, hidden, collapsed, phone }: {
  active: Page; onNavigate: (page: Page) => void; onSettings: () => void; settingsOpen: boolean;
  hidden: boolean; collapsed?: boolean; phone: boolean;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const fullWidth = phone || height <= 500;
  const { ref, transform } = useExit(hidden, "down");
  if (collapsed) return null;
  const items = [...NAV, { page: "settings" as const, label: "Settings", icon: IconSettings }];
  return <Animated.View ref={ref} pointerEvents={hidden ? "none" : "auto"} style={[styles.nav, fullWidth
    ? [styles.bar, { paddingBottom: insets.bottom + 4, marginLeft: insets.left + NAV_SIDE_GAP, marginRight: insets.right + NAV_SIDE_GAP, borderColor: t.line }]
    : [styles.island, { bottom: insets.bottom + 10, borderColor: t.line }],
    { transform, backgroundColor: t.surface }]}>
    {items.map(({ page, label, icon: Icon }) => {
      const current = page === "settings" ? settingsOpen : !settingsOpen && active === page;
      return <Pressable key={page} accessibilityRole={page === "settings" ? "button" : "tab"}
        accessibilityState={page === "settings" ? { expanded: settingsOpen } : { selected: current }}
        accessibilityLabel={label} onPress={() => page === "settings" ? onSettings() : onNavigate(page)}
        style={styles.item}>
        {({ pressed }) => <View style={styles.icon}>
          {(current || pressed) && <Svg width={48} height={44} style={StyleSheet.absoluteFill} pointerEvents="none"><Rect width={48} height={44} rx={15} ry={15} fill={current ? t.accentSoft : t.hover} /></Svg>}
          <Icon size={25} strokeWidth={1.8} color={current ? t.accent : t.readableMuted} />
        </View>}
      </Pressable>;
    })}
  </Animated.View>;
});

const styles = StyleSheet.create({
  nav: { flexDirection: "row", alignItems: "center", paddingTop: 6, zIndex: 40 },
  /** Phone: sits in the layout flow under the content, rounded on top, a sliver of page on each side. */
  bar: { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: StyleSheet.hairlineWidth, borderBottomWidth: 0, paddingHorizontal: 4 },
  /** Larger screens: floating island above the content. */
  island: { position: "absolute", alignSelf: "center", width: 360, borderRadius: 22, padding: 6, borderWidth: 1 },
  item: { flex: 1, minWidth: 0, height: 56, alignItems: "center", justifyContent: "center" },
  icon: { width: 48, height: 44, borderRadius: 15, overflow: "hidden", alignItems: "center", justifyContent: "center" },
});
