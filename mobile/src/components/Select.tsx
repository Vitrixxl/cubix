import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";
import { IconCheck, IconChevronDown } from "./icons";
import { Popover, useAnchor } from "./Popover";

export interface SelectOption<T extends string> { value: T; label: string; icon?: ReactNode; iconChecked?: ReactNode }

/**
 * The web select: a `.control` trigger (32 px, 1px line, radius 8, label + 12 px chevron) opening a
 * `.select-menu` of `MenuOption`s where the current value sits on surface2 with a muted check.
 */
export function Select<T extends string>({ value, options, onChange, disabled, style, accessibilityLabel, minWidth = 180, menuWidth }: {
  value: T; options: SelectOption<T>[]; onChange: (value: T) => void; disabled?: boolean;
  style?: StyleProp<ViewStyle>; accessibilityLabel?: string;
  /** Menu minimum width (the menu is at least as wide as the trigger). `menuWidth` fixes it (web: 260). */
  minWidth?: number; menuWidth?: number;
}) {
  const t = useTheme();
  const { ref, anchor, open, close } = useAnchor();
  const [pressed, setPressed] = useState(false);
  const current = options.find(option => option.value === value) ?? options[0];
  const isOpen = anchor !== null;
  return <>
    <Pressable ref={ref} disabled={disabled} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? current?.label} accessibilityState={{ expanded: isOpen, disabled }}
      onPress={open} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)}
      style={[styles.trigger, { borderColor: t.line, backgroundColor: pressed || isOpen ? t.hover : "transparent", opacity: disabled ? 0.35 : 1 }, style]}>
      {current?.icon}
      <Text numberOfLines={1} style={[styles.triggerText, { color: t.text }]}>{current?.label}</Text>
      <IconChevronDown size={12} color={t.muted} />
    </Pressable>
    <Popover anchor={anchor} onClose={close} width={menuWidth ?? Math.max(minWidth, anchor?.width ?? 0)}>
      <ScrollView bounces={false} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {options.map(option => {
          const checked = option.value === value;
          return <MenuOption key={option.value} checked={checked} label={option.label} icon={checked ? option.iconChecked ?? option.icon : option.icon} onPress={() => { close(); if (!checked) onChange(option.value); }} />;
        })}
      </ScrollView>
    </Popover>
  </>;
}

/**
 * `.menu-option`: a 34 px row of the select menu (radius 6, 10 px padding): optional icon, label and, on the
 * current value, a surface2 fill with a muted check.
 */
function MenuOption({ label, icon, checked, onPress }: { label: string; icon?: ReactNode; checked: boolean; onPress: () => void }) {
  const t = useTheme();
  return <Pressable onPress={onPress} accessibilityRole="menuitem" accessibilityLabel={label} accessibilityState={{ selected: checked }}
    style={({ pressed }) => [styles.item, { backgroundColor: checked ? t.surface2 : pressed ? t.hover : "transparent" }]}>
    {icon}
    <Text numberOfLines={1} style={[styles.itemText, { color: t.text }]}>{label}</Text>
    {checked && <View style={styles.check}><IconCheck size={14} strokeWidth={2.2} color={t.muted} /></View>}
  </Pressable>;
}

const styles = StyleSheet.create({
  trigger: { flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 11, borderRadius: 8, borderWidth: 1, maxWidth: "100%", flexShrink: 0 },
  triggerText: { fontSize: 13, fontWeight: "500", flexShrink: 1 },
  item: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 34, paddingHorizontal: 10, borderRadius: 6 },
  itemText: { flex: 1, fontSize: 13, fontWeight: "500" },
  check: { marginLeft: 4 },
});
