import { type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme";
import { IconClose } from "./icons";
import { Sheet } from "./Sheet";
import { Btn } from "./ui";

interface Props {
  open: boolean; wide: boolean; side: "left" | "right"; title: string; icon: ReactNode; count?: number;
  disabled?: boolean; onOpen: () => void; onClose: () => void; children: ReactNode;
}

/**
 * On wide screens the panel owns a column: open, it shows its heading and content;
 * closed, only its opening button remains at the top of that column.
 * On narrow screens it is a modal sheet and the page provides the opening button.
 */
export function PracticePanel({ open, wide, side, title, icon, count, disabled, onOpen, onClose, children }: Props) {
  const t = useTheme();
  if (wide) return <View style={[styles.rail, { alignItems: side === "right" ? "flex-end" : "flex-start" }]}>
    {open ? <View style={[styles.panel, side === "left" ? { paddingRight: 16 } : { paddingLeft: 16 }]}>
      <View style={styles.heading}><Text style={[styles.title, { color: t.text }]}>{title}</Text><Btn variant="ghost" iconOnly icon={<IconClose size={16} color={t.readableMuted} />} accessibilityLabel={`Close ${title.toLowerCase()}`} onPress={onClose} style={{ width: 32, minHeight: 32 }} /></View>
      <View style={{ flex: 1, minHeight: 0, gap: 8 }}>{children}</View>
    </View> : <PanelButton title={title} icon={icon} count={count} disabled={disabled} onPress={onOpen} />}
  </View>;
  return <Sheet open={open} title={title} onClose={onClose} tall>{children}</Sheet>;
}

/** The opening button used on narrow screens, where panels are sheets (`.action` in the practice toolbar). */
export function PanelButton({ title, icon, count, disabled, onPress, pressedState, phone }: { title: string; icon: ReactNode; count?: number; disabled?: boolean; onPress: () => void; pressedState?: boolean; phone?: boolean }) {
  return <ToolbarAction icon={icon} label={title} count={count} disabled={disabled} onPress={onPress} pressed={pressedState} phone={phone} />;
}

/** `.practice-toolbar .action`: a flat, small button; highlighted with the accent colour when pressed/toggled. */
export function ToolbarAction({ icon, label, count, disabled, onPress, pressed, phone }: { icon: ReactNode; label: string; count?: number; disabled?: boolean; onPress: () => void; pressed?: boolean; phone?: boolean }) {
  const t = useTheme();
  return <Pressable disabled={disabled} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!pressed, disabled: !!disabled }}
    style={({ pressed: down }) => [styles.action, phone && styles.actionPhone, { backgroundColor: pressed ? t.accentSoft : down ? t.hover : "transparent", opacity: disabled ? 0.45 : 1 }]}>
    {icon}
    <Text style={[styles.actionText, phone && { fontSize: 12 }, { color: pressed ? t.accent : t.text2 }]}>{label}{count !== undefined && <Text style={{ opacity: 0.6 }}> {count}</Text>}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  rail: { flexDirection: "column", minWidth: 0, minHeight: 0, flex: 1 },
  panel: { flex: 1, alignSelf: "stretch", minHeight: 0, overflow: "hidden" },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 40, paddingBottom: 4 },
  title: { fontSize: 16, fontWeight: "700" },
  action: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, minHeight: 34, paddingHorizontal: 12, borderRadius: 10 },
  actionPhone: { minHeight: 32, paddingHorizontal: 10 },
  actionText: { fontSize: 13, fontWeight: "600" },
});
