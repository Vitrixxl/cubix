import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";
import { IconCheck, IconChevronDown, type Icon } from "./icons";
import { Popover, useAnchor } from "./Popover";

export interface SelectOption<T extends string> { value: T; label: string; icon?: ReactNode; iconChecked?: ReactNode }

/**
 * The web select: a `.control` trigger (32 px, 1px line, radius 8, label + 12 px chevron) opening a
 * `.select-menu` of `MenuOption`s where the current value sits on surface2 with a muted check.
 */
export function Select<T extends string>({ value, options, onChange, disabled, compact, flat, style, accessibilityLabel, minWidth = 180, label, menuWidth }: {
  value: T; options: SelectOption<T>[]; onChange: (value: T) => void; disabled?: boolean;
  /** Hide the label, keep the icon only (`.is-mobile .control.collapsible`). */
  compact?: boolean;
  /** Accepted for older callers; every trigger is now the bordered `.control`. */
  flat?: "toolbar" | "nav";
  style?: StyleProp<ViewStyle>; accessibilityLabel?: string;
  /** Menu minimum width (the menu is at least as wide as the trigger). `menuWidth` fixes it (web: 260). */
  minWidth?: number; menuWidth?: number;
  /** Trigger text instead of the current option's label. */
  label?: string;
}) {
  const t = useTheme();
  void flat;
  const { ref, anchor, open, close } = useAnchor();
  const [pressed, setPressed] = useState(false);
  const current = options.find(option => option.value === value) ?? options[0];
  const isOpen = anchor !== null;
  return <>
    <Pressable ref={ref} disabled={disabled} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? current?.label} accessibilityState={{ expanded: isOpen, disabled }}
      onPress={open} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)}
      style={[styles.trigger, compact && styles.compact, { borderColor: t.line, backgroundColor: pressed || isOpen ? t.hover : "transparent", opacity: disabled ? 0.35 : 1 }, style]}>
      {current?.icon}
      {!compact && <Text numberOfLines={1} style={[styles.triggerText, { color: t.text }]}>{label ?? current?.label}</Text>}
      {!compact && <IconChevronDown size={12} color={t.muted} />}
    </Pressable>
    <Popover anchor={anchor} onClose={close} width={menuWidth ?? Math.max(minWidth, anchor?.width ?? 0)}>
      <ScrollView bounces={false} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {options.map(option => {
          const checked = option.value === value;
          return <MenuOption key={option.value} active={checked} checked={checked} label={option.label} icon={checked ? option.iconChecked ?? option.icon : option.icon} onPress={() => { close(); if (!checked) onChange(option.value); }} />;
        })}
      </ScrollView>
    </Popover>
  </>;
}

/**
 * `.menu-option`: a 34 px row of a menu (radius 6, 10 px padding): optional icon, label, and at the end a
 * muted check (`checked`), a `hint` (shortcut, value) or any `trailing` element. `active` = surface2 fill,
 * `danger` colours it red (delete). Use inside a `Popover`.
 */
export function MenuOption({ label, icon, checked, active, danger, disabled, hint, trailing, onPress, accessibilityLabel }: {
  label: string; icon?: Icon | ReactNode; checked?: boolean; active?: boolean; danger?: boolean; disabled?: boolean;
  hint?: string; trailing?: ReactNode; onPress: () => void; accessibilityLabel?: string;
}) {
  const t = useTheme();
  const color = danger ? t.danger : t.text;
  const iconNode = typeof icon === "function" ? (() => { const I = icon as Icon; return <I size={15} color={danger ? t.danger : t.muted} />; })() : icon;
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="menuitem" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ selected: !!checked, disabled }}
    style={({ pressed }) => [styles.item, { backgroundColor: active ? t.surface2 : pressed ? t.hover : "transparent", opacity: disabled ? 0.35 : 1 }]}>
    {iconNode}
    <Text numberOfLines={1} style={[styles.itemText, { color }]}>{label}</Text>
    {hint ? <Text style={[styles.hint, { color: t.muted }]}>{hint}</Text> : null}
    {trailing}
    {checked && <View style={styles.check}><IconCheck size={14} strokeWidth={2.2} color={t.muted} /></View>}
  </Pressable>;
}

const styles = StyleSheet.create({
  trigger: { flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 11, borderRadius: 8, borderWidth: 1, maxWidth: "100%", flexShrink: 0 },
  compact: { width: 32, paddingHorizontal: 0, justifyContent: "center" },
  triggerText: { fontSize: 13, fontWeight: "500", flexShrink: 1 },
  item: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 34, paddingHorizontal: 10, borderRadius: 6 },
  itemText: { flex: 1, fontSize: 13, fontWeight: "500" },
  hint: { fontSize: 12 },
  check: { marginLeft: 4 },
});
