import { memo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type PressableProps, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import { FONT, useTheme, type Theme } from "../theme";

/** Shared primitives mirroring the web stylesheet: .btn, .mini-btn, .segmented, .chip, .input, .kpi, .muted… */

type ButtonProps = Omit<PressableProps, "style" | "children"> & {
  children?: ReactNode; icon?: ReactNode; label?: string;
  variant?: "default" | "primary" | "ghost"; small?: boolean; pressed?: boolean; iconOnly?: boolean;
  style?: StyleProp<ViewStyle>; textStyle?: StyleProp<TextStyle>;
};
export function Btn({ children, icon, label, variant = "default", small, pressed, iconOnly, style, textStyle, disabled, ...rest }: ButtonProps) {
  const t = useTheme();
  const [hover, setHover] = useState(false);
  const background = pressed ? t.accentSoft : variant === "primary" ? (hover ? mixWhite(t.accent) : t.accent) : variant === "ghost" ? (hover ? t.hover : "transparent") : hover ? t.surface3Hover : t.surface3;
  const color = pressed ? t.accent : variant === "primary" ? "#fff" : variant === "ghost" ? (hover ? t.text : t.text2) : t.text;
  return <Pressable {...rest} disabled={disabled} onPressIn={e => { setHover(true); rest.onPressIn?.(e); }} onPressOut={e => { setHover(false); rest.onPressOut?.(e); }}
    style={[styles.btn, small && styles.btnSmall, iconOnly && styles.btnIcon, { backgroundColor: background, opacity: disabled ? 0.45 : 1 }, style]}>
    {icon}
    {label !== undefined && <Text style={[styles.btnText, small && styles.btnTextSmall, { color }, textStyle]} numberOfLines={1}>{label}</Text>}
    {children}
  </Pressable>;
}
const mixWhite = (color: string) => color;

export function MiniBtn({ children, icon, label, on, danger, style, disabled, ...rest }: Omit<PressableProps, "style" | "children"> & { children?: ReactNode; icon?: ReactNode; label?: string; on?: boolean; danger?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const [hover, setHover] = useState(false);
  const color = on ? t.warning : danger && hover ? "#fff" : hover ? t.text : t.readableMuted;
  return <Pressable {...rest} disabled={disabled} onPressIn={e => { setHover(true); rest.onPressIn?.(e); }} onPressOut={e => { setHover(false); rest.onPressOut?.(e); }} hitSlop={4}
    style={[styles.miniBtn, { backgroundColor: hover ? (danger ? t.danger : t.surface3) : "transparent", opacity: disabled ? 0.45 : 1 }, style]}>
    {icon}
    {label !== undefined && <Text style={[styles.miniText, { color }]}>{label}</Text>}
    {children}
  </Pressable>;
}

export function Segmented<T extends string>({ options, value, onChange, small, disabled, style }: { options: { id: T; label: string; count?: number }[]; value: T; onChange: (value: T) => void; small?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[styles.segmented, style]}>
    {options.map(option => {
      const active = option.id === value;
      return <Pressable key={option.id} disabled={disabled} onPress={() => onChange(option.id)} style={[styles.segment, small && styles.segmentSmall, { backgroundColor: active ? t.surface3 : "transparent", opacity: disabled ? 0.45 : 1 }]}>
        <Text style={[styles.segmentText, small && styles.segmentTextSmall, { color: active ? t.text : t.readableMuted }]}>{option.label}</Text>
        {option.count !== undefined && <Text style={[styles.count, { color: t.readableMuted }]}>{option.count}</Text>}
      </Pressable>;
    })}
  </View>;
}

export function Chip({ label, accent, onPress }: { label: string; accent?: boolean; onPress?: () => void }) {
  const t = useTheme();
  return <Pressable disabled={!onPress} onPress={onPress} style={[styles.chip, { backgroundColor: accent ? t.accentSoft : t.surface2 }]}>
    <Text style={[styles.chipText, { color: accent ? t.accent : onPress ? t.accent : t.text2 }]}>{label}</Text>
  </Pressable>;
}

export function Input({ style, small, ...props }: TextInputProps & { small?: boolean }) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return <TextInput {...props} placeholderTextColor={t.muted} selectionColor={t.accent} onFocus={e => { setFocused(true); props.onFocus?.(e); }} onBlur={e => { setFocused(false); props.onBlur?.(e); }}
    style={[styles.input, small && styles.inputSmall, { backgroundColor: t.surface2, color: t.text, borderColor: focused ? t.accent : "transparent" }, style]} />;
}

export const Kpi = memo(function Kpi({ label, value, center, valueSize }: { label: string; value: string; center?: boolean; valueSize?: number }) {
  const t = useTheme();
  return <View style={[styles.kpi, center && { alignItems: "center", flex: 1 }]}>
    <Text style={[styles.kpiLabel, { color: t.readableMuted }, center && { fontSize: 12 }]}>{label}</Text>
    <Text style={[styles.kpiValue, { color: t.text, fontSize: valueSize ?? 22 }]} numberOfLines={1}>{value}</Text>
  </View>;
});

export function Muted({ children, style, size = 14, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; size?: number; numberOfLines?: number }) {
  const t = useTheme();
  return <Text numberOfLines={numberOfLines} style={[{ color: t.readableMuted, fontSize: size, fontWeight: "500", lineHeight: size * 1.45 }, style]}>{children}</Text>;
}
export function Body({ children, style, size = 14, weight = "500", color, numberOfLines, selectable }: { children: ReactNode; style?: StyleProp<TextStyle>; size?: number; weight?: TextStyle["fontWeight"]; color?: string; numberOfLines?: number; selectable?: boolean }) {
  const t = useTheme();
  return <Text selectable={selectable} numberOfLines={numberOfLines} style={[{ color: color ?? t.text, fontSize: size, fontWeight: weight, lineHeight: size * 1.45 }, style]}>{children}</Text>;
}
export function H1({ children, size = 22, style }: { children: ReactNode; size?: number; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return <Text style={[{ color: t.text, fontSize: size, fontWeight: "700", lineHeight: size * 1.25 }, style]}>{children}</Text>;
}
/** `.card h2` and `.practice-caption`: small uppercase captions. */
export function Caption({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return <Text style={[styles.caption, { color: t.readableMuted }, style]}>{children}</Text>;
}
export function FormError({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }, style]}><Text style={{ color: t.danger, fontSize: 13, fontWeight: "500", flexShrink: 1 }}>{children}</Text></View>;
}
export function Empty({ children, icon, style }: { children: ReactNode; icon?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[styles.empty, style]}>{icon}{typeof children === "string" ? <Text style={{ color: t.readableMuted, fontSize: 14, fontWeight: "500", textAlign: "center" }}>{children}</Text> : children}</View>;
}
export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ height: StyleSheet.hairlineWidth * 2, backgroundColor: t.line }, style]} />;
}
export function Avatar({ username, large, small, active }: { username: string; large?: boolean; small?: boolean; active?: boolean }) {
  const t = useTheme();
  const size = large ? 60 : small ? 20 : 36;
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: active ? t.accent : t.accentSoft, alignItems: "center", justifyContent: "center" }}>
    <Text style={{ color: active ? "#fff" : t.accent, fontSize: large ? 20 : small ? 8 : 12, fontWeight: "700" }}>{username.trim().slice(0, 2).toUpperCase()}</Text>
  </View>;
}
export const mono = (t: Theme, size: number, weight: TextStyle["fontWeight"] = "500"): TextStyle => ({ fontFamily: FONT.mono, fontSize: size, fontWeight: weight, color: t.text, fontVariant: ["tabular-nums"] });

