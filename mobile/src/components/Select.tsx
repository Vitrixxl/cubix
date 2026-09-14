import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";
import { IconCheck, IconChevronDown } from "./icons";
import { Popover, useAnchor } from "./Popover";

export interface SelectOption<T extends string> { value: T; label: string; icon?: ReactNode; iconChecked?: ReactNode }

/** The shadcn select of the web app: a trigger with a chevron, and an anchored list where the current value is highlighted. */
export function Select<T extends string>({ value, options, onChange, disabled, compact, flat, style, accessibilityLabel, minWidth = 180 }: {
  value: T; options: SelectOption<T>[]; onChange: (value: T) => void; disabled?: boolean;
  /** Hide the label, keep the icon only (puzzle picker in the navigation on narrow screens). */
  compact?: boolean;
  /** Transparent trigger (`.practice-toolbar .select-trigger`, `.nav .nav-puzzle`). */
  flat?: "toolbar" | "nav";
  style?: StyleProp<ViewStyle>; accessibilityLabel?: string; minWidth?: number;
}) {
  const t = useTheme();
  const { ref, anchor, open, close } = useAnchor();
  const [pressed, setPressed] = useState(false);
  const current = options.find(option => option.value === value) ?? options[0];
  const background = flat ? (pressed ? t.hover : "transparent") : pressed ? t.surface3Hover : t.surface3;
  const color = flat === "toolbar" ? (pressed ? t.text : t.text2) : t.text;
  return <>
    <Pressable ref={ref} disabled={disabled} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? current?.label} onPress={open} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)}
      style={[styles.trigger, flat === "toolbar" && styles.triggerToolbar, flat === "nav" && styles.triggerNav, { backgroundColor: background, opacity: disabled ? 0.45 : 1 }, style]}>
      {current?.icon}
      {!compact && <Text numberOfLines={1} style={[styles.triggerText, flat === "toolbar" && { fontSize: 12 }, flat === "nav" && { fontSize: 12 }, { color, flexShrink: 1 }]}>{current?.label}</Text>}
      <IconChevronDown size={flat === "nav" ? 12 : 14} color={t.readableMuted} />
    </Pressable>
    <Popover anchor={anchor} onClose={close} width={Math.max(minWidth, anchor?.width ?? 0)}>
      <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
        {options.map(option => {
          const checked = option.value === value;
          return <SelectItem key={option.value} checked={checked} label={option.label} icon={checked ? option.iconChecked ?? option.icon : option.icon} onPress={() => { close(); if (!checked) onChange(option.value); }} />;
        })}
      </ScrollView>
    </Popover>
  </>;
}

function SelectItem({ label, icon, checked, onPress }: { label: string; icon?: ReactNode; checked: boolean; onPress: () => void }) {
  const t = useTheme();
  const [pressed, setPressed] = useState(false);
  return <Pressable onPress={onPress} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} style={[styles.item, { backgroundColor: pressed ? t.surface2 : "transparent" }]}>
    <View style={styles.itemLabel}>{icon}<Text numberOfLines={1} style={[styles.itemText, { color: checked ? t.accent : t.text }]}>{label}</Text></View>
    {checked && <View style={styles.check}><IconCheck size={14} color={t.accent} /></View>}
  </Pressable>;
}

const styles = StyleSheet.create({
  trigger: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 40, paddingLeft: 14, paddingRight: 12, borderRadius: 12, maxWidth: "100%" },
  triggerToolbar: { minHeight: 32, paddingHorizontal: 10, paddingRight: 8, borderRadius: 10, gap: 6 },
  triggerNav: { minHeight: 34, paddingLeft: 10, paddingRight: 8, gap: 6, borderRadius: 10 },
  triggerText: { fontSize: 14, fontWeight: "600" },
  item: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 38, paddingVertical: 6, paddingLeft: 12, paddingRight: 12, borderRadius: 10, gap: 10 },
  itemLabel: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
  itemText: { fontSize: 14, fontWeight: "500" },
  check: { marginLeft: "auto" },
});
