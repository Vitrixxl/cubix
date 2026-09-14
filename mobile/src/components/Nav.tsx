import { memo, useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Page } from "../state";
import { useTheme } from "../theme";
import { IconBook, IconSettings, IconTimer, IconTraining, IconUser, type Icon } from "./icons";

export const NAV: { page: Page; label: string; icon: Icon }[] = [
  { page: "playground", label: "Timer", icon: IconTimer },
  { page: "algorithms", label: "Algorithms", icon: IconBook },
  { page: "training", label: "Training", icon: IconTraining },
  { page: "profile", label: "Account", icon: IconUser },
];

/** Stable icon-only tabs, with settings separate from navigation history. */
export const Nav = memo(function Nav({ active, onNavigate, onSettings, settingsOpen, chatActivity, hidden, phone }: {
  active: Page; onNavigate: (page: Page) => void; onSettings: () => void; settingsOpen: boolean;
  chatActivity: boolean; hidden: boolean; phone: boolean;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const fullWidth = phone || height <= 500;
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => { Animated.timing(opacity, { toValue: hidden ? 0 : 1, duration: 250, useNativeDriver: true }).start(); }, [hidden, opacity]);
  const items = [...NAV, { page: "settings" as const, label: "Settings", icon: IconSettings }];
  return <Animated.View pointerEvents={hidden ? "none" : "auto"} style={[styles.nav, fullWidth
    ? { bottom: 0, paddingBottom: insets.bottom + 6, paddingLeft: insets.left + 8, paddingRight: insets.right + 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line }
    : { bottom: insets.bottom + 10, alignSelf: "center", width: 360, borderRadius: 22, padding: 6, borderWidth: 1, borderColor: t.line },
    { opacity, backgroundColor: t.surface }]}>
    {items.map(({ page, label, icon: Icon }) => {
      const current = page === "settings" ? settingsOpen : !settingsOpen && active === page;
      return <Pressable key={page} accessibilityRole={page === "settings" ? "button" : "tab"}
        accessibilityState={page === "settings" ? { expanded: settingsOpen } : { selected: current }}
        accessibilityLabel={label} onPress={() => page === "settings" ? onSettings() : onNavigate(page)}
        style={styles.item}>
        {({ pressed }) => <View style={styles.icon}>
          {(current || pressed) && <Svg width={48} height={44} style={StyleSheet.absoluteFill} pointerEvents="none"><Rect width={48} height={44} rx={15} ry={15} fill={current ? t.accentSoft : t.hover} /></Svg>}
          <Icon size={25} strokeWidth={1.8} color={current ? t.accent : t.readableMuted} />
          {page === "profile" && chatActivity && <View style={[styles.dot, { backgroundColor: t.danger }]} accessibilityLabel="New messages" />}
        </View>}
      </Pressable>;
    })}
  </Animated.View>;
});

const styles = StyleSheet.create({
  nav: { position: "absolute", width: "100%", flexDirection: "row", alignItems: "center", paddingTop: 6, zIndex: 40 },
  item: { flex: 1, minWidth: 0, height: 56, alignItems: "center", justifyContent: "center" },
  icon: { width: 48, height: 44, borderRadius: 15, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  dot: { position: "absolute", top: 5, right: 6, width: 6, height: 6, borderRadius: 3 },
});
