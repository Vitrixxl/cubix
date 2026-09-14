import { useAtomValue, useSetAtom } from "jotai";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { chatActivityAtom, chatPeerAtom, routeAtom, type Route } from "../state";
import { useTheme } from "../theme";
import { useLayout } from "../hooks/useLayout";
import { IconMessage, IconUser, IconUsers } from "./icons";

export function AccountTabs({ route }: { route: Route }) {
  const t = useTheme();
  const { pagePadding } = useLayout();
  const navigate = useSetAtom(routeAtom);
  const setPeer = useSetAtom(chatPeerAtom);
  const activity = useAtomValue(chatActivityAtom);
  return <View accessibilityLabel="Account sections" style={[styles.tabs, { paddingHorizontal: pagePadding }]}>
    {([
      { page: "profile", label: "Profile", icon: IconUser },
      { page: "community", label: "Friends", icon: IconUsers },
      { page: "messages", label: "Messages", icon: IconMessage },
    ] as const).map(({ page, label, icon: Icon }) => {
      const current = route.page === page;
      return <Pressable key={page} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: current }}
        onPress={() => { if (page === "messages" && !current) setPeer(""); navigate({ page }); }}
        style={({ pressed }) => [styles.tab, { backgroundColor: current ? t.accentSoft : pressed ? t.hover : "transparent" }]}>
        <Icon size={16} color={current ? t.accent : t.readableMuted} />
        <Text style={{ color: current ? t.accent : t.text2, fontSize: 12, fontWeight: "600" }}>{label}</Text>
        {page === "messages" && activity && <View style={[styles.dot, { backgroundColor: t.danger }]} />}
      </Pressable>;
    })}
  </View>;
}
const styles = StyleSheet.create({
  tabs: { width: "100%", maxWidth: 1100, alignSelf: "center", flexDirection: "row", gap: 4, paddingTop: 8, paddingBottom: 4 },
  tab: { flex: 1, minHeight: 42, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, borderRadius: 14 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
