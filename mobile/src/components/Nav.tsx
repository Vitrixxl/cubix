import { useAtomValue } from "jotai";
import { memo, useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { userAtom, type Page } from "../state";
import { useTheme } from "../theme";
import { IconCube, IconGrid, IconSettings, IconTimer, IconUser, type Icon } from "./icons";
import { Avatar } from "./ui";

/** The web app's phone tabs (`MOBILE_TABS`): the timer in the centre, settings last. */
const NAV: { page: Page; label: string; icon: Icon }[] = [
  { page: "algorithms", label: "Algorithms", icon: IconGrid },
  { page: "training", label: "Training", icon: IconTimer },
  { page: "playground", label: "Timer", icon: IconCube },
  { page: "profile", label: "Account", icon: IconUser },
];

/**
 * `.tabbar`: five tabs (icon over a 10.5 px label, muted, accent when selected) on the `bar` background
 * (surface 35% over bg) with a 1px top line. Phones get it in the layout flow under the page; larger
 * screens a floating raised island. A running solve fades it out like `.is-running .tabbar`.
 */
export const Nav = memo(function Nav({ active, onNavigate, onSettings, settingsOpen, hidden, collapsed, phone }: {
  active: Page; onNavigate: (page: Page) => void; onSettings: () => void; settingsOpen: boolean;
  hidden: boolean; collapsed?: boolean; phone: boolean;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const user = useAtomValue(userAtom);
  const fullWidth = phone || height <= 500;
  const opacity = useRef(new Animated.Value(hidden ? 0 : 1)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: hidden ? 0 : 1, duration: 180, useNativeDriver: true }).start();
  }, [hidden, opacity]);
  if (collapsed) return null;
  const items = [...NAV, { page: "settings" as const, label: "Settings", icon: IconSettings }];
  return <Animated.View pointerEvents={hidden ? "none" : "auto"} style={[fullWidth
    ? [styles.bar, { paddingBottom: 4 + insets.bottom, paddingLeft: 6 + insets.left, paddingRight: 6 + insets.right, backgroundColor: t.bar, borderColor: t.line }]
    : [styles.island, { bottom: insets.bottom + 10, backgroundColor: t.raised, borderColor: t.line }, t.menuShadow],
    { opacity }]}>
    {items.map(({ page, label, icon: Icon }) => {
      const current = page === "settings" ? settingsOpen : !settingsOpen && active === page;
      const color = current ? t.accent : t.muted;
      // Like the web, a signed-in account shows its avatar instead of the person icon.
      const avatar = page === "profile" && user && !user.isGuest;
      return <Pressable key={page} accessibilityRole={page === "settings" ? "button" : "tab"}
        accessibilityState={page === "settings" ? { expanded: settingsOpen } : { selected: current }}
        accessibilityLabel={label} onPress={() => page === "settings" ? onSettings() : onNavigate(page)}
        style={({ pressed }) => [styles.item, { opacity: pressed && !current ? 0.7 : 1 }]}>
        <View style={styles.icon}>{avatar ? <Avatar username={user.username} size={21} active={current} /> : <Icon size={20} strokeWidth={1.8} color={color} />}</View>
        <Text numberOfLines={1} style={[styles.label, { color }]}>{label}</Text>
      </Pressable>;
    })}
  </Animated.View>;
});

const styles = StyleSheet.create({
  /** Phone: full width in the layout flow, under the content. */
  bar: { flexDirection: "row", paddingTop: 4, borderTopWidth: 1, zIndex: 40 },
  /** Larger screens: floating island above the content. */
  island: { position: "absolute", alignSelf: "center", flexDirection: "row", width: 380, padding: 4, borderRadius: 12, borderWidth: 1, zIndex: 40 },
  item: { flex: 1, minWidth: 0, height: 52, alignItems: "center", justifyContent: "center", gap: 3, borderRadius: 10 },
  icon: { height: 21, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 10.5, fontWeight: "500" },
});