export const styles = StyleSheet.create({
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, minHeight: 40, paddingHorizontal: 16, borderRadius: 12 },
  btnSmall: { minHeight: 34, paddingHorizontal: 14 },
  btnIcon: { width: 38, minHeight: 38, paddingHorizontal: 0, borderRadius: 10 },
  btnText: { fontSize: 14, fontWeight: "600" },
  btnTextSmall: { fontSize: 13 },
  miniBtn: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 30, paddingHorizontal: 10, borderRadius: 8 },
  miniText: { fontSize: 12, fontWeight: "600" },
  segmented: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  segment: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: 14, borderRadius: 10 },
  segmentSmall: { minHeight: 32, paddingHorizontal: 12 },
  segmentText: { fontSize: 14, fontWeight: "600" },
  segmentTextSmall: { fontSize: 13 },
  count: { fontSize: 12, fontFamily: FONT.mono, fontWeight: "500" },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignSelf: "flex-start" },
  chipText: { fontSize: 12, fontWeight: "600" },
  input: { minHeight: 40, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, fontSize: 16, fontWeight: "500", borderWidth: 1.5 },
  inputSmall: { minHeight: 36, fontSize: 13, paddingVertical: 6 },
  kpi: { minWidth: 0 },
  kpiLabel: { fontSize: 13, fontWeight: "600" },
  kpiValue: { marginTop: 2, fontFamily: FONT.mono, fontWeight: "600", fontVariant: ["tabular-nums"], lineHeight: 26 },
  caption: { fontSize: 11, fontWeight: "700", letterSpacing: 1.3, textTransform: "uppercase" },
  empty: { alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 28, paddingHorizontal: 12 },
});
