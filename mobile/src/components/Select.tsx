import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";
import { IconCheck, IconChevronDown } from "./icons";
import { Popover, useAnchor } from "./Popover";
import { headCellStyle, useHeadCell } from "./ui";

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
  const cell = useHeadCell();
  const { ref, anchor, open, close } = useAnchor();
  const [pressed, setPressed] = useState(false);
  const current = options.find(option => option.value === value) ?? options[0];
  const isOpen = anchor !== null;
  return <>
    <Pressable ref={ref} disabled={disabled} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? current?.label} accessibilityState={{ expanded: isOpen, disabled }}
      onPress={open} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)}
      style={[styles.trigger, { borderColor: t.line, backgroundColor: pressed || isOpen ? t.hover : "transparent", opacity: disabled ? 0.35 : 1 }, cell && headCellStyle(t, cell), style]}>
      {current?.icon}
      <Text numberOfLines={1} style={[styles.triggerText, { color: t.text }]}>{current?.label}</Text>
      <IconChevronDown size={12} color={t.muted} />
    </Pressable>
    <Popover anchor={anchor} onClose={close} overlap={cell ? 0 : 1} width={menuWidth ?? Math.max(minWidth, anchor?.width ?? 0)}>
      <ScrollView bounces={false} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {options.map((option, index) => {
          const checked = option.value === value;
          return <MenuOption key={option.value} last={index === options.length - 1} checked={checked} label={option.label} icon={checked ? option.iconChecked ?? option.icon : option.icon} onPress={() => { close(); if (!checked) onChange(option.value); }} />;
        })}
      </ScrollView>
    </Popover>
  </>;
}

/**
 * `.menu-option`: a 44 px row of the select menu, split from the next by a line: optional icon, label and, on the
 * current value, surface2 with the accent bar on its side, an accent label and check.
 */
function MenuOption({ label, icon, checked, last, onPress }: { label: string; icon?: ReactNode; checked: boolean; last: boolean; onPress: () => void }) {
  const t = useTheme();
  return <Pressable onPress={onPress} accessibilityRole="menuitem" accessibilityLabel={label} accessibilityState={{ selected: checked }}
    style={({ pressed }) => [styles.item, { borderColor: t.line, borderBottomWidth: last ? 0 : 1, backgroundColor: checked ? t.surface2 : pressed ? t.hover : "transparent" }]}>
    {checked && <View style={[styles.bar, { backgroundColor: t.accent }]} />}
    {icon}
    <Text numberOfLines={1} style={[styles.itemText, { color: checked ? t.accent : t.secondary }]}>{label}</Text>
    {checked && <View style={styles.check}><IconCheck size={14} strokeWidth={2.2} color={t.accent} /></View>}
  </Pressable>;
}

const styles = StyleSheet.create({
  trigger: { flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 11, borderRadius: 0, borderWidth: 1, maxWidth: "100%", flexShrink: 0 },
  triggerText: { fontSize: 13, fontWeight: "500", flexShrink: 1 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, height: 44, paddingHorizontal: 16 },
  bar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 2 },
  itemText: { flex: 1, fontSize: 13, fontWeight: "500" },
  check: { marginLeft: 4 },
});
